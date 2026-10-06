// Every post is checked before it goes live: fast rules first, then an AI
// review when ANTHROPIC_API_KEY is set. The stricter result wins.
//   approve -> live now
//   hold    -> a human moderator looks at it first
//   reject  -> the author gets a friendly explanation and can fix it
import Anthropic from "@anthropic-ai/sdk";
import { data } from "./store.js";

export type Decision = "approve" | "hold" | "reject";

export interface ModerationResult {
  decision: Decision;
  reasons: string[];
  source: "rules" | "ai+rules";
}

export interface Draft {
  title: string;
  category: string;
  verdict: string;
  body: string;
  merchant?: string;
}

const SALESY = [
  "dm me", "message me", "buy now", "limited time", "use my code", "use code", "click here", "link in bio",
  "guaranteed", "100% free", "make money", "earn money", "passive income", "crypto", "forex", "whatsapp",
  "telegram", "act fast", "best price ever", "giveaway", "follow for follow", "f4f",
];

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const rank: Record<Decision, number> = { approve: 0, hold: 1, reject: 2 };
const stricter = (a: Decision, b: Decision): Decision => (rank[a] >= rank[b] ? a : b);

export function ruleCheck(draft: Draft, authorId: string): ModerationResult {
  const reasons: string[] = [];
  let decision: Decision = "approve";
  const flag = (d: Decision, reason: string) => {
    decision = stricter(decision, d);
    reasons.push(reason);
  };
  const body = draft.body.trim();
  const text = `${draft.title} ${body}`;

  if (draft.title.trim().length < 2) flag("reject", "Add the name of the thing you're recommending.");
  if (body.length < 40) {
    flag("reject", "Tell people a bit more: what did you like or not like, and who is it for? (40+ characters)");
  }
  if (body.length > 2000) flag("reject", "Please keep it under 2,000 characters.");
  if (/https?:\/\/|www\.[a-z]/i.test(body)) {
    flag("reject", "Put the store link in the link box instead of the text, so it's labeled properly.");
  }
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text) || /(\+?\d[\d\s().-]{8,}\d)/.test(text)) {
    flag("reject", "Please don't share emails or phone numbers. Keep everyone's details private.");
  }
  const lower = text.toLowerCase();
  const salesy = SALESY.filter((p) => lower.includes(p));
  if (salesy.length) flag("hold", `Sounds like an ad ("${salesy[0]}"). A moderator will take a look.`);

  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.5) {
    flag("hold", "Lots of capital letters. A moderator will take a look.");
  }
  if (/(.)\1{5,}/.test(text) || /[!?]{4,}/.test(text)) {
    flag("hold", "Lots of repeated characters. A moderator will take a look.");
  }

  const norm = normalize(body);
  if (norm.length >= 40) {
    const dupe = data.posts.find((p) => p.status !== "removed" && normalize(p.body) === norm);
    if (dupe) {
      flag(
        dupe.authorId === authorId ? "reject" : "hold",
        dupe.authorId === authorId
          ? "You've already posted this exact text. Write each recommendation fresh."
          : "This text matches someone else's post. A moderator will take a look.",
      );
    }
  }
  return { decision, reasons, source: "rules" };
}

const GUIDELINES = `You review posts for Taste, a friendly app where people share honest
recommendations of products, places and media they have personally used.

Approve posts that read like a real person's genuine experience, positive OR negative.
Negative and mixed reviews are welcome and must never be penalized for their sentiment.

Hold for human review if the post:
- reads like an advertisement, press release, or copy-pasted marketing text
- looks AI-generated or generic rather than based on personal experience
- makes health, medical, or financial claims that could hurt someone
- seems to promote a business the author may own or work for without saying so

Reject if the post:
- is hateful, harassing, sexual, violent, or targets a person
- promotes illegal, dangerous, or age-restricted products
- is clearly spam, a scam, or unrelated to recommending something

Give short, kind reasons written to the author ("you"). If approving, reasons may be empty.`;

const SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["approve", "hold", "reject"] },
    reasons: { type: "array", items: { type: "string" } },
  },
  required: ["decision", "reasons"],
  additionalProperties: false,
} as const;

let client: Anthropic | undefined;

async function aiCheck(draft: Draft): Promise<{ decision: Decision; reasons: string[] } | undefined> {
  if (!process.env.ANTHROPIC_API_KEY) return undefined;
  client ??= new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: GUIDELINES,
      messages: [
        {
          role: "user",
          content: `Review this post.\n\n<post>\nItem: ${draft.title}\nCategory: ${draft.category}\nVerdict: ${draft.verdict}\nStore: ${draft.merchant ?? "none"}\nText: ${draft.body}\n</post>`,
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return { decision: "hold", reasons: ["A moderator will review this post."] };
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return undefined;
    const parsed = JSON.parse(text.text) as { decision: Decision; reasons: string[] };
    return rank[parsed.decision] === undefined ? undefined : parsed;
  } catch (err) {
    // If the AI is unavailable, fall back to the rules alone rather than blocking posting.
    console.error("AI moderation unavailable:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

export async function moderate(draft: Draft, authorId: string): Promise<ModerationResult> {
  const rules = ruleCheck(draft, authorId);
  if (rules.decision === "reject") return rules;
  const ai = await aiCheck(draft);
  if (!ai) return rules;
  return {
    decision: stricter(rules.decision, ai.decision),
    reasons: [...rules.reasons, ...ai.reasons],
    source: "ai+rules",
  };
}
