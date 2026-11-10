// Fills your Supabase project with DEMO data so Phase 4 has something to learn from.
//
//   npm run seed:demo     create demo fishers, spots, trips, reviews and flags
//   npm run seed:clean    remove everything the seeder created
//
// It writes to the database named in .env.local (uses SUPABASE_SECRET_KEY).
// All demo accounts use @fishing-demo.invalid emails, so cleanup is exact.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import {
  DEMO_EMAIL_SUFFIX, SPOT_TEMPLATES, commentFor, goodCatchProbability, localHour, maybeStartAtDawn, mulberry32, weatherAt,
} from "./lib/synthetic.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Run with: npm run seed:demo");
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error(`This writes demo data to ${new URL(url).host}. Use "npm run seed:demo" (it passes --yes).`);
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const must = (label, { error, data }) => {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};

async function listDemoUsers() {
  const found = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    found.push(...data.users.filter((u) => u.email?.endsWith(DEMO_EMAIL_SUFFIX)));
    if (data.users.length < 200) break;
  }
  return found;
}

async function clean() {
  const users = await listDemoUsers();
  const ids = users.map((u) => u.id);
  if (ids.length) {
    // spots go first: they may block deleting their creator
    must("delete spots", await admin.from("fishing_spots").delete().in("created_by", ids));
  }
  must("delete demo weather", await admin.from("weather_snapshots").delete().eq("source", "demo"));
  for (const u of users) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`deleteUser ${u.email}: ${error.message}`);
  }
  console.log(`Removed ${users.length} demo users and their spots, trips and reviews.`);
}

