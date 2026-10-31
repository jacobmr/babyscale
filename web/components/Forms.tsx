"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/actions";

type Action = (state: FormState, f: FormData) => Promise<FormState>;

function Status({ state }: { state: FormState }) {
  if (state?.error) return <p className="error">{state.error}</p>;
  if (state?.ok) return <p className="ok">{state.ok}</p>;
  return null;
}

export function CreateBabyForm({ action }: { action: Action }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="stack">
      <label>Name<input name="name" required maxLength={60} autoComplete="off" /></label>
      <label>Birth date<input name="birth_date" type="date" required /></label>
      <label>
        Growth chart (WHO curves differ by sex)
        <select name="sex" defaultValue="girl">
          <option value="girl">Girl</option>
          <option value="boy">Boy</option>
          <option value="unspecified">Don&apos;t show percentile curves</option>
        </select>
      </label>
      <label>
        Units
        <select name="units" defaultValue="lb">
          <option value="lb">lb + oz</option>
          <option value="kg">kg</option>
        </select>
      </label>
      <button disabled={pending}>{pending ? "Creating…" : "Create"}</button>
      <Status state={state} />
    </form>
  );
}

export function EmailForm({ action, label, button, next }: { action: Action; label: string; button: string; next?: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="stack">
      <label>{label}<input name="email" type="email" required autoComplete="email" inputMode="email" /></label>
      {next && <input type="hidden" name="next" value={next} />}
      <button disabled={pending}>{pending ? "Sending…" : button}</button>
      <Status state={state} />
    </form>
  );
}

const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function AddEntryForm({ action, units }: { action: Action; units: "lb" | "kg" }) {
  const [state, run, pending] = useActionState(action, undefined);
  const [when, setWhen] = useState(localNow);
  // datetime-local has no time zone; convert to an absolute time in the browser.
  const submit = (f: FormData) => {
    f.set("measured_at", new Date(when).toISOString());
    return run(f);
  };
  return (
    <form action={submit} className="card stack">
      <h2>Add a weight</h2>
      <div className="row">
        {units === "kg" ? (
          <label>kg<input name="kg" type="number" step="0.001" min="0" required inputMode="decimal" /></label>
        ) : (
          <>
            <label>lb<input name="lb" type="number" step="1" min="0" required inputMode="numeric" /></label>
            <label>oz<input name="oz" type="number" step="0.1" min="0" max="15.9" inputMode="decimal" /></label>
          </>
        )}
      </div>
      <label>When<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required /></label>
      <label>Note (optional)<input name="note" maxLength={200} /></label>
      <button disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      <Status state={state} />
    </form>
  );
}

// Claim a bridge by typing the weight its scale just showed (proves you're at the scale).
export function ClaimBridgeForm({ action, units }: { action: Action; units: "lb" | "kg" }) {
  const [state, run, pending] = useActionState(action, undefined);
  const [unit, setUnit] = useState(units);
  return (
    <form action={run} className="stack">
      <p className="muted small">
        Weigh something on the scale, then type the weight it shows. That links its bridge to you.
      </p>
      <div className="row">
        {unit === "kg" ? (
          <label>kg<input name="kg" type="number" step="0.001" min="0" required inputMode="decimal" /></label>
        ) : (
          <>
            <label>lb<input name="lb" type="number" step="any" min="0" required inputMode="decimal" /></label>
            <label>oz<input name="oz" type="number" step="0.1" min="0" max="15.9" inputMode="decimal" /></label>
          </>
        )}
        <label>
          Units
          <select name="unit" value={unit} onChange={(e) => setUnit(e.target.value as "lb" | "kg")}>
            <option value="lb">lb + oz</option>
            <option value="kg">kg</option>
          </select>
        </label>
      </div>
      <button disabled={pending}>{pending ? "Checking…" : "Add my bridge"}</button>
      <Status state={state} />
    </form>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy">
      <input readOnly value={value} onFocus={(e) => e.target.select()} />
      <button type="button" onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true))}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function ImportForm({ action }: { action: Action }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="stack">
      <label>
        Import a CSV export (for example from the Greater Goods app)
        <input name="file" type="file" accept=".csv,text/csv" required />
      </label>
      <button disabled={pending}>{pending ? "Importing…" : "Import"}</button>
      <Status state={state} />
    </form>
  );
}

export function DeleteForm({ action, name, what }: { action: Action; name: string; what?: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="stack">
      <label>
        {what ?? `Delete ${name} and all weights.`} Type <strong>{name}</strong> to confirm.
        <input name="confirm" autoComplete="off" required />
      </label>
      <button className="danger-button" disabled={pending}>Delete permanently</button>
      <Status state={state} />
    </form>
  );
}
