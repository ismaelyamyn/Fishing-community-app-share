import Link from "next/link";
import { Suspense } from "react";
import Header from "@/components/Header";
import LocateButton from "@/components/LocateButton";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReferenceData } from "@/lib/reference";
import { inMaldivesBounds } from "@/lib/maldives";
import { recommendForUser } from "@/lib/ai/recommendService";

type SearchParams = { species?: string; km?: string; lat?: string; lng?: string };

const selectClass =
  "rounded border border-ocean-500/40 bg-white px-3 py-2 text-sm text-ocean-900 outline-none focus:border-ocean-700";

export default async function RecommendPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { species } = await getReferenceData(supabase);

  const speciesId = Number(searchParams.species);
  const km = Number(searchParams.km);
  const maxDistanceKm = Number.isFinite(km) && km > 0 ? Math.min(km, 1000) : null;

  // location: the browser's position if shared, otherwise the fisher's home island
  let location: { lat: number; lon: number } | null = null;
  let locationNote = "No location: distance is not used.";
  const lat = Number(searchParams.lat);
  const lng = Number(searchParams.lng);
  if (searchParams.lat && searchParams.lng && inMaldivesBounds(lng, lat)) {
    location = { lat, lon: lng };
    locationNote = "Using your current location.";
  } else {
    const { data: profile } = await supabase.from("profiles").select("island_id").eq("id", user!.id).maybeSingle();
    if (profile?.island_id) {
      const { data: isl } = await supabase
        .from("islands_map")
        .select("name, lng, lat")
        .eq("id", profile.island_id)
        .maybeSingle();
      if (isl) {
        location = { lat: Number(isl.lat), lon: Number(isl.lng) };
        locationNote = `Using your home island, ${isl.name}.`;
      }
    }
  }

  let result: Awaited<ReturnType<typeof recommendForUser>> | null = null;
  let failure: string | null = null;
  try {
    result = await recommendForUser(createAdminClient(), {
      userId: user!.id,
      location,
      speciesId: Number.isInteger(speciesId) && speciesId > 0 ? speciesId : null,
      maxDistanceKm,
      limit: 10,
      persist: true,
    });
  } catch (e) {
    failure = (e as Error).message;
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
        <h1 className="text-2xl font-semibold">Where should I fish?</h1>
        <p className="text-sm text-ocean-700">
          Spots ranked by community reviews, the weather right now, what fishers with similar taste liked, and distance.
        </p>

        <form method="get" className="grid gap-3 rounded border border-ocean-500/30 bg-white p-4 sm:grid-cols-3">
          <select name="species" defaultValue={speciesId > 0 ? String(speciesId) : ""} className={selectClass}>
            <option value="">Any fish</option>
            {species.map((s) => (
              <option key={s.id} value={s.id}>
                Target: {s.name_en}
              </option>
            ))}
          </select>
          <select name="km" defaultValue={maxDistanceKm ? String(maxDistanceKm) : ""} className={selectClass}>
            <option value="">Any distance</option>
            <option value="10">Within 10 km</option>
            <option value="25">Within 25 km</option>
            <option value="50">Within 50 km</option>
            <option value="100">Within 100 km</option>
          </select>
          {searchParams.lat && <input type="hidden" name="lat" value={searchParams.lat} />}
          {searchParams.lng && <input type="hidden" name="lng" value={searchParams.lng} />}
          <button type="submit" className="rounded bg-ocean-900 px-3 py-2 text-sm font-medium text-white hover:bg-ocean-700">
            Recommend
          </button>
        </form>

        <div className="flex flex-col gap-1">
          <Suspense fallback={null}>
            <LocateButton />
          </Suspense>
          <p className="text-xs text-ocean-700">{locationNote}</p>
        </div>

        {failure && (
          <p role="alert" className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
            Could not build recommendations: {failure}
          </p>
        )}

        {result && (
          <>
            <p className="text-xs text-ocean-700">
              {result.modelNote} {result.conditionsAgeNote ?? ""}
            </p>
            {result.recommendations.length === 0 && (
              <p className="text-sm">No spots match. Try a wider distance or another species.</p>
            )}
            <ol className="flex flex-col gap-3">
              {result.recommendations.map((r, i) => (
                <li key={r.spotId} className="rounded border border-ocean-500/30 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/spots/${r.spotId}`} className="font-semibold text-ocean-900 underline-offset-2 hover:underline">
                      {i + 1}. {r.name}
                    </Link>
                    <span className="shrink-0 rounded-full bg-ocean-700 px-2 py-0.5 text-xs text-white">
                      Match {Math.round(r.score * 100)}%
                    </span>
                  </div>
                  {r.islandName && <p className="text-sm text-ocean-700">Near {r.islandName}</p>}
                  <ul className="mt-2 list-disc pl-5 text-sm">
                    {r.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <Link href={`/trips/new?spot=${r.spotId}`} className="mt-3 inline-block text-sm text-ocean-700 underline">
                    Log a trip here
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </main>
    </div>
  );
}
