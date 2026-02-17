
import { supabase, requireAuth, getProfile, toast, qs, escapeHtml } from "./supabaseClient.js";
import { wireTopbar } from "./ui.js";

await requireAuth();
await wireTopbar();

const msg = qs("#msg");
const list = qs("#list");

function defaultCover(story_type){
  return story_type === "alamat" ? "assets/covers/alamat.svg" : "assets/covers/fairy_tale.svg";
}

try{
  const profile = await getProfile();

  const { data, error } = await supabase
    .from("attempts")
    .select("id, score, total, created_at, story_id, stories(title, cover_url, story_type)")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) throw error;

  if (!data || data.length === 0){
    list.innerHTML = `<div class="card"><b>No attempts yet.</b><div class="small muted">Read a story and take the quiz to see your progress.</div></div>`;
  } else {
    list.innerHTML = data.map(a=>{
      const t = a.stories?.title || "Story";
      const date = new Date(a.created_at).toLocaleString();
      const cover = a.stories?.cover_url || defaultCover(a.stories?.story_type || "fairy_tale");
      return `<article class="card">
        <div class="card-title">
          <h3 style="margin:0">${escapeHtml(t)}</h3>
          <span class="chip">${escapeHtml(`${a.score}/${a.total}`)}</span>
        </div>
        <div class="row" style="margin-top:10px; align-items:center;">
          <img class="cover-thumb" src="${escapeHtml(cover)}" alt="">
          <div class="small muted">Attempted: ${escapeHtml(date)}</div>
        </div>
      </article>`;
    }).join("");
  }

}catch(e){
  toast(msg, e.message || "Could not load progress.", "warn");
}
