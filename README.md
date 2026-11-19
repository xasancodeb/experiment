# Sway

Ask your trusted friends before you decide. A private social voting site:
post a dilemma to a circle of friends, they vote in one tap, and you get a verdict.

## What is here

| File | What it is |
| --- | --- |
| `index.html` | The whole site (landing page and app) |
| `config.js` | Two settings that switch on real accounts |
| `supabase/schema.sql` | The database tables and privacy rules |
| `supabase/upgrade-2.sql` | Adds predictions, hot takes, nudges, end-early, the tiebreaker and question previews |
| `supabase/upgrade-3.sql` | Adds plans with RSVPs, match mode and anonymous asking |
| `supabase/upgrade-4.sql` | Adds the tables for push notifications |
| `supabase/upgrade-5.sql` | Adds starred circles (up to 3 each) and voting anonymously on any question |
| `supabase/upgrade-6.sql` | Lets the asker switch private votes off for a question (enforced by the database) |
| `supabase/upgrade-7.sql` | Lets each person choose whose questions and votes notify them |
| `supabase/upgrade-8.sql` | Lets each person mute circles they aren't interested in |
| `supabase/upgrade-9.sql` | Private votes are off unless the asker switches them on |
| `supabase/upgrade-10.sql` | Places make offers to groups: businesses, offers, codes |
| `supabase/upgrade-11.sql` | Offers only from the places a group listed, when the group asks |
| `supabase/upgrade-12.sql` | Contact details on business applications |
| `business/` | The page businesses apply on (send this link to places) |
| `supabase/upgrade-13.sql` | Delete account, reports, blocks, usage numbers and error logs |
| `supabase/maintenance.sql` | Daily clean-up of old usage data, and removal of test accounts |
| `privacy/`, `terms/` | Privacy policy and terms of use (drafts: have them checked) |
| `tests/`, `.github/workflows/test.yml` | Automatic checks that GitHub runs on every push |
| `supabase/functions/notify/` | The notification sender (a Supabase Edge Function, no libraries) |
| `sw.js` | Shows notifications on a device and opens the question when one is tapped |
| `manifest.json`, `icon-*.png`, `apple-touch-icon.png` | Lets people add Sway to their phone's home screen |
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
   Then do the same with `supabase/upgrade-2.sql`. It adds predictions, hot takes, nudges, the
   end-early switch, the tiebreaker and the preview shown on shared question links. Until it has
   been run, those features stay hidden and everything else works. It is safe to run more than once.
   Then run `supabase/upgrade-3.sql` the same way. It adds plans with RSVPs, match mode and
   anonymous asking, and it changes how questions are loaded so that the asker of an anonymous
   question never reaches other people's browsers. Deploy the site files before running it.
   Then run `supabase/upgrade-5.sql`. It adds starred circles and lets each voter choose to vote
   anonymously; a private vote is counted in the totals but its choice never leaves the database.
   Then run `supabase/upgrade-6.sql`, which lets the asker switch private votes off per question,
   then `supabase/upgrade-7.sql` and `supabase/upgrade-8.sql`, which let each person choose whose
   activity and which circles notify them.
   Finally `supabase/upgrade-9.sql`: private votes are off unless the asker switches them on.
   Then `supabase/upgrade-10.sql` and `supabase/upgrade-11.sql` for business offers (see below).
3. In the project's authentication settings, allow anonymous sign-ins (this is
   what lets invited friends vote as guests). For quick testing you can also
   turn off email confirmation.
4. Copy the project URL and the public anon key into `config.js`.
5. In the Supabase authentication settings, set the site URL to the site's address. Password
   reset emails link back to it.
6. Put the files on any static host (GitHub Pages, Netlify, Vercel). In the
   Supabase authentication settings, add the site's address as the site URL so
   confirmation emails link back to it.

## Push notifications

People switch them on per device (on iPhone the site has to be added to the Home Screen
first). The asker's browser tells the sender when they ask, nudge, lock in a plan, hand
over a tiebreak or share what happened next; the sender checks the caller really is the
asker and sends to the rest of the circle. Notifications are kept few on purpose:

- Friends: "X asked", then the verdict, but only for questions they voted on. Friends who
  haven't voted get one last call 15 minutes before it closes (and any nudge).
- The asker: the first vote at once, then at most one roundup every 30 minutes, then
  "Everyone has voted" (skipped when the question ends itself, since the verdict follows).
- Never what anyone picked. Between 10pm and 8am on the phone's own clock they arrive
  silently where the phone allows it.

