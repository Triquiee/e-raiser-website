
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export async function requireAuth(redirectTo = "auth.html") {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.href = redirectTo;
    return null;
  }
  return session;
}

export async function getProfile() {
  const session = await requireAuth();
  if (!session) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, chosen_role, grade_level, is_admin, teacher_subject")
    .eq("id", session.user.id)
    .single();
  if (error) throw error;
  return data;
}

export function toast(el, msg, kind="notice") {
  el.className = kind === "warn" ? "warn fadein" : "notice fadein";
  el.textContent = msg;
  el.hidden = false;
  setTimeout(()=>{ el.hidden = true; }, 4500);
}

export function qs(sel){ return document.querySelector(sel); }
export function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

export function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function setUserBadge(profile){
  const badge = document.querySelector("#userBadge");
  if (!badge) return;
  const role = profile?.chosen_role ? profile.chosen_role : "—";
  const name = profile?.full_name || "User";
  badge.innerHTML = `${escapeHtml(name)} <span class="chip">${escapeHtml(role)}</span>`;
}

export function readParams(){
  return new URLSearchParams(location.search);
}


// ------------------------------------------------------
// Kid-friendly decorative background (auto-injected)
// ------------------------------------------------------
function ensureKidBackground(){
  try{
    if (typeof document === "undefined") return;
    if (document.querySelector(".kid-bg")) return;

    const div = document.createElement("div");
    div.className = "kid-bg";
    div.setAttribute("aria-hidden","true");
    div.innerHTML = `
      <img class="sticker s1" src="assets/stickers/rainbow.svg" alt="">
      <img class="sticker s2" src="assets/stickers/butterfly.svg" alt="">
      <img class="sticker s3" src="assets/stickers/pencil.svg" alt="">
      <img class="sticker s4" src="assets/stickers/crayon.svg" alt="">
    `;
    document.body.prepend(div);
  }catch{}
}
ensureKidBackground();
