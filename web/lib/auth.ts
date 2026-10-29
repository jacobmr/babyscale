import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Browsers cap cookie lifetime at 400 days; middleware.ts re-sets it on every visit,
// so a parent who opens the page at least once a year never logs in again.
export const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export const cookieName = (babyId: string) => `bs_${babyId}`;

export function randomId(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), 32);
  return timingSafeEqual(expected, actual);
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return s;
}

// The cookie signs the baby id plus its password hash: changing the password logs everyone out.
export function sessionValue(babyId: string, passwordHash: string): string {
  return createHmac("sha256", secret()).update(`${babyId}\n${passwordHash}`).digest("base64url");
}

export async function isEditor(babyId: string, passwordHash: string): Promise<boolean> {
  const got = (await cookies()).get(cookieName(babyId))?.value;
  if (!got) return false;
  const want = sessionValue(babyId, passwordHash);
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function setEditorCookie(babyId: string, passwordHash: string) {
  (await cookies()).set(cookieName(babyId), sessionValue(babyId, passwordHash), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}
