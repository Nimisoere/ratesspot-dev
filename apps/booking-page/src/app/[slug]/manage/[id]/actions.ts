"use server";

import { redirect } from "next/navigation";
import { client } from "@/lib/api";

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
