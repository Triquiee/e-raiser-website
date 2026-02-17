
import { supabase, requireAuth, toast, qs, escapeHtml, readParams } from "./supabaseClient.js";
import { wireTopbar } from "./ui.js";

await requireAuth();
await wireTopbar();

const params = readParams();
const storyId = params.get("story");

const msg = qs("#msg");
const form = qs("#quizForm");
const storyTitle = qs("#storyTitle");

if (!storyId){
  storyTitle.textContent = "No story selected";
  form.innerHTML = `<div class="warn">Please go back and choose a story.</div>`;
}

let quiz = null;
let story = null;

function renderQuiz(q){
  // Expect exactly 5 questions
  const questions = (q.questions || []).slice(0,5);
  if (questions.length !== 5){
    form.innerHTML = `<div class="warn">This story has no quiz yet (needs exactly 5 questions).</div>`;
    return;
  }

  form.innerHTML = questions.map((item, idx)=>{
    const name = `q${idx+1}`;
    const choices = item.choices || [];
    return `
      <div class="card" style="margin:12px 0;">
        <div style="font-weight:700; margin-bottom:8px;">${idx+1}. ${escapeHtml(item.prompt)}</div>
        ${choices.map((c, cidx)=>`
          <label class="pill" style="display:flex; align-items:center; gap:10px; cursor:pointer; margin:6px 0;">
            <input type="radio" name="${name}" value="${cidx}" />
            <span>${escapeHtml(c)}</span>
          </label>
        `).join("")}
      </div>
    `;
  }).join("");
}

function computeScore(){
  const questions = (quiz.questions || []).slice(0,5);
  let score = 0;
  const answers = [];
  for (let i=0;i<5;i++){
    const picked = form.querySelector(`input[name="q${i+1}"]:checked`);
    const value = picked ? Number(picked.value) : null;
    answers.push(value);
    if (value !== null && value === questions[i].answer_index) score++;
  }
  return { score, total: 5, answers };
}

qs("#submitBtn").addEventListener("click", async ()=>{
  if (!quiz) return;

  const { score, total, answers } = computeScore();
  if (answers.some(a => a === null)) {
    return toast(msg, "Please answer all 5 questions before submitting.", "warn");
  }

  // Save attempt
  const { data: ins, error } = await supabase
    .from("attempts")
    .insert({ story_id: storyId, score, total, answers })
    .select("id")
    .single();

  if (error) return toast(msg, error.message, "warn");

  location.href = `score.html?attempt=${encodeURIComponent(ins.id)}&story=${encodeURIComponent(storyId)}`;
});

try{
  const { data: storyData, error: storyErr } = await supabase
    .from("stories")
    .select("id, title")
    .eq("id", storyId)
    .single();
  if (storyErr) throw storyErr;
  story = storyData;
  storyTitle.textContent = story.title;

  const { data, error } = await supabase
    .from("quizzes")
    .select("id, story_id, questions")
    .eq("story_id", storyId)
    .single();
  if (error) throw error;
  quiz = data;
  renderQuiz(quiz);

}catch(e){
  toast(msg, e.message || "Could not load quiz.", "warn");
}
