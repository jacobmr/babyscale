import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql, getBaby, type Baby } from "@/lib/db";

// Browsers cap cookie lifetime at 400 days; middleware.ts re-sets it on every visit,
// so someone who opens the site at least once a year never signs in again.
export const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
export const SESSION_COOKIE = "bs_session";

export type User = { id: string; email: string };

export function randomId(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Links in emails must point at a host we own: a forged Host header must not be able to
// send someone a sign-in link to another site.
const ALLOWED_HOSTS = (process.env.APP_HOSTS ?? "www.babyscale.org,babyscale.org,babyscale.vercel.app,localhost:3311").split(",");

export async function appOrigin(): Promise<string> {
  const host = (await headers()).get("host") ?? "";
  if (ALLOWED_HOSTS.includes(host)) return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  return `https://${ALLOWED_HOSTS[0]}`;
}

export async function getUser(): Promise<User | undefined> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return undefined;
  const [user] = await sql<User[]>`
    select u.id, u.email from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)}`;
  return user;
}

export async function requireUser(next?: string): Promise<User> {
  const user = await getUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export async function startSession(userId: string) {
  const token = randomId(32);
  await sql`insert into sessions (token_hash, user_id) values (${sha256(token)}, ${userId})`;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sql`delete from sessions where token_hash = ${sha256(token)}`;
  jar.delete(SESSION_COOKIE);
}

// Finds or creates the account for an email address.
export async function userForEmail(email: string): Promise<User> {
  const [user] = await sql<User[]>`
    insert into users (id, email) values (${randomId(12)}, ${email})
    on conflict (email) do update set email = excluded.email
    returning id, email`;
  return user;
}

export async function memberRole(babyId: string, userId: string): Promise<"owner" | "editor" | undefined> {
  const [row] = await sql<{ role: "owner" | "editor" }[]>`
    select role from baby_members where baby_id = ${babyId} and user_id = ${userId}`;
  return row?.role;
}

// For server actions: the signed-in user must be a member of this baby.
export async function requireMember(babyId: string): Promise<{ baby: Baby; user: User }> {
  const user = await getUser();
  const baby = await getBaby(babyId);
  if (!user || !baby || !(await memberRole(baby.id, user.id))) throw new Error("Not allowed");
  return { baby, user };
}
