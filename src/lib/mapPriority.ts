// Which spot wins when two spots would overlap on the map.
//
// A plain average would let one 5-star review outrank a spot with 4.6 stars from
// 30 fishers. So the rating is pulled toward a neutral prior until a spot has
// enough reviews (a "Bayesian average"):
//   - a spot with no reviews scores exactly the prior (3.5)
//   - each review moves the score toward the spot's real average
//   - PRIOR_WEIGHT is how many reviews it takes to count as much as the prior
const PRIOR_MEAN = 3.5;
const PRIOR_WEIGHT = 3;

export function spotPriority(avgRating: number, reviewCount: number): number {
  const n = Number.isFinite(reviewCount) && reviewCount > 0 ? reviewCount : 0;
  const mean = n > 0 && Number.isFinite(avgRating) ? avgRating : PRIOR_MEAN;
  return (n * mean + PRIOR_WEIGHT * PRIOR_MEAN) / (n + PRIOR_WEIGHT);
}

// When the weighted community score exists (reviews weighted by recency, trip
// verification and moderation) it already includes the same pull toward 3.5,
// so it is used directly; otherwise fall back to the plain Bayesian average.
export function spotPriorityFrom(
  communityScore: number | null | undefined,
  avgRating: number,
  reviewCount: number
): number {
  if (communityScore !== null && communityScore !== undefined && Number.isFinite(Number(communityScore))) {
    return Number(communityScore);
  }
  return spotPriority(avgRating, reviewCount);
}
