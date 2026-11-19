-- Sway upgrade 8: choose which circles notify you (like muting a group chat).
-- A muted circle sends you no notifications about its questions, votes or results.
-- Nudges, and results of your own questions, always come through. Safe to run more than once.
begin;

alter table public.notify_prefs add column if not exists muted_circles uuid[] not null default '{}'
  check (cardinality(muted_circles) <= 500);

commit;
