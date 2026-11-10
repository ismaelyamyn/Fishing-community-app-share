// Maldives time helpers. The country is UTC+5 all year (no daylight saving).

const MALDIVES_OFFSET_HOURS = 5;

export type Season = "ne_monsoon" | "sw_monsoon";
export type DayPart = "dawn" | "morning" | "afternoon" | "evening" | "night";

export function localTime(at: Date): { hour: number; month: number } {
  const shifted = new Date(at.getTime() + MALDIVES_OFFSET_HOURS * 3_600_000);
  return {
    hour: shifted.getUTCHours() + shifted.getUTCMinutes() / 60,
    month: shifted.getUTCMonth() + 1,
  };
}

// Northeast monsoon (Iruvai) Dec to Apr, southwest monsoon (Hulhangu) May to Nov
export function seasonOf(month: number): Season {
  return month >= 5 && month <= 11 ? "sw_monsoon" : "ne_monsoon";
}

export const SEASON_LABEL: Record<Season, string> = {
  ne_monsoon: "northeast monsoon (Dec to Apr)",
  sw_monsoon: "southwest monsoon (May to Nov)",
};

export function dayPartOf(hour: number): DayPart {
  if (hour >= 4 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

// first and last whole hour of each part (night wraps past midnight)
export const DAY_PART_HOURS: Record<DayPart, [number, number]> = {
  dawn: [4, 7],
  morning: [8, 11],
  afternoon: [12, 16],
  evening: [17, 20],
  night: [21, 3],
};

export const DAY_PART_LABEL: Record<DayPart, string> = {
  dawn: "dawn (4 to 8 am)",
  morning: "morning (8 am to noon)",
  afternoon: "afternoon (noon to 5 pm)",
  evening: "evening (5 to 9 pm)",
  night: "night (9 pm to 4 am)",
};

const COMPASS_16 = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

export function compass16(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  return COMPASS_16[Math.round(d / 22.5) % 16];
}

const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function compass8(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  return COMPASS_8[Math.round(d / 45) % 8];
}

export function msToKnots(ms: number): number {
  return ms * 1.943844;
}
