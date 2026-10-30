import { NextResponse, type NextRequest } from "next/server";

const MAX_AGE = 400 * 24 * 60 * 60;

// Sliding expiry: every visit pushes the session cookie out another 400 days.
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const session = req.cookies.get("bs_session");
  if (session) {
    res.cookies.set(session.name, session.value, {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
    });
  }
  return res;
}

export const config = { matcher: ["/((?!api|_next|favicon).*)"] };
