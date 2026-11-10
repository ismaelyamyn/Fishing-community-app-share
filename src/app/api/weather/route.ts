import { NextResponse } from "next/server";
import { getConditions, roundCoord } from "@/lib/weather";
import { inMaldivesBounds } from "@/lib/maldives";

// GET /api/weather?lat=3.94&lng=73.49  ->  current wind, temperature and tide
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  const lat = latRaw === null ? NaN : Number(latRaw);
  const lng = lngRaw === null ? NaN : Number(lngRaw);

  // Only the Maldives: stops this route being used as a free proxy for the whole world
  if (!inMaldivesBounds(lng, lat)) {
    return NextResponse.json(
      { error: "lat and lng are required and must be inside the Maldives." },
      { status: 400 }
    );
  }

  const conditions = await getConditions(roundCoord(lat), roundCoord(lng));

  return NextResponse.json(conditions, {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300" },
  });
}
