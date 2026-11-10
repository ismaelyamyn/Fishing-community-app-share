"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConditions, roundCoord } from "@/lib/weather";
import { isUuid } from "@/lib/validation";
import type { FormState } from "@/lib/form-state";

// The form's date-time box has no time zone; the Maldives is UTC+5 all year.
function parseMaldivesTime(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}:00+05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Best effort: link the trip to stored weather (fetching live weather first when
// the trip just started). A failure here never blocks logging the trip.
async function attachWeather(tripId: string, spotId: string, startedAt: Date) {
  try {
    const admin = createAdminClient();

    if (Date.now() - startedAt.getTime() < 80 * 60_000) {
      const { data: spot } = await admin.from("spots_public").select("lng, lat").eq("id", spotId).maybeSingle();
      if (spot) {
        const c = await getConditions(roundCoord(Number(spot.lat)), roundCoord(Number(spot.lng)));
        if (c.windSpeedMs !== null || c.temperatureC !== null || c.tideHeightM !== null) {
          await admin.rpc("record_weather_snapshot", {
            p_lng: roundCoord(Number(spot.lng)),
            p_lat: roundCoord(Number(spot.lat)),
            p_observed_at: c.observedAt,
            p_wind_speed_ms: c.windSpeedMs,
            p_wind_dir_deg: c.windDirDeg === null ? null : Math.round(c.windDirDeg),
            p_temperature_c: c.temperatureC,
            p_tide_height_m: c.tideHeightM,
            p_tide_phase: c.tidePhase,
            p_source: "openweather+open-meteo",
          });
        }
      }
    }
    await admin.rpc("attach_trip_weather", { p_trip_id: tripId });
  } catch {
    // the hourly weather job and the next model run still work without it
  }
}

export async function createTrip(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/trips/new");

  const spotId = String(formData.get("spot_id") ?? "");
  if (!isUuid(spotId)) return { error: "Choose a fishing spot." };

  const startedAt = parseMaldivesTime(String(formData.get("started_at") ?? ""));
  if (!startedAt) return { error: "Enter when the trip started." };

  let endedAt: Date | null = null;
  const endRaw = String(formData.get("ended_at") ?? "");
  if (endRaw) {
    endedAt = parseMaldivesTime(endRaw);
    if (!endedAt) return { error: "The end time is not valid." };
  }

  const good = String(formData.get("good_catch") ?? "");
  if (good !== "yes" && good !== "no") return { error: "Say whether it was a good catch." };

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > 500) return { error: "Notes must be 500 characters or fewer." };

  const catches: { species_id: number; quantity: string; weight_kg: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const sp = String(formData.get(`species_${i}`) ?? "");
    if (!sp) continue;
    const species = Number(sp);
    const qty = String(formData.get(`quantity_${i}`) ?? "").trim();
    const weight = String(formData.get(`weight_${i}`) ?? "").trim();
    if (!Number.isInteger(species)) return { error: "Choose a valid species." };
    if (qty && !(Number.isInteger(Number(qty)) && Number(qty) >= 0 && Number(qty) <= 10000)) {
      return { error: "Quantity must be a whole number." };
    }
    if (weight && !(Number.isFinite(Number(weight)) && Number(weight) >= 0 && Number(weight) <= 100000)) {
      return { error: "Weight must be a number of kilograms." };
    }
    catches.push({ species_id: species, quantity: qty, weight_kg: weight });
  }

  const { data, error } = await supabase.rpc("create_trip", {
    p_spot_id: spotId,
    p_started_at: startedAt.toISOString(),
    p_ended_at: endedAt ? endedAt.toISOString() : null,
    p_good_catch: good === "yes",
    p_notes: notes,
    p_catches: catches,
  });
  if (error) return { error: error.message };

  await attachWeather(String(data), spotId, startedAt);

  revalidatePath("/trips");
  redirect("/trips?logged=1");
}

export async function deleteTrip(formData: FormData) {
  const tripId = String(formData.get("trip_id") ?? "");
  if (!isUuid(tripId)) redirect("/trips");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // row-level security only lets fishers delete their own trips
  await supabase.from("trips").delete().eq("id", tripId).eq("user_id", user.id);
  revalidatePath("/trips");
  redirect("/trips");
}
