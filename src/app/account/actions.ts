"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form-state";

export async function updateProfile(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (displayName.length < 2 || displayName.length > 40) {
    return { error: "Display name must be 2 to 40 characters." };
  }

  const islandRaw = String(formData.get("island_id") ?? "");
  const islandId = islandRaw === "" ? null : Number(islandRaw);
  if (islandId !== null && !Number.isInteger(islandId)) {
    return { error: "Choose a valid island." };
  }

  // Row-level security + column permissions limit this to your own profile,
  // and to these two columns only.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, island_id: islandId })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { message: "Profile updated." };
}
