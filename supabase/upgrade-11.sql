-- Sway upgrade 11: places compete for a group's choice, only when the group asks for it.
-- The asker types the places themselves. If they switch on "let these places make us an offer",
-- every listed place that is on the app (approved, same name) gets a request:
-- "a group of 6 is choosing between you and 2 other places". Each place decides whether to
-- send an offer; it shows on that place's answer. If that place wins, the group unlocks a code.
-- Places see the group's size, how many places they compete with and when it closes. Never the
-- question, names, votes or the other places. Safe to run more than once.
begin;

alter table public.polls add column if not exists want_offers boolean not null default false;
grant select (want_offers) on public.polls to authenticated;

create table if not exists public.offer_requests (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls on delete cascade,
  business_id uuid not null references public.businesses on delete cascade,
  opt_index int not null,
  created_at timestamptz not null default now(),
  unique (poll_id, business_id)
);
alter table public.offer_requests enable row level security;   -- reached only through the functions below

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.offer_requests on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  details text check (details is null or char_length(details) <= 200),
  min_group int not null default 1 check (min_group between 1 and 50),
  min_spend numeric check (min_spend is null or min_spend between 0 and 100000),
  created_at timestamptz not null default now()
);
alter table public.bids enable row level security;

alter table public.claims add column if not exists bid_id uuid references public.bids on delete set null;
-- For the fee per group that uses a code (free during launch; recorded for later).
alter table public.claims add column if not exists fee_cents int;

create or replace function public.norm_name(t text) returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '', 'g')
$$;

-- The asker invites the places they listed. Returns how many places were invited.
create or replace function public.request_offers(p uuid) returns int
language plpgsql security definer set search_path = public as $$
declare q polls; n int := 0; i int; b record;
begin
  select * into q from polls where id = p;
  if q.id is null or q.author <> auth.uid() then raise exception 'Not your question'; end if;
  if not q.want_offers or q.type <> 'choice' or q.closes_at <= now() then return 0; end if;
  for i in 0 .. jsonb_array_length(q.opts) - 1 loop
    for b in select id from businesses where verified and norm_name(name) = norm_name(q.opts -> i ->> 't') and norm_name(name) <> '' loop
      insert into offer_requests (poll_id, business_id, opt_index) values (p, b.id, i) on conflict do nothing;
      if found then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;

