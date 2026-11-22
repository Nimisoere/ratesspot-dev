"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { client, getCatalog, siteUrl } from "@/lib/api";
import { parseRequest } from "@/lib/request";

export type ReserveState = { error: string } | null;

/** Holds the booking in RatesSpot, then sends the guest to pay by card, or to their booking (transfer, on arrival, or a request the business approves first). */
export async function reserve(_prev: ReserveState, form: FormData): Promise<ReserveState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const slug = get("slug");
  const query = Object.fromEntries([...form.keys()].filter((k) => k.startsWith("q_")).map((k) => [k.slice(2), get(k)]));
  const request = await parseRequest(slug, query);
  if ("error" in request) return { error: request.error };

  const name = get("name");
  const email = get("email");
  const phone = get("phone");
  const paymentOption = get("paymentOption") as "FULL" | "DEPOSIT" | "ON_ARRIVAL" | "INSTALMENTS";
  const paymentMethod = get("paymentMethod") as "card" | "bank_transfer" | "on_arrival";
  if (name.length < 2) return { error: "Enter your full name." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right." };
  if (!email && !phone) return { error: "Give an email or a phone number so we can reach you." };
  if (paymentMethod === "card" && !email) return { error: "Card payments need an email for the receipt." };
  if (!["FULL", "DEPOSIT", "ON_ARRIVAL", "INSTALMENTS"].includes(paymentOption) || !["card", "bank_transfer", "on_arrival"].includes(paymentMethod)) return { error: "Choose how you'd like to pay." };
  if (form.has("termsRequired") && form.get("terms") !== "on") return { error: "Please accept the booking terms." };
  if (!/^[0-9a-f-]{36}$/.test(get("idempotencyKey"))) return { error: "Something went wrong with the form. Please reload the page." };

  const rs = await client(slug);
  const { data: hold, error } = await rs.POST("/v1/holds", {
    params: { header: { "idempotency-key": get("idempotencyKey") } },
    body: {
      ...(request.resourceId ? { resourceId: request.resourceId } : {}),
      ...(request.sessionId ? { sessionId: request.sessionId } : {}),
      ...(request.rateId ? { rateId: request.rateId } : {}),
      range: request.range,
      quantity: request.quantity,
      adults: request.adults,
      ...(request.query["code"] ? { discountCode: request.query["code"].slice(0, 30) } : {}),
      paymentOption,
      paymentMethod,
      customer: { name, ...(email ? { email } : {}), ...(phone ? { phone } : {}) },
    },
  });
  if (!hold) return { error: error?.error.code === "insufficient_inventory" ? "Sorry, that was just booked. Go back and choose another time." : (error?.error.message ?? "We couldn't reserve that. Please try again.") };

  const manage = `/${slug}/manage/${hold.id}?token=${encodeURIComponent(hold.manageToken ?? "")}`;
  // A request (the business approves first) is paid after approval, from the guest's page.
  if (paymentMethod !== "card" || hold.status === "PENDING_APPROVAL") redirect(manage);

  // Card: remember the guest's link for when the provider sends them back, then go and pay.
  (await cookies()).set(`rs_mt_${hold.id}`, hold.manageToken ?? "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: `/${slug}`, maxAge: 2 * 24 * 3600 });
  const { methods } = await getCatalog(slug);
  const { data: checkout, error: checkoutError } = await rs.POST("/v1/bookings/{id}/checkout", {
    params: { path: { id: hold.id } },
    body: { provider: methods.cardProvider ?? "paystack", callbackUrl: `${siteUrl()}/${slug}/booking/complete` },
  });
  if (!checkout) return { error: checkoutError?.error.message ?? "The payment page didn't open. Please try again." };
  redirect(checkout.authorizationUrl);
}
