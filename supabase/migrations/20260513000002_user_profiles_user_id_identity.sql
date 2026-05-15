-- Migration: Use auth user_id as the user_profiles identity
-- Makes profile rows compatible with email and OAuth users without requiring
-- the legacy anonymous session_id column.

alter table public.user_profiles
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists avatar_url text,
  add column if not exists cover_image_url text,
  add column if not exists school_label text not null default 'CTU Main Campus',
  add column if not exists scholar_label text not null default 'Senior Scholar';

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'user_profiles'
       and column_name = 'session_id'
  ) then
    execute $sql$
      update public.user_profiles
         set user_id = session_id::uuid
       where user_id is null
         and session_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    $sql$;
  end if;
end $$;

do $$
declare
  v_pk_name text;
begin
  select c.conname
    into v_pk_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'user_profiles'
     and c.contype = 'p'
     and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (session_id)';

  if v_pk_name is not null then
    execute format('alter table public.user_profiles drop constraint %I', v_pk_name);
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'user_profiles'
       and column_name = 'session_id'
  ) then
    execute 'alter table public.user_profiles alter column session_id drop not null';
  end if;
end $$;

drop index if exists public.user_profiles_user_id_unique;
create unique index user_profiles_user_id_unique
  on public.user_profiles (user_id);

drop policy if exists "user_profiles: authenticated read self" on public.user_profiles;
create policy "user_profiles: authenticated read self"
  on public.user_profiles for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_profiles: authenticated insert self" on public.user_profiles;
create policy "user_profiles: authenticated insert self"
  on public.user_profiles for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_profiles: authenticated update self" on public.user_profiles;
create policy "user_profiles: authenticated update self"
  on public.user_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
