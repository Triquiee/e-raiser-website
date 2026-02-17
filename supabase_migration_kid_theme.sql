-- E-RAISER migration: kid theme + book metadata + Juan Tamad fixes
-- Safe to run multiple times.

alter table if exists public.stories
  add column if not exists cover_url text,
  add column if not exists author text,
  add column if not exists year_published int,
  add column if not exists language text;

-- Constraints / defaults (only add if missing)
do $$
begin
  -- year range
  if not exists (
    select 1 from pg_constraint
    where conname = 'stories_year_published_check'
  ) then
    alter table public.stories
      add constraint stories_year_published_check
      check (year_published is null or (year_published between 1800 and 2100));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stories_language_check'
  ) then
    alter table public.stories
      add constraint stories_language_check
      check (language in ('en','fil'));
  end if;
exception when others then
  -- ignore if permissions differ
end $$;

-- set defaults if missing
alter table if exists public.stories alter column language set default 'en';
update public.stories
  set language = case when story_type='alamat' then 'fil' else 'en' end
  where language is null;

-- Backfill: most Alamat are Filipino
update public.stories set language='fil' where story_type='alamat' and language='en';

-- Force "Juan Tamad" to Alamat + Filipino
update public.stories
  set story_type = 'alamat', language='fil'
  where lower(title) = 'juan tamad';

-- Fix/seed Juan Tamad quiz (5 questions)
with s as (
  select id from public.stories where lower(title)='juan tamad' limit 1
)
insert into public.quizzes (story_id, questions)
select
  s.id,
  '[
    {"prompt":"Sino ang pangunahing tauhan sa kuwento?","choices":["Juan Tamad","Haring Tamad","Si Aling Rosa","Isang Agila"],"answer_index":0},
    {"prompt":"Ano ang ugali ni Juan sa kuwento?","choices":["Masipag","Matulungin","Tamad","Laging maaga"],"answer_index":2},
    {"prompt":"Ano ang naging resulta ng katamaran ni Juan?","choices":["Naging mahusay siya","Nakapasa siya sa pagsusulit","Nagkaproblema siya","Naging hari siya"],"answer_index":2},
    {"prompt":"Ano ang aral ng kuwento?","choices":["Mas mabuting maging tamad","Mas mabuting maghintay na lang","Mas mabuting magsikap at kumilos","Mas mabuting umiwas sa pag-aaral"],"answer_index":2},
    {"prompt":"Paano mo maiiwasan ang katamaran?","choices":["Magplano at gumawa ng gawain","Matulog buong araw","Iwan ang responsibilidad","Magpanggap na abala"],"answer_index":0}
  ]'::jsonb
from s
on conflict (story_id) do update set questions = excluded.questions;
