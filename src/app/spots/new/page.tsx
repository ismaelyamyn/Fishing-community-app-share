import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import SpotForm from "@/components/SpotForm";
import { createClient } from "@/lib/supabase/server";
import { getReferenceData } from "@/lib/reference";

export default async function NewSpotPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/spots/new");

  const { islands, species } = await getReferenceData(supabase);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <Link href="/spots" className="text-sm text-ocean-700 underline">
          ← All spots
        </Link>
        <h1 className="text-2xl font-semibold">Add a fishing spot</h1>
        <SpotForm
          initial={{
            name: "",
            description: "",
            depthM: null,
            islandId: null,
            speciesIds: [],
            coords: null,
          }}
          islands={islands}
          species={species}
        />
      </main>
    </div>
  );
}
