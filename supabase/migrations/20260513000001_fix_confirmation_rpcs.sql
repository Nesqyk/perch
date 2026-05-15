-- Migration: Fix community confirmation RPC ambiguity
-- Replaces hosted RPCs with table-qualified SQL so generic columns such as
-- status cannot collide with output columns or local variables.

alter table public.spot_submissions
  add column if not exists campus_id uuid references public.campuses (id) on delete set null,
  add column if not exists lat numeric,
  add column if not exists lng numeric,
  add column if not exists building_name text,
  add column if not exists floor text,
  add column if not exists discoverer_display_name text,
  add column if not exists confirmation_count integer not null default 0,
  add column if not exists discovered_spot_id uuid references public.spots (id) on delete set null,
  add column if not exists user_id uuid references auth.users (id) on delete set null default auth.uid();

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
        campus_id
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
        v_submission.campus_id
      )
      returning public.spots.id into v_spot_id;
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

create or replace function public.confirm_building(p_building_id uuid)
returns table (
  id uuid,
  campus_id uuid,
  name text,
  slug text,
  lat numeric,
  lng numeric,
  source text,
  verification_status text,
  confirmation_count integer,
  created_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.buildings as b
       set confirmation_count = coalesce(b.confirmation_count, 0) + 1,
           verification_status = case
             when coalesce(b.confirmation_count, 0) + 1 >= 2 then 'verified'
             else b.verification_status
           end
     where b.id = p_building_id
       and b.verification_status = 'pending'
     returning
       b.id,
       b.campus_id,
       b.name,
       b.slug,
       b.lat,
       b.lng,
       b.source,
       b.verification_status,
       b.confirmation_count,
       b.created_by;
end;
$$;
