import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Pages that need a logged-in user
const PROTECTED_PREFIXES = ["/account", "/spots/new", "/trips", "/recommend", "/admin"];
const PROTECTED_PATTERNS = [/^\/spots\/[^/]+\/edit$/];

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() asks Supabase to verify the session (more secure than getSession())
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  const redirectTo = (pathname: string, search?: Record<string, string>) => {
    const target = request.nextUrl.clone();
    target.pathname = pathname;
    target.search = "";
    Object.entries(search ?? {}).forEach(([k, v]) => target.searchParams.set(k, v));
    const redirect = NextResponse.redirect(target);
    // keep any refreshed session cookies
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  const isProtected =
    PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) ||
    PROTECTED_PATTERNS.some((re) => re.test(path));
  if (!user && isProtected) return redirectTo("/login", { next: path });
  if (user && (path === "/login" || path === "/signup")) return redirectTo("/");

  return response;
}
