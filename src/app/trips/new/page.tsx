import Header from "@/components/Header";
import TripForm from "@/components/TripForm";
import { createClient } from "@/lib/supabase/server";
import { getReferenceData } from "@/lib/reference";
import { isUuid } from "@/lib/validation";

export default async function NewTripPage({ searchParams }: { searchParams: { spot?: string } }) {
  const supabase = createClient();
  const { species } = await getReferenceData(supabase);

  const { data } = await supabase
    .from("spots_public")
    .select("id, name, island_name")
    .eq("status", "active")
    .order("name", { ascending: true })
    .limit(1000);

  // current time in Maldives (UTC+5), formatted for a datetime-local box
  const nowLocal = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 16);
  const defaultSpot = searchParams.spot && isUuid(searchParams.spot) ? searchParams.spot : "";

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto flex max-w-xl flex-col gap-5 p-6">
        <h1 className="text-2xl font-semibold">Log a trip</h1>
        <TripForm
          spots={(data ?? []) as { id: string; name: string; island_name: string | null }[]}
          species={species}
          defaultSpotId={defaultSpot}
          nowLocal={nowLocal}
        />
      </main>
    </div>
  );
}
