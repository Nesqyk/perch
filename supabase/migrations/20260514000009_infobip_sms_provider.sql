-- Replace Twilio-specific SMS delivery fields with provider-neutral ones.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sms_notifications'
      and column_name = 'twilio_sid'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sms_notifications'
      and column_name = 'provider_message_id'
  ) then
    alter table public.sms_notifications
      rename column twilio_sid to provider_message_id;
  end if;
end $$;

alter table public.sms_notifications
  add column if not exists provider_message_id text,
  add column if not exists provider text not null default 'infobip';

update public.sms_notifications
set provider = 'infobip'
where provider is null;
