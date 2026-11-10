// Module 5: spot analytics. "When does THIS spot fish best?"
// For each of four conditions (wind strength, wind direction, time of day, season)
// trips are split into bins and the good-catch rate of each bin is compared.
// To avoid reporting luck as a pattern:
//   - a spot needs at least 20 trips, and a bin at least 5 trips, to be considered
//   - significance comes from a permutation test on the best-looking bin (shuffle the
//     outcomes 1000 times; how often does chance alone produce a bin this far ahead
//     of the rest?), seeded so results repeat
//   - p-values are multiplied by 4 (Bonferroni) because four conditions were checked
//   - the best bin must also beat the other trips by at least 15 percentage points

import { mulberry32, hashString, shuffleInPlace } from "./rng";
import { compass8, DAY_PART_LABEL, dayPartOf, localTime, seasonOf, SEASON_LABEL } from "./time";

export const MIN_TRIPS = 20;
export const MIN_BIN = 5;
export const MIN_EFFECT = 0.15;
export const ALPHA = 0.05;
export const PERMUTATIONS = 1000;
const N_TESTS = 4;

export type SpotTrip = {
  startedAt: Date;
  goodCatch: boolean;
  windSpeedMs: number | null;
  windDirDeg: number | null;
};

export type Dimension = "wind_speed" | "wind_direction" | "time_of_day" | "season";

export type BinStat = { bin: string; label: string; trips: number; good: number; rate: number };

export type Finding = {
  dimension: Dimension;
  bestBin: string;
  bestLabel: string;
  bestRate: number;
  restRate: number;
  pValue: number; // Bonferroni-adjusted
  bins: BinStat[];
  sentence: string;
};

export type SpotAnalytics = {
  tripCount: number;
  goodRate: number | null;
  enoughData: boolean;
  findings: Finding[];
};

function windSpeedBin(ms: number): { bin: string; label: string } {
  if (ms < 3) return { bin: "light", label: "light wind (under 3 m/s)" };
  if (ms < 6) return { bin: "moderate", label: "moderate wind (3 to 6 m/s)" };
  return { bin: "fresh", label: "fresh wind (over 6 m/s)" };
}

function binOf(trip: SpotTrip, dim: Dimension): { bin: string; label: string } | null {
  switch (dim) {
    case "wind_speed":
      return trip.windSpeedMs === null ? null : windSpeedBin(trip.windSpeedMs);
    case "wind_direction": {
      if (trip.windDirDeg === null || trip.windSpeedMs === null) return null;
      const c = compass8(trip.windDirDeg);
      return { bin: c, label: `${c} wind` };
    }
    case "time_of_day": {
      const part = dayPartOf(localTime(trip.startedAt).hour);
      return { bin: part, label: DAY_PART_LABEL[part] };
    }
    case "season": {
      const s = seasonOf(localTime(trip.startedAt).month);
      return { bin: s, label: SEASON_LABEL[s] };
    }
  }
}

// How strongly the best-looking bin stands out from all the other trips:
// the largest 2x2 chi-square (this bin versus the rest), counting only bins that
// do BETTER than the rest. Taking the maximum over bins and then permuting the
// outcomes means the test already allows for having looked at every bin.
function bestBinStat(sizes: number[], good: number[]): number {
  const total = sizes.reduce((a, b) => a + b, 0);
  const totalGood = good.reduce((a, b) => a + b, 0);
  let best = 0;
  for (let i = 0; i < sizes.length; i++) {
    const n1 = sizes[i];
    const n2 = total - n1;
    if (n1 === 0 || n2 === 0) continue;
    const g1 = good[i];
    const g2 = totalGood - g1;
    if (g1 / n1 <= g2 / n2) continue; // not better than the rest
    const p = totalGood / total;
    if (p <= 0 || p >= 1) continue;
    const chi =
      (g1 - n1 * p) ** 2 / (n1 * p * (1 - p)) + (g2 - n2 * p) ** 2 / (n2 * p * (1 - p));
    if (chi > best) best = chi;
  }
  return best;
}

