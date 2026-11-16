// Sway notification sender (Supabase Edge Function).
// - A signed-in asker calls it after asking, nudging, locking in a plan, handing over a
//   tiebreak or sharing what happened next.
// - A once-a-minute database timer calls it with {kind:"tick"} to announce verdicts and
//   questions that are about to close.
// It uses no libraries: Web Push encryption (RFC 8291) and VAPID (RFC 8292) on WebCrypto.

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON = Deno.env.get("CRON_SECRET") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "";
const VAPID = {
  publicKey: Deno.env.get("VAPID_PUBLIC") ?? "",
  privateJwk: JSON.parse(Deno.env.get("VAPID_PRIVATE_JWK") ?? "{}"),
  subject: Deno.env.get("VAPID_SUBJECT") ?? SITE,
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- Web Push ----------
const te = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const cat = (...a: Uint8Array[]) => {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) { out.set(x, o); o += x.length; }
  return out;
};
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
async function encryptPush(p256dh: string, auth: string, plaintext: string) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));
  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, cat(te.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(te.encode(plaintext), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPublic.length]), asPublic, ct);
}
async function vapidHeader(endpoint: string) {
  const key = await crypto.subtle.importKey("jwk", VAPID.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID.subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(head + "." + claims)));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${VAPID.publicKey}`;
}
type Sub = { endpoint: string; p256dh: string; auth: string; user_id: string };
async function sendPush(sub: Sub, payload: unknown) {
  const res = await fetch(sub.endpoint, {
    method: "POST",
    body: await encryptPush(sub.p256dh, sub.auth, JSON.stringify(payload)),
    headers: {
      "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "high",
      Authorization: await vapidHeader(sub.endpoint),
    },
  });
  return res.status;
}

// ---------- database (service role; this code is the only thing that holds it) ----------
async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=minimal", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`db ${path.split("?")[0]} ${res.status} ${(await res.text()).slice(0, 200)}`);
  return init.method && init.method !== "GET" ? null : await res.json();
}
const POLL_COLS = "id,q,author,hide_asker,type,closes_at,created_at,notified,plan,tb_user";
type Poll = { id: string; q: string; author: string; hide_asker: boolean; type: string; closes_at: string; created_at: string; notified: Record<string, boolean>; plan: { when?: string } | null; tb_user: string | null };

async function audience(poll: Poll) {
  const pcs = await db(`poll_circles?poll_id=eq.${poll.id}&select=circle_id,circles(name)`);
  const ids = pcs.map((x: { circle_id: string }) => x.circle_id);
  const members = ids.length ? await db(`members?circle_id=in.(${ids.join(",")})&select=user_id`) : [];
  const users = [...new Set(members.map((m: { user_id: string }) => m.user_id))] as string[];
  const prof = poll.hide_asker ? [] : await db(`profiles?id=eq.${poll.author}&select=name`);
  return {
    users,
    circle: pcs[0]?.circles?.name ?? "your circle",
    asker: poll.hide_asker ? "Someone" : String(prof[0]?.name ?? "A friend").split(" ")[0],
  };
}
async function mark(poll: Poll, flag: string) {
  await db(`polls?id=eq.${poll.id}`, { method: "PATCH", body: JSON.stringify({ notified: { ...(poll.notified ?? {}), [flag]: true } }) });
  poll.notified = { ...(poll.notified ?? {}), [flag]: true };
}
async function push(kind: string, users: string[], poll: Poll, title: string, body: string) {
  if (!users.length) return { sent: 0, statuses: [] as number[] };
  const subs: Sub[] = await db(`push_subs?user_id=in.(${users.join(",")})&select=endpoint,p256dh,auth,user_id`);
  const statuses: number[] = [];
  for (const s of subs) {
    let status = 0;
    try { status = await sendPush(s, { title, body, url: `${SITE}?q=${poll.id}`, tag: poll.id }); } catch (_) { status = -1; }
    statuses.push(status);
    // The push service says this device unsubscribed: forget it.
    if (status === 404 || status === 410) await db(`push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" });
    await db("push_log", { method: "POST", body: JSON.stringify({ kind, host: new URL(s.endpoint).host, status }) });
  }
  return { sent: statuses.filter((x) => x >= 200 && x < 300).length, statuses };
}

// ---------- something the asker just did ----------
async function event(uid: string, b: { kind?: string; poll_id?: string; to?: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(b.poll_id ?? "")) return { error: "bad poll" };
  const poll: Poll | undefined = (await db(`polls?id=eq.${b.poll_id}&select=${POLL_COLS}`))[0];
  if (!poll || poll.author !== uid) return { error: "forbidden" };
  const a = await audience(poll);
  const others = a.users.filter((u) => u !== uid);
  const one = b.to && others.includes(b.to) ? [b.to] : [];
  switch (b.kind) {
    case "asked":
      if (poll.notified?.asked) return { skipped: true };
      await mark(poll, "asked");
      return push("asked", others, poll, `${a.asker} asked ${a.circle}`, poll.q);
    case "nudge":
      if (poll.hide_asker) return { error: "forbidden" };
      return push("nudge", one, poll, `${a.asker} is waiting on you`, poll.q);
    case "tiebreak":
      if (!b.to || b.to !== poll.tb_user) return { error: "forbidden" };
      return push("tiebreak", one, poll, `${a.asker} gave you the deciding vote`, poll.q);
    case "plan":
      if (!poll.plan?.when) return { error: "no plan" };
      return push("plan", others, poll, `Plan locked in: ${poll.plan.when}`, `${poll.q} · are you in?`);
    case "outcome":
      return push("outcome", others, poll, `${a.asker} shared what happened next`, poll.q);
  }
  return { error: "unknown kind" };
}

// ---------- once a minute: verdicts and last calls ----------
async function tick() {
  const now = Date.now(), iso = (ms: number) => new Date(ms).toISOString();
  const out = { verdicts: 0, soon: 0 };
  const closed: Poll[] = await db(`polls?closes_at=lte.${iso(now)}&closes_at=gte.${iso(now - 3600e3)}&notified->>verdict=is.null&select=${POLL_COLS}&limit=50`);
  for (const p of closed) {
    await mark(p, "verdict");
    const a = await audience(p);
    await push("verdict", a.users, p, "The verdict is in", p.q);
    out.verdicts++;
  }
  // Last call: closing within 15 minutes, and only for questions that ran longer than half an hour.
  const closing: Poll[] = await db(`polls?closes_at=gt.${iso(now)}&closes_at=lte.${iso(now + 15 * 60e3)}&created_at=lte.${iso(now - 30 * 60e3)}&notified->>soon=is.null&select=${POLL_COLS}&limit=50`);
  for (const p of closing) {
    await mark(p, "soon");
    const a = await audience(p);
    const done = p.type === "open"
      ? (await db(`comments?poll_id=eq.${p.id}&select=user_id`)).map((x: { user_id: string }) => x.user_id)
      : (await db(`votes?poll_id=eq.${p.id}&select=user_id`)).map((x: { user_id: string }) => x.user_id);
    const waiting = a.users.filter((u) => u !== p.author && !done.includes(u));
    await push("soon", waiting, p, `Closing soon · ${a.asker} is waiting on you`, p.q);
    out.soon++;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.kind === "tick") {
      if (!CRON || req.headers.get("x-sway-cron") !== CRON) return json({ error: "forbidden" }, 403);
      return json(await tick());
    }
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
    const who = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${jwt}` } });
    if (!who.ok) return json({ error: "unauthorized" }, 401);
    const user = await who.json();
    return json(await event(user.id, body));
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
