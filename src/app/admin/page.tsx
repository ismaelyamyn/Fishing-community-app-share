import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveFlags, runModelsNow } from "./actions";

type FlagRow = {
  review_id: string;
  reason: string | null;
  created_at: string;
  reviews: {
    id: string;
    rating: number;
    comment: string | null;
    spot_id: string;
    hidden: boolean;
    fishing_spots: { name: string } | null;
    profiles: { display_name: string } | null;
  } | null;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { resolved?: string; ran?: string; scored?: string; findings?: string; secs?: string; err?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user!.id).maybeSingle();
  if (me?.role !== "admin") redirect("/");

  const admin = createAdminClient();
  const [{ data: flagData }, { data: model }, { count: tripCount }, { count: reviewCount }] = await Promise.all([
    admin
      .from("review_flags")
      .select(
        "review_id, reason, created_at, reviews(id, rating, comment, spot_id, hidden, fishing_spots(name), profiles(display_name))"
      )
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(200),
    admin.from("prediction_models").select("*").eq("name", "conditions").maybeSingle(),
    admin.from("trips").select("id", { count: "exact", head: true }),
    admin.from("reviews").select("id", { count: "exact", head: true }),
  ]);

  // group the open flags by review
  const grouped = new Map<string, { review: NonNullable<FlagRow["reviews"]>; reasons: string[] }>();
  for (const f of (flagData ?? []) as unknown as FlagRow[]) {
    if (!f.reviews) continue;
    const g = grouped.get(f.review_id) ?? { review: f.reviews, reasons: [] };
    if (f.reason) g.reasons.push(f.reason);
    grouped.set(f.review_id, { ...g, reasons: g.reasons });
  }
  const queue = [...grouped.entries()];

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-semibold">Admin</h1>

        {searchParams.resolved && (
          <p className="rounded bg-green-100 px-3 py-2 text-sm text-green-800">
            Review {searchParams.resolved === "uphold" ? "removed from public view" : "kept: flags dismissed"}.
          </p>
        )}
        {searchParams.ran === "1" && (
          <p className="rounded bg-green-100 px-3 py-2 text-sm text-green-800">
            Models ran: {searchParams.scored ?? "?"} spots scored, {searchParams.findings ?? "0"} with patterns, in{" "}
            {searchParams.secs ?? "?"} s.
          </p>
        )}
        {searchParams.ran === "0" && (
          <p role="alert" className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
            The model run failed: {searchParams.err}
          </p>
        )}

        <section className="rounded border border-ocean-500/30 bg-white p-4">
          <h2 className="font-semibold">Prediction models</h2>
          <p className="mt-1 text-sm">
            {tripCount ?? 0} trips and {reviewCount ?? 0} reviews in the database.
          </p>
          {model ? (
            <div className="mt-2 text-sm">
              <p>
                Weather model:{" "}
                <strong className={model.usable ? "text-green-800" : "text-amber-900"}>
                  {model.usable ? "in use" : "not in use yet"}
                </strong>
                . Trained {new Date(model.trained_at).toLocaleString("en-GB", { timeZone: "Indian/Maldives" })} on{" "}
                {model.n_samples} trips ({model.n_positive} good).
              </p>
              {model.metrics?.cvAuc !== undefined && (
                <p className="text-ocean-700">
                  Cross-validated AUC {Number(model.metrics.cvAuc).toFixed(2)} (0.5 is guessing, needs 0.60). Accuracy{" "}
                  {Math.round(Number(model.metrics.cvAccuracy) * 100)}% versus{" "}
                  {Math.round(Number(model.metrics.baselineAccuracy) * 100)}% for always guessing the commoner outcome.
                </p>
              )}
              {model.params?.reason && <p className="text-ocean-700">{model.params.reason}</p>}
            </div>
          ) : (
            <p className="mt-2 text-sm text-ocean-700">Not trained yet.</p>
          )}
          <form action={runModelsNow} className="mt-3">
            <button type="submit" className="rounded bg-ocean-700 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-900">
              Run models now
            </button>
          </form>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Flagged reviews ({queue.length})</h2>
          {queue.length === 0 && <p className="text-sm">Nothing to review.</p>}
          {queue.map(([reviewId, g]) => (
            <article key={reviewId} className="rounded border border-ocean-500/30 bg-white p-4">
              <p className="text-sm">
                <Link href={`/spots/${g.review.spot_id}`} className="font-semibold underline">
                  {g.review.fishing_spots?.name ?? "Spot"}
                </Link>{" "}
                · {g.review.rating} ★ · by {g.review.profiles?.display_name ?? "unknown"}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm">{g.review.comment || <em>No comment.</em>}</p>
              {g.reasons.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-ocean-700">
                  {g.reasons.map((r, i) => (
                    <li key={i}>Reported: {r}</li>
                  ))}
                </ul>
              )}
              <form action={resolveFlags} className="mt-3 flex gap-2">
                <input type="hidden" name="review_id" value={reviewId} />
                <button name="decision" value="uphold" className="rounded bg-red-700 px-3 py-1 text-sm text-white">
                  Remove review
                </button>
                <button name="decision" value="dismiss" className="rounded border border-ocean-700 px-3 py-1 text-sm text-ocean-700">
                  Keep review
                </button>
              </form>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
