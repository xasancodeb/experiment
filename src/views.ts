// Server-rendered HTML. Every piece of user text goes through esc().
import type { Post, User } from "./store.js";
import type { EarningsSummary } from "./earnings.js";
import type { PostSignals, TrustLevel, TrustStats } from "./trust.js";
import { HOLD_DAYS, LIMITS, MIN_PAYOUT, TRUST_LABELS, USER_SHARE } from "./trust.js";

export const CATEGORIES = [
  "Food & Drink", "Beauty", "Home", "Tech", "Style", "Books & Media", "Fitness", "Kids & Family", "Travel", "Other",
];

export const REPORT_REASONS = [
  "Spam or an ad",
  "Fake or not a real experience",
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

function trustBadge(level: TrustLevel): string {
  return `<span class="badge badge-trust-${level}" title="${esc(TRUST_LABELS[level])}">${esc(TRUST_LABELS[level])}</span>`;
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

export function layout(opts: { title: string; user?: User; body: string; flash?: Flash; admin?: boolean }): string {
  const { title, user, body, flash } = opts;
  const nav = user
    ? `<a href="/feed">Feed</a>
       <a href="/new" class="btn btn-small">+ Recommend</a>
       <a href="/earnings">Earnings</a>
       <a href="/u/${esc(user.handle)}" aria-label="Your profile">${avatar(user, 30)}</a>
       ${user.role === "admin" ? `<a href="/admin">Moderation</a>` : ""}`
    : `<a href="/trust">How we keep it honest</a><a href="/login">Log in</a><a href="/signup" class="btn btn-small">Join</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Taste</title>
<meta name="description" content="Honest recommendations from people you trust.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="topbar">
  <div class="wrap topbar-inner">
    <a href="${user ? "/feed" : "/"}" class="logo">Taste</a>
    <nav>${nav}</nav>
  </div>
</header>
<main class="wrap">
${flash ? `<div class="flash flash-${flash.kind}" role="status">${esc(flash.text)}</div>` : ""}
${body}
</main>
<footer class="wrap footer">
  <a href="/trust">Our promises</a> · <a href="/trust#guidelines">Community guidelines</a> · <a href="/trust#earning">How earning works</a>
  ${user ? `<form method="post" action="/logout" class="inline"><button class="link">Log out</button></form>` : ""}
</footer>
</body>
</html>`;
}

const PROMISES = [
  ["Real people, real experiences", "Every post is from someone who says they actually used it, and others can say whether they agree."],
  ["Honest beats positive", `"Skip it" posts count just as much as "Love it" posts. We never pay more for a positive review.`],
  ["Every paid link is labeled", "If someone can earn from a link, it says Paid link right next to it. No fine print."],
  ["Money never buys reach", "What you see is ranked by how helpful people found it, never by who earns more."],
  ["Spam doesn't pay here", "Earnings are held, verified and forfeited for cheating, so spammers have no reason to try."],
] as const;

export function landing(): string {
  return `
<section class="hero">
  <p class="eyebrow">Recommendations, minus the ads</p>
  <h1>What would your most honest friend buy?</h1>
  <p class="lead">Taste is where real people share what they love, what's just fine, and what to skip. Follow people whose taste you trust. And if you help someone find something great, you can earn a little too.</p>
  <div class="cta-row">
    <a class="btn btn-big" href="/signup">Join Taste, free</a>
    <a class="btn btn-ghost btn-big" href="/login">Log in</a>
  </div>
</section>

<section class="card-grid three">
  <div class="card"><h3>1. Share what you've used</h3><p>A favorite moisturizer, a disappointing blender, the best tacos in town. Say why, and who it's for.</p></div>
  <div class="card"><h3>2. Follow people you trust</h3><p>Friends, family, people with your skin type or your budget. Their picks fill your feed.</p></div>
  <div class="card"><h3>3. Help, and get thanked</h3><p>When someone buys through your recommendation, you get ${Math.round(USER_SHARE * 100)}% of the store's commission.</p></div>
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
  return `
<section class="narrow">
  <h1>${signup ? "Join Taste" : "Welcome back"}</h1>
  ${signup ? `<p class="muted">Free forever. Takes a minute.</p>` : ""}
  ${error ? `<div class="flash flash-error" role="alert">${esc(error)}</div>` : ""}
  <form method="post" action="/${mode}" class="stack">
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
        <li>Be kind to other people, even when we disagree</li>
      </ul>
      <label class="check"><input type="checkbox" name="pledge" required> I promise</label>
    </fieldset>
    <label class="check"><input type="checkbox" name="adult" required> I'm 18 or older</label>` : ""}
    <button class="btn btn-big">${signup ? "Create my account" : "Log in"}</button>
  </form>
  <p class="muted">${signup ? `Already have an account? <a href="/login">Log in</a>` : `New here? <a href="/signup">Join Taste</a>`}</p>
</section>`;
}

export function welcome(user: User, suggestions: { user: User; level: TrustLevel; posts: number }[], following: Set<string>): string {
  return `
<section class="narrow">
  <h1>Welcome, ${esc(user.name.split(" ")[0])}!</h1>
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
    <ul class="people">
      ${suggestions.map((s) => personRow(s.user, s.level, s.posts, following.has(s.user.id), "/welcome")).join("") || `<li class="muted">No suggestions yet. You'll be one of the first!</li>`}
    </ul>
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

function personRow(u: User, level: TrustLevel, posts: number, isFollowing: boolean, back: string): string {
  return `<li class="person">
    <a href="/u/${esc(u.handle)}">${avatar(u)}</a>
    <div class="grow"><a href="/u/${esc(u.handle)}"><strong>${esc(u.name)}</strong></a> ${trustBadge(level)}
      <div class="muted small">@${esc(u.handle)} · ${posts} recommendation${posts === 1 ? "" : "s"}${u.bio ? ` · ${esc(u.bio)}` : ""}</div></div>
    ${followButton(u, isFollowing, back)}
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
}

export function postCard(d: CardData, viewer: User | undefined, back: string): string {
  const { post, author, signals: s } = d;
  const v = VERDICTS[post.verdict];
  const mine = viewer?.id === author.id;
  const linkBlock = post.url
    ? `<div class="link-row">
        <a class="btn btn-small btn-ghost" href="/go/${esc(post.id)}" rel="nofollow noopener" target="_blank">View at ${esc(post.merchant)}</a>
        ${post.paidLink ? `<span class="paid-label">Paid link · @${esc(author.handle)} may earn a commission if you buy</span>` : ""}
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
  const actions = viewer && !mine && post.status === "live"
    ? `<div class="actions">
        <form method="post" action="/p/${esc(post.id)}/helpful" class="inline"><input type="hidden" name="back" value="${esc(back)}">
          <button class="pill ${d.viewerHelpful ? "pill-on" : ""}" aria-pressed="${d.viewerHelpful}">Helpful${s.helpful ? ` · ${s.helpful}` : ""}</button></form>
        <details class="tried">
          <summary class="pill ${d.viewerTried !== undefined ? "pill-on" : ""}">I tried it too</summary>
          <form method="post" action="/p/${esc(post.id)}/tried" class="inline"><input type="hidden" name="back" value="${esc(back)}">
            <button name="agree" value="yes" class="pill">I agree</button>
            <button name="agree" value="no" class="pill">I disagree</button></form>
        </details>
        <details class="report">
          <summary class="link small">Report</summary>
          <form method="post" action="/p/${esc(post.id)}/report" class="stack small"><input type="hidden" name="back" value="${esc(back)}">
            <select name="reason" required>${REPORT_REASONS.map((r) => `<option>${esc(r)}</option>`).join("")}</select>
            <button class="btn btn-small btn-ghost">Send report</button>
            <span class="muted">Reports are private. A real person reviews every one.</span>
          </form>
        </details>
      </div>`
    : "";
  return `<article class="post card">
  <header class="post-head">
    <a href="/u/${esc(author.handle)}">${avatar(author)}</a>
    <div class="grow">
      <a href="/u/${esc(author.handle)}"><strong>${esc(author.name)}</strong></a> ${trustBadge(d.authorLevel)}
      <div class="muted small">@${esc(author.handle)} · <a href="/p/${esc(post.id)}">${esc(timeAgo(post.createdAt))}</a> · ${esc(post.category)}</div>
    </div>
  </header>
  <h3 class="post-title"><span class="verdict ${v.cls}">${v.label}</span> ${esc(post.title)}</h3>
  <p class="post-body">${esc(post.body).replace(/\n/g, "<br>")}</p>
  <p class="muted small meta">
    ${post.price ? `${esc(post.price)} · ` : ""}${post.buyAgain ? "Would buy again" : "Wouldn't buy again"}
    ${s.tried ? ` · <strong>${s.agree} of ${s.tried}</strong> who tried it agree` : ""}
    ${mine && s.helpful ? ` · ${s.helpful} found this helpful` : ""}
  </p>
  ${linkBlock}
  ${statusNote}
  ${actions}
</article>`;
}

export function feed(opts: {
  user: User;
  tab: "following" | "discover";
  category?: string;
  cards: string[];
  level: TrustLevel;
  followingCount: number;
}): string {
  const { tab, category } = opts;
  const q = (t: string, c?: string) => `/feed?tab=${t}${c ? `&category=${encodeURIComponent(c)}` : ""}`;
  const empty = tab === "following" && opts.followingCount === 0
    ? `<div class="card empty"><h3>Your feed is quiet</h3><p>Follow a few people to fill it up.</p><a class="btn" href="/welcome">Find people to follow</a></div>`
    : `<div class="card empty"><h3>Nothing here yet</h3><p>Be the first to share something${category ? ` in ${esc(category)}` : ""}.</p><a class="btn" href="/new">Recommend something</a></div>`;
  return `
<div class="tabs" role="tablist">
  <a role="tab" aria-selected="${tab === "following"}" href="${q("following", category)}">Following</a>
  <a role="tab" aria-selected="${tab === "discover"}" href="${q("discover", category)}">Discover</a>
</div>
<div class="chips scroll">
  <a class="chip ${!category ? "chip-on" : ""}" href="${q(tab)}">All</a>
  ${CATEGORIES.map((c) => `<a class="chip ${category === c ? "chip-on" : ""}" href="${q(tab, c)}">${esc(c)}</a>`).join("")}
</div>
${tab === "discover" ? `<p class="muted small">Discover shows members who've earned trust, ranked by how helpful people found their posts. Never by money.</p>` : ""}
${opts.cards.join("") || empty}`;
}

export function newPostForm(opts: {
  user: User;
  level: TrustLevel;
  remainingToday: number;
  values?: Record<string, string>;
  problems?: string[];
}): string {
  const v = opts.values ?? {};
  const limits = LIMITS[opts.level];
  const verdict = v.verdict ?? "love";
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
    <label>Price you paid <span class="muted">(optional)</span><input name="price" maxlength="20" placeholder="$14" value="${esc(v.price)}"></label>
    <label>Store link <span class="muted">(optional)</span><input name="url" type="url" maxlength="500" placeholder="https://..." value="${esc(v.url)}">
      <small>${limits.paidLinks
        ? "Links to partner stores become paid links, clearly labeled, and you get " + Math.round(USER_SHARE * 100) + "% of the commission."
        : "New members' links are regular links. Paid links unlock when you become a Member."}</small></label>
    <button class="btn btn-big">Share recommendation</button>
    <p class="muted small">${opts.remainingToday} post${opts.remainingToday === 1 ? "" : "s"} left today. Every post gets a quick automatic check to keep spam out.</p>
  </form>`}
</section>`;
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
  cards: string[];
}): string {
  const { person, viewer } = opts;
  const me = viewer?.id === person.id;
  return `
<section class="profile card">
  ${avatar(person, 72)}
  <div class="grow">
    <h1>${esc(person.name)} ${trustBadge(opts.level)}</h1>
    <p class="muted">@${esc(person.handle)} · joined ${esc(new Date(person.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }))}
      ${person.phoneVerified ? " · ✓ verified person" : ""}</p>
    ${person.bio ? `<p>${esc(person.bio)}</p>` : ""}
    <p class="small"><strong>${opts.stats.livePosts}</strong> recommendations · <strong>${opts.followers}</strong> followers · <strong>${opts.following}</strong> following · <strong>${opts.stats.helpfulFromOthers}</strong> people found them helpful</p>
    ${viewer && !me ? followButton(person, opts.isFollowing, `/u/${person.handle}`) : ""}
  </div>
</section>
${me ? `
<section class="card">
  <h2>Your trust level: ${esc(TRUST_LABELS[opts.level])}</h2>
  <p class="muted small">Trust grows with time and with people finding your posts helpful. It unlocks more posts per day, paid links and a spot in Discover.</p>
  ${opts.nextSteps.length ? `<p>To reach the next level:</p><ul>${opts.nextSteps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : `<p>You've reached the top level. Thank you for making Taste better!</p>`}
  <form method="post" action="/profile" class="stack">
    <label>Short bio<input name="bio" maxlength="120" value="${esc(person.bio)}" placeholder="e.g. Sensitive skin, small budget, big opinions"></label>
    <button class="btn btn-small">Save bio</button>
  </form>
</section>` : ""}
<h2>Recommendations</h2>
${opts.cards.join("") || `<p class="muted">No recommendations yet.</p>`}`;
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
    <td><a href="/p/${esc(e.postId)}">${esc(postTitles.get(e.postId) ?? "Post")}</a></td>
    <td>${money(e.orderAmount)}</td>
    <td>${money(e.userShare)}</td>
    <td><span class="badge status-${esc(e.status)}">${esc(statusLabel[e.status])}</span>${e.status === "pending" ? `<div class="muted small">until ${esc(new Date(e.availableAt).toLocaleDateString())}</div>` : ""}</td>
  </tr>`).join("")}</tbody></table>`
    : `<p class="muted">No earnings yet. That's completely normal! Keep sharing honest recommendations. Earnings come from being genuinely helpful, not from posting more.</p>`}
<p class="muted small"><a href="/trust#earning">How earning works</a></p>`;
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
    <li><strong>Say if you're connected.</strong> If you own, work for or got something free from a brand, say so in your post.</li>
    <li><strong>Be kind.</strong> Criticize products, not people. No harassment, hate or personal attacks.</li>
    <li><strong>Keep it safe.</strong> No dangerous or illegal products, no medical promises, no private information.</li>
    <li><strong>No spam.</strong> No ads, codes, "DM me" or posting the same thing over and over.</li>
  </ol>

  <h2>How we stop spam and fakes</h2>
  <ul>
    <li><strong>Every post is checked</strong> automatically before it goes live. Anything that looks like an ad or a fake is held for a real person to review.</li>
    <li><strong>New members start small:</strong> a few posts a day, regular links only, and posts reach followers first. Limits lift as people find your posts helpful.</li>
    <li><strong>One person, one account.</strong> Phone verification to post, identity verification to get paid.</li>
    <li><strong>Reports are reviewed by people.</strong> If several trusted members report a post, it's hidden until we check it.</li>
    <li><strong>Cheating costs you.</strong> Removed posts lose any earnings that haven't been paid, and serious or repeated abuse ends the account.</li>
  </ul>

  <h2 id="earning">How earning works</h2>
  <ul>
    <li>When you link to one of our partner stores, the link becomes a <strong>Paid link</strong> and is always labeled that way, as the law requires.</li>
    <li>If someone buys through it, the store pays a commission. <strong>You get ${Math.round(USER_SHARE * 100)}%</strong>, and Taste keeps ${Math.round((1 - USER_SHARE) * 100)}% to run the service.</li>
    <li>Earnings wait <strong>${HOLD_DAYS} days</strong> so returns can be handled, then become available. Cash out from ${money(MIN_PAYOUT)}.</li>
    <li>Buying through your own link earns nothing.</li>
    <li>We <strong>never pay for positive reviews</strong>, and how much you earn never affects who sees your posts.</li>
    <li>Paid links are for Members and Trusted members, so brand-new accounts can't be used to farm money.</li>
  </ul>
</section>`;
}

export function adminPage(opts: {
  held: CardData[];
  reports: { id: string; reason: string; createdAt: string; reporter: User; card: CardData; openCount: number }[];
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
    <p class="small"><strong>${esc(r.reason)}</strong> reported by @${esc(r.reporter.handle)} · ${esc(timeAgo(r.createdAt))}${r.openCount > 1 ? ` · ${r.openCount} open reports on this post` : ""}</p>
    ${postCard(r.card, undefined, "/admin")}
    <form method="post" action="/admin/reports/${esc(r.id)}" class="inline">
      <button name="action" value="uphold" class="btn btn-small btn-danger">Uphold &amp; remove post</button>
      <button name="action" value="dismiss" class="btn btn-small btn-ghost">Dismiss</button>
      <button name="action" value="ban" class="btn btn-small btn-ghost">Remove &amp; ban author</button>
    </form>
  </div>`).join("") || `<p class="muted">No open reports.</p>`}

<h2>Demo tools</h2>
<form method="post" action="/admin/simulate-sale" class="inline">
  <button class="btn btn-small btn-ghost">Simulate a sale on a random paid link</button>
</form>
<p class="muted small">In production, sales arrive from the affiliate network at <code>POST /api/conversions</code>.</p>`;
}

export function notFound(): string {
  return `<section class="narrow"><h1>We couldn't find that</h1><p><a href="/">Go home</a></p></section>`;
}
