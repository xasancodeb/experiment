// Launch switches, all set through environment variables.

/**
 * Phase 1 launches with earnings OFF: no paid links, no earnings pages.
 * Turn on with EARNINGS=on once affiliate networks and payouts are approved.
 */
export const EARNINGS_ON = process.env.EARNINGS === "on";

/** Invite-only signup for a controlled founding launch. */
export const INVITE_ONLY = process.env.INVITE_ONLY === "1";

/** The first this-many members get a permanent Founding member badge. */
export const FOUNDING_LIMIT = Number(process.env.FOUNDING_LIMIT ?? 100);

export const INVITES_PER_MEMBER = 5;

/** Public address, used for links in search engines and shared previews. */
export const PUBLIC_URL = (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
