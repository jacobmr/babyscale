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
    <form action={run} className="card stack">
      <label>Baby&apos;s name<input name="name" required maxLength={60} autoComplete="off" /></label>
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
      <label>
        Password for adding and editing weights
        <input name="password" type="password" required minLength={4} autoComplete="new-password" />
      </label>
      <button disabled={pending}>{pending ? "Creating…" : "Create"}</button>
      <Status state={state} />
    </form>
  );
}

export function PasswordForm({ action, label, button }: { action: Action; label: string; button: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="stack">
      <label>{label}<input name="password" type="password" required minLength={4} /></label>
      <button disabled={pending}>{button}</button>
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
