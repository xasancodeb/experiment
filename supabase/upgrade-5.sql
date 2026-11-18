-- Sway upgrade 5: a single voter can vote anonymously, and starred circles are saved.
-- Run this in the Supabase SQL editor, after schema.sql and upgrades 2 to 4.
-- It is safe to run on a database with data, and safe to run more than once.

begin;

-- A vote with hidden = true counts in the totals, but its choice is never shown to anyone else.
alter table public.votes add column if not exists hidden boolean not null default false;

-- Up to three starred circles per person, shown first when asking. Private to that person.
create table if not exists public.circle_stars (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  circle_id uuid not null references public.circles on delete cascade,
  primary key (user_id, circle_id)
);
alter table public.circle_stars enable row level security;
drop policy if exists stars_read on public.circle_stars;
drop policy if exists stars_insert on public.circle_stars;
drop policy if exists stars_delete on public.circle_stars;
create policy stars_read on public.circle_stars for select to authenticated using (user_id = auth.uid());
create policy stars_insert on public.circle_stars for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(circle_id)
              and (select count(*) from public.circle_stars s where s.user_id = auth.uid()) < 3);
create policy stars_delete on public.circle_stars for delete to authenticated using (user_id = auth.uid());

drop function if exists public.poll_states(uuid[]);
create function public.poll_states(ids uuid[])
returns table (poll_id uuid, my_choice int, voted uuid[], counts int[], choices jsonb,
               my_guess int, my_take text, guesses jsonb, takes jsonb, n_voted int, my_picks int[], my_hidden boolean)
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
            from votes v where v.poll_id = p.id and not v.hidden)
    end,
    (select v.guess from votes v where v.poll_id = p.id and v.user_id = auth.uid()),
    (select v.take from votes v where v.poll_id = p.id and v.user_id = auth.uid()),
    case when p.closes_at <= now() and not p.hide_asker
      then (select jsonb_object_agg(v.user_id, v.guess) from votes v where v.poll_id = p.id and v.guess is not null)
    end,
    case when p.closes_at <= now()
      then (select jsonb_agg(jsonb_build_object('t', v.take, 'c', v.choice,
                     'u', case when p.who and not p.anon and not p.hide_asker and not v.hidden then v.user_id end) order by v.updated_at)
            from votes v where v.poll_id = p.id and v.take is not null and v.take <> '')
    end,
    (select count(*)::int from votes v where v.poll_id = p.id),
    (select v.picks from votes v where v.poll_id = p.id and v.user_id = auth.uid()),
    (select v.hidden from votes v where v.poll_id = p.id and v.user_id = auth.uid())
  from polls p
  where p.id = any (ids) and can_see_poll(p.id);
$$;

revoke execute on function public.poll_states(uuid[]) from anon;

commit;
