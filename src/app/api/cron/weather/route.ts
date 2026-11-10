import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cronAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConditions, roundCoord } from "@/lib/weather";

export const maxDuration = 60;

const MAX_AREAS_PER_RUN = 40; // keeps one run well inside OpenWeather's free 60 calls/minute
const BATCH_SIZE = 5; // areas fetched in parallel
const TIME_BUDGET_MS = 45_000; // stop starting new batches after this

type Area = { lat: number; lng: number; spots: number };
type AreaResult = { status: "stored" | "skipped" | "failed"; message?: string };

async function recordArea(
  admin: ReturnType<typeof createAdminClient>,
  { lat, lng }: Area
): Promise<AreaResult> {
  try {
    const c = await getConditions(lat, lng);

    // nothing useful came back (for example a missing API key): do not store an empty row
    if (c.windSpeedMs === null && c.temperatureC === null && c.tideHeightM === null) {
      return { status: "failed", message: `${lat},${lng}: ${c.warnings.join("; ") || "no data"}` };
    }

    const { data, error } = await admin.rpc("record_weather_snapshot", {
      p_lng: lng,
      p_lat: lat,
      p_observed_at: c.observedAt,
      p_wind_speed_ms: c.windSpeedMs,
      p_wind_dir_deg: c.windDirDeg === null ? null : Math.round(c.windDirDeg),
      p_temperature_c: c.temperatureC,
      p_tide_height_m: c.tideHeightM,
      p_tide_phase: c.tidePhase,
      p_source: "openweather+open-meteo",
    });

    if (error) return { status: "failed", message: `${lat},${lng}: ${error.message}` };
    return { status: data === true ? "stored" : "skipped" };
  } catch (e) {
    return { status: "failed", message: `${lat},${lng}: ${(e as Error).message}` };
  }
}

// Records conditions for every area that has an active fishing spot.
// Call it on a schedule with:  Authorization: Bearer <CRON_SECRET>
// (see deploy/pgcron-hourly.sql for the hourly Supabase schedule)
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const admin = createAdminClient();

  const { data: spots, error } = await admin
    .from("spots_public")
    .select("lng, lat")
    .eq("status", "active");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // many spots share one ~10 km area: fetch each area once
  const areas = new Map<string, Area>();
  for (const s of (spots ?? []) as { lng: number; lat: number }[]) {
    const lat = roundCoord(s.lat);
    const lng = roundCoord(s.lng);
    const key = `${lat},${lng}`;
    const existing = areas.get(key);
    if (existing) existing.spots += 1;
    else areas.set(key, { lat, lng, spots: 1 });
  }

  // busiest areas first, so if there are more than the cap, the most useful ones are covered
  const all = Array.from(areas.values()).sort((a, b) => b.spots - a.spots);
  const list = all.slice(0, MAX_AREAS_PER_RUN);

  let stored = 0;
  let skipped = 0;
  let processed = 0;
  const failures: string[] = [];

  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    if (Date.now() - started > TIME_BUDGET_MS) break;

    const batch = list.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((area) => recordArea(admin, area)));
    processed += batch.length;

    for (const r of results) {
      if (r.status === "stored") stored++;
      else if (r.status === "skipped") skipped++;
      else if (r.message) failures.push(r.message);
    }
  }

  return NextResponse.json({
    areasWithSpots: all.length,
    areasProcessed: processed,
    stored,
    skippedAlreadyStored: skipped,
    failures,
    incomplete: processed < all.length,
  });
}
