
import { supabase, requireAuth, getProfile, toast, qs, escapeHtml } from "./supabaseClient.js";
import { wireTopbar } from "./ui.js";

await requireAuth();
await wireTopbar();

const msg = qs("#msg");
const attemptsGrid = qs("#attempts");
const storySelect = qs("#storySelect");
const recsGrid = qs("#recsGrid");

function defaultCover(story_type){
  return story_type === "alamat" ? "assets/covers/alamat.svg" : "assets/covers/fairy_tale.svg";
}

const profile = await getProfile();
if (profile.chosen_role !== "teacher" && !profile.is_admin){
  location.href = "role.html";
}

async function loadAttempts(){
  // Teachers can view attempts summary (policy controlled)
  const { data, error } = await supabase
    .from("attempts")
    .select("id, score, total, created_at, user_id, stories(title, cover_url, story_type), profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    attemptsGrid.innerHTML = `<div class="card"><b>Not allowed to view attempts.</b><div class="small muted">Ask admin to enable teacher viewing policy.</div></div>`;
    return;
  }

  if (!data || data.length === 0){
    attemptsGrid.innerHTML = `<div class="card"><b>No attempts yet.</b></div>`;
    return;
  }

  attemptsGrid.innerHTML = data.map(a=>{
    const date = new Date(a.created_at).toLocaleString();
    const student = a.profiles?.full_name || "Student";
    const title = a.stories?.title || "Story";
    const cover = a.stories?.cover_url || defaultCover(a.stories?.story_type || "fairy_tale");
    return `<article class="card">
      <div class="card-title">
        <h3 style="margin:0">${escapeHtml(title)}</h3>
        <span class="chip">${escapeHtml(`${a.score}/${a.total}`)}</span>
      </div>
      <div class="row" style="margin-top:10px; align-items:center;">
        <img class="cover-thumb" src="${escapeHtml(cover)}" alt="">
        <div class="small muted">${escapeHtml(student)} • ${escapeHtml(date)}</div>
      </div>
    </article>`;
  }).join("");
}

async function loadStories(){
  const { data, error } = await supabase.from("stories").select("id, title").order("title");
  if (error) throw error;
  storySelect.innerHTML = (data||[]).map(s=>`<option value="${s.id}">${escapeHtml(s.title)}</option>`).join("");
}



async function loadRecs(){
  const { data, error } = await supabase
    .from("recommendations")
    .select("id, grade_level, note, created_at, stories(title, cover_url, story_type)")
    .order("created_at", { ascending: false })
    .limit(36);

  if (error){
    if (recsGrid) recsGrid.innerHTML = `<div class="card"><b>Could not load recommendations.</b><div class="small muted">${escapeHtml(error.message)}</div></div>`;
    return;
  }

  if (!recsGrid) return;
  if (!data || data.length === 0){
    recsGrid.innerHTML = `<div class="card"><b>No recommendations yet.</b><div class="small muted">Use the form above to recommend a story.</div></div>`;
    return;
  }

  recsGrid.innerHTML = data.map(r=>{
    const title = r.stories?.title || "Story";
    const cover = r.stories?.cover_url || defaultCover(r.stories?.story_type || "fairy_tale");
    const grade = r.grade_level ? `Grade ${r.grade_level}` : "All grades";
    const note = r.note ? escapeHtml(r.note) : "";
    return `<article class="card">
      <div class="card-title">
        <h3 style="margin:0">${escapeHtml(title)}</h3>
        <span class="chip">${escapeHtml(grade)}</span>
      </div>
      <div class="row" style="margin-top:10px; align-items:center;">
        <img class="cover-thumb" src="${escapeHtml(cover)}" alt="">
        <div class="small muted">${note ? note : "No note"}</div>
      </div>
      <div class="row" style="margin-top:12px;">
        <button class="btn danger" data-del-rec="${r.id}">Delete</button>
      </div>
    </article>`;
  }).join("");

  recsGrid.querySelectorAll("[data-del-rec]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-del-rec");
      if (!confirm("Delete this recommendation?")) return;
      const { error: delErr } = await supabase.from("recommendations").delete().eq("id", id);
      if (delErr) return toast(msg, delErr.message, "warn");
      toast(msg, "Recommendation deleted.", "notice");
      await loadRecs();
    });
  });
}

qs("#recBtn").addEventListener("click", async ()=>{
  const story_id = storySelect.value;
  const gradeVal = qs("#gradeSelect").value;
  const grade_level = gradeVal ? Number(gradeVal) : null;
  const note = qs("#note").value.trim();

  if (!story_id) return toast(msg, "Choose a story.", "warn");

  const { error } = await supabase.from("recommendations").insert({
    story_id,
    grade_level,
    note
  });

  if (error) return toast(msg, error.message, "warn");
  toast(msg, "Recommendation saved. Students will see it as ⭐ Recommended.", "notice");
  qs("#note").value = "";
  await loadRecs();
});

try{
  await loadStories();
  await loadAttempts();
  await loadRecs();
}catch(e){
  toast(msg, e.message || "Could not load teacher tools.", "warn");
}
