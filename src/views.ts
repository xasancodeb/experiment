// Server-rendered HTML. Every piece of user text goes through esc().
import type { List, Notice, Post, User } from "./store.js";
import type { EarningsSummary } from "./earnings.js";
import type { PostSignals, TrustLevel, TrustStats } from "./trust.js";
import { HOLD_DAYS, LIMITS, MIN_PAYOUT, TRUST_LABELS, USER_SHARE } from "./trust.js";
import { EARNINGS_ON, INVITE_ONLY, PUBLIC_URL } from "./config.js";

export const CATEGORIES = [
  "Food & Drink", "Beauty", "Home", "Tech", "Style", "Books & Media", "Fitness", "Kids & Family", "Travel", "Other",
];

export const REPORT_REASONS = [
  "Spam or an ad",
  "Fake or not a real experience",
  "Undisclosed connection to the brand",
  "Mean, hateful or harassing",
  "Dangerous or illegal",
  "Private information",
  "Something else",
];

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const money = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();

// Classes instead of inline styles, so the strict Content-Security-Policy holds.
function avatar(user: Pick<User, "name" | "handle">, size: 30 | 40 | 72 = 40): string {
  let hue = 0;
  for (const ch of user.handle) hue = (hue * 31 + ch.charCodeAt(0)) % 12;
  return `<span class="avatar avatar-${size} hue-${hue}" aria-hidden="true">${esc(initials(user.name))}</span>`;
}

function badges(user: User, level: TrustLevel): string {
  return `<span class="badge badge-trust-${level}">${esc(TRUST_LABELS[level])}</span>${
    user.foundingMember ? ` <span class="badge badge-founding" title="One of the first members of Taste">Founding member</span>` : ""
  }`;
}

const VERDICTS: Record<Post["verdict"], { label: string; cls: string }> = {
  love: { label: "Love it", cls: "verdict-love" },
  fine: { label: "It's fine", cls: "verdict-fine" },
  skip: { label: "Skip it", cls: "verdict-skip" },
};

export interface Flash {
  kind: "ok" | "warn" | "error";
  text: string;
}

export interface Meta {
  description?: string;
  /** Path for the canonical URL; set only on pages search engines should index. */
  path?: string;
  noindex?: boolean;
}

