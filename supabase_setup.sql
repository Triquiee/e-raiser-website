-- E-RAISER Supabase Setup (NEW PROJECT)
-- Paste this whole file into Supabase SQL Editor and RUN.
-- Includes: tables, triggers, RLS policies, and optional seed data (20 stories + quizzes).

-- Extensions
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- PROFILES (one row per auth user)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  chosen_role text check (chosen_role in ('teacher','student')),
  grade_level int check (grade_level between 7 and 12),
  teacher_subject text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- STORIES
-- ------------------------------------------------------------
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  story_type text not null check (story_type in ('fairy_tale','alamat')),
  difficulty text not null check (difficulty in ('very_easy','easy')),
  grade_min int check (grade_min between 7 and 12),
  grade_max int check (grade_max between 7 and 12),
  subject_tags text[] not null default '{}',
  content text not null,
  cover_url text,
  -- If you use Supabase Storage uploads, we also store the storage path for easy delete/replace.
  cover_path text,
  author text,
  year_published int check (year_published is null or (year_published between 1800 and 2100)),
  language text not null default 'en' check (language in ('en','fil')),
  created_at timestamptz not null default now()
);

-- Helpful function for Storage policies (use in dashboard UI)
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = uid and p.is_admin = true
  );
$$;

-- ------------------------------------------------------------
-- QUIZZES (exactly 5 questions per story)
-- ------------------------------------------------------------
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null unique references public.stories(id) on delete cascade,
  questions jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.validate_quiz_questions()
returns trigger
language plpgsql
as $$
declare
  q jsonb;
  i int;
  choices jsonb;
  ans int;
begin
  if jsonb_typeof(new.questions) <> 'array' then
    raise exception 'questions must be a JSON array';
  end if;
  if jsonb_array_length(new.questions) <> 5 then
    raise exception 'quiz must have exactly 5 questions';
  end if;

  for i in 0..4 loop
    q := new.questions->i;
    if q is null then
      raise exception 'question % is missing', i+1;
    end if;
    if coalesce(q->>'prompt','') = '' then
      raise exception 'question % prompt is required', i+1;
    end if;
    choices := q->'choices';
    if jsonb_typeof(choices) <> 'array' or jsonb_array_length(choices) <> 4 then
      raise exception 'question % must have 4 choices', i+1;
    end if;
    ans := (q->>'answer_index')::int;
    if ans < 0 or ans > 3 then
      raise exception 'question % answer_index must be 0..3', i+1;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists validate_quiz_questions_trg on public.quizzes;
create trigger validate_quiz_questions_trg
before insert or update on public.quizzes
for each row execute procedure public.validate_quiz_questions();

-- ------------------------------------------------------------
-- ATTEMPTS (quiz submissions)
-- ------------------------------------------------------------
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  score int not null,
  total int not null default 5,
  answers jsonb not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- RECOMMENDATIONS (teacher -> grade or specific student)
-- ------------------------------------------------------------
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  grade_level int check (grade_level between 7 and 12),
  student_id uuid references public.profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- RLS + helper functions
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.stories enable row level security;
alter table public.quizzes enable row level security;
alter table public.attempts enable row level security;
alter table public.recommendations enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  );
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.chosen_role = 'teacher' or p.is_admin = true)
  );
$$;

-- PROFILES policies
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- STORIES policies (read for all auth; write for admin)
drop policy if exists "stories_read_auth" on public.stories;
create policy "stories_read_auth"
on public.stories for select
to authenticated
using (true);

drop policy if exists "stories_admin_insert" on public.stories;
create policy "stories_admin_insert"
on public.stories for insert
to authenticated
with check (public.is_admin());

drop policy if exists "stories_admin_update" on public.stories;
create policy "stories_admin_update"
on public.stories for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "stories_admin_delete" on public.stories;
create policy "stories_admin_delete"
on public.stories for delete
to authenticated
using (public.is_admin());

-- QUIZZES policies (read for all auth; write for admin)
drop policy if exists "quizzes_read_auth" on public.quizzes;
create policy "quizzes_read_auth"
on public.quizzes for select
to authenticated
using (true);

drop policy if exists "quizzes_admin_insert" on public.quizzes;
create policy "quizzes_admin_insert"
on public.quizzes for insert
to authenticated
with check (public.is_admin());

drop policy if exists "quizzes_admin_update" on public.quizzes;
create policy "quizzes_admin_update"
on public.quizzes for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "quizzes_admin_delete" on public.quizzes;
create policy "quizzes_admin_delete"
on public.quizzes for delete
to authenticated
using (public.is_admin());

-- ATTEMPTS policies
drop policy if exists "attempts_insert_own" on public.attempts;
create policy "attempts_insert_own"
on public.attempts for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "attempts_select_own_teacher_admin" on public.attempts;
create policy "attempts_select_own_teacher_admin"
on public.attempts for select
to authenticated
using (user_id = auth.uid() or public.is_teacher() or public.is_admin());