A verdict goes out the moment a question is ended early; a once-a-minute timer handles
deadlines, roundups and last calls. Anyone can mute circles (on the circle's page) and choose
to hear only from certain friends (You → Notifications); nudges and results of their own
questions always come through.

Set up, once per project:

1. Run `supabase/upgrade-4.sql`.
2. Create a VAPID key pair. Put the public key in `config.js` as `vapid`, and set these
   function secrets: `VAPID_PUBLIC`, `VAPID_PRIVATE_JWK`, `VAPID_SUBJECT`, `SITE_URL`,
   and `CRON_SECRET` (any long random string).
3. Deploy `supabase/functions/notify` with JWT verification off (it checks callers itself).
4. Schedule the timer. The secret is kept in the project's encrypted vault, not in the job:

   ```sql
   create extension if not exists pg_net;
   create extension if not exists pg_cron;
   select vault.create_secret('YOUR_CRON_SECRET', 'sway_cron_secret');
   select cron.schedule('sway-notify-tick', '* * * * *', $$
     select net.http_post(
       url := 'https://YOUR-PROJECT.supabase.co/functions/v1/notify',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-sway-cron',
                    (select decrypted_secret from vault.decrypted_secrets where name = 'sway_cron_secret')),
       body := '{"kind":"tick"}'::jsonb,
       timeout_milliseconds := 25000)
   $$);
   ```

Never commit the private key or the cron secret.

## Business offers (switched off until places have joined)

Places compete for a group's choice, only when the group asks for it:

1. The asker types the places themselves (for example "Luigi's" or "Sakura") and switches on
   **Let these places make us an offer**. It's off by default. There's never a list of places.
2. Every listed place that's on the app (approved, same name) gets a request and a
   notification: "A group of 6 is choosing: you and 2 other places".
3. The place sends an offer (one tap with a saved offer, or a new one). It shows on that
   place's answer for the group.
4. If that place wins, the circle unlocks one code (SWAY-XXXXXX) to show at the counter, and
   the place checks it once on its business page.

- **Switching it on for everyone:** add `offers: true` to `config.js`. Until then the switch is
  hidden. To try it on one device, open the site with `?offers=on` (and `?offers=off` to
  stop).
- **Businesses apply** on the business page: the site address followed by `/business/`. It
  explains the offer, shows pricing, and has the application form (business name, type, city,
  address, website or Instagram, phone, contact name, email and password). Applying creates the
  account and a business waiting for approval. The app's landing page links to it, and places
  manage requests and codes in the app (You → For businesses, or the address with `?business`).
- **Inviting places:** send them the business page with a short note, for example: "Groups of
  friends are choosing where to go on Sway. When they're deciding between you and other places,
  you get a request and can send an offer to win them. Free during launch: <link>".
- **Approving businesses:** in Supabase open Table Editor → `businesses` and tick `verified`.
  Owners can't approve themselves.
- **What places see:** the group's size, how many places they're up against and when the
  group decides. Never the question, names, votes or the other places.
- **Earning:** free during launch. Each used code is recorded (`claims`, with an empty
  `fee_cents`) so a fee per group that uses a code can be charged later.

## Safety, numbers and legal

- **Delete account:** You tab → Delete account. Everything of theirs goes; circles they made pass
  to the member who joined first.
- **Report and block:** "Report" on any question or comment by someone else, with an option to
  block them. Blocked people's questions and comments are hidden; they aren't told. Reports
  arrive in Supabase → Table Editor → `reports` (mark `resolved` when handled).
- **Usage numbers and errors** are stored in this database only, never sent to another
  company, and readable only by you. In Supabase → SQL editor:
  `select * from metrics_daily;` (activity per day), `select * from metrics_retention;`
  (how many new people came back the next day and in week 2), `select * from metrics_errors;`
  (what broke on people's devices).
- **Legal:** `privacy/` and `terms/` describe how the app actually works. They're drafts, not
  legal advice; have a lawyer check them before a big launch.
- **Support email:** put one in `config.js` as `support: "you@example.com"`. It appears in the
  app (You tab) and on the legal pages. App stores require a way to contact you.
- **Maintenance:** run part 1 of `supabase/maintenance.sql` once, so old usage data is deleted
  as the privacy policy promises. Part 2 removes the test accounts.

## Privacy rules enforced by the database

- People only see circles they belong to, and the polls, comments and members inside them.
- Nobody can read another person's vote directly. Tallies come from one
  function that applies the poll's settings: sealed results stay hidden until
  voting closes, anonymous polls never reveal who picked what.
- Votes are rejected after closing, from non-members, from the asker, and for options that do not exist.
- Joining a circle is only possible with its invite code.

## Status

Tested against the connected Supabase project with real browser sessions:

- Two people: email sign-up, log out and log in, creating a circle, joining from an
  invite link as a guest, asking, voting, the deadline holding, the verdict reveal,
  comments, and the "what happened next" update.
- Three people, after `upgrade-2.sql`: the guided start, a shared question link where
  a guest taps an answer and joins, predictions, a hot take, a nudge, the end-early
  countdown, a tie, the tiebreaker, and the reveal showing who called it.

- Five people, after `upgrade-3.sql`: an anonymous question in a circle of five (the
  responses sent to a voter carried no asker id and only the voter's own id among the
  voters), totals-only turnout, a plan with RSVPs, and a match question that ended
  30 seconds after the last pick and revealed the one option everyone said yes to.

Venue offers exist only as made-up examples in the demo. There are no venue accounts.

Push notifications: the encryption matches the RFC 8291 example, and the deployed sender
was run against the project (permission checks, no repeats, real calls to Google's and
Mozilla's push services with fake devices, which were rejected and forgotten as expected).
Delivery to a real phone has not been confirmed yet.

Not yet tested: password reset with a real email, and the site on a physical phone.
