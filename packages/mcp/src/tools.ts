import { McpServer } from "@modelcontextprotocol/server";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import * as z from "zod";
import { createApi, RatesSpotError, type Connection, type Schemas } from "./api.ts";
import { minuteOfDay, money, toMinor, WEEKDAYS } from "./units.ts";

/**
 * The RatesSpot MCP server. Tools are tasks a business owner would describe
 * ("add a listing with its price and photos", "cancel this booking"), each
 * built only on the public API. Amounts are in normal currency units and
 * times in the business's local time; the tools convert.
 */
export function createRatesSpotMcp(connection: Connection) {
  const { api, ok, upload } = createApi(connection);
  const server = new McpServer(
    { name: "ratesspot", version: "0.1.0" },
    {
      instructions:
        "RatesSpot is a booking engine for businesses that sell time at a rate: rooms by the night, desks and offices by the hour, day or month, " +
        "seats on courses. A business has listings (what's booked, e.g. 'Studio flat' or 'Meeting room'), each with units (the individual rooms or desks) and rates (prices per night, hour, day, month...). " +
        "Start with get_business to learn the currency, timezone and what's left to set up. Amounts are in normal currency units (25000 means ₦25,000). " +
        "Dates are YYYY-MM-DD and times are local to the business (YYYY-MM-DDTHH:mm).",
    },
  );

  let merchant: Schemas["Merchant"] | undefined;
  async function business() {
    merchant ??= await ok(api.GET("/v1/merchant"));
    return merchant;
  }
  const minor = async (amount: number) => toMinor(amount, (await business()).currency);
  const show = async (amount: number) => money(amount, (await business()).currency);

  /** Runs a tool body; API errors become tool errors the agent can read and act on. */
  async function run(body: () => Promise<unknown>) {
    try {
      const result = await body();
      return { content: [{ type: "text" as const, text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }] };
    } catch (e) {
      const text =
        e instanceof RatesSpotError
          ? `RatesSpot refused (${e.code}): ${e.message}${e.details ? `\nDetails: ${JSON.stringify(e.details)}` : ""}`
          : `Failed: ${e instanceof Error ? e.message : String(e)}`;
      return { content: [{ type: "text" as const, text }], isError: true };
    }
  }

  async function bookingView(b: Schemas["Booking"]) {
    return {
      id: b.id,
      reference: b.reference,
      status: b.status,
      booked: b.quantity > 1 ? `${b.quantity} × ${b.itemName}` : b.itemName,
      units: b.units.map((u) => u.name),
      start: b.start,
      end: b.end,
      customer: b.customer,
      guests: { adults: b.adults, children: b.children },
      total: await show(b.total),
      paid: await show(b.paid),
      balanceDue: await show(b.balanceDue),
      dueNow: await show(b.dueNow),
      paymentMethod: b.paymentMethod,
      holdExpiresAt: b.holdExpiresAt,
    };
  }

  const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
  const Time = z.string().regex(/^\d{1,2}:\d{2}$/).describe("HH:mm, 24-hour, local time");
  const When = z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("nights"), checkIn: LocalDate, checkOut: LocalDate }),
      z.object({ kind: z.literal("hours"), start: z.string().describe("Local start, YYYY-MM-DDTHH:mm"), hours: z.number().int().min(1) }),
      z.object({ kind: z.literal("block"), date: LocalDate, block: z.string().describe("Block name from the rate, e.g. Morning") }),
      z.object({ kind: z.literal("days"), start: LocalDate, days: z.number().int().min(1) }),
      z.object({ kind: z.literal("months"), start: LocalDate, months: z.number().int().min(1) }),
      z.object({ kind: z.literal("years"), start: LocalDate, years: z.number().int().min(1) }),
    ])
    .describe("When, in the shape the listing's rate uses: nights for stays, hours/block/days for spaces, months/years for contracts");
  async function range(when: z.infer<typeof When> | undefined, courseId: string | undefined): Promise<Schemas["Range"]> {
    if (courseId) return { kind: "session" };
    if (!when) throw new Error("Say when: give `when` for a listing, or `courseId` for a course.");
    return when; // the API reads local times in the business's timezone
  }
  const target = (listingId?: string, courseId?: string) => {
    if (!listingId === !courseId) throw new Error("Give exactly one of listingId or courseId.");
    return listingId ? { resourceId: listingId } : { sessionId: courseId! };
  };

  // ─── Business ────────────────────────────────────────────────────────────

  server.registerTool(
    "get_business",
    {
      title: "Business overview",
      description: "The business's name, currency, timezone and tax, what's left to set up before it can take bookings, and how guests can pay right now.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      run(async () => ({
        business: await ok(api.GET("/v1/business")),
        setup: await ok(api.GET("/v1/business/setup")),
        paymentMethods: await ok(api.GET("/v1/payment-methods")),
      })),
  );

  server.registerTool(
    "list_catalog",
    {
      title: "What the business sells",
      description: "Every listing with its units, rates (prices and ways to pay) and photos, plus add-ons and courses. Includes switched-off items, marked active: false.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      run(async () => {
        const [catalog, courses] = await Promise.all([ok(api.GET("/v1/catalog")), ok(api.GET("/v1/catalog/courses"))]);
        const c = catalog.currency;
        return {
          currency: c,
          listings: catalog.resources.map((r) => ({
            id: r.id,
            name: r.name,
            webAddress: r.slug,
            active: r.active,
            tagline: r.tagline,
            peoplePerUnit: r.capacity,
            units: r.units.map((u) => ({ id: u.id, name: u.name, active: u.active })),
            photos: r.images.length,
            rates: r.rates.map((rate) => ({
              id: rate.id,
              name: rate.name,
              per: rate.unit.toLowerCase(),
              price: money(rate.amount, c),
              active: rate.active,
              isDefault: rate.isDefault,
              waysToPay: rate.paymentOptions.map((o) => o.kind.toLowerCase()),
            })),
          })),
          addOns: catalog.addOns.map((a) => ({ id: a.id, name: a.name, price: money(a.amount, c), basis: a.basis, active: a.active })),
          courses: courses.data.map((k) => ({ id: k.id, name: k.name, seats: k.seats, seatsSold: k.seatsSold, pricePerSeat: money(k.pricePerSeat, c), dates: k.dates.map((d) => `${d.start} – ${d.end}`), active: k.active })),
        };
      }),
  );

  // ─── Setting up ──────────────────────────────────────────────────────────

  const RateInput = z.object({
    name: z.string().min(1).max(100).default("Standard"),
    per: z.enum(["night", "hour", "day", "month", "year"]).describe("What one price covers"),
    price: z.number().min(0).describe("Price per night/hour/day/month/year in normal currency units, e.g. 25000"),
    waysToPay: z
      .array(z.enum(["full", "deposit_one_unit", "on_arrival"]))
      .min(1)
      .default(["full"])
      .describe("full: pay everything when booking. deposit_one_unit: pay the first night/day now (non-refundable), the rest on arrival. on_arrival: pay nothing now"),
  });
  const paymentOptions = (ways: string[]): Schemas["PaymentOptionInput"][] =>
    ways.map((w, i) =>
      w === "deposit_one_unit"
        ? { kind: "DEPOSIT", depositType: "UNITS", depositValue: 1, depositRefundable: false, isDefault: i === 0 }
        : { kind: w === "on_arrival" ? "ON_ARRIVAL" : "FULL", isDefault: i === 0 },
    );

  server.registerTool(
    "create_listing",
    {
      title: "Add a listing",
      description:
        "Add something people can book (a room type, apartment, desk, office, meeting room, studio...), with its units and, optionally, its first rate so it can be booked straight away. " +
        "Units are the individual bookable things: 4 identical studios is one listing with 4 units.",
      inputSchema: z.object({
        name: z.string().min(1).max(100).describe("e.g. 'Studio flat' or 'Hot desk'"),
        peoplePerUnit: z.number().int().min(1).max(1000).describe("How many people one unit holds"),
        units: z.union([z.array(z.string().min(1).max(60)).min(1), z.number().int().min(1).max(500)]).describe("Unit names (['Room 1','Room 2']) or a count (named '<name> 1', '<name> 2'...)"),
        tagline: z.string().max(200).optional(),
        description: z.string().max(5000).optional().describe("Shown on booking pages. Blank lines separate paragraphs"),
        features: z.array(z.string().max(100)).max(40).optional().describe("e.g. ['Air conditioning', 'Fast Wi-Fi']"),
        webAddress: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).optional().describe("Slug for booking pages; made from the name if omitted"),
        rate: RateInput.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        const units = typeof input.units === "number" ? Array.from({ length: input.units }, (_, i) => `${input.name} ${i + 1}`) : input.units;
        let listing = await ok(
          api.POST("/v1/catalog/resources", {
            body: {
              name: input.name,
              capacity: input.peoplePerUnit,
              units,
              ...(input.tagline ? { tagline: input.tagline } : {}),
              ...(input.description ? { description: input.description } : {}),
              ...(input.features ? { features: input.features } : {}),
              ...(input.webAddress ? { slug: input.webAddress } : {}),
            },
          }),
        );
        if (input.rate) {
          listing = await ok(
            api.POST("/v1/catalog/resources/{resourceId}/rates", {
              params: { path: { resourceId: listing.id } },
              body: { name: input.rate.name, unit: input.rate.per.toUpperCase() as Schemas["RateCreate"]["unit"], amount: await minor(input.rate.price), isDefault: true, paymentOptions: paymentOptions(input.rate.waysToPay) },
            }),
          );
        }
        return { listingId: listing.id, webAddress: listing.slug, units: listing.units.map((u) => u.name), rates: listing.rates.map((r) => ({ id: r.id, name: r.name })) };
      }),
  );

  server.registerTool(
    "update_listing",
    {
      title: "Change a listing",
      description: "Change a listing's name, description, features, web address or capacity, or switch it off (active: false stops new bookings; existing ones are kept).",
      inputSchema: z.object({
        listingId: z.string(),
        name: z.string().min(1).max(100).optional(),
        tagline: z.string().max(200).optional(),
        description: z.string().max(5000).optional(),
        features: z.array(z.string().max(100)).max(40).optional(),
        webAddress: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).optional(),
        peoplePerUnit: z.number().int().min(1).optional(),
        active: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ listingId, webAddress, peoplePerUnit, ...rest }) =>
      run(async () => {
        const updated = await ok(
          api.PATCH("/v1/catalog/resources/{resourceId}", {
            params: { path: { resourceId: listingId } },
            body: { ...rest, ...(webAddress ? { slug: webAddress } : {}), ...(peoplePerUnit ? { capacity: peoplePerUnit } : {}) },
          }),
        );
        return { listingId: updated.id, name: updated.name, webAddress: updated.slug, active: updated.active };
      }),
  );

  server.registerTool(
    "set_rate",
    {
      title: "Add or change a price",
      description: "Add a rate (price) to a listing, or change an existing one with rateId. A listing can have several, e.g. nightly and monthly. Existing bookings keep the price they were booked at.",
      inputSchema: z.object({
        listingId: z.string(),
        rateId: z.string().optional().describe("To change an existing rate; omit to add one"),
        name: z.string().min(1).max(100).optional(),
        per: z.enum(["night", "hour", "day", "month", "year"]).optional().describe("Required when adding"),
        price: z.number().min(0).optional().describe("Required when adding"),
        waysToPay: RateInput.shape.waysToPay.optional(),
        active: z.boolean().optional(),
        isDefault: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        const amount = input.price === undefined ? undefined : await minor(input.price);
        if (!input.rateId) {
          if (!input.per || amount === undefined) throw new Error("To add a rate, give `per` and `price`.");
          const listing = await ok(
            api.POST("/v1/catalog/resources/{resourceId}/rates", {
              params: { path: { resourceId: input.listingId } },
              body: { name: input.name ?? "Standard", unit: input.per.toUpperCase() as Schemas["RateCreate"]["unit"], amount, paymentOptions: paymentOptions(input.waysToPay ?? ["full"]), ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}) },
            }),
          );
          return { listingId: listing.id, rates: listing.rates.map((r) => ({ id: r.id, name: r.name, per: r.unit.toLowerCase(), active: r.active })) };
        }
        const listing = await ok(
          api.PATCH("/v1/catalog/rates/{rateId}", {
            params: { path: { rateId: input.rateId } },
            body: {
              ...(input.name ? { name: input.name } : {}),
              ...(amount !== undefined ? { amount } : {}),
              ...(input.waysToPay ? { paymentOptions: paymentOptions(input.waysToPay) } : {}),
              ...(input.active !== undefined ? { active: input.active } : {}),
              ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
            },
          }),
        );
        return { listingId: listing.id, rates: listing.rates.map((r) => ({ id: r.id, name: r.name, per: r.unit.toLowerCase(), active: r.active })) };
      }),
  );

  server.registerTool(
    "add_photo",
    {
      title: "Add a photo",
      description: "Add a photo to a listing or course, from a file on this computer or a public https URL. JPEG, PNG or WebP up to 8 MB. The first photo is the main one.",
      inputSchema: z.object({
        listingId: z.string().optional(),
        courseId: z.string().optional(),
        source: z.string().describe("A local file path, or an https:// URL"),
        description: z.string().max(300).optional().describe("What the photo shows (alt text)"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    (input) =>
      run(async () => {
        target(input.listingId, input.courseId); // exactly one
        let bytes: Uint8Array<ArrayBuffer>;
        if (/^https:\/\//.test(input.source)) {
          const res = await fetch(input.source);
          if (!res.ok) throw new Error(`Couldn't download the photo (${res.status}).`);
          bytes = new Uint8Array(await res.arrayBuffer());
        } else {
          bytes = Uint8Array.from(await readFile(input.source));
        }
        const form = new FormData();
        form.append("file", new File([bytes], basename(input.source.split("?")[0] ?? "photo")));
        if (input.description) form.append("alt", input.description);
        const path = input.listingId ? `/v1/catalog/resources/${encodeURIComponent(input.listingId)}/images` : `/v1/catalog/courses/${encodeURIComponent(input.courseId ?? "")}/images`;
        const image = await upload<{ id: string; width: number; height: number }>(path, form);
        return { photoId: image.id, size: `${image.width}×${image.height}` };
      }),
  );

  server.registerTool(
    "create_course",
    {
      title: "Add a course or event",
      description: "Add a course, class or event that sells seats on one or more dates. Leave dates empty to list it as 'dates to be announced' (not bookable until dates are added).",
      inputSchema: z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        seats: z.number().int().min(1),
        pricePerSeat: z.number().min(0).describe("For the whole course, in normal currency units"),
        dates: z.array(z.object({ date: LocalDate, start: Time, end: Time })).max(100).default([]),
        roomListingId: z.string().optional().describe("A listing (room) it uses; closed to other bookings while the course runs"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        const course = await ok(
          api.POST("/v1/catalog/courses", {
            body: {
              name: input.name,
              seats: input.seats,
              pricePerSeat: await minor(input.pricePerSeat),
              dates: input.dates.map((d) => ({ date: d.date, startTime: d.start, endTime: d.end })),
              ...(input.description ? { description: input.description } : {}),
              ...(input.roomListingId ? { resourceId: input.roomListingId } : {}),
            },
          }),
        );
        return { courseId: course.id, dates: course.dates.map((d) => `${d.start} – ${d.end}`), bookable: course.dates.length > 0 };
      }),
  );

  server.registerTool(
    "set_opening_hours",
    {
      title: "Set opening hours",
      description: "Set weekly opening hours for the whole business, or for one listing. Hourly and daily bookings must fit inside them; nightly stays aren't affected. An empty list means always open (business) or 'use the business hours' (listing).",
      inputSchema: z.object({
        listingId: z.string().optional().describe("Omit for the whole business"),
        hours: z.array(z.object({ day: z.enum(WEEKDAYS), open: Time, close: Time })).max(70).describe("e.g. [{day:'monday', open:'08:00', close:'18:00'}]. Several entries per day are allowed"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        const result = await ok(
          api.PUT("/v1/catalog/hours", {
            body: {
              resourceId: input.listingId ?? null,
              windows: input.hours.map((h) => ({ weekday: WEEKDAYS.indexOf(h.day), startMinute: minuteOfDay(h.open), endMinute: minuteOfDay(h.close) })),
            },
          }),
        );
        return { saved: true, businessHours: result.business.length, listingsWithOwnHours: result.resources.length };
      }),
  );

  server.registerTool(
    "set_payment_methods",
    {
      title: "Choose how guests pay",
      description:
        "Switch card payments on or off (card needs Paystack or Stripe connected in the dashboard first), and set up bank transfer: account details and how long a booking is held while the guest transfers. " +
        "Staff confirm a transfer booking by recording the payment (record_payment).",
      inputSchema: z.object({
        card: z.boolean().optional().describe("true to take cards, false to pause them (keys are kept)"),
        bankTransfer: z
          .object({
            enabled: z.boolean(),
            bankName: z.string().max(100).optional(),
            accountName: z.string().max(200).optional(),
            accountNumber: z.string().max(20).optional(),
            holdHours: z.number().int().min(1).max(168).optional().describe("Default 24"),
          })
          .optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        if (input.card !== undefined) await ok(api.PUT("/v1/payment-settings/card", { body: { enabled: input.card } }));
        if (input.bankTransfer) await ok(api.PUT("/v1/payment-settings/bank-transfer", { body: input.bankTransfer }));
        return ok(api.GET("/v1/payment-methods"));
      }),
  );

  // ─── Availability and bookings ───────────────────────────────────────────

  server.registerTool(
    "check_availability",
    {
      title: "Check availability",
      description: "How many units (or course seats) are free on each day between two dates, with the price and, for hourly listings, free start times.",
      inputSchema: z.object({
        listingId: z.string().optional(),
        courseId: z.string().optional(),
        from: LocalDate,
        to: LocalDate,
        quantity: z.number().int().min(1).optional().describe("Units or seats needed"),
        hours: z.number().int().min(1).optional().describe("Hourly listings: length of the booking"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        const t = target(input.listingId, input.courseId);
        const result = await ok(api.GET("/v1/availability", { params: { query: { ...t, from: input.from, to: input.to, ...(input.quantity ? { quantity: input.quantity } : {}), ...(input.hours ? { hours: input.hours } : {}) } } }));
        const c = (await business()).currency;
        return result.days.map((d) => ({ date: d.date, free: d.free, ...(d.price !== undefined ? { price: money(d.price, c) } : {}), ...(d.startTimes?.length ? { startTimes: d.startTimes } : {}), ...(d.blocks?.length ? { blocks: d.blocks } : {}) }));
      }),
  );

  const Guests = { adults: z.number().int().min(1).default(1), children: z.number().int().min(0).default(0) };

  server.registerTool(
    "quote",
    {
      title: "Price a booking",
      description: "The exact price, taxes, cancellation terms and ways to pay for a booking, without reserving anything.",
      inputSchema: z.object({
        listingId: z.string().optional(),
        courseId: z.string().optional(),
        when: When.optional(),
        quantity: z.number().int().min(1).default(1).describe("Units or seats"),
        ...Guests,
        rateId: z.string().optional().describe("A specific rate; otherwise the listing's default for that kind of booking"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        const q = await ok(
          api.POST("/v1/quotes", {
            body: { ...target(input.listingId, input.courseId), range: await range(input.when, input.courseId), quantity: input.quantity, adults: input.adults, children: input.children, ...(input.rateId ? { rateId: input.rateId } : {}) },
          }),
        );
        return {
          start: q.start,
          end: q.end,
          lines: await Promise.all(q.lines.map(async (l) => ({ item: l.label, amount: await show(l.amount) }))),
          total: await show(q.total),
          refundable: q.policy.refundable,
          waysToPay: await Promise.all(q.paymentOptions.map(async (o) => ({ option: o.kind.toLowerCase(), payNow: await show(o.dueNow), later: await show(o.balance) }))),
        };
      }),
  );

  server.registerTool(
    "book",
    {
      title: "Make a booking",
      description:
        "Book for a customer, e.g. one who called or messaged. pay_at_desk and on_arrival confirm straight away (record the money with record_payment when it's taken); " +
        "bank_transfer holds the booking until the transfer is recorded, then confirms it.",
      inputSchema: z.object({
        listingId: z.string().optional(),
        courseId: z.string().optional(),
        when: When.optional(),
        quantity: z.number().int().min(1).default(1),
        ...Guests,
        customer: z
          .object({ name: z.string().min(1), email: z.string().email().optional(), phone: z.string().min(5).optional() })
          .refine((c) => c.email || c.phone, "Give the customer's email or phone number")
          .describe("Name plus an email or phone. Confirmation emails need an email"),
        payment: z.enum(["pay_at_desk", "bank_transfer", "on_arrival"]).describe("How the customer will pay"),
        rateId: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        const booking = await ok(
          api.POST("/v1/holds", {
            params: { header: { "idempotency-key": crypto.randomUUID() } },
            body: {
              ...target(input.listingId, input.courseId),
              range: await range(input.when, input.courseId),
              quantity: input.quantity,
              adults: input.adults,
              children: input.children,
              customer: input.customer,
              ...(input.rateId ? { rateId: input.rateId } : {}),
              ...(input.payment === "on_arrival" ? { paymentOption: "ON_ARRIVAL" as const, paymentMethod: "on_arrival" as const } : {}),
              ...(input.payment === "bank_transfer" ? { paymentMethod: "bank_transfer" as const } : {}),
              ...(input.payment === "pay_at_desk" ? { paymentMethod: "desk" as const } : {}),
            },
          }),
        );
        return bookingView(booking);
      }),
  );

  server.registerTool(
    "find_bookings",
    {
      title: "Find bookings",
      description: "Search bookings by guest name, email, phone or reference, or list today's (or a date's) arrivals, departures or everyone checked in.",
      inputSchema: z.object({
        search: z.string().optional().describe("Guest name, email, phone, or booking reference"),
        view: z.enum(["arrivals", "departures", "in_house"]).optional(),
        date: LocalDate.optional().describe("For arrivals or departures; defaults to today"),
        from: LocalDate.optional().describe("Bookings overlapping from this date..."),
        to: LocalDate.optional().describe("...to this date (exclusive)"),
        status: z.array(z.enum(["HOLD", "PENDING_APPROVAL", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "EXPIRED", "NO_SHOW"])).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        const list = await ok(
          api.GET("/v1/bookings", {
            params: { query: { limit: input.limit, ...(input.search ? { q: input.search } : {}), ...(input.view ? { view: input.view } : {}), ...(input.date ? { date: input.date } : {}), ...(input.from ? { from: input.from } : {}), ...(input.to ? { to: input.to } : {}), ...(input.status ? { status: input.status.join(",") } : {}) } },
          }),
        );
        return Promise.all(list.data.map(bookingView));
      }),
  );

  server.registerTool(
    "get_calendar",
    {
      title: "Calendar",
      description: "Who is in which unit, day by day: every listing's units with the bookings and closures on them between two dates (up to 62 days). Use it to answer 'what's booked next week?' or 'which rooms are free on Friday?'",
      inputSchema: z.object({ from: LocalDate, to: LocalDate.describe("Exclusive"), listingId: z.string().optional() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        const cal = await ok(api.GET("/v1/calendar", { params: { query: { from: input.from, to: input.to, ...(input.listingId ? { resourceId: input.listingId } : {}) } } }));
        return cal.listings.map((l) => ({
          listing: l.name,
          units: l.units.map((u) => ({
            unit: u.name,
            bookings: cal.bookings
              .filter((b) => b.unitIds.includes(u.id))
              .map((b) => ({ bookingId: b.id, reference: b.reference, guest: b.customerName, status: b.status, start: b.start, end: b.end, balanceDue: money(b.balanceDue, cal.currency) })),
            closed: cal.closures.filter((c) => c.resourceId === l.id && (c.unitId === null || c.unitId === u.id)).map((c) => ({ start: c.start, end: c.end, reason: c.courseName ? `Course: ${c.courseName}` : c.reason })),
          })),
        }));
      }),
  );

  server.registerTool(
    "get_booking",
    {
      title: "A booking in full",
      description: "One booking: dates, units, customer, money paid and owed, and what cancelling it now would refund.",
      inputSchema: z.object({ bookingId: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ bookingId }) =>
      run(async () => {
        const booking = await ok(api.GET("/v1/bookings/{id}", { params: { path: { id: bookingId } } }));
        const cancellation = await api.GET("/v1/bookings/{id}/cancellation", { params: { path: { id: bookingId } } });
        return { ...(await bookingView(booking)), ifCancelledNow: cancellation.data ? { refund: await show(cancellation.data.refund), penalty: await show(cancellation.data.penalty) } : "Can't be cancelled in its current state" };
      }),
  );

  server.registerTool(
    "record_payment",
    {
      title: "Record a payment",
      description: "Record money the business received for a booking: cash, a POS card payment, or a bank transfer. A held bank-transfer booking is confirmed once enough is recorded.",
      inputSchema: z.object({ bookingId: z.string(), amount: z.number().positive().describe("Normal currency units"), method: z.enum(["cash", "pos", "bank_transfer"]) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (input) =>
      run(async () => bookingView(await ok(api.POST("/v1/bookings/{id}/desk-payments", { params: { path: { id: input.bookingId } }, body: { amount: await minor(input.amount), method: input.method } })))),
  );

  server.registerTool(
    "cancel_booking",
    {
      title: "Cancel a booking",
      description: "Cancel a booking under its cancellation terms. Without confirm: true it only shows what would be refunded, so you can check with the person first. Card refunds go back automatically.",
      inputSchema: z.object({ bookingId: z.string(), reason: z.string().max(500).optional(), confirm: z.boolean().default(false).describe("Must be true to actually cancel") }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        const preview = await ok(api.GET("/v1/bookings/{id}/cancellation", { params: { path: { id: input.bookingId } } }));
        if (!input.confirm) {
          return { cancelled: false, wouldRefund: await show(preview.refund), penalty: await show(preview.penalty), next: "Call again with confirm: true to cancel." };
        }
        const result = await ok(api.POST("/v1/bookings/{id}/cancel", { params: { path: { id: input.bookingId } }, body: input.reason ? { reason: input.reason } : {} }));
        const booking = await ok(api.GET("/v1/bookings/{id}", { params: { path: { id: input.bookingId } } }));
        return { cancelled: true, refund: await show(result.refund), penalty: await show(result.penalty), booking: await bookingView(booking) };
      }),
  );

  return server;
}

