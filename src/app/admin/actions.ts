"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runModels } from "@/lib/ai/pipeline";
import { isUuid } from "@/lib/validation";

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/");
  return supabase;
}

export async function resolveFlags(formData: FormData) {
  const supabase = await requireAdmin();
  const reviewId = String(formData.get("review_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!isUuid(reviewId) || (decision !== "uphold" && decision !== "dismiss")) redirect("/admin");

  // the database function re-checks that the caller is an admin
  await supabase.rpc("resolve_review_flags", { p_review_id: reviewId, p_decision: decision });
  revalidatePath("/admin");
  redirect(`/admin?resolved=${decision}`);
}

export async function runModelsNow() {
  await requireAdmin();
  let target = "/admin?ran=1";
  try {
    const s = await runModels(createAdminClient());
    target = `/admin?ran=1&scored=${s.spotsScored}&findings=${s.spotsWithFindings}&secs=${s.seconds}`;
  } catch (e) {
    target = `/admin?ran=0&err=${encodeURIComponent((e as Error).message.slice(0, 120))}`;
  }
  revalidatePath("/admin");
  redirect(target);
}
