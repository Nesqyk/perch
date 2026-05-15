-- Migration: make student map writes auth-owned instead of session-owned.
-- Legacy session_id columns are kept for old data, but new writes use user_id.

-- ─── Columns and defaults ───────────────────────────────────────────────────

alter table public.groups
  alter column created_by set default auth.uid();

alter table public.group_members
  alter column user_id set default auth.uid();

alter table public.claims
  add column if not exists user_id uuid references auth.users (id) on delete cascade default auth.uid();

alter table public.claims
  alter column user_id set default auth.uid();

alter table public.corrections
  add column if not exists user_id uuid references auth.users (id) on delete cascade default auth.uid();

alter table public.corrections
  alter column user_id set default auth.uid();

alter table public.spot_submissions
  add column if not exists user_id uuid references auth.users (id) on delete set null default auth.uid();

alter table public.spot_submissions
  alter column user_id set default auth.uid();

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'claims'
       and column_name = 'session_id'
  ) then
    execute 'alter table public.claims alter column session_id drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'corrections'
       and column_name = 'session_id'
  ) then
    execute 'alter table public.corrections alter column session_id drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'spot_submissions'
       and column_name = 'session_id'
  ) then
    execute 'alter table public.spot_submissions alter column session_id drop not null';
  end if;
end $$;

create index if not exists claims_user_id_idx on public.claims (user_id);
create index if not exists corrections_user_id_idx on public.corrections (user_id);
create index if not exists spot_submissions_user_id_idx on public.spot_submissions (user_id);

-- ─── Claims RLS ─────────────────────────────────────────────────────────────

drop policy if exists "claims: public read" on public.claims;
create policy "claims: public read"
  on public.claims for select
  to anon, authenticated
  using (true);

drop policy if exists "claims: anyone can insert" on public.claims;
drop policy if exists "claims: authenticated insert self" on public.claims;
create policy "claims: authenticated insert self"
  on public.claims for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "claims: owner can cancel" on public.claims;
drop policy if exists "claims: authenticated owner cancel" on public.claims;
create policy "claims: authenticated owner cancel"
  on public.claims for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── Corrections RLS ────────────────────────────────────────────────────────

drop policy if exists "corrections: anyone can insert" on public.corrections;
drop policy if exists "corrections: authenticated insert self" on public.corrections;
create policy "corrections: authenticated insert self"
  on public.corrections for insert
  to authenticated
  with check (user_id = auth.uid());

-- ─── Spot submissions RLS ───────────────────────────────────────────────────

drop policy if exists "spot_submissions: anyone can insert" on public.spot_submissions;
drop policy if exists "spot_submissions: authenticated insert self" on public.spot_submissions;
create policy "spot_submissions: authenticated insert self"
  on public.spot_submissions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "spot_submissions: public read approved" on public.spot_submissions;
create policy "spot_submissions: public read approved"
  on public.spot_submissions for select
  to anon, authenticated
  using (status = 'approved');

drop policy if exists "spot_submissions: owner read self" on public.spot_submissions;
create policy "spot_submissions: owner read self"
  on public.spot_submissions for select
  to authenticated
  using (user_id = auth.uid());

-- ─── Group creation policy repair ───────────────────────────────────────────

drop policy if exists "groups: authenticated insert" on public.groups;
create policy "groups: authenticated insert"
  on public.groups for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "group_members: authenticated insert self" on public.group_members;
create policy "group_members: authenticated insert self"
  on public.group_members for insert
  to authenticated
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
