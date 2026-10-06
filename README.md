# Taste

**Honest recommendations from people you trust.** Share what you love, what's fine and
what to skip. When someone buys through your clearly labeled paid link, you get 70% of
the store's commission.

This is a working prototype. See [RESEARCH.md](RESEARCH.md) for the market research,
the risks, how each one is handled, and what's still needed before launch.

## Run it

Requires Node.js 22+.

```bash
npm install
npm start          # http://localhost:3000
```

The first run fills the app with demo content. Log in as:

| Account | Email | Password |
|---|---|---|
| Regular member (has earnings) | `demo@taste.demo` | `demo1234` |
| Moderator | `admin@taste.demo` | `admin1234` |

To start from scratch, delete `data/db.json`. Set `SEED_DEMO=0` to skip demo content.

### Optional settings

| Variable | What it does |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on AI review of every post, on top of the built-in rules |
| `CONVERSION_SECRET` | Shared secret the affiliate network must send to report sales at `POST /api/conversions` |
| `PORT` | Port to listen on (default 3000) |
| `NODE_ENV=production` | Marks cookies secure (HTTPS only) |

## Checks

```bash
npm test           # trust, spam, link and earnings protections
npm run typecheck
```

## How the code is organized

| File | What it does |
|---|---|
| `src/server.ts` | Pages and actions (sign-up, feed, posting, reports, earnings, moderation) |
| `src/trust.ts` | Trust levels, posting limits, ranking, payout hold and split |
| `src/moderation.ts` | Spam and safety checks, plus optional AI review |
| `src/links.ts` | Link safety and the partner-store list |
| `src/earnings.ts` | Click tracking, commissions, holds, forfeits and cash-out |
| `src/views.ts` | All page HTML |
| `src/store.ts` | Data storage (a JSON file for now) |
| `src/seed.ts` | Demo content |
