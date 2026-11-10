import { createClient } from "@supabase/supabase-js";

// Full-access client that BYPASSES row-level security.
// Use only in server code (route handlers, server actions). Never import this
// from a "use client" file, and never put the key in a NEXT_PUBLIC_ variable.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SECRET_KEY (or the project URL) is not set.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
