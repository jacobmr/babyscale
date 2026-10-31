"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { sql, canSeeEntry } from "@/lib/db";
import { allow, clientIp } from "@/lib/rate";
import {
  appOrigin, endSession, memberRole, randomId, requireMember, requireUser, sha256, startSession, userForEmail,
} from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { GRAMS_PER_LB } from "@/lib/units";

export type FormState = { error?: string; ok?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK_MINUTES = 15;

// Only same-site paths after sign-in, never another origin.
const safeNext = (next: string) => (/^\/[A-Za-z0-9/_-]*$/.test(next) ? next : "/home");

export async function requestLink(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email").toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return { error: "Enter your email address." };
  if (!(await allow(`signin-email:${email}`, 3, 15))) return { error: "Too many links requested. Use the latest email, or try again in 15 minutes." };
  // Resend's free plan sends 100 a day: one address can't ask for links for everyone.
  if (!(await allow(`signin-ip:${clientIp(await headers())}`, 20, 60))) {
    return { error: "Too many sign-in links from here. Try again in an hour." };
  }

  const token = randomId(32);
  await sql`
    insert into login_tokens (token_hash, email, expires_at)
    values (${sha256(token)}, ${email}, now() + make_interval(mins => ${LINK_MINUTES}))`;
  const next = safeNext(str(f, "next"));
  const link = `${await appOrigin()}/auth?token=${token}${next !== "/home" ? `&next=${encodeURIComponent(next)}` : ""}`;
  const sent = await sendMail(
    email,
    "Your sign-in link",
    `Open this link to sign in to Baby weight:\n\n${link}\n\nIt works once and expires in ${LINK_MINUTES} minutes. ` +
      `If you didn't ask for it, ignore this email.`,
  );
  if (!sent) return { error: "Couldn't send the email. Try again in a minute." };
  return { ok: `Check ${email} for a sign-in link.` };
}

// The emailed link opens a page with a button that calls this. A plain GET doesn't sign in,
// so email scanners that prefetch links can't use up the token.
export async function signInWithLink(token: string, next: string) {
  const [row] = await sql<{ email: string }[]>`
    update login_tokens set used_at = now()
    where token_hash = ${sha256(token)} and used_at is null and expires_at > now()
    returning email`;
  if (!row) redirect("/login?expired=1");
  const user = await userForEmail(row.email);
  await startSession(user.id);
  redirect(safeNext(next));
}

export async function signOut() {
  await endSession();
  redirect("/");
}

export async function createBaby(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = str(f, "name");
  const birthDate = str(f, "birth_date");
  const sex = str(f, "sex");
  const units = str(f, "units") === "kg" ? "kg" : "lb";
  if (!name || name.length > 60) return { error: "Enter a name (up to 60 characters)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { error: "Enter the birth date." };
  if (!["girl", "boy", "unspecified"].includes(sex)) return { error: "Pick an option for the growth chart." };

  const id = randomId(8);
  await sql.begin(async (tx) => {
    await tx`
      insert into babies (id, name, birth_date, sex, units, share_token, device_token)
      values (${id}, ${name}, ${birthDate}, ${sex}, ${units}, ${randomId(16)}, ${randomId(24)})`;
    await tx`insert into baby_members (baby_id, user_id, role) values (${id}, ${user.id}, 'owner')`;
  });
  redirect(`/b/${id}`);
}

export async function addEntry(babyId: string, _: FormState, f: FormData): Promise<FormState> {
  const { baby } = await requireMember(babyId);
  let grams: number;
  if (baby.units === "kg") {
    grams = Math.round(Number(str(f, "kg")) * 1000);
  } else {
    grams = Math.round((Number(str(f, "lb") || 0) + Number(str(f, "oz") || 0) / 16) * GRAMS_PER_LB);
  }
  const measuredAt = new Date(str(f, "measured_at"));
  if (!Number.isFinite(grams) || grams <= 0 || grams >= 50000) return { error: "Enter a weight." };
  if (Number.isNaN(measuredAt.getTime())) return { error: "Enter the date and time." };
  const note = str(f, "note").slice(0, 200) || null;
  await sql`
    insert into entries (baby_id, grams, measured_at, source, note)
    values (${baby.id}, ${grams}, ${measuredAt}, 'manual', ${note})`;
  revalidatePath(`/b/${baby.id}`);
  return { ok: "Saved." };
}

export async function deleteEntry(babyId: string, entryId: string) {
  const { baby } = await requireMember(babyId);
  await sql`delete from entries where id = ${entryId} and baby_id = ${baby.id}`;
  revalidatePath(`/b/${baby.id}`);
}

export async function inviteMember(babyId: string, _: FormState, f: FormData): Promise<FormState> {
  const { baby, user } = await requireMember(babyId);
  const email = str(f, "email").toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return { error: "Enter an email address." };
  const invitee = await userForEmail(email);
  await sql`
    insert into baby_members (baby_id, user_id, role) values (${baby.id}, ${invitee.id}, 'editor')
    on conflict do nothing`;
  await sendMail(
    email,
    `${user.email} shared ${baby.name}'s weight with you`,
    `${user.email} added you to ${baby.name}'s weight chart. Sign in with this email address to add weights:\n\n` +
      `${await appOrigin()}/login?next=${encodeURIComponent(`/b/${baby.id}`)}`,
  );
  revalidatePath(`/b/${baby.id}`);
  return { ok: `${email} can now sign in and edit.` };
}

export async function removeMember(babyId: string, userId: string) {
  const { baby } = await requireMember(babyId);
  if ((await memberRole(baby.id, userId)) === "owner") throw new Error("The owner can't be removed");
  await sql`delete from baby_members where baby_id = ${baby.id} and user_id = ${userId}`;
  revalidatePath(`/b/${baby.id}`);
}

export async function resetShareLink(babyId: string) {
  const { baby } = await requireMember(babyId);
  await sql`update babies set share_token = ${randomId(16)} where id = ${baby.id}`;
  revalidatePath(`/b/${baby.id}`);
}

export async function resetDeviceToken(babyId: string) {
  const { baby } = await requireMember(babyId);
  await sql`update babies set device_token = ${randomId(24)} where id = ${baby.id}`;
  revalidatePath(`/b/${baby.id}`);
}


export async function deleteBaby(babyId: string, _: FormState, f: FormData): Promise<FormState> {
  const { baby, user } = await requireMember(babyId);
  if ((await memberRole(baby.id, user.id)) !== "owner") return { error: "Only the owner can delete this page." };
  if (str(f, "confirm") !== baby.name) return { error: `Type ${baby.name} to confirm.` };
  await sql`delete from babies where id = ${baby.id}`;
  revalidatePath("/home");
  redirect("/home");
}

// Shared babies pass to the earliest other member; the rest go with all their weights.
export async function deleteAccount(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  if (str(f, "confirm").toLowerCase() !== user.email) return { error: `Type ${user.email} to confirm.` };
  await sql.begin(async (tx) => {
    const owned = await tx<{ baby_id: string; heir: string | null }[]>`
      select m.baby_id, (
        select o.user_id from baby_members o where o.baby_id = m.baby_id and o.user_id <> m.user_id
        order by o.created_at limit 1) as heir
      from baby_members m where m.user_id = ${user.id} and m.role = 'owner'`;
    for (const b of owned) {
      if (b.heir) await tx`update baby_members set role = 'owner' where baby_id = ${b.baby_id} and user_id = ${b.heir}`;
      else await tx`delete from babies where id = ${b.baby_id}`;
    }
    // Unassigned readings from bridges nobody else has claimed.
    await tx`
      delete from entries where baby_id is null and bridge_id in (
        select bridge_id from bridge_users where user_id = ${user.id}
        except select bridge_id from bridge_users where user_id <> ${user.id})`;
    // Bridges only this person claimed go too (readings on babies that survive keep their weights).
    await tx`
      delete from bridges where id in (
        select bridge_id from bridge_users where user_id = ${user.id}
        except select bridge_id from bridge_users where user_id <> ${user.id})`;
    await tx`delete from login_tokens where email = ${user.email}`;
    await tx`delete from users where id = ${user.id}`; // sessions, memberships, bridges, push: on delete cascade
  });
  await endSession();
  redirect("/");
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// "Oct 26 2026 10:40:00 AM -04:00" (Greater Goods export), or anything Date understands (ISO).
function parseWhen(s: string): Date | undefined {
  const m = s.match(/^([A-Za-z]{3}) (\d{1,2}) (\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM) ([+-])(\d{2}):?(\d{2})$/);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    let hour = Number(m[4]) % 12;
    if (m[7] === "PM") hour += 12;
    const offsetMin = (m[8] === "-" ? -1 : 1) * (Number(m[9]) * 60 + Number(m[10]));
    const utc = Date.UTC(Number(m[3]), month, Number(m[2]), hour, Number(m[5]), Number(m[6])) - offsetMin * 60_000;
    return month < 0 ? undefined : new Date(utc);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// One CSV line into fields; handles "quoted, fields" and "" escapes.
function csvFields(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

// Imports a weight export (Greater Goods app: timestamp,type,weight(lb),weight(oz),length(in),note).
// Rows already present (same time and weight) are skipped, so the same file can be imported twice.
export async function importCsv(babyId: string, _: FormState, f: FormData): Promise<FormState> {
  const { baby } = await requireMember(babyId);
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > 1_000_000) return { error: "That file is too big (1 MB max)." };
  const lines = (await file.text()).split(/\r?\n/).filter((l) => l.trim());
  const head = csvFields(lines.shift() ?? "").map((h) => h.toLowerCase());
  const col = (name: string) => head.findIndex((h) => h.startsWith(name));
  const [iWhen, iType, iLb, iOz, iKg, iG, iNote] =
    ["timestamp", "type", "weight(lb)", "weight(oz)", "weight(kg)", "weight(g)", "note"].map(col);
  if (iWhen < 0 || (iLb < 0 && iKg < 0 && iG < 0))
    return { error: "Expected columns timestamp and weight(lb)/weight(oz) (or weight(kg) / weight(g))." };

  let added = 0, dupes = 0, other = 0, bad = 0;
  for (const line of lines) {
    const r = csvFields(line);
    if (iType >= 0 && r[iType] && r[iType].toLowerCase() !== "weight") { other++; continue; }
    const at = parseWhen(r[iWhen] ?? "");
    const num = (i: number) => (i >= 0 && r[i] ? Number(r[i]) : 0);
    const grams = Math.round(
      iG >= 0 && r[iG] ? num(iG) : iKg >= 0 && r[iKg] ? num(iKg) * 1000 : (num(iLb) + num(iOz) / 16) * GRAMS_PER_LB,
    );
    if (!at || !Number.isFinite(grams) || grams <= 0 || grams >= 50000) { bad++; continue; }
    const note = (iNote >= 0 && r[iNote]) ? r[iNote].slice(0, 200) : null;
    const [row] = await sql<{ id: string }[]>`
      insert into entries (baby_id, grams, measured_at, source, note, status)
      select ${baby.id}, ${grams}, ${at}, 'manual', ${note}, 'saved'
      where not exists (
        select 1 from entries where baby_id = ${baby.id} and measured_at = ${at} and abs(grams - ${grams}) <= 2)
      returning id::text`;
    if (row) added++; else dupes++;
  }
  revalidatePath(`/b/${baby.id}`);
  const parts = [`Imported ${added} weight${added === 1 ? "" : "s"}`];
  if (dupes) parts.push(`${dupes} already here`);
  if (other) parts.push(`${other} non-weight row${other === 1 ? "" : "s"} skipped`);
  if (bad) parts.push(`${bad} unreadable`);
  return { ok: parts.join(", ") + "." };
}

// Inbox: one tap puts a scale reading on a baby's (or pet's) chart.
export async function assignReading(entryId: string, babyId: string) {
  const user = await requireUser();
  if (!(await canSeeEntry(user.id, entryId)) || !(await memberRole(babyId, user.id))) throw new Error("Not allowed");
  await sql`update entries set baby_id = ${babyId}, status = 'saved' where id = ${entryId} and status = 'pending'`;
  revalidatePath("/home");
  revalidatePath(`/b/${babyId}`);
}

async function setReadingStatus(entryId: string, from: string, to: string) {
  const user = await requireUser();
  if (!(await canSeeEntry(user.id, entryId))) throw new Error("Not allowed");
  await sql`update entries set status = ${to} where id = ${entryId} and status = ${from}`;
  revalidatePath("/home");
}

export async function discardReading(entryId: string) {
  await setReadingStatus(entryId, "pending", "archived");
}

export async function restoreReading(entryId: string) {
  await setReadingStatus(entryId, "archived", "pending");
}

// Claim a bridge by typing the weight its scale just showed. Only someone at the scale knows it,
// so a stranger can't pick your bridge. Exactly one bridge must match, within 10 minutes.
const CLAIM_MINUTES = 10;
const CLAIM_TOLERANCE_G = 15; // about 0.5 oz: people round to the nearest ounce
const CLAIM_TRIES = 5; // per person per hour

export async function claimBridge(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const grams = f.get("unit") === "kg"
    ? Math.round(Number(str(f, "kg")) * 1000)
    : Math.round((Number(str(f, "lb") || 0) + Number(str(f, "oz") || 0) / 16) * GRAMS_PER_LB);
  if (!Number.isFinite(grams) || grams <= 0 || grams >= 50000) return { error: "Enter the weight the scale showed." };

  if (!(await allow(`claim:${user.id}`, CLAIM_TRIES, 60))) {
    return { error: "Too many tries. Wait an hour, then weigh something and try again." };
  }

  const matches = await sql<{ bridge_id: string }[]>`
    select distinct bridge_id from entries
    where bridge_id is not null
      and measured_at > now() - make_interval(mins => ${CLAIM_MINUTES})
      and abs(grams - ${grams}) <= ${CLAIM_TOLERANCE_G}`;
  if (matches.length === 0) {
    return { error: `No scale reported that weight in the last ${CLAIM_MINUTES} minutes. Weigh something and try again.` };
  }
  if (matches.length > 1) return { error: "More than one scale matches. Weigh something else and try again." };
  await sql`
    insert into bridge_users (bridge_id, user_id) values (${matches[0].bridge_id}, ${user.id})
    on conflict do nothing`;
  revalidatePath("/home");
  return { ok: "Bridge added. Its readings now show up here." };
}

export async function releaseBridge(bridgeId: string) {
  const user = await requireUser();
  await sql`delete from bridge_users where bridge_id = ${bridgeId} and user_id = ${user.id}`;
  revalidatePath("/home");
}

// Web push subscriptions from the "Notify me on this phone" button.
export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const user = await requireUser();
  if (!/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Bad subscription");
  await sql`
    insert into push_subscriptions (endpoint, user_id, p256dh, auth)
    values (${sub.endpoint}, ${user.id}, ${sub.keys.p256dh}, ${sub.keys.auth})
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`;
}

export async function removePushSubscription(endpoint: string) {
  const user = await requireUser();
  await sql`delete from push_subscriptions where endpoint = ${endpoint} and user_id = ${user.id}`;
}
