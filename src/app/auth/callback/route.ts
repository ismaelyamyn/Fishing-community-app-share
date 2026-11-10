import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase sends people here after they click the link in the confirmation email
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  return NextResponse.redirect(`${origin}/login?error=confirm`);
}
