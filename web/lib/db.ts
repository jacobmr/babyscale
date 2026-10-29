import postgres from "postgres";

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
  password_hash: string;
  share_token: string;
  device_token: string;
};

export type Entry = {
  id: string;
  grams: number;
  measured_at: Date;
  source: "manual" | "device";
  note: string | null;
};

const BABY_COLS = sql`id, name, to_char(birth_date, 'YYYY-MM-DD') as birth_date, sex, units, password_hash, share_token, device_token`;

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
    select id::text, grams, measured_at, source, note
    from entries where baby_id = ${babyId} order by measured_at desc`;
}
