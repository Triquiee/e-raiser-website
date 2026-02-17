import { supabase, requireAuth, getProfile, toast, qs, escapeHtml } from "./supabaseClient.js";
import { wireTopbar } from "./ui.js";

await requireAuth();
await wireTopbar();

const msg = qs("#msg");
const grid = qs("#grid");
const search = qs("#search");
const dlg = qs("#storyDlg");

let profile = await getProfile();
if (!profile?.is_admin) {
  grid.innerHTML = `<div class="card"><b>Admin only.</b><div class="small muted">Set your profile.is_admin=true in Supabase to use this page.</div></div>`;
  const usersGrid = qs("#usersGrid");
  if (usersGrid) usersGrid.innerHTML = "";
  throw new Error("Admin only");
}

search.addEventListener("input", render);

let stories = [];

function defaultCover(story_type){
  return story_type === "alamat" ? "assets/covers/alamat.svg" : "assets/covers/fairy_tale.svg";
}

async function loadStories() {
  const { data, error } = await supabase
    .from("stories")
    .select("id, title, story_type, difficulty, grade_min, grade_max, subject_tags, cover_url, cover_path, author, year_published, language, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  stories = data || [];
}

function match(s) {
  const q = (search.value || "").trim().toLowerCase();
  if (!q) return true;
  const hay = `${s.title} ${(s.author||"")} ${(s.subject_tags||[]).join(" ")}`.toLowerCase();
  return hay.includes(q);
}

function card(s) {
  const typeLabel = s.story_type === "alamat" ? "Alamat" : "Fairy tale";
  const grade = (s.grade_min && s.grade_max) ? `G${s.grade_min}–G${s.grade_max}` : "All grades";
  const cover = s.cover_url || defaultCover(s.story_type);
  const author = s.author ? escapeHtml(s.author) : "—";
  const year = s.year_published ? escapeHtml(String(s.year_published)) : "—";

  return `<article class="card story-card" style="cursor:pointer" data-edit="${s.id}">
    <img class="cover-thumb" src="${escapeHtml(cover)}" alt="">
    <div>
      <div class="card-title">
        <h3 style="margin:0">${escapeHtml(s.title)}</h3>
        <span class="chip">${escapeHtml(typeLabel)}</span>
      </div>
      <div class="story-meta">
        <span class="chip">${escapeHtml(grade)}</span>
        <span class="chip">${escapeHtml((s.difficulty || "").replaceAll("_", " ") || "easy")}</span>
        <span class="chip">Author: ${author}</span>
        <span class="chip">Year: ${year}</span>
      </div>
      <div class="small muted" style="margin-top:8px;">Click to edit</div>
    </div>
  </article>`;
}

function render() {
  const filtered = stories.filter(match);
  grid.innerHTML = filtered.map(card).join("") || `<div class="card"><b>No stories.</b></div>`;
  grid.querySelectorAll("[data-edit]").forEach(el => {
    el.addEventListener("click", () => openEdit(el.getAttribute("data-edit")));
  });
}

function openDialog() {
  dlg.showModal();
}
qs("#closeDlg").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", (e) => {
  const rect = dlg.getBoundingClientRect();
  const inDialog = rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
    rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
  if (!inDialog) dlg.close();
});

function setDlg(data) {
  qs("#storyId").value = data?.id || "";
  qs("#coverPath").value = data?.cover_path || "";
  qs("#dlgTitle").textContent = data?.id ? "Edit Story" : "New Story";

  qs("#title").value = data?.title || "";
  qs("#type").value = data?.story_type || "fairy_tale";
  qs("#difficulty").value = data?.difficulty || "very_easy";
  qs("#gmin").value = data?.grade_min ?? "";
  qs("#gmax").value = data?.grade_max ?? "";
  qs("#tags").value = (data?.subject_tags || []).join(", ");

  qs("#coverUrl").value = data?.cover_url || "";
  const coverPreview = qs("#coverPreview");
  if (coverPreview) {
    const cover = (data?.cover_url || "").trim() || defaultCover(data?.story_type || "fairy_tale");
    coverPreview.src = cover;
    coverPreview.classList.remove("cover-pop");
    void coverPreview.offsetWidth;
    coverPreview.classList.add("cover-pop");
  }
  qs("#author").value = data?.author || "";
  qs("#year").value = data?.year_published ?? "";
  qs("#language").value = data?.language || (data?.story_type === "alamat" ? "fil" : "en");

  qs("#content").value = data?.content || "";
  qs("#deleteStoryBtn").disabled = !data?.id;
}

