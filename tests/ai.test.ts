// Run with: npm run test:ai   (compiles with tsc, then runs under node; no test framework needed)
import assert from "node:assert/strict";
import { mulberry32 } from "../src/lib/ai/rng";
import { sentimentScore, adjustedRating } from "../src/lib/ai/sentiment";
import { communityScore, ReviewInput } from "../src/lib/ai/communityScore";
import { auc, trainLogistic, predictProba } from "../src/lib/ai/logistic";
import { trainConditionsModel, conditionsProbability, TrainingTrip } from "../src/lib/ai/conditionsModel";
import { predictForUser, Rating } from "../src/lib/ai/collaborative";
import { analyseSpot, SpotTrip } from "../src/lib/ai/analytics";
import { recommend, Candidate } from "../src/lib/ai/recommender";
import { dayPartOf, localTime, seasonOf } from "../src/lib/ai/time";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log("ok  ", name);
}

const now = new Date("2026-06-01T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

// ---------- time
test("Maldives time is UTC+5 and seasons follow the monsoons", () => {
  const t = localTime(new Date("2026-01-01T20:00:00Z")); // 01:00 on 2 Jan local
  assert.equal(t.hour, 1);
  assert.equal(t.month, 1);
  assert.equal(seasonOf(1), "ne_monsoon");
  assert.equal(seasonOf(7), "sw_monsoon");
  assert.equal(dayPartOf(5), "dawn");
  assert.equal(dayPartOf(23), "night");
});

// ---------- sentiment
test("sentiment: direction, negation and bounds", () => {
  assert.ok(sentimentScore("Great spot, plenty of fish and very easy access") > 0.3);
  assert.ok(sentimentScore("Terrible, nothing biting and dangerous currents") < -0.3);
  assert.ok(sentimentScore("not good at all") < 0);
  assert.equal(sentimentScore(null), 0);
  assert.equal(sentimentScore("ok"), 0);
  for (const txt of ["great great great great great great great", "bad bad bad bad bad bad bad bad"]) {
    const r = adjustedRating(3, txt);
    assert.ok(Math.abs(r - 3) <= 0.3 + 1e-9);
  }
  assert.ok(adjustedRating(5, "excellent amazing perfect") <= 5);
  assert.ok(adjustedRating(1, "terrible awful worst") >= 1);
});

// ---------- community score
const rev = (o: Partial<ReviewInput>): ReviewInput => ({
  rating: 5,
  comment: null,
  createdAt: daysAgo(1),
  verified: true,
  reviewerId: "u" + Math.random(),
  spotCreatorId: "creator",
  openFlags: 0,
  upheldFlags: 0,
  hidden: false,
  ...o,
});

test("community score: no reviews, shrinkage, hidden and flagged", () => {
  assert.equal(communityScore([], now).score, null);

  const one = communityScore([rev({})], now).score!;
  assert.ok(one > 3.5 && one < 4.5, `one 5-star review is pulled toward 3.5 (got ${one})`);

  const many = communityScore(Array.from({ length: 30 }, () => rev({})), now).score!;
  assert.ok(many > 4.7, `many 5-star reviews approach 5 (got ${many})`);

  const hidden = communityScore([rev({ hidden: true }), rev({ upheldFlags: 1 })], now);
  assert.equal(hidden.score, null);

  const base = communityScore([rev({ rating: 2 }), rev({ rating: 5 })], now).score!;
  const flagged = communityScore([rev({ rating: 2 }), rev({ rating: 5, openFlags: 2 })], now).score!;
  assert.ok(flagged < base, "open flags reduce a review's influence");
});

test("community score: recency, verification and creator weighting", () => {
  const old = communityScore([rev({ rating: 1, createdAt: daysAgo(720) }), rev({ rating: 5 })], now).score!;
  const fresh = communityScore([rev({ rating: 1 }), rev({ rating: 5 })], now).score!;
  assert.ok(old > fresh, "an old bad review counts less than a recent one");

  const self = communityScore([rev({ rating: 5, reviewerId: "creator" }), rev({ rating: 3 })], now).score!;
  const other = communityScore([rev({ rating: 5 }), rev({ rating: 3 })], now).score!;
  assert.ok(self < other, "the creator's own review is discounted");

  const unverified = communityScore([rev({ rating: 5, verified: false }), rev({ rating: 3 })], now).score!;
  assert.ok(unverified < other, "an unverified review counts less");
});

// ---------- logistic regression
test("logistic regression learns a planted signal; AUC is correct", () => {
  const rand = mulberry32(1);
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < 400; i++) {
    const a = rand() * 10;
    const b = rand() * 10; // noise
    X.push([a, b]);
    y.push(rand() < 1 / (1 + Math.exp(-(a - 5))) ? 1 : 0);
  }
  const m = trainLogistic(X, y);
  assert.ok(Math.abs(m.weights[0]) > 3 * Math.abs(m.weights[1]), "signal feature dominates noise feature");
  assert.ok(predictProba(m, [9, 5]) > predictProba(m, [1, 5]));

  assert.equal(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]), 1);
  assert.equal(auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1]), 0);
  assert.equal(auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1]), 0.5);
});

