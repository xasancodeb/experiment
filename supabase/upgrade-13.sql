-- Sway upgrade 13: what's needed to ship.
--   * Delete account (required by the App Store and Google Play).
--   * Report content and block people (required for apps where people post).
--   * First-party analytics and error logs: kept in this database, never sent to another company.
--     Only the site owner can read them (Supabase SQL editor or Table Editor).
-- Safe to run more than once.
begin;

-- ---------- delete my account ----------
-- Circles you own pass to the member who joined earliest; a circle with nobody else is deleted.
-- Everything else of yours (profile, questions, votes, comments, business) goes with the account.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c record; nxt uuid;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  for c in select id from circles where owner = uid loop
    select user_id into nxt from members where circle_id = c.id and user_id <> uid order by joined_at limit 1;
    if nxt is null then delete from circles where id = c.id;
    else update circles set owner = nxt where id = c.id; end if;
  end loop;
  delete from auth.users where id = uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- reports ----------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references auth.users on delete cascade,
  poll_id uuid references public.polls on delete set null,
  comment_id uuid references public.comments on delete set null,
  about_user uuid references auth.users on delete set null,
  reason text not null check (char_length(reason) between 2 and 40),
  details text check (details is null or char_length(details) <= 500),
  created_at timestamptz not null default now(),
  resolved boolean not null default false
);
alter table public.reports enable row level security;
revoke select, update, delete on public.reports from authenticated, anon;
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check (reporter = auth.uid());

-- ---------- blocks ----------
create table if not exists public.blocks (
  blocker uuid not null default auth.uid() references auth.users on delete cascade,
  blocked uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

-- ---------- analytics events ----------
create table if not exists public.events (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  name text not null check (char_length(name) between 2 and 40),
  props jsonb check (props is null or pg_column_size(props) < 2000)
);
create index if not exists events_at on public.events (at);
create index if not exists events_user on public.events (user_id, at);
alter table public.events enable row level security;
revoke select, update, delete on public.events from authenticated, anon;
drop policy if exists events_insert on public.events;
drop policy if exists events_insert_anon on public.events;
create policy events_insert on public.events for insert to authenticated with check (user_id = auth.uid());
create policy events_insert_anon on public.events for insert to anon
  with check (user_id is null and name in ('landing_view', 'invite_view', 'question_link_view', 'business_view'));

-- ---------- error logs ----------
create table if not exists public.client_errors (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  message text check (message is null or char_length(message) <= 500),
  stack text check (stack is null or char_length(stack) <= 2000),
  url text check (url is null or char_length(url) <= 300),
  ua text check (ua is null or char_length(ua) <= 300)
);
alter table public.client_errors enable row level security;
revoke select, update, delete on public.client_errors from authenticated, anon;
drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- ---------- numbers for the site owner (not reachable from the app) ----------
create or replace view public.metrics_daily as
  select date_trunc('day', at)::date as day,
    count(distinct user_id) as active_people,
    count(*) filter (where name = 'signup') as signups,
    count(*) filter (where name = 'guest_join') as guests_joined,
    count(*) filter (where name = 'invite_view') as invite_link_views,
    count(*) filter (where name = 'circle_create') as circles_created,
    count(*) filter (where name = 'ask') as questions_asked,
    count(*) filter (where name = 'vote') as votes,
    count(*) filter (where name = 'comment') as comments,
    count(*) filter (where name = 'reveal') as results_revealed
  from public.events group by 1 order by 1 desc;

create or replace view public.metrics_retention as
  with firsts as (select user_id, min(at)::date as first_day from public.events where user_id is not null group by user_id),
  days as (select distinct user_id, at::date as d from public.events where user_id is not null)
  select f.first_day as cohort_day, count(*) as new_people,
    round(100.0 * count(*) filter (where exists (select 1 from days x where x.user_id = f.user_id and x.d = f.first_day + 1)) / count(*), 1) as came_back_next_day_pct,
    round(100.0 * count(*) filter (where exists (select 1 from days x where x.user_id = f.user_id and x.d between f.first_day + 7 and f.first_day + 13)) / count(*), 1) as came_back_week_2_pct
  from firsts f group by 1 order by 1 desc;

create or replace view public.metrics_errors as
  select date_trunc('day', at)::date as day, left(message, 120) as message, count(*) as times, count(distinct user_id) as people, max(at) as last_seen
  from public.client_errors group by 1, 2 order by 1 desc, 3 desc;

revoke all on public.metrics_daily, public.metrics_retention, public.metrics_errors from anon, authenticated;

notify pgrst, 'reload schema';
commit;
