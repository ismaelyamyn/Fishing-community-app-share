import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import SpotForm from "@/components/SpotForm";
import { createClient } from "@/lib/supabase/server";
import { getReferenceData } from "@/lib/reference";
import { isUuid } from "@/lib/validation";
import type { SpotRow } from "@/lib/types";

export default async function EditSpotPage({ params }: { params: { id: string } }) {
  if (!isUuid(params.id)) notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/spots/${params.id}/edit`);

  const { data } = await supabase
    .from("spots_public")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!data) notFound();
  const spot = data as SpotRow;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const canEdit = user.id === spot.created_by || profile?.role === "admin";

  const { islands, species } = await getReferenceData(supabase);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <Link href={`/spots/${spot.id}`} className="text-sm text-ocean-700 underline">
          ← Back to the spot
        </Link>
        <h1 className="text-2xl font-semibold">Edit spot</h1>

        {canEdit ? (
          <SpotForm
            initial={{
              id: spot.id,
              name: spot.name,
              description: spot.description ?? "",
              depthM: spot.depth_m,
              islandId: spot.island_id,
              speciesIds: spot.species_ids,
              coords: { lng: spot.lng, lat: spot.lat },
            }}
            islands={islands}
            species={species}
          />
        ) : (
          <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
            Only the person who added this spot, or an admin, can edit it.
          </p>
        )}
      </main>
    </div>
  );
}
