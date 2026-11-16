-- Sway upgrade 3: plans with RSVPs, match mode and anonymous asking.
-- Run this in the Supabase SQL editor, after schema.sql and upgrade-2.sql.
-- It is safe to run on a database with data, and safe to run more than once.

-- Everything below runs as one unit: if any step fails, nothing is changed.
begin;

-- ---------- new columns and table ----------

alter table public.polls
  add column if not exists plan jsonb,                                  -- what the group locked in after the verdict
  add column if not exists hide_asker boolean not null default false;   -- asked anonymously

alter table public.votes
  add column if not exists picks int[];                                 -- match mode: every option this person said yes to

alter table public.polls drop constraint if exists polls_type_check;
alter table public.polls add constraint polls_type_check check (type in ('choice', 'photo', 'open', 'match'));

create table if not exists public.rsvps (
  poll_id uuid not null references public.polls on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  going boolean not null,
  updated_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

alter table public.rsvps enable row level security;
drop policy if exists rsvps_read on public.rsvps;
drop policy if exists rsvps_insert on public.rsvps;
drop policy if exists rsvps_update on public.rsvps;
create policy rsvps_read on public.rsvps for select to authenticated using (public.can_see_poll(poll_id));
create policy rsvps_insert on public.rsvps for insert to authenticated with check (user_id = auth.uid() and public.can_see_poll(poll_id));
create policy rsvps_update on public.rsvps for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_see_poll(poll_id));

-- ---------- match mode: picks must point at options that exist ----------

create or replace function public.picks_ok(p uuid, pk int[]) returns boolean
language sql stable security definer set search_path = public as $$
  select pk is null or not exists (
    select 1 from unnest(pk) x, polls where polls.id = p and (x < 0 or x >= jsonb_array_length(polls.opts)));
$$;

drop policy if exists votes_insert on public.votes;
drop policy if exists votes_update on public.votes;
create policy votes_insert on public.votes for insert to authenticated
  with check (user_id = auth.uid() and public.vote_ok(poll_id, choice) and public.vote_ok(poll_id, coalesce(guess, 0)) and public.picks_ok(poll_id, picks));
create policy votes_update on public.votes for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.vote_ok(poll_id, choice) and public.vote_ok(poll_id, coalesce(guess, 0)) and public.picks_ok(poll_id, picks));

-- ---------- anonymous asking ----------
-- The asker's id must never reach other people's browsers. Three things enforce that:
--   1. nobody can read the polls.author column directly any more;
--   2. questions are loaded through my_polls(), which blanks the author of an anonymous
--      question for everyone but the asker;
--   3. poll_states() hides who has voted on an anonymous question, because the one
--      member who never votes would be the asker.

revoke select on public.polls from authenticated, anon;
grant select (id, q, note, type, opts, closes_at, anon, live, who, early, decided, outcome,
              created_at, tb_user, tb_choice, plan, hide_asker)
  on public.polls to authenticated;

create or replace function public.my_polls()
returns table (poll jsonb, circles uuid[])
language sql stable security definer set search_path = public as $$
  select (to_jsonb(p) - 'author') || jsonb_build_object(
           'author', case when p.hide_asker and p.author <> auth.uid() then null else p.author end,
           'mine', p.author = auth.uid()),
         array_agg(pc.circle_id)
  from polls p
  join poll_circles pc on pc.poll_id = p.id
  join members m on m.circle_id = pc.circle_id and m.user_id = auth.uid()
  group by p.id;
$$;

-- An anonymous question needs a circle big enough that the asker cannot be guessed.
create or replace function public.anon_ok(p uuid, c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from polls where id = p and hide_asker)
      or (select count(*) from members where circle_id = c) >= 5;
$$;

drop policy if exists poll_circles_insert on public.poll_circles;
create policy poll_circles_insert on public.poll_circles for insert to authenticated
  with check (public.is_member(circle_id) and public.owns_poll(poll_id) and public.anon_ok(poll_id, circle_id));

