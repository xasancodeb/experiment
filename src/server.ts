import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import {
  checkPassword, createSession, data, destroySession, hashPassword, isFollowing, listById, newId, notify, postById,
  save, sessionUser, userByEmail, userByHandle, userById, type Post, type User,
} from "./store.js";
import {
  LIMITS, TOP_PICK_MIN_HELPFUL, isCredibleReporter, isEstablishedVoter, nextLevelSteps, postsToday, rankScore,
  signals, topScore, trustLevel, trustStats,
} from "./trust.js";
import { checkLink } from "./links.js";
import { moderate } from "./moderation.js";
import { cashOut, recordClick, recordConversion, summary } from "./earnings.js";
import { EARNINGS_ON, FOUNDING_LIMIT, INVITES_PER_MEMBER, INVITE_ONLY, PUBLIC_URL } from "./config.js";
import * as views from "./views.js";
import { seedIfEmpty } from "./seed.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
    sessionToken?: string;
  }
}

const DAY = 24 * 3600 * 1000;
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: true, limit: "50kb" }));
app.use(express.static("public", { maxAge: "1h" }));

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

// Reject cross-site form posts (CSRF). Same-site cookies cover most cases; this covers the rest.
app.use((req, res, next) => {
  if (req.method !== "POST" || req.path.startsWith("/api/")) return next();
  const origin = req.get("origin");
  if (origin && origin !== "null") {
    let host = "";
    try {
      host = new URL(origin).host;
    } catch {
      /* malformed origin is treated as cross-site */
    }
    if (host !== req.get("host")) {
      res.status(403).send("Cross-site request blocked");
      return;
    }
  }
  next();
});

function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* ignore malformed cookie */
      }
    }
  }
  return out;
}

const secure = process.env.NODE_ENV === "production";
const sessionCookie = { httpOnly: true, sameSite: "lax" as const, secure, maxAge: 30 * DAY };

app.use((req, _res, next) => {
  const token = cookies(req).sid;
  req.sessionToken = token;
  req.user = sessionUser(token);
  next();
});

// Simple in-memory rate limit for password guessing and signup floods.
const attempts = new Map<string, number[]>();
function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 10000) attempts.clear();
  return recent.length > max;
}

function setFlash(res: Response, flash: views.Flash) {
  res.cookie("flash", JSON.stringify(flash), { httpOnly: true, sameSite: "lax", secure, maxAge: 60000 });
}

function takeFlash(req: Request, res: Response): views.Flash | undefined {
  const raw = cookies(req).flash;
  if (!raw) return undefined;
  res.clearCookie("flash");
  try {
    return JSON.parse(raw) as views.Flash;
  } catch {
    return undefined;
  }
}

function render(req: Request, res: Response, title: string, body: string, opts: { status?: number; meta?: views.Meta } = {}) {
  const unread = req.user ? data.notices.filter((n) => n.userId === req.user!.id && !n.read).length : 0;
  res.status(opts.status ?? 200).type("html").send(
    views.layout({ title, user: req.user, body, flash: takeFlash(req, res), unread, meta: opts.meta }),
  );
}

const notFound = (req: Request, res: Response) => render(req, res, "Not found", views.notFound(), { status: 404 });

/** Only allow redirects back to our own pages. */
const safeBack = (value: unknown, fallback: string) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;

function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.redirect("/login");
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return notFound(req, res);
  next();
}

