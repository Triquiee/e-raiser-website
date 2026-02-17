
import { supabase, toast, qs } from "./supabaseClient.js";

const msg = qs("#msg");

qs("#sendBtn").addEventListener("click", async () => {
  const email = qs("#email").value.trim();
  if (!email) return toast(msg, "Enter your email.", "warn");

  const redirectTo = new URL("reset.html", location.origin).toString();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return toast(msg, error.message, "warn");
  toast(msg, "Reset link sent! Check your email.", "notice");
});

// When opened via reset link, Supabase session is detected in URL by detectSessionInUrl: true
qs("#updateBtn").addEventListener("click", async () => {
  const password = qs("#newPass").value;
  if (!password || password.length < 8) return toast(msg, "Password must be at least 8 characters.", "warn");

  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) return toast(msg, error.message, "warn");

  toast(msg, "Password updated. You can now log in.", "notice");
  setTimeout(()=> location.href = "auth.html", 900);
});
