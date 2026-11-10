"use client";

import { useEffect, useState } from "react";

type Conditions = {
  observedAt: string;
  windSpeedMs: number | null;
  windDirDeg: number | null;
  temperatureC: number | null;
  tideHeightM: number | null;
  tidePhase: "low" | "rising" | "high" | "falling" | null;
  warnings: string[];
};

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

function compass(deg: number): string {
  return COMPASS[Math.round(deg / 22.5) % 16];
}

export default function ConditionsCard({ lat, lng }: { lat: number; lng: number }) {
  const [data, setData] = useState<Conditions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    fetch(`/api/weather?lat=${lat}&lng=${lng}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Conditions are unavailable right now.");
        return (await res.json()) as Conditions;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  const knots = (ms: number) => (ms * 1.943844).toFixed(0);

  return (
    <section className="rounded border border-ocean-500/30 bg-white p-4">
      <h2 className="mb-3 text-lg font-semibold">Conditions now</h2>

      {!data && !error && <p className="text-sm">Loading conditions…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {data && (
        <>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-ocean-700">Wind</dt>
              <dd className="font-medium">
                {data.windSpeedMs === null
                  ? "n/a"
                  : `${data.windSpeedMs.toFixed(1)} m/s (${knots(data.windSpeedMs)} kn)`}
              </dd>
            </div>
            <div>
              <dt className="text-ocean-700">Wind from</dt>
              <dd className="font-medium">
                {data.windDirDeg === null
                  ? "n/a"
                  : `${compass(data.windDirDeg)} (${Math.round(data.windDirDeg)}°)`}
              </dd>
            </div>
            <div>
              <dt className="text-ocean-700">Air temperature</dt>
              <dd className="font-medium">
                {data.temperatureC === null ? "n/a" : `${data.temperatureC.toFixed(1)} °C`}
              </dd>
            </div>
            <div>
              <dt className="text-ocean-700">Tide</dt>
              <dd className="font-medium capitalize">
                {data.tidePhase === null || data.tideHeightM === null
                  ? "n/a"
                  : `${data.tidePhase}, ${data.tideHeightM > 0 ? "+" : ""}${data.tideHeightM.toFixed(2)} m`}
              </dd>
            </div>
          </dl>

          {data.warnings.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-xs text-amber-800">
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-xs text-ocean-700">
            Updated {new Date(data.observedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.
            Weather by OpenWeather; sea level by Open-Meteo (modelled, about 8 km resolution, height
            relative to mean sea level). Indicative only: not for navigation or safety decisions.
          </p>
        </>
      )}
    </section>
  );
}
