-- Sway upgrade 6: the asker decides whether friends may vote privately on a question.
-- Safe to run more than once.
begin;

-- On by default, so questions asked before this upgrade keep working as they did.
alter table public.polls add column if not exists allow_private boolean not null default true;
grant select (allow_private) on public.polls to authenticated;

-- A private vote on a question whose asker switched them off is refused by the database itself.
create or replace function public.vote_private_ok() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.hidden and not coalesce((select allow_private from polls where id = new.poll_id), true) then
    raise exception 'Private votes are switched off for this question' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists votes_private_ok on public.votes;
create trigger votes_private_ok before insert or update on public.votes
  for each row execute function public.vote_private_ok();

commit;
