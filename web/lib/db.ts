import postgres from "postgres";
import type { Candidate } from "./guess";

// One pooled client per server instance. Works with local Postgres and Neon (pooled URL).
const globalForSql = globalThis as unknown as { sql?: postgres.Sql };

export const sql =
  globalForSql.sql ??
  postgres(process.env.DATABASE_URL!, { max: 5, idle_timeout: 20, prepare: false });

if (process.env.NODE_ENV !== "production") globalForSql.sql = sql;

export type Baby = {
  id: string;
  name: string;
  birth_date: string;
  sex: "girl" | "boy" | "unspecified";
  units: "lb" | "kg";
  share_token: string;
  device_token: string;
};

export type Entry = {
  id: string;
  grams: number;
  measured_at: Date;
  source: "manual" | "device";
  note: string | null;
  bridge_id: string | null;
};

export type Bridge = {
  id: string;
  fw_version: string | null;
  last_seen_at: Date | null;
  last_grams: number | null;
};

const BABY_COLS = sql`id, name, to_char(birth_date, 'YYYY-MM-DD') as birth_date, sex, units, share_token, device_token`;

export async function getBaby(id: string): Promise<Baby | undefined> {
  const [row] = await sql<Baby[]>`select ${BABY_COLS} from babies where id = ${id}`;
  return row;
}

export async function getBabyByShareToken(token: string): Promise<Baby | undefined> {
  const [row] = await sql<Baby[]>`select ${BABY_COLS} from babies where share_token = ${token}`;
  return row;
}

export async function getBabyByDeviceToken(token: string): Promise<Baby | undefined> {
  const [row] = await sql<Baby[]>`select ${BABY_COLS} from babies where device_token = ${token}`;
  return row;
}

export async function listEntries(babyId: string): Promise<Entry[]> {
  return sql<Entry[]>`
    select id::text, grams, measured_at, source, note, bridge_id
    from entries where baby_id = ${babyId} and status = 'saved' order by measured_at desc`;
}

export type Pending = {
  id: string; baby_id: string | null; baby_name: string | null; grams: number; measured_at: Date; bridge_id: string | null;
};

// Unsaved scale readings older than 7 days move to the archive whenever the inbox is read.
async function archiveStale() {
  await sql`update entries set status = 'archived' where status = 'pending' and measured_at < now() - interval '7 days'`;
}

// Readings this person can see: from bridges they claimed, or already on one of their babies.
const VISIBLE = (userId: string) => sql`(
  e.bridge_id in (select bridge_id from bridge_users where user_id = ${userId})
  or e.baby_id in (select baby_id from baby_members where user_id = ${userId}))`;

export async function listInbox(userId: string): Promise<Pending[]> {
  await archiveStale();
  return sql<Pending[]>`
    select e.id::text, e.baby_id, b.name as baby_name, e.grams, e.measured_at, e.bridge_id
    from entries e left join babies b on b.id = e.baby_id
    where e.status = 'pending' and ${VISIBLE(userId)} order by e.measured_at desc`;
}

export async function listArchivedForUser(userId: string): Promise<Pending[]> {
  return sql<Pending[]>`
    select e.id::text, e.baby_id, b.name as baby_name, e.grams, e.measured_at, e.bridge_id
    from entries e left join babies b on b.id = e.baby_id
    where e.status = 'archived' and ${VISIBLE(userId)} order by e.measured_at desc limit 30`;
}

export async function canSeeEntry(userId: string, entryId: string): Promise<boolean> {
  const [row] = await sql`select 1 from entries e where e.id = ${entryId} and ${VISIBLE(userId)}`;
  return !!row;
}

// The user's babies and pets with their latest saved weight: who a reading might belong to.
export async function listCandidates(userId: string): Promise<Candidate[]> {
  return sql<Candidate[]>`
    select b.id, b.name, b.sex, to_char(b.birth_date, 'YYYY-MM-DD') as birth_date, l.grams as last_grams, l.measured_at as last_at
    from baby_members m join babies b on b.id = m.baby_id
    left join lateral (
      select grams, measured_at from entries e where e.baby_id = b.id and e.status = 'saved'
      order by measured_at desc limit 1) l on true
    where m.user_id = ${userId} order by b.created_at`;
}

export async function listMyBridges(userId: string): Promise<Bridge[]> {
  return sql<Bridge[]>`
    select b.id, b.fw_version, b.last_seen_at, b.last_grams
    from bridges b join bridge_users u on u.bridge_id = b.id where u.user_id = ${userId} order by u.created_at`;
}

// Bridges heard from in the last 15 minutes that this person hasn't claimed.
export async function listMyBabies(userId: string): Promise<{ id: string; name: string; role: string; last_grams: number | null; units: "lb" | "kg" }[]> {
  return sql`
    select b.id, b.name, m.role, b.units,
      (select grams from entries e where e.baby_id = b.id and e.status = 'saved' order by measured_at desc limit 1) as last_grams
    from baby_members m join babies b on b.id = m.baby_id
    where m.user_id = ${userId} order by b.created_at`;
}

export async function listMembers(babyId: string): Promise<{ user_id: string; email: string; role: string }[]> {
  return sql`
    select m.user_id, u.email, m.role from baby_members m join users u on u.id = m.user_id
    where m.baby_id = ${babyId} order by m.created_at`;
}
