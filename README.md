# Sway

Ask your trusted friends before you decide. A private social voting site:
post a dilemma to a circle of friends, they vote in one tap, and you get a verdict.

## What is here

| File | What it is |
| --- | --- |
| `index.html` | The whole site (landing page and app) |
| `config.js` | Two settings that switch on real accounts |
| `supabase/schema.sql` | The database tables and privacy rules |
| `vendor/` | The Supabase browser library (v2.45.4), bundled so the site has no outside script dependencies |

## Two modes

**Demo (default).** With `config.js` left empty the site runs entirely in the
visitor's browser. Friends are examples that vote on their own, and nothing is
shared between people.

**Live.** With a Supabase project connected, people sign up with email and
password, create circles, and invite friends with a link. A friend who opens an
invite link can vote straight away as a guest and add an email later.

## Switching on live mode

1. Create a free project at supabase.com.
2. Open the project's SQL editor, paste in all of `supabase/schema.sql`, and run it once.
3. In the project's authentication settings, allow anonymous sign-ins (this is
   what lets invited friends vote as guests). For quick testing you can also
   turn off email confirmation.
4. Copy the project URL and the public anon key into `config.js`.
5. Put the files on any static host (GitHub Pages, Netlify, Vercel). In the
   Supabase authentication settings, add the site's address as the site URL so
   confirmation emails link back to it.

## Privacy rules enforced by the database

- People only see circles they belong to, and the polls, comments and members inside them.
- Nobody can read another person's vote directly. Tallies come from one
  function that applies the poll's settings: sealed results stay hidden until
  voting closes, anonymous polls never reveal who picked what.
- Votes are rejected after closing, from non-members, from the asker, and for options that do not exist.
- Joining a circle is only possible with its invite code.

## Status

The demo mode was tested in a browser. The database rules were tested in a
local Postgres with three pretend users. The live mode was run against the
connected Supabase project with two real browser sessions: email sign-up,
log out and log in, creating a circle, joining from an invite link as a guest,
asking a sealed question, voting, automatic closing, the verdict reveal,
comments, and the "what happened next" update all worked, with live updates
between the two sessions.
