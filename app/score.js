
import { supabase, requireAuth, toast, qs, readParams } from "./supabaseClient.js";
import { wireTopbar } from "./ui.js";

await requireAuth();
await wireTopbar();

const params = readParams();
const attemptId = params.get("attempt");
const storyId = params.get("story");

const msg = qs("#msg");
const scoreEl = qs("#score");
const feedbackEl = qs("#feedback");
const tipEl = qs("#tip");

function messageFor(score, total){
  const pct = (score/total)*100;
  if (pct >= 90) return ["Excellent!", "You understood the story very well. Keep it up!"];
  if (pct >= 70) return ["Great job!", "You did well. Try reading again to remember more details."];
  if (pct >= 50) return ["Good effort!", "You’re improving. Try reading slowly and looking at key details."];
  return ["Keep trying!", "It’s okay. Read again and focus on the main characters and events."];
}

try{
  const { data, error } = await supabase
    .from("attempts")
    .select("id, score, total, created_at, story_id, stories(title)")
    .eq("id", attemptId)
    .single();
  if (error) throw error;

  scoreEl.textContent = `${data.score}/${data.total}`;
  const [headline, tip] = messageFor(data.score, data.total);
  feedbackEl.textContent = headline;
  tipEl.textContent = tip;

}catch(e){
  toast(msg, e.message || "Could not load score.", "warn");
}
