
import { supabase, requireAuth, getProfile, toast, qs, escapeHtml, readParams } from "./supabaseClient.js";
import { wireTopbar } from "./ui.js";

await requireAuth();
await wireTopbar();

const params = readParams();
const storyId = params.get("story");
const from = params.get("from") || "student";

const backLink = qs("#backLink");
backLink.href = from === "teacher" ? "teacher.html" : "student.html";

const titleEl = qs("#title");
const metaEl = qs("#meta");
const coverImg = qs("#coverImg");
const langChip = qs("#langChip");
const authorChip = qs("#authorChip");
const yearChip = qs("#yearChip");
const textEl = qs("#readingText");
const ttsWarn = qs("#ttsWarn");

if (!storyId){
  titleEl.textContent = "No story selected";
  textEl.textContent = "Please go back to the library and choose a story.";
}

let story = null;
let currentUtter = null;

function defaultCover(story_type){
  return story_type === "alamat" ? "assets/covers/alamat.svg" : "assets/covers/fairy_tale.svg";
}
let fontSize = Number(localStorage.getItem("e_raiser_font_size") || 18);

function applyFont(){
  document.documentElement.style.setProperty("--reading-size", `${fontSize}px`);
  localStorage.setItem("e_raiser_font_size", String(fontSize));
}
applyFont();

qs("#fontUp").addEventListener("click", ()=>{ fontSize = Math.min(26, fontSize+1); applyFont(); });
qs("#fontDown").addEventListener("click", ()=>{ fontSize = Math.max(14, fontSize-1); applyFont(); });

