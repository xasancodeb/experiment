// Run with DATA_FILE=:memory: so nothing touches disk (see package.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { data, newId, type Post, type User } from "../src/store.js";
import { levelFromStats, rankScore, LIMITS } from "../src/trust.js";
import { checkLink } from "../src/links.js";
import { ruleCheck } from "../src/moderation.js";
import { recordClick, recordConversion, settleEarnings } from "../src/earnings.js";

const DAY = 24 * 3600 * 1000;

function user(extra: Partial<User> = {}): User {
  const u: User = {
    id: newId(), handle: `u${newId(3)}`, name: "Test User", email: `${newId()}@x.test`, passwordHash: "", bio: "",
    interests: [], role: "member", phoneVerified: true, idVerified: true, banned: false,
    createdAt: new Date(Date.now() - 60 * DAY).toISOString(), pledgeAcceptedAt: new Date().toISOString(), ...extra,
  };
  data.users.push(u);
  return u;
}

function post(author: User, extra: Partial<Post> = {}): Post {
  const p: Post = {
    id: newId(), authorId: author.id, title: "Thing", category: "Tech", verdict: "love", buyAgain: true,
    body: "A perfectly ordinary honest review that is long enough to pass.", url: "https://www.target.com/p/x",
    merchant: "Target", paidLink: true, status: "live", moderation: { source: "rules", reasons: [] },
    createdAt: new Date().toISOString(), ...extra,
  };
  data.posts.push(p);
  return p;
}

const stats = { ageDays: 60, livePosts: 12, helpfulFromOthers: 25, upheldReports30d: 0, upheldReports90d: 0 };

test("brand-new accounts start at the lowest level with no paid links", () => {
  assert.equal(levelFromStats({ ...stats, ageDays: 1 }), 0);
  assert.equal(LIMITS[0].paidLinks, false);
  assert.equal(LIMITS[0].inDiscover, false);
});

test("trust grows with time and other people's helpful votes", () => {
  assert.equal(levelFromStats({ ...stats, helpfulFromOthers: 5, livePosts: 3, ageDays: 8 }), 1);
  assert.equal(levelFromStats(stats), 2);
});

test("an upheld report costs a level right away", () => {
  assert.equal(levelFromStats({ ...stats, upheldReports30d: 1, upheldReports90d: 1 }), 0);
  assert.equal(levelFromStats({ ...stats, helpfulFromOthers: 6, livePosts: 3, upheldReports30d: 1, upheldReports90d: 1 }), 0);
});

test("ranking is identical for positive and negative posts with the same signals", () => {
  const createdAt = new Date().toISOString();
  const s = { helpful: 4, tried: 3, agree: 2 };
  assert.equal(rankScore({ createdAt }, s), rankScore({ createdAt }, s));
  assert.ok(rankScore({ createdAt }, { ...s, helpful: 10 }) > rankScore({ createdAt }, s));
});

test("links: shorteners, http, and IPs are refused; tracking codes are stripped", () => {
  assert.equal(checkLink("https://bit.ly/abc").ok, false);
  assert.equal(checkLink("http://target.com/x").ok, false);
  assert.equal(checkLink("https://127.0.0.1/x").ok, false);
  const c = checkLink("https://www.target.com/p/x?tag=hijack-20&utm_source=ad&color=red");
  assert.equal(c.ok, true);
  assert.equal(c.partner, true);
  assert.equal(c.url, "https://www.target.com/p/x?color=red");
});

test("links: Amazon is never a paid-link partner", () => {
  const c = checkLink("https://www.amazon.com/dp/B000");
  assert.equal(c.ok, true);
  assert.equal(c.partner, false);
});

test("moderation: ads are held, contact details and links-in-text are rejected", () => {
  const author = user();
  const base = { title: "Earbuds", category: "Tech", verdict: "love" };
  assert.equal(ruleCheck({ ...base, body: "Great earbuds, honestly. DM me for a discount code before they sell out" }, author.id).decision, "hold");
  assert.equal(ruleCheck({ ...base, body: "Great earbuds, call me at +1 555 123 4567 if you want a pair cheap" }, author.id).decision, "reject");
  assert.equal(ruleCheck({ ...base, body: "Great earbuds, buy them here https://example.com it is a good deal" }, author.id).decision, "reject");
  assert.equal(ruleCheck({ ...base, body: "Too short" }, author.id).decision, "reject");
});

test("moderation: honest negative reviews pass", () => {
  const author = user();
  const r = ruleCheck({ title: "Blender", category: "Home", verdict: "skip", body: "Loud, leaked after a month, and the lid cracked. I returned it and would not buy again." }, author.id);
  assert.equal(r.decision, "approve");
});

test("moderation: copied text is caught", () => {
  const a = user();
  const b = user();
  const body = "This exact sentence was written by somebody else and copied word for word here.";
  post(a, { body });
  assert.equal(ruleCheck({ title: "Thing", category: "Tech", verdict: "love", body }, b.id).decision, "hold");
  assert.equal(ruleCheck({ title: "Thing", category: "Tech", verdict: "love", body }, a.id).decision, "reject");
});

test("earnings: buying through your own link earns nothing", () => {
  const author = user();
  const p = post(author);
  const clickId = recordClick(p.id, author.id)!;
  const r = recordConversion(clickId, 100, 8);
  assert.equal(r.ok, false);
});

test("earnings: a sale is credited once, held, then released", () => {
  const author = user();
  const buyer = user();
  const p = post(author);
  const clickId = recordClick(p.id, buyer.id)!;
  const t0 = Date.now();
  const r = recordConversion(clickId, 100, 8, t0);
  assert.ok(r.ok);
  assert.equal(r.earning.userShare, 5.6);
  assert.equal(recordConversion(clickId, 100, 8).ok, false, "duplicate postbacks are ignored");
  settleEarnings(t0 + 10 * DAY);
  assert.equal(r.earning.status, "pending");
  settleEarnings(t0 + 46 * DAY);
  assert.equal(r.earning.status, "available");
});

test("earnings: removed posts and banned accounts forfeit unpaid earnings", () => {
  const author = user();
  const buyer = user();
  const p = post(author);
  const r = recordConversion(recordClick(p.id, buyer.id)!, 50, 4);
  assert.ok(r.ok);
  p.status = "removed";
  settleEarnings();
  assert.equal(r.earning.status, "forfeited");

  const cheater = user();
  const p2 = post(cheater);
  const r2 = recordConversion(recordClick(p2.id, buyer.id)!, 50, 4);
  assert.ok(r2.ok);
  cheater.banned = true;
  settleEarnings();
  assert.equal(r2.earning.status, "forfeited");
});

test("earnings: non-paid links never earn", () => {
  const author = user();
  const buyer = user();
  const p = post(author, { paidLink: false });
  assert.equal(recordConversion(recordClick(p.id, buyer.id)!, 50, 4).ok, false);
});
