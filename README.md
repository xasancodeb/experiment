# Taste

**Honest recommendations from people you trust.** Share what you love, what's fine and
what to skip, and follow people whose taste you trust. Optionally, members get 70% of
the commission when someone buys through their clearly labeled paid link.

This is a working prototype. See [RESEARCH.md](RESEARCH.md) for the market research,
the risks that could kill the project, how each one is handled, and what's still needed
before launch.

## Run it

Requires Node.js 22+.

```bash
npm install
npm start          # Phase 1 launch mode: earnings OFF   → http://localhost:3000
npm run demo       # Everything on, including earnings
```

The first run fills the app with demo content. Log in as:

| Account | Email | Password |
|---|---|---|
| Regular member | `demo@taste.demo` | `demo1234` |
| Moderator | `admin@taste.demo` | `admin1234` |

To start from scratch, delete `data/db.json`. Set `SEED_DEMO=0` to skip demo content.

## Launch switches

| Variable | What it does |
|---|---|
| `EARNINGS=on` | Turns on paid links, the earnings page and payouts. **Leave off until affiliate networks and payouts are approved.** |
| `INVITE_ONLY=1` | Sign-up needs an invite code. Every member gets 5 codes at `/invite`. |
| `FOUNDING_LIMIT` | How many of the first members get the Founding member badge (default 100) |
| `PUBLIC_URL` | The site's real address, used for search engines and invite links |
| `ANTHROPIC_API_KEY` | Adds AI review of every post on top of the built-in spam rules |
| `CONVERSION_SECRET` | Shared secret the affiliate network sends to report sales at `POST /api/conversions` |
| `PORT` | Port to listen on (default 3000) |
| `NODE_ENV=production` | Marks cookies secure (HTTPS only) |

**Suggested Phase 1 launch:** `INVITE_ONLY=1 PUBLIC_URL=https://your-domain npm start`

## Checks

```bash
npm test           # trust, spam, fake-vote, link and earnings protections
npm run typecheck
```

## How the code is organized

| File | What it does |
|---|---|
| `src/server.ts` | Pages and actions: sign-up, feeds, search, posts, lists, alerts, settings, moderation |
| `src/trust.ts` | Trust levels, vote rules, ranking, top picks, reporter credibility |
| `src/moderation.ts` | Spam and safety checks, plus optional AI review |
| `src/links.ts` | Link safety and the partner-store list |
| `src/earnings.ts` | Click tracking, commissions, holds, forfeits and cash-out |
| `src/views.ts` | All page HTML |
| `src/config.ts` | Launch switches |
| `src/store.ts` | Data storage (a JSON file for now) |
| `src/seed.ts` | Demo content |
