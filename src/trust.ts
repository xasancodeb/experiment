// Trust levels, posting limits, ranking and payout holds.
//
// Design rule: money never affects reach. Ranking uses only signals from
// other people (helpful votes, "I tried it too"), and a "Skip it" post
// ranks exactly like a "Love it" post with the same signals.
import { data, type Post, type User } from "./store.js";

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
    data.helpful.filter((h) => myPostIds.has(h.postId) && h.userId !== user.id).map((h) => h.userId),
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

export const trustLevel = (user: User, now = Date.now()): TrustLevel =>
  levelFromStats(trustStats(user, now));

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
  const helpful = new Set(
    data.helpful.filter((h) => h.postId === postId && h.userId !== authorId).map((h) => h.userId),
  ).size;
  const tried = data.tried.filter((t) => t.postId === postId && t.userId !== authorId);
  return { helpful, tried: tried.length, agree: tried.filter((t) => t.agree).length };
}

/**
 * Ranking score. Uses only other people's signals plus freshness.
 * Deliberately ignores verdict, paid links and earnings.
 */
export function rankScore(post: Pick<Post, "createdAt">, s: PostSignals, now = Date.now()): number {
  const ageHours = Math.max(0, (now - Date.parse(post.createdAt)) / 3600000);
  const quality = 1 + s.helpful * 2 + s.agree;
  return quality / Math.pow(ageHours + 2, 1.2);
}