-- RECOMMENDATIONS policies
-- Teachers/admin can see all recs; students see recs for their grade or specifically assigned to them
drop policy if exists "recs_select_teacher_admin_or_student" on public.recommendations;
create policy "recs_select_teacher_admin_or_student"
on public.recommendations for select
to authenticated
using (
  public.is_teacher()
  or public.is_admin()
  or (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.chosen_role = 'student')
    and (
      student_id = auth.uid()
      or (student_id is null and grade_level is not null and grade_level = (select p2.grade_level from public.profiles p2 where p2.id = auth.uid()))
      or (student_id is null and grade_level is null) -- general recommendations
    )
  )
);

drop policy if exists "recs_insert_teacher_admin" on public.recommendations;
create policy "recs_insert_teacher_admin"
on public.recommendations for insert
to authenticated
with check (public.is_teacher() or public.is_admin());

drop policy if exists "recs_delete_teacher_own_or_admin" on public.recommendations;
create policy "recs_delete_teacher_own_or_admin"
on public.recommendations for delete
to authenticated
using (teacher_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- SEED DATA
-- ------------------------------------------------------------
-- (Optional) Seed data: 20 short, original stories + quizzes
-- You can safely re-run this seed block; it deletes and recreates seed content.
do $seed$
begin
  delete from public.quizzes q
  using public.stories s
  where q.story_id = s.id and s.author = 'E-RAISER Seed';

  delete from public.stories
  where author = 'E-RAISER Seed';
end;
$seed$;

with ins as (
  insert into public.stories
    (title, story_type, difficulty, grade_min, grade_max, subject_tags, cover_url, author, year_published, language, content)
  values
    ('The Lantern of Kindness', 'fairy_tale', 'very_easy', 7, 8, ARRAY['English'], NULL, 'E-RAISER Seed', 2026, 'en', $er$
In a small village, Lila found an old lantern beside the road. It looked ordinary, but it glowed when Lila did something kind.

That day, she helped an old man carry water. The lantern shone softly. Later, she shared her bread with a hungry child, and the lantern glowed brighter.

At night, a storm cut the village’s lights. People were afraid to walk outside. Lila lifted the lantern, and its warm light guided neighbors safely to their homes.

When the storm ended, the lantern stopped glowing. Lila smiled. “It’s okay,” she said. “Kindness is the real light.”

Lesson: Small acts of kindness can help many people.
$er$),
    ('The Three Gentle Wishes', 'fairy_tale', 'very_easy', 7, 9, ARRAY['English'], NULL, 'E-RAISER Seed', 2026, 'en', $er$
Milo found a tiny wooden box under a tree. A note said, “Three wishes—use them gently.”

Milo wanted candy, but he remembered his sick neighbor. His first wish was for warm soup for every home that needed it. That evening, pots of soup appeared at doorsteps.

For his second wish, Milo wished for clean water in the village. The well became clear and fresh.

Milo saved his last wish. He listened to people, helped them, and learned what mattered. When a strong wind broke the bridge, Milo used his third wish: “Let our bridge be safe and strong.”

The bridge stood firm. Milo realized the best wishes are the ones that help others.

Lesson: Use gifts wisely and think of others first.
$er$),
    ('The Clock That Loved Quiet', 'fairy_tale', 'easy', 8, 10, ARRAY['English'], NULL, 'E-RAISER Seed', 2026, 'en', $er$
In a busy house, a clock ticked loudly all day. Everyone complained, but the clock was only doing its job.

One night, the youngest child, Ina, placed the clock on a soft cloth. “You must be tired,” she said.

The next day, the clock ticked more gently. The family noticed the house felt calmer. Ina began a quiet hour each afternoon—no shouting, no rushing. People read books, drew pictures, and rested.

The clock kept time, but it also reminded them to slow down.

Lesson: A little quiet can make learning and living easier.
$er$),
    ('The Paper Boat Hero', 'fairy_tale', 'very_easy', 7, 8, ARRAY['English'], NULL, 'E-RAISER Seed', 2026, 'en', $er$
Tom folded a paper boat and placed it in a stream. “Go on an adventure,” he whispered.

The stream carried the boat past rocks and leaves. A beetle fell into the water, struggling. The paper boat drifted close, and the beetle climbed aboard.

Farther down, the boat bumped into a stick that blocked the beetle’s path. Tom, watching from the bank, moved the stick away.

The beetle reached dry ground safely. Tom laughed. “My boat is a hero!”

Lesson: Even small things can help when you pay attention.
$er$),
    ('The Bakery of Brave Smiles', 'fairy_tale', 'easy', 9, 12, ARRAY['English'], NULL, 'E-RAISER Seed', 2026, 'en', $er$
A shy baker named Nora made bread that smelled like sunshine. But she was afraid to talk to customers.

One morning, a traveler said, “Your bread is wonderful. Why do you hide?”

Nora answered softly, “I worry I will say the wrong words.”

The traveler smiled. “Try one brave smile a day.”

Nora began greeting people with a small smile. Soon, she added a “Good morning.” Then she asked, “How are you?”

Her bakery became a place where people felt welcome. Nora learned courage can be quiet, too.

Lesson: Bravery grows step by step.
$er$),
    ('The River and the Lost Word', 'fairy_tale', 'easy', 8, 11, ARRAY['English'], NULL, 'E-RAISER Seed', 2026, 'en', $er$
A boy named Ken forgot a simple word: “thank you.” He became impatient and rude without noticing.

One day, he dropped his notebook into the river. A fisher helped him retrieve it. Ken opened his mouth, but no “thank you” came out.

That night, Ken dreamed the river was speaking. “Words are bridges,” the river said. “Without them, people feel far away.”

Ken woke up and practiced. He thanked his mother, his teacher, and his friends. Each “thank you” felt like a small bridge built.

Lesson: Polite words keep hearts connected.
$er$),
    ('The Forest of Friendly Shadows', 'fairy_tale', 'very_easy', 7, 9, ARRAY['English'], NULL, 'E-RAISER Seed', 2026, 'en', $er$
Mina was afraid of shadows. At night, she imagined scary shapes on the wall.

Her grandmother gave her a small flashlight. “Let’s look closely,” she said.

They made shadow animals with their hands—rabbits, birds, and a silly dinosaur. Mina laughed as the shadows danced.

The next night, Mina saw a shadow and remembered: “It can be friendly.”

Lesson: Fear becomes smaller when you understand it.
$er$),
    ('The Golden Chalk', 'fairy_tale', 'easy', 9, 12, ARRAY['English'], NULL, 'E-RAISER Seed', 2026, 'en', $er$
A teacher found a piece of golden chalk. Whatever she wrote became real—briefly.

She could write “cookies,” but instead she wrote “confidence.” Students stood taller. She wrote “patience,” and the classroom felt calmer.

When the chalk grew smaller, the teacher wrote “practice.” She told the class, “Magic helps once, but practice helps forever.”

The chalk disappeared, but the habits stayed.

Lesson: Skills grow through practice, not shortcuts.
$er$),
    ('The Umbrella That Shared', 'fairy_tale', 'very_easy', 7, 8, ARRAY['English'], NULL, 'E-RAISER Seed', 2026, 'en', $er$
During a rainy day, Aya had a big umbrella. Many classmates had none.

Aya moved closer so two friends could fit. Then she welcomed one more. They walked carefully, shoulder to shoulder, and reached school dry.

After class, someone offered Aya a snack to thank her. Aya smiled and shared it too.

Lesson: Sharing makes rainy days brighter.
$er$),
    ('The Mountain of Small Steps', 'fairy_tale', 'easy', 10, 12, ARRAY['English'], NULL, 'E-RAISER Seed', 2026, 'en', $er$
Jiro wanted to climb a mountain in one day. He ran fast and became tired.

An old guide said, “A mountain is not defeated. It is understood.”

The guide taught Jiro to rest, drink water, and take steady steps. Jiro reached the top at sunset. He did not feel like a hero—he felt grateful.

Lesson: Big goals are reached through steady effort.
$er$),
    ('Juan Tamad at ang Bayabas', 'alamat', 'very_easy', 7, 9, ARRAY['Filipino'], NULL, 'E-RAISER Seed', 2026, 'fil', $er$
Si Juan Tamad ay mahilig humiga sa ilalim ng puno. Isang araw, nakakita siya ng bayabas na hinog na hinog.

“Hintayin ko na lang mahulog,” sabi niya. Ngunit matagal itong hindi nahuhulog.

Dumaan ang isang matanda at sinabi, “Juan, mas mabilis kung aakyat ka at pipitas.”

Napaisip si Juan. Unti-unti siyang tumayo at sinubukang umakyat. Nahihirapan siya, pero hindi siya sumuko. Nang mapitas niya ang bayabas, mas masarap ito dahil pinaghirapan niya.

Aral: Mas mabuti ang magsikap kaysa maghintay lang.
$er$),
    ('Alamat ng Bituin sa Ilog', 'alamat', 'easy', 8, 12, ARRAY['Filipino'], NULL, 'E-RAISER Seed', 2026, 'fil', $er$
Noong unang panahon, may batang si Tala na laging tumutulong sa mga mangingisda. Kapag gabi, nagdadala siya ng ilawan para makita ang daan pauwi.

Isang gabi, malakas ang ulan at halos hindi na makita ang ilog. Nagdasal si Tala: “Sana’y magkaroon ng liwanag sa tubig para hindi maligaw ang mga tao.”

Kinaumagahan, may kumikislap na parang bituin sa ibabaw ng ilog tuwing gabi. Tinawag itong “bituin sa ilog,” at nagsilbing gabay sa mga umuuwi.

Aral: Ang tunay na liwanag ay galing sa malasakit.
$er$),
    ('Alamat ng Kulay ng Bahaghari', 'alamat', 'easy', 7, 10, ARRAY['Filipino'], NULL, 'E-RAISER Seed', 2026, 'fil', $er$
May magkakaibigang ulap na laging nag-aaway kung sino ang pinakamaganda. Ang isa’y gustong puti lang, ang isa’y gustong asul lang.

Dumating ang araw na napagod ang araw at halos wala nang init. Nalungkot ang mundo. Nagkasundo ang mga ulap na pagsamahin ang kanilang kulay upang mapasaya ang mga tao.

Pagkatapos ng ulan, lumitaw ang bahaghari—maraming kulay, iisang ganda.

Aral: Mas maganda ang pagkakaisa kaysa pagtatalo.
$er$),
    ('Alamat ng Paruparo sa Hardin', 'alamat', 'very_easy', 7, 9, ARRAY['Filipino'], NULL, 'E-RAISER Seed', 2026, 'fil', $er$
May batang si Lani na mahilig manghuli ng insekto. Isang araw, nahuli niya ang isang uod at ikinulong sa garapon.

Umiyak ang uod, “Gusto kong makita ang araw.”

Naawa si Lani at pinalaya ang uod sa halaman. Makalipas ang ilang araw, bumalik ang uod—ngunit isa na itong paruparo na makukulay ang pakpak.

“Salamat,” sabi ng paruparo, at lumipad palayo.

Aral: Kapag nagbigay ka ng kalayaan, bumabalik ang kabutihan.
$er$),
    ('Alamat ng Lapis na Hindi Nauubos', 'alamat', 'easy', 9, 12, ARRAY['Filipino'], NULL, 'E-RAISER Seed', 2026, 'fil', $er$
May estudyanteng si Marco na laging walang lapis. Humihiram siya, pero hindi nagbabalik.

Isang araw, binigyan siya ng guro ng lapis at sabi, “Ito ay hindi mauubos kapag ginagamit sa tama.”

Ginamit ni Marco ang lapis sa pag-aaral at sa pagsulat ng mabubuting salita. Ngunit nang gamitin niya ito sa panlilinlang, biglang naputol at hindi na muli.

Aral: Ang talino ay para sa kabutihan, hindi panlalamang.
$er$),
    ('Alamat ng Aklat na Kumakanta', 'alamat', 'very_easy', 7, 8, ARRAY['Filipino'], NULL, 'E-RAISER Seed', 2026, 'fil', $er$
May lumang aklat sa silid-aralan na halos walang nagbabasa. Isang gabi, narinig ng bantay ang mahinang awit.

Kinaumagahan, binuksan ni Ana ang aklat. Habang binabasa niya ang mga salita, parang may musika sa hangin. Natuwa ang mga kaklase at sumabay sa pagbasa.

Simula noon, tuwing may nagbabasa nang may puso, “kumakanta” ang aklat—hindi sa tunog, kundi sa saya sa klase.

Aral: Mas masaya ang pagkatuto kapag sabay-sabay at may interes.
$er$),
    ('Alamat ng Krayola at ang Kulay ng Pag-asa', 'alamat', 'easy', 8, 11, ARRAY['Filipino'], NULL, 'E-RAISER Seed', 2026, 'fil', $er$
Sa isang kahon ng krayola, may kulay abong krayola na malungkot. Sabi niya, “Wala akong saysay. Hindi ako kasing saya ng dilaw o pula.”

Isang araw, gumuhit ang bata ng ulap at ulan. Kailangan niya ng kulay abo. Nang matapos, nagdagdag siya ng bahaghari at araw.

“Ikaw ang dahilan kung bakit mas lalong gumanda ang larawan,” sabi ng bata.

Aral: Lahat ng tao ay may mahalagang bahagi.
$er$),
    ('Alamat ng Puno ng Mangga sa Paaralan', 'alamat', 'very_easy', 7, 9, ARRAY['Filipino'], NULL, 'E-RAISER Seed', 2026, 'fil', $er$
May maliit na punla ng mangga sa likod ng paaralan. Araw-araw, dinidiligan ito ni Ben at nililinis ang paligid.

May mga batang tumatawa, “Walang mangyayari diyan.”

Pagkalipas ng panahon, lumaki ang puno at namunga. Nagkaroon ng lilim para sa mga nag-aaral at prutas para sa lahat.

Aral: Ang tiyaga ay nagbubunga.
$er$),
    ('Alamat ng Kandilang May Pasensya', 'alamat', 'easy', 10, 12, ARRAY['Filipino'], NULL, 'E-RAISER Seed', 2026, 'fil', $er$
May kandilang laging nagmamadali. Gusto niyang maging pinakamaliwanag agad, kaya mabilis siyang nauubos.

Napansin siya ng isang lampara. “Kung dahan-dahan ang sindi, mas tatagal ang liwanag mo,” sabi nito.

Sinubukan ng kandila na maging kalmado. Mas tumagal ang kanyang liwanag at mas marami siyang natulungan sa gabi.

Aral: Ang pasensya ay nagpapalakas at nagpapahaba ng serbisyo.
$er$),
    ('Alamat ng Salitang “Salamat”', 'alamat', 'very_easy', 7, 12, ARRAY['Filipino'], NULL, 'E-RAISER Seed', 2026, 'fil', $er$
May batang si Niko na bihirang magsabi ng “salamat.” Kapag tinutulungan siya, tumatango lang siya.

Isang araw, tinulungan siya ng kaibigan niyang si Mira sa proyekto. Pag-uwi, naramdaman ni Niko na may kulang.

Bumalik siya at sinabi, “Mira, salamat.”

Ngumiti si Mira. Parang gumaan ang puso ni Niko. Napansin niyang mas masaya ang mga tao kapag may pasasalamat.

Aral: Ang “salamat” ay maliit na salita na malaking kabutihan.
$er$)
  returning id, title
)
insert into public.quizzes (story_id, questions)
select ins.id,
  case ins.title
    when 'The Lantern of Kindness' then '[{"prompt": "Who found the old lantern?", "choices": ["Lila", "Milo", "Nora", "Ken"], "answer_index": 0}, {"prompt": "When did the lantern glow brighter?", "choices": ["When Lila did kind acts", "When it was hidden", "When it rained", "When it broke"], "answer_index": 0}, {"prompt": "What happened during the storm?", "choices": ["The village lost its lights", "The river dried up", "The bridge grew taller", "The bakery closed"], "answer_index": 0}, {"prompt": "How did Lila help others at night?", "choices": ["She guided neighbors with the lantern", "She sold candy", "She painted the walls", "She ran away"], "answer_index": 0}, {"prompt": "What is the lesson of the story?", "choices": ["Kindness can guide people", "Never share food", "Rush all the time", "Be noisy to be heard"], "answer_index": 0}]'::jsonb
    when 'The Three Gentle Wishes' then '[{"prompt": "How many wishes did Milo have?", "choices": ["One", "Two", "Three", "Ten"], "answer_index": 2}, {"prompt": "What was Milo’s first wish?", "choices": ["Candy for himself", "Warm soup for homes in need", "A new bicycle", "A bigger house"], "answer_index": 1}, {"prompt": "What did Milo wish for second?", "choices": ["Clean water for the village", "A pet dragon", "A fast car", "More homework"], "answer_index": 0}, {"prompt": "What problem happened later?", "choices": ["The bridge broke in strong wind", "The sun disappeared forever", "The school moved away", "The river turned to stone"], "answer_index": 0}, {"prompt": "What is the lesson?", "choices": ["Use gifts to help others", "Always keep wishes secret", "Never help neighbors", "Only think of yourself"], "answer_index": 0}]'::jsonb
    when 'The Clock That Loved Quiet' then '[{"prompt": "What did the family complain about?", "choices": ["The clock ticked loudly", "The lantern was dim", "The book was missing", "The bridge was weak"], "answer_index": 0}, {"prompt": "Who helped the clock feel calmer?", "choices": ["Ina", "Lila", "Mina", "Aya"], "answer_index": 0}, {"prompt": "What did Ina start each afternoon?", "choices": ["A quiet hour", "A running contest", "A loud concert", "A storm drill"], "answer_index": 0}, {"prompt": "What did people do during quiet hour?", "choices": ["Read and rest", "Shout and race", "Break things", "Ignore each other"], "answer_index": 0}, {"prompt": "What lesson does the story teach?", "choices": ["Quiet time can help everyone", "Noise is always best", "Time should stop", "Clocks should be hidden"], "answer_index": 0}]'::jsonb
    when 'The Paper Boat Hero' then '[{"prompt": "What did Tom make?", "choices": ["A paper boat", "A wooden box", "A golden chalk", "A big umbrella"], "answer_index": 0}, {"prompt": "Who did the paper boat help?", "choices": ["A beetle", "A dragon", "A king", "A cat"], "answer_index": 0}, {"prompt": "Where did the boat travel?", "choices": ["In a stream", "In the sky", "On a road", "Inside a cave"], "answer_index": 0}, {"prompt": "What did Tom do to help?", "choices": ["Moved a stick away", "Tore the boat", "Threw stones", "Ran home"], "answer_index": 0}, {"prompt": "Lesson:", "choices": ["Small help matters", "Never watch streams", "Always give up", "Do not pay attention"], "answer_index": 0}]'::jsonb
    when 'The Bakery of Brave Smiles' then '[{"prompt": "What was Nora’s job?", "choices": ["Baker", "Fisher", "Guide", "Painter"], "answer_index": 0}, {"prompt": "What did Nora fear?", "choices": ["Talking to customers", "Reading books", "Walking outside", "Baking bread"], "answer_index": 0}, {"prompt": "What advice did the traveler give?", "choices": ["One brave smile a day", "Hide forever", "Stop baking", "Move away"], "answer_index": 0}, {"prompt": "What happened to the bakery?", "choices": ["It felt welcoming", "It became dark", "It closed", "It turned into a river"], "answer_index": 0}, {"prompt": "Lesson:", "choices": ["Courage grows step by step", "Never smile", "Always shout", "Avoid people"], "answer_index": 0}]'::jsonb
    when 'The River and the Lost Word' then '[{"prompt": "Which word did Ken forget?", "choices": ["Thank you", "Goodbye", "Please", "Hello"], "answer_index": 0}, {"prompt": "Who helped Ken at the river?", "choices": ["A fisher", "A dragon", "A king", "A robot"], "answer_index": 0}, {"prompt": "What did the river say in Ken’s dream?", "choices": ["Words are bridges", "Fish can fly", "Time stops", "Mountains talk"], "answer_index": 0}, {"prompt": "What did Ken do after the dream?", "choices": ["Practiced saying thank you", "Stopped speaking", "Broke his notebook", "Ran away"], "answer_index": 0}, {"prompt": "Lesson:", "choices": ["Polite words connect people", "Never help anyone", "Always be rude", "Forget words on purpose"], "answer_index": 0}]'::jsonb
    when 'The Forest of Friendly Shadows' then '[{"prompt": "What was Mina afraid of?", "choices": ["Shadows", "Books", "Rainbows", "Bread"], "answer_index": 0}, {"prompt": "Who helped Mina?", "choices": ["Her grandmother", "A traveler", "A teacher", "A baker"], "answer_index": 0}, {"prompt": "What tool did they use?", "choices": ["A flashlight", "A hammer", "A phone", "A broom"], "answer_index": 0}, {"prompt": "What did they make with hands?", "choices": ["Shadow animals", "Paper boats", "Golden chalk", "Umbrellas"], "answer_index": 0}, {"prompt": "Lesson:", "choices": ["Understanding makes fear smaller", "Fear should grow", "Never laugh", "Avoid light"], "answer_index": 0}]'::jsonb
    when 'The Golden Chalk' then '[{"prompt": "Who found the golden chalk?", "choices": ["A teacher", "A student", "A king", "A clock"], "answer_index": 0}, {"prompt": "What happened when she wrote with it?", "choices": ["Words became real briefly", "It turned into water", "It sang loudly", "It disappeared immediately"], "answer_index": 0}, {"prompt": "What did she write to help the class?", "choices": ["Confidence and patience", "Noise and rush", "Anger and fear", "Hunger and cold"], "answer_index": 0}, {"prompt": "What message did she teach?", "choices": ["Practice helps forever", "Magic is enough", "Never study", "Always take shortcuts"], "answer_index": 0}, {"prompt": "Lesson:", "choices": ["Skills grow through practice", "Only magic matters", "Never try again", "Stop learning"], "answer_index": 0}]'::jsonb
    when 'The Umbrella That Shared' then '[{"prompt": "What did Aya have on a rainy day?", "choices": ["A big umbrella", "A lantern", "A paper boat", "A golden chalk"], "answer_index": 0}, {"prompt": "What did Aya do with it?", "choices": ["Shared it with classmates", "Hid it", "Sold it", "Broke it"], "answer_index": 0}, {"prompt": "How did they walk to school?", "choices": ["Carefully together", "Separately in fear", "By swimming", "By flying"], "answer_index": 0}, {"prompt": "What did someone offer Aya after class?", "choices": ["A snack", "A dragon", "A bridge", "A clock"], "answer_index": 0}, {"prompt": "Lesson:", "choices": ["Sharing makes days brighter", "Never share", "Always rush", "Avoid friends"], "answer_index": 0}]'::jsonb
    when 'The Mountain of Small Steps' then '[{"prompt": "What did Jiro want to do?", "choices": ["Climb a mountain quickly", "Build a bridge", "Bake bread", "Catch shadows"], "answer_index": 0}, {"prompt": "What happened when he ran fast?", "choices": ["He became tired", "He flew", "He won a prize", "He found a lantern"], "answer_index": 0}, {"prompt": "Who gave advice to Jiro?", "choices": ["An old guide", "A king", "A robot", "A beetle"], "answer_index": 0}, {"prompt": "What did the guide teach?", "choices": ["Steady steps and rest", "Always sprint", "Never drink water", "Stop halfway"], "answer_index": 0}, {"prompt": "Lesson:", "choices": ["Big goals need steady effort", "Always rush", "Never rest", "Give up early"], "answer_index": 0}]'::jsonb
    when 'Juan Tamad at ang Bayabas' then '[{"prompt": "Sino ang pangunahing tauhan sa kuwento?", "choices": ["Juan Tamad", "Lani", "Tala", "Marco"], "answer_index": 0}, {"prompt": "Ano ang hinihintay ni Juan?", "choices": ["Mahulog ang bayabas", "Umulan", "Dumating ang guro", "Lumipad ang puno"], "answer_index": 0}, {"prompt": "Ano ang sinabi ng matanda?", "choices": ["Akyat at pitasin ang bayabas", "Itapon ang bayabas", "Matulog ka lang", "Umalis ka"], "answer_index": 0}, {"prompt": "Ano ang ginawa ni Juan sa huli?", "choices": ["Umakyat at pinitas ang bayabas", "Naghintay maghapon", "Umiiyak", "Umatras"], "answer_index": 0}, {"prompt": "Ano ang aral?", "choices": ["Mas mabuti ang magsikap", "Huwag kumain ng prutas", "Laging maghintay", "Huwag makinig"], "answer_index": 0}]'::jsonb
    when 'Alamat ng Bituin sa Ilog' then '[{"prompt": "Sino si Tala?", "choices": ["Batang tumutulong sa mangingisda", "Isang ulap", "Isang kandila", "Isang krayola"], "answer_index": 0}, {"prompt": "Ano ang dala ni Tala tuwing gabi?", "choices": ["Ilawan", "Bayabas", "Kahon ng krayola", "Lapis"], "answer_index": 0}, {"prompt": "Ano ang ipinagdasal ni Tala?", "choices": ["Liwanag sa tubig para gabay", "Maraming kendi", "Malaking bahay", "Maging hari"], "answer_index": 0}, {"prompt": "Ano ang lumitaw sa ilog tuwing gabi?", "choices": ["Kumikislap na parang bituin", "Isda na lumilipad", "Puno ng mangga", "Bahaghari"], "answer_index": 0}, {"prompt": "Ano ang aral?", "choices": ["Liwanag ay galing sa malasakit", "Masama ang ulan", "Ilog ay nakakatakot", "Huwag tumulong"], "answer_index": 0}]'::jsonb
    when 'Alamat ng Kulay ng Bahaghari' then '[{"prompt": "Sino ang laging nag-aaway?", "choices": ["Magkakaibigang ulap", "Mga isda", "Mga lapis", "Mga punla"], "answer_index": 0}, {"prompt": "Bakit nalungkot ang mundo?", "choices": ["Napagod ang araw at kulang ang init", "Nawala ang ilog", "Naubos ang prutas", "Walang paaralan"], "answer_index": 0}, {"prompt": "Ano ang ginawa ng mga ulap?", "choices": ["Pinagsama ang kanilang kulay", "Nagtago sa bundok", "Naghiwa-hiwalay", "Nagpalipad ng bangka"], "answer_index": 0}, {"prompt": "Ano ang lumitaw pagkatapos ng ulan?", "choices": ["Bahaghari", "Puno ng mangga", "Kandila", "Garapon"], "answer_index": 0}, {"prompt": "Aral:", "choices": ["Mas maganda ang pagkakaisa", "Mas mabuti ang away", "Huwag magpakulay", "Laging mag-isa"], "answer_index": 0}]'::jsonb
    when 'Alamat ng Paruparo sa Hardin' then '[{"prompt": "Ano ang hilig ni Lani sa simula?", "choices": ["Manghuli ng insekto", "Magbake", "Umakyat ng bundok", "Maglayag"], "answer_index": 0}, {"prompt": "Ano ang ikinulong niya?", "choices": ["Uod", "Isda", "Krayola", "Lapis"], "answer_index": 0}, {"prompt": "Ano ang ginawa ni Lani sa huli?", "choices": ["Pinalaya ang uod", "Itinapon ang garapon", "Tinago ang uod", "Pinatay ang uod"], "answer_index": 0}, {"prompt": "Ano ang bumalik makalipas ang ilang araw?", "choices": ["Paruparo na makulay", "Ulap", "Bayabas", "Kandila"], "answer_index": 0}, {"prompt": "Aral:", "choices": ["Kabutihan ay bumabalik", "Masama ang kalayaan", "Huwag tumulong", "Laging manghuli"], "answer_index": 0}]'::jsonb
    when 'Alamat ng Lapis na Hindi Nauubos' then '[{"prompt": "Ano ang ugali ni Marco dati?", "choices": ["Humihiram pero di nagbabalik", "Masipag magbasa", "Mahilig magtanim", "Mahilig magpasalamat"], "answer_index": 0}, {"prompt": "Ano ang ibinigay ng guro kay Marco?", "choices": ["Lapis", "Ilawan", "Kandila", "Krayola"], "answer_index": 0}, {"prompt": "Kailan hindi mauubos ang lapis?", "choices": ["Kapag ginagamit sa tama", "Kapag itinatago", "Kapag binabali", "Kapag ipinapamigay"], "answer_index": 0}, {"prompt": "Ano ang nangyari nang gamitin sa panlilinlang?", "choices": ["Naputol at hindi na muli", "Naging ginto", "Lumipad", "Naging bahaghari"], "answer_index": 0}, {"prompt": "Aral:", "choices": ["Talino ay para sa kabutihan", "Masaya ang panlilinlang", "Huwag mag-aral", "Laging manglamang"], "answer_index": 0}]'::jsonb
    when 'Alamat ng Aklat na Kumakanta' then '[{"prompt": "Saan ang lumang aklat?", "choices": ["Sa silid-aralan", "Sa ilog", "Sa bundok", "Sa kahon"], "answer_index": 0}, {"prompt": "Ano ang narinig ng bantay sa gabi?", "choices": ["Mahinang awit", "Malakas na sigaw", "Tunog ng ulan", "Tawa ng ulap"], "answer_index": 0}, {"prompt": "Sino ang nagbukas at nagbasa?", "choices": ["Ana", "Ben", "Niko", "Tala"], "answer_index": 0}, {"prompt": "Kailan “kumakanta” ang aklat?", "choices": ["Kapag may nagbabasa nang may puso", "Kapag sarado", "Kapag basa", "Kapag itinatapon"], "answer_index": 0}, {"prompt": "Aral:", "choices": ["Mas masaya ang pagkatuto kapag may interes", "Huwag magbasa", "Laging mag-isa", "Iwasan ang klase"], "answer_index": 0}]'::jsonb
    when 'Alamat ng Krayola at ang Kulay ng Pag-asa' then '[{"prompt": "Aling krayola ang malungkot?", "choices": ["Kulay abo", "Dilaw", "Pula", "Asul"], "answer_index": 0}, {"prompt": "Bakit siya malungkot?", "choices": ["Akala niya wala siyang saysay", "Naubos na siya", "Nabasag siya", "Nawala siya"], "answer_index": 0}, {"prompt": "Saan siya naging mahalaga?", "choices": ["Sa pagguhit ng ulap at ulan", "Sa pagluluto", "Sa pag-akyat ng puno", "Sa paglayag"], "answer_index": 0}, {"prompt": "Ano ang sinabi ng bata?", "choices": ["Ikaw ang dahilan kung bakit gumanda ang larawan", "Wala kang silbi", "Itapon ka na", "Huwag ka nang bumalik"], "answer_index": 0}, {"prompt": "Aral:", "choices": ["Lahat ay may mahalagang bahagi", "May saysay lang ang masaya", "Mas mabuti ang inggit", "Huwag tumulong"], "answer_index": 0}]'::jsonb
    when 'Alamat ng Puno ng Mangga sa Paaralan' then '[{"prompt": "Ano ang inaalagaan ni Ben?", "choices": ["Punla ng mangga", "Kandila", "Lapis", "Ilawan"], "answer_index": 0}, {"prompt": "Ano ang ginagawa niya araw-araw?", "choices": ["Dinidiligan at nililinis", "Sinisira", "Itinatago", "Ipinapamigay"], "answer_index": 0}, {"prompt": "Ano ang sabi ng ibang bata?", "choices": ["Walang mangyayari", "Magiging hari si Ben", "Lulubog ang ilog", "Aawit ang aklat"], "answer_index": 0}, {"prompt": "Ano ang nangyari sa huli?", "choices": ["Lumaki at namunga ang puno", "Nawala ang punla", "Naging bato", "Naging ulap"], "answer_index": 0}, {"prompt": "Aral:", "choices": ["Ang tiyaga ay nagbubunga", "Huwag magtanim", "Laging tumawa", "Iwasan ang pag-aaral"], "answer_index": 0}]'::jsonb
    when 'Alamat ng Kandilang May Pasensya' then '[{"prompt": "Ano ang ugali ng kandila sa simula?", "choices": ["Nagmamadali", "Tahimik", "Masaya", "Tamad"], "answer_index": 0}, {"prompt": "Ano ang nangyayari kapag nagmamadali siya?", "choices": ["Mabilis siyang nauubos", "Lumalakas siya", "Nagiging krayola", "Nagiging ilog"], "answer_index": 0}, {"prompt": "Sino ang nagbigay ng payo?", "choices": ["Lampara", "Ulap", "Mangingisda", "Puno"], "answer_index": 0}, {"prompt": "Ano ang natutuhan ng kandila?", "choices": ["Maging kalmado para tumagal", "Mas bilisan pa", "Itigil ang pagliwanag", "Magtago"], "answer_index": 0}, {"prompt": "Aral:", "choices": ["Ang pasensya ay nagpapalakas", "Laging magmadali", "Masama ang kalmado", "Huwag makinig"], "answer_index": 0}]'::jsonb
    when 'Alamat ng Salitang “Salamat”' then '[{"prompt": "Ano ang bihirang sabihin ni Niko?", "choices": ["Salamat", "Paalam", "Kumusta", "Sige"], "answer_index": 0}, {"prompt": "Sino ang tumulong kay Niko sa proyekto?", "choices": ["Mira", "Ben", "Ana", "Marco"], "answer_index": 0}, {"prompt": "Ano ang naramdaman ni Niko pag-uwi?", "choices": ["May kulang", "Galit", "Busog", "Antok"], "answer_index": 0}, {"prompt": "Ano ang ginawa niya pagkatapos?", "choices": ["Bumalik at nagsabi ng salamat", "Nagtagal sa bahay", "Nagtago", "Nag-away"], "answer_index": 0}, {"prompt": "Aral:", "choices": ["Ang salamat ay maliit pero malaking kabutihan", "Huwag magpasalamat", "Mas mabuti ang tahimik", "Iwasan ang kaibigan"], "answer_index": 0}]'::jsonb
    else '[]'::jsonb
  end as questions
from ins;

