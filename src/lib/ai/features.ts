// Module 2 (part 1): turns a trip's weather into numbers a model can use.
// Missing readings are filled with the training average, and a "was missing"
// flag lets the model learn that absence is not the same as an average day.

import { localTime, seasonOf } from "./time";

export type Conditions = {
  startedAt: Date;
  windSpeedMs: number | null;
  windDirDeg: number | null;
  temperatureC: number | null;
  tideHeightM: number | null;
  tidePhase: "low" | "rising" | "high" | "falling" | null;
};

export const FEATURE_NAMES = [
  "wind_speed",
  "wind_east_west",
  "wind_north_south",
  "temperature",
  "tide_height",
  "tide_rising",
  "tide_falling",
  "tide_high",
  "time_sin",
  "time_cos",
  "sw_monsoon",
  "wind_missing",
  "tide_missing",
] as const;

// which features belong together when explaining a prediction in plain words
export const FEATURE_GROUPS: Record<string, string[]> = {
  wind: ["wind_speed", "wind_east_west", "wind_north_south", "wind_missing"],
  temperature: ["temperature"],
  tide: ["tide_height", "tide_rising", "tide_falling", "tide_high", "tide_missing"],
  "time of day": ["time_sin", "time_cos"],
  season: ["sw_monsoon"],
};

export type FillValues = { windSpeed: number; temperature: number; tideHeight: number };

export function computeFill(rows: Conditions[]): FillValues {
  const avg = (vals: (number | null)[], fallback: number) => {
    const ok = vals.filter((v): v is number => v !== null && Number.isFinite(v));
    return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : fallback;
  };
  return {
    windSpeed: avg(rows.map((r) => r.windSpeedMs), 4),
    temperature: avg(rows.map((r) => r.temperatureC), 29),
    tideHeight: avg(rows.map((r) => r.tideHeightM), 0),
  };
}

export function toFeatures(c: Conditions, fill: FillValues): number[] {
  const windMissing = c.windSpeedMs === null || c.windDirDeg === null;
  const speed = c.windSpeedMs ?? fill.windSpeed;
  // direction the wind blows FROM, split into two smooth components (359 deg is close to 1 deg)
  const rad = ((c.windDirDeg ?? 0) * Math.PI) / 180;
  const east = windMissing ? 0 : Math.sin(rad) * speed;
  const north = windMissing ? 0 : Math.cos(rad) * speed;

  const { hour, month } = localTime(c.startedAt);
  const angle = (hour / 24) * 2 * Math.PI;

  return [
    speed,
    east,
    north,
    c.temperatureC ?? fill.temperature,
    c.tideHeightM ?? fill.tideHeight,
    c.tidePhase === "rising" ? 1 : 0,
    c.tidePhase === "falling" ? 1 : 0,
    c.tidePhase === "high" ? 1 : 0,
    Math.sin(angle),
    Math.cos(angle),
    seasonOf(month) === "sw_monsoon" ? 1 : 0,
    windMissing ? 1 : 0,
    c.tideHeightM === null && c.tidePhase === null ? 1 : 0,
  ];
}
