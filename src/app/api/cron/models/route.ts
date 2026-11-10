import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cronAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runModels } from "@/lib/ai/pipeline";

export const maxDuration = 60;

// Recomputes community scores, retrains the conditions model and refreshes spot
// analytics. Call it with:  Authorization: Bearer <CRON_SECRET>
// (see deploy/pgcron-models.sql for the hourly Supabase schedule)
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runModels(createAdminClient());
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
