-- Sway maintenance. Two separate parts; run each one on purpose.

-- ============================================================================
-- Part 1: daily clean-up, so the privacy policy's promises hold.
-- Usage numbers are kept up to 13 months, error reports up to 90 days.
-- Runs every night at 03:17 UTC. Run this once.
-- ============================================================================
select cron.schedule('sway-cleanup', '17 3 * * *', $cron$
  delete from public.events where at < now() - interval '13 months';
  delete from public.client_errors where at < now() - interval '90 days';
$cron$);


-- ============================================================================
-- Part 2: remove the accounts created while testing before launch.
-- Deletes accounts whose email starts with "sway.test." and guest accounts that
-- only ever joined circles made by those test accounts. Their circles, questions,
-- votes, comments and businesses go with them. Real accounts are not touched.
-- First run the SELECT to see what would be removed; then run the DELETE.
-- ============================================================================

-- Preview:
with test_users as (
  select id from auth.users where email like 'sway.test.%'
), test_circles as (
  select c.id from public.circles c where c.owner in (select id from test_users)
), test_guests as (
  select u.id from auth.users u
  where u.is_anonymous
    and exists (select 1 from public.members m where m.user_id = u.id)
    and not exists (select 1 from public.members m where m.user_id = u.id and m.circle_id not in (select id from test_circles))
)
select (select count(*) from test_users) as test_accounts,
       (select count(*) from test_guests) as test_guests,
       (select count(*) from test_circles) as test_circles;

-- Delete (uncomment to run):
-- with test_users as (
--   select id from auth.users where email like 'sway.test.%'
-- ), test_circles as (
--   select c.id from public.circles c where c.owner in (select id from test_users)
-- ), test_guests as (
--   select u.id from auth.users u
--   where u.is_anonymous
--     and exists (select 1 from public.members m where m.user_id = u.id)
--     and not exists (select 1 from public.members m where m.user_id = u.id and m.circle_id not in (select id from test_circles))
-- )
-- delete from auth.users where id in (select id from test_users union select id from test_guests);
