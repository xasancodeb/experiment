-- Sway upgrade 12: business applications carry contact details, so the site owner can reach
-- the place before approving it. Safe to run more than once.
begin;
alter table public.businesses add column if not exists contact_name text check (contact_name is null or char_length(contact_name) <= 60);
alter table public.businesses add column if not exists contact_email text check (contact_email is null or char_length(contact_email) <= 120);
alter table public.businesses add column if not exists phone text check (phone is null or char_length(phone) <= 30);
alter table public.businesses add column if not exists website text check (website is null or char_length(website) <= 120);
grant insert (name, category, city, address, contact_name, contact_email, phone, website) on public.businesses to authenticated;
grant update (name, category, city, address, contact_name, contact_email, phone, website) on public.businesses to authenticated;
notify pgrst, 'reload schema';
commit;
