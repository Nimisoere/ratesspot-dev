import type { Metadata } from "next";

export const metadata: Metadata = { title: "RatesSpot booking pages" };

export default function Home() {
  return (
    <main className="wrap section stack" style={{ maxWidth: 640 }}>
      <h1>Booking pages by RatesSpot</h1>
      <p className="muted">Each business has its own page here, at /their-name. Businesses publish theirs from the RatesSpot dashboard (Settings → Booking page).</p>
    </main>
  );
}
