"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form-state";

// Only allow redirects to paths inside this site (blocks open-redirect tricks)
function safeNext(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value : "/";
  // a backslash or control character can be read by browsers as a second slash
  if (/[\\\u0000-\u001f]/.test(v)) return "/";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (displayName.length < 2 || displayName.length > 40) {
    return { error: "Display name must be 2 to 40 characters." };
  }
  if (!email) return { error: "Enter your email." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  // On the live site set NEXT_PUBLIC_SITE_URL (for example https://my-app.vercel.app) so
  // confirmation emails always link to the right address.
  const origin = process.env.NEXT_PUBLIC_SITE_URL || headers().get("origin") || "http://localhost:3000";

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // read by the database trigger that creates the profile row
      data: { display_name: displayName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) return { error: error.message };

  // With "Confirm email" off, Supabase signs the user in immediately
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/");
  }

  return { message: "Check your email to confirm your account, then log in." };
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
