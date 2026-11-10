// Module 1: the community score of a spot (1 to 5).
//
// A weighted average of its reviews where each review's weight is:
//   recency   half-life of 180 days (floor 0.1): old reviews fade, never vanish
//   verified  1.0 when tied to the reviewer's own trip, 0.5 when not
//   flags     x0.6 for each open flag (floor 0.2); removed (upheld) = 0
//   creator   x0.5 when the reviewer is the one who added the spot
// The review text nudges its stars by at most 0.3 (see sentiment.ts).
// The result is pulled toward 3.5 until a spot has enough weight behind it,
// so one enthusiastic review cannot top a spot with dozens of solid ones.

import { adjustedRating } from "./sentiment";

export const PRIOR_MEAN = 3.5;
export const PRIOR_WEIGHT = 3;
export const HALF_LIFE_DAYS = 180;

export type ReviewInput = {
  rating: number;
  comment: string | null;
  createdAt: Date;
  verified: boolean;
  reviewerId: string;
  spotCreatorId: string | null;
  openFlags: number;
  upheldFlags: number;
  hidden: boolean;
};

export type ScoreResult = {
  score: number | null; // null = no usable reviews
  effectiveWeight: number;
  reviewCount: number; // reviews that counted
};

export function reviewWeight(r: ReviewInput, now: Date): number {
  if (r.hidden || r.upheldFlags > 0) return 0;

  const ageDays = Math.max(0, (now.getTime() - r.createdAt.getTime()) / 86_400_000);
  const recency = Math.max(0.1, Math.pow(0.5, ageDays / HALF_LIFE_DAYS));
  const verified = r.verified ? 1 : 0.5;
  const flags = Math.max(0.2, Math.pow(0.6, r.openFlags));
  const creator = r.spotCreatorId !== null && r.reviewerId === r.spotCreatorId ? 0.5 : 1;

  return recency * verified * flags * creator;
}

export function communityScore(reviews: ReviewInput[], now: Date): ScoreResult {
  let weighted = 0;
  let total = 0;
  let counted = 0;

  for (const r of reviews) {
    const w = reviewWeight(r, now);
    if (w <= 0) continue;
    weighted += w * adjustedRating(r.rating, r.comment);
    total += w;
    counted++;
  }

  if (counted === 0) return { score: null, effectiveWeight: 0, reviewCount: 0 };

  const score = (weighted + PRIOR_WEIGHT * PRIOR_MEAN) / (total + PRIOR_WEIGHT);
  return { score: Math.round(score * 1000) / 1000, effectiveWeight: total, reviewCount: counted };
}
