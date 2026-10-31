import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · Baby weight" };

const ISSUES = "https://github.com/jacobmr/babyscale/issues";

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy</h1>
      <section className="card stack">
        <h2>What we keep</h2>
        <ul>
          <li>Your email address, so you can sign in.</li>
          <li>Each baby or pet&apos;s name, birth date, and the sex you pick for the growth curves.</li>
          <li>Weights and the times they were taken.</li>
          <li>Your scale bridge&apos;s hardware ID, so its readings find you.</li>
        </ul>
      </section>

      <section className="card stack">
        <h2>Where it lives</h2>
        <p>
          The site runs on Vercel. The data sits in a Neon Postgres database. Sign-in emails go out through Resend.
        </p>
        <p>
          We never sell it, share it, or use it for ads. People you invite, and anyone you give the read-only link
          to, can see that baby&apos;s chart.
        </p>
      </section>

      <section className="card stack">
        <h2>Not a medical device</h2>
        <p>
          This is a hobby project. The chart is a handy picture of how things are going, not health care advice.
          If you&apos;re worried about your baby&apos;s weight, call your pediatrician.
        </p>
      </section>

      <section className="card stack">
        <h2>Deleting everything</h2>
        <p>
          Sign in, go to <Link href="/home">your babies</Link>, and open <strong>Delete my account</strong> at the
          bottom. It removes your account and every baby or pet only you have, with all their weights, right away.
          Babies you share stay with the people you shared them with.
        </p>
      </section>

      <p className="muted small">
        Questions? Open an issue at <a href={ISSUES}>github.com/jacobmr/babyscale/issues</a>.
      </p>
    </>
  );
}
