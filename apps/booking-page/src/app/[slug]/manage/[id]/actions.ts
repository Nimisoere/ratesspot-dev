"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { client, getCatalog, getManaged, siteUrl } from "@/lib/api";

/** Back to the guest's page. The slug and id come from the form, so they're checked before going into a URL. */
const back = (slug: string, id: string, token: string, extra: Record<string, string>) => {
  if (!/^[a-z0-9-]{1,100}$/.test(slug) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) redirect("/");
  redirect(`/${slug}/manage/${id}?${new URLSearchParams({ token, ...extra })}`);
};

export async function cancelBooking(form: FormData) {
  const slug = String(form.get("slug"));
  const id = String(form.get("id"));
  const token = String(form.get("token"));
  if (form.get("confirm") !== "on") back(slug, id, token, { error: "Tick the box to confirm you want to cancel." });
  const rs = await client(slug);
  const { error } = await rs.POST("/v1/manage/{bookingId}/cancel", { params: { path: { bookingId: id } }, body: { token, ...(form.get("reason") ? { reason: String(form.get("reason")).slice(0, 500) } : {}) } });
  if (error) back(slug, id, token, { error: error.error.message });
  back(slug, id, token, { notice: "Your booking is cancelled. Any refund goes back the way you paid." });
}

export async function updatePhone(form: FormData) {
  const slug = String(form.get("slug"));
  const id = String(form.get("id"));
  const token = String(form.get("token"));
  const phone = String(form.get("phone") ?? "").trim();
  const rs = await client(slug);
  const { error } = await rs.PATCH("/v1/manage/{bookingId}", { params: { path: { bookingId: id } }, body: { token, phone } });
  if (error) back(slug, id, token, { error: error.error.message });
  back(slug, id, token, { notice: "Phone number saved." });
}

/** Pay a booking that's waiting for a card payment, e.g. one the business just approved. Checks the guest's token first. */
export async function payNow(form: FormData) {
  const slug = String(form.get("slug"));
  const id = String(form.get("id"));
  const token = String(form.get("token"));
  const { data } = await getManaged(slug, id, token);
  if (!data) back(slug, id, token, { error: "That link isn't valid any more. Use the latest one from your email." });
  if (data!.booking.status !== "HOLD") back(slug, id, token, { error: "This booking isn't waiting for a payment." });
  const rs = await client(slug);
  const { methods } = await getCatalog(slug);
  (await cookies()).set(`rs_mt_${id}`, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: `/${slug}`, maxAge: 2 * 24 * 3600 });
  const { data: checkout, error } = await rs.POST("/v1/bookings/{id}/checkout", {
    params: { path: { id } },
    body: { provider: methods.cardProvider ?? "paystack", callbackUrl: `${siteUrl()}/${slug}/booking/complete` },
  });
  if (!checkout) back(slug, id, token, { error: error?.error.message ?? "The payment page didn't open. Please try again." });
  redirect(checkout!.authorizationUrl);
}

/** The guest confirms a change at the total they saw (booking-model.md 5.3): changed now, or off to pay the difference first. */
export async function confirmChange(form: FormData) {
  const slug = String(form.get("slug"));
  const id = String(form.get("id"));
  const token = String(form.get("token"));
  const range = String(form.get("kind")) === "days"
    ? { kind: "days" as const, start: String(form.get("start")), days: Number(form.get("days")) }
    : { kind: "nights" as const, checkIn: String(form.get("checkIn")), checkOut: String(form.get("checkOut")) };
  const adults = Number(form.get("adults"));
  const children = Number(form.get("children") ?? 0);
  const rs = await client(slug);
  const { data, error } = await rs.POST("/v1/manage/{bookingId}/change", {
    params: { path: { bookingId: id } },
    body: { token, range, adults, children, expectedTotal: Number(form.get("expectedTotal")), callbackUrl: `${siteUrl()}/${slug}/booking/complete` },
  });
  if (!data) back(slug, id, token, { error: error?.error.message ?? "That change didn't go through. Please try again." });
  if (data!.changed) back(slug, id, token, { notice: "Your booking is changed." });
  // Paying the difference first: come back to this page afterwards, and say it was for a change.
  const jar = await cookies();
  jar.set(`rs_mt_${id}`, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: `/${slug}`, maxAge: 2 * 24 * 3600 });
  jar.set(`rs_chg_${id}`, "1", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: `/${slug}`, maxAge: 30 * 60 });
  redirect(data!.checkout!.authorizationUrl);
}
