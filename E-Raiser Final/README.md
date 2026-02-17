# E-RAISER (Kid Theme) — Full Supabase Setup

This zip is ready for a **fresh Supabase project**:
- Full database schema + RLS policies ✅
- Seed data: **20 short stories** (English + Filipino) + **5-item quizzes** ✅
- Admin page (Stories / Quizzes / Users) ✅
- Teacher tools (Recommend stories, Student Records, Delete Recommendations) ✅
- Student library with “Recommended” ⭐ and book covers ✅
- Reading view with cute frame + subtle cover “pop” animation ✅
- Text-to-Speech tries **Tagalog/Filipino voices** for Filipino stories ✅

---

## 1) Create a new Supabase project
1. Go to Supabase → create a new project.
2. Wait until it’s ready.

---

## 2) Run the database setup SQL
1. Supabase Dashboard → **SQL Editor**
2. Open the file **`supabase_setup.sql`** from this zip
3. Copy everything → paste → **RUN**

This creates:
- `profiles`, `stories`, `quizzes`, `attempts`, `recommendations`
- auto profile creation trigger on signup
- RLS policies for admin/teacher/student
- seed stories + quizzes (author: **E-RAISER Seed**)

---

## 3) Add your Supabase keys to the site
Open **`app/config.js`** and paste your project values from:

Supabase Dashboard → **Project Settings → API**
- Project URL
- **anon public key**

Then save.

---

## 4) Make yourself admin (so you can use admin.html)
1. Create an account in the site (Sign up).
2. Supabase → **Table Editor → profiles**
3. Find your row → set:
- `is_admin = true`
- (optional) `chosen_role = 'teacher'`

Now you can open:
- `admin.html` (manage stories/quizzes/users)

---

## 4.5) Enable book cover uploads (Supabase Storage)
The Admin page can upload / replace / delete cover images.

### Create the bucket
Supabase Dashboard → **Storage** → **Create bucket**
- Name: **covers**
- Public bucket: ✅ **ON** (recommended for simple websites)

### Add bucket policies (UI)
Supabase Dashboard → **Storage** → **covers** → **Policies**

Create these policies (recommended):

1) **Public can read covers**
- Operation: **SELECT**
- Target: bucket **covers**
- Policy expression:
  - `bucket_id = 'covers'`

2) **Admins can upload / replace covers**
- Operation: **INSERT**
- Policy expression:
  - `bucket_id = 'covers' AND public.is_admin(auth.uid())`

3) **Admins can delete covers**
- Operation: **DELETE**
- Policy expression:
  - `bucket_id = 'covers' AND public.is_admin(auth.uid())`

If your Supabase UI asks for a “template”, choose **Custom** and paste the expression.

> Note: Storage policies are managed from the Storage UI for most projects. Running SQL like `ALTER TABLE storage.objects ...` often fails with “must be owner of table objects”.

---

## 5) Run locally
You need a local server (JS modules won’t run by double-clicking HTML).

```bash
python -m http.server 5500
```

Open:
- http://localhost:5500/

---

## 6) Deploy to Netlify
### Option A: Drag & Drop
1. Netlify → Add new site → Deploy manually
2. Drag the **project folder** (the one containing `index.html`) into Netlify

### Option B: Git
Push to GitHub, then connect repo in Netlify.

After deploy:
Supabase → **Authentication → URL Configuration**
- Site URL: your Netlify URL
- Redirect URLs: add your Netlify URL (and include `/reset.html`)

---

## Where things are
- Student Library: `student.html`
- Teacher Dashboard: `teacher.html`
- Teacher Student Records + Recommendations: `feedback.html`
- Admin Tools: `admin.html`
- Reading View: `reading.html`
- Quiz: `quiz.html`

---

## Notes
- The **anon key is safe** in the browser because RLS policies restrict access.
- If you re-run the seed block, it deletes and recreates only seed content (`author = 'E-RAISER Seed'`).