function requireEarnings(req: Request, res: Response, next: NextFunction) {
  if (!EARNINGS_ON) return notFound(req, res);
  next();
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isLiveAuthor = (p: Post) => userById(p.authorId)?.banned === false;

function cardData(post: Post, viewer?: User, rising = false): views.CardData | undefined {
  const author = userById(post.authorId);
  if (!author) return undefined;
  const tried = viewer && data.tried.find((t) => t.postId === post.id && t.userId === viewer.id);
  return {
    post,
    author,
    authorLevel: trustLevel(author),
    signals: signals(post.id, author.id),
    viewerHelpful: Boolean(viewer && data.helpful.some((h) => h.postId === post.id && h.userId === viewer.id)),
    viewerTried: tried ? tried.agree : undefined,
    viewerLists: viewer ? data.lists.filter((l) => l.ownerId === viewer.id) : undefined,
    rising,
  };
}

function cards(posts: Post[], viewer: User | undefined, back: string, risingIds = new Set<string>()): string[] {
  return posts.flatMap((p) => {
    const d = cardData(p, viewer, risingIds.has(p.id));
    return d ? [views.postCard(d, viewer, back)] : [];
  });
}

const canSee = (post: Post, viewer?: User) =>
  post.status === "live" || viewer?.id === post.authorId || viewer?.role === "admin";

function suggestions(me: User | undefined, limit = 6): views.PersonSuggestion[] {
  return data.users
    .filter((u) => u.id !== me?.id && !u.banned && u.role !== "admin" && !(me && isFollowing(me.id, u.id)))
    .map((u) => ({ user: u, level: trustLevel(u), stats: trustStats(u) }))
    .filter((s) => s.level >= 1)
    .sort((a, b) => {
      // People who share your interests first, then the most helpful.
      const shared = (u: User) => (me ? u.interests.filter((i) => me.interests.includes(i)).length : 0);
      return shared(b.user) - shared(a.user) || b.stats.helpfulFromOthers - a.stats.helpfulFromOthers;
    })
    .slice(0, limit)
    .map((s) => ({ user: s.user, level: s.level, posts: s.stats.livePosts }));
}

/**
 * Discover: established members ranked by helpfulness and freshness, with
 * every 4th slot reserved for a "Rising" post from a newer Member so the same
 * top people don't take all the attention.
 */
function discover(category?: string): { posts: Post[]; rising: Set<string> } {
  const now = Date.now();
  const eligible = data.posts.filter(
    (p) => p.status === "live" && isLiveAuthor(p) && (!category || p.category === category) &&
      LIMITS[trustLevel(userById(p.authorId)!)].inDiscover,
  );
  const scored = eligible
    .map((p) => ({ p, score: rankScore(p, signals(p.id, p.authorId), now) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
  const risingPool = scored.filter((p) => trustLevel(userById(p.authorId)!) === 1);
  const main = scored.filter((p) => !risingPool.includes(p));
  const out: Post[] = [];
  const rising = new Set<string>();
  while (main.length || risingPool.length) {
    if ((out.length + 1) % 4 === 0 && risingPool.length) {
      const p = risingPool.shift()!;
      rising.add(p.id);
      out.push(p);
    } else {
      out.push((main.length ? main : risingPool).shift()!);
    }
  }
  return { posts: out, rising };
}

/** Top picks: all-time most helpful. Keeps great reviews findable for months. */
function topPicks(category?: string): Post[] {
  return data.posts
    .filter((p) => p.status === "live" && isLiveAuthor(p) && (!category || p.category === category))
    .map((p) => ({ p, s: signals(p.id, p.authorId) }))
    .filter((x) => x.s.helpful >= TOP_PICK_MIN_HELPFUL)
    .sort((a, b) => topScore(b.s) - topScore(a.s))
    .map((x) => x.p);
}

// ---------- public pages ----------

app.get("/", (req, res) =>
  req.user ? res.redirect("/feed") : render(req, res, "Honest recommendations", views.landing(), { meta: { path: "/" } }));
app.get("/trust", (req, res) => render(req, res, "How we keep it honest", views.trustPage(), { meta: { path: "/trust" } }));
app.get("/terms", (req, res) => render(req, res, "Terms", views.termsPage(), { meta: { path: "/terms" } }));
app.get("/privacy", (req, res) => render(req, res, "Privacy", views.privacyPage(), { meta: { path: "/privacy" } }));

app.get("/signup", (req, res) => render(req, res, "Join", views.authForm("signup", { invite: str(req.query.invite) })));
app.post("/signup", (req, res) => {
  const v = {
    name: str(req.body.name), handle: str(req.body.handle), email: str(req.body.email).toLowerCase(), invite: str(req.body.invite).toUpperCase(),
  };
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const fail = (msg: string, status = 400) => render(req, res, "Join", views.authForm("signup", v, msg), { status });
  if (rateLimited(`signup:${req.ip}`, 5, 3600000)) return fail("Too many sign-ups from this connection. Please try again later.", 429);
  const invite = v.invite ? data.invites.find((i) => i.code === v.invite && !i.usedBy) : undefined;
  if (INVITE_ONLY && !invite) return fail("That invite code isn't valid or was already used. Ask a member for a new one.");
  if (!v.name || v.name.length > 50) return fail("Please enter your name.");
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(v.handle)) return fail("Usernames are 3–20 letters, numbers or underscores.");
  if (userByHandle(v.handle)) return fail("That username is taken. Try another one.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return fail("Please enter a valid email.");
  if (userByEmail(v.email)) return fail("There's already an account with that email. Try logging in.");
  if (password.length < 8) return fail("Passwords need at least 8 characters.");
  if (!req.body.pledge) return fail("Please take the Taste pledge to join.");
  if (!req.body.adult) return fail("You need to be 18 or older to join Taste.");
  if (!req.body.terms) return fail("Please agree to the Terms and Privacy Policy.");
  const now = new Date().toISOString();
  const members = data.users.filter((u) => u.role !== "admin").length;
  const user: User = {
    id: newId(), handle: v.handle, name: v.name, email: v.email, passwordHash: hashPassword(password), bio: "",
    interests: [], role: "member", phoneVerified: false, idVerified: false, banned: false, createdAt: now,
    pledgeAcceptedAt: now, foundingMember: members < FOUNDING_LIMIT,
  };
  data.users.push(user);
  if (invite) {
    invite.usedBy = user.id;
    user.invitedBy = invite.ownerId;
    // Start with a friend in your feed: you follow the person who invited you.
    data.follows.push({ followerId: user.id, followeeId: invite.ownerId });
    notify(invite.ownerId, "follow", `${user.name} (@${user.handle}) joined with your invite and is following you.`, `/u/${user.handle}`);
  }
  save();
  res.cookie("sid", createSession(user.id), sessionCookie);
  res.redirect("/welcome");
});

app.get("/login", (req, res) => render(req, res, "Log in", views.authForm("login")));
app.post("/login", (req, res) => {
  const email = str(req.body.email).toLowerCase();
  const fail = (msg: string, status: number) => render(req, res, "Log in", views.authForm("login", { email }, msg), { status });
  if (rateLimited(`login:${req.ip}`, 10, 15 * 60000) || rateLimited(`login:${email}`, 10, 15 * 60000)) {
    return fail("Too many attempts. Please wait 15 minutes and try again.", 429);
  }
  const user = userByEmail(email);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!user || !checkPassword(password, user.passwordHash)) return fail("That email and password don't match.", 400);
  if (user.banned) return fail("This account was closed for breaking the guidelines.", 403);
  res.cookie("sid", createSession(user.id), sessionCookie);
  res.redirect("/feed");
});

app.post("/logout", (req, res) => {
  destroySession(req.sessionToken);
  res.clearCookie("sid");
  res.redirect("/");
});

// ---------- onboarding ----------

app.get("/welcome", requireUser, (req, res) => {
  const me = req.user!;
  const following = new Set(data.follows.filter((f) => f.followerId === me.id).map((f) => f.followeeId));
  render(req, res, "Welcome", views.welcome(me, suggestions(me), following));
});

app.post("/welcome/interests", requireUser, (req, res) => {
  const picked = ([] as unknown[]).concat(req.body.interests ?? []);
  req.user!.interests = picked.filter((x): x is string => typeof x === "string" && views.CATEGORIES.includes(x));
  save();
  setFlash(res, { kind: "ok", text: "Saved your interests." });
  res.redirect("/welcome");
});

// Demo stand-ins. Production: SMS code (e.g. Twilio Verify) and Stripe Connect identity checks.
app.post("/verify-phone", requireUser, (req, res) => {
  req.user!.phoneVerified = true;
  save();
  setFlash(res, { kind: "ok", text: "Phone verified. You can now post!" });
  res.redirect("/welcome");
});

app.post("/verify-identity", requireUser, requireEarnings, (req, res) => {
  req.user!.idVerified = true;
  save();
  setFlash(res, { kind: "ok", text: "Identity verified." });
  res.redirect("/earnings");
});

app.get("/invite", requireUser, (req, res) => {
  const me = req.user!;
  let mine = data.invites.filter((i) => i.ownerId === me.id);
  if (mine.length < INVITES_PER_MEMBER) {
    for (let i = mine.length; i < INVITES_PER_MEMBER; i++) {
      data.invites.push({ code: crypto.randomBytes(5).toString("hex").toUpperCase(), ownerId: me.id });
    }
    save();
    mine = data.invites.filter((i) => i.ownerId === me.id);
  }
  render(req, res, "Invite friends", views.invitePage(mine.map((i) => ({ code: i.code, usedBy: i.usedBy ? userById(i.usedBy) : undefined }))));
});

// ---------- feed, search & posts ----------

app.get("/feed", (req, res) => {
  const me = req.user;
  let tab: views.FeedTab = req.query.tab === "discover" ? "discover" : req.query.tab === "top" ? "top" : "following";
  if (!me && tab === "following") tab = "discover";
  const category = views.CATEGORIES.includes(str(req.query.category)) ? str(req.query.category) : undefined;
  const followed = new Set(me ? data.follows.filter((f) => f.followerId === me.id).map((f) => f.followeeId) : []);
  const back = `/feed?tab=${tab}${category ? `&category=${encodeURIComponent(category)}` : ""}`;

  let posts: Post[];
  let rising = new Set<string>();
  if (tab === "following") {
    posts = data.posts
      .filter((p) => (!category || p.category === category) && isLiveAuthor(p))
      .filter((p) => (followed.has(p.authorId) && p.status === "live") || (p.authorId === me!.id && p.status !== "removed"))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } else if (tab === "discover") {
    ({ posts, rising } = discover(category));
  } else {
    posts = topPicks(category);
  }
  const people = me && followed.size === 0 ? views.peopleList(suggestions(me), followed, back, me) : undefined;
  const title = tab === "top" ? `Top picks${category ? `: ${category}` : ""}` : "Feed";
  render(req, res, title, views.feed({
    user: me, tab, category, cards: cards(posts.slice(0, 50), me, back, rising), followingCount: followed.size, suggestions: people,
  }), { meta: tab === "top" ? { path: back, description: `The most helpful honest reviews${category ? ` in ${category}` : ""}, chosen by real people.` } : {} });
});

app.get("/search", (req, res) => {
  const q = str(req.query.q).slice(0, 100);
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  let results: Post[] = [];
  let people = "";
  if (terms.length) {
    results = data.posts
      .filter((p) => p.status === "live" && isLiveAuthor(p))
      .map((p) => {
        const hay = `${p.title} ${p.body} ${p.category} ${p.merchant ?? ""}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return undefined;
        const titleHits = terms.filter((t) => p.title.toLowerCase().includes(t)).length;
        return { p, score: titleHits * 5 + topScore(signals(p.id, p.authorId)) };
      })
      .filter((x): x is { p: Post; score: number } => Boolean(x))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);
    const matches = data.users.filter((u) => !u.banned && u.role !== "admin" &&
      terms.every((t) => `${u.handle} ${u.name}`.toLowerCase().includes(t)));
    if (matches.length) {
      const followed = new Set(req.user ? data.follows.filter((f) => f.followerId === req.user!.id).map((f) => f.followeeId) : []);
      people = `<div class="card">${views.peopleList(matches.slice(0, 5).map((u) => ({ user: u, level: trustLevel(u), posts: trustStats(u).livePosts })), followed, `/search?q=${encodeURIComponent(q)}`, req.user)}</div>`;
    }
  }
  render(req, res, q ? `${q} reviews` : "Search",
    views.searchPage(q, cards(results.slice(0, 50), req.user, `/search?q=${encodeURIComponent(q)}`), people),
    { meta: { noindex: true } });
});

function newPostPage(req: Request, res: Response, values?: Record<string, string>, problems?: string[]) {
  const me = req.user!;
  const level = trustLevel(me);
  const remainingToday = LIMITS[level].postsPerDay - postsToday(me.id);
  render(req, res, "Recommend", views.newPostForm({ level, remainingToday, values, problems }), { status: problems ? 400 : 200 });
}

app.get("/new", requireUser, (req, res) => {
  if (!req.user!.phoneVerified) {
    setFlash(res, { kind: "warn", text: "Please verify your phone before posting. It keeps Taste free of fake accounts." });
    return res.redirect("/welcome");
  }
  newPostPage(req, res);
});

app.post("/new", requireUser, async (req, res) => {
  const me = req.user!;
  if (!me.phoneVerified) return res.redirect("/welcome");
  const level = trustLevel(me);
  if (postsToday(me.id) >= LIMITS[level].postsPerDay) return newPostPage(req, res);

  const values = {
    title: str(req.body.title).slice(0, 100),
    category: str(req.body.category),
    verdict: str(req.body.verdict),
    body: str(req.body.body).slice(0, 2000),
    price: str(req.body.price).slice(0, 20),
    url: str(req.body.url).slice(0, 500),
    buyAgain: req.body.buyAgain ? "on" : "",
    brandConnection: req.body.brandConnection ? "on" : "",
  };
  const problems: string[] = [];
  if (!views.CATEGORIES.includes(values.category)) problems.push("Pick a category.");
  if (!["love", "fine", "skip"].includes(values.verdict)) problems.push("Pick a verdict.");
  const link = checkLink(values.url);
  if (!link.ok) problems.push(link.problem!);
  if (problems.length) return newPostPage(req, res, values, problems);

  const result = await moderate({ ...values, merchant: link.merchant }, me.id);
  if (result.decision === "reject") return newPostPage(req, res, values, result.reasons);

  const brandConnection = Boolean(values.brandConnection);
  const post: Post = {
    id: newId(),
    authorId: me.id,
    title: values.title,
    category: values.category,
    verdict: values.verdict as Post["verdict"],
    buyAgain: Boolean(values.buyAgain),
    body: values.body,
    price: values.price || undefined,
    url: link.url,
    merchant: link.url ? link.merchant : undefined,
    // People connected to a brand can still post (with a label) but never earn from it.
    paidLink: Boolean(EARNINGS_ON && link.url && link.partner && LIMITS[level].paidLinks && !brandConnection),
    brandConnection,
    status: result.decision === "approve" ? "live" : "held",
    moderation: { source: result.source, reasons: result.reasons },
    createdAt: new Date().toISOString(),
  };
  data.posts.push(post);
  save();
  setFlash(res, post.status === "live"
    ? { kind: "ok", text: "Shared! Thanks for helping people choose well." }
    : { kind: "warn", text: "Thanks! A moderator will take a quick look before it goes live." });
  res.redirect(`/p/${post.id}`);
});

app.get("/p/:id", (req, res) => {
  const post = postById(req.params.id);
  if (!post || !canSee(post, req.user) || !userById(post.authorId) || userById(post.authorId)!.banned) return notFound(req, res);
  const d = cardData(post, req.user)!;
  const verdictWord = { love: "Loves it", fine: "It's fine", skip: "Skip it" }[post.verdict];
  render(req, res, `${post.title}: honest review`, `<section class="narrow">${views.postCard(d, req.user, `/p/${post.id}`)}
    ${req.user ? "" : `<div class="card"><p>Join Taste to follow people whose taste you trust.</p><a class="btn" href="/signup">Join free</a></div>`}</section>`,
  { meta: post.status === "live" ? { path: `/p/${post.id}`, description: `${verdictWord}: ${post.body.slice(0, 150)}` } : { noindex: true } });
});

function livePostFor(req: Request, res: Response): Post | undefined {
  const post = postById(req.params.id as string);
  if (!post || post.status !== "live" || post.authorId === req.user!.id) {
    res.redirect(safeBack(req.body.back, "/feed"));
    return undefined;
  }
  return post;
}

app.post("/p/:id/helpful", requireUser, (req, res) => {
  const post = livePostFor(req, res);
  if (!post) return;
  const me = req.user!;
  const i = data.helpful.findIndex((h) => h.postId === post.id && h.userId === me.id);
  if (i >= 0) data.helpful.splice(i, 1);
  else {
    data.helpful.push({ postId: post.id, userId: me.id, createdAt: new Date().toISOString() });
    notify(post.authorId, "helpful", `${me.name} found your review of "${post.title}" helpful.`, `/p/${post.id}`);
  }
  save();
  res.redirect(safeBack(req.body.back, "/feed"));
});

app.post("/p/:id/tried", requireUser, (req, res) => {
  const post = livePostFor(req, res);
  if (!post) return;
  const me = req.user!;
  const agree = req.body.agree === "yes";
  const existing = data.tried.find((t) => t.postId === post.id && t.userId === me.id);
  if (existing) existing.agree = agree;
  else {
    data.tried.push({ postId: post.id, userId: me.id, agree });
    notify(post.authorId, "tried", `${me.name} tried "${post.title}" too and ${agree ? "agrees" : "disagrees"} with you.`, `/p/${post.id}`);
  }
  save();
  res.redirect(safeBack(req.body.back, "/feed"));
});

/** Posts are hidden for review once this many credible, established members report them. */
const AUTO_HIDE_REPORTS = 3;

app.post("/p/:id/report", requireUser, (req, res) => {
  const post = livePostFor(req, res);
  if (!post) return;
  const me = req.user!;
  const reason = views.REPORT_REASONS.includes(str(req.body.reason)) ? str(req.body.reason) : "Something else";
  if (!data.reports.some((r) => r.postId === post.id && r.reporterId === me.id && r.status === "open")) {
    data.reports.push({ id: newId(), postId: post.id, reporterId: me.id, reason, status: "open", createdAt: new Date().toISOString() });
    const weighty = new Set(data.reports
      .filter((r) => r.postId === post.id && r.status === "open")
      .map((r) => r.reporterId)
      .filter((id) => {
        const u = userById(id);
        return u && trustLevel(u) >= 1 && isEstablishedVoter(id) && isCredibleReporter(id);
      })).size;
    if (weighty >= AUTO_HIDE_REPORTS) {
      post.status = "held";
      post.moderation.reasons.push(`Hidden after ${weighty} reports from members.`);
    }
    save();
  }
  setFlash(res, { kind: "ok", text: "Thanks for reporting. A real person will review it." });
  res.redirect(safeBack(req.body.back, "/feed"));
});

function deletePost(postId: string) {
  data.posts = data.posts.filter((p) => p.id !== postId);
  data.helpful = data.helpful.filter((h) => h.postId !== postId);
  data.tried = data.tried.filter((t) => t.postId !== postId);
  for (const l of data.lists) l.postIds = l.postIds.filter((id) => id !== postId);
  for (const r of data.reports) if (r.postId === postId && r.status === "open") r.status = "dismissed";
}

app.post("/p/:id/delete", requireUser, (req, res) => {
  const post = postById(req.params.id as string);
  if (post && post.authorId === req.user!.id) {
    deletePost(post.id);
    save();
    setFlash(res, { kind: "ok", text: "Recommendation deleted." });
  }
  res.redirect(`/u/${req.user!.handle}`);
});

app.get("/go/:id", (req, res) => {
  const post = postById(req.params.id);
  if (!post || post.status !== "live" || !post.url) return notFound(req, res);
  const clickId = recordClick(post.id, req.user?.id);
  // Production: wrap paid links in the affiliate network's tracking URL with clickId as the sub-ID.
  const target = new URL(post.url);
  if (EARNINGS_ON && post.paidLink && clickId) target.searchParams.set("subid", clickId);
  res.redirect(302, target.toString());
});

// ---------- lists ----------

app.get("/lists/new", requireUser, (req, res) => render(req, res, "New list", views.listForm(str(req.query.post) || undefined)));

app.post("/lists", requireUser, (req, res) => {
  const me = req.user!;
  const title = str(req.body.title).slice(0, 80);
  const description = str(req.body.description).slice(0, 300);
  const postId = str(req.body.postId);
  if (title.length < 2) return render(req, res, "New list", views.listForm(postId, "Give your list a name.", { title, description }), { status: 400 });
  if (data.lists.filter((l) => l.ownerId === me.id).length >= 50) {
    return render(req, res, "New list", views.listForm(postId, "You can have up to 50 lists.", { title, description }), { status: 400 });
  }
  const post = postById(postId);
  const list = {
    id: newId(), ownerId: me.id, title, description,
    postIds: post && post.status === "live" ? [post.id] : [], createdAt: new Date().toISOString(),
  };
  data.lists.push(list);
  save();
  setFlash(res, { kind: "ok", text: "List created." });
  res.redirect(`/l/${list.id}`);
});

app.post("/lists/add", requireUser, (req, res) => {
  const list = listById(str(req.body.listId));
  const post = postById(str(req.body.postId));
  if (list && list.ownerId === req.user!.id && post && post.status === "live" && !list.postIds.includes(post.id)) {
    if (list.postIds.length < 100) list.postIds.push(post.id);
    save();
    setFlash(res, { kind: "ok", text: `Saved to "${list.title}".` });
  }
  res.redirect(safeBack(req.body.back, "/feed"));
});

app.get("/l/:id", (req, res) => {
  const list = listById(req.params.id);
  const owner = list && userById(list.ownerId);
  if (!list || !owner || owner.banned) return notFound(req, res);
  const posts = list.postIds.map(postById).filter((p): p is Post => Boolean(p && p.status === "live" && isLiveAuthor(p)));
  const mine = req.user?.id === owner.id;
  // Keep the remove buttons aligned with what's shown.
  const shown = mine ? { ...list, postIds: posts.map((p) => p.id) } : list;
  render(req, res, list.title, views.listPage(shown, owner, req.user, cards(posts, req.user, `/l/${list.id}`)), {
    meta: posts.length ? { path: `/l/${list.id}`, description: list.description || `${list.title}: ${posts.length} honest picks by @${owner.handle}` } : { noindex: true },
  });
});

app.post("/l/:id/remove", requireUser, (req, res) => {
  const list = listById(req.params.id as string);
  if (list && list.ownerId === req.user!.id) {
    list.postIds = list.postIds.filter((id) => id !== str(req.body.postId));
    save();
  }
  res.redirect(`/l/${req.params.id}`);
});

app.post("/l/:id/delete", requireUser, (req, res) => {
  const list = listById(req.params.id as string);
  if (list && list.ownerId === req.user!.id) {
    data.lists = data.lists.filter((l) => l.id !== list.id);
    save();
    setFlash(res, { kind: "ok", text: "List deleted." });
  }
  res.redirect(`/u/${req.user!.handle}`);
});

// ---------- people ----------

app.get("/u/:handle", (req, res) => {
  const person = userByHandle(req.params.handle);
  if (!person || person.banned) return notFound(req, res);
  const viewer = req.user;
  const me = viewer?.id === person.id;
  const posts = data.posts
    .filter((p) => p.authorId === person.id && (p.status === "live" || (me && p.status === "held")))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const stats = trustStats(person);
  const level = trustLevel(person);
  const lists = data.lists
    .filter((l) => l.ownerId === person.id)
    .map((list) => ({ list, count: list.postIds.filter((id) => postById(id)?.status === "live").length }))
    .filter((l) => me || l.count > 0);
  render(req, res, `${person.name} (@${person.handle})`, views.profile({
    person, viewer, level, stats,
    nextSteps: nextLevelSteps(stats, level),
    followers: data.follows.filter((f) => f.followeeId === person.id).length,
    following: data.follows.filter((f) => f.followerId === person.id).length,
    isFollowing: Boolean(viewer && isFollowing(viewer.id, person.id)),
    lists,
    cards: cards(posts, viewer, `/u/${person.handle}`),
  }), { meta: stats.livePosts ? { path: `/u/${person.handle}`, description: `Honest recommendations from ${person.name}${person.bio ? `: ${person.bio}` : ""}` } : { noindex: true } });
});

function setFollow(follow: boolean) {
  return (req: Request, res: Response) => {
    const person = userByHandle(req.params.handle as string);
    const me = req.user!;
    if (person && person.id !== me.id && !person.banned) {
      const i = data.follows.findIndex((f) => f.followerId === me.id && f.followeeId === person.id);
      if (follow && i < 0) {
        data.follows.push({ followerId: me.id, followeeId: person.id });
        notify(person.id, "follow", `${me.name} (@${me.handle}) started following you.`, `/u/${me.handle}`);
      }
      if (!follow && i >= 0) data.follows.splice(i, 1);
      save();
    }
    res.redirect(safeBack(req.body.back, "/feed"));
  };
}

app.post("/u/:handle/follow", requireUser, setFollow(true));
app.post("/u/:handle/unfollow", requireUser, setFollow(false));

app.post("/profile", requireUser, (req, res) => {
  req.user!.bio = str(req.body.bio).slice(0, 120);
  save();
  setFlash(res, { kind: "ok", text: "Bio saved." });
  res.redirect(`/u/${req.user!.handle}`);
});

app.get("/notifications", requireUser, (req, res) => {
  const mine = data.notices.filter((n) => n.userId === req.user!.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
  const body = views.notificationsPage(mine.map((n) => ({ ...n })));
  if (mine.some((n) => !n.read)) {
    for (const n of mine) n.read = true;
    save();
  }
  render(req, res, "Alerts", body);
});

// ---------- weekly digest ----------

app.get("/digest", (req, res) => {
  const now = Date.now();
  const from = new Date(now - 7 * DAY);
  const recent = data.helpful.filter((h) => h.createdAt && Date.parse(h.createdAt) >= from.getTime() && isEstablishedVoter(h.userId));
  const byPost = new Map<string, number>();
  const byAuthor = new Map<string, number>();
  for (const h of recent) {
    const post = postById(h.postId);
    if (!post || post.status !== "live" || !isLiveAuthor(post) || h.userId === post.authorId) continue;
    byPost.set(post.id, (byPost.get(post.id) ?? 0) + 1);
    byAuthor.set(post.authorId, (byAuthor.get(post.authorId) ?? 0) + 1);
  }
  const people = [...byAuthor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, helpful]) => ({ user: userById(id)!, level: trustLevel(userById(id)!), helpful }));
  const posts = [...byPost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => postById(id)!);
  // Production: email this to members weekly through an email provider.
  render(req, res, "This week on Taste", views.digestPage({ people, cards: cards(posts, req.user, "/digest"), from }), { meta: { path: "/digest" } });
});

// ---------- settings: export & delete ----------

app.get("/settings", requireUser, (req, res) => render(req, res, "Settings", views.settingsPage(req.user!)));

app.get("/settings/export", requireUser, (req, res) => {
  const me = req.user!;
  const { passwordHash: _omit, ...profileData } = me;
  const mine = <T extends { userId?: string }>(xs: T[]) => xs.filter((x) => x.userId === me.id);
  const exported = {
    exportedAt: new Date().toISOString(),
    profile: profileData,
    posts: data.posts.filter((p) => p.authorId === me.id),
    lists: data.lists.filter((l) => l.ownerId === me.id),
    following: data.follows.filter((f) => f.followerId === me.id).map((f) => userById(f.followeeId)?.handle),
    helpfulVotes: mine(data.helpful),
    triedIt: mine(data.tried),
    reportsFiled: data.reports.filter((r) => r.reporterId === me.id),
    notifications: mine(data.notices),
    earnings: mine(data.earnings),
  };
  res.setHeader("Content-Disposition", `attachment; filename="taste-${me.handle}.json"`);
  res.type("application/json").send(JSON.stringify(exported, null, 2));
});

app.post("/settings/delete", requireUser, (req, res) => {
  const me = req.user!;
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (str(req.body.confirm) !== "DELETE" || !checkPassword(password, me.passwordHash)) {
    setFlash(res, { kind: "error", text: "Type DELETE and enter your password to delete your account." });
    return res.redirect("/settings");
  }
  for (const p of data.posts.filter((x) => x.authorId === me.id)) deletePost(p.id);
  data.lists = data.lists.filter((l) => l.ownerId !== me.id);
  data.follows = data.follows.filter((f) => f.followerId !== me.id && f.followeeId !== me.id);
  data.helpful = data.helpful.filter((h) => h.userId !== me.id);
  data.tried = data.tried.filter((t) => t.userId !== me.id);
  data.notices = data.notices.filter((n) => n.userId !== me.id);
  data.invites = data.invites.filter((i) => i.ownerId !== me.id);
  data.reports = data.reports.filter((r) => r.reporterId !== me.id);
  for (const e of data.earnings) if (e.userId === me.id && e.status !== "paid") e.status = "forfeited";
  for (const [token, s] of Object.entries(data.sessions)) if (s.userId === me.id) delete data.sessions[token];
  data.users = data.users.filter((u) => u.id !== me.id);
  save();
  res.clearCookie("sid");
  setFlash(res, { kind: "ok", text: "Your account has been deleted. Thanks for being part of Taste." });
  res.redirect("/");
});

// ---------- earnings ----------

app.get("/earnings", requireUser, requireEarnings, (req, res) => {
  const me = req.user!;
  const s = summary(me.id);
  const titles = new Map(data.posts.filter((p) => p.authorId === me.id).map((p) => [p.id, p.title]));
  render(req, res, "Earnings", views.earningsPage(me, s, trustLevel(me), titles));
});

app.post("/earnings/cashout", requireUser, requireEarnings, (req, res) => {
  const ok = cashOut(req.user!.id);
  setFlash(res, ok
    ? { kind: "ok", text: "On its way! Payouts usually arrive in 2–3 business days." }
    : { kind: "warn", text: "You can't cash out just yet." });
  res.redirect("/earnings");
});

// Affiliate network postback. Authenticated with a shared secret.
app.post("/api/conversions", express.json({ limit: "10kb" }), (req, res) => {
  const secret = process.env.CONVERSION_SECRET;
  const given = req.get("x-webhook-secret") ?? "";
  if (!secret || !EARNINGS_ON) return res.status(503).json({ error: "conversions not configured" });
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(secret).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "unauthorized" });
  const { clickId, orderAmount, commission } = req.body ?? {};
  const result = recordConversion(String(clickId), Number(orderAmount), Number(commission));
  res.status(result.ok ? 201 : 422).json(result);
});

// ---------- moderation ----------

app.get("/admin", requireUser, requireAdmin, (req, res) => {
  const held = data.posts.filter((p) => p.status === "held").flatMap((p) => cardData(p) ?? []);
  const open = data.reports.filter((r) => r.status === "open");
  const reports = open.flatMap((r) => {
    const post = postById(r.postId);
    const reporter = userById(r.reporterId);
    const card = post && cardData(post);
    return card && reporter && post.status !== "held"
      ? [{ id: r.id, reason: r.reason, createdAt: r.createdAt, reporter, credible: isCredibleReporter(reporter.id), card, openCount: open.filter((o) => o.postId === r.postId).length }]
      : [];
  });
  render(req, res, "Moderation", views.adminPage({
    held,
    reports,
    stats: {
      users: data.users.filter((u) => !u.banned).length,
      posts: data.posts.filter((p) => p.status === "live").length,
      held: held.length,
      openReports: open.length,
    },
  }));
});

function resolveReports(postId: string, status: "upheld" | "dismissed") {
  for (const r of data.reports) if (r.postId === postId && r.status === "open") r.status = status;
}

app.post("/admin/posts/:id", requireUser, requireAdmin, (req, res) => {
  const post = postById(req.params.id as string);
  if (post) {
    const remove = req.body.action === "remove";
    post.status = remove ? "removed" : "live";
    resolveReports(post.id, remove ? "upheld" : "dismissed");
    notify(post.authorId, remove ? "removed" : "approved", remove
      ? `Your post "${post.title}" was removed for breaking the community guidelines.`
      : `Your post "${post.title}" was approved and is now live.`, remove ? "/trust#guidelines" : `/p/${post.id}`);
    save();
  }
  res.redirect("/admin");
});

app.post("/admin/reports/:id", requireUser, requireAdmin, (req, res) => {
  const report = data.reports.find((r) => r.id === req.params.id);
  const post = report && postById(report.postId);
  if (report && post) {
    if (req.body.action === "dismiss") {
      resolveReports(post.id, "dismissed");
    } else {
      post.status = "removed";
      resolveReports(post.id, "upheld");
      notify(post.authorId, "removed", `Your post "${post.title}" was removed for breaking the community guidelines.`, "/trust#guidelines");
      if (req.body.action === "ban") {
        const author = userById(post.authorId);
        if (author && author.role !== "admin") author.banned = true;
      }
    }
    save();
  }
  res.redirect("/admin");
});

app.post("/admin/simulate-sale", requireUser, requireAdmin, requireEarnings, (req, res) => {
  const paid = data.posts.filter((p) => p.paidLink && p.status === "live");
  const post = paid[Math.floor(Math.random() * paid.length)];
  if (!post) {
    setFlash(res, { kind: "warn", text: "No live paid links yet." });
    return res.redirect("/admin");
  }
  const clickId = recordClick(post.id, req.user!.id === post.authorId ? undefined : req.user!.id)!;
  const order = Math.round((20 + Math.random() * 80) * 100) / 100;
  const result = recordConversion(clickId, order, Math.round(order * 0.08 * 100) / 100);
  setFlash(res, result.ok
    ? { kind: "ok", text: `Simulated a $${order.toFixed(2)} sale on "${post.title}". The author earns $${result.earning.userShare.toFixed(2)} after the hold.` }
    : { kind: "warn", text: result.reason });
  res.redirect("/admin");
});

// ---------- search engines ----------

app.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(
    ["User-agent: *", ...["/admin", "/earnings", "/settings", "/notifications", "/invite", "/new", "/go/", "/search", "/api/"].map((p) => `Disallow: ${p}`),
      `Sitemap: ${PUBLIC_URL}/sitemap.xml`].join("\n"),
  );
});

app.get("/sitemap.xml", (_req, res) => {
  const urls = [
    "/", "/trust", "/digest",
    ...views.CATEGORIES.map((c) => `/feed?tab=top&category=${encodeURIComponent(c)}`),
    ...data.posts.filter((p) => p.status === "live" && isLiveAuthor(p)).map((p) => `/p/${p.id}`),
    ...data.users.filter((u) => !u.banned && data.posts.some((p) => p.authorId === u.id && p.status === "live")).map((u) => `/u/${u.handle}`),
    ...data.lists.filter((l) => l.postIds.some((id) => postById(id)?.status === "live")).map((l) => `/l/${l.id}`),
  ];
  const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${xmlEsc(PUBLIC_URL + u)}</loc></url>`).join("\n")}\n</urlset>`,
  );
});

app.use((req, res) => notFound(req, res));

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (res.headersSent) return;
  render(req, res, "Something went wrong", views.message("Something went wrong", "Sorry about that. Please try again in a moment."), { status: 500 });
});

seedIfEmpty();
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Taste running at http://localhost:${port}`);
  console.log(`Earnings: ${EARNINGS_ON ? "ON" : "OFF (Phase 1)"} · Invite-only: ${INVITE_ONLY ? "yes" : "no"}`);
});