export function layout(opts: { title: string; user?: User; body: string; flash?: Flash; unread?: number; meta?: Meta }): string {
  const { title, user, body, flash, meta = {} } = opts;
  const bell = `<a href="/notifications" aria-label="Notifications${opts.unread ? `, ${opts.unread} unread` : ""}" class="bell">Alerts${opts.unread ? `<span class="count">${opts.unread > 9 ? "9+" : opts.unread}</span>` : ""}</a>`;
  // On phones the main links move to a bottom tab bar (see .tabbar), so the top bar stays uncluttered.
  const nav = user
    ? `<a href="/feed" class="wide-only">Feed</a>
       <a href="/search" class="wide-only">Search</a>
       <a href="/new" class="btn btn-small wide-only">+ Recommend</a>
       <span class="wide-only">${bell}</span>
       ${EARNINGS_ON ? `<a href="/earnings">Earnings</a>` : ""}
       ${user.role === "admin" ? `<a href="/admin">Moderation</a>` : ""}
       <a href="/u/${esc(user.handle)}" aria-label="Your profile" class="wide-only">${avatar(user, 30)}</a>`
    : `<a href="/feed?tab=discover">Browse</a><a href="/login">Log in</a><a href="/signup" class="btn btn-small">Join</a>`;
  const description = meta.description ?? "Honest recommendations from real people: what to love, what's fine, and what to skip.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Taste</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)} · Taste">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
${meta.path ? `<link rel="canonical" href="${esc(PUBLIC_URL + meta.path)}"><meta property="og:url" content="${esc(PUBLIC_URL + meta.path)}">` : ""}
${meta.noindex || !meta.path ? `<meta name="robots" content="noindex">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="topbar">
  <div class="wrap topbar-inner">
    <a href="${user ? "/feed" : "/"}" class="logo">Taste</a>
    <nav>${nav}</nav>
  </div>
</header>
<main class="wrap" id="main">
${flash ? `<div class="flash flash-${flash.kind}" role="status">${esc(flash.text)}</div>` : ""}
${body}
</main>
${user ? `<nav class="tabbar" aria-label="Main">
  <a href="/feed">Feed</a>
  <a href="/search">Search</a>
  <a href="/new" class="tab-new" aria-label="Recommend something">+</a>
  ${bell}
  <a href="/u/${esc(user.handle)}">Me</a>
</nav>` : ""}
<footer class="wrap footer">
  <a href="/trust">Our promises</a> · <a href="/trust#guidelines">Guidelines</a> · <a href="/digest">This week</a> ·
  <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
  ${user ? ` · <a href="/settings">Settings</a> · <form method="post" action="/logout" class="inline"><button class="link">Log out</button></form>` : ""}
</footer>
</body>
</html>`;
}

const PROMISES = [
  ["Real people, real experiences", "Every post comes from someone who says they actually used the thing, and others can say whether they agree."],
  ["Honest beats positive", `"Skip it" posts count just as much as "Love it" posts. Nobody is ever rewarded for being positive.`],
  ["No hidden ads", "Members must say if they have a connection to a brand. Any link someone could earn from is labeled Paid link right next to it."],
  ["Money never buys reach", "What you see is ranked by how helpful people found it, never by who pays or earns more."],
  ["Spam doesn't pay here", "New accounts start small, fake votes don't count, and cheaters lose everything they would have earned."],
] as const;

export function landing(): string {
  return `
<section class="hero">
  <p class="eyebrow">Recommendations, minus the ads</p>
  <h1>What would your most honest friend buy?</h1>
  <p class="lead">Taste is where real people share what they love, what's just fine, and what to skip. Follow people whose taste you trust, and never waste money on hype again.</p>
  <div class="cta-row">
    <a class="btn btn-big" href="/signup">Join Taste, free</a>
    <a class="btn btn-ghost btn-big" href="/feed?tab=top">See top picks</a>
  </div>
</section>

<section class="card-grid three">
  <div class="card"><h3>1. Share what you've used</h3><p>A favorite moisturizer, a disappointing blender, the best tacos in town. Say why, and who it's for.</p></div>
  <div class="card"><h3>2. Follow people you trust</h3><p>Friends, family, people with your skin type or your budget. Their picks fill your feed.</p></div>
  ${EARNINGS_ON
    ? `<div class="card"><h3>3. Help, and get thanked</h3><p>When someone buys through your recommendation, you get ${pct(USER_SHARE)} of the store's commission.</p></div>`
    : `<div class="card"><h3>3. Become known for your taste</h3><p>The most helpful members get featured every week and earn a Trusted badge.</p></div>`}
</section>

<section class="promises">
  <h2>Our promises</h2>
  <ul class="promise-list">
    ${PROMISES.map(([t, d]) => `<li><strong>${esc(t)}</strong><span>${esc(d)}</span></li>`).join("")}
  </ul>
  <p><a href="/trust">Read exactly how we keep Taste honest →</a></p>
</section>`;
}

export function authForm(mode: "signup" | "login", values: Record<string, string> = {}, error?: string): string {
  const signup = mode === "signup";
  const showInvite = signup && (INVITE_ONLY || values.invite);
  return `
<section class="narrow">
  <h1>${signup ? "Join Taste" : "Welcome back"}</h1>
  ${signup ? `<p class="muted">${INVITE_ONLY ? "Taste is invite-only while we grow, to keep it friendly and spam-free." : "Free forever. Takes a minute."}</p>` : ""}
  ${error ? `<div class="flash flash-error" role="alert">${esc(error)}</div>` : ""}
  <form method="post" action="/${mode}" class="stack">
    ${showInvite ? `<label>Invite code<input name="invite" ${INVITE_ONLY ? "required" : ""} maxlength="20" value="${esc(values.invite)}" autocomplete="off"></label>` : ""}
    ${signup ? `
    <label>Your name<input name="name" required maxlength="50" value="${esc(values.name)}" autocomplete="name"></label>
    <label>Username<input name="handle" required pattern="[a-zA-Z0-9_]{3,20}" maxlength="20" value="${esc(values.handle)}" autocomplete="username">
      <small>3–20 letters, numbers or _</small></label>` : ""}
    <label>Email<input type="email" name="email" required value="${esc(values.email)}" autocomplete="email"></label>
    <label>Password<input type="password" name="password" required minlength="${signup ? 8 : 1}" autocomplete="${signup ? "new-password" : "current-password"}">
      ${signup ? "<small>At least 8 characters</small>" : ""}</label>
    ${signup ? `
    <fieldset class="pledge">
      <legend>The Taste pledge</legend>
      <p>Taste only works if we can trust each other. I promise to:</p>
      <ul>
        <li>Only recommend things I've actually used</li>
        <li>Be honest, including when something wasn't good</li>
        <li>Say so if I have a connection to a brand</li>
        <li>Be kind to other people, even when we disagree</li>
      </ul>
      <label class="check"><input type="checkbox" name="pledge" required> I promise</label>
    </fieldset>
    <label class="check"><input type="checkbox" name="adult" required> I'm the age of majority where I live (18, or 19 in some provinces and territories)</label>
    <label class="check"><input type="checkbox" name="emailDigest"> Email me the weekly "most helpful picks" digest. <span class="muted">Optional. Unsubscribe anytime.</span></label>
    <label class="check"><input type="checkbox" name="terms" required> I agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a></label>` : ""}
    <button class="btn btn-big">${signup ? "Create my account" : "Log in"}</button>
  </form>
  <p class="muted">${signup ? `Already have an account? <a href="/login">Log in</a>` : `New here? <a href="/signup">Join Taste</a>`}</p>
</section>`;
}

export interface PersonSuggestion {
  user: User;
  level: TrustLevel;
  posts: number;
}

export function welcome(user: User, suggestions: PersonSuggestion[], following: Set<string>): string {
  return `
<section class="narrow">
  <h1>Welcome, ${esc(user.name.split(" ")[0])}!</h1>
  ${user.foundingMember ? `<div class="flash flash-ok">You're a <strong>Founding member</strong>, one of the first people on Taste. That badge is yours for good.</div>` : ""}
  <p class="lead">Three quick steps and your feed will feel like home.</p>

  <div class="card">
    <h2>1. What are you into?</h2>
    <form method="post" action="/welcome/interests" class="chips">
      ${CATEGORIES.map((c) => `<label class="chip"><input type="checkbox" name="interests" value="${esc(c)}" ${user.interests.includes(c) ? "checked" : ""}><span>${esc(c)}</span></label>`).join("")}
      <button class="btn btn-small">Save</button>
    </form>
  </div>

  <div class="card">
    <h2>2. Follow a few people</h2>
    ${peopleList(suggestions, following, "/welcome")}
  </div>

  <div class="card">
    <h2>3. Verify your phone</h2>
    ${user.phoneVerified
      ? `<p>✓ Verified. Thanks for helping keep Taste real.</p>`
      : `<p>One account per person keeps Taste free of fake accounts. We never show your number to anyone.</p>
         <form method="post" action="/verify-phone"><button class="btn btn-small">Verify phone (demo)</button></form>`}
  </div>

  <p><a class="btn btn-big" href="/feed">Go to my feed →</a></p>
</section>`;
}

export function peopleList(people: PersonSuggestion[], following: Set<string>, back: string, viewer?: User): string {
  if (!people.length) return `<p class="muted">No suggestions yet. You'll be one of the first!</p>`;
  return `<ul class="people">${people.map((s) => personRow(s, following.has(s.user.id), back, viewer)).join("")}</ul>`;
}

