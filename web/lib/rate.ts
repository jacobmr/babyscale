import { sql } from "@/lib/db";

// Records one event under key and returns true, unless key already has max events in the
// last windowMinutes (then records nothing and returns false). Windows are at most a day.
export async function allow(key: string, max: number, windowMinutes: number): Promise<boolean> {
  if (Math.random() < 0.02) await sql`delete from rate_events where at < now() - interval '2 days'`;
  // The lock makes parallel requests for one key take turns, so a burst can't all pass the count.
  const rows = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${key}))`;
    return tx`
      insert into rate_events (key)
      select ${key} where (
        select count(*) from rate_events where key = ${key} and at > now() - make_interval(mins => ${windowMinutes})
      ) < ${max}
      returning 1`;
  });
  return rows.length > 0;
}

// Vercel puts the client's address first in x-forwarded-for.
export const clientIp = (h: Headers) => h.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
