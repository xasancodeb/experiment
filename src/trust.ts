// Trust levels, posting limits, ranking and payout holds.
//
// Design rules:
//  - Reach is earned through followers and helpfulness, never bought with money.
//  - Ranking ignores the verdict, so a "Skip it" post ranks exactly like a
//    "Love it" post with the same signals (also required by the FTC review rule).
//  - Only votes from established, verified accounts count, so fake-account
//    rings can't vote each other up.
import { data, version, type Post, type User } from "./store.js";

const DAY = 24 * 3600 * 1000;

export type TrustLevel = 0 | 1 | 2;

export const TRUST_LABELS: Record<TrustLevel, string> = {
  0: "New member",
  1: "Member",
  2: "Trusted",
};

export interface Limits {
  postsPerDay: number;
  paidLinks: boolean;
  inDiscover: boolean;
}

export const LIMITS: Record<TrustLevel, Limits> = {
  0: { postsPerDay: 3, paidLinks: false, inDiscover: false },
  1: { postsPerDay: 10, paidLinks: true, inDiscover: true },
  2: { postsPerDay: 25, paidLinks: true, inDiscover: true },
};

/** Commission split: the person who recommended gets the larger share. */
export const USER_SHARE = 0.7;
/** Earnings wait out the store's return window before they can be paid. */
export const HOLD_DAYS = 45;
export const MIN_PAYOUT = 20;
/** A voter's account must be at least this old for their votes to count. */
export const VOTER_MIN_AGE_DAYS = 3;
/** Minimum helpful votes before a post can appear in Top picks. */
export const TOP_PICK_MIN_HELPFUL = 3;

const established = new Map<string, boolean>();
let establishedVersion = -1;

/** Votes only count from phone-verified, non-banned accounts a few days old. */
export function isEstablishedVoter(userId: string, now = Date.now()): boolean {
  if (establishedVersion !== version) {
    established.clear();
    establishedVersion = version;
  }
  let ok = established.get(userId);
  if (ok === undefined) {
    const u = data.users.find((x) => x.id === userId);
    ok = Boolean(u && u.phoneVerified && !u.banned && now - Date.parse(u.createdAt) >= VOTER_MIN_AGE_DAYS * DAY);
    established.set(userId, ok);
  }
  return ok;
}

export interface TrustStats {
  ageDays: number;
  livePosts: number;
  helpfulFromOthers: number;
  upheldReports30d: number;
  upheldReports90d: number;
}

export function trustStats(user: User, now = Date.now()): TrustStats {
  const myPosts = data.posts.filter((p) => p.authorId === user.id);
  const myPostIds = new Set(myPosts.map((p) => p.id));
  const helpers = new Set(
    data.helpful
      .filter((h) => myPostIds.has(h.postId) && h.userId !== user.id && isEstablishedVoter(h.userId, now))
      .map((h) => h.userId),
  );
  const upheld = data.reports.filter((r) => r.status === "upheld" && myPostIds.has(r.postId));
  const since = (days: number) => upheld.filter((r) => now - Date.parse(r.createdAt) < days * DAY).length;
  return {
    ageDays: Math.floor((now - Date.parse(user.createdAt)) / DAY),
    livePosts: myPosts.filter((p) => p.status === "live").length,
    helpfulFromOthers: helpers.size,
    upheldReports30d: since(30),
    upheldReports90d: since(90),
  };
}

export function levelFromStats(s: TrustStats): TrustLevel {
  let level: TrustLevel = 0;
  if (s.ageDays >= 7 && s.livePosts >= 3 && s.helpfulFromOthers >= 5) level = 1;
  if (level === 1 && s.ageDays >= 30 && s.livePosts >= 10 && s.helpfulFromOthers >= 20 && s.upheldReports90d === 0) {
    level = 2;
  }
  // A recent upheld report costs a level, so bad behaviour has an immediate price.
  if (s.upheldReports30d > 0 && level > 0) level = (level - 1) as TrustLevel;
  return level;
}

const levelCache = new Map<string, TrustLevel>();
let levelCacheVersion = -1;

/** Cached until the next data change, so feeds stay fast as the app grows. */
export function trustLevel(user: User, now = Date.now()): TrustLevel {
  if (levelCacheVersion !== version) {
    levelCache.clear();
    levelCacheVersion = version;
  }
  let level = levelCache.get(user.id);
  if (level === undefined) {
    level = levelFromStats(trustStats(user, now));
    levelCache.set(user.id, level);
  }
  return level;
}

/** What a member still needs for the next level, in plain words. */
export function nextLevelSteps(s: TrustStats, level: TrustLevel): string[] {
  if (level === 0) {
    return [
      s.ageDays < 7 && `Be a member for 7 days (${s.ageDays} so far)`,
      s.livePosts < 3 && `Share 3 recommendations (${s.livePosts} so far)`,
      s.helpfulFromOthers < 5 && `Get "helpful" from 5 different people (${s.helpfulFromOthers} so far)`,
    ].filter((x): x is string => Boolean(x));
  }
  if (level === 1) {
    return [
      s.ageDays < 30 && `Be a member for 30 days (${s.ageDays} so far)`,
      s.livePosts < 10 && `Share 10 recommendations (${s.livePosts} so far)`,
      s.helpfulFromOthers < 20 && `Get "helpful" from 20 different people (${s.helpfulFromOthers} so far)`,
      s.upheldReports90d > 0 && "Go 90 days without a post being removed",
    ].filter((x): x is string => Boolean(x));
  }
  return [];
}

export function postsToday(userId: string, now = Date.now()): number {
  return data.posts.filter((p) => p.authorId === userId && now - Date.parse(p.createdAt) < DAY).length;
}

export interface PostSignals {
  helpful: number;
  tried: number;
  agree: number;
}

export function signals(postId: string, authorId: string): PostSignals {
  const counts = (userId: string) => userId !== authorId && isEstablishedVoter(userId);
  const helpful = new Set(data.helpful.filter((h) => h.postId === postId && counts(h.userId)).map((h) => h.userId)).size;
  const tried = data.tried.filter((t) => t.postId === postId && counts(t.userId));
  return { helpful, tried: tried.length, agree: tried.filter((t) => t.agree).length };
}

/**
 * Discover ranking: other people's signals plus freshness.
 * Deliberately ignores verdict, paid links and earnings.
 */
export function rankScore(post: Pick<Post, "createdAt">, s: PostSignals, now = Date.now()): number {
  const ageHours = Math.max(0, (now - Date.parse(post.createdAt)) / 3600000);
  const quality = 1 + s.helpful * 2 + s.agree;
  return quality / Math.pow(ageHours + 2, 1.2);
}

/**
 * Top picks: all-time usefulness with no freshness decay, so a great review
 * keeps being found (and keeps earning) for months. Disagreement from people
 * who tried it pulls a post down.
 */
export function topScore(s: PostSignals): number {
  const disagree = s.tried - s.agree;
  return s.helpful * 2 + s.agree - disagree * 1.5;
}

/**
 * A reporter whose reports are mostly dismissed loses the power to
 * auto-hide posts, which stops competitors from mass-reporting good posts.
 */
export function isCredibleReporter(userId: string): boolean {
  const mine = data.reports.filter((r) => r.reporterId === userId);
  const dismissed = mine.filter((r) => r.status === "dismissed").length;
  const upheld = mine.filter((r) => r.status === "upheld").length;
  return !(dismissed >= 3 && dismissed > upheld);
}