function personRow(s: PersonSuggestion, isFollowing: boolean, back: string, viewer?: User): string {
  const u = s.user;
  return `<li class="person">
    <a href="/u/${esc(u.handle)}">${avatar(u)}</a>
    <div class="grow"><a href="/u/${esc(u.handle)}"><strong>${esc(u.name)}</strong></a> ${badges(u, s.level)}
      <div class="muted small">@${esc(u.handle)} · ${s.posts} recommendation${s.posts === 1 ? "" : "s"}${u.bio ? ` · ${esc(u.bio)}` : ""}</div></div>
    ${viewer?.id === u.id ? "" : followButton(u, isFollowing, back)}
  </li>`;
}

function followButton(u: User, isFollowing: boolean, back: string): string {
  return `<form method="post" action="/u/${esc(u.handle)}/${isFollowing ? "unfollow" : "follow"}" class="inline">
    <input type="hidden" name="back" value="${esc(back)}">
    <button class="btn btn-small ${isFollowing ? "btn-ghost" : ""}">${isFollowing ? "Following" : "Follow"}</button>
  </form>`;
}

export interface CardData {
  post: Post;
  author: User;
  authorLevel: TrustLevel;
  signals: PostSignals;
  viewerHelpful: boolean;
  viewerTried?: boolean;
  viewerLists?: List[];
  rising?: boolean;
}

export function postCard(d: CardData, viewer: User | undefined, back: string): string {
  const { post, author, signals: s } = d;
  const v = VERDICTS[post.verdict];
  const mine = viewer?.id === author.id;
  const paid = EARNINGS_ON && post.paidLink;
  const linkBlock = post.url
    ? `<div class="link-row">
        <a class="btn btn-small btn-ghost" href="/go/${esc(post.id)}" rel="nofollow noopener${paid ? " sponsored" : ""}" target="_blank">View at ${esc(post.merchant)}</a>
        ${paid ? `<span class="paid-label">Paid link · @${esc(author.handle)} may earn a commission if you buy</span>` : ""}
      </div>`
    : "";
  const statusNote =
    post.status === "held"
      ? `<p class="flash flash-warn small">${mine
          ? "Waiting for a quick review by a moderator. Only you can see it until then."
          : "Held for review. Members can't see this post."}</p>`
      : post.status === "removed"
        ? `<p class="flash flash-error small">Removed by a moderator for breaking the guidelines.</p>`
        : "";
  const listPicker = viewer && post.status === "live"
    ? `<details class="addlist">
        <summary class="pill">Save to list</summary>
        <form method="post" action="/lists/add" class="inline">
          <input type="hidden" name="postId" value="${esc(post.id)}"><input type="hidden" name="back" value="${esc(back)}">
          ${d.viewerLists?.length
            ? `<select name="listId" aria-label="Choose a list">${d.viewerLists.map((l) => `<option value="${esc(l.id)}">${esc(l.title)}</option>`).join("")}</select>
               <button class="pill">Save</button>`
            : ""}
          <a class="small" href="/lists/new?post=${esc(post.id)}">+ New list</a>
        </form>
      </details>`
    : "";
  const actions = viewer && !mine && post.status === "live"
    ? `<div class="actions">
        <form method="post" action="/p/${esc(post.id)}/helpful" class="inline"><input type="hidden" name="back" value="${esc(back)}">
          <button class="pill ${d.viewerHelpful ? "pill-on" : ""}" aria-pressed="${d.viewerHelpful}">Helpful${s.helpful ? ` · ${s.helpful}` : ""}</button></form>
        <details class="tried">
          <summary class="pill ${d.viewerTried !== undefined ? "pill-on" : ""}">${d.viewerTried === undefined ? "I tried it too" : d.viewerTried ? "You agree" : "You disagree"}</summary>
          <form method="post" action="/p/${esc(post.id)}/tried" class="inline"><input type="hidden" name="back" value="${esc(back)}">
            <button name="agree" value="yes" class="pill">I agree</button>
            <button name="agree" value="no" class="pill">I disagree</button></form>
        </details>
        ${listPicker}
        <details class="report">
          <summary class="link small">Report</summary>
          <form method="post" action="/p/${esc(post.id)}/report" class="stack small"><input type="hidden" name="back" value="${esc(back)}">
            <select name="reason" required aria-label="Reason">${REPORT_REASONS.map((r) => `<option>${esc(r)}</option>`).join("")}</select>
            <button class="btn btn-small btn-ghost">Send report</button>
            <span class="muted">Reports are private. A real person reviews every one.</span>
          </form>
        </details>
      </div>`
    : mine
      ? `<div class="actions">${listPicker}
          <details class="report"><summary class="link small">Delete</summary>
            <form method="post" action="/p/${esc(post.id)}/delete" class="stack small">
              <span>Delete this recommendation for good?${EARNINGS_ON ? " Any unpaid earnings from it will be lost." : ""}</span>
              <button class="btn btn-small btn-danger">Yes, delete it</button>
            </form></details></div>`
      : !viewer && post.status === "live"
        ? `<div class="actions"><a class="pill" href="/signup">Join to mark helpful or follow @${esc(author.handle)}</a></div>`
        : "";
  return `<article class="post card">
  <header class="post-head">
    <a href="/u/${esc(author.handle)}">${avatar(author)}</a>
    <div class="grow">
      <a href="/u/${esc(author.handle)}"><strong>${esc(author.name)}</strong></a> ${badges(author, d.authorLevel)}
      ${d.rising ? `<span class="badge badge-rising">Rising</span>` : ""}
      <div class="muted small">@${esc(author.handle)} · <a href="/p/${esc(post.id)}">${esc(timeAgo(post.createdAt))}</a> · <a href="/feed?tab=top&category=${encodeURIComponent(post.category)}">${esc(post.category)}</a></div>
    </div>
  </header>
  <h3 class="post-title"><span class="verdict ${v.cls}">${v.label}</span> <a href="/p/${esc(post.id)}">${esc(post.title)}</a></h3>
  ${post.brandConnection ? `<p class="connection-label">Has a connection to this brand</p>` : ""}
  <p class="post-body">${esc(post.body).replace(/\n/g, "<br>")}</p>
  <p class="muted small meta">
    ${post.price ? `${esc(post.price)} · ` : ""}${post.buyAgain ? "Would buy again" : "Wouldn't buy again"}
    ${s.tried ? ` · <strong>${s.agree} of ${s.tried}</strong> who tried it agree` : ""}
    ${(mine || !viewer) && s.helpful ? ` · ${s.helpful} found this helpful` : ""}
  </p>
  ${linkBlock}
  ${statusNote}
  ${actions}
</article>`;
}