function permutationP(binIdx: number[], outcomes: number[], nBins: number, seed: number): number {
  const sizes = new Array<number>(nBins).fill(0);
  for (const b of binIdx) sizes[b]++;

  const tally = (labels: number[]) => {
    const good = new Array<number>(nBins).fill(0);
    for (let i = 0; i < binIdx.length; i++) good[binIdx[i]] += labels[i];
    return good;
  };

  const observed = bestBinStat(sizes, tally(outcomes));
  const rand = mulberry32(seed);
  const shuffled = [...outcomes];
  let extreme = 0;
  for (let k = 0; k < PERMUTATIONS; k++) {
    shuffleInPlace(shuffled, rand);
    if (bestBinStat(sizes, tally(shuffled)) >= observed - 1e-9) extreme++;
  }
  return (extreme + 1) / (PERMUTATIONS + 1);
}

const DIM_NAME: Record<Dimension, string> = {
  wind_speed: "wind strength",
  wind_direction: "wind direction",
  time_of_day: "time of day",
  season: "season",
};

export function analyseSpot(spotId: string, trips: SpotTrip[]): SpotAnalytics {
  const tripCount = trips.length;
  const goodRate = tripCount ? trips.filter((t) => t.goodCatch).length / tripCount : null;
  if (tripCount < MIN_TRIPS) return { tripCount, goodRate, enoughData: false, findings: [] };

  const findings: Finding[] = [];
  const dims: Dimension[] = ["wind_speed", "wind_direction", "time_of_day", "season"];

  for (const dim of dims) {
    // bin the trips, dropping those missing the needed reading
    const byBin = new Map<string, { label: string; good: number; n: number }>();
    for (const t of trips) {
      const b = binOf(t, dim);
      if (!b) continue;
      const e = byBin.get(b.bin) ?? { label: b.label, good: 0, n: 0 };
      e.n++;
      if (t.goodCatch) e.good++;
      byBin.set(b.bin, e);
    }

    // only bins with enough trips take part
    const kept = [...byBin.entries()].filter(([, e]) => e.n >= MIN_BIN);
    if (kept.length < 2) continue;
    const keptTrips = kept.reduce((a, [, e]) => a + e.n, 0);
    if (keptTrips < MIN_TRIPS) continue;

    const binIdx: number[] = [];
    const outcomes: number[] = [];
    kept.forEach(([bin], i) => {
      for (const t of trips) {
        const b = binOf(t, dim);
        if (b && b.bin === bin) {
          binIdx.push(i);
          outcomes.push(t.goodCatch ? 1 : 0);
        }
      }
    });

    const pRaw = permutationP(binIdx, outcomes, kept.length, hashString(`${spotId}:${dim}`));
    const p = Math.min(1, pRaw * N_TESTS);

    const bins: BinStat[] = kept
      .map(([bin, e]) => ({ bin, label: e.label, trips: e.n, good: e.good, rate: e.good / e.n }))
      .sort((a, b) => b.rate - a.rate);

    const best = bins[0];
    const restTrips = bins.slice(1).reduce((a, b) => a + b.trips, 0);
    const restGood = bins.slice(1).reduce((a, b) => a + b.good, 0);
    const restRate = restGood / restTrips;
    const effect = best.rate - restRate;

    if (p < ALPHA && effect >= MIN_EFFECT) {
      findings.push({
        dimension: dim,
        bestBin: best.bin,
        bestLabel: best.label,
        bestRate: best.rate,
        restRate,
        pValue: p,
        bins,
        sentence:
          `Best ${DIM_NAME[dim]} here: ${best.label}. ` +
          `${Math.round(best.rate * 100)}% of ${best.trips} trips caught well, versus ` +
          `${Math.round(restRate * 100)}% at other times.`,
      });
    }
  }

  findings.sort((a, b) => a.pValue - b.pValue);
  return { tripCount, goodRate, enoughData: true, findings };
}
