// Current conditions for a point in the Maldives.
//   wind + air temperature : OpenWeather (needs OPENWEATHER_API_KEY)
//   sea level / tide       : Open-Meteo Marine API (no key, non-commercial use, modelled ~8 km)
// Server-side only: the API key must never reach the browser.

export type TidePhase = "low" | "rising" | "high" | "falling";

export type Conditions = {
  observedAt: string; // ISO time of the weather observation
  windSpeedMs: number | null;
  windDirDeg: number | null;
  temperatureC: number | null;
  tideHeightM: number | null; // metres relative to mean sea level (modelled)
  tidePhase: TidePhase | null;
  warnings: string[];
};

// Weather barely changes within ~10 km, so round to 0.1 degree: better caching, fewer API calls
export function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

type WeatherPart = {
  windSpeedMs: number | null;
  windDirDeg: number | null;
  temperatureC: number | null;
  observedAt: string | null;
};

async function fetchOpenWeather(lat: number, lng: number): Promise<WeatherPart> {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) throw new Error("OPENWEATHER_API_KEY is not set");

  const url =
    "https://api.openweathermap.org/data/2.5/weather" +
    `?lat=${lat}&lon=${lng}&units=metric&appid=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(8000),
  });
  // never include the URL in errors: it contains the API key
  if (!res.ok) throw new Error(`OpenWeather returned HTTP ${res.status}`);

  const json = (await res.json()) as {
    dt?: number;
    main?: { temp?: number };
    wind?: { speed?: number; deg?: number };
  };

  return {
    windSpeedMs: json.wind?.speed ?? null,
    windDirDeg: json.wind?.deg ?? null,
    temperatureC: json.main?.temp ?? null,
    observedAt: json.dt ? new Date(json.dt * 1000).toISOString() : null,
  };
}

type TidePart = { tideHeightM: number | null; tidePhase: TidePhase | null };

async function fetchTide(lat: number, lng: number, nowMs: number): Promise<TidePart> {
  const url =
    "https://marine-api.open-meteo.com/v1/marine" +
    `?latitude=${lat}&longitude=${lng}` +
    "&hourly=sea_level_height_msl&cell_selection=sea" +
    "&past_hours=2&forecast_hours=3&timeformat=unixtime&timezone=GMT";

  const res = await fetch(url, {
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Open-Meteo returned HTTP ${res.status}`);

  const json = (await res.json()) as {
    hourly?: { time?: number[]; sea_level_height_msl?: (number | null)[] };
  };
  const times = json.hourly?.time ?? [];
  const heights = json.hourly?.sea_level_height_msl ?? [];

  // index of the last hourly sample at or before "now"
  let idx = -1;
  for (let i = 0; i < times.length; i++) {
    if (times[i] * 1000 <= nowMs) idx = i;
  }
  const h0 = idx >= 0 ? heights[idx] : null;
  if (idx < 0 || h0 == null) return { tideHeightM: null, tidePhase: null };

  const h1 = heights[idx + 1] ?? null;
  const prev = heights[idx - 1] ?? null;

  // linear interpolation to the current minute
  let height = h0;
  if (h1 != null) {
    const frac = Math.min(1, Math.max(0, (nowMs - times[idx] * 1000) / 3_600_000));
    height = h0 + (h1 - h0) * frac;
  }

  let phase: TidePhase | null = null;
  if (prev != null && h1 != null) {
    const before = h0 - prev;
    const after = h1 - h0;
    if (before < 0 && after > 0) phase = "low";
    else if (before > 0 && after < 0) phase = "high";
    else phase = after > 0 ? "rising" : "falling";
  } else if (h1 != null) {
    phase = h1 > h0 ? "rising" : "falling";
  }

  return { tideHeightM: Math.round(height * 100) / 100, tidePhase: phase };
}

export async function getConditions(lat: number, lng: number): Promise<Conditions> {
  const now = Date.now();
  const warnings: string[] = [];

  const [weather, tide] = await Promise.allSettled([
    fetchOpenWeather(lat, lng),
    fetchTide(lat, lng, now),
  ]);

  const w: WeatherPart =
    weather.status === "fulfilled"
      ? weather.value
      : { windSpeedMs: null, windDirDeg: null, temperatureC: null, observedAt: null };
  if (weather.status === "rejected") {
    warnings.push(`Weather unavailable: ${(weather.reason as Error).message}`);
  }

  const t: TidePart =
    tide.status === "fulfilled" ? tide.value : { tideHeightM: null, tidePhase: null };
  if (tide.status === "rejected") {
    warnings.push(`Tide data unavailable: ${(tide.reason as Error).message}`);
  } else if (t.tideHeightM === null) {
    warnings.push("No tide data for this location.");
  }

  return {
    observedAt: w.observedAt ?? new Date(now).toISOString(),
    windSpeedMs: w.windSpeedMs,
    windDirDeg: w.windDirDeg,
    temperatureC: w.temperatureC,
    tideHeightM: t.tideHeightM,
    tidePhase: t.tidePhase,
    warnings,
  };
}
