import webpush from "web-push";
import { sql, listCandidates } from "@/lib/db";
import { rankCandidates } from "@/lib/guess";
import { formatWeight } from "@/lib/units";

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string };

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:signin@salundo.com", pub, priv);
  return (configured = true);
}

// A new scale reading: tell everyone who can assign it, naming their likely baby or pet.
// Readings from a bridge go to the people who claimed it; legacy token readings to the baby's members.
export async function notifyNewReading(grams: number, at: Date, from: { bridgeId?: string; babyId?: string }) {
  if (!configure()) return;
  const subs = await sql<Sub[]>`
    select s.endpoint, s.user_id, s.p256dh, s.auth from push_subscriptions s
    where s.user_id in (
      ${from.bridgeId
        ? sql`select user_id from bridge_users where bridge_id = ${from.bridgeId}`
        : sql`select user_id from baby_members where baby_id = ${from.babyId ?? ""}`})`;
  const byUser = new Map<string, Sub[]>();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  await Promise.allSettled([...byUser].map(async ([userId, userSubs]) => {
    const candidates = await listCandidates(userId);
    const { pick } = rankCandidates(grams, at, candidates);
    const name = candidates.find((c) => c.id === pick)?.name;
    const w = formatWeight(grams, "lb").main;
    const payload = JSON.stringify({
      title: name ? `${name}: ${w}?` : `New weight: ${w}`,
      body: "Tap to save it.",
      url: "/home",
    });
    await Promise.allSettled(userSubs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sql`delete from push_subscriptions where endpoint = ${s.endpoint}`;
      }
    }));
  }));
}
