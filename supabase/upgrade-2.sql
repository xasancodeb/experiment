-- Sway upgrade 2: predictions ("call it"), hot takes and nudges.
-- Run this in the Supabase SQL editor, after schema.sql. It is safe to run on a database with data,
-- and safe to run more than once.

alter table public.votes
  add column if not exists guess int check (guess is null or guess >= 0),
  add column if not exists take text check (take is null or char_length(take) <= 120);

alter table public.polls add column if not exists early boolean not null default false;

-- A prediction must point at an option that exists, like the vote itself.
drop policy if exists votes_insert on public.votes;
drop policy if exists votes_update on public.votes;
create policy votes_insert on public.votes for insert to authenticated
  with check (user_id = auth.uid() and public.vote_ok(poll_id, choice) and public.vote_ok(poll_id, coalesce(guess, 0)));
create policy votes_update on public.votes for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.vote_ok(poll_id, choice) and public.vote_ok(poll_id, coalesce(guess, 0)));

-- One nudge per person per question, sent by the asker to someone who has not voted yet.
create table if not exists public.nudges (
  poll_id uuid not null references public.polls on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  from_user uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, to_user)
);

create or replace function public.nudge_ok(p uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from polls where id = p and author = auth.uid() and closes_at > now())
     and u <> auth.uid()
     and exists (select 1 from poll_circles pc join members m on m.circle_id = pc.circle_id
                 where pc.poll_id = p and m.user_id = u)
     and not exists (select 1 from votes where poll_id = p and user_id = u);
$$;

alter table public.nudges enable row level security;
drop policy if exists nudges_read on public.nudges;
drop policy if exists nudges_insert on public.nudges;
create policy nudges_read on public.nudges for select to authenticated using (to_user = auth.uid() or from_user = auth.uid());
create policy nudges_insert on public.nudges for insert to authenticated
  with check (from_user = auth.uid() and public.nudge_ok(poll_id, to_user));

-- poll_states now also returns:
--   my_guess / my_take  your own prediction and hot take
--   guesses             everyone's predictions, only after closing
--   takes               hot takes with the option they came with, only after closing;
--                       the author's id is left out on anonymous polls and when the asker hid who voted what
drop function if exists public.poll_states(uuid[]);
create function public.poll_states(ids uuid[])
returns table (poll_id uuid, my_choice int, voted uuid[], counts int[], choices jsonb,
               my_guess int, my_take text, guesses jsonb, takes jsonb)
language sql stable security definer set search_path = public as $$
  select p.id,
    (select v.choice from votes v where v.poll_id = p.id and v.user_id = auth.uid()),
    coalesce((select array_agg(v.user_id) from votes v where v.poll_id = p.id), '{}'),
    case when p.closes_at <= now()
           or (p.live and (p.author = auth.uid()
               or exists (select 1 from votes v where v.poll_id = p.id and v.user_id = auth.uid())))
      then (select array_agg(coalesce(t.n, 0) order by i)
            from generate_series(0, jsonb_array_length(p.opts) - 1) i
            left join (select choice, count(*)::int n from votes where votes.poll_id = p.id group by choice) t
              on t.choice = i)
    end,
    case when p.closes_at <= now() and p.who and not p.anon
      then (select jsonb_object_agg(v.user_id, v.choice) from votes v where v.poll_id = p.id)
    end,
    (select v.guess from votes v where v.poll_id = p.id and v.user_id = auth.uid()),
    (select v.take from votes v where v.poll_id = p.id and v.user_id = auth.uid()),
    case when p.closes_at <= now()
      then (select jsonb_object_agg(v.user_id, v.guess) from votes v where v.poll_id = p.id and v.guess is not null)
    end,
    case when p.closes_at <= now()
      then (select jsonb_agg(jsonb_build_object('t', v.take, 'c', v.choice,
                     'u', case when p.who and not p.anon then v.user_id end) order by v.updated_at)
            from votes v where v.poll_id = p.id and v.take is not null and v.take <> '')
    end
  from polls p
  where p.id = any (ids) and can_see_poll(p.id);
$$;
revoke execute on function public.poll_states(uuid[]) from anon;

-- A poll runs until its deadline. Only when the asker switched on "end early" does it
-- end 30 seconds after every member who can vote has voted. The short delay lets the
-- last voter call the winner and add a hot take, and gives everyone a countdown.
create or replace function public.close_if_complete(p uuid) returns void
language sql security definer set search_path = public as $$
  update polls set closes_at = now() + interval '30 seconds'
  where id = p and early and closes_at > now() + interval '30 seconds' and type <> 'open' and can_see_poll(p)
    and (select count(*) from votes where poll_id = p) > 0
    and (select count(*) from votes where poll_id = p) >=
        (select count(distinct m.user_id) from poll_circles pc join members m on m.circle_id = pc.circle_id
         where pc.poll_id = p and m.user_id <> polls.author);
$$;
revoke execute on function public.close_if_complete(uuid) from anon;
