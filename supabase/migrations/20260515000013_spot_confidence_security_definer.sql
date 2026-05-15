-- Make confidence write paths privileged so authenticated spot creation
-- can seed spot_confidence rows without opening direct client writes.

create or replace function public.seed_spot_confidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.spot_confidence (spot_id, score, reason)
  values (new.id, 0.5, 'Initial — no data yet')
  on conflict (spot_id) do nothing;

  return new;
end;
$$;

create or replace function public.refresh_spot_confidence()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  spot_row record;
  base_score numeric;
  correction_count integer;
  final_score numeric;
  reason_text text;
begin
  for spot_row in
    select s.id
      from public.spots as s
     where s.is_active = true
  loop
    select case
      when exists (
        select 1
          from public.schedule_entries as se
         where se.spot_id = spot_row.id
           and se.day_of_week = extract(dow from now())
           and localtime between se.start_time and se.end_time
      ) then 0.10
      else 0.80
    end
      into base_score;

    select count(*)
      into correction_count
      from public.corrections as c
     where c.spot_id = spot_row.id
       and c.corrected_at > now() - interval '2 hours';

    final_score := greatest(0.05, base_score - (correction_count * 0.15));
    reason_text := case
      when base_score = 0.10 then 'Class scheduled now'
      else 'No class scheduled'
    end;

    if correction_count > 0 then
      reason_text := reason_text || '; ' || correction_count || ' recent report(s)';
    end if;

    insert into public.spot_confidence (spot_id, score, reason, valid_until, updated_at)
    values (
      spot_row.id,
      round(final_score::numeric, 3),
      reason_text,
      now() + interval '15 minutes',
      now()
    )
    on conflict (spot_id) do update
      set score = excluded.score,
          reason = excluded.reason,
          valid_until = excluded.valid_until,
          updated_at = excluded.updated_at;
  end loop;
end;
$$;
