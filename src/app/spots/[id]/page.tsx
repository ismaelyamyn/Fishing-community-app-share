import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import ConditionsCard from "@/components/ConditionsCard";
import PhotoSection, { type PhotoItem } from "@/components/PhotoSection";
import DeleteSpotButton from "@/components/DeleteSpotButton";
import ReviewForm from "@/components/ReviewForm";
import { deleteReview, flagReview } from "./reviewActions";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import type { SpotRow } from "@/lib/types";

export default async function SpotPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; flag?: string };
}) {
  if (!isUuid(params.id)) notFound();

  const supabase = createClient();

  const { data } = await supabase
    .from("spots_public")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!data) notFound();
  const spot = data as SpotRow;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = profile?.role === "admin";
  }
  const canEdit = Boolean(user) && (user?.id === spot.created_by || isAdmin);

  const { data: photoRows } = await supabase
    .from("spot_photos")
    .select("id, storage_path, user_id")
    .eq("spot_id", spot.id)
    .order("created_at", { ascending: true });

  const photos: PhotoItem[] = (photoRows ?? []).map(
    (r: { id: string; storage_path: string; user_id: string }) => ({
      id: r.id,
      path: r.storage_path,
      userId: r.user_id,
      url: supabase.storage.from("spot-photos").getPublicUrl(r.storage_path).data.publicUrl,
    })
  );

  const { data: reviewData } = await supabase
    .from("reviews")
    .select("id, user_id, trip_id, rating, comment, created_at, profiles(display_name)")
    .eq("spot_id", spot.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const reviews = (reviewData ?? []) as unknown as {
    id: string;
    user_id: string;
    trip_id: string | null;
    rating: number;
    comment: string | null;
    created_at: string;
    profiles: { display_name: string } | null;
  }[];

  const { data: analyticsRow } = await supabase
    .from("spot_analytics")
    .select("sample_size, details")
    .eq("spot_id", spot.id)
    .maybeSingle();
  const analytics = analyticsRow as {
    sample_size: number;
    details: { enoughData: boolean; goodRate: number | null; findings: { sentence: string; dimension: string }[] };
  } | null;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <Link href="/spots" className="text-sm text-ocean-700 underline">
          ← All spots
        </Link>

        {searchParams.error === "delete" && (
          <p role="alert" className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
            You do not have permission to delete this spot.
          </p>
        )}
        {spot.status !== "active" && (
          <p className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-900">
            This spot is not public ({spot.status}). Only you and admins can see it.
          </p>
        )}

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{spot.name}</h1>
            <p className="mt-1 text-sm text-ocean-700">
              {[
                spot.island_name ? `Near ${spot.island_name}` : null,
                spot.depth_m !== null ? `${spot.depth_m} m deep` : null,
                spot.created_by_name ? `Added by ${spot.created_by_name}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <Link
                href={`/spots/${spot.id}/edit`}
                className="rounded border border-ocean-700 px-3 py-1 text-sm text-ocean-700 hover:bg-ocean-50"
              >
                Edit
              </Link>
              <DeleteSpotButton spotId={spot.id} />
            </div>
          )}
        </header>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <p>
            {spot.review_count > 0
              ? `Rating ★ ${Number(spot.avg_rating).toFixed(1)} from ${spot.review_count} review${spot.review_count === 1 ? "" : "s"}`
              : "No reviews yet."}
          </p>
          {spot.community_score !== null && (
            <p className="rounded-full bg-ocean-50 px-3 py-0.5 text-ocean-900" title="Reviews weighted by recency, trip verification and moderation">
              Community score {Number(spot.community_score).toFixed(1)} / 5
            </p>
          )}
          {user && (
            <Link href={`/trips/new?spot=${spot.id}`} className="text-ocean-700 underline">
              Log a trip here
            </Link>
          )}
        </div>

        {spot.description && <p className="whitespace-pre-line">{spot.description}</p>}

        {spot.species_names.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {spot.species_names.map((name) => (
              <li key={name} className="rounded-full bg-ocean-700 px-3 py-1 text-sm text-white">
                {name}
              </li>
            ))}
          </ul>
        )}

        <p className="text-sm text-ocean-700">
          Position: {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}
        </p>

        <ConditionsCard lat={spot.lat} lng={spot.lng} />

        <section className="rounded border border-ocean-500/30 bg-white p-4">
          <h2 className="font-semibold">When does this spot fish best?</h2>
          {analytics?.details?.enoughData ? (
            analytics.details.findings.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {analytics.details.findings.map((f) => (
                  <li key={f.dimension}>{f.sentence}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm">
                {analytics.sample_size} trips analysed, and no wind, time-of-day or seasonal pattern stands out
                clearly from chance.
              </p>
            )
          ) : (
            <p className="mt-2 text-sm">
              Not enough trips yet ({analytics?.sample_size ?? 0} of 20 needed). Log your trips here to reveal patterns.
            </p>
          )}
          <p className="mt-2 text-xs text-ocean-700">
            Patterns are shown only when they are statistically unlikely to be luck. Trips are anonymous here.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Reviews</h2>
          {searchParams.flag === "ok" && (
            <p className="rounded bg-green-100 px-3 py-2 text-sm text-green-800">Thanks, an admin will look at it.</p>
          )}
          {searchParams.flag === "failed" && (
            <p className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-900">
              Could not report that review (you may have reported it already).
            </p>
          )}
          {reviews.length === 0 && <p className="text-sm">No reviews yet.</p>}
          <ul className="flex flex-col gap-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded border border-ocean-500/30 bg-white p-4">
                <p className="text-sm">
                  <span className="font-semibold">{r.rating} ★</span> · {r.profiles?.display_name ?? "Fisher"} ·{" "}
                  {new Date(r.created_at).toLocaleDateString("en-GB", { timeZone: "Indian/Maldives" })}
                  {r.trip_id && (
                    <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Verified by trip</span>
                  )}
                </p>
                {r.comment && <p className="mt-2 whitespace-pre-line text-sm">{r.comment}</p>}
                <div className="mt-2 flex flex-wrap items-start gap-4 text-xs">
                  {user && (user.id === r.user_id || isAdmin) && (
                    <form action={deleteReview}>
                      <input type="hidden" name="review_id" value={r.id} />
                      <input type="hidden" name="spot_id" value={spot.id} />
                      <button type="submit" className="text-red-700 underline">
                        Delete
                      </button>
                    </form>
                  )}
                  {user && user.id !== r.user_id && (
                    <details>
                      <summary className="cursor-pointer text-ocean-700 underline">Report</summary>
                      <form action={flagReview} className="mt-2 flex flex-col gap-2">
                        <input type="hidden" name="review_id" value={r.id} />
                        <input type="hidden" name="spot_id" value={spot.id} />
                        <input
                          name="reason"
                          maxLength={500}
                          placeholder="Why? (spam, abuse, false…)"
                          className="rounded border border-ocean-500/40 px-2 py-1"
                        />
                        <button type="submit" className="self-start rounded border border-ocean-700 px-2 py-1 text-ocean-700">
                          Send report
                        </button>
                      </form>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {user ? (
            <ReviewForm spotId={spot.id} />
          ) : (
            <p className="text-sm">
              <Link href={`/login?next=/spots/${spot.id}`} className="underline">
                Log in
              </Link>{" "}
              to review this spot.
            </p>
          )}
        </section>

        <PhotoSection
          spotId={spot.id}
          photos={photos}
          userId={user?.id ?? null}
          isAdmin={isAdmin}
        />
      </main>
    </div>
  );
}
