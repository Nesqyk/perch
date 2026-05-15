-- Repair auth-backed squad creation for databases where the columns already
-- existed before auth.uid() defaults were added.

alter table public.groups
  alter column created_by set default auth.uid();

alter table public.group_members
  alter column user_id set default auth.uid();

update public.groups
   set created_by = auth.uid()
 where created_by is null
   and auth.uid() is not null;

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
