import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { client } from "@/lib/api";

export const metadata: Metadata = { title: "Payment", robots: { index: false } };

/** Where the card provider sends the guest back: check the payment, then show their booking. */
export default async function PaymentComplete({ params, searchParams }: PageProps<"/[slug]/booking/complete">) {
  const { slug } = await params;
  const q = await searchParams;
  const reference = typeof q.reference === "string" ? q.reference : typeof q.trxref === "string" ? q.trxref : "";
  const provider = q.provider === "stripe" ? "stripe" : "paystack";
  if (!reference) return <Problem slug={slug} title="We couldn't find your payment" body="This page needs the payment reference from the payment page. If you've paid, contact us with your receipt." />;

  const rs = await client(slug);
  const { data, error } = await rs.POST("/v1/checkouts/verify", { body: { provider, reference } });
  if (!data) return <Problem slug={slug} title="We couldn't check your payment yet" body={`${error?.error.message ?? ""} If you've been charged, your booking is safe: contact us with your receipt.`} retry />;
  const token = (await cookies()).get(`rs_mt_${data.bookingId}`)?.value;
  if (token) redirect(`/${slug}/manage/${data.bookingId}?token=${encodeURIComponent(token)}${data.paymentStatus === "SUCCEEDED" ? "&paid=1" : ""}`);
  if (data.paymentStatus === "SUCCEEDED") return <Problem slug={slug} title="You're booked" body="Payment received. Your confirmation is on its way to your email." ok />;
  if (data.paymentStatus === "FAILED") return <Problem slug={slug} title="The payment didn't go through" body="Nothing was charged. You can go back and try again." />;
  return <Problem slug={slug} title="Your payment is still processing" body="This usually takes a few seconds. Refresh to check again." retry />;
}

function Problem({ slug, title, body, retry, ok }: { slug: string; title: string; body: string; retry?: boolean; ok?: boolean }) {
  return (
    <main className="wrap section stack" style={{ maxWidth: 640 }}>
      <h1>{title}</h1>
      <div className={`notice ${ok ? "ok" : "warn"}`}>{body}</div>
      <p>{retry ? <a className="btn" href="">Check again</a> : <Link className="btn" href={`/${slug}`}>Back to bookings</Link>}</p>
    </main>
  );
}
