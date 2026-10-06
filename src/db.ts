// Minimal JSON-file store. Good enough for an MVP with a few hundred
// customers; swap for Postgres once revenue justifies it.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type ItemKind = "labor" | "material" | "other";

export interface LineItem {
  description: string;
  kind: ItemKind;
  qty: number;
  unit: string;
  unitPrice: number;
}

export type QuoteStatus = "draft" | "sent" | "viewed" | "accepted" | "declined";

export interface Quote {
  id: string;
  publicId: string;
  userId: string;
  clientName: string;
  clientEmail: string;
  jobAddress: string;
  jobTitle: string;
  description: string;
  lineItems: LineItem[];
  notes: string;
  status: QuoteStatus;
  validDays: number;
  aiGenerated: boolean;
  createdAt: string;
  sentAt?: string;
  viewedAt?: string;
  acceptedAt?: string;
  acceptedBy?: string;
  declinedAt?: string;
  depositPaidAt?: string;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  businessName: string;
  trade: string;
  phone: string;
  location: string;
  hourlyRate: number;
  markupPct: number;
  taxPct: number;
  depositPct: number;
  createdAt: string;
}

interface Schema {
  users: User[];
  quotes: Quote[];
  sessions: Record<string, { userId: string; expiresAt: number }>;
}

const DATA_FILE = process.env.DATA_FILE ?? path.resolve("data/db.json");

function load(): Schema {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as Schema;
  } catch {
    return { users: [], quotes: [], sessions: {} };
  }
}

const state: Schema = load();

export function save(): void {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

export const newId = (bytes = 12): string => crypto.randomBytes(bytes).toString("base64url");

export const db = {
  users: {
    byEmail: (email: string) => state.users.find((u) => u.email === email.toLowerCase().trim()),
    byId: (id: string) => state.users.find((u) => u.id === id),
    insert(user: User) {
      state.users.push(user);
      save();
    },
  },
  quotes: {
    forUser: (userId: string) =>
      state.quotes
        .filter((q) => q.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    byId: (userId: string, id: string) => state.quotes.find((q) => q.id === id && q.userId === userId),
    byPublicId: (publicId: string) => state.quotes.find((q) => q.publicId === publicId),
    insert(quote: Quote) {
      state.quotes.push(quote);
      save();
    },
  },
  sessions: {
    create(userId: string): string {
      const token = newId(32);
      state.sessions[token] = { userId, expiresAt: Date.now() + 30 * 24 * 3600 * 1000 };
      save();
      return token;
    },
    userId(token: string | undefined): string | undefined {
      if (!token) return undefined;
      const s = state.sessions[token];
      if (!s || s.expiresAt < Date.now()) return undefined;
      return s.userId;
    },
    destroy(token: string) {
      delete state.sessions[token];
      save();
    },
  },
};