async function seed() {
  if ((await listDemoUsers()).length) {
    console.error("Demo data already exists. Run  npm run seed:clean  first.");
    process.exit(1);
  }
  const rand = mulberry32(20260101);
  const now = Date.now();

  // ---- fishers
  const N_USERS = 12;
  const users = [];
  for (let i = 0; i < N_USERS; i++) {
    const { data, error } = await admin.auth.admin.createUser({
      email: `demo${i + 1}${DEMO_EMAIL_SUFFIX}`,
      password: randomBytes(18).toString("base64url"),
      email_confirm: true,
      user_metadata: { display_name: `Demo Fisher ${i + 1}` },
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    users.push({ id: data.user.id, group: i % 2 });
  }
  console.log(`Created ${users.length} demo fishers.`);

  // ---- spots, placed near real islands
  const islands = must("islands", await admin.from("islands_map").select("id, lng, lat").limit(500));
  const species = must("species", await admin.from("species").select("id").limit(50));
  if (islands.length < 2 || species.length < 2) throw new Error("Run schema.sql first: no islands or species found.");
  const step = Math.max(1, Math.floor(islands.length / SPOT_TEMPLATES.length));

  const spots = [];
  for (let i = 0; i < SPOT_TEMPLATES.length; i++) {
    const isl = islands[(i * step) % islands.length];
    const lng = Number(isl.lng) + (rand() - 0.5) * 0.04;
    const lat = Number(isl.lat) + (rand() - 0.5) * 0.04;
    const picks = [species[i % species.length].id, species[(i + 3) % species.length].id];
    const id = must(
      "admin_create_spot",
      await admin.rpc("admin_create_spot", {
        p_created_by: users[i % users.length].id,
        p_island_id: isl.id,
        p_name: SPOT_TEMPLATES[i].name,
        p_description: "Demo spot created by the seeder. Safe to delete.",
        p_lng: lng,
        p_lat: lat,
        p_depth_m: 10 + Math.floor(rand() * 60),
        p_species_ids: picks,
      })
    );
    spots.push({ id, lng, lat, template: SPOT_TEMPLATES[i], creator: users[i % users.length].id });
  }
  console.log(`Created ${spots.length} demo spots.`);

  // ---- trips with generated weather
  const tripRows = [];
  for (const u of users) {
    for (let k = 0; k < 50; k++) {
      // fishers favour spots from their own taste group
      const pool = spots.filter((s) => (rand() < 0.75 ? s.template.group === u.group : true));
      const spot = pool[Math.floor(rand() * pool.length)];
      const startedAt = new Date(now - (2 + rand() * 118) * 86_400_000);
      startedAt.setUTCMinutes(Math.floor(rand() * 60), 0, 0);
      maybeStartAtDawn(startedAt, rand);
      const w = weatherAt(startedAt);
      const good = rand() < goodCatchProbability(spot.template, w, localHour(startedAt));
      tripRows.push({
        user_id: u.id,
        spot_id: spot.id,
        started_at: startedAt.toISOString(),
        ended_at: new Date(startedAt.getTime() + (2 + rand() * 4) * 3_600_000).toISOString(),
        good_catch: good,
        notes: null,
        _spot: spot,
        _weather: w,
      });
    }
  }

  const inserted = [];
  for (let i = 0; i < tripRows.length; i += 100) {
    const chunk = tripRows.slice(i, i + 100);
    const rows = must(
      "insert trips",
      await admin
        .from("trips")
        .insert(chunk.map(({ _spot, _weather, ...row }) => row))
        .select("id, user_id, spot_id")
    );
    rows.forEach((r, j) => inserted.push({ ...r, _src: chunk[j] }));
  }
  console.log(`Created ${inserted.length} demo trips. Attaching weather...`);

  // snapshot + link, a few at a time
  let linked = 0;
  for (let i = 0; i < inserted.length; i += 10) {
    await Promise.all(
      inserted.slice(i, i + 10).map(async (t) => {
        const { _spot: spot, _weather: w, started_at } = t._src;
        await admin.rpc("record_weather_snapshot", {
          p_lng: Math.round(spot.lng * 10) / 10,
          p_lat: Math.round(spot.lat * 10) / 10,
          p_observed_at: started_at,
          p_wind_speed_ms: w.windSpeed,
          p_wind_dir_deg: w.windDir,
          p_temperature_c: w.temperature,
          p_tide_height_m: w.tideHeight,
          p_tide_phase: w.tidePhase,
          p_source: "demo",
        });
        const { data } = await admin.rpc("attach_trip_weather", { p_trip_id: t.id });
        if (data) linked++;
      })
    );
  }
  console.log(`Linked weather to ${linked} of ${inserted.length} trips.`);

  // ---- reviews: taste groups like their own spots; some tied to a trip
  const reviewRows = [];
  const usedTrip = new Set();
  for (const u of users) {
    const chosen = [...spots].sort(() => rand() - 0.5).slice(0, 6);
    for (const s of chosen) {
      const liked = s.template.group === u.group;
      const rating = Math.max(1, Math.min(5, Math.round(2.4 + s.template.quality * 1.5 + (liked ? 1.0 : -0.8) + (rand() - 0.5))));
      const trip = inserted.find((t) => t.user_id === u.id && t.spot_id === s.id && !usedTrip.has(t.id));
      const verified = trip && rand() < 0.6;
      if (verified) usedTrip.add(trip.id);
      reviewRows.push({
        spot_id: s.id,
        user_id: u.id,
        trip_id: verified ? trip.id : null,
        rating,
        comment: commentFor(rating, rand),
        created_at: new Date(now - rand() * 110 * 86_400_000).toISOString(),
      });
    }
  }
  const reviews = must("insert reviews", await admin.from("reviews").insert(reviewRows).select("id, user_id, rating"));
  console.log(`Created ${reviews.length} demo reviews.`);

  // ---- a few reports so the admin queue has something in it
  const targets = reviews.filter((r) => r.rating <= 2).slice(0, 3);
  const flagRows = [];
  targets.forEach((r, i) => {
    const reporters = users.filter((u) => u.id !== r.user_id).slice(0, i === 0 ? 3 : 1);
    reporters.forEach((u) => flagRows.push({ review_id: r.id, flagged_by: u.id, reason: "Looks unfair or exaggerated (demo)." }));
  });
  if (flagRows.length) must("insert flags", await admin.from("review_flags").insert(flagRows));
  console.log(`Created ${flagRows.length} demo reports.`);

  console.log("\nDone. Now open /admin and press 'Run models now', then look at /recommend and a demo spot page.");
}

try {
  await (process.argv.includes("--clean") ? clean() : seed());
} catch (e) {
  console.error("\nFailed:", e.message);
  process.exit(1);
}
