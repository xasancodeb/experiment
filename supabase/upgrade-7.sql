-- Sway upgrade 7: choose whose questions and votes notify you.
-- only_from = null means everyone (the default). Otherwise only the listed people's
-- questions and votes send you a notification. Nudges, and results of your own questions,
-- always come through. Safe to run more than once.
begin;

create table if not exists public.notify_prefs (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  only_from uuid[] check (only_from is null or cardinality(only_from) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.notify_prefs enable row level security;

drop policy if exists notify_prefs_read on public.notify_prefs;
drop policy if exists notify_prefs_insert on public.notify_prefs;
drop policy if exists notify_prefs_update on public.notify_prefs;
drop policy if exists notify_prefs_delete on public.notify_prefs;
create policy notify_prefs_read on public.notify_prefs for select to authenticated using (user_id = auth.uid());
create policy notify_prefs_insert on public.notify_prefs for insert to authenticated with check (user_id = auth.uid());
create policy notify_prefs_update on public.notify_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notify_prefs_delete on public.notify_prefs for delete to authenticated using (user_id = auth.uid());

commit;
