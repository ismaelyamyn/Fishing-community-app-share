// Runs the learning side of the app: community scores, the conditions model and
// per-spot analytics. Meant to run hourly (see deploy/pgcron-models.sql) or on
// demand from the admin page. Uses the server-only admin client.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll, upsertChunks } from "./data";
import { communityScore, ReviewInput } from "./communityScore";
import { conditionsProbability, serializeModel, TrainedModel, trainConditionsModel, TrainingTrip } from "./conditionsModel";
import { analyseSpot, SpotTrip } from "./analytics";
import type { Conditions } from "./features";

type SpotRef = { id: string; created_by: string };
type ReviewRow = { id: string; spot_id: string; user_id: string; trip_id: string | null; rating: number; comment: string | null; created_at: string; hidden: boolean };
type FlagRow = { review_id: string; status: string };
type StatRow = { spot_id: string; trip_count: number; trips_7d: number };
type TrainRow = {
  trip_id: string;
  spot_id: string;
  started_at: string;
  good_catch: boolean;
  wind_speed_ms: number | null;
  wind_dir_deg: number | null;
  temperature_c: number | null;
  tide_height_m: number | null;
  tide_phase: string | null;
};
type NowRow = {
  spot_id: string;
  wind_speed_ms: number | null;
  wind_dir_deg: number | null;
  temperature_c: number | null;
  tide_height_m: number | null;
  tide_phase: string | null;
};
type TripRow = { id: string; spot_id: string; started_at: string; good_catch: boolean | null };

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const phase = (v: string | null): Conditions["tidePhase"] =>
  v === "low" || v === "rising" || v === "high" || v === "falling" ? v : null;

export function nowRowToConditions(r: NowRow, at: Date): Conditions {
  return {
    startedAt: at,
    windSpeedMs: num(r.wind_speed_ms),
    windDirDeg: num(r.wind_dir_deg),
    temperatureC: num(r.temperature_c),
    tideHeightM: num(r.tide_height_m),
    tidePhase: phase(r.tide_phase),
  };
}

export type PipelineSummary = {
  spotsScored: number;
  model: { usable: boolean; reason: string; samples: number; cvAuc: number | null };
  spotsWithConditions: number;
  spotsAnalysed: number;
  spotsWithFindings: number;
  seconds: number;
};