// ---------- conditions model
function syntheticTrips(n: number, seed: number, signal: boolean): TrainingTrip[] {
  const rand = mulberry32(seed);
  const trips: TrainingTrip[] = [];
  for (let i = 0; i < n; i++) {
    const wind = rand() * 10;
    const hour = Math.floor(rand() * 24);
    const startedAt = new Date(Date.UTC(2026, Math.floor(rand() * 12), 1 + Math.floor(rand() * 27), hour - 5, 0));
    const p = signal ? 1 / (1 + Math.exp(2 * (wind - 5))) : 0.5; // calm weather is good
    trips.push({
      startedAt,
      windSpeedMs: wind,
      windDirDeg: rand() * 360,
      temperatureC: 28 + rand() * 3,
      tideHeightM: rand(),
      tidePhase: (["low", "rising", "high", "falling"] as const)[Math.floor(rand() * 4)],
      goodCatch: rand() < p,
    });
  }
  return trips;
}

test("conditions model: refuses tiny data, rejects noise, accepts a real effect", () => {
  assert.equal(trainConditionsModel(syntheticTrips(10, 1, true)).usable, false);

  const noise = trainConditionsModel(syntheticTrips(300, 2, false));
  assert.equal(noise.usable, false, `noise must not be usable (cv auc ${noise.metrics?.cvAuc})`);

  const real = trainConditionsModel(syntheticTrips(300, 3, true));
  assert.equal(real.usable, true, real.reason);
  const calm = conditionsProbability(real, { ...syntheticTrips(1, 9, true)[0], windSpeedMs: 1 })!;
  const gale = conditionsProbability(real, { ...syntheticTrips(1, 9, true)[0], windSpeedMs: 9 })!;
  assert.ok(calm > gale + 0.3, `calm ${calm} vs gale ${gale}`);
});

// ---------- collaborative filtering
test("collaborative filtering: follows the like-minded fisher", () => {
  const R = (userId: string, spotId: string, rating: number): Rating => ({ userId, spotId, rating });
  const ratings = [
    // me and "twin" agree on A, B, C; "opposite" disagrees
    R("me", "A", 5), R("me", "B", 1), R("me", "C", 5),
    R("twin", "A", 5), R("twin", "B", 1), R("twin", "C", 4), R("twin", "D", 5), R("twin", "E", 1),
    R("opposite", "A", 1), R("opposite", "B", 5), R("opposite", "C", 1), R("opposite", "D", 1), R("opposite", "E", 5),
  ];
  const p = predictForUser(ratings, "me", ["A", "D", "E", "Z"]);
  assert.ok(!p.has("A"), "rated spots are not predicted");
  assert.ok(!p.has("Z"), "unseen by neighbours: no prediction");
  assert.ok(p.get("D")!.rating > p.get("E")!.rating + 1.5);
  assert.equal(predictForUser(ratings, "stranger", ["D"]).size, 0);

  // one shared spot is not enough to count as similar
  const thin = predictForUser([R("me", "A", 5), R("x", "A", 5), R("x", "D", 5)], "me", ["D"]);
  assert.equal(thin.size, 0);
});

// ---------- analytics
function spotTrips(n: number, seed: number, effect: boolean): SpotTrip[] {
  const rand = mulberry32(seed);
  const out: SpotTrip[] = [];
  for (let i = 0; i < n; i++) {
    const hour = Math.floor(rand() * 24);
    const startedAt = new Date(Date.UTC(2026, Math.floor(rand() * 12), 1 + Math.floor(rand() * 27), hour - 5, 0));
    const dawn = dayPartOf(localTime(startedAt).hour) === "dawn";
    const p = effect ? (dawn ? 0.85 : 0.3) : 0.45;
    out.push({ startedAt, goodCatch: rand() < p, windSpeedMs: rand() * 9, windDirDeg: rand() * 360 });
  }
  return out;
}

