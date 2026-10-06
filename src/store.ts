// JSON-file store. Fine for a prototype and the first few thousand users;
// move to Postgres before a public launch.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type Verdict = "love" | "fine" | "skip";
export type PostStatus = "live" | "held" | "removed";
export type EarningStatus = "pending" | "available" | "paid" | "forfeited" | "reversed";

export interface User {
  id: string;
  handle: string;
  name: string;
  email: string;
  passwordHash: string;
  bio: string;
  interests: string[];
  role: "member" | "admin";
  phoneVerified: boolean;
  idVerified: boolean;
  banned: boolean;
  createdAt: string;
  pledgeAcceptedAt: string;
  foundingMember?: boolean;
  invitedBy?: string;
  /** Express opt-in for the weekly digest email, as Canada's anti-spam law (CASL) requires. */
  emailDigest?: boolean;
  emailDigestConsentAt?: string;
}

export interface Post {
  id: string;
  authorId: string;
  title: string;
  category: string;
  verdict: Verdict;
  buyAgain: boolean;
  body: string;
  price?: string;
  url?: string;
  merchant?: string;
  paidLink: boolean;
  /** Author owns, works for, or got this free from the brand (must be disclosed). */
  brandConnection?: boolean;
  status: PostStatus;
  moderation: { source: "rules" | "ai+rules"; reasons: string[] };
  createdAt: string;
}

export interface Report {
  id: string;
  postId: string;
  reporterId: string;
  reason: string;
  status: "open" | "upheld" | "dismissed";
  createdAt: string;
}

export interface Click {
  id: string;
  postId: string;
  userId?: string;
  selfClick: boolean;
  createdAt: string;
}

export interface Earning {
  id: string;
  userId: string;
  postId: string;
  clickId: string;
  orderAmount: number;
  commission: number;
  userShare: number;
  status: EarningStatus;
  createdAt: string;
  availableAt: string;
}

export interface List {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  postIds: string[];
  createdAt: string;
}

export type NoticeKind = "follow" | "helpful" | "tried" | "approved" | "removed" | "earning";

export interface Notice {
  id: string;
  userId: string;
  kind: NoticeKind;
  text: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface Invite {
  code: string;
  ownerId: string;
  usedBy?: string;
}

interface Schema {
  users: User[];
  posts: Post[];
  follows: { followerId: string; followeeId: string }[];
  helpful: { postId: string; userId: string; createdAt?: string }[];
  tried: { postId: string; userId: string; agree: boolean }[];
  reports: Report[];
  clicks: Click[];
  earnings: Earning[];
  lists: List[];
  notices: Notice[];
  invites: Invite[];
  sessions: Record<string, { userId: string; expiresAt: number }>;
}

const empty = (): Schema => ({
  users: [],
  posts: [],
  follows: [],
  helpful: [],
  tried: [],
  reports: [],
  clicks: [],
  earnings: [],
  lists: [],
  notices: [],
  invites: [],
  sessions: {},
});

const DATA_FILE = process.env.DATA_FILE ?? path.resolve("data/db.json");

function load(): Schema {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
  } catch {
    return empty();
  }
}

export const data: Schema = load();

/** Bumped on every write so derived values (like trust levels) can be cached safely. */
export let version = 0;

export function save(): void {
  version++;
  if (process.env.DATA_FILE === ":memory:") return;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

export const newId = (bytes = 9): string => crypto.randomBytes(bytes).toString("base64url");

export const userById = (id: string | undefined) => data.users.find((u) => u.id === id);
export const userByHandle = (handle: string) =>
  data.users.find((u) => u.handle.toLowerCase() === handle.toLowerCase());
export const userByEmail = (email: string) =>
  data.users.find((u) => u.email === email.toLowerCase().trim());
export const postById = (id: string) => data.posts.find((p) => p.id === id);

export const listById = (id: string) => data.lists.find((l) => l.id === id);

export const isFollowing = (followerId: string, followeeId: string) =>
  data.follows.some((f) => f.followerId === followerId && f.followeeId === followeeId);

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

/** In-app notification. Never notify people about their own actions. */
export function notify(userId: string, kind: NoticeKind, text: string, link: string): void {
  data.notices.push({ id: newId(), userId, kind, text, link, read: false, createdAt: new Date().toISOString() });
  // Keep the newest 200 per person so the file doesn't grow forever.
  const mine = data.notices.filter((n) => n.userId === userId);
  if (mine.length > 200) {
    const drop = new Set(mine.slice(0, mine.length - 200).map((n) => n.id));
    data.notices = data.notices.filter((n) => !drop.has(n.id));
  }
}

export function createSession(userId: string): string {
  const token = newId(32);
  data.sessions[token] = { userId, expiresAt: Date.now() + 30 * 24 * 3600 * 1000 };
  save();
  return token;
}

export function sessionUser(token: string | undefined): User | undefined {
  if (!token) return undefined;
  const s = data.sessions[token];
  if (!s || s.expiresAt < Date.now()) return undefined;
  const user = userById(s.userId);
  return user && !user.banned ? user : undefined;
}

export function destroySession(token: string | undefined): void {
  if (token && data.sessions[token]) {
    delete data.sessions[token];
    save();
  }
}
