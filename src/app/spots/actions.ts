"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inMaldivesBounds } from "@/lib/maldives";
import { isUuid } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

type SpotInput = {
  name: string;
  description: string;
  lng: number;
  lat: number;
  depthM: number | null;
  islandId: number | null;
  speciesIds: number[];
};

function parseSpotForm(formData: FormData): { error: string } | { value: SpotInput } {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const lngRaw = String(formData.get("lng") ?? "").trim();
  const latRaw = String(formData.get("lat") ?? "").trim();
  const depthRaw = String(formData.get("depth_m") ?? "").trim();
  const islandRaw = String(formData.get("island_id") ?? "").trim();

  if (name.length < 2 || name.length > 80) {
    return { error: "Spot name must be 2 to 80 characters." };
  }
  if (description.length > 1000) {
    return { error: "Description must be 1000 characters or fewer." };
  }

  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (lngRaw === "" || latRaw === "" || !inMaldivesBounds(lng, lat)) {
    return { error: "Click the map to choose the spot's location (inside the Maldives)." };
  }

  let depthM: number | null = null;
  if (depthRaw !== "") {
    depthM = Number(depthRaw);
    if (!Number.isFinite(depthM) || depthM < 0 || depthM > 2000) {
      return { error: "Depth must be between 0 and 2000 metres." };
    }
  }

  let islandId: number | null = null;
  if (islandRaw !== "") {
    islandId = Number(islandRaw);
    if (!Number.isInteger(islandId)) return { error: "Choose a valid island." };
  }

  const speciesIds = formData
    .getAll("species_ids")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));

  return { value: { name, description, lng, lat, depthM, islandId, speciesIds } };
}

// Creates a spot, or updates one when the form carries a spot_id
export async function saveSpot(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/spots/new");

  const parsed = parseSpotForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const v = parsed.value;

  const spotId = String(formData.get("spot_id") ?? "");

  if (spotId) {
    if (!isUuid(spotId)) return { error: "Invalid spot." };
    const { error } = await supabase.rpc("update_spot", {
      p_id: spotId,
      p_name: v.name,
      p_description: v.description,
      p_lng: v.lng,
      p_lat: v.lat,
      p_depth_m: v.depthM,
      p_island_id: v.islandId,
      p_species_ids: v.speciesIds,
    });
    if (error) return { error: error.message };

    revalidatePath("/spots");
    revalidatePath(`/spots/${spotId}`);
    redirect(`/spots/${spotId}`);
  }

  const { data, error } = await supabase.rpc("create_spot", {
    p_name: v.name,
    p_description: v.description,
    p_lng: v.lng,
    p_lat: v.lat,
    p_depth_m: v.depthM,
    p_island_id: v.islandId,
    p_species_ids: v.speciesIds,
  });
  if (error) return { error: error.message };

  revalidatePath("/spots");
  redirect(`/spots/${String(data)}`);
}

export async function deleteSpot(formData: FormData) {
  const spotId = String(formData.get("spot_id") ?? "");
  if (!isUuid(spotId)) redirect("/spots");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // remember the photo files before the rows disappear
  const { data: photos } = await supabase
    .from("spot_photos")
    .select("storage_path")
    .eq("spot_id", spotId);

  // Row-level security decides who may delete: the owner or an admin.
  // .select() returns the rows that were actually deleted.
  const { data: deleted, error } = await supabase
    .from("fishing_spots")
    .delete()
    .eq("id", spotId)
    .select("id");

  if (error || !deleted || deleted.length === 0) {
    redirect(`/spots/${spotId}?error=delete`);
  }

  // Permission was proven above, so clear the leftover files with the server key.
  // Best effort: if the key is not configured the files simply stay in storage.
  const paths = (photos ?? []).map((p: { storage_path: string }) => p.storage_path);
  if (paths.length > 0) {
    try {
      await createAdminClient().storage.from("spot-photos").remove(paths);
    } catch {
      // ignore
    }
  }

  revalidatePath("/spots");
  redirect("/spots");
}
