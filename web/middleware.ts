import { NextResponse, type NextRequest } from "next/server";

const MAX_AGE = 400 * 24 * 60 * 60;

// Sliding expiry: every visit pushes each editor cookie out another 400 days.
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  for (const c of req.cookies.getAll()) {
    if (!c.name.startsWith("bs_")) continue;
    res.cookies.set(c.name, c.value, {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
    });
  }
  return res;
}

export const config = { matcher: ["/b/:path*"] };
