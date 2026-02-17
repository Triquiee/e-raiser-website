
import { supabase, requireAuth, getProfile, toast, qs } from "./supabaseClient.js";
import { wireTopbar } from "./ui.js";

await requireAuth();
await wireTopbar();

const msg = qs("#msg");

// If user is admin, go straight to admin dashboard
try{
  const p = await getProfile();
  if (p?.is_admin) location.href = "admin.html";
  if (p?.chosen_role === "teacher") location.href = "teacher.html";
  if (p?.chosen_role === "student") location.href = "student.html";
}catch{
  // ignore; page will continue
}

async function setRole(role){
  try{
    const profile = await getProfile();
    const { error } = await supabase.from("profiles").update({ chosen_role: role }).eq("id", profile.id);
    if (error) throw error;

    if (role === "teacher") location.href = "teacher.html";
    else location.href = "student.html";
  }catch(e){
    toast(msg, e.message || "Could not set role.", "warn");
  }
}

qs("#teacherBtn").addEventListener("click", ()=>setRole("teacher"));
qs("#studentBtn").addEventListener("click", ()=>setRole("student"));
