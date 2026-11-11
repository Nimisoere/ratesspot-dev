import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStorefront } from "@/lib/api";

export const metadata: Metadata = { title: "Booking terms" };

export default async function Terms({ params }: PageProps<"/[slug]/terms">) {
  const { brand } = await getStorefront((await params).slug);
  if (!brand.bookingTerms) notFound();
  return (
    <main className="wrap section stack" style={{ maxWidth: 760 }}>
      <h1>Booking terms</h1>
      <p className="prose">{brand.bookingTerms}</p>
    </main>
  );
}
