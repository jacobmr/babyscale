import Link from "next/link";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/jacobmr/babyscale";
const ORDER_EMAIL = "jacob@reider.us";
const ORDER_LINK =
  `mailto:${ORDER_EMAIL}?subject=${encodeURIComponent("Babyscale bridge")}` +
  `&body=${encodeURIComponent("I'd like a bridge ($15 shipped).\n\nName:\nShipping address:\n")}`;

export default async function Landing() {
  const user = await getUser();
  return (
    <>
      <h1>Baby weight, for the whole family</h1>
      <p className="big-lede">
        Weigh the baby. The number lands on a growth chart that parents, grandparents and the pediatrician can all
        see. No typing, no app, no phone in the loop.
      </p>
      <p className="row-start">
        {user ? <Link className="button" href="/home">Your babies</Link> : <Link className="button" href="/login">Sign in free</Link>}
        <a className="button secondary" href="#get-one">Get a bridge</a>
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
        <p>
          So we built a small bridge that listens to the scale and sends each weighing here. Put the baby on the
          scale, and a few seconds later the new weight is on everyone&apos;s chart.
        </p>
      </section>

      <section className="card stack">
        <h2>What you get</h2>
        <ul className="plain">
          <li><strong>A growth chart</strong> with the WHO curves, so &quot;is that a good weight?&quot; has an answer.</li>
          <li><strong>One tap to save.</strong> New readings wait in your inbox; tap to file them under the right baby (or the cat).</li>
          <li><strong>Family access.</strong> Add people by email, or share a read-only link.</li>
          <li><strong>A note on your phone</strong> when a new weight comes in.</li>
          <li><strong>Your data stays yours.</strong> No ads, no selling it. Delete your account any time.</li>
        </ul>
      </section>

      <section className="card stack" id="get-one">
        <h2>Get started: no software skills needed</h2>
        <p>
          You need the scale (a Greater Goods Bluetooth baby scale) and a bridge. We&apos;ll mail you a bridge
          that&apos;s ready to go for <strong>$15, shipped</strong> in the US. Hosting is free.
        </p>
        <p><a className="button" href={ORDER_LINK}>Request a bridge</a></p>
        <p className="muted small">That opens an email to us. We reply with payment details and ship it.</p>
        <ol className="steps">
          <li><strong>Plug it in</strong> to any USB charger near the scale.</li>
          <li><strong>Put it on your Wi-Fi.</strong> On your phone, join the <code>babyscale-bridge</code> network, then pick your home Wi-Fi.</li>
          <li><strong>Sign in</strong> here with your email. No password.</li>
          <li><strong>Claim your scale.</strong> Weigh something, then type the weight the scale shows. That links the bridge to you.</li>
        </ol>
      </section>

      <section className="card stack">
        <h2>Or build your own</h2>
        <p>
          The bridge is a thumb-sized M5Stack NanoC6 (an ESP32 board, about $8). Everything is open source (MIT): the
          scale protocol, the bridge firmware, and this web app. Flash the firmware and it uses this site for free, or
          run your own copy.
        </p>
        <p><a href={REPO}>github.com/jacobmr/babyscale</a></p>
      </section>

      <p className="muted small">Not affiliated with Greater Goods. A hobby project, not a medical device.</p>
      <footer className="muted small"><Link href="/privacy">Privacy</Link> · <a href={REPO}>GitHub</a></footer>
    </>
  );
}