export type FeedTab = "following" | "discover" | "top";

export function feed(opts: {
  user?: User;
  tab: FeedTab;
  category?: string;
  cards: string[];
  followingCount: number;
  suggestions?: string;
}): string {
  const { tab, category, user } = opts;
  const q = (t: string, c?: string) => `/feed?tab=${t}${c ? `&category=${encodeURIComponent(c)}` : ""}`;
  const tabs: [FeedTab, string][] = user
    ? [["following", "Following"], ["discover", "Discover"], ["top", "Top picks"]]
    : [["discover", "Discover"], ["top", "Top picks"]];
  let empty: string;
  if (tab === "following" && opts.followingCount === 0) {
    empty = `<div class="card"><h3>Your feed is quiet</h3><p>Follow a few people whose taste you trust to fill it up.</p>${opts.suggestions ?? ""}</div>`;
  } else if (tab === "top") {
    empty = `<div class="card empty"><h3>No top picks yet${category ? ` in ${esc(category)}` : ""}</h3><p>Posts appear here once several people find them helpful.</p></div>`;
  } else {
    empty = `<div class="card empty"><h3>Nothing here yet</h3><p>Be the first to share something${category ? ` in ${esc(category)}` : ""}.</p><a class="btn" href="/new">Recommend something</a></div>`;
  }
  const notes: Record<FeedTab, string> = {
    following: "",
    discover: `<p class="muted small">Fresh posts from established members, ranked by how helpful people found them. Never by money. Posts marked <span class="badge badge-rising">Rising</span> are from newer members worth discovering.</p>`,
    top: `<p class="muted small">The most helpful recommendations of all time${category ? ` in ${esc(category)}` : ""}. Great reviews stay here for as long as people keep finding them useful.</p>`,
  };
  return `
${!user ? `<div class="card guest-banner"><strong>Honest recommendations from real people.</strong> <a href="/signup">Join free</a> to follow people and share your own.</div>` : ""}
<form action="/search" class="searchbar" role="search"><input name="q" type="search" placeholder="Search products, places, brands…" aria-label="Search"><button class="btn btn-small">Search</button></form>
<div class="tabs" role="tablist">
  ${tabs.map(([t, label]) => `<a role="tab" aria-selected="${tab === t}" href="${q(t, category)}">${label}</a>`).join("")}
</div>
<div class="chips scroll">
  <a class="chip ${!category ? "chip-on" : ""}" href="${q(tab)}">All</a>
  ${CATEGORIES.map((c) => `<a class="chip ${category === c ? "chip-on" : ""}" href="${q(tab, c)}">${esc(c)}</a>`).join("")}
</div>
${notes[tab]}
${opts.cards.join("") || empty}`;
}

export function searchPage(q: string, cards: string[], people: string): string {
  return `
<form action="/search" class="searchbar" role="search"><input name="q" type="search" value="${esc(q)}" placeholder="Search products, places, brands…" aria-label="Search" autofocus><button class="btn btn-small">Search</button></form>
${q ? `<h1>Results for “${esc(q)}”</h1>` : `<h1>Search</h1><p class="muted">Find honest reviews of anything people have tried.</p>`}
${people}
${q ? cards.join("") || `<div class="card empty"><h3>No recommendations yet</h3><p>Have you tried it? Be the first to share an honest review.</p><a class="btn" href="/new">Recommend something</a></div>` : ""}`;
}

