
import { supabase, getProfile, setUserBadge, toast, qs } from "./supabaseClient.js";

export async function wireTopbar() {
  const outBtn = qs("#logoutBtn");
  if (outBtn) {
    outBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      location.href = "auth.html";
    });
  }
  try{
    const profile = await getProfile();
    setUserBadge(profile);
  }catch{}
}

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

export function wireModalLinks(){
  const openers = document.querySelectorAll("[data-modal]");
  const modals = document.querySelectorAll("dialog[data-modal-id]");
  const byId = new Map(Array.from(modals).map(m => [m.getAttribute("data-modal-id"), m]));
  openers.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-modal");
      const dlg = byId.get(id);
      if (!dlg) return;
      dlg.showModal();
    });
  });
  modals.forEach(dlg=>{
    dlg.addEventListener("click", (e)=>{
      const rect = dlg.getBoundingClientRect();
      const inDialog = rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
                       rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
      if (!inDialog) dlg.close();
    });
    const close = dlg.querySelector("[data-close]");
    if (close) close.addEventListener("click", ()=>dlg.close());
  });
}