// If user changes story type and no custom cover is set, update preview to default cover
qs("#type")?.addEventListener("change", ()=>{
  const coverUrlVal = (qs("#coverUrl")?.value || "").trim();
  if (coverUrlVal) return;
  const preview = qs("#coverPreview");
  if (!preview) return;
  preview.src = defaultCover(qs("#type").value);
  preview.classList.remove("cover-pop");
  void preview.offsetWidth;
  preview.classList.add("cover-pop");
});

// ------------------------------------------------------
// COVER UPLOAD (Supabase Storage bucket: covers)
// - stores BOTH cover_url (public URL) and cover_path (storage path)
// - allows replace + delete
// ------------------------------------------------------

const COVER_BUCKET = "covers";
const coverFile = qs("#coverFile");

// live preview when selecting a file
coverFile?.addEventListener("change", () => {
  const f = coverFile.files?.[0];
  const preview = qs("#coverPreview");
  if (!f || !preview) return;
  const url = URL.createObjectURL(f);
  preview.src = url;
  preview.classList.remove("cover-pop");
  void preview.offsetWidth;
  preview.classList.add("cover-pop");
});

function slugify(name){
  return (name || "cover")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "cover";
}

function extFromFile(file){
  const n = (file?.name || "").toLowerCase();
  const m = n.match(/\.([a-z0-9]+)$/);
  if (m) return m[1];
  const t = (file?.type || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("webp")) return "webp";
  return "png";
}

