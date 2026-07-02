import { NextRequest, NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Auth for the whole dashboard, in order of preference:
 *  1. Clerk — active when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY are set.
 *     Unauthenticated visitors are redirected to the Clerk hosted sign-in.
 *  2. HTTP Basic Auth — fallback when only DASH_USER + DASH_PASS are set.
 *  3. Open — when neither is configured (local dev).
 */

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

function basicAuth(req: NextRequest) {
  const user = process.env.DASH_USER;
  const pass = process.env.DASH_PASS;
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const [u, ...rest] = atob(header.slice(6)).split(":");
      if (u === user && rest.join(":") === pass) return NextResponse.next();
    } catch {
      // fall through to 401
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Barsy Analytics"' },
  });
}

export default hasClerk
  ? clerkMiddleware(async (auth) => {
      await auth.protect();
    })
  : basicAuth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
