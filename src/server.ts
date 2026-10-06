import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import {
  checkPassword, createSession, data, destroySession, hashPassword, isFollowing, newId, postById, save,
  sessionUser, userByEmail, userByHandle, userById, type Post, type User,
} from "./store.js";
import { LIMITS, nextLevelSteps, postsToday, rankScore, signals, trustLevel, trustStats } from "./trust.js";
import { checkLink } from "./links.js";
import { moderate } from "./moderation.js";
import { cashOut, recordClick, recordConversion, summary } from "./earnings.js";
import * as views from "./views.js";
import { seedIfEmpty } from "./seed.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
    sessionToken?: string;
  }
}

const app = express();
app.disable("x-powered-by");
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
  if (origin && new URL(origin).host !== req.get("host")) {
    res.status(403).send("Cross-site request blocked");
    return;
  }
  next();
});

function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const secure = process.env.NODE_ENV === "production";

app.use((req, _res, next) => {
  const token = cookies(req).sid;
  req.sessionToken = token;
  req.user = sessionUser(token);
  next();
});

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

function render(req: Request, res: Response, title: string, body: string, status = 200) {
  res.status(status).type("html").send(views.layout({ title, user: req.user, body, flash: takeFlash(req, res) }));
}

/** Only allow redirects back to our own pages. */
const safeBack = (value: unknown, fallback: string) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;

function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.redirect("/login");
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return render(req, res, "Not found", views.notFound(), 404);
  next();
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function cardData(post: Post, viewer?: User): views.CardData | undefined {
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
  };
}

function cards(posts: Post[], viewer: User | undefined, back: string): string[] {
  return posts.flatMap((p) => {
    const d = cardData(p, viewer);
    return d ? [views.postCard(d, viewer, back)] : [];
  });
}

const canSee = (post: Post, viewer?: User) =>
  post.status === "live" || viewer?.id === post.authorId || viewer?.role === "admin";

// ---------- public pages ----------

app.get("/", (req, res) => (req.user ? res.redirect("/feed") : render(req, res, "Honest recommendations", views.landing())));
app.get("/trust", (req, res) => render(req, res, "How we keep it honest", views.trustPage()));

app.get("/signup", (req, res) => render(req, res, "Join", views.authForm("signup")));
app.post("/signup", (req, res) => {
  const v = { name: str(req.body.name), handle: str(req.body.handle), email: str(req.body.email).toLowerCase() };
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const fail = (msg: string) => render(req, res, "Join", views.authForm("signup", v, msg), 400);
  if (!v.name || v.name.length > 50) return fail("Please enter your name.");
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(v.handle)) return fail("Usernames are 3–20 letters, numbers or underscores.");
  if (userByHandle(v.handle)) return fail("That username is taken. Try another one.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return fail("Please enter a valid email.");
  if (userByEmail(v.email)) return fail("There's already an account with that email. Try logging in.");
  if (password.length < 8) return fail("Passwords need at least 8 characters.");
  if (!req.body.pledge) return fail("Please take the Taste pledge to join.");
  if (!req.body.adult) return fail("You need to be 18 or older to join Taste.");
  const now = new Date().toISOString();
  const user: User = {
    id: newId(), handle: v.handle, name: v.name, email: v.email, passwordHash: hashPassword(password), bio: "",
    interests: [], role: "member", phoneVerified: false, idVerified: false, banned: false, createdAt: now,
    pledgeAcceptedAt: now,
  };
  data.users.push(user);
  save();
  res.cookie("sid", createSession(user.id), { httpOnly: true, sameSite: "lax", secure, maxAge: 30 * 24 * 3600 * 1000 });
  res.redirect("/welcome");
});

