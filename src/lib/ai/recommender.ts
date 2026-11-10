// Module 4: the recommender. Ranks spots for one fisher by blending four signals.
//
//   community  (0.35)  weighted review score, rescaled to 0..1
//   conditions (0.30)  predicted chance of a good trip in the weather right now
//   personal   (0.20)  what fishers with similar taste rated these spots
//   distance   (0.15)  1 / (1 + km / 30), so 30 km away is worth half of "here"
//
// A signal that is unavailable (no reviews yet, model not usable, no location,
// no similar fishers) is left out and the remaining weights are rescaled to
// add up to 1, so a missing signal never counts as a bad one.
// Two small adjustments follow: an exploration bonus for spots with few trips
// (so new spots get noticed) and a crowd penalty for spots with many trips this week.

export const WEIGHTS = { community: 0.35, conditions: 0.3, personal: 0.2, distance: 0.15 } as const;
export const EXPLORE_BONUS = 0.08;
export const CROWD_PENALTY = 0.1;

export type Candidate = {
  id: string;
  lat: number;
  lon: number;
  communityScore: number | null; // 1..5
  reviewCount: number;
  tripCount: number;
  trips7d: number;
  speciesIds: number[];
  conditionsProb: number | null; // 0..1
  conditionDrivers?: { group: string; effect: number }[];
};

export type RecommendRequest = {
  location: { lat: number; lon: number } | null;
  speciesId: number | null;
  maxDistanceKm: number | null;
  personal: Map<string, { rating: number; neighbours: number }>;
  limit: number;
};

export type Recommendation = {
  spotId: string;
  score: number;
  distanceKm: number | null;
  parts: { community: number | null; conditions: number | null; personal: number | null; distance: number | null };
  reasons: string[];
};

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function recommend(candidates: Candidate[], req: RecommendRequest): Recommendation[] {
  const out: Recommendation[] = [];

  for (const c of candidates) {
    if (req.speciesId !== null && !c.speciesIds.includes(req.speciesId)) continue; // hard filter

    const distanceKm = req.location ? haversineKm(req.location.lat, req.location.lon, c.lat, c.lon) : null;
    if (req.maxDistanceKm !== null && distanceKm !== null && distanceKm > req.maxDistanceKm) continue;

    const personal = req.personal.get(c.id) ?? null;
    const parts = {
      community: c.communityScore === null ? null : (c.communityScore - 1) / 4,
      conditions: c.conditionsProb,
      personal: personal ? (personal.rating - 1) / 4 : null,
      distance: distanceKm === null ? null : 1 / (1 + distanceKm / 30),
    };

    let num = 0;
    let den = 0;
    for (const key of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
      const v = parts[key];
      if (v === null) continue;
      num += WEIGHTS[key] * v;
      den += WEIGHTS[key];
    }
    if (den === 0) continue; // nothing at all to judge this spot by

    const base = num / den;
    const explore = EXPLORE_BONUS / Math.sqrt(1 + c.tripCount);
    const crowd = CROWD_PENALTY * clamp((c.trips7d - 5) / 15, 0, 1);
    const score = clamp(base + explore - crowd, 0, 1);

    const reasons: string[] = [];
    if (c.communityScore !== null) {
      reasons.push(
        `Community score ${c.communityScore.toFixed(1)} of 5 from ${c.reviewCount} review${c.reviewCount === 1 ? "" : "s"}.`
      );
    } else {
      reasons.push("No reviews yet, so it is ranked on the other signals.");
    }
    if (c.conditionsProb !== null) {
      const top = c.conditionDrivers?.[0];
      const pct = Math.round(c.conditionsProb * 100);
      reasons.push(
        top && Math.abs(top.effect) >= 0.2
          ? `${pct}% chance of a good trip in current conditions; ${top.group} is ${top.effect > 0 ? "helping" : "holding it back"}.`
          : `${pct}% chance of a good trip in current conditions.`
      );
    }
    if (personal) {
      reasons.push(
        `Fishers with similar taste to yours rate it about ${personal.rating.toFixed(1)} (${personal.neighbours} similar fisher${personal.neighbours === 1 ? "" : "s"}).`
      );
    }
    if (distanceKm !== null) reasons.push(`About ${distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km from you.`);
    if (explore >= 0.04) reasons.push("Few trips logged here so far: worth exploring.");
    if (crowd > 0) reasons.push(`Busy this week (${c.trips7d} trips in 7 days).`);

    out.push({ spotId: c.id, score, distanceKm, parts, reasons });
  }

  out.sort((a, b) => b.score - a.score || a.spotId.localeCompare(b.spotId));
  return out.slice(0, req.limit);
}
