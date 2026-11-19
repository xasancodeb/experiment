-- Sway upgrade 9: private votes are off unless the asker switches them on for a question.
-- Questions asked before this keep the setting they had. Safe to run more than once.
alter table public.polls alter column allow_private set default false;
