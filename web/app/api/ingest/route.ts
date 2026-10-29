import { NextResponse } from "next/server";
import { sql, getBabyByDeviceToken } from "@/lib/db";

// A scale bridge posts each reading here:
//   POST /api/ingest   Authorization: Bearer <device token>
//   {"grams": 3160, "measured_at": 1793278648}   (unix seconds or ISO; optional, defaults to now)
// The scale sends a few readings while the load settles, so a device reading within
// MERGE_SECONDS of the previous device reading replaces it instead of adding a row.
const MERGE_SECONDS = 120;

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const baby = token ? await getBabyByDeviceToken(token) : undefined;
  if (!baby) return NextResponse.json({ error: "unknown device token" }, { status: 401 });

  let body: { grams?: unknown; measured_at?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const grams = Math.round(Number(body.grams));
  if (!Number.isFinite(grams) || grams <= 0 || grams >= 50000)
    return NextResponse.json({ error: "grams must be 1-49999" }, { status: 400 });

  let at = new Date();
  if (typeof body.measured_at === "number") at = new Date(body.measured_at * 1000);
  else if (typeof body.measured_at === "string") at = new Date(body.measured_at);
  // A clock that never synced (e.g. 1970) or a future time: use the server's time.
  if (Number.isNaN(at.getTime()) || at.getFullYear() < 2020 || at.getTime() > Date.now() + 5 * 60_000) at = new Date();

  const [merged] = await sql<{ id: string }[]>`
    update entries set grams = ${grams}, measured_at = ${at}
    where id = (
      select id from entries
      where baby_id = ${baby.id} and source = 'device'
        and measured_at between ${new Date(at.getTime() - MERGE_SECONDS * 1000)} and ${at}
      order by measured_at desc limit 1)
    returning id::text`;
  if (merged) return NextResponse.json({ id: merged.id, merged: true });

  const [row] = await sql<{ id: string }[]>`
    insert into entries (baby_id, grams, measured_at, source)
    values (${baby.id}, ${grams}, ${at}, 'device') returning id::text`;
  return NextResponse.json({ id: row.id, merged: false }, { status: 201 });
}
