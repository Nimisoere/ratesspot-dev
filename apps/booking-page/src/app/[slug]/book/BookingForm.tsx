"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { reserve, type ReserveState } from "./actions";

export interface Choice {
  option: "FULL" | "DEPOSIT" | "ON_ARRIVAL" | "INSTALMENTS";
  method: "card" | "bank_transfer" | "on_arrival";
  title: string;
  amount: string;
  detail: string;
}

/** Guest details and how they'll pay. The idempotency key makes a double-click or retry reuse the same hold. */
export function BookingForm({ slug, query, choices, termsHref, request = false }: { slug: string; query: Record<string, string>; choices: Choice[]; termsHref: string | null; request?: boolean }) {
  const [state, action, pending] = useActionState<ReserveState, FormData>(reserve, null);
  const [choice, setChoice] = useState(0);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const chosen = choices[choice] ?? choices[0]!;
  return (
    <form action={action} className="stack-lg">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="paymentOption" value={chosen.option} />
      <input type="hidden" name="paymentMethod" value={chosen.method} />
      {Object.entries(query).map(([k, v]) => <input key={k} type="hidden" name={`q_${k}`} value={v} />)}

      <div className="stack">
        <h2>Your details</h2>
        <label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={200} /></label>
        <div className="row">
          <label>Email<input name="email" type="email" autoComplete="email" required={chosen.method === "card"} /></label>
          <label>Phone<input name="phone" type="tel" autoComplete="tel" minLength={5} maxLength={40} /></label>
        </div>
        <p className="muted small">{chosen.method === "card" ? "Your receipt goes to your email." : "Give an email or a phone number so we can reach you."}</p>
      </div>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend><h2>How you'd like to pay</h2></legend>
        {choices.map((c, i) => (
          <label key={`${c.option}-${c.method}`} className="choice">
            <input type="radio" name="choice" checked={i === choice} onChange={() => setChoice(i)} />
            <span className="title">{c.title}</span>
            <span>{c.amount}</span>
            <span className="detail">{c.detail}</span>
          </label>
        ))}
      </fieldset>

      {termsHref && (
        <label className="check">
          <input type="hidden" name="termsRequired" value="1" />
          <input type="checkbox" name="terms" required />
          <span>I accept the <Link href={termsHref} target="_blank">booking terms</Link>.</span>
        </label>
      )}
      {state?.error && <div className="notice bad" role="alert">{state.error}</div>}
      <button className="btn btn-block" type="submit" disabled={pending}>{pending ? "Reserving…" : request ? "Send request" : chosen.method === "card" ? "Continue to payment" : "Confirm booking"}</button>
    </form>
  );
}
