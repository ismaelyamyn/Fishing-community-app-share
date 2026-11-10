import Link from "next/link";
import Header from "@/components/Header";
import { createClient } from "@/lib/supabase/server";
import { deleteTrip } from "./actions";

type TripRow = {
  id: string;
  started_at: string;
  good_catch: boolean | null;
  notes: string | null;
  spot_id: string;
  weather_snapshot_id: string | null;
  fishing_spots: { name: string } | null;
  trip_catches: { quantity: number | null; weight_kg: number | null; species: { name_en: string } | null }[];
};

const when = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Indian/Maldives",
});

export default async function TripsPage({ searchParams }: { searchParams: { logged?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, started_at, good_catch, notes, spot_id, weather_snapshot_id, fishing_spots(name), trip_catches(quantity, weight_kg, species(name_en))"
    )
    .eq("user_id", user!.id)
    .order("started_at", { ascending: false })
    .limit(100);
  const trips = (data ?? []) as unknown as TripRow[];
  const good = trips.filter((t) => t.good_catch).length;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">My trips</h1>
          <Link href="/trips/new" className="rounded bg-ocean-700 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-900">
            Log a trip
          </Link>
        </div>

        {searchParams.logged && (
          <p className="rounded bg-green-100 px-3 py-2 text-sm text-green-800">
            Trip logged. Thank you: it helps the predictions for everyone.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
            Could not load trips: {error.message}
          </p>
        )}

        <p className="text-sm text-ocean-700">
          Only you can see these trips. {trips.length > 0 && `${good} of your last ${trips.length} were good catches.`}
        </p>

        {!error && trips.length === 0 && <p className="text-sm">No trips yet. Log your first one.</p>}

        <ul className="flex flex-col gap-3">
          {trips.map((t) => (
            <li key={t.id} className="rounded border border-ocean-500/30 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/spots/${t.spot_id}`} className="font-semibold text-ocean-900 underline-offset-2 hover:underline">
                  {t.fishing_spots?.name ?? "Spot removed"}
                </Link>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    t.good_catch ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {t.good_catch ? "Good catch" : "Poor trip"}
                </span>
              </div>
              <p className="mt-1 text-sm text-ocean-700">
                {when.format(new Date(t.started_at))}
                {t.weather_snapshot_id ? " · weather recorded" : " · no weather matched"}
              </p>
              {t.trip_catches.length > 0 && (
                <p className="mt-2 text-sm">
                  {t.trip_catches
                    .map((c) =>
                      [c.species?.name_en, c.quantity !== null ? `×${c.quantity}` : null, c.weight_kg !== null ? `${c.weight_kg} kg` : null]
                        .filter(Boolean)
                        .join(" ")
                    )
                    .join(", ")}
                </p>
              )}
              {t.notes && <p className="mt-2 whitespace-pre-line text-sm">{t.notes}</p>}
              <form action={deleteTrip} className="mt-3">
                <input type="hidden" name="trip_id" value={t.id} />
                <button type="submit" className="text-xs text-red-700 underline">
                  Delete this trip
                </button>
              </form>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