-- A nudge shows who sent it, so the asker of an anonymous question cannot nudge.
create or replace function public.nudge_ok(p uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from polls where id = p and author = auth.uid() and closes_at > now() and not hide_asker)
     and u <> auth.uid()
     and exists (select 1 from poll_circles pc join members m on m.circle_id = pc.circle_id
                 where pc.poll_id = p and m.user_id = u)
     and not exists (select 1 from votes where poll_id = p and user_id = u);
$$;

create or replace function public.poll_preview(code_in text, poll_in uuid)
returns table (question text, options jsonb, asker_name text, circle_name text, closes_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.q,
         (select coalesce(jsonb_agg(x.o ->> 't' order by x.ord), '[]'::jsonb)
          from jsonb_array_elements(p.opts) with ordinality as x(o, ord)),
         case when p.hide_asker then 'Someone' else coalesce(pr.name, 'A friend') end, ci.name, p.closes_at
  from circles ci
  join poll_circles pc on pc.circle_id = ci.id
  join polls p on p.id = pc.poll_id
  left join profiles pr on pr.id = p.author
  where ci.code = upper(trim(code_in)) and p.id = poll_in;
$$;

-- ---------- poll_states: match counts, and nothing that could identify an anonymous asker ----------
--   n_voted    how many have voted (always)
--   voted      who has voted; on an anonymous question only your own id
--   counts     votes per option, or in match mode how many said yes to each option
--   my_picks   your own yes list in match mode
--   choices    who picked what (a number, or a yes list in match mode); never on anonymous questions

drop function if exists public.poll_states(uuid[]);
create function public.poll_states(ids uuid[])
returns table (poll_id uuid, my_choice int, voted uuid[], counts int[], choices jsonb,
               my_guess int, my_take text, guesses jsonb, takes jsonb, n_voted int, my_picks int[])
language sql stable security definer set search_path = public as $$
  select p.id,
    (select v.choice from votes v where v.poll_id = p.id and v.user_id = auth.uid()),
    coalesce((select array_agg(v.user_id) from votes v
              where v.poll_id = p.id and (not p.hide_asker or v.user_id = auth.uid())), '{}'),
    case when p.closes_at <= now()
           or (p.live and p.type <> 'match' and (p.author = auth.uid()
               or exists (select 1 from votes v where v.poll_id = p.id and v.user_id = auth.uid())))
      then (select array_agg(coalesce(t.n, 0) order by i)
            from generate_series(0, jsonb_array_length(p.opts) - 1) i
            left join (
              select c, count(*)::int n from (
                select v.choice as c from votes v where v.poll_id = p.id and p.type <> 'match'
                union all
                select x from votes v, unnest(coalesce(v.picks, '{}')) x where v.poll_id = p.id and p.type = 'match') s
              group by c) t on t.c = i)
    end,
    case when p.closes_at <= now() and p.who and not p.anon and not p.hide_asker
      then (select jsonb_object_agg(v.user_id,
                     case when p.type = 'match' then to_jsonb(coalesce(v.picks, '{}')) else to_jsonb(v.choice) end)
            from votes v where v.poll_id = p.id)
    end,
    (select v.guess from votes v where v.poll_id = p.id and v.user_id = auth.uid()),
    (select v.take from votes v where v.poll_id = p.id and v.user_id = auth.uid()),
    case when p.closes_at <= now() and not p.hide_asker
      then (select jsonb_object_agg(v.user_id, v.guess) from votes v where v.poll_id = p.id and v.guess is not null)
    end,
    case when p.closes_at <= now()
      then (select jsonb_agg(jsonb_build_object('t', v.take, 'c', v.choice,
                     'u', case when p.who and not p.anon and not p.hide_asker then v.user_id end) order by v.updated_at)
            from votes v where v.poll_id = p.id and v.take is not null and v.take <> '')
    end,
    (select count(*)::int from votes v where v.poll_id = p.id),
    (select v.picks from votes v where v.poll_id = p.id and v.user_id = auth.uid())
  from polls p
  where p.id = any (ids) and can_see_poll(p.id);
$$;

revoke execute on function public.poll_states(uuid[]), public.my_polls() from anon;
grant execute on function public.poll_preview(text, uuid) to anon, authenticated;

commit;
