import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/profile", "/courses", "/tracks", "/admin"];
const ADMIN_PREFIXES = ["/admin"];

function contentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const supabaseWs = `wss://${supabase.host}`;

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // React writes style="" attributes (progress bars etc.); nonces can't cover
    // those, so inline styles stay allowed. Scripts are the part that matters.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src 'self' ${supabase.origin} ${supabaseWs} https://api.pwnedpasswords.com`,
    "frame-src https://www.youtube-nocookie.com",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function withSecurityHeaders(response: NextResponse, csp: string, path: string) {
  response.headers.set("Content-Security-Policy", csp);
  // Signed-in pages carry personal data; keep them out of shared caches.
  if (PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  // Next.js reads the nonce from the request's CSP header and stamps it onto
  // its own scripts during render.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run other code between createServerClient and getUser().
  // A stray early return here can prevent the session cookie from refreshing.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  const isAdminRoute = ADMIN_PREFIXES.some((p) => path.startsWith(p));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("redirectTo", path);
    return withSecurityHeaders(NextResponse.redirect(url), csp, path);
  }

  if (isAdminRoute && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return withSecurityHeaders(NextResponse.redirect(url), csp, path);
    }
  }

  return withSecurityHeaders(supabaseResponse, csp, path);
}

// Prefetches stay in the matcher on purpose: the auth gate above must run for
// them too.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
