import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export default async function Header() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  let isAdmin = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, role")
      .eq("id", user.id)
      .maybeSingle();
    displayName = profile?.display_name ?? user.email ?? "Account";
    isAdmin = profile?.role === "admin";
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 bg-ocean-900 px-6 py-3 text-white">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-lg font-semibold">
          Fishing Community
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="underline-offset-2 hover:underline">
            Map
          </Link>
          <Link href="/spots" className="underline-offset-2 hover:underline">
            Spots
          </Link>
          {user && (
            <Link href="/recommend" className="underline-offset-2 hover:underline">
              Recommend
            </Link>
          )}
          {user && (
            <Link href="/trips" className="underline-offset-2 hover:underline">
              My trips
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin" className="underline-offset-2 hover:underline">
              Admin
            </Link>
          )}
          {user && (
            <Link href="/spots/new" className="underline-offset-2 hover:underline">
              Add spot
            </Link>
          )}
        </nav>
      </div>

      <nav className="flex items-center gap-4 text-sm">
        {user ? (
          <>
            <Link href="/account" className="underline-offset-2 hover:underline">
              {displayName}
              {isAdmin && (
                <span className="ml-2 rounded bg-white/20 px-2 py-0.5 text-xs">Admin</span>
              )}
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded border border-white/40 px-3 py-1 hover:bg-white/10"
              >
                Log out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login" className="underline-offset-2 hover:underline">
              Log in
            </Link>
            <Link href="/signup" className="rounded bg-white px-3 py-1 font-medium text-ocean-900">
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
