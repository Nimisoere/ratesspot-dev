import type { Metadata } from "next";
import Link from "next/link";
import { getCatalog, getManaged, getStorefront } from "@/lib/api";
import { dateTime, money, STATUS, when } from "@/lib/format";
import { cancelBooking, payNow, updatePhone } from "./actions";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };

/** The guest's own page for a booking, from their private link. */
export default async function ManageBooking({ params, searchParams }: PageProps<"/[slug]/manage/[id]">) {
  const { slug, id } = await params;
  const q = await searchParams;
  const token = typeof q.token === "string" ? q.token : "";
  const { merchant } = await getStorefront(slug);
  const { data, error } = token ? await getManaged(slug, id, token) : { data: undefined, error: undefined };
  if (!data) {
    return (
      <main className="wrap section stack" style={{ maxWidth: 640 }}>
        <h1>We couldn't open that booking</h1>
        <div className="notice bad">{error?.error.message ?? "That link isn't complete. Use the whole link from your email or message."}</div>
      </main>
    );
  }
  const { booking: b, canCancel, cancellation } = data;
  const tz = merchant.timezone;
  const cur = b.currency;
  const { methods } = await getCatalog(slug);
  const awaitingTransfer = b.status === "HOLD" && b.paymentMethod === "bank_transfer";
  const awaitingCard = b.status === "HOLD" && b.paymentMethod === "card";
  const awaitingApproval = b.status === "PENDING_APPROVAL";
  const notice = typeof q.notice === "string" ? q.notice : q.paid === "1" ? "Payment received. You're booked." : null;
  const problem = typeof q.error === "string" ? q.error : null;

  return (
    <main className="wrap section">
      <div className="layout">
        <div className="stack-lg">
          <div className="stack">
            <p><span className="pill">{STATUS[b.status] ?? b.status}</span></p>
            <h1>{awaitingApproval ? "Request sent" : awaitingTransfer ? `Transfer ${money(b.dueNow, cur)} to confirm` : b.status === "CONFIRMED" ? "You're booked" : b.status === "CANCELLED" ? "Booking cancelled" : "Your booking"}</h1>
            <p className="muted">Reference <strong>{b.reference}</strong></p>
          </div>
          {notice && <div className="notice ok" role="status">{notice}</div>}
          {problem && <div className="notice bad" role="alert">{problem}</div>}

          {awaitingTransfer && (
            <div className="panel">
              <p>We're holding it for you{b.holdExpiresAt ? <> until <strong>{dateTime(b.holdExpiresAt, tz)}</strong></> : null}. Use your reference so we can match the payment.</p>
              {methods.bankTransfer ? (
                <dl className="lines">
                  <div><dt>Amount</dt><dd><strong>{money(b.dueNow, cur)}</strong></dd></div>
                  <div><dt>Bank</dt><dd>{methods.bankTransfer.bankName}</dd></div>
                  <div><dt>Account name</dt><dd>{methods.bankTransfer.accountName}</dd></div>
                  <div><dt>Account number</dt><dd><strong>{methods.bankTransfer.accountNumber}</strong></dd></div>
                  <div><dt>Reference</dt><dd><strong>{b.reference}</strong></dd></div>
                </dl>
              ) : (
                <p className="muted">Contact us for the bank details.</p>
              )}
            </div>
          )}
          {awaitingApproval && (
            <div className="panel">
              <p>{merchant.name} confirms these bookings itself. We're holding it for you while they answer{b.approvalExpiresAt ? <>, by <strong>{dateTime(b.approvalExpiresAt, tz)}</strong></> : null}.</p>
              <p className="muted">Nothing has been charged. Once it's approved you'll be asked to pay {money(b.dueNow, cur)}{b.dueNow > 0 ? "" : " (nothing now)"}; if it isn't, it's released.</p>
            </div>
          )}
          {awaitingCard && (
            <form action={payNow} className="panel stack">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="token" value={token} />
              <p>This booking is waiting for payment{b.holdExpiresAt ? <>: pay by <strong>{dateTime(b.holdExpiresAt, tz)}</strong> to keep it</> : null}. If you've just paid, it updates within a minute.</p>
              <button className="btn" type="submit">Pay {money(b.dueNow, cur)} now</button>
            </form>
          )}

          <div className="panel">
            <h3>{b.quantity > 1 ? `${b.quantity} × ${b.itemName}` : b.itemName}</h3>
            <p>{when(b.start, b.end, tz)}</p>
            <dl className="lines">
              <div><dt>Total</dt><dd>{money(b.total, cur)}</dd></div>
              <div><dt>Paid</dt><dd>{money(b.paid, cur)}</dd></div>
              {b.balanceDue > 0 && b.status !== "CANCELLED" && <div className="total"><dt>Still to pay</dt><dd>{money(b.balanceDue, cur)}</dd></div>}
            </dl>
          </div>

          {canCancel && cancellation && (
            <form action={cancelBooking} className="panel">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="token" value={token} />
              <h3>Cancel this booking</h3>
              <p>
                {cancellation.paid === 0
                  ? "You haven't paid anything yet, so there's nothing to refund."
                  : `${cancellation.refund > 0 ? `You'll get ${money(cancellation.refund, cur)} back` : "Nothing is refunded"}${cancellation.penalty > 0 ? `; ${money(cancellation.penalty, cur)} is kept under the cancellation terms.` : "."}`}
              </p>
              <label>Reason (optional)<input name="reason" maxLength={500} /></label>
              <label className="check"><input type="checkbox" name="confirm" /> <span>Yes, cancel my booking.</span></label>
              <button className="btn btn-danger" type="submit">Cancel booking</button>
            </form>
          )}
        </div>
        <aside className="aside stack">
          {b.customer && (
            <form action={updatePhone} className="panel">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="token" value={token} />
              <h3>Your details</h3>
              <p>{b.customer.name}{b.customer.email ? <><br /><span className="muted small">{b.customer.email}</span></> : null}</p>
              <label>Phone<input name="phone" type="tel" defaultValue={b.customer.phone ?? ""} minLength={5} maxLength={40} required /></label>
              <button className="btn btn-ghost" type="submit">Save phone</button>
            </form>
          )}
          <div className="panel small">
            <p>Questions? {data.business.contact.phone ? <>Call <a href={`tel:${data.business.contact.phone.replace(/\s/g, "")}`}>{data.business.contact.phone}</a>. </> : null}{data.business.contact.email ? <>Email <a href={`mailto:${data.business.contact.email}`}>{data.business.contact.email}</a>.</> : null}</p>
            <p className="muted">Keep this page's link private: anyone with it can see this booking.</p>
            <Link href={`/${slug}`}>Book something else</Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
