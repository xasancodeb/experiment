// Sway notification sender (Supabase Edge Function).
// - A voter's browser calls it with {kind:"voted"} so the asker hears that a vote came in
//   (who voted and how many are in, never what anyone picked).
//   The asker hears the first vote at once, then at most a roundup every 30 minutes, then
//   "Everyone has voted". An early close announces the verdict. Verdicts go to the asker and
//   the people who voted, not to those who ignored the question.
// - A signed-in asker calls it after asking, ending a question early,, nudging, locking in a plan, handing over a
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
const POLL_COLS = "id,q,author,hide_asker,type,closes_at,created_at,notified,plan,tb_user,early";
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const later = (p: Promise<unknown>) => { try { if (typeof EdgeRuntime !== "undefined") return EdgeRuntime.waitUntil(p); } catch (_) { /* fall through */ } return p; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Poll = { id: string; q: string; author: string; hide_asker: boolean; type: string; closes_at: string; created_at: string; notified: Record<string, unknown>; plan: { when?: string } | null; tb_user: string | null; early?: boolean };

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
// Whose action this is, for people who chose to hear only from certain friends. Undefined when
// the asker is hidden: filtering by a hidden person would reveal who they are.
const by = (p: Poll, u?: string) => (p.hide_asker ? undefined : (u ?? p.author));
// Each person's choices: whose activity they hear about, and which circles they muted.
// Your own question always reaches you.
async function wanted(users: string[], poll: Poll, from?: string) {
  if (!users.length) return users;
  const prefs: { user_id: string; only_from: string[] | null; muted_circles: string[] | null }[] =
    await db(`notify_prefs?user_id=in.(${users.join(",")})&select=user_id,only_from,muted_circles`).catch(() => []);
  const only = new Map(prefs.filter((p) => p.only_from).map((p) => [p.user_id, p.only_from!]));
  const muted = new Map(prefs.filter((p) => p.muted_circles?.length).map((p) => [p.user_id, p.muted_circles!]));
  // Which of this question's circles each muting person belongs to: muted only if all of them are muted.
  let inCircles = new Map<string, string[]>();
  if (muted.size) {
    const pcs: { circle_id: string }[] = await db(`poll_circles?poll_id=eq.${poll.id}&select=circle_id`);
    const ids = pcs.map((x) => x.circle_id);
    const ms: { circle_id: string; user_id: string }[] = ids.length
      ? await db(`members?circle_id=in.(${ids.join(",")})&user_id=in.(${[...muted.keys()].join(",")})&select=circle_id,user_id`) : [];
    for (const m of ms) inCircles.set(m.user_id, [...(inCircles.get(m.user_id) ?? []), m.circle_id]);
  }
  return users.filter((u) => {
    if (u === poll.author) return true;
    if (from && only.has(u) && u !== from && !only.get(u)!.includes(from)) return false;
    const mine = inCircles.get(u), mu = muted.get(u);
    if (mu && mine && mine.length && mine.every((c) => mu.includes(c))) return false;
    return true;
  });
}
async function push(kind: string, users: string[], poll: Poll, title: string, body: string, from?: string, direct = false) {
  if (!direct) users = await wanted(users, poll, from);   // nudges and tiebreaks are personal: always delivered
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

// ---------- a friend just voted: tell the asker, softly ----------
// The first vote is announced at once. After that, at most one roundup every 30 minutes
// (sent by the timer if no new vote triggers it), then "Everyone has voted". When the
// question ends itself once everyone has voted, the verdict 30 seconds later is the only ping.
const ROUNDUP = 30 * 60e3;
async function doneBy(poll: Poll) {
  const rows: { user_id: string }[] = poll.type === "open"
    ? await db(`comments?poll_id=eq.${poll.id}&select=user_id`)
    : await db(`votes?poll_id=eq.${poll.id}&select=user_id`);
  return [...new Set(rows.map((r) => r.user_id))].filter((u) => u !== poll.author);
}
const votesWord = (open: boolean, k: number) => open ? (k === 1 ? "reply" : "replies") : (k === 1 ? "vote" : "votes");
async function voted(uid: string, poll: Poll) {
  if (poll.author === uid) return { skipped: "own question" };
  if (Date.parse(poll.closes_at) <= Date.now()) return { skipped: "closed" };
  const open = poll.type === "open";
  const done = await doneBy(poll);
  if (!done.includes(uid)) return { error: "forbidden" };           // only someone who really voted can trigger it
  const a = await audience(poll);
  const total = a.users.filter((u) => u !== poll.author).length;
  const n = done.length, last = Number(poll.notified?.vote_n ?? 0);
  if (n <= last) return { skipped: "nothing new" };                  // changing a vote, or a repeat call, sends nothing
  const fresh = n - last, all = n >= total, first = last === 0;
  const at = Date.parse(String(poll.notified?.vote_at ?? "")) || 0;
  if (!all && !first && Date.now() - at < ROUNDUP) return { held: "roundup later" };
  let who = "Someone";
  if (!poll.hide_asker) { const pr = await db(`profiles?id=eq.${uid}&select=name`); who = String(pr[0]?.name ?? "A friend").split(" ")[0]; }
  const verb = open ? "replied" : "voted";
  const title = all ? `Everyone has ${verb}`
    : first ? `${who} ${verb} · first ${votesWord(open, 1)} in`
    : fresh === 1 ? `${who} ${verb}` : `${fresh} more ${votesWord(open, fresh)}`;
  const notified = { ...(poll.notified ?? {}), vote_n: n, vote_at: new Date().toISOString() };
  await db(`polls?id=eq.${poll.id}`, { method: "PATCH", body: JSON.stringify({ notified }) });
  poll.notified = notified;
  if (all && poll.early && !open) { later(verdictWhenClosed(poll.id)); return { verdict: "scheduled" }; }
  const asker = await push("voted", [poll.author], poll, title, `${poll.q} · ${n} of ${total} in`, all ? undefined : by(poll, uid));
  return { asker };
}

// ---------- the verdict, sent the moment a question closes ----------
async function announceVerdict(poll: Poll) {
  if (poll.notified?.verdict || Date.parse(poll.closes_at) > Date.now()) return { skipped: true };
  await mark(poll, "verdict");
  return push("verdict", [poll.author, ...(await doneBy(poll))], poll, "The verdict is in", poll.q, by(poll));
}
async function verdictWhenClosed(id: string) {
  for (let i = 0; i < 3; i++) {
    await sleep(i === 0 ? 3000 : 1500);
    const p: Poll | undefined = (await db(`polls?id=eq.${id}&select=${POLL_COLS}`))[0];
    if (!p) return;
    const wait = Date.parse(p.closes_at) - Date.now();
    if (wait > 90e3) return;                     // not closing soon after all; the timer will handle it
    if (wait > 0) await sleep(wait + 1500);
    const q: Poll | undefined = (await db(`polls?id=eq.${id}&select=${POLL_COLS}`))[0];
    if (q && Date.parse(q.closes_at) <= Date.now()) { await announceVerdict(q); return; }
  }
}

// ---------- something the asker just did ----------
async function event(uid: string, b: { kind?: string; poll_id?: string; to?: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(b.poll_id ?? "")) return { error: "bad poll" };
  const poll: Poll | undefined = (await db(`polls?id=eq.${b.poll_id}&select=${POLL_COLS}`))[0];
  if (poll && b.kind === "voted") return voted(uid, poll);
  if (!poll || poll.author !== uid) return { error: "forbidden" };
  const a = await audience(poll);
  const others = a.users.filter((u) => u !== uid);
  const one = b.to && others.includes(b.to) ? [b.to] : [];
  switch (b.kind) {
    case "asked":
      if (poll.notified?.asked) return { skipped: true };
      await mark(poll, "asked");
      return push("asked", others, poll, `${a.asker} asked ${a.circle}`, poll.q, by(poll));
    case "nudge":
      if (poll.hide_asker) return { error: "forbidden" };
      return push("nudge", one, poll, `${a.asker} is waiting on you`, poll.q, undefined, true);
    case "tiebreak":
      if (!b.to || b.to !== poll.tb_user) return { error: "forbidden" };
      return push("tiebreak", one, poll, `${a.asker} gave you the deciding vote`, poll.q, undefined, true);
    case "plan":
      if (!poll.plan?.when) return { error: "no plan" };
      return push("plan", others, poll, `Plan locked in: ${poll.plan.when}`, `${poll.q} · are you in?`, by(poll));
    case "closed":                               // the asker ended it early
      return announceVerdict(poll);
    case "outcome":
      return push("outcome", others, poll, `${a.asker} shared what happened next`, poll.q, by(poll));
  }
  return { error: "unknown kind" };
}

// ---------- once a minute: verdicts and last calls ----------
async function tick() {
  const now = Date.now(), iso = (ms: number) => new Date(ms).toISOString();
  const out = { verdicts: 0, soon: 0, roundups: 0 };
  const closed: Poll[] = await db(`polls?closes_at=lte.${iso(now)}&closes_at=gte.${iso(now - 3600e3)}&notified->>verdict=is.null&select=${POLL_COLS}&limit=50`);
  for (const p of closed) {
    await announceVerdict(p);   // the asker and the people who voted; not those who ignored it
    out.verdicts++;
  }
  // Vote roundups for askers: new votes that came in since the last ping, at most every 30 minutes.
  const pend: Poll[] = await db(`polls?closes_at=gt.${iso(now)}&notified->>vote_at=lt.${iso(now - ROUNDUP)}&select=${POLL_COLS}&limit=50`);
  for (const p of pend) {
    const done = await doneBy(p), last = Number(p.notified?.vote_n ?? 0);
    if (done.length <= last) continue;
    const a = await audience(p), total = a.users.filter((u) => u !== p.author).length, all = done.length >= total, open = p.type === "open";
    if (all && p.early && !open) continue;
    const notified = { ...(p.notified ?? {}), vote_n: done.length, vote_at: new Date().toISOString() };
    await db(`polls?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify({ notified }) });
    const k = done.length - last;
    await push("voted", [p.author], p, all ? `Everyone has ${open ? "replied" : "voted"}` : `${k} more ${votesWord(open, k)}`, `${p.q} · ${done.length} of ${total} in`);
    out.roundups++;
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
    await push("soon", waiting, p, `Closing soon · ${a.asker} is waiting on you`, p.q, by(p));
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
