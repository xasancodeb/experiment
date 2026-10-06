// Click tracking and commissions.
//
// Anti-abuse rules:
//  - clicking your own link never earns anything
//  - earnings are held HOLD_DAYS (covers store returns) before they can be paid
//  - removed posts and banned accounts forfeit what hasn't been paid yet
//  - cashing out needs a verified identity, and one identity = one payout account
import { data, newId, postById, save, userById, type Earning } from "./store.js";
import { HOLD_DAYS, MIN_PAYOUT, USER_SHARE } from "./trust.js";

const DAY = 24 * 3600 * 1000;

export function recordClick(postId: string, userId: string | undefined): string | undefined {
  const post = postById(postId);
  if (!post || post.status !== "live" || !post.url) return undefined;
  const click = {
    id: newId(),
    postId,
    userId,
    selfClick: userId === post.authorId,
    createdAt: new Date().toISOString(),
  };
  data.clicks.push(click);
  save();
  return click.id;
}

export type ConversionResult =
  | { ok: true; earning: Earning }
  | { ok: false; reason: string };

/** Called by the affiliate network when a tracked click turns into a sale. */
export function recordConversion(clickId: string, orderAmount: number, commission: number, now = Date.now()): ConversionResult {
  const click = data.clicks.find((c) => c.id === clickId);
  if (!click) return { ok: false, reason: "unknown click" };
  if (click.selfClick) return { ok: false, reason: "self-purchase: no commission" };
  if (data.earnings.some((e) => e.clickId === clickId)) return { ok: false, reason: "already recorded" };
  const post = postById(click.postId);
  if (!post || !post.paidLink) return { ok: false, reason: "not a paid link" };
  const author = userById(post.authorId);
  if (!author || author.banned) return { ok: false, reason: "author not eligible" };
  if (!(commission >= 0) || !(orderAmount >= 0)) return { ok: false, reason: "bad amounts" };

  const earning: Earning = {
    id: newId(),
    userId: author.id,
    postId: post.id,
    clickId,
    orderAmount,
    commission,
    userShare: Math.round(commission * USER_SHARE * 100) / 100,
    status: "pending",
    createdAt: new Date(now).toISOString(),
    availableAt: new Date(now + HOLD_DAYS * DAY).toISOString(),
  };
  data.earnings.push(earning);
  save();
  return { ok: true, earning };
}

/** Moves held earnings forward (or forfeits them) based on the current state. */
export function settleEarnings(now = Date.now()): void {
  let changed = false;
  for (const e of data.earnings) {
    if (e.status !== "pending" && e.status !== "available") continue;
    const post = postById(e.postId);
    const user = userById(e.userId);
    if (!post || post.status === "removed" || !user || user.banned) {
      e.status = "forfeited";
      changed = true;
    } else if (e.status === "pending" && Date.parse(e.availableAt) <= now) {
      e.status = "available";
      changed = true;
    }
  }
  if (changed) save();
}

export interface EarningsSummary {
  pending: number;
  available: number;
  paid: number;
  forfeited: number;
  canCashOut: boolean;
  blocker?: string;
  items: Earning[];
}

const sum = (xs: Earning[]) => Math.round(xs.reduce((t, e) => t + e.userShare, 0) * 100) / 100;

export function summary(userId: string): EarningsSummary {
  settleEarnings();
  const items = data.earnings.filter((e) => e.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const by = (s: Earning["status"]) => items.filter((e) => e.status === s);
  const available = sum(by("available"));
  const user = userById(userId);
  let blocker: string | undefined;
  if (!user?.idVerified) blocker = "Verify your identity to cash out.";
  else if (available < MIN_PAYOUT) blocker = `You can cash out once you have $${MIN_PAYOUT} available.`;
  return {
    pending: sum(by("pending")),
    available,
    paid: sum(by("paid")),
    forfeited: sum(by("forfeited")),
    canCashOut: !blocker,
    blocker,
    items,
  };
}

export function cashOut(userId: string): boolean {
  const s = summary(userId);
  if (!s.canCashOut) return false;
  // Production: create a Stripe Connect transfer to the member's verified account here.
  for (const e of s.items) if (e.status === "available") e.status = "paid";
  save();
  return true;
}
