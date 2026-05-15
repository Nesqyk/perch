-- Harden legacy public policy surface after the move to authenticated users.
-- Public map browsing remains available through spot/campus/area read policies,
-- but profile, squad, raw availability history, and SMS helper RPC surfaces are
-- restricted to authenticated users or internal server-side calls.

-- Legacy anonymous profile policies

drop policy if exists "user_profiles: public read" on public.user_profiles;
drop policy if exists "user_profiles: owner insert" on public.user_profiles;
drop policy if exists "user_profiles: owner update" on public.user_profiles;
drop policy if exists "user_profiles: owner can upsert" on public.user_profiles;

-- Ensure the intended authenticated self-access policies exist.
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

-- Legacy anonymous squad policies

drop policy if exists "groups: public read" on public.groups;
drop policy if exists "groups: anyone can insert" on public.groups;

drop policy if exists "group_members: public read" on public.group_members;
drop policy if exists "group_members: anyone can insert" on public.group_members;
drop policy if exists "group_members: owner can update" on public.group_members;

drop policy if exists "group_pins: public read" on public.group_pins;
drop policy if exists "group_pins: anyone can insert" on public.group_pins;
drop policy if exists "group_pins: owner can update" on public.group_pins;

drop policy if exists "group_pin_joins: public read" on public.group_pin_joins;
drop policy if exists "group_pin_joins: anyone can insert" on public.group_pin_joins;
drop policy if exists "group_pin_joins: owner can update" on public.group_pin_joins;

drop policy if exists "group_confirmations: public read" on public.group_confirmations;
drop policy if exists "group_confirmations: anyone can insert" on public.group_confirmations;

-- Availability event history

drop policy if exists "Anyone can read availability events" on public.spot_availability_events;
drop policy if exists "spot_availability_events: reporter read self" on public.spot_availability_events;
create policy "spot_availability_events: reporter read self"
  on public.spot_availability_events for select
  to authenticated
  using (reported_by = auth.uid());

-- SMS and availability RPC execute grants

revoke all on function public._spot_area_label(uuid) from public;
revoke all on function public._spot_area_label(uuid) from anon;
revoke all on function public._spot_area_label(uuid) from authenticated;

revoke all on function public.queue_spot_sms_notifications(uuid, text, uuid) from public;
revoke all on function public.queue_spot_sms_notifications(uuid, text, uuid) from anon;
revoke all on function public.queue_spot_sms_notifications(uuid, text, uuid) from authenticated;

revoke all on function public.set_spot_availability(uuid, text, text) from public;
revoke all on function public.set_spot_availability(uuid, text, text) from anon;
revoke all on function public.set_spot_availability(uuid, text, text) from authenticated;

revoke all on function public.watch_spot_sms(uuid, boolean) from public;
revoke all on function public.watch_spot_sms(uuid, boolean) from anon;
revoke all on function public.watch_spot_sms(uuid, boolean) from authenticated;

revoke all on function public.unwatch_spot_sms(uuid) from public;
revoke all on function public.unwatch_spot_sms(uuid) from anon;
revoke all on function public.unwatch_spot_sms(uuid) from authenticated;

grant execute on function public.set_spot_availability(uuid, text, text) to authenticated;
grant execute on function public.watch_spot_sms(uuid, boolean) to authenticated;
grant execute on function public.unwatch_spot_sms(uuid) to authenticated;

notify pgrst, 'reload schema';