export async function runModels(admin: SupabaseClient, now = new Date()): Promise<PipelineSummary> {
  const t0 = Date.now();

  const spots = await fetchAll<SpotRef>(admin, "fishing_spots", "id, created_by", "id", (q) => q.eq("status", "active"));
  const reviews = await fetchAll<ReviewRow>(admin, "reviews", "id, spot_id, user_id, trip_id, rating, comment, created_at, hidden", "id");
  const flags = await fetchAll<FlagRow>(admin, "review_flags", "id, review_id, status", "id");
  const stats = await fetchAll<StatRow>(admin, "spot_trip_stats", "spot_id, trip_count, trips_7d", "spot_id");
  const training = await fetchAll<TrainRow>(
    admin, "trip_training_data",
    "trip_id, spot_id, started_at, good_catch, wind_speed_ms, wind_dir_deg, temperature_c, tide_height_m, tide_phase",
    "trip_id"
  );
  const allTrips = await fetchAll<TripRow>(admin, "trips", "id, spot_id, started_at, good_catch", "id", (q) => q.not("good_catch", "is", null));
  const nowRows = await fetchAll<NowRow>(admin, "spot_conditions_now", "spot_id, wind_speed_ms, wind_dir_deg, temperature_c, tide_height_m, tide_phase", "spot_id");

  // ---- 1. community scores
  const flagCount = new Map<string, { open: number; upheld: number }>();
  for (const f of flags) {
    const e = flagCount.get(f.review_id) ?? { open: 0, upheld: 0 };
    if (f.status === "open") e.open++;
    if (f.status === "upheld") e.upheld++;
    flagCount.set(f.review_id, e);
  }
  const creatorOf = new Map(spots.map((s) => [s.id, s.created_by]));
  const bySpot = new Map<string, ReviewInput[]>();
  for (const r of reviews) {
    if (!creatorOf.has(r.spot_id)) continue;
    const fl = flagCount.get(r.id) ?? { open: 0, upheld: 0 };
    const list = bySpot.get(r.spot_id) ?? [];
    list.push({
      rating: r.rating,
      comment: r.comment,
      createdAt: new Date(r.created_at),
      verified: r.trip_id !== null,
      reviewerId: r.user_id,
      spotCreatorId: creatorOf.get(r.spot_id) ?? null,
      openFlags: fl.open,
      upheldFlags: fl.upheld,
      hidden: r.hidden,
    });
    bySpot.set(r.spot_id, list);
  }
  const statOf = new Map(stats.map((s) => [s.spot_id, s]));

  // ---- 2. conditions model
  const trips: TrainingTrip[] = training.map((t) => ({
    startedAt: new Date(t.started_at),
    windSpeedMs: num(t.wind_speed_ms),
    windDirDeg: num(t.wind_dir_deg),
    temperatureC: num(t.temperature_c),
    tideHeightM: num(t.tide_height_m),
    tidePhase: phase(t.tide_phase),
    goodCatch: t.good_catch,
  }));
  const model: TrainedModel = trainConditionsModel(trips);

  const { error: modelErr } = await admin.from("prediction_models").upsert(
    {
      name: "conditions",
      trained_at: now.toISOString(),
      n_samples: model.nSamples,
      n_positive: model.nPositive,
      usable: model.usable,
      params: serializeModel(model),
      metrics: model.metrics ?? {},
    },
    { onConflict: "name" }
  );
  if (modelErr) throw new Error(`prediction_models: ${modelErr.message}`);

  // ---- 3. per-spot rows
  const probOf = new Map<string, number>();
  for (const r of nowRows) {
    const p = conditionsProbability(model, nowRowToConditions(r, now));
    if (p !== null) probOf.set(r.spot_id, p);
  }

  const scoreRows = spots.map((s) => {
    const score = communityScore(bySpot.get(s.id) ?? [], now);
    const st = statOf.get(s.id);
    const prob = probOf.get(s.id);
    return {
      spot_id: s.id,
      community_score: score.score,
      conditions_prob: prob === undefined ? null : Math.round(prob * 1000) / 1000,
      trip_count: st?.trip_count ?? 0,
      trips_7d: st?.trips_7d ?? 0,
      computed_at: now.toISOString(),
    };
  });
  await upsertChunks(admin, "spot_scores", scoreRows, "spot_id");

  // ---- 4. spot analytics (trips with or without weather: time and season need none)
  const weatherOf = new Map(training.map((t) => [t.trip_id, t]));
  const tripsBySpot = new Map<string, SpotTrip[]>();
  for (const t of allTrips) {
    const w = weatherOf.get(t.id);
    const list = tripsBySpot.get(t.spot_id) ?? [];
    list.push({
      startedAt: new Date(t.started_at),
      goodCatch: t.good_catch === true,
      windSpeedMs: w ? num(w.wind_speed_ms) : null,
      windDirDeg: w ? num(w.wind_dir_deg) : null,
    });
    tripsBySpot.set(t.spot_id, list);
  }

  const analyticsRows: Record<string, unknown>[] = [];
  let withFindings = 0;
  for (const s of spots) {
    const list = tripsBySpot.get(s.id);
    if (!list) continue;
    const a = analyseSpot(s.id, list);
    if (a.findings.length) withFindings++;
    analyticsRows.push({
      spot_id: s.id,
      sample_size: a.tripCount,
      p_value: a.findings.length ? Math.min(...a.findings.map((f) => f.pValue)) : null,
      details: a,
      computed_at: now.toISOString(),
    });
  }
  await upsertChunks(admin, "spot_analytics", analyticsRows, "spot_id");

  return {
    spotsScored: scoreRows.length,
    model: { usable: model.usable, reason: model.reason, samples: model.nSamples, cvAuc: model.metrics?.cvAuc ?? null },
    spotsWithConditions: probOf.size,
    spotsAnalysed: analyticsRows.length,
    spotsWithFindings: withFindings,
    seconds: Math.round((Date.now() - t0) / 100) / 10,
  };
}
