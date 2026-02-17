
import { supabase, toast, qs } from "./supabaseClient.js";

const signupMsg = qs("#signupMsg");
const loginMsg  = qs("#loginMsg");

function validEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

qs("#signupBtn").addEventListener("click", async () => {
  const full_name = qs("#suName").value.trim();
  const email = qs("#suEmail").value.trim();
  const pass  = qs("#suPass").value;
  const pass2 = qs("#suPass2").value;

  if (!full_name) return toast(signupMsg, "Please enter your full name.", "warn");
  if (!validEmail(email)) return toast(signupMsg, "Please enter a valid email address.", "warn");
  if (!pass || pass.length < 8) return toast(signupMsg, "Password must be at least 8 characters.", "warn");
  if (pass !== pass2) return toast(signupMsg, "Passwords do not match.", "warn");

  const { data, error } = await supabase.auth.signUp({
    email,
    password: pass,
    options: { data: { full_name } } // stored in auth user metadata
  });

  if (error) return toast(signupMsg, error.message, "warn");

  // Profile row is created by SQL trigger in supabase_setup.sql
  toast(signupMsg, "Account created successfully. Please log in.", "notice");
});

qs("#loginBtn").addEventListener("click", async () => {
  const email = qs("#liEmail").value.trim();
  const password = qs("#liPass").value;

  if (!validEmail(email)) return toast(loginMsg, "Please enter a valid email.", "warn");
  if (!password) return toast(loginMsg, "Please enter your password.", "warn");

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return toast(loginMsg, error.message, "warn");

  // Route based on profile
  try{
    const userId = data?.user?.id;
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("chosen_role, is_admin")
      .eq("id", userId)
      .single();
    if (pErr) throw pErr;

    if (profile?.is_admin) return (location.href = "admin.html");
    if (profile?.chosen_role === "teacher") return (location.href = "teacher.html");
    if (profile?.chosen_role === "student") return (location.href = "student.html");
    return (location.href = "role.html");
  }catch(e){
    // Fallback: role selection
    location.href = "role.html";
  }
});

// If already logged in, skip
(async ()=>{
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  try{
    const { data: profile } = await supabase
      .from("profiles")
      .select("chosen_role, is_admin")
      .eq("id", session.user.id)
      .single();

    if (profile?.is_admin) return (location.href = "admin.html");
    if (profile?.chosen_role === "teacher") return (location.href = "teacher.html");
    if (profile?.chosen_role === "student") return (location.href = "student.html");
    return (location.href = "role.html");
  }catch{
    location.href = "role.html";
  }
})();
