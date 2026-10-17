import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured, supabaseEnv } from "./env";

export async function updateSession(request: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        Object.entries(headers).forEach(([header, value]) => supabaseResponse.headers.set(header, value));
      },
    },
  });

  // Refresh the session. Nothing else should run before getClaims().
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const path = request.nextUrl.pathname;

  if (signedIn && (path === "/login" || path === "/signup")) {
    return redirectWithSession(request, supabaseResponse, "/dashboard");
  }

  const needsAuth = path === "/dashboard" || path.startsWith("/dashboard/") || path === "/account" || path.startsWith("/account/");
  if (!signedIn && needsAuth) {
    const next = path.startsWith("/account") ? "/account" : "/dashboard";
    return redirectWithSession(request, supabaseResponse, "/login", next);
  }

  return supabaseResponse;
}

function redirectWithSession(request: NextRequest, supabaseResponse: NextResponse, pathname: string, next?: string) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = pathname;
  redirectUrl.search = next ? `?next=${encodeURIComponent(next)}` : "";
  const redirectResponse = NextResponse.redirect(redirectUrl);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = supabaseResponse.headers.get(header);
    if (value) redirectResponse.headers.set(header, value);
  }
  return redirectResponse;
}
