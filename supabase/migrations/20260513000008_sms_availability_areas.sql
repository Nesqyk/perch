-- SMS notifications, spot availability, and area support.

alter table public.user_profiles
  add column if not exists phone_e164 text,
  add column if not exists phone_country text default 'PH',
  add column if not exists phone_verified_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_phone_e164_format'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_phone_e164_format
      check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
  end if;
end $$;

alter table public.user_settings
  add column if not exists sms_enabled boolean not null default false;

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  sitio text,
  barangay text not null,
  city_municipality text not null,
  lat numeric(10,7),
  lng numeric(10,7),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint areas_barangay_not_empty check (length(trim(barangay)) > 0),
  constraint areas_city_not_empty check (length(trim(city_municipality)) > 0),
  constraint areas_lat_range check (lat is null or (lat >= -90 and lat <= 90)),
  constraint areas_lng_range check (lng is null or (lng >= -180 and lng <= 180))
);

create index if not exists idx_areas_location
  on public.areas (city_municipality, barangay, sitio);

create index if not exists idx_areas_active
  on public.areas (is_active);

alter table public.areas enable row level security;

drop policy if exists "Anyone can read active areas" on public.areas;
create policy "Anyone can read active areas"
  on public.areas for select
  using (is_active = true);

drop policy if exists "Authenticated users can create areas" on public.areas;
create policy "Authenticated users can create areas"
  on public.areas for insert
  to authenticated
  with check (auth.uid() is not null and created_by = auth.uid());

alter table public.spots
  add column if not exists area_id uuid references public.areas(id) on delete set null,
  add column if not exists availability_status text,
  add column if not exists availability_updated_at timestamptz,
  add column if not exists availability_updated_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spots_availability_status_check'
  ) then
    alter table public.spots
      add constraint spots_availability_status_check
      check (availability_status is null or availability_status in ('available', 'occupied'));
  end if;
end $$;

create index if not exists idx_spots_area_id on public.spots(area_id);
create index if not exists idx_spots_availability_status on public.spots(availability_status);