function supportsTTS(){
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function clearHighlights(){
  const spans = textEl.querySelectorAll("span.highlight");
  spans.forEach(s=>s.classList.remove("highlight"));
}

function renderTextWithSpans(text){
  // Wrap each word in a span for optional highlighting.
  // (Works best for English; for Filipino it still highlights by word boundaries loosely.)
  const words = text.split(/(\s+)/);
  textEl.innerHTML = words.map(w=>{
    if (/^\s+$/.test(w)) return w;
    return `<span data-word>${escapeHtml(w)}</span>`;
  }).join("");
}

function highlightByCharIndex(charIndex){
  // Approximate: find span whose cumulative length exceeds charIndex
  const nodes = Array.from(textEl.querySelectorAll("span[data-word]"));
  let acc = 0;
  for (const n of nodes){
    const w = n.textContent || "";
    const len = w.length;
    if (charIndex >= acc && charIndex <= acc + len){
      clearHighlights();
      n.classList.add("highlight");
      // keep in view
      n.scrollIntoView({ block:"nearest", inline:"nearest" });
      return;
    }
    acc += len + 1; // +1 for a space-ish
  }
}

async function getVoicesAsync(){
  if (!supportsTTS()) return [];
  const initial = window.speechSynthesis.getVoices?.() || [];
  if (initial.length) return initial;

  return await new Promise((resolve)=>{
    let done = false;
    const finish = ()=>{
      if (done) return;
      done = true;
      try{ window.speechSynthesis.removeEventListener("voiceschanged", finish); }catch{}
      resolve(window.speechSynthesis.getVoices?.() || []);
    };
    try{ window.speechSynthesis.addEventListener("voiceschanged", finish); }catch{}
    // fallback (some browsers never fire voiceschanged)
    setTimeout(finish, 650);
  });
}

function pickVoice(voices){
  const isFil = (story?.language === "fil") || (story?.story_type === "alamat");
  const prefs = isFil
    ? ["fil-ph","tl-ph","fil","tl"]
    : ["en-us","en-gb","en"];

  const byLang = (v)=> (v.lang || "").toLowerCase();
  const exact = voices.find(v => prefs.some(p => byLang(v).includes(p)));
  if (exact) return exact;

  // fallback: any same base language
  const base = (isFil ? ["fil","tl"] : ["en"]);
  return voices.find(v => base.some(b => byLang(v).startsWith(b))) || null;
}

async function speak(text){
  if (!supportsTTS()){
    ttsWarn.hidden = false;
    ttsWarn.textContent = "Text-to-speech is not supported in this browser. Please try Chrome or Edge.";
    return;
  }

  stopSpeak();

  const voices = await getVoicesAsync();
  const voice = pickVoice(voices);

  currentUtter = new SpeechSynthesisUtterance(text);
  currentUtter.voice = voice || null;

  // Hint: set the language explicitly to help pronunciation
  if ((story?.language === "fil") || (story?.story_type === "alamat")){
    currentUtter.lang = voice?.lang || "fil-PH";
    currentUtter.rate = 0.95;
  } else {
    currentUtter.lang = voice?.lang || "en-US";
    currentUtter.rate = 1;
  }
  currentUtter.pitch = 1;

  // Highlight as it narrates (best-effort; onboundary is not always fired consistently)
  currentUtter.onboundary = (ev) => {
    if (typeof ev.charIndex === "number") highlightByCharIndex(ev.charIndex);
  };

  currentUtter.onend = () => {
    clearHighlights();
    currentUtter = null;
  };

  window.speechSynthesis.speak(currentUtter);

  // If Filipino voice isn't available, show a small hint (still works with default voice)
  if (story?.language === "fil" && !voice){
    ttsWarn.hidden = false;
    ttsWarn.textContent = "Tip: For better Tagalog narration, use a browser/device with a Filipino/Tagalog voice installed (Speech Synthesis voices vary by device).";
    setTimeout(()=>{ ttsWarn.hidden = true; }, 4000);
  }
}

function pauseSpeak(){
  if (!supportsTTS()) return;
  window.speechSynthesis.pause();
}

function resumeSpeak(){
  if (!supportsTTS()) return;
  window.speechSynthesis.resume();
}

function stopSpeak(){
  if (!supportsTTS()) return;
  window.speechSynthesis.cancel();
  clearHighlights();
  currentUtter = null;
}

qs("#playBtn").addEventListener("click", ()=>{
  if (!story) return;
  // If paused, resume; else start new speak
  if (supportsTTS() && window.speechSynthesis.paused) resumeSpeak();
  else speak(story.content);
});
qs("#pauseBtn").addEventListener("click", ()=>pauseSpeak());
qs("#stopBtn").addEventListener("click", ()=>stopSpeak());

qs("#doneBtn").addEventListener("click", ()=>{
  if (!story) return;
  stopSpeak();
  location.href = `quiz.html?story=${encodeURIComponent(story.id)}`;
});

try{
  const { data, error } = await supabase
    .from("stories")
    .select("id, title, story_type, difficulty, grade_min, grade_max, cover_url, author, year_published, language, content")
    .eq("id", storyId)
    .single();
  if (error) throw error;
  story = data;

  titleEl.textContent = story.title;
  const typeLabel = story.story_type === "alamat" ? "Alamat" : "Fairy tale";
  const grade = (story.grade_min && story.grade_max) ? `G${story.grade_min}–G${story.grade_max}` : "All grades";
  metaEl.textContent = `${typeLabel} • ${grade} • ${story.difficulty?.replaceAll("_"," ") || "easy"}`;

  // Cover + book details
  const cover = story.cover_url || defaultCover(story.story_type);
  if (coverImg) {
    coverImg.src = cover;
    // replay pop animation
    coverImg.classList.remove("cover-pop");
    void coverImg.offsetWidth;
    coverImg.classList.add("cover-pop");
  }
  if (authorChip) authorChip.textContent = `Author: ${story.author || "—"}`;
  if (yearChip) yearChip.textContent = `Year: ${story.year_published || "—"}`;
  if (langChip) langChip.textContent = ((story.language === "fil") || (story.story_type === "alamat")) ? "Filipino" : "English";

  renderTextWithSpans(story.content || "");
}catch(e){
  ttsWarn.hidden = false;
  ttsWarn.textContent = e.message || "Could not load story.";
}
