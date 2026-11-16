-- Sway upgrade 4: push notifications.
-- Safe to run more than once. The notification sender itself is the Edge Function in
-- supabase/functions/notify, and a once-a-minute timer calls it (see the README).

begin;

-- One row per device that asked for notifications.
create table if not exists public.push_subs (
  endpoint text primary key check (endpoint like 'https://%' and char_length(endpoint) < 2000),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user on public.push_subs (user_id);

alter table public.push_subs enable row level security;
drop policy if exists push_subs_read on public.push_subs;
drop policy if exists push_subs_delete on public.push_subs;
create policy push_subs_read on public.push_subs for select to authenticated using (user_id = auth.uid());
create policy push_subs_delete on public.push_subs for delete to authenticated using (user_id = auth.uid());

-- A device belongs to whoever is signed in on it now.
create or replace function public.save_push_sub(ep text, k text, a text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from push_subs where endpoint = ep;
  insert into push_subs (endpoint, user_id, p256dh, auth) values (ep, auth.uid(), k, a);
end $$;
revoke execute on function public.save_push_sub(text, text, text) from anon;

-- Which notifications have already gone out for a question, so none is sent twice.
alter table public.polls add column if not exists notified jsonb not null default '{}';

-- What the sender did, for troubleshooting. Only the sender can read or write it.
create table if not exists public.push_log (
  at timestamptz not null default now(),
  kind text,
  host text,
  status int
);
alter table public.push_log enable row level security;

commit;