create table if not exists public.spot_availability_events (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  status text not null check (status in ('available', 'occupied')),
  note text,
  reported_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_spot_availability_events_spot_created
  on public.spot_availability_events (spot_id, created_at desc);

alter table public.spot_availability_events enable row level security;

drop policy if exists "Anyone can read availability events" on public.spot_availability_events;
create policy "Anyone can read availability events"
  on public.spot_availability_events for select
  using (true);

drop policy if exists "Authenticated users can report availability" on public.spot_availability_events;
create policy "Authenticated users can report availability"
  on public.spot_availability_events for insert
  to authenticated
  with check (auth.uid() = reported_by);

create table if not exists public.spot_watchers (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  notify_by_sms boolean not null default true,
  created_at timestamptz not null default now(),
  unique (spot_id, user_id)
);

create index if not exists idx_spot_watchers_user on public.spot_watchers(user_id);
create index if not exists idx_spot_watchers_spot on public.spot_watchers(spot_id);

alter table public.spot_watchers enable row level security;

drop policy if exists "Users can read own spot watchers" on public.spot_watchers;
create policy "Users can read own spot watchers"
  on public.spot_watchers for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own spot watchers" on public.spot_watchers;
create policy "Users can create own spot watchers"
  on public.spot_watchers for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own spot watchers" on public.spot_watchers;
create policy "Users can update own spot watchers"
  on public.spot_watchers for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own spot watchers" on public.spot_watchers;
create policy "Users can delete own spot watchers"
  on public.spot_watchers for delete
  using (auth.uid() = user_id);

create table if not exists public.sms_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  spot_id uuid references public.spots(id) on delete set null,
  phone_e164 text not null,
  template_key text not null,
  message_body text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  twilio_sid text,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint sms_notifications_phone_e164_format
    check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

create index if not exists idx_sms_notifications_status_created
  on public.sms_notifications (status, created_at);
create index if not exists idx_sms_notifications_user_created
  on public.sms_notifications (user_id, created_at desc);

alter table public.sms_notifications enable row level security;

drop policy if exists "Users can read own SMS notifications" on public.sms_notifications;
create policy "Users can read own SMS notifications"
  on public.sms_notifications for select
  using (auth.uid() = user_id);

create or replace function public._spot_area_label(p_spot_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(
      concat_ws(', ',
        nullif(a.sitio, ''),
        nullif(a.barangay, ''),
        nullif(a.city_municipality, '')
      ),
      ''
    ),
    nullif(s.building, ''),
    'this area'
  )
  from public.spots s
  left join public.areas a on a.id = s.area_id
  where s.id = p_spot_id
$$;

create or replace function public.queue_spot_sms_notifications(
  p_spot_id uuid,
  p_status text,
  p_actor uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spot_name text;
  v_area text;
  v_template text;
  v_message text;
  v_count integer := 0;
begin
  if p_status not in ('available', 'occupied') then
    raise exception 'Invalid availability status: %', p_status;
  end if;

  select name into v_spot_name
  from public.spots
  where id = p_spot_id and is_active = true;

  if v_spot_name is null then
    return 0;
  end if;

  v_area := public._spot_area_label(p_spot_id);
  v_template := case when p_status = 'available' then 'spot_available' else 'spot_occupied' end;
  v_message := case
    when p_status = 'available' then
      format('SMS: %s is now available in %s. Open Perch to claim it.', v_spot_name, v_area)
    else
      format('SMS: %s was marked occupied. We''ll update you when it opens.', v_spot_name)
  end;

  insert into public.sms_notifications (
    user_id,
    spot_id,
    phone_e164,
    template_key,
    message_body,
    payload
  )
  select
    w.user_id,
    w.spot_id,
    p.phone_e164,
    v_template,
    v_message,
    jsonb_build_object(
      'spotId', p_spot_id,
      'spotName', v_spot_name,
      'area', v_area,
      'status', p_status
    )
  from public.spot_watchers w
  join public.user_settings us on us.user_id = w.user_id
  join public.user_profiles p on p.user_id = w.user_id
  where w.spot_id = p_spot_id
    and w.notify_by_sms = true
    and w.user_id <> p_actor
    and us.sms_enabled = true
    and p.phone_e164 is not null
    and p.phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
    and not exists (
      select 1
      from public.sms_notifications n
      where n.user_id = w.user_id
        and n.spot_id = w.spot_id
        and n.template_key = v_template
        and n.created_at > now() - interval '10 minutes'
        and n.status in ('queued', 'sending', 'sent')
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.set_spot_availability(
  p_spot_id uuid,
  p_status text,
  p_note text default null
)
returns public.spots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_spot public.spots;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('available', 'occupied') then
    raise exception 'Invalid availability status: %', p_status;
  end if;

  insert into public.spot_availability_events (spot_id, status, note, reported_by)
  values (p_spot_id, p_status, nullif(trim(coalesce(p_note, '')), ''), v_actor);

  update public.spots
  set availability_status = p_status,
      availability_updated_at = now(),
      availability_updated_by = v_actor,
      updated_at = now()
  where id = p_spot_id
    and is_active = true
  returning * into v_spot;

  if v_spot.id is null then
    raise exception 'Spot not found';
  end if;

  perform public.queue_spot_sms_notifications(p_spot_id, p_status, v_actor);
  return v_spot;
end;
$$;

create or replace function public.watch_spot_sms(
  p_spot_id uuid,
  p_notify_by_sms boolean default true
)
returns public.spot_watchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.spot_watchers;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  insert into public.spot_watchers (spot_id, user_id, notify_by_sms)
  values (p_spot_id, v_actor, coalesce(p_notify_by_sms, true))
  on conflict (spot_id, user_id)
  do update set notify_by_sms = excluded.notify_by_sms
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.unwatch_spot_sms(p_spot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.spot_watchers
  where spot_id = p_spot_id
    and user_id = auth.uid();
end;
$$;

grant execute on function public.set_spot_availability(uuid, text, text) to authenticated;
grant execute on function public.watch_spot_sms(uuid, boolean) to authenticated;
grant execute on function public.unwatch_spot_sms(uuid) to authenticated;
