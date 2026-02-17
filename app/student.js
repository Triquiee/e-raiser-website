import { supabase, requireAuth, getProfile, toast, qs, escapeHtml } from "./supabaseClient.js";
import { wireTopbar } from "./ui.js";

await requireAuth();
await wireTopbar();

const msg = qs("#msg");
const gradeChip = qs("#gradeChip");
const grid = qs("#grid");
const count = qs("#count");
const recBox = qs("#recBox");

let profile = await getProfile();
if (profile?.chosen_role !== "student" && !profile?.is_admin){
  location.href = "role.html";
}

let grade = profile?.grade_level || null;

function setGradeUI(){
  gradeChip.textContent = `Grade: ${grade ?? "—"}`;
}
setGradeUI();

document.querySelectorAll("[data-grade]").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    grade = Number(btn.getAttribute("data-grade"));
    setGradeUI();
    try{
      const { error } = await supabase.from("profiles").update({ grade_level: grade }).eq("id", profile.id);
      if (error) throw error;
      await loadRecommendations();
      render();
    }catch(e){
      toast(msg, e.message || "Could not save grade level.", "warn");
    }
  });
});

qs("#search").addEventListener("input", render);
qs("#type").addEventListener("change", render);
qs("#difficulty").addEventListener("change", render);

let allStories = [];
let recommendedStoryIds = new Set();

function defaultCover(story_type){
  return story_type === "alamat" ? "assets/covers/alamat.svg" : "assets/covers/fairy_tale.svg";
}

async function loadStories(){
  const { data, error } = await supabase
    .from("stories")
    .select("id, title, story_type, difficulty, grade_min, grade_max, cover_url, author, year_published, language, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  allStories = data || [];
}

async function loadRecommendations(){
  recommendedStoryIds = new Set();
  if (!recBox) return;
  if (!grade) { recBox.hidden = true; return; }

  const { data, error } = await supabase
    .from("recommendations")
    .select("story_id, grade_level, student_id")
    .or(`grade_level.eq.${grade},grade_level.is.null,student_id.eq.${profile.id}`)
    .limit(200);

  if (error) {
    // If policies block, just hide rec section
    recBox.hidden = true;
    return;
  }
  (data || []).forEach(r => recommendedStoryIds.add(r.story_id));

  if (recommendedStoryIds.size > 0) {
    recBox.hidden = false;
    recBox.textContent = "Recommended for you: stories suggested by a teacher.";
  } else {
    recBox.hidden = true;
  }
}

function matchStory(s){
  const q = (qs("#search").value || "").trim().toLowerCase();
  const type = qs("#type").value;
  const diff = qs("#difficulty").value;

  const okQ = !q || (s.title || "").toLowerCase().includes(q);
  const okT = type === "all" || s.story_type === type;
  const okD = diff === "all" || s.difficulty === diff;

  const okGrade = !grade || (!s.grade_min && !s.grade_max) || (
    (s.grade_min ?? 0) <= grade && grade <= (s.grade_max ?? 99)
  );

  return okQ && okT && okD && okGrade;
}

function storyCard(s){
  const typeLabel = s.story_type === "alamat" ? "Alamat" : "Fairy tale";
  const diffLabel = s.difficulty?.replaceAll("_"," ") || "easy";
  const gradeLabel = (s.grade_min && s.grade_max) ? `G${s.grade_min}–G${s.grade_max}` : "All grades";
  const isRec = recommendedStoryIds.has(s.id);
  const star = isRec ? "⭐ " : "";
  const cover = s.cover_url || defaultCover(s.story_type);
  const author = s.author ? escapeHtml(s.author) : "—";
  const year = s.year_published ? escapeHtml(String(s.year_published)) : "—";
  const lang = s.language === "fil" ? "FIL" : "EN";

  return `
  <article class="card story-card" style="cursor:pointer" data-open="${s.id}">
    <img class="cover-thumb" src="${escapeHtml(cover)}" alt="">
    <div>
      <div class="card-title">
        <h3 style="margin:0">${star}${escapeHtml(s.title)}</h3>
        <span class="chip">${escapeHtml(typeLabel)}</span>
      </div>
      <div class="story-meta">
        <span class="chip">${escapeHtml(gradeLabel)}</span>
        <span class="chip">${escapeHtml(diffLabel)}</span>
        <span class="chip">Lang: ${escapeHtml(lang)}</span>
        <span class="chip">Author: ${author}</span>
        <span class="chip">Year: ${year}</span>
      </div>
      <div class="small muted" style="margin-top:8px;">Open → Read → Quiz (5 items)</div>
    </div>
  </article>`;
}

function render(){
  const filtered = allStories.filter(matchStory);

  // Put recommended first
  const sorted = filtered.sort((a,b)=>{
    const ar = recommendedStoryIds.has(a.id) ? 1 : 0;
    const br = recommendedStoryIds.has(b.id) ? 1 : 0;
    return br - ar;
  });

  count.textContent = `${sorted.length} story/stories shown • ${allStories.length} total`;
  grid.innerHTML = sorted.map(storyCard).join("") || `<div class="card"><b>No stories found.</b><div class="small muted">Try another search/filter, or set your grade.</div></div>`;

  grid.querySelectorAll("[data-open]").forEach(el=>{
    el.addEventListener("click", ()=>{
      const id = el.getAttribute("data-open");
      location.href = `reading.html?story=${encodeURIComponent(id)}&from=student`;
    });
  });
}

try{
  await loadStories();
  await loadRecommendations();
  render();
}catch(e){
  toast(msg, e.message || "Could not load stories.", "warn");
}
