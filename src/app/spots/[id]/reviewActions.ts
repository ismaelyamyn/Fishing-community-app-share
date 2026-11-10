"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

export async function submitReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const spotId = String(formData.get("spot_id") ?? "");
  if (!isUuid(spotId)) return { error: "Invalid spot." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/spots/${spotId}`);

  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Choose 1 to 5 stars." };

  const comment = String(formData.get("comment") ?? "").trim();
  if (comment.length > 1000) return { error: "The comment must be 1000 characters or fewer." };

  // A review is "verified" when it is tied to one of the fisher's own trips here
  // that has no review yet (recent trips only). Otherwise it counts half as much.
  const { data: trips } = await supabase
    .from("trips")
    .select("id")
    .eq("user_id", user.id)
    .eq("spot_id", spotId)
    .gte("started_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
    .order("started_at", { ascending: false })
    .limit(10);
  const tripIds = (trips ?? []).map((t: { id: string }) => t.id);

  let tripId: string | null = null;
  if (tripIds.length) {
    const { data: used } = await supabase.from("reviews").select("trip_id").in("trip_id", tripIds);
    const usedSet = new Set((used ?? []).map((r: { trip_id: string }) => r.trip_id));
    tripId = tripIds.find((id: string) => !usedSet.has(id)) ?? null;
  }

  if (tripId) {
    const { error } = await supabase
      .from("reviews")
      .insert({ spot_id: spotId, user_id: user.id, trip_id: tripId, rating, comment: comment || null });
    if (error) return { error: error.message };
  } else {
    // one unverified review per fisher and spot: a second submission edits it
    const { data: existing } = await supabase
      .from("reviews")
      .select("id")
      .eq("spot_id", spotId)
      .eq("user_id", user.id)
      .is("trip_id", null)
      .maybeSingle();
    const { error } = existing
      ? await supabase.from("reviews").update({ rating, comment: comment || null }).eq("id", existing.id)
      : await supabase
          .from("reviews")
          .insert({ spot_id: spotId, user_id: user.id, rating, comment: comment || null });
    if (error) return { error: error.message };
  }

  revalidatePath(`/spots/${spotId}`);
  revalidatePath("/spots");
  return { message: tripId ? "Thanks! Your review is verified by your trip." : "Thanks! Your review was saved." };
}

export async function deleteReview(formData: FormData) {
  const reviewId = String(formData.get("review_id") ?? "");
  const spotId = String(formData.get("spot_id") ?? "");
  if (!isUuid(reviewId) || !isUuid(spotId)) redirect("/spots");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // row-level security: own review, or an admin
  await supabase.from("reviews").delete().eq("id", reviewId);
  revalidatePath(`/spots/${spotId}`);
  redirect(`/spots/${spotId}`);
}

export async function flagReview(formData: FormData) {
  const reviewId = String(formData.get("review_id") ?? "");
  const spotId = String(formData.get("spot_id") ?? "");
  if (!isUuid(reviewId) || !isUuid(spotId)) redirect("/spots");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/spots/${spotId}`);

  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const { error } = await supabase
    .from("review_flags")
    .insert({ review_id: reviewId, flagged_by: user.id, reason: reason || null });

  revalidatePath("/admin");
  redirect(`/spots/${spotId}?flag=${error ? "failed" : "ok"}`);
}
