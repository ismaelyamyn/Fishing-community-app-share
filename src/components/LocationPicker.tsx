"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MALDIVES_BOUNDS, MALDIVES_CENTER, inMaldivesBounds } from "@/lib/maldives";

export type Coords = { lng: number; lat: number };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export default function LocationPicker({
  initial,
  onChange,
}: {
  initial: Coords | null;
  onChange: (c: Coords) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const placeRef = useRef<((lng: number, lat: number) => void) | null>(null);
  const onChangeRef = useRef(onChange);
  const [geoError, setGeoError] = useState<string | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!token || !containerRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: initial ? [initial.lng, initial.lat] : MALDIVES_CENTER,
      zoom: initial ? 11 : 6,
      minZoom: 5,
      maxBounds: MALDIVES_BOUNDS,
      renderWorldCopies: false,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    let marker: mapboxgl.Marker | null = null;
    const place = (lng: number, lat: number) => {
      if (marker) marker.setLngLat([lng, lat]);
      else marker = new mapboxgl.Marker({ color: "#e76f51" }).setLngLat([lng, lat]).addTo(map);
      onChangeRef.current({ lng: round6(lng), lat: round6(lat) });
    };
    placeRef.current = place;

    if (initial) {
      marker = new mapboxgl.Marker({ color: "#e76f51" })
        .setLngLat([initial.lng, initial.lat])
        .addTo(map);
    }

    map.on("click", (e) => place(e.lngLat.lng, e.lngLat.lat));

    return () => {
      map.remove();
      mapRef.current = null;
      placeRef.current = null;
    };
    // the map is created once; "initial" only sets where it starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function useMyLocation() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Your browser cannot share its location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        if (!inMaldivesBounds(longitude, latitude)) {
          setGeoError("Your current location is outside the Maldives.");
          return;
        }
        placeRef.current?.(longitude, latitude);
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 12 });
      },
      () => setGeoError("Could not get your location. Click the map instead.")
    );
  }

  if (!token) {
    return (
      <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
        Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local to pick a location.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Inline styles on purpose: Mapbox's CSS overrides Tailwind's layered classes */}
      <div className="relative h-80 w-full overflow-hidden rounded border border-ocean-500/40">
        <div
          ref={containerRef}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={useMyLocation}
          className="rounded border border-ocean-700 px-3 py-1 text-ocean-700 hover:bg-ocean-50"
        >
          Use my current location
        </button>
        {geoError && <span className="text-red-700">{geoError}</span>}
      </div>
    </div>
  );
}
