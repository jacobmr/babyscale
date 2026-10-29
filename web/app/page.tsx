import { CreateBabyForm } from "@/components/Forms";
import { createBaby } from "./actions";

export default function Home() {
  return (
    <>
      <h1>Baby weight</h1>
      <p className="muted">
        Track a baby&apos;s weight, by hand or straight from a Bluetooth scale, and share a growth chart with family.
        Pick a password: you&apos;ll need it once per device to add weights. Anyone with the share link can view.
      </p>
      <CreateBabyForm action={createBaby} />
      <p className="muted small">
        Open source: <a href="https://github.com/jacobmr/babyscale">github.com/jacobmr/babyscale</a>
      </p>
    </>
  );
}