async function uploadCover(){
  const story_id = qs("#storyId").value;
  if (!story_id) return toast(msg, "Save the story first (so it has an ID), then upload a cover.", "warn");

  const file = coverFile?.files?.[0];
  if (!file) return toast(msg, "Choose an image file first.", "warn");

  // Delete old cover if it exists (best-effort)
  const oldPath = (qs("#coverPath").value || "").trim();
  if (oldPath){
    try{ await supabase.storage.from(COVER_BUCKET).remove([oldPath]); }catch{}
  }

  const ext = extFromFile(file);
  const base = slugify(qs("#title").value || "story");
  const path = `stories/${story_id}/${Date.now()}-${base}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(COVER_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (upErr) return toast(msg, upErr.message || "Upload failed.", "warn");

  const { data: pub } = supabase.storage.from(COVER_BUCKET).getPublicUrl(path);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) return toast(msg, "Uploaded, but could not get public URL. Make sure bucket is PUBLIC.", "warn");

  // Save to stories table
  const { error: dbErr } = await supabase
    .from("stories")
    .update({ cover_url: publicUrl, cover_path: path })
    .eq("id", story_id);
  if (dbErr) return toast(msg, dbErr.message || "Could not save cover to story.", "warn");

  qs("#coverUrl").value = publicUrl;
  qs("#coverPath").value = path;

  const preview = qs("#coverPreview");
  if (preview){
    preview.src = publicUrl;
    preview.classList.remove("cover-pop");
    void preview.offsetWidth;
    preview.classList.add("cover-pop");
  }

  toast(msg, "Cover uploaded and saved.", "notice");
  await loadStories();
  render();
}

async function removeCover(){
  const story_id = qs("#storyId").value;
  if (!story_id) return;
  if (!confirm("Remove this cover image?")) return;

  const path = (qs("#coverPath").value || "").trim();
  if (path){
    const { error } = await supabase.storage.from(COVER_BUCKET).remove([path]);
    if (error) return toast(msg, error.message, "warn");
  }

  const { error: dbErr } = await supabase
    .from("stories")
    .update({ cover_url: null, cover_path: null })
    .eq("id", story_id);
  if (dbErr) return toast(msg, dbErr.message, "warn");

  qs("#coverUrl").value = "";
  qs("#coverPath").value = "";
  if (coverFile) coverFile.value = "";

  const preview = qs("#coverPreview");
  if (preview){
    preview.src = defaultCover(qs("#type").value);
    preview.classList.remove("cover-pop");
    void preview.offsetWidth;
    preview.classList.add("cover-pop");
  }

  toast(msg, "Cover removed.", "notice");
  await loadStories();
  render();
}

qs("#uploadCoverBtn")?.addEventListener("click", (e)=>{ e.preventDefault(); uploadCover(); });
qs("#removeCoverBtn")?.addEventListener("click", (e)=>{ e.preventDefault(); removeCover(); });

qs("#newStoryBtn").addEventListener("click", () => {
  setDlg(null);
  openDialog();
});

async function openEdit(id) {
  const { data, error } = await supabase.from("stories").select("*").eq("id", id).single();
  if (error) return toast(msg, error.message, "warn");
  setDlg(data);
  openDialog();
}

qs("#saveStoryBtn").addEventListener("click", async () => {
  const id = qs("#storyId").value || null;
  const title = qs("#title").value.trim();
  const story_type = qs("#type").value;
  const difficulty = qs("#difficulty").value;

  const grade_min = qs("#gmin").value ? Number(qs("#gmin").value) : null;
  const grade_max = qs("#gmax").value ? Number(qs("#gmax").value) : null;
  const subject_tags = qs("#tags").value.split(",").map(s => s.trim()).filter(Boolean);

  const cover_url = qs("#coverUrl").value.trim() || null;
  const cover_path = qs("#coverPath").value.trim() || null;
  const author = qs("#author").value.trim() || null;
  const year_published = qs("#year").value ? Number(qs("#year").value) : null;
  const language = qs("#language").value || (story_type === "alamat" ? "fil" : "en");

  const content = qs("#content").value.trim();

  if (!title) return toast(msg, "Title is required.", "warn");
  if (!content) return toast(msg, "Story content is required.", "warn");
  if (year_published && (year_published < 1800 || year_published > 2100)) return toast(msg, "Year published looks invalid.", "warn");

  const payload = { title, story_type, difficulty, grade_min, grade_max, subject_tags, content, cover_url, cover_path, author, year_published, language };

  let res;
  if (id) res = await supabase.from("stories").update(payload).eq("id", id);
  else res = await supabase.from("stories").insert(payload);

  if (res.error) return toast(msg, res.error.message, "warn");
  toast(msg, "Saved!", "notice");
  dlg.close();

  await loadStories();
  await loadStoryOptions();
  render();
});

qs("#deleteStoryBtn").addEventListener("click", async () => {
  const id = qs("#storyId").value;
  if (!id) return;
  if (!confirm("Delete this story? This cannot be undone.")) return;

  const { error } = await supabase.from("stories").delete().eq("id", id);
  if (error) return toast(msg, error.message, "warn");

  toast(msg, "Deleted.", "notice");
  dlg.close();
  await loadStories();
  await loadStoryOptions();
  render();
});

// ------------------------------------------------------
// SIMPLE QUIZ EDITOR (NO JSON)
// ------------------------------------------------------

const storySelect = qs("#storySelect");
const quizFormEl = qs("#quizForm");

function makeQuizCard(i) {
  const wrap = document.createElement("div");
  wrap.className = "card soft";
  wrap.style.marginTop = "12px";
  wrap.innerHTML = `
    <div class="card-title">
      <h3 style="margin:0">Question ${i + 1}</h3>
      <span class="chip">MCQ</span>
    </div>

    <div class="field">
      <label>Prompt</label>
      <input class="input q-prompt" placeholder="Type the question here..." />
    </div>

    <div class="row">
      <div style="flex:1" class="field">
        <label>A</label>
        <input class="input q-choice" data-idx="0" placeholder="Choice A" />
      </div>
      <div style="flex:1" class="field">
        <label>B</label>
        <input class="input q-choice" data-idx="1" placeholder="Choice B" />
      </div>
    </div>

    <div class="row">
      <div style="flex:1" class="field">
        <label>C</label>
        <input class="input q-choice" data-idx="2" placeholder="Choice C" />
      </div>
      <div style="flex:1" class="field">
        <label>D</label>
        <input class="input q-choice" data-idx="3" placeholder="Choice D" />
      </div>
    </div>

    <div class="field">
      <label>Correct Answer</label>
      <select class="input q-answer">
        <option value="0">A</option>
        <option value="1">B</option>
        <option value="2">C</option>
        <option value="3">D</option>
      </select>
    </div>
  `;
  return wrap;
}

function renderQuizForm() {
  quizFormEl.innerHTML = "";
  for (let i = 0; i < 5; i++) quizFormEl.appendChild(makeQuizCard(i));
}

function setFormFromQuiz(questions) {
  renderQuizForm();
  const cards = quizFormEl.querySelectorAll(".card");

  for (let i = 0; i < 5; i++) {
    const q = questions?.[i] || { prompt: "", choices: ["", "", "", ""], answer_index: 0 };
    const card = cards[i];

    card.querySelector(".q-prompt").value = q.prompt || "";
    const choiceEls = card.querySelectorAll(".q-choice");
    choiceEls.forEach((el, idx) => (el.value = (q.choices && q.choices[idx]) ? q.choices[idx] : ""));
    card.querySelector(".q-answer").value = String(q.answer_index ?? 0);
  }
}

function getQuizFromForm() {
  const cards = quizFormEl.querySelectorAll(".card");
  const questions = [];

  cards.forEach((card) => {
    const prompt = card.querySelector(".q-prompt").value.trim();
    const choices = [...card.querySelectorAll(".q-choice")].map((x) => x.value.trim());
    const answer_index = Number(card.querySelector(".q-answer").value);
    questions.push({ prompt, choices, answer_index });
  });

  // Validation
  if (questions.length !== 5) throw new Error("Quiz must have exactly 5 questions.");
  questions.forEach((q, i) => {
    if (!q.prompt) throw new Error(`Question ${i + 1}: Prompt is required.`);
    if (!Array.isArray(q.choices) || q.choices.length !== 4) throw new Error(`Question ${i + 1}: Need 4 choices.`);
    q.choices.forEach((c, idx) => {
      if (!c) throw new Error(`Question ${i + 1}: Choice ${["A", "B", "C", "D"][idx]} is required.`);
    });
    if (!(q.answer_index >= 0 && q.answer_index <= 3)) throw new Error(`Question ${i + 1}: Correct answer must be A–D.`);
  });

  return questions;
}

async function loadStoryOptions() {
  const { data, error } = await supabase.from("stories").select("id, title").order("title");
  if (error) throw error;
  storySelect.innerHTML = (data || []).map(s => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join("");
}

function sampleQuiz() {
  return [
    { prompt: "Who is the main character?", choices: ["The student", "A dragon", "A king", "A robot"], answer_index: 0 },
    { prompt: "Where did the story happen?", choices: ["In a school", "On the moon", "In a cave", "Underwater"], answer_index: 0 },
    { prompt: "What problem happened?", choices: ["Someone struggled", "A ship sank", "A fire started", "A storm froze"], answer_index: 0 },
    { prompt: "What did the character do?", choices: ["Tried again", "Gave up", "Hid", "Blamed others"], answer_index: 0 },
    { prompt: "What is the lesson?", choices: ["Keep practicing", "Never read", "Always rush", "Never help"], answer_index: 0 },
  ];
}

qs("#sampleQuizBtn").addEventListener("click", () => {
  setFormFromQuiz(sampleQuiz());
  toast(msg, "Sample quiz filled.", "notice");
});

qs("#loadQuizBtn").addEventListener("click", async () => {
  const story_id = storySelect.value;
  if (!story_id) return toast(msg, "Pick a story first.", "warn");

  const { data, error } = await supabase
    .from("quizzes")
    .select("id, questions")
    .eq("story_id", story_id)
    .maybeSingle();

  if (error) return toast(msg, error.message, "warn");

  setFormFromQuiz(data?.questions || null);
  toast(msg, data?.questions ? "Quiz loaded." : "No quiz yet. Start creating one.", "notice");
});

qs("#saveQuizBtn").addEventListener("click", async () => {
  const story_id = storySelect.value;
  if (!story_id) return toast(msg, "Choose a story.", "warn");

  let questions;
  try {
    questions = getQuizFromForm();
  } catch (e) {
    return toast(msg, e.message || "Invalid quiz.", "warn");
  }

  const { data: existing, error: exErr } = await supabase
    .from("quizzes")
    .select("id")
    .eq("story_id", story_id)
    .maybeSingle();

  if (exErr) return toast(msg, exErr.message, "warn");

  let res;
  if (existing?.id) res = await supabase.from("quizzes").update({ questions }).eq("id", existing.id);
  else res = await supabase.from("quizzes").insert({ story_id, questions });

  if (res.error) return toast(msg, res.error.message, "warn");
  toast(msg, "Quiz saved.", "notice");
});

// Init quiz form so it's ready
renderQuizForm();

// ------------------------------------------------------
// USERS MANAGEMENT (profiles only)
// ------------------------------------------------------

const usersGrid = qs("#usersGrid");
const userSearch = qs("#userSearch");
const userDlg = qs("#userDlg");

let users = [];

async function loadUsers() {
  // Requires RLS policy that allows admin to read profiles.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, chosen_role, grade_level, teacher_subject, is_admin")
    .order("full_name", { ascending: true });

  if (error) throw error;
  users = data || [];
}

function userMatch(u) {
  const q = (userSearch?.value || "").trim().toLowerCase();
  if (!q) return true;
  return (u.full_name || "").toLowerCase().includes(q) || (u.id || "").toLowerCase().includes(q);
}

function userCard(u) {
  const role = u.is_admin ? "admin" : (u.chosen_role || "(not set)");
  const grade = u.grade_level ? `G${u.grade_level}` : "—";
  return `<article class="card" style="cursor:pointer" data-user-edit="${u.id}">
    <div class="card-title">
      <h3 style="margin:0">${escapeHtml(u.full_name || "(no name)")}</h3>
      <span class="chip">${escapeHtml(role)}</span>
    </div>
    <div class="row" style="margin-top:8px; flex-wrap:wrap">
      <span class="chip">Grade: ${escapeHtml(grade)}</span>
      <span class="chip">Subject: ${escapeHtml(u.teacher_subject || "—")}</span>
    </div>
    <div class="small muted" style="margin-top:8px">User ID: ${escapeHtml(u.id)}</div>
  </article>`;
}

function renderUsers() {
  if (!usersGrid) return;
  const filtered = users.filter(userMatch);
  usersGrid.innerHTML = filtered.map(userCard).join("") || `<div class="card"><b>No users found.</b></div>`;
  usersGrid.querySelectorAll("[data-user-edit]").forEach(el => {
    el.addEventListener("click", () => openUserEdit(el.getAttribute("data-user-edit")));
  });
}

function openUserDialog() {
  if (!userDlg) return;
  userDlg.showModal();
}

qs("#closeUserDlg")?.addEventListener("click", () => userDlg?.close());
userDlg?.addEventListener("click", (e) => {
  const rect = userDlg.getBoundingClientRect();
  const inDialog = rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
    rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
  if (!inDialog) userDlg.close();
});

function setUserDlg(u) {
  qs("#userId").value = u?.id || "";
  qs("#uFullName").value = u?.full_name || "";
  qs("#uRole").value = u?.chosen_role || "";
  qs("#uGrade").value = u?.grade_level ?? "";
  qs("#uSubject").value = u?.teacher_subject || "";
  qs("#uIsAdmin").checked = !!u?.is_admin;
  qs("#uMeta").textContent = u?.id ? `User ID: ${u.id}` : "";
}

async function openUserEdit(id) {
  const u = users.find(x => x.id === id);
  if (!u) return;
  setUserDlg(u);
  openUserDialog();
}

userSearch?.addEventListener("input", renderUsers);

qs("#saveUserBtn")?.addEventListener("click", async () => {
  const id = qs("#userId").value;
  if (!id) return;

  const full_name = qs("#uFullName").value.trim();
  const chosen_role = qs("#uRole").value || null;
  const grade_level = qs("#uGrade").value ? Number(qs("#uGrade").value) : null;
  const teacher_subject = qs("#uSubject").value.trim() || null;
  const is_admin = !!qs("#uIsAdmin").checked;

  if (!full_name) return toast(msg, "Full name is required.", "warn");
  if (grade_level && (grade_level < 7 || grade_level > 12)) return toast(msg, "Grade level must be 7–12.", "warn");

  const payload = { full_name, chosen_role, grade_level, teacher_subject, is_admin };
  const { error } = await supabase.from("profiles").update(payload).eq("id", id);
  if (error) return toast(msg, error.message, "warn");

  toast(msg, "User updated.", "notice");
  userDlg?.close();
  await loadUsers();
  renderUsers();
});

// Init
try {
  await loadStories();
  await loadStoryOptions();
  render();

  await loadUsers();
  renderUsers();
} catch (e) {
  if (e?.message !== "Admin only") toast(msg, e.message || "Could not load admin tools.", "warn");
  if (usersGrid && e?.message) {
    usersGrid.innerHTML = `<div class="card"><b>Could not load users.</b>
      <div class="small muted">${escapeHtml(e.message || "RLS blocked access")}</div>
      <div class="small muted" style="margin-top:8px">Fix: ensure your Supabase RLS policy allows admins to SELECT/UPDATE from profiles.</div>
    </div>`;
  }
}
