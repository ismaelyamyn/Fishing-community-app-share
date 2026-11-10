// Gathers everything the recommender needs from the database and runs it for one fisher.
// Server-only: uses the admin client because it reads private trip-derived ratings.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./data";
import { predictForUser, Rating } from "./collaborative";
import { conditionsProbability, deserializeModel, explainConditions } from "./conditionsModel";
import { nowRowToConditions } from "./pipeline";
import { Candidate, recommend, Recommendation } from "./recommender";

export type RecommendOptions = {
  userId: string;
  location: { lat: number; lon: number } | null;
  speciesId: number | null;
  maxDistanceKm: number | null;
  limit?: number;
  persist?: boolean;
};

export type RecommendResult = {
  recommendations: (Recommendation & {
    name: string;
    islandName: string | null;
    communityScore: number | null;
    reviewCount: number;
  })[];
  modelUsable: boolean;
  modelNote: string;
  conditionsAgeNote: string | null;
};

export async function recommendForUser(admin: SupabaseClient, opt: RecommendOptions): Promise<RecommendResult> {
  const now = new Date();

  const [spots, scores, stats, nowRows, ratings, modelRes] = await Promise.all([
    fetchAll<any>(admin, "spots_public", "id, name, island_name, lng, lat, review_count, species_ids", "id", (q) => q.eq("status", "active")),
    fetchAll<any>(admin, "spot_scores", "spot_id, community_score", "spot_id"),
    fetchAll<any>(admin, "spot_trip_stats", "spot_id, trip_count, trips_7d", "spot_id"),
    fetchAll<any>(admin, "spot_conditions_now", "spot_id, wind_speed_ms, wind_dir_deg, temperature_c, tide_height_m, tide_phase", "spot_id"),
    fetchAll<any>(admin, "cf_ratings", "user_id, spot_id, rating, source", "user_id"),
    admin.from("prediction_models").select("*").eq("name", "conditions").maybeSingle(),
  ]);

  const model = deserializeModel(modelRes.data ?? null);
  const scoreOf = new Map(scores.map((s) => [s.spot_id, s.community_score === null ? null : Number(s.community_score)]));
  const statOf = new Map(stats.map((s) => [s.spot_id, s]));
  const nowOf = new Map(nowRows.map((r) => [r.spot_id, r]));

  const candidates: Candidate[] = spots.map((s) => {
    const st = statOf.get(s.id);
    const nr = nowOf.get(s.id);
    let prob: number | null = null;
    let drivers: { group: string; effect: number }[] = [];
    if (model && model.usable && nr) {
      const cond = nowRowToConditions(nr, now);
      prob = conditionsProbability(model, cond);
      drivers = explainConditions(model, cond);
    }
    return {
      id: s.id,
      lat: Number(s.lat),
      lon: Number(s.lng),
      communityScore: scoreOf.get(s.id) ?? null,
      reviewCount: s.review_count ?? 0,
      tripCount: st?.trip_count ?? 0,
      trips7d: st?.trips_7d ?? 0,
      speciesIds: s.species_ids ?? [],
      conditionsProb: prob,
      conditionDrivers: drivers,
    };
  });

  const cf: Rating[] = ratings.map((r) => ({ userId: r.user_id, spotId: r.spot_id, rating: Number(r.rating) }));
  const personal = predictForUser(cf, opt.userId, candidates.map((c) => c.id));

  const limit = opt.limit ?? 10;
  const ranked = recommend(candidates, {
    location: opt.location,
    speciesId: opt.speciesId,
    maxDistanceKm: opt.maxDistanceKm,
    personal,
    limit,
  });

  const info = new Map(spots.map((s) => [s.id, s]));
  const recommendations = ranked.map((r) => ({
    ...r,
    name: info.get(r.spotId)?.name ?? "Unnamed spot",
    islandName: info.get(r.spotId)?.island_name ?? null,
    communityScore: scoreOf.get(r.spotId) ?? null,
    reviewCount: info.get(r.spotId)?.review_count ?? 0,
  }));

  if (opt.persist) {
    await admin.from("recommendations").delete().eq("user_id", opt.userId);
    if (ranked.length) {
      await admin.from("recommendations").insert(
        ranked.map((r) => ({
          user_id: opt.userId,
          spot_id: r.spotId,
          target_species_id: opt.speciesId,
          score: Math.round(r.score * 10000) / 10000,
          reasons: r.reasons,
        }))
      );
    }
  }

  return {
    recommendations,
    modelUsable: !!model?.usable,
    modelNote: model
      ? model.usable
        ? `Weather model trained on ${model.nSamples} trips.`
        : model.reason
      : "The weather model has not been trained yet, so recommendations use reviews, your taste and distance.",
    conditionsAgeNote: nowRows.length === 0 ? "No recent weather readings, so current conditions were not used." : null,
  };
}
