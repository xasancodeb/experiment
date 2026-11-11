-- Sway database for Supabase.
-- Run this whole file once in the Supabase SQL editor of a new project.
-- Every table is locked down with row level security: people only ever see
-- circles they belong to, and the polls, votes and comments inside them.

create extension if not exists pgcrypto;

-- ---------- tables ----------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text,
  created_at timestamptz not null default now()
);

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);

create table public.members (
  circle_id uuid not null references public.circles on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references auth.users on delete cascade,
  q text not null check (char_length(q) between 3 and 200),
  note text not null default '',
  type text not null check (type in ('choice', 'photo', 'open')),
  opts jsonb not null default '[]',
  closes_at timestamptz not null,
  anon boolean not null default false,
  live boolean not null default true,
  who boolean not null default true,
  decided boolean,
  outcome jsonb,
  created_at timestamptz not null default now()
);

create table public.poll_circles (
  poll_id uuid not null references public.polls on delete cascade,
  circle_id uuid not null references public.circles on delete cascade,
  primary key (poll_id, circle_id)
);

create table public.votes (
  poll_id uuid not null references public.polls on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  choice int not null check (choice >= 0),
  updated_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create index on public.members (user_id);
create index on public.poll_circles (circle_id);
create index on public.comments (poll_id, created_at);

-- ---------- helpers (run with the definer's rights so policies can't recurse) ----------

create function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where circle_id = c and user_id = auth.uid());
$$;

create function public.can_see_poll(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from polls where id = p and author = auth.uid())
      or exists (select 1 from poll_circles pc join members m on m.circle_id = pc.circle_id
                 where pc.poll_id = p and m.user_id = auth.uid());
$$;

create function public.shares_circle(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select u = auth.uid() or exists (
    select 1 from members a join members b on a.circle_id = b.circle_id
    where a.user_id = auth.uid() and b.user_id = u);
$$;

create function public.owns_poll(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from polls where id = p and author = auth.uid());
$$;

-- A vote is allowed while the poll is open, by a circle member who is not the asker,
-- for an option that exists.
create function public.vote_ok(p uuid, c int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from polls
    where id = p and closes_at > now() and author <> auth.uid()
      and type <> 'open' and c < jsonb_array_length(opts))
    and exists (select 1 from poll_circles pc join members m on m.circle_id = pc.circle_id
                where pc.poll_id = p and m.user_id = auth.uid());
$$;

-- The person who creates a circle becomes its first member.
create function public.add_owner_as_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into members (circle_id, user_id) values (new.id, new.owner) on conflict do nothing;
  return new;
end $$;

create trigger circles_add_owner after insert on public.circles
for each row execute function public.add_owner_as_member();

-- ---------- row level security ----------

alter table public.profiles enable row level security;
alter table public.circles enable row level security;
alter table public.members enable row level security;
alter table public.polls enable row level security;
alter table public.poll_circles enable row level security;
alter table public.votes enable row level security;
alter table public.comments enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (public.shares_circle(id));
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy circles_read on public.circles for select to authenticated using (owner = auth.uid() or public.is_member(id));
create policy circles_insert on public.circles for insert to authenticated with check (owner = auth.uid());
create policy circles_update on public.circles for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy circles_delete on public.circles for delete to authenticated using (owner = auth.uid());

-- Joining happens only through join_circle(); leaving is allowed for yourself, removing for the owner.
create policy members_read on public.members for select to authenticated using (public.is_member(circle_id));
create policy members_delete on public.members for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.circles c where c.id = circle_id and c.owner = auth.uid()));

create policy polls_read on public.polls for select to authenticated using (author = auth.uid() or public.can_see_poll(id));
create policy polls_insert on public.polls for insert to authenticated with check (author = auth.uid());
create policy polls_update on public.polls for update to authenticated using (author = auth.uid()) with check (author = auth.uid());
create policy polls_delete on public.polls for delete to authenticated using (author = auth.uid());

create policy poll_circles_read on public.poll_circles for select to authenticated using (public.is_member(circle_id));
create policy poll_circles_insert on public.poll_circles for insert to authenticated
  with check (public.is_member(circle_id) and public.owns_poll(poll_id));

-- Nobody can read another person's vote row directly. Tallies come from poll_states(),
-- which applies the anonymous / sealed / show-who rules on the server.
create policy votes_read on public.votes for select to authenticated using (user_id = auth.uid());
create policy votes_insert on public.votes for insert to authenticated with check (user_id = auth.uid() and public.vote_ok(poll_id, choice));
create policy votes_update on public.votes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.vote_ok(poll_id, choice));

create policy comments_read on public.comments for select to authenticated using (public.can_see_poll(poll_id));
create policy comments_insert on public.comments for insert to authenticated with check (user_id = auth.uid() and public.can_see_poll(poll_id));
create policy comments_delete on public.comments for delete to authenticated using (user_id = auth.uid());

-- ---------- functions the site calls ----------

-- Join a circle with its invite code. Returns the circle id.
create function public.join_circle(c text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into cid from circles where code = upper(trim(c));
  if cid is null then raise exception 'No circle has that invite code'; end if;
  insert into members (circle_id, user_id) values (cid, auth.uid()) on conflict do nothing;
  return cid;
end $$;

-- What an invite link shows before someone signs in: the circle's name and who owns it.
create function public.circle_preview(c text)
returns table (name text, owner_name text, members int)
language sql stable security definer set search_path = public as $$
  select ci.name, coalesce(p.name, 'A friend'),
         (select count(*)::int from members m where m.circle_id = ci.id)
  from circles ci left join profiles p on p.id = ci.owner
  where ci.code = upper(trim(c));
$$;

-- Everything the site may know about each poll's votes, for the person asking:
--   my_choice  your own vote
--   voted      who has voted (never what they picked)
--   counts     votes per option, only once you are allowed to see results
--   choices    who picked what, only after closing and only if the asker allowed it
create function public.poll_states(ids uuid[])
returns table (poll_id uuid, my_choice int, voted uuid[], counts int[], choices jsonb)
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
    end
  from polls p
  where p.id = any (ids) and can_see_poll(p.id);
$$;

-- Close a poll early once every member who can vote has voted.
create function public.close_if_complete(p uuid) returns void
language sql security definer set search_path = public as $$
  update polls set closes_at = now()
  where id = p and closes_at > now() and type <> 'open' and can_see_poll(p)
    and (select count(*) from votes where poll_id = p) > 0
    and (select count(*) from votes where poll_id = p) >=
        (select count(distinct m.user_id) from poll_circles pc join members m on m.circle_id = pc.circle_id
         where pc.poll_id = p and m.user_id <> polls.author);
$$;

revoke execute on function public.join_circle(text), public.poll_states(uuid[]), public.close_if_complete(uuid) from anon;
grant execute on function public.circle_preview(text) to anon, authenticated;
