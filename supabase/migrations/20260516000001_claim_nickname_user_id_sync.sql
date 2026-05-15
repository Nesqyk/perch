-- Copy safe claim display names from authenticated user profiles.

alter table public.claims
  add column if not exists nickname text;

create or replace function public.sync_nickname_on_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select nullif(btrim(up.nickname), '')
    into new.nickname
    from public.user_profiles up
   where up.user_id = new.user_id;

  return new;
end;
$$;

revoke all on function public.sync_nickname_on_claim() from public;

drop trigger if exists trg_sync_nickname_on_claim on public.claims;

create trigger trg_sync_nickname_on_claim
before insert or update of user_id on public.claims
for each row
execute function public.sync_nickname_on_claim();

update public.claims c
   set nickname = nullif(btrim(up.nickname), '')
  from public.user_profiles up
 where c.user_id = up.user_id
   and c.cancelled_at is null
   and c.expires_at > now()
   and nullif(btrim(up.nickname), '') is not null
   and nullif(btrim(coalesce(c.nickname, '')), '') is null;
