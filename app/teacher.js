
import { supabase, requireAuth, getProfile, setUserBadge, toast, qs, escapeHtml } from "./supabaseClient.js";
import { wireTopbar } from "./ui.js";

await requireAuth();
await wireTopbar();

const msg = qs("#msg");
const subjectChip = qs("#subjectChip");
const grid = qs("#grid");
const count = qs("#count");

let profile = await getProfile();
if (profile.chosen_role !== "teacher" && !profile.is_admin){
  // If not teacher, send back to role
  location.href = "role.html";
}

let subject = profile.teacher_subject || "";

function setSubjectUI(){
  subjectChip.textContent = `Subject: ${subject || "—"}`;
}
setSubjectUI();

document.querySelectorAll("[data-subject]").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    subject = btn.getAttribute("data-subject");
    setSubjectUI();
    try{
      const { error } = await supabase.from("profiles").update({ teacher_subject: subject }).eq("id", profile.id);
      if (error) throw error;
      render();
    }catch(e){
      toast(msg, e.message || "Could not save subject.", "warn");
    }
  });
});

qs("#search").addEventListener("input", render);
qs("#type").addEventListener("change", render);
qs("#difficulty").addEventListener("change", render);

let allStories = [];

function defaultCover(story_type){
  return story_type === "alamat" ? "assets/covers/alamat.svg" : "assets/covers/fairy_tale.svg";
}


async function loadStories(){
  // Teachers can see all stories (authenticated)
  const { data, error } = await supabase
    .from("stories")
    .select("id, title, story_type, difficulty, grade_min, grade_max, subject_tags, cover_url, author, year_published, language, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  allStories = data || [];
}

function matchStory(s){
  const q = (qs("#search").value || "").trim().toLowerCase();
  const type = qs("#type").value;
  const diff = qs("#difficulty").value;

  const hay = `${s.title} ${(s.subject_tags||[]).join(" ")}`.toLowerCase();
  const okQ = !q || hay.includes(q);
  const okT = type === "all" || s.story_type === type;
  const okD = diff === "all" || s.difficulty === diff;

  const okSubject = !subject || (Array.isArray(s.subject_tags) && s.subject_tags.includes(subject));
  // If story has no subject tags, show it anyway
  const okSubFinal = okSubject || !Array.isArray(s.subject_tags) || s.subject_tags.length === 0;

  return okQ && okT && okD && okSubFinal;
}

function storyCard(s){
  const typeLabel = s.story_type === "alamat" ? "Alamat" : "Fairy tale";
  const diffLabel = s.difficulty?.replaceAll("_"," ") || "easy";
  const grade = (s.grade_min && s.grade_max) ? `G${s.grade_min}–G${s.grade_max}` : "All grades";
  const tags = (s.subject_tags || []).slice(0,2).map(t=>`<span class="chip">${escapeHtml(t)}</span>`).join(" ");
  const cover = s.cover_url || defaultCover(s.story_type);
  const author = s.author ? escapeHtml(s.author) : "—";
  const year = s.year_published ? escapeHtml(String(s.year_published)) : "—";

  return `
  <article class="card story-card" style="cursor:pointer" data-open="${s.id}">
    <img class="cover-thumb" src="${escapeHtml(cover)}" alt="">
    <div>
      <div class="card-title">
        <h3 style="margin:0">${escapeHtml(s.title)}</h3>
        <span class="chip">${escapeHtml(typeLabel)}</span>
      </div>
      <div class="story-meta">
        <span class="chip">${escapeHtml(grade)}</span>
        <span class="chip">${escapeHtml(diffLabel)}</span>
        <span class="chip">Author: ${author}</span>
        <span class="chip">Year: ${year}</span>
        ${tags}
      </div>
      <div class="small muted" style="margin-top:8px;">Open → Read → Quiz (5 items)</div>
    </div>
  </article>`;
}

function render(){
  const filtered = allStories.filter(matchStory);
  count.textContent = `${filtered.length} story/stories shown • ${allStories.length} total`;
  grid.innerHTML = filtered.map(storyCard).join("") || `<div class="card"><b>No stories found.</b><div class="small muted">Try another search/filter.</div></div>`;

  grid.querySelectorAll("[data-open]").forEach(el=>{
    el.addEventListener("click", ()=>{
      const id = el.getAttribute("data-open");
      location.href = `reading.html?story=${encodeURIComponent(id)}&from=teacher`;
    });
  });
}

try{
  await loadStories();
  render();
}catch(e){
  toast(msg, e.message || "Could not load stories.", "warn");
}
