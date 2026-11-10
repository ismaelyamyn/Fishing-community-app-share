// Made-up but realistic fishing data for trying out Phase 4.
// Everything here is DEMO data: weather is generated, not measured, and the
// "patterns" are planted on purpose so you can watch the models find them.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a fixed pseudo-random number for any integer, so one hour always has the same weather
function hash01(n) {
  return mulberry32(Math.imul(n, 2654435761) >>> 0)();
}

export function weatherAt(date) {
  const ms = date.getTime();
  const hour = Math.floor(ms / 3_600_000);
  const windSpeed = Math.round((0.5 + 9.5 * Math.pow(hash01(hour * 3 + 1), 1.4)) * 10) / 10;
  const windDir = Math.floor(hash01(hour * 3 + 2) * 360);
  const temperature = Math.round((28 + 2 * Math.sin(ms / 86_400_000) + 1.5 * hash01(hour * 3 + 3)) * 10) / 10;

  const tideCycle = (2 * Math.PI * ms) / (12.42 * 3_600_000);
  const tideHeight = Math.round(0.5 * Math.sin(tideCycle) * 100) / 100;
  const tidePhase =
    Math.abs(Math.sin(tideCycle)) > 0.9 ? (Math.sin(tideCycle) > 0 ? "high" : "low") : Math.cos(tideCycle) > 0 ? "rising" : "falling";

  return { windSpeed, windDir, temperature, tideHeight, tidePhase };
}

export function localHour(date) {
  return (date.getUTCHours() + 5) % 24;
}

// Each demo spot has its own personality.
export const SPOT_TEMPLATES = [
  { name: "Demo: Dawn Drop-off", baseline: 0.3, dawnBoost: 0.5, calmBoost: 0.0, quality: 0.9, group: 0 },
  { name: "Demo: Calm Lagoon Edge", baseline: 0.3, dawnBoost: 0.0, calmBoost: 0.45, quality: 0.8, group: 0 },
  { name: "Demo: Reef Corner", baseline: 0.5, dawnBoost: 0.0, calmBoost: 0.0, quality: 0.6, group: 0 },
  { name: "Demo: Old Channel", baseline: 0.45, dawnBoost: 0.15, calmBoost: 0.15, quality: 0.5, group: 0 },
  { name: "Demo: Deep Wall", baseline: 0.4, dawnBoost: 0.0, calmBoost: 0.0, quality: 0.9, group: 1 },
  { name: "Demo: Sandbank Flats", baseline: 0.35, dawnBoost: 0.3, calmBoost: 0.2, quality: 0.7, group: 1 },
  { name: "Demo: Outer Reef Gap", baseline: 0.55, dawnBoost: 0.0, calmBoost: 0.0, quality: 0.4, group: 1 },
  { name: "Demo: Quiet Cove", baseline: 0.3, dawnBoost: 0.1, calmBoost: 0.1, quality: 0.3, group: 1 },
];

// Fishers like to start at first light, so a share of demo trips begin at dawn
// (this also gives the analytics enough dawn trips to compare).
export function maybeStartAtDawn(date, rand) {
  if (rand() < 0.3) date.setUTCHours((4 + Math.floor(rand() * 4) - 5 + 24) % 24);
  return date;
}

export function goodCatchProbability(template, weather, hour) {
  let p = template.baseline;
  // everywhere: calm weather helps and a strong wind hurts (the pattern the weather model should learn)
  if (weather.windSpeed < 4) p += 0.2;
  else if (weather.windSpeed > 7) p -= 0.2;
  if (hour >= 4 && hour < 8) p += template.dawnBoost;
  if (weather.windSpeed < 4) p += template.calmBoost;
  else if (weather.windSpeed > 7) p -= template.calmBoost;
  return Math.min(0.95, Math.max(0.05, p));
}

const GOOD = [
  "Great spot, plenty of fish and easy to reach.",
  "Excellent catch today, will be back.",
  "Very productive, the tuna were biting all morning.",
  "Nice calm water and good fishing.",
  "Love this place, reliable every season.",
];
const OK = [
  "Decent spot, some fish but nothing special.",
  "Fine for an afternoon, mixed results.",
  "Worth a try if you are nearby.",
];
const BAD = [
  "Poor results, nothing biting for hours.",
  "Rough water and crowded, not worth the trip.",
  "Disappointing, it used to be better.",
];

export function commentFor(rating, rand) {
  const pool = rating >= 4 ? GOOD : rating === 3 ? OK : BAD;
  return rand() < 0.7 ? pool[Math.floor(rand() * pool.length)] : null;
}

export const DEMO_EMAIL_SUFFIX = "@fishing-demo.invalid";
