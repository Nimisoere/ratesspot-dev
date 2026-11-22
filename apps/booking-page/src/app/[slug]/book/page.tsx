import type { Metadata } from "next";
import Link from "next/link";
import { client, getCatalog, getStorefront } from "@/lib/api";
import { dateTime, money, when } from "@/lib/format";
import { parseRequest } from "@/lib/request";
import { BookingForm, type Choice } from "./BookingForm";

export const metadata: Metadata = { title: "Book", robots: { index: false } };

/** The price for the guest's choice, and the ways to pay the business has switched on. */
export default async function BookPage({ params, searchParams }: PageProps<"/[slug]/book">) {
  const { slug } = await params;
  const { merchant, brand } = await getStorefront(slug);
  const request = await parseRequest(slug, await searchParams);
  if ("error" in request) {
    return (
      <main className="wrap section stack" style={{ maxWidth: 640 }}>
        <h1>Let's try that again</h1>
        <div className="notice bad">{request.error}</div>
        <p><Link className="btn" href={`/${slug}`}>Back</Link></p>
      </main>
    );
  }
  const rs = await client(slug);
  const { methods } = await getCatalog(slug);
  const body = { ...(request.resourceId ? { resourceId: request.resourceId } : {}), ...(request.sessionId ? { sessionId: request.sessionId } : {}), ...(request.rateId ? { rateId: request.rateId } : {}), range: request.range, quantity: request.quantity, adults: request.adults };
  // A discount code, if the guest entered one. If it doesn't apply, show the price without it and say why.
  const code = (request.query["code"] ?? "").trim().slice(0, 30);
  let codeError: string | null = null;
  let { data: q, error } = await rs.POST("/v1/quotes", { body: { ...body, ...(code ? { discountCode: code } : {}) } });
  if (!q && code && (error?.error.details as { field?: string } | undefined)?.field === "discountCode") {
    codeError = error?.error.message ?? "That code can't be used.";
    ({ data: q, error } = await rs.POST("/v1/quotes", { body }));
  }
  const keep = Object.fromEntries(Object.entries(request.query).filter(([k]) => k !== "code"));
  const applied = code && !codeError ? code.toUpperCase() : null;
  const tz = merchant.timezone;
  const cur = merchant.currency;
  if (!q) {
    const nearest = (error?.error.details as { nearestAvailable?: { start: string; end: string }[] } | undefined)?.nearestAvailable ?? [];
    return (
      <main className="wrap section stack" style={{ maxWidth: 640 }}>
        <h1>{error?.error.code === "insufficient_inventory" ? "Not available then" : "We can't book that"}</h1>
        <div className="notice bad">{error?.error.message ?? "Something went wrong. Please try again."}</div>
        {nearest.length > 0 && <p className="muted">Free nearby: {nearest.slice(0, 3).map((n) => when(n.start, n.end, tz)).join("; ")}</p>}
        <p><Link className="btn btn-ghost" href={request.backHref}>Choose another time</Link></p>
      </main>
    );
  }

  const deadline = q.policy.refundable ? q.policy.tiers[0]?.deadline : undefined;
  const choices: Choice[] = q.paymentOptions.flatMap((o): Choice[] => {
    const rest = o.balance > 0 ? ` Then ${money(o.balance, cur)} later.` : "";
    const refund = !o.dueNowRefundable ? " Non-refundable." : deadline ? ` Free cancellation until ${dateTime(deadline, tz)}.` : "";
    if (o.kind === "ON_ARRIVAL") return [{ option: "ON_ARRIVAL", method: "on_arrival", title: "Pay when you arrive", amount: `${money(0, cur)} now`, detail: `Pay ${money(o.balance, cur)} when you arrive.` }];
    const label = o.kind === "FULL" ? "in full" : o.kind === "DEPOSIT" ? "a deposit" : "the first instalment";
    return [
      ...(methods.card && methods.cardProvider ? [{ option: o.kind, method: "card" as const, title: `Pay ${label} by card`, amount: money(o.dueNow, cur), detail: `Secure payment page.${rest}${refund}` }] : []),
      ...(methods.bankTransfer ? [{ option: o.kind, method: "bank_transfer" as const, title: `Pay ${label} by bank transfer`, amount: money(o.dueNow, cur), detail: `We hold it for ${methods.bankTransfer.holdHours} hours while you transfer; you'll get the bank details next.${rest}${refund}` }] : []),
    ];
  });

  return (
    <main className="wrap section">
      <div className="layout">
        <div className="stack-lg">
          <h1>{q.requiresApproval ? "Request" : "Book"} {request.title}</h1>
          {q.requiresApproval && choices.length > 0 && (
            <div className="notice">The business confirms these bookings itself. Send your request and we'll hold it while they answer; you'll pay once it's approved.</div>
          )}
          {choices.length === 0 ? (
            <div className="notice warn">Online booking isn't available for this right now. Please get in touch using the details below.</div>
          ) : (
            <BookingForm slug={slug} query={applied ? { ...keep, code: applied } : keep} choices={choices} termsHref={brand.bookingTerms ? `/${slug}/terms` : null} request={q.requiresApproval ?? false} />
          )}
        </div>
        <aside className="aside panel">
          <h3>{request.title}</h3>
          <p className="muted">{when(q.start, q.end, tz)}</p>
          <dl className="lines">
            {q.lines.filter((l) => l.kind !== "tax_included").map((l, i) => (
              <div key={i}><dt>{l.label}</dt><dd>{money(l.amount, cur)}</dd></div>
            ))}
            <div className="total"><dt>Total</dt><dd>{money(q.total, cur)}</dd></div>
          </dl>
          <form method="get" className="stack" aria-label="Discount code">
            {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <label className="small">Have a code?
              <span className="row">
                <input name="code" defaultValue={code} maxLength={30} autoComplete="off" style={{ textTransform: "uppercase" }} />
                <button className="btn btn-ghost" type="submit">Apply</button>
              </span>
            </label>
            {codeError && <p className="notice bad small" role="alert">{codeError}</p>}
            {applied && <p className="notice ok small">{applied} applied.</p>}
          </form>
          {q.lines.find((l) => l.kind === "tax_included") && <p className="muted small">{q.lines.find((l) => l.kind === "tax_included")!.label}: {money(q.lines.find((l) => l.kind === "tax_included")!.amount, cur)}</p>}
          <div className={`notice ${q.policy.refundable ? "ok" : "warn"} small`}>{deadline ? `Free cancellation until ${dateTime(deadline, tz)}.` : q.policy.refundable ? "Free cancellation." : "This booking is non-refundable."}</div>
          <Link className="small" href={request.backHref}>Change</Link>
        </aside>
      </div>
    </main>
  );
}
