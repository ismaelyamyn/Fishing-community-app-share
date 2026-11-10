import type { SupabaseClient } from "@supabase/supabase-js";
import type { Island, Species } from "@/lib/types";

// Islands and species for dropdowns and checkboxes
export async function getReferenceData(supabase: SupabaseClient) {
  const [{ data: islands }, { data: species }] = await Promise.all([
    supabase.from("islands").select("id, name").order("name"),
    supabase.from("species").select("id, name_en").order("name_en"),
  ]);
  return {
    islands: (islands ?? []) as Island[],
    species: (species ?? []) as Species[],
  };
}
