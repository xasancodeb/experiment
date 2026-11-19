-- Sway upgrade 10: places make offers to groups.
-- A business (restaurant, cafe, shop...) posts offers for groups. Someone asking their circle
-- "where should we go?" can add places as answers; each place's offer shows on its answer.
-- When a place wins, the circle unlocks one code to show at the counter.
-- Businesses only ever see numbers (appeared, won, codes claimed and used), never questions,
-- names or votes. A business's offers appear only after the site owner sets verified = true
-- (Supabase: Table Editor -> businesses). Safe to run more than once.
begin;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null unique default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  category text not null default 'food' check (category in ('food','cafe','bar','shop','fun','beauty','other')),
  city text not null check (char_length(city) between 2 and 40),
  address text check (address is null or char_length(address) <= 120),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.businesses enable row level security;
revoke insert, update on public.businesses from authenticated, anon;
grant insert (name, category, city, address) on public.businesses to authenticated;
grant update (name, category, city, address) on public.businesses to authenticated;
drop policy if exists businesses_read on public.businesses;
drop policy if exists businesses_insert on public.businesses;
drop policy if exists businesses_update on public.businesses;
drop policy if exists businesses_delete on public.businesses;
create policy businesses_read on public.businesses for select to authenticated using (verified or owner = auth.uid());
create policy businesses_insert on public.businesses for insert to authenticated with check (owner = auth.uid());
create policy businesses_update on public.businesses for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy businesses_delete on public.businesses for delete to authenticated using (owner = auth.uid());

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  details text check (details is null or char_length(details) <= 200),
  min_group int not null default 2 check (min_group between 1 and 50),
  min_spend numeric check (min_spend is null or min_spend between 0 and 100000),
  valid_until date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists offers_business on public.offers (business_id);
alter table public.offers enable row level security;
create or replace function public.my_business() returns uuid
language sql stable security definer set search_path = public as $$
  select id from businesses where owner = auth.uid()
$$;
drop policy if exists offers_read on public.offers;
drop policy if exists offers_write on public.offers;
create policy offers_read on public.offers for select to authenticated using (
  business_id = public.my_business()
  or (active and (valid_until is null or valid_until >= current_date)
      and exists (select 1 from businesses b where b.id = business_id and b.verified)));
create policy offers_write on public.offers for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

-- One code per question, shared by the circle. Reached only through the functions below.
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null unique references public.polls on delete cascade,
  business_id uuid not null references public.businesses on delete cascade,
  offer_id uuid references public.offers on delete set null,
  code text not null unique,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);
alter table public.claims enable row level security;

-- The answer that won outright, or null on a tie or no votes.
create or replace function public.winning_index(p uuid) returns int
language sql stable security definer set search_path = public as $$
  with t as (select choice, count(*) n from votes where poll_id = p group by choice)
  select choice from t where n = (select max(n) from t) and (select count(*) from t t2 where t2.n = (select max(n) from t)) = 1
$$;

-- A member of the question's circle asks for the code once the question has closed.
create or replace function public.claim_offer(p uuid)
returns table (code text, title text, details text, min_group int, min_spend numeric,
               valid_until date, business_name text, address text, redeemed boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare q polls; w int; b uuid; o offers; c claims;
begin
  select * into q from polls where id = p;
  if q.id is null or not exists (select 1 from poll_circles pc where pc.poll_id = p and is_member(pc.circle_id)) then
    raise exception 'Not your question';
  end if;
  if q.closes_at > now() then raise exception 'Voting is still open'; end if;
  w := winning_index(p);
  if w is null then raise exception 'There was no single winner'; end if;
  b := nullif(q.opts -> w ->> 'biz', '')::uuid;
  if b is null or not exists (select 1 from businesses where id = b and verified) then raise exception 'The winner has no offer'; end if;
  select * into c from claims where poll_id = p;
  if c.id is null then
    select * into o from offers where business_id = b and active and (valid_until is null or valid_until >= current_date)
      order by created_at desc limit 1;
    if o.id is null then raise exception 'This offer has ended'; end if;
    insert into claims (poll_id, business_id, offer_id, code)
      values (p, b, o.id, 'SWAY-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)))
      on conflict (poll_id) do nothing;
    select * into c from claims where poll_id = p;
  end if;
  select * into o from offers where id = c.offer_id;
  return query select c.code, o.title, o.details, o.min_group, o.min_spend, o.valid_until,
    (select name from businesses where id = c.business_id), (select bz.address from businesses bz where bz.id = c.business_id),
    c.redeemed_at is not null;
end $$;

-- Numbers for the business owner. Nothing about who asked or voted.
create or replace function public.business_stats()
returns table (appeared bigint, won bigint, claimed bigint, redeemed bigint)
language sql stable security definer set search_path = public as $$
  with mine as (select public.my_business() id),
  ps as (select p.id, p.closes_at from polls p, mine where mine.id is not null and p.opts @> jsonb_build_array(jsonb_build_object('biz', mine.id::text)))
  select (select count(*) from ps),
         (select count(*) from ps, mine where ps.closes_at <= now()
            and (select (p2.opts -> winning_index(ps.id) ->> 'biz') from polls p2 where p2.id = ps.id) = mine.id::text),
         (select count(*) from claims, mine where claims.business_id = mine.id),
         (select count(*) from claims, mine where claims.business_id = mine.id and redeemed_at is not null)
$$;

-- The business checks a code at the counter. Group size is the number of people who voted.
create or replace function public.redeem_code(c text)
returns table (ok boolean, message text, offer_title text, group_size int)
language plpgsql security definer set search_path = public as $$
declare cl claims; me uuid := public.my_business();
begin
  if me is null then return query select false, 'Create your business first', null::text, null::int; return; end if;
  select * into cl from claims where code = upper(trim(c));
  if cl.id is null or cl.business_id <> me then return query select false, 'This code isn''t for your business', null::text, null::int; return; end if;
  if cl.redeemed_at is not null then
    return query select false, 'Already used on ' || to_char(cl.redeemed_at, 'DD Mon at HH24:MI'), (select title from offers where id = cl.offer_id), (select count(*)::int from votes where poll_id = cl.poll_id); return;
  end if;
  update claims set redeemed_at = now() where id = cl.id;
  return query select true, 'Valid. Marked as used.', (select title from offers where id = cl.offer_id), (select count(*)::int from votes where poll_id = cl.poll_id);
end $$;

revoke execute on function public.claim_offer(uuid), public.business_stats(), public.redeem_code(text), public.winning_index(uuid), public.my_business() from public, anon;
grant execute on function public.claim_offer(uuid), public.business_stats(), public.redeem_code(text), public.winning_index(uuid), public.my_business() to authenticated;
notify pgrst, 'reload schema';

commit;
