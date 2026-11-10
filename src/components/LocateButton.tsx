"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Fills the lat/lng of the recommendation search from the phone or browser.
// The position is sent only as part of the page address; it is never stored.
export default function LocateButton() {
  const router = useRouter();
  const params = useSearchParams();
  const [msg, setMsg] = useState<string | null>(null);

  function locate() {
    if (!("geolocation" in navigator)) {
      setMsg("This browser cannot share your location. Your home island is used instead.");
      return;
    }
    setMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = new URLSearchParams(params.toString());
        next.set("lat", pos.coords.latitude.toFixed(4));
        next.set("lng", pos.coords.longitude.toFixed(4));
        router.push(`/recommend?${next.toString()}`);
        setMsg(null);
      },
      () => setMsg("Could not get your location. Your home island is used instead."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={locate}
        className="self-start rounded border border-ocean-700 px-3 py-2 text-sm text-ocean-700 hover:bg-ocean-50"
      >
        Use my current location
      </button>
      {msg && <p className="text-xs text-ocean-700">{msg}</p>}
    </div>
  );
}
