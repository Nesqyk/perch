-- Repair duplicate promotion and auth-owned write policies surfaced by prod logs.

create or replace function public.confirm_spot_submission(p_submission_id uuid)
returns table (
  id uuid,
  status text,
  confirmation_count integer,
  discovered_spot_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.spot_submissions%rowtype;
  v_spot_id uuid;
begin
  update public.spot_submissions as ss
     set confirmation_count = coalesce(ss.confirmation_count, 0) + 1
   where ss.id = p_submission_id
     and ss.status = 'pending'
   returning ss.* into v_submission;

  if not found then
    return query
      select ss.id, ss.status, ss.confirmation_count, ss.discovered_spot_id
        from public.spot_submissions as ss
       where ss.id = p_submission_id;
    return;
  end if;

  if coalesce(v_submission.confirmation_count, 0) >= 2 then
    if v_submission.discovered_spot_id is null then
      select s.id
        into v_spot_id
        from public.spots as s
       where s.is_active = true
         and lower(trim(s.name)) = lower(trim(v_submission.spot_name))
         and coalesce(s.campus_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = coalesce(v_submission.campus_id, '00000000-0000-0000-0000-000000000000'::uuid)
         and coalesce(lower(trim(s.building)), '') = coalesce(lower(trim(v_submission.building_name)), '')
         and coalesce(lower(trim(s.floor)), '') = coalesce(lower(trim(v_submission.floor)), '')
       order by s.created_at asc
       limit 1;

      if v_spot_id is null then
        begin
          insert into public.spots (
            name,
            type,
            on_campus,
            building,
            floor,
            walk_time_min,
            rough_capacity,
            has_outlets,
            wifi_strength,
            noise_baseline,
            has_food,
            lat,
            lng,
            is_active,
            campus_id,
            created_by
          )
          values (
            v_submission.spot_name,
            'classroom',
            true,
            v_submission.building_name,
            v_submission.floor,
            0,
            'medium',
            false,
            'ok',
            'moderate',
            false,
            v_submission.lat,
            v_submission.lng,
            true,
            v_submission.campus_id,
            v_submission.user_id
          )
          returning public.spots.id into v_spot_id;
        exception
          when unique_violation then
            select s.id
              into v_spot_id
              from public.spots as s
             where s.is_active = true
               and coalesce(s.campus_id, '00000000-0000-0000-0000-000000000000'::uuid)
                   = coalesce(v_submission.campus_id, '00000000-0000-0000-0000-000000000000'::uuid)
               and coalesce(lower(trim(s.building)), '') = coalesce(lower(trim(v_submission.building_name)), '')
               and coalesce(lower(trim(s.floor)), '') = coalesce(lower(trim(v_submission.floor)), '')
             order by s.created_at asc
             limit 1;

            if v_spot_id is null then
              raise;
            end if;
        end;
      end if;
    else
      v_spot_id := v_submission.discovered_spot_id;
    end if;

    update public.spot_submissions as ss
       set status = 'approved',
           discovered_spot_id = v_spot_id
     where ss.id = p_submission_id
     returning ss.* into v_submission;
  end if;

  return query
    select
      v_submission.id,
      v_submission.status,
      v_submission.confirmation_count,
      v_submission.discovered_spot_id;
end;
$$;

drop policy if exists "spot-images: authenticated insert for image-less spot" on storage.objects;
create policy "spot-images: authenticated insert for image-less spot"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'spot-images'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = 'spots'
    and exists (
      select 1
      from public.spots as s
      where s.id = public.storage_spot_image_spot_id(name)
        and s.is_active = true
        and (s.image_path is null or s.created_by = auth.uid())
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

grant execute on function public.storage_spot_image_spot_id(text) to authenticated;

drop policy if exists "group_members: authenticated insert self" on public.group_members;
create policy "group_members: authenticated insert self"
  on public.group_members for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "group_members: self presence update" on public.group_members;
create policy "group_members: self presence update"
  on public.group_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "corrections: authenticated insert self" on public.corrections;
create policy "corrections: authenticated insert self"
  on public.corrections for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and spot_id is not null
    and corrected_at is not null
    and day_of_week between 0 and 6
    and hour_of_day between 0 and 23
  );

notify pgrst, 'reload schema';
