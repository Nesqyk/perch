-- Migration: spot-specific images and direct community spot creation.
-- Adds a dedicated private Storage bucket, spot image metadata, and a narrow
-- RPC for attaching the first image to an image-less spot.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spot-images',
  'spot-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

alter table public.spots
  add column if not exists image_path text,
  add column if not exists created_by uuid references auth.users (id) on delete set null default auth.uid();

alter table public.spots
  alter column created_by set default auth.uid();

create index if not exists spots_created_by_idx on public.spots (created_by);

comment on column public.spots.image_path is
  'Path in the spot-images bucket for the primary spot photo.';
comment on column public.spots.created_by is
  'Authenticated user who created a community spot, when applicable.';

create or replace function public.storage_spot_image_spot_id(p_name text)
returns uuid
language sql
stable
as $$
  select case
    when (storage.foldername(p_name))[1] = 'spots'
      and (storage.foldername(p_name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (storage.foldername(p_name))[2]::uuid
    else null
  end;
$$;

drop policy if exists "spots: authenticated read active" on public.spots;
create policy "spots: authenticated read active"
  on public.spots for select
  to authenticated
  using (is_active = true);

drop policy if exists "spots: authenticated insert community" on public.spots;
create policy "spots: authenticated insert community"
  on public.spots for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and is_active = true
  );

drop policy if exists "spot-images: public read" on storage.objects;
create policy "spot-images: public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'spot-images');

drop policy if exists "spot-images: authenticated insert for image-less spot" on storage.objects;
create policy "spot-images: authenticated insert for image-less spot"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'spot-images'
    and (storage.foldername(name))[1] = 'spots'
    and exists (
      select 1
      from public.spots s
      where s.id = public.storage_spot_image_spot_id(name)
        and s.is_active = true
        and (s.created_by = auth.uid() or s.image_path is null)
    )
  );

drop policy if exists "spot-images: authenticated update own upload" on storage.objects;
create policy "spot-images: authenticated update own upload"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'spot-images'
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'spot-images'
    and owner = auth.uid()
  );

create or replace function public.set_spot_image(
  p_spot_id uuid,
  p_image_path text
)
returns public.spots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spot public.spots%rowtype;
  v_path_spot_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  v_path_spot_id := public.storage_spot_image_spot_id(p_image_path);
  if v_path_spot_id is distinct from p_spot_id then
    raise exception 'Image path does not belong to this spot.';
  end if;

  update public.spots
     set image_path = p_image_path,
         updated_at = now()
   where id = p_spot_id
     and is_active = true
     and image_path is null
     and (created_by = auth.uid() or image_path is null)
   returning * into v_spot;

  if not found then
    raise exception 'Spot image could not be attached.';
  end if;

  return v_spot;
end;
$$;

revoke all on function public.set_spot_image(uuid, text) from public;
grant execute on function public.set_spot_image(uuid, text) to authenticated;

notify pgrst, 'reload schema';