app.get("/login", (req, res) => render(req, res, "Log in", views.authForm("login")));
app.post("/login", (req, res) => {
  const email = str(req.body.email).toLowerCase();
  const user = userByEmail(email);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!user || !checkPassword(password, user.passwordHash)) {
    return render(req, res, "Log in", views.authForm("login", { email }, "That email and password don't match."), 400);
  }
  if (user.banned) {
    return render(req, res, "Log in", views.authForm("login", { email }, "This account was closed for breaking the guidelines."), 403);
  }
  res.cookie("sid", createSession(user.id), { httpOnly: true, sameSite: "lax", secure, maxAge: 30 * 24 * 3600 * 1000 });
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
  const suggestions = data.users
    .filter((u) => u.id !== me.id && !u.banned && u.role !== "admin")
    .map((u) => ({ user: u, level: trustLevel(u), stats: trustStats(u) }))
    .filter((s) => s.level >= 1)
    .sort((a, b) => b.stats.helpfulFromOthers - a.stats.helpfulFromOthers)
    .slice(0, 6)
    .map((s) => ({ user: s.user, level: s.level, posts: s.stats.livePosts }));
  const following = new Set(data.follows.filter((f) => f.followerId === me.id).map((f) => f.followeeId));
  render(req, res, "Welcome", views.welcome(me, suggestions, following));
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

app.post("/verify-identity", requireUser, (req, res) => {
  req.user!.idVerified = true;
  save();
  setFlash(res, { kind: "ok", text: "Identity verified." });
  res.redirect("/earnings");
});

// ---------- feed & posts ----------

app.get("/feed", requireUser, (req, res) => {
  const me = req.user!;
  const tab = req.query.tab === "discover" ? "discover" : "following";
  const category = views.CATEGORIES.includes(str(req.query.category)) ? str(req.query.category) : undefined;
  const followed = new Set(data.follows.filter((f) => f.followerId === me.id).map((f) => f.followeeId));
  let posts = data.posts.filter((p) => (!category || p.category === category) && userById(p.authorId)?.banned === false);

  if (tab === "following") {
    posts = posts
      .filter((p) => (followed.has(p.authorId) && p.status === "live") || (p.authorId === me.id && p.status !== "removed"))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } else {
    const now = Date.now();
    posts = posts
      .filter((p) => p.status === "live" && LIMITS[trustLevel(userById(p.authorId)!)].inDiscover)
      .map((p) => ({ p, score: rankScore(p, signals(p.id, p.authorId), now) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);
  }
  const back = `/feed?tab=${tab}${category ? `&category=${encodeURIComponent(category)}` : ""}`;
  render(req, res, "Feed", views.feed({
    user: me, tab, category, cards: cards(posts.slice(0, 50), me, back), level: trustLevel(me), followingCount: followed.size,
  }));
});

function newPostPage(req: Request, res: Response, values?: Record<string, string>, problems?: string[]) {
  const me = req.user!;
  const level = trustLevel(me);
  const remainingToday = LIMITS[level].postsPerDay - postsToday(me.id);
  render(req, res, "Recommend", views.newPostForm({ user: me, level, remainingToday, values, problems }), problems ? 400 : 200);
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
  };
  const problems: string[] = [];
  if (!views.CATEGORIES.includes(values.category)) problems.push("Pick a category.");
  if (!["love", "fine", "skip"].includes(values.verdict)) problems.push("Pick a verdict.");
  const link = checkLink(values.url);
  if (!link.ok) problems.push(link.problem!);
  if (problems.length) return newPostPage(req, res, values, problems);

  const result = await moderate({ ...values, merchant: link.merchant }, me.id);
  if (result.decision === "reject") return newPostPage(req, res, values, result.reasons);

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
    paidLink: Boolean(link.url && link.partner && LIMITS[level].paidLinks),
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
  if (!post || !canSee(post, req.user)) return render(req, res, "Not found", views.notFound(), 404);
  const d = cardData(post, req.user)!;
  render(req, res, post.title, `<section class="narrow">${views.postCard(d, req.user, `/p/${post.id}`)}
    ${req.user ? "" : `<div class="card"><p>Join Taste to follow people whose taste you trust.</p><a class="btn" href="/signup">Join free</a></div>`}</section>`);
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
  const i = data.helpful.findIndex((h) => h.postId === post.id && h.userId === req.user!.id);
  if (i >= 0) data.helpful.splice(i, 1);
  else data.helpful.push({ postId: post.id, userId: req.user!.id });
  save();
  res.redirect(safeBack(req.body.back, "/feed"));
});

app.post("/p/:id/tried", requireUser, (req, res) => {
  const post = livePostFor(req, res);
  if (!post) return;
  const agree = req.body.agree === "yes";
  const existing = data.tried.find((t) => t.postId === post.id && t.userId === req.user!.id);
  if (existing) existing.agree = agree;
  else data.tried.push({ postId: post.id, userId: req.user!.id, agree });
  save();
  res.redirect(safeBack(req.body.back, "/feed"));
});

/** Posts are hidden for review once this many established members report them. */
const AUTO_HIDE_REPORTS = 3;

app.post("/p/:id/report", requireUser, (req, res) => {
  const post = livePostFor(req, res);
  if (!post) return;
  const me = req.user!;
  const reason = views.REPORT_REASONS.includes(str(req.body.reason)) ? str(req.body.reason) : "Something else";
  if (!data.reports.some((r) => r.postId === post.id && r.reporterId === me.id && r.status === "open")) {
    data.reports.push({ id: newId(), postId: post.id, reporterId: me.id, reason, status: "open", createdAt: new Date().toISOString() });
    const weighty = data.reports.filter(
      (r) => r.postId === post.id && r.status === "open" && trustLevel(userById(r.reporterId)!) >= 1,
    ).length;
    if (weighty >= AUTO_HIDE_REPORTS) {
      post.status = "held";
      post.moderation.reasons.push(`Hidden after ${weighty} reports from members.`);
    }
    save();
  }
  setFlash(res, { kind: "ok", text: "Thanks for reporting. A real person will review it." });
  res.redirect(safeBack(req.body.back, "/feed"));
});

app.get("/go/:id", (req, res) => {
  const post = postById(req.params.id);
  if (!post || post.status !== "live" || !post.url) return render(req, res, "Not found", views.notFound(), 404);
  const clickId = recordClick(post.id, req.user?.id);
  // Production: wrap paid links in the affiliate network's tracking URL with clickId as the sub-ID.
  const target = new URL(post.url);
  if (post.paidLink && clickId) target.searchParams.set("subid", clickId);
  res.redirect(302, target.toString());
});

// ---------- people ----------

app.get("/u/:handle", (req, res) => {
  const person = userByHandle(req.params.handle);
  if (!person || person.banned) return render(req, res, "Not found", views.notFound(), 404);
  const viewer = req.user;
  const me = viewer?.id === person.id;
  const posts = data.posts
    .filter((p) => p.authorId === person.id && (p.status === "live" || me))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const stats = trustStats(person);
  const level = trustLevel(person);
  render(req, res, person.name, views.profile({
    person, viewer, level, stats,
    nextSteps: nextLevelSteps(stats, level),
    followers: data.follows.filter((f) => f.followeeId === person.id).length,
    following: data.follows.filter((f) => f.followerId === person.id).length,
    isFollowing: Boolean(viewer && isFollowing(viewer.id, person.id)),
    cards: cards(posts, viewer, `/u/${person.handle}`),
  }));
});

function setFollow(follow: boolean) {
  return (req: Request, res: Response) => {
    const person = userByHandle(req.params.handle as string);
    const me = req.user!;
    if (person && person.id !== me.id) {
      const i = data.follows.findIndex((f) => f.followerId === me.id && f.followeeId === person.id);
      if (follow && i < 0) data.follows.push({ followerId: me.id, followeeId: person.id });
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

// ---------- earnings ----------

app.get("/earnings", requireUser, (req, res) => {
  const me = req.user!;
  const s = summary(me.id);
  const titles = new Map(data.posts.filter((p) => p.authorId === me.id).map((p) => [p.id, p.title]));
  render(req, res, "Earnings", views.earningsPage(me, s, trustLevel(me), titles));
});

app.post("/earnings/cashout", requireUser, (req, res) => {
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
  if (!secret) return res.status(503).json({ error: "conversions not configured" });
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
      ? [{ id: r.id, reason: r.reason, createdAt: r.createdAt, reporter, card, openCount: open.filter((o) => o.postId === r.postId).length }]
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
      if (req.body.action === "ban") {
        const author = userById(post.authorId);
        if (author && author.role !== "admin") author.banned = true;
      }
    }
    save();
  }
  res.redirect("/admin");
});

app.post("/admin/simulate-sale", requireUser, requireAdmin, (req, res) => {
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
    ? { kind: "ok", text: `Simulated a ${"$" + order.toFixed(2)} sale on "${post.title}". The author earns $${result.earning.userShare.toFixed(2)} after the hold.` }
    : { kind: "warn", text: result.reason });
  res.redirect("/admin");
});

app.use((req, res) => render(req, res, "Not found", views.notFound(), 404));

seedIfEmpty();
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Taste running at http://localhost:${port}`));
