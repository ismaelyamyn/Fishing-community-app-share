// Module 3: personal filter ("fishers like you liked these spots").
// User-based collaborative filtering: mean-centre each fisher's ratings, compare
// fishers by cosine similarity over spots both have rated, then predict a rating
// for an unseen spot from the top neighbours who rated it.
// Similarity is shrunk by n/(n+3) so two fishers sharing a single spot are not
// treated as twins. Needs at least 2 spots in common to count as a neighbour.

export type Rating = { userId: string; spotId: string; rating: number };

export const MIN_COMMON = 2;
export const SHRINK = 3;
export const TOP_NEIGHBOURS = 10;

type UserVec = { mean: number; ratings: Map<string, number> };

function buildUsers(ratings: Rating[]): Map<string, UserVec> {
  const users = new Map<string, UserVec>();
  for (const r of ratings) {
    let u = users.get(r.userId);
    if (!u) users.set(r.userId, (u = { mean: 0, ratings: new Map() }));
    u.ratings.set(r.spotId, r.rating);
  }
  for (const u of users.values()) {
    let s = 0;
    for (const v of u.ratings.values()) s += v;
    u.mean = s / u.ratings.size;
  }
  return users;
}

function similarity(a: UserVec, b: UserVec): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  let common = 0;
  for (const [spot, ra] of a.ratings) {
    const rb = b.ratings.get(spot);
    if (rb === undefined) continue;
    const da = ra - a.mean;
    const db = rb - b.mean;
    dot += da * db;
    na += da * da;
    nb += db * db;
    common++;
  }
  if (common < MIN_COMMON || na === 0 || nb === 0) return 0;
  return (dot / Math.sqrt(na * nb)) * (common / (common + SHRINK));
}

export type PersonalPrediction = { rating: number; neighbours: number; confidence: number };

// Predicted 1-5 rating for each requested spot the user has not rated.
// A spot is omitted when no similar neighbour has rated it.
export function predictForUser(
  ratings: Rating[],
  userId: string,
  spotIds: string[]
): Map<string, PersonalPrediction> {
  const users = buildUsers(ratings);
  const me = users.get(userId);
  const out = new Map<string, PersonalPrediction>();
  if (!me) return out;

  const sims: { id: string; sim: number; vec: UserVec }[] = [];
  for (const [id, vec] of users) {
    if (id === userId) continue;
    const sim = similarity(me, vec);
    if (sim > 0) sims.push({ id, sim, vec });
  }
  sims.sort((a, b) => b.sim - a.sim);

  for (const spotId of spotIds) {
    if (me.ratings.has(spotId)) continue;

    let num = 0;
    let den = 0;
    let used = 0;
    for (const n of sims) {
      const r = n.vec.ratings.get(spotId);
      if (r === undefined) continue;
      num += n.sim * (r - n.vec.mean);
      den += n.sim;
      if (++used >= TOP_NEIGHBOURS) break;
    }
    if (used === 0 || den === 0) continue;

    const rating = Math.min(5, Math.max(1, me.mean + num / den));
    out.set(spotId, { rating, neighbours: used, confidence: den / (den + 1) });
  }
  return out;
}
