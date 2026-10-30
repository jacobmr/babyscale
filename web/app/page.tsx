import Link from "next/link";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/jacobmr/babyscale";

export default async function Landing() {
  const user = await getUser();
  return (
    <>
      <h1>Baby weight</h1>
      <p className="big-lede">
        A smart baby scale, a $8 radio, and a growth chart the whole family can see.
      </p>
      <p>
        {user ? <Link className="button" href="/home">Your babies</Link> : <Link className="button" href="/login">Sign in</Link>}
      </p>

      <section className="card stack">
        <h2>Why</h2>
        <p>
          In the first weeks, weight is the number everyone asks about. Is the baby back to birth weight? Gaining
          enough? As a family doc I&apos;ve asked that question thousands of times .. now I&apos;m a grandparent asking it.
        </p>
        <p>
          The scale we bought (a Greater Goods Bluetooth baby scale) is a fine scale. But its readings live in one
          phone app, on one phone. Grandparents can&apos;t see them. The pediatrician can&apos;t see them. And nobody
          wants to type numbers into a spreadsheet at 3 am.
        </p>
        <p>So we fixed that.</p>
      </section>

      <section className="card stack">
        <h2>How</h2>
        <p>
          <strong>The scale.</strong> It speaks Bluetooth Low Energy. We captured the conversation between the scale
          and its own app, worked out the protocol (login, time sync, then weight in grams), and wrote it down.
        </p>
        <p>
          <strong>The bridge.</strong> A thumb-sized M5Stack NanoC6 (an ESP32 board, about $8) plugs into a USB
          charger near the scale. It joins the home Wi-Fi, listens for the scale, and sends each weighing here over
          HTTPS. No phone needed.
        </p>
        <p>
          <strong>This site.</strong> Readings land on a chart with the WHO growth curves. Add weights by hand too.
          Share a read-only link with family, or add people by email so they can log weights. One bridge can serve
          more than one baby .. or the cats.
        </p>
      </section>

      <section className="card stack">
        <h2>Build your own</h2>
        <p>
          Everything is open source (MIT): the scale protocol, the bridge firmware, and this web app. The README has
          the parts list and flashing steps.
        </p>
        <p><a href={REPO}>github.com/jacobmr/babyscale</a></p>
        <p className="muted small">Not affiliated with Greater Goods. A hobby project, not a medical device.</p>
      </section>
    </>
  );
}
