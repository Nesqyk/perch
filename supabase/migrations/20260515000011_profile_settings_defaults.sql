-- Guard profile/settings upserts from partial client writes.

alter table public.user_profiles
  alter column nickname set default 'Perch member';

update public.user_profiles
set nickname = 'Perch member'
where nickname is null
   or length(trim(nickname)) = 0;

notify pgrst, 'reload schema';
