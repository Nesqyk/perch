-- Switch the availability alert copy/provider metadata from SMS to WhatsApp.
-- Table and RPC names stay stable for compatibility with the current client.

alter table public.sms_notifications
  alter column provider set default 'infobip_whatsapp';

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
      format('WhatsApp: %s is now available in %s. Open Perch to claim it.', v_spot_name, v_area)
    else
      format('WhatsApp: %s was marked occupied. We''ll update you when it opens.', v_spot_name)
  end;

  insert into public.sms_notifications (
    user_id,
    spot_id,
    phone_e164,
    template_key,
    message_body,
    provider,
    payload
  )
  select
    w.user_id,
    w.spot_id,
    p.phone_e164,
    v_template,
    v_message,
    'infobip_whatsapp',
    jsonb_build_object(
      'spotId', p_spot_id,
      'spotName', v_spot_name,
      'area', v_area,
      'status', p_status,
      'channel', 'whatsapp'
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

revoke all on function public.queue_spot_sms_notifications(uuid, text, uuid) from public;
revoke all on function public.queue_spot_sms_notifications(uuid, text, uuid) from anon;
revoke all on function public.queue_spot_sms_notifications(uuid, text, uuid) from authenticated;