-- A place's inbox. Only what it needs to decide: group size, how many places, when it closes.
create or replace function public.business_requests()
returns table (request_id uuid, created_at timestamptz, closes_at timestamptz, group_size int, other_places int,
               bid_title text, bid_details text, won boolean, closed boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.created_at, p.closes_at,
    (select count(distinct m.user_id)::int from poll_circles pc join members m on m.circle_id = pc.circle_id where pc.poll_id = p.id),
    greatest(jsonb_array_length(p.opts) - 1, 0),
    bd.title, bd.details,
    p.closes_at <= now() and winning_index(p.id) = r.opt_index,
    p.closes_at <= now()
  from offer_requests r join polls p on p.id = r.poll_id left join bids bd on bd.request_id = r.id
  where r.business_id = public.my_business()
  order by (p.closes_at > now()) desc, p.closes_at
  limit 100
$$;

-- A place answers a request while voting is open (once; it can't change it after).
create or replace function public.send_bid(r uuid, t text, d text, g int, s numeric) returns void
language plpgsql security definer set search_path = public as $$
declare rq offer_requests;
begin
  select * into rq from offer_requests where id = r;
  if rq.id is null or rq.business_id <> public.my_business() then raise exception 'Not your request'; end if;
  if (select closes_at from polls where id = rq.poll_id) <= now() then raise exception 'Voting has closed'; end if;
  insert into bids (request_id, title, details, min_group, min_spend)
    values (r, t, nullif(trim(d), ''), greatest(1, least(coalesce(g, 1), 50)), s);
exception when unique_violation then raise exception 'You already sent an offer for this group';
end $$;

-- The group sees the offers made to its own questions.
create or replace function public.poll_bids(ids uuid[])
returns table (poll_id uuid, opt_index int, business_name text, title text, details text, min_group int, min_spend numeric)
language sql stable security definer set search_path = public as $$
  select r.poll_id, r.opt_index, b.name, bd.title, bd.details, bd.min_group, bd.min_spend
  from offer_requests r join bids bd on bd.request_id = r.id join businesses b on b.id = r.business_id
  where r.poll_id = any(ids)
    and exists (select 1 from poll_circles pc where pc.poll_id = r.poll_id and is_member(pc.circle_id))
$$;

-- The code: the winning answer's offer, one per question, shared by the circle.
drop function if exists public.claim_offer(uuid);
create or replace function public.claim_offer(p uuid)
returns table (code text, title text, details text, min_group int, min_spend numeric,
               business_name text, address text, redeemed boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare q polls; w int; rq offer_requests; bd bids; c claims;
begin
  select * into q from polls where id = p;
  if q.id is null or not exists (select 1 from poll_circles pc where pc.poll_id = p and is_member(pc.circle_id)) then
    raise exception 'Not your question';
  end if;
  if q.closes_at > now() then raise exception 'Voting is still open'; end if;
  w := winning_index(p);
  if w is null then raise exception 'There was no single winner'; end if;
  select r.* into rq from offer_requests r join bids b on b.request_id = r.id where r.poll_id = p and r.opt_index = w limit 1;
  if rq.id is null then raise exception 'The winner made no offer'; end if;
  select * into bd from bids where request_id = rq.id;
  select * into c from claims where poll_id = p;
  if c.id is null then
    insert into claims (poll_id, business_id, bid_id, code)
      values (p, rq.business_id, bd.id, 'SWAY-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)))
      on conflict (poll_id) do nothing;
    select * into c from claims where poll_id = p;
  end if;
  return query select c.code, bd.title, bd.details, bd.min_group, bd.min_spend,
    (select name from businesses where id = c.business_id), (select bz.address from businesses bz where bz.id = c.business_id),
    c.redeemed_at is not null;
end $$;

-- Totals for the place: requests received, offers sent, wins, codes unlocked and used.
drop function if exists public.business_stats();
create or replace function public.business_stats()
returns table (requests bigint, offered bigint, won bigint, claimed bigint, redeemed bigint)
language sql stable security definer set search_path = public as $$
  with me as (select public.my_business() id)
  select (select count(*) from offer_requests r, me where r.business_id = me.id),
         (select count(*) from offer_requests r join bids b on b.request_id = r.id, me where r.business_id = me.id),
         (select count(*) from offer_requests r join polls p on p.id = r.poll_id, me where r.business_id = me.id and p.closes_at <= now() and winning_index(p.id) = r.opt_index),
         (select count(*) from claims, me where claims.business_id = me.id),
         (select count(*) from claims, me where claims.business_id = me.id and redeemed_at is not null)
$$;

-- redeem_code now reports the offer from the bid.
create or replace function public.redeem_code(c text)
returns table (ok boolean, message text, offer_title text, group_size int)
language plpgsql security definer set search_path = public as $$
declare cl claims; me uuid := public.my_business(); t text;
begin
  if me is null then return query select false, 'Create your business first', null::text, null::int; return; end if;
  select * into cl from claims where code = upper(trim(c));
  if cl.id is null or cl.business_id <> me then return query select false, 'This code isn''t for your business', null::text, null::int; return; end if;
  t := coalesce((select title from bids where id = cl.bid_id), (select title from offers where id = cl.offer_id));
  if cl.redeemed_at is not null then
    return query select false, 'Already used on ' || to_char(cl.redeemed_at, 'DD Mon at HH24:MI'), t, (select count(*)::int from votes where poll_id = cl.poll_id); return;
  end if;
  update claims set redeemed_at = now() where id = cl.id;
  return query select true, 'Valid. Marked as used.', t, (select count(*)::int from votes where poll_id = cl.poll_id);
end $$;

-- Who owns the places invited to a question (for the notification sender).
revoke execute on function public.request_offers(uuid), public.business_requests(), public.send_bid(uuid, text, text, int, numeric),
  public.poll_bids(uuid[]), public.claim_offer(uuid), public.business_stats(), public.redeem_code(text) from public, anon;
grant execute on function public.request_offers(uuid), public.business_requests(), public.send_bid(uuid, text, text, int, numeric),
  public.poll_bids(uuid[]), public.claim_offer(uuid), public.business_stats(), public.redeem_code(text) to authenticated;

notify pgrst, 'reload schema';
commit;
