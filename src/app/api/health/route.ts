import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// GET /api/health : a safe checkup after deployment. It says whether each setting is
// present (yes/no only, never the value) and whether the database answers.
export async function GET() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    NEXT_PUBLIC_MAPBOX_TOKEN: Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN),
    OPENWEATHER_API_KEY: Boolean(process.env.OPENWEATHER_API_KEY),
    SUPABASE_SECRET_KEY: Boolean(process.env.SUPABASE_SECRET_KEY),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    NEXT_PUBLIC_SITE_URL: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
  };

  let database: "ok" | "failed" | "not configured" = "not configured";
  let phase4Ready = false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      const { error } = await supabase.from("islands_map").select("id").limit(1);
      database = error ? "failed" : "ok";
      // this column only exists after phase4.sql has been run
      const p4 = await supabase.from("spots_public").select("community_score").limit(1);
      phase4Ready = !p4.error;
    } catch {
      database = "failed";
    }
  }

  const allSet = Object.entries(env).every(([k, v]) => v || k === "NEXT_PUBLIC_SITE_URL");
  const ok = allSet && database === "ok" && phase4Ready;
  return NextResponse.json({ ok, database, phase4Ready, env }, { status: ok ? 200 : 503 });
}