test("analytics: finds a planted dawn effect, stays quiet on noise, needs enough trips", () => {
  const few = analyseSpot("s1", spotTrips(12, 1, true));
  assert.equal(few.enoughData, false);
  assert.equal(few.findings.length, 0);

  const planted = analyseSpot("s1", spotTrips(300, 2, true));
  const f = planted.findings.find((x) => x.dimension === "time_of_day");
  assert.ok(f, "dawn effect detected");
  assert.equal(f!.bestBin, "dawn");
  assert.match(f!.sentence, /dawn/);

  // across many noise-only spots, false alarms must stay rare
  let spotsWithFindings = 0;
  for (let s = 0; s < 20; s++) {
    if (analyseSpot(`noise${s}`, spotTrips(120, 100 + s, false)).findings.length > 0) spotsWithFindings++;
  }
  assert.ok(spotsWithFindings <= 3, `too many false alarms: ${spotsWithFindings}/20`);

  // deterministic
  assert.deepEqual(analyseSpot("s1", spotTrips(300, 2, true)).findings.map((x) => x.pValue), planted.findings.map((x) => x.pValue));
});

// ---------- recommender
const cand = (o: Partial<Candidate>): Candidate => ({
  id: "x",
  lat: 4.2,
  lon: 73.5,
  communityScore: 3.5,
  reviewCount: 5,
  tripCount: 40,
  trips7d: 0,
  speciesIds: [1],
  conditionsProb: null,
  ...o,
});
const baseReq = { location: null, speciesId: null, maxDistanceKm: null, personal: new Map(), limit: 10 };

test("recommender: ranking, filters, missing signals, crowd and exploration", () => {
  const spots = [
    cand({ id: "best", communityScore: 4.8, conditionsProb: 0.8 }),
    cand({ id: "meh", communityScore: 3.0, conditionsProb: 0.4 }),
    cand({ id: "bad", communityScore: 2.0, conditionsProb: 0.2 }),
  ];
  const r = recommend(spots, baseReq);
  assert.deepEqual(r.map((x) => x.spotId), ["best", "meh", "bad"]);

  // species is a hard filter
  const sp = recommend([cand({ id: "a", speciesIds: [1] }), cand({ id: "b", speciesIds: [2] })], { ...baseReq, speciesId: 2 });
  assert.deepEqual(sp.map((x) => x.spotId), ["b"]);

  // distance: nearer wins when all else is equal; max distance excludes
  const here = { lat: 4.2, lon: 73.5 };
  const near = cand({ id: "near", lat: 4.21, lon: 73.5 });
  const far = cand({ id: "far", lat: 5.2, lon: 73.5 });
  const d = recommend([far, near], { ...baseReq, location: here });
  assert.equal(d[0].spotId, "near");
  assert.deepEqual(recommend([far, near], { ...baseReq, location: here, maxDistanceKm: 50 }).map((x) => x.spotId), ["near"]);

  // a missing signal is not punished: unreviewed spot with a good forecast still scores
  const unrated = recommend([cand({ id: "new", communityScore: null, conditionsProb: 0.9, tripCount: 0 })], baseReq);
  assert.equal(unrated.length, 1);
  assert.ok(unrated[0].score > 0.8);
  assert.equal(recommend([cand({ id: "none", communityScore: null })], baseReq).length, 0);

  // crowding lowers, exploration raises
  const calm = recommend([cand({ id: "c", trips7d: 0 })], baseReq)[0].score;
  const busy = recommend([cand({ id: "c", trips7d: 25 })], baseReq)[0].score;
  assert.ok(busy < calm);
  const unexplored = recommend([cand({ id: "e", tripCount: 0 })], baseReq)[0].score;
  const known = recommend([cand({ id: "e", tripCount: 100 })], baseReq)[0].score;
  assert.ok(unexplored > known);

  // personal signal pulls a spot up, and reasons are explained
  const pers = recommend([cand({ id: "p" }), cand({ id: "q" })], {
    ...baseReq,
    personal: new Map([["p", { rating: 4.9, neighbours: 3 }]]),
  });
  assert.equal(pers[0].spotId, "p");
  assert.ok(pers[0].reasons.some((x) => /similar taste/.test(x)));

  // limit and scores in range
  const many = recommend(Array.from({ length: 25 }, (_, i) => cand({ id: "s" + i, communityScore: 1 + (i % 5) })), { ...baseReq, limit: 10 });
  assert.equal(many.length, 10);
  assert.ok(many.every((x) => x.score >= 0 && x.score <= 1));
});

console.log(`\n${passed} test groups passed`);
