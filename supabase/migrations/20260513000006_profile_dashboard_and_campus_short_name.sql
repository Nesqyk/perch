-- Migration: Profile dashboard fields and campus short-name repair
-- Keeps campus inserts resilient and adds persisted profile metadata used by #/profile.

-- Campus short_name safety net -------------------------------------------------

create or replace function public.derive_campus_short_name(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_word text;
  v_short text := '';
  v_count integer := 0;
begin
  for v_word in
    select word
      from unnest(regexp_split_to_array(coalesce(p_name, ''), '\s+')) as word
     where word <> ''
  loop
    v_short := v_short || upper(left(v_word, 1));
    v_count := v_count + 1;
    exit when v_count >= 3;
  end loop;

  return coalesce(nullif(v_short, ''), 'CMP');
end;
$$;

create or replace function public.set_campus_short_name()
returns trigger
language plpgsql
as $$
begin
  if new.short_name is null or btrim(new.short_name) = '' then
    new.short_name := public.derive_campus_short_name(new.name);
  end if;

  return new;
end;
$$;

update public.campuses
   set short_name = public.derive_campus_short_name(name)
 where short_name is null
    or btrim(short_name) = '';

drop trigger if exists campuses_set_short_name on public.campuses;
create trigger campuses_set_short_name
  before insert or update of name, short_name on public.campuses
  for each row execute function public.set_campus_short_name();

-- Profile dashboard fields -----------------------------------------------------

alter table public.user_profiles
  add column if not exists student_id text,
  add column if not exists course_label text,
  add column if not exists class_label text,
  add column if not exists verified_student boolean not null default false,
  add column if not exists study_vibes text[] not null default '{}';

notify pgrst, 'reload schema';
