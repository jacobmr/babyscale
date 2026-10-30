import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { notifyNewReading } from "@/lib/push";
import { sql, getBabyByDeviceToken } from "@/lib/db";

// A scale bridge posts each reading here, in one of two ways:
//   1. Bridge (current firmware): {"bridge_id": "D80BCB2B7D1D", "key": "<32 hex>", "grams": 3160,
//      "measured_at": 1793278648, "version": "2.0"}. The first post registers the bridge. Readings
//      wait as pending, with no baby, until someone who claimed the bridge assigns them.
//   2. Per-baby token (first firmware): Authorization: Bearer <device token>, {"grams", "measured_at"}.
// The scale sends a few readings while the load settles, so a device reading within
// MERGE_SECONDS of the previous one from the same source replaces it instead of adding a row.
// Device readings arrive as 'pending': they reach the chart only when someone saves them.
const MERGE_SECONDS = 120;

type Body = { grams?: unknown; measured_at?: unknown; bridge_id?: unknown; key?: unknown; version?: unknown };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function readingTime(body: Body): Date {
  let at = new Date();
  if (typeof body.measured_at === "number") at = new Date(body.measured_at * 1000);
  else if (typeof body.measured_at === "string") at = new Date(body.measured_at);
  // A clock that never synced (e.g. 1970) or a future time: use the server's time.
  if (Number.isNaN(at.getTime()) || at.getFullYear() < 2020 || at.getTime() > Date.now() + 5 * 60_000) at = new Date();
  return at;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const grams = Math.round(Number(body.grams));
  if (!Number.isFinite(grams) || grams <= 0 || grams >= 50000)
    return NextResponse.json({ error: "grams must be 1-49999" }, { status: 400 });
  const at = readingTime(body);
  const since = new Date(at.getTime() - MERGE_SECONDS * 1000);

  if (body.bridge_id !== undefined) return bridgeReading(body, grams, at, since);

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const baby = token ? await getBabyByDeviceToken(token) : undefined;
  if (!baby) return NextResponse.json({ error: "unknown device token" }, { status: 401 });

  const [merged] = await sql<{ id: string }[]>`
    update entries set grams = ${grams}, measured_at = ${at}
    where id = (
      select id from entries
      where baby_id = ${baby.id} and source = 'device' and status = 'pending' and bridge_id is null
        and measured_at between ${since} and ${at}
      order by measured_at desc limit 1)
    returning id::text`;
  if (merged) return NextResponse.json({ id: merged.id, merged: true });

  const [row] = await sql<{ id: string }[]>`
    insert into entries (baby_id, grams, measured_at, source, status)
    values (${baby.id}, ${grams}, ${at}, 'device', 'pending') returning id::text`;
  after(() => notifyNewReading(grams, at, { babyId: baby.id }));
  return NextResponse.json({ id: row.id, merged: false }, { status: 201 });
}

async function bridgeReading(body: Body, grams: number, at: Date, since: Date) {
  const id = String(body.bridge_id).toUpperCase().replace(/[^0-9A-F]/g, "");
  const key = String(body.key ?? "");
  if (id.length !== 12 || !/^[0-9a-f]{32}$/i.test(key))
    return NextResponse.json({ error: "bridge_id must be a MAC, key 32 hex digits" }, { status: 400 });
  const version = typeof body.version === "string" ? body.version.slice(0, 40) : null;

  // Trust on first use: the first key a bridge sends is its key from then on.
  const hash = sha256(key.toLowerCase());
  const [bridge] = await sql<{ key_hash: string }[]>`
    insert into bridges (id, key_hash) values (${id}, ${hash})
    on conflict (id) do update set id = excluded.id
    returning key_hash`;
  if (!timingSafeEqual(Buffer.from(bridge.key_hash), Buffer.from(hash)))
    return NextResponse.json({ error: "wrong key for this bridge" }, { status: 401 });
  await sql`
    update bridges set last_seen_at = now(), last_grams = ${grams}, fw_version = coalesce(${version}, fw_version)
    where id = ${id}`;

  // Stored without a baby: the inbox of whoever claimed this bridge assigns it (with a guess).
  const [merged] = await sql<{ id: string }[]>`
    update entries set grams = ${grams}, measured_at = ${at}
    where id = (
      select id from entries
      where bridge_id = ${id} and source = 'device' and status = 'pending' and measured_at between ${since} and ${at}
      order by measured_at desc limit 1)
    returning id::text`;
  if (merged) return NextResponse.json({ id: merged.id, merged: true });

  const [row] = await sql<{ id: string }[]>`
    insert into entries (grams, measured_at, source, bridge_id, status)
    values (${grams}, ${at}, 'device', ${id}, 'pending') returning id::text`;
  after(() => notifyNewReading(grams, at, { bridgeId: id }));
  return NextResponse.json({ id: row.id, merged: false }, { status: 201 });
}
