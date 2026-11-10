import Link from "next/link";
import Header from "@/components/Header";
import { createClient } from "@/lib/supabase/server";
import { getReferenceData } from "@/lib/reference";
import { sanitizeSearch } from "@/lib/validation";
import type { SpotRow } from "@/lib/types";

type SearchParams = { q?: string; species?: string; island?: string; rating?: string; sort?: string };

type ListRow = Pick<
  SpotRow,
  "id" | "name" | "island_name" | "avg_rating" | "review_count" | "species_names" | "depth_m" | "created_by_name"
>;

const selectClass =
  "rounded border border-ocean-500/40 bg-white px-3 py-2 text-sm text-ocean-900 outline-none focus:border-ocean-700";

export default async function SpotsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient();
  const { islands, species } = await getReferenceData(supabase);

  const q = sanitizeSearch(searchParams.q ?? "");
  const speciesId = Number(searchParams.species);
  const islandId = Number(searchParams.island);
  const minRating = Number(searchParams.rating);

  let query = supabase
    .from("spots_public")
    .select("id, name, island_name, avg_rating, review_count, species_names, depth_m, created_by_name")
    .eq("status", "active")
    .limit(60);

  // "best" uses the weighted community score; unscored spots go last
  query =
    searchParams.sort === "best"
      ? query.order("community_score", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });

  if (q) query = query.or(`name.ilike.*${q}*,description.ilike.*${q}*`);
  if (Number.isInteger(speciesId) && speciesId > 0) query = query.contains("species_ids", [speciesId]);
  if (Number.isInteger(islandId) && islandId > 0) query = query.eq("island_id", islandId);
  if (Number.isFinite(minRating) && minRating > 0) query = query.gte("avg_rating", minRating);

  const { data, error } = await query;
  const spots = (data ?? []) as ListRow[];
  const filtered = Boolean(q || speciesId || islandId || minRating || searchParams.sort);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Fishing spots</h1>
          <Link
            href="/spots/new"
            className="rounded bg-ocean-700 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-900"
          >
            Add a spot
          </Link>
        </div>

        <form method="get" className="grid gap-3 rounded border border-ocean-500/30 bg-white p-4 sm:grid-cols-4">
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search name or notes"
            className={`${selectClass} sm:col-span-4`}
          />
          <select name="species" defaultValue={speciesId > 0 ? String(speciesId) : ""} className={selectClass}>
            <option value="">Any fish</option>
            {species.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_en}
              </option>
            ))}
          </select>
          <select name="island" defaultValue={islandId > 0 ? String(islandId) : ""} className={selectClass}>
            <option value="">Any island</option>
            {islands.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <select name="rating" defaultValue={minRating > 0 ? String(minRating) : ""} className={selectClass}>
            <option value="">Any rating</option>
            <option value="3">3 stars and up</option>
            <option value="4">4 stars and up</option>
          </select>
          <select name="sort" defaultValue={searchParams.sort === "best" ? "best" : ""} className={selectClass}>
            <option value="">Newest first</option>
            <option value="best">Best rated first</option>
          </select>
          <div className="flex gap-2 sm:col-span-4">
            <button
              type="submit"
              className="flex-1 rounded bg-ocean-900 px-3 py-2 text-sm font-medium text-white hover:bg-ocean-700"
            >
              Search
            </button>
            {filtered && (
              <Link href="/spots" className="rounded border border-ocean-700 px-3 py-2 text-sm text-ocean-700">
                Clear
              </Link>
            )}
          </div>
        </form>

        {error && (
          <p role="alert" className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
            Could not load spots: {error.message}
          </p>
        )}

        {!error && spots.length === 0 && (
          <p className="text-sm">
            {filtered ? "No spots match those filters." : "No spots yet. Be the first to add one."}
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {spots.map((s) => (
            <li key={s.id}>
              <Link
                href={`/spots/${s.id}`}
                className="block rounded border border-ocean-500/30 bg-white p-4 hover:border-ocean-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">{s.name}</h2>
                  <span className="shrink-0 text-sm">
                    {s.review_count > 0
                      ? `★ ${Number(s.avg_rating).toFixed(1)} (${s.review_count})`
                      : "No reviews"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ocean-700">
                  {[s.island_name ? `Near ${s.island_name}` : null, s.depth_m !== null ? `${s.depth_m} m deep` : null]
                    .filter(Boolean)
                    .join(" · ") || "Location on map"}
                </p>
                {s.species_names.length > 0 && (
                  <p className="mt-2 text-sm">{s.species_names.join(", ")}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