export function newPostForm(opts: {
  level: TrustLevel;
  remainingToday: number;
  values?: Record<string, string>;
  problems?: string[];
}): string {
  const v = opts.values ?? {};
  const limits = LIMITS[opts.level];
  const verdict = v.verdict ?? "love";
  const linkHelp = !EARNINGS_ON
    ? "A link to where you got it helps people find it."
    : limits.paidLinks
      ? `Links to partner stores become paid links, clearly labeled, and you get ${pct(USER_SHARE)} of the commission.`
      : "New members' links are regular links. Paid links unlock when you become a Member.";
  return `
<section class="narrow">
  <h1>Recommend something</h1>
  <p class="muted">Share something you've actually used. Honest "skip it" posts help people just as much as raves.</p>
  ${opts.problems?.length ? `<div class="flash flash-error" role="alert"><strong>Almost there:</strong><ul>${opts.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>` : ""}
  ${opts.remainingToday <= 0
    ? `<div class="card"><p>You've shared ${limits.postsPerDay} posts today, which is the daily limit for ${esc(TRUST_LABELS[opts.level])}s. Come back tomorrow!</p></div>`
    : `<form method="post" action="/new" class="stack">
    <label>What is it?<input name="title" required maxlength="100" placeholder="e.g. CeraVe Moisturizing Cream" value="${esc(v.title)}"></label>
    <label>Category<select name="category" required>${CATEGORIES.map((c) => `<option ${v.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
    <fieldset class="verdicts"><legend>Your verdict</legend>
      ${(["love", "fine", "skip"] as const).map((k) => `<label class="verdict-pick ${VERDICTS[k].cls}"><input type="radio" name="verdict" value="${k}" ${verdict === k ? "checked" : ""}><span>${VERDICTS[k].label}</span></label>`).join("")}
    </fieldset>
    <label>Tell people why<textarea name="body" required rows="5" maxlength="2000" placeholder="What did you like or not like? Who is it great for, and who should skip it?">${esc(v.body)}</textarea></label>
    <label class="check"><input type="checkbox" name="buyAgain" ${v.buyAgain || !v.title ? "checked" : ""}> I'd buy it again</label>
    <label class="check"><input type="checkbox" name="brandConnection" ${v.brandConnection ? "checked" : ""}> I own, work for, or got this free from the brand</label>
    <label>Price you paid <span class="muted">(optional)</span><input name="price" maxlength="20" placeholder="$14" value="${esc(v.price)}"></label>
    <label>Store link <span class="muted">(optional)</span><input name="url" type="url" maxlength="500" placeholder="https://..." value="${esc(v.url)}">
      <small>${esc(linkHelp)}</small></label>
    <button class="btn btn-big">Share recommendation</button>
    <p class="muted small">${opts.remainingToday} post${opts.remainingToday === 1 ? "" : "s"} left today. Every post gets a quick automatic check to keep spam out.</p>
  </form>`}
</section>`;
}

function listCard(l: List, owner: User, count: number): string {
  return `<a class="card list-card" href="/l/${esc(l.id)}">
    <strong>${esc(l.title)}</strong>
    <span class="muted small">${count} pick${count === 1 ? "" : "s"} · by @${esc(owner.handle)}</span>
    ${l.description ? `<span class="small">${esc(l.description)}</span>` : ""}
  </a>`;
}

export function profile(opts: {
  person: User;
  viewer?: User;
  level: TrustLevel;
  stats: TrustStats;
  nextSteps: string[];
  followers: number;
  following: number;
  isFollowing: boolean;
  lists: { list: List; count: number }[];
  cards: string[];
}): string {
  const { person, viewer } = opts;
  const me = viewer?.id === person.id;
  return `
<section class="profile card">
  ${avatar(person, 72)}
  <div class="grow">
    <h1>${esc(person.name)}</h1>
    <p>${badges(person, opts.level)}</p>
    <p class="muted">@${esc(person.handle)} · joined ${esc(new Date(person.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }))}
      ${person.phoneVerified ? " · ✓ verified person" : ""}</p>
    ${person.bio ? `<p>${esc(person.bio)}</p>` : ""}
    <p class="small"><strong>${opts.stats.livePosts}</strong> recommendations · <strong>${opts.followers}</strong> followers · <strong>${opts.following}</strong> following · <strong>${opts.stats.helpfulFromOthers}</strong> people found them helpful</p>
    ${viewer && !me ? followButton(person, opts.isFollowing, `/u/${person.handle}`) : ""}
    ${!viewer ? `<a class="btn btn-small" href="/signup">Join to follow @${esc(person.handle)}</a>` : ""}
    ${me ? `<a class="btn btn-small btn-ghost" href="/invite">Invite friends</a>` : ""}
  </div>
</section>
${me ? `
<section class="card">
  <h2>Your trust level: ${esc(TRUST_LABELS[opts.level])}</h2>
  <p class="muted small">Trust grows with time and with people finding your posts helpful. It unlocks more posts per day${EARNINGS_ON ? ", paid links" : ""} and a spot in Discover.</p>
  ${opts.nextSteps.length ? `<p>To reach the next level:</p><ul>${opts.nextSteps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : `<p>You've reached the top level. Thank you for making Taste better!</p>`}
  <form method="post" action="/profile" class="stack">
    <label>Short bio<input name="bio" maxlength="120" value="${esc(person.bio)}" placeholder="e.g. Sensitive skin, small budget, big opinions"></label>
    <button class="btn btn-small">Save bio</button>
  </form>
</section>` : ""}
${opts.lists.length || me ? `<h2>Lists</h2>
<div class="card-grid three">
  ${opts.lists.map((l) => listCard(l.list, person, l.count)).join("")}
  ${me ? `<a class="card list-card list-new" href="/lists/new"><strong>+ New list</strong><span class="muted small">e.g. "My sensitive-skin routine" or "Gifts under $30"</span></a>` : ""}
</div>` : ""}
<h2>Recommendations</h2>
${opts.cards.join("") || `<p class="muted">No recommendations yet.</p>`}`;
}

export function listForm(postId?: string, error?: string, values: Record<string, string> = {}): string {
  return `
<section class="narrow">
  <h1>New list</h1>
  <p class="muted">Lists bundle picks together so people can find them for months, like a routine, a gift guide or "best for small kitchens".</p>
  ${error ? `<div class="flash flash-error" role="alert">${esc(error)}</div>` : ""}
  <form method="post" action="/lists" class="stack">
    ${postId ? `<input type="hidden" name="postId" value="${esc(postId)}">` : ""}
    <label>List name<input name="title" required maxlength="80" value="${esc(values.title)}" placeholder="My sensitive-skin routine"></label>
    <label>What's it for? <span class="muted">(optional)</span><textarea name="description" rows="3" maxlength="300">${esc(values.description)}</textarea></label>
    <button class="btn">Create list</button>
  </form>
</section>`;
}

export function listPage(list: List, owner: User, viewer: User | undefined, cards: string[]): string {
  const mine = viewer?.id === owner.id;
  return `
<section class="card">
  <p class="eyebrow">List</p>
  <h1>${esc(list.title)}</h1>
  ${list.description ? `<p>${esc(list.description)}</p>` : ""}
  <p class="muted small">By <a href="/u/${esc(owner.handle)}">@${esc(owner.handle)}</a> · ${list.postIds.length} pick${list.postIds.length === 1 ? "" : "s"}</p>
  ${mine ? `<details class="report"><summary class="link small">Delete list</summary>
    <form method="post" action="/l/${esc(list.id)}/delete"><button class="btn btn-small btn-danger">Yes, delete this list</button></form></details>` : ""}
</section>
${cards.map((c, i) => mine
  ? `${c}<form method="post" action="/l/${esc(list.id)}/remove" class="list-remove"><input type="hidden" name="postId" value="${esc(list.postIds[i])}"><button class="link small">Remove from list</button></form>`
  : c).join("") || `<p class="muted">This list is empty. Use "Save to list" on any recommendation to add it.</p>`}`;
}

export function notificationsPage(items: Notice[]): string {
  return `
<h1>Alerts</h1>
${items.length ? `<ul class="notices">${items.map((n) => `<li class="${n.read ? "" : "unread"}"><a href="${esc(n.link)}">${esc(n.text)}</a><span class="muted small">${esc(timeAgo(n.createdAt))}</span></li>`).join("")}</ul>`
  : `<div class="card empty"><h3>Nothing yet</h3><p>When people follow you or find your posts helpful, you'll see it here.</p></div>`}`;
}

export function invitePage(codes: { code: string; usedBy?: User }[]): string {
  return `
<section class="narrow">
  <h1>Invite friends</h1>
  <p class="lead">Taste is better with people whose taste you trust. Each invite works once, and your friend will follow you automatically.</p>
  <ul class="invites">
    ${codes.map((c) => `<li class="card">
      ${c.usedBy
        ? `<span class="muted"><s>${esc(c.code)}</s> · used by <a href="/u/${esc(c.usedBy.handle)}">@${esc(c.usedBy.handle)}</a></span>`
        : `<code>${esc(c.code)}</code><input readonly value="${esc(`${PUBLIC_URL}/signup?invite=${c.code}`)}" aria-label="Invite link">`}
    </li>`).join("")}
  </ul>
</section>`;
}

export function earningsPage(user: User, s: EarningsSummary, level: TrustLevel, postTitles: Map<string, string>): string {
  const statusLabel: Record<string, string> = {
    pending: "On hold", available: "Available", paid: "Paid", forfeited: "Forfeited", reversed: "Returned",
  };
  return `
<h1>Your earnings</h1>
<div class="card-grid three">
  <div class="card stat"><span class="muted small">On hold</span><strong>${money(s.pending)}</strong><span class="muted small">Released after ${HOLD_DAYS} days</span></div>
  <div class="card stat"><span class="muted small">Ready to cash out</span><strong>${money(s.available)}</strong><span class="muted small">Minimum ${money(MIN_PAYOUT)}</span></div>
  <div class="card stat"><span class="muted small">Paid to you so far</span><strong>${money(s.paid)}</strong><span class="muted small">Thank you for helping people</span></div>
</div>

<div class="card">
  ${s.canCashOut
    ? `<form method="post" action="/earnings/cashout"><button class="btn">Cash out ${money(s.available)}</button></form>`
    : `<p><strong>${esc(s.blocker ?? "")}</strong></p>`}
  ${!user.idVerified ? `
    <p class="muted small">To pay you safely we confirm who you are once, through our payments partner. It stops people from creating fake accounts to farm money, and it's required for tax forms.</p>
    <form method="post" action="/verify-identity"><button class="btn btn-small btn-ghost">Verify identity (demo)</button></form>` : `<p class="muted small">✓ Identity verified</p>`}
  ${!LIMITS[level].paidLinks ? `<p class="muted small">Paid links unlock when you reach Member. <a href="/u/${esc(user.handle)}">See your progress</a>.</p>` : ""}
</div>

<h2>History</h2>
${s.items.length ? `<table class="table">
  <thead><tr><th>Date</th><th>Recommendation</th><th>Order</th><th>Your share</th><th>Status</th></tr></thead>
  <tbody>${s.items.map((e) => `<tr>
    <td>${esc(new Date(e.createdAt).toLocaleDateString())}</td>
    <td><a href="/p/${esc(e.postId)}">${esc(postTitles.get(e.postId) ?? "Deleted post")}</a></td>
    <td>${money(e.orderAmount)}</td>
    <td>${money(e.userShare)}</td>
    <td><span class="badge status-${esc(e.status)}">${esc(statusLabel[e.status])}</span>${e.status === "pending" ? `<div class="muted small">until ${esc(new Date(e.availableAt).toLocaleDateString())}</div>` : ""}</td>
  </tr>`).join("")}</tbody></table>`
    : `<p class="muted">No earnings yet. That's completely normal! Keep sharing honest recommendations. Earnings come from being genuinely helpful, not from posting more.</p>`}
<p class="muted small"><a href="/trust#earning">How earning works</a></p>`;
}

export function digestPage(opts: {
  people: { user: User; level: TrustLevel; helpful: number }[];
  cards: string[];
  from: Date;
}): string {
  return `
<section class="narrow">
  <p class="eyebrow">This week on Taste</p>
  <h1>The most helpful picks of the week</h1>
  <p class="muted">Week of ${esc(opts.from.toLocaleDateString("en-US", { month: "long", day: "numeric" }))}. Chosen by how many people found them helpful, never by money.</p>
  <h2>Most helpful members</h2>
  ${opts.people.length
    ? `<ol class="people digest-people">${opts.people.map((p) => `<li class="person">${avatar(p.user)}<div class="grow"><a href="/u/${esc(p.user.handle)}"><strong>${esc(p.user.name)}</strong></a> ${badges(p.user, p.level)}<div class="muted small">${p.helpful} helpful vote${p.helpful === 1 ? "" : "s"} this week</div></div></li>`).join("")}</ol>`
    : `<p class="muted">Quiet week. Be the one people find helpful!</p>`}
  <h2>Top recommendations</h2>
  ${opts.cards.join("") || `<p class="muted">No recommendations this week yet.</p>`}
</section>`;
}

export function settingsPage(user: User): string {
  return `
<section class="narrow">
  <h1>Settings</h1>
  <div class="card">
    <h2>Your data</h2>
    <p>Download everything Taste stores about you: profile, posts, lists, votes${EARNINGS_ON ? " and earnings" : ""}.</p>
    <a class="btn btn-small btn-ghost" href="/settings/export">Download my data</a>
  </div>
  <div class="card">
    <h2>Email</h2>
    <form method="post" action="/settings/email" class="stack">
      <label class="check"><input type="checkbox" name="emailDigest" ${user.emailDigest ? "checked" : ""}> Email me the weekly "most helpful picks" digest</label>
      <button class="btn btn-small btn-ghost">Save</button>
    </form>
  </div>
  <div class="card danger-zone">
    <h2>Delete account</h2>
    <p>This permanently deletes your profile, recommendations, lists and votes. It can't be undone.${EARNINGS_ON ? " <strong>Cash out first:</strong> unpaid earnings are lost when you delete your account." : ""}</p>
    <form method="post" action="/settings/delete" class="stack">
      <label>Type <strong>DELETE</strong> to confirm<input name="confirm" required autocomplete="off"></label>
      <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn btn-danger">Delete my account</button>
    </form>
  </div>
  <p class="muted small">Signed in as ${esc(user.email)}</p>
</section>`;
}

export function trustPage(): string {
  return `
<section class="narrow prose">
  <h1>How we keep Taste honest</h1>
  <p class="lead">Taste only works if you can believe what you read. Here's exactly how we protect that, in plain English.</p>

  <h2>Our promises</h2>
  <ul class="promise-list">${PROMISES.map(([t, d]) => `<li><strong>${esc(t)}</strong><span>${esc(d)}</span></li>`).join("")}</ul>

  <h2 id="guidelines">Community guidelines</h2>
  <ol>
    <li><strong>Only share things you've used.</strong> No guesses, no copying other reviews, no AI-written reviews.</li>
    <li><strong>Be honest, good or bad.</strong> Mixed and negative reviews are welcome and ranked the same as positive ones.</li>
    <li><strong>Say if you're connected.</strong> If you own, work for, or got something free from a brand, tick the box when you post. Your post gets a "Has a connection to this brand" label.</li>
    <li><strong>Be kind.</strong> Criticize products, not people. No harassment, hate or personal attacks.</li>
    <li><strong>Keep it safe.</strong> No dangerous or illegal products, no medical promises, no private information.</li>
    <li><strong>No spam.</strong> No ads, codes, "DM me" or posting the same thing over and over.</li>
  </ol>

  <h2>How we stop spam and fakes</h2>
  <ul>
    <li><strong>Every post is checked</strong> automatically before it goes live. Anything that looks like an ad or a fake is held for a real person to review.</li>
    <li><strong>New members start small:</strong> a few posts a day, and posts reach followers first. Limits lift as people find your posts helpful.</li>
    <li><strong>Fake votes don't count.</strong> Only votes from verified accounts that are a few days old count toward rankings and trust.</li>
    <li><strong>One person, one account.</strong> Phone verification is needed to post${EARNINGS_ON ? ", and identity verification to get paid" : ""}.</li>
    <li><strong>Reports are reviewed by people.</strong> If several established members report a post, it's hidden until we check it. People who keep filing false reports lose that power.</li>
    <li><strong>Cheating costs you.</strong> Serious or repeated abuse ends the account${EARNINGS_ON ? " and forfeits any unpaid earnings" : ""}.</li>
  </ul>

  <h2 id="earning">How earning works</h2>
  ${EARNINGS_ON ? `<ul>
    <li>When you link to one of our partner stores, the link becomes a <strong>Paid link</strong> and is always labeled that way, as Canada's Competition Act and Ad Standards guidelines require.</li>
    <li>If someone buys through it, the store pays a commission. <strong>You get ${pct(USER_SHARE)}</strong>, and Taste keeps ${pct(1 - USER_SHARE)} to run the service.</li>
    <li>Earnings wait <strong>${HOLD_DAYS} days</strong> so returns can be handled, then become available. Cash out from ${money(MIN_PAYOUT)}.</li>
    <li>Buying through your own link earns nothing.</li>
    <li>We <strong>never pay for positive reviews</strong>, and how much you earn never affects who sees your posts.</li>
    <li>Paid links are for Members and Trusted members, so brand-new accounts can't be used to farm money.</li>
  </ul>` : `<p>Earning isn't switched on yet. When it is, members will get ${pct(USER_SHARE)} of the commission from clearly labeled paid links. The same honesty rules will apply: no extra reward for positive reviews, and money will never buy reach.</p>`}
</section>`;
}

const DRAFT = `<div class="flash flash-warn">Draft for the prototype. It must be reviewed by a lawyer before Taste launches publicly.</div>`;

export function termsPage(): string {
  return `
<section class="narrow prose">
  <h1>Terms of Service</h1>
  ${DRAFT}
  <ol>
    <li><strong>Who can use Taste.</strong> You must be the age of majority in your province or territory (18 or 19). One account per person.</li>
    <li><strong>Your posts.</strong> You own what you write. You give Taste permission to show it on the service. Only post genuine experiences you personally had.</li>
    <li><strong>Connections to brands.</strong> You must disclose if you own, work for, or received something free from a brand you post about.</li>
    <li><strong>What's not allowed.</strong> Fake reviews, spam, harassment, illegal or dangerous content, sharing private information, or trying to cheat rankings or earnings.</li>
    <li><strong>Moderation.</strong> We may hold, remove or limit posts and close accounts that break these rules.</li>
    ${EARNINGS_ON ? `<li><strong>Earnings.</strong> Commission sharing is a thank-you, not employment. Earnings are held ${HOLD_DAYS} days, require identity verification, and are forfeited if the post is removed or the account is closed for abuse. Amounts are in Canadian dollars. You're responsible for reporting your own income; we report to the Canada Revenue Agency where required.</li>` : ""}
    <li><strong>No guarantees.</strong> Recommendations are members' personal opinions, not advice from Taste.</li>
    <li><strong>Governing law.</strong> These terms are governed by the laws of your province and the federal laws of Canada that apply there.</li>
    <li><strong>Leaving.</strong> You can delete your account at any time from Settings.</li>
  </ol>
</section>`;
}

export function privacyPage(): string {
  return `
<section class="narrow prose">
  <h1>Privacy Policy</h1>
  ${DRAFT}
  <ul>
    <li><strong>What we collect:</strong> your name, username, email, password (scrambled so it can't be read), what you post, who you follow, and your votes${EARNINGS_ON ? ", plus clicks on links and sales for paying earnings" : ""}.</li>
    <li><strong>What's public:</strong> your name, username, bio, recommendations and lists. Your email, phone number, reports and votes are private.</li>
    <li><strong>What we never do:</strong> sell your personal information, or show your phone number to anyone.</li>
    <li><strong>Emails:</strong> we only send the weekly digest if you opted in, and every email has an unsubscribe link (Canada's Anti-Spam Legislation).</li>
    <li><strong>Our privacy laws:</strong> we follow Canada's federal privacy law (PIPEDA) and, for members in Quebec, Law 25. Questions or requests go to our Privacy Officer at privacy@[your-domain].</li>
    <li><strong>Service providers:</strong> we use trusted providers for hosting, text verification${EARNINGS_ON ? ", payments" : ""}, and automated spam checks of posts.</li>
    <li><strong>Your controls:</strong> download all your data or delete your account at any time from Settings.</li>
  </ul>
</section>`;
}

export function adminPage(opts: {
  held: CardData[];
  reports: { id: string; reason: string; createdAt: string; reporter: User; credible: boolean; card: CardData; openCount: number }[];
  stats: { users: number; posts: number; held: number; openReports: number };
}): string {
  const s = opts.stats;
  return `
<h1>Moderation</h1>
<div class="card-grid four">
  <div class="card stat"><span class="muted small">Members</span><strong>${s.users}</strong></div>
  <div class="card stat"><span class="muted small">Live posts</span><strong>${s.posts}</strong></div>
  <div class="card stat"><span class="muted small">Waiting for review</span><strong>${s.held}</strong></div>
  <div class="card stat"><span class="muted small">Open reports</span><strong>${s.openReports}</strong></div>
</div>

<h2>Posts waiting for review</h2>
${opts.held.map((c) => `
  <div class="mod-item">
    ${postCard(c, undefined, "/admin")}
    <p class="small"><strong>Why it was held:</strong> ${esc(c.post.moderation.reasons.join(" ") || "Hidden after reports")}</p>
    <form method="post" action="/admin/posts/${esc(c.post.id)}" class="inline">
      <button name="action" value="approve" class="btn btn-small">Approve</button>
      <button name="action" value="remove" class="btn btn-small btn-danger">Remove</button>
    </form>
  </div>`).join("") || `<p class="muted">Nothing waiting. 🎉</p>`}

<h2>Reports</h2>
${opts.reports.map((r) => `
  <div class="mod-item">
    <p class="small"><strong>${esc(r.reason)}</strong> reported by @${esc(r.reporter.handle)}${r.credible ? "" : ` <span class="badge status-forfeited">Often reports wrongly</span>`} · ${esc(timeAgo(r.createdAt))}${r.openCount > 1 ? ` · ${r.openCount} open reports on this post` : ""}</p>
    ${postCard(r.card, undefined, "/admin")}
    <form method="post" action="/admin/reports/${esc(r.id)}" class="inline">
      <button name="action" value="uphold" class="btn btn-small btn-danger">Uphold &amp; remove post</button>
      <button name="action" value="dismiss" class="btn btn-small btn-ghost">Dismiss</button>
      <button name="action" value="ban" class="btn btn-small btn-ghost">Remove &amp; ban author</button>
    </form>
  </div>`).join("") || `<p class="muted">No open reports.</p>`}

<h2>Tools</h2>
<p><a class="btn btn-small btn-ghost" href="/digest">Preview this week's digest</a></p>
${EARNINGS_ON ? `<form method="post" action="/admin/simulate-sale" class="inline">
  <button class="btn btn-small btn-ghost">Simulate a sale on a random paid link</button>
</form>
<p class="muted small">In production, sales arrive from the affiliate network at <code>POST /api/conversions</code>.</p>` : `<p class="muted small">Earnings are off (Phase 1). Set <code>EARNINGS=on</code> once affiliate and payout approvals are in place.</p>`}`;
}

export function message(title: string, text: string): string {
  return `<section class="narrow"><h1>${esc(title)}</h1><p>${esc(text)}</p><p><a href="/">Go home</a></p></section>`;
}

export const notFound = () => message("We couldn't find that", "It may have been deleted, or the link is wrong.");
