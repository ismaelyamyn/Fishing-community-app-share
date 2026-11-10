"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { createClient } from "@/lib/supabase/client";
import { MALDIVES_BOUNDS, MALDIVES_CENTER } from "@/lib/maldives";
import { spotPriorityFrom } from "@/lib/mapPriority";

type IslandRow = {
  id: number;
  name: string;
  atoll: string | null;
  lng: number;
  lat: number;
};

type SpotPoint = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  avg_rating: number;
  community_score?: number | null;
  review_count: number;
};

// A round orange marker drawn once and registered with the map as an icon.
// Icons (unlike plain circles) take part in Mapbox's collision detection.
function createDotImage(color: string): ImageData | null {
  const size = 36; // drawn at 2x, shown at 18 px
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalSpots, setTotalSpots] = useState(0);
  const [visibleSpots, setVisibleSpots] = useState<number | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!token || !containerRef.current) return;

    let cancelled = false;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: MALDIVES_CENTER,
      zoom: 6,
      minZoom: 5,
      maxBounds: MALDIVES_BOUNDS,
      renderWorldCopies: false,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("error", (e) => setError(e.error?.message ?? "Unknown map error"));

    map.on("load", async () => {
      map.resize();

      // Guests can read both views (row-level security allows it)
      const supabase = createClient();
      const [islandsRes, spotsRes] = await Promise.all([
        supabase.from("islands_map").select("id, name, atoll, lng, lat"),
        supabase
          .from("spots_public")
          .select("id, name, lng, lat, avg_rating, review_count, community_score")
          .eq("status", "active"),
      ]);

      if (cancelled) return;

      if (islandsRes.error) setError(`Could not load islands: ${islandsRes.error.message}`);
      if (spotsRes.error) setError(`Could not load spots: ${spotsRes.error.message}`);

      // ---- islands (blue dots with names) ----
      const islands = (islandsRes.data ?? []) as IslandRow[];
      map.addSource("islands", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: islands.map((r) => ({
            type: "Feature" as const,
            properties: { id: r.id, name: r.name, atoll: r.atoll },
            geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
          })),
        },
      });
      map.addLayer({
        id: "islands-circle",
        type: "circle",
        source: "islands",
        paint: {
          "circle-radius": 7,
          "circle-color": "#0e8aa8",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "islands-label",
        type: "symbol",
        source: "islands",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#073b4c",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      // ---- fishing spots (orange, best rated win when markers would overlap) ----
      const spots = (spotsRes.data ?? []) as SpotPoint[];
      setTotalSpots(spots.length);

      map.addSource("spots", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: spots.map((s) => ({
            type: "Feature" as const,
            properties: {
              id: s.id,
              name: s.name,
              rating: Number(s.avg_rating),
              reviews: s.review_count,
              priority: spotPriorityFrom(s.community_score, Number(s.avg_rating), s.review_count),
            },
            geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
          })),
        },
      });

      const dot = createDotImage("#e76f51");
      if (!dot) {
        setError("Could not draw spot markers in this browser.");
      } else {
        if (!map.hasImage("spot-dot")) map.addImage("spot-dot", dot, { pixelRatio: 2 });

        map.addLayer({
          id: "spots-symbol",
          type: "symbol",
          source: "spots",
          layout: {
            "icon-image": "spot-dot",
            // Hide markers that would overlap another one. Mapbox keeps the one with
            // the LOWEST sort key, so the best-rated spot gets the negative-largest key.
            "icon-allow-overlap": false,
            "icon-ignore-placement": false,
            "icon-padding": 8,
            "symbol-sort-key": ["*", -1, ["get", "priority"]],
            // names appear when there is room; the marker shows either way
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-offset": [0, 1.1],
            "text-anchor": "top",
            "text-optional": true,
          },
          paint: {
            "text-color": "#7a2e1b",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.5,
          },
        });

        // how many of the spots fit on screen right now
        const updateVisible = () => {
          if (cancelled || !map.getLayer("spots-symbol")) return;
          const ids = new Set<string>();
          for (const f of map.queryRenderedFeatures({ layers: ["spots-symbol"] })) {
            ids.add(String(f.properties?.id));
          }
          setVisibleSpots(ids.size);
        };
        map.on("idle", updateVisible);
      }

      // ---- interactions ----
      map.on("click", "islands-circle", (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        const name = String(feature.properties?.name ?? "");
        const atoll = feature.properties?.atoll as string | null | undefined;

        // setText (not setHTML) so database text can never inject markup
        new mapboxgl.Popup({ offset: 12 })
          .setLngLat([lng, lat])
          .setText(atoll ? `${name} (${atoll} Atoll)` : name)
          .addTo(map);
      });

      map.on("click", "spots-symbol", (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        const id = String(feature.properties?.id ?? "");
        const name = String(feature.properties?.name ?? "");
        const reviews = Number(feature.properties?.reviews ?? 0);
        const rating = Number(feature.properties?.rating ?? 0);

        // Built with DOM nodes and textContent so database text cannot inject markup
        const box = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = name;
        const info = document.createElement("div");
        info.textContent =
          reviews > 0 ? `★ ${rating.toFixed(1)} (${reviews} reviews)` : "No reviews yet";
        const link = document.createElement("a");
        link.href = `/spots/${encodeURIComponent(id)}`;
        link.textContent = "View details";
        link.style.color = "#0b5f78";
        link.style.textDecoration = "underline";
        box.append(title, info, link);

        new mapboxgl.Popup({ offset: 12 }).setLngLat([lng, lat]).setDOMContent(box).addTo(map);
      });

      for (const layer of ["islands-circle", "spots-symbol"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }
    });

    return () => {
      cancelled = true;
      map.remove();
    };
  }, [token]);

  if (!token) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
        Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local and restart the dev server.
      </div>
    );
  }

  return (
    <>
      {/* Inline styles on purpose: Mapbox's CSS would otherwise override Tailwind's layered classes */}
      <div
        ref={containerRef}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      />

      {totalSpots > 0 && visibleSpots !== null && visibleSpots < totalSpots && (
        <div className="pointer-events-none absolute bottom-6 left-4 z-10 max-w-xs rounded bg-white/90 px-3 py-2 text-xs text-ocean-900 shadow">
          {visibleSpots === 0
            ? `No spots in this view (${totalSpots} in total). Move or zoom out.`
            : `Showing ${visibleSpots} of ${totalSpots} spots, best rated first. Zoom in to see more.`}
        </div>
      )}

      {error && (
        <div className="absolute left-4 top-4 z-10 max-w-md rounded bg-red-600 p-3 text-sm text-white">
          Map error: {error}
        </div>
      )}
    </>
  );
}
