# Mamamiyo Photography — Booking App (Production)

This is the real backend + frontend build, following the plan in
`mamamiyo-backend-technical-scope.md`. Companion doc:
`photoshoot-booking-app-requirements.md` for the confirmed business rules.

**Status: functionally complete.** Every planned page, API route, and admin tab is built and
tested. Two things remain genuinely open — both are flagged explicitly below, not glossed over.

**Launching email-only.** WhatsApp is fully designed and ready to plug in the moment the Twilio/
Meta approval clears — see "Adding WhatsApp later" below.

## What's built

**Foundation, notifications, booking API:** database schema; core business logic (pricing,
PayNow QR, availability/buffers, session catalog); the complete booking lifecycle service — all
ported from the prototype, including a genuine improvement over it: booking creation runs in a
real DB transaction with a slot-clash check, closing a race condition the prototype could only
flag.

**Client-facing pages:**
- `/book` — package selection, calendar with weekend/PH surcharge highlighting, add-ons, details
  form with photo upload, discount codes, review ticket, live PayNow QR
- `/lookup` — phone-based booking lookup, including the full bundle redemption flow (finding an
  activated bundle, picking a date for session 2/3, add-ons, confirming)

**Admin dashboard** (protected by a lightweight signed-cookie session — HMAC-SHA256 via the Web
Crypto API, appropriate for a single-admin app):
- **Bookings** — status-filtered list, full detail, every action (confirm deposit, mark done,
  Final Bill panel, confirm balance, cancel)
- **Availability**, **Discounts**, **Bundles**, **Settings** — all fully built, not placeholders

**Security hardening done this pass:** the public, unauthenticated `/api/bookings/[id]/cancel`
route now requires the caller to supply the phone number the booking was made under, verified
against the stored `clientPhone` before cancelling — closing a real gap where anyone who
knew/guessed a booking ID could cancel someone else's session. The admin-side cancel route
(session-protected) is unaffected and still works without this check. Covered by 3 new automated
tests (wrong phone rejected, booking stays active, correct phone in a different format still
matches).

**UX cleanup done this pass:** replaced jarring `alert()` popups (in the admin bookings actions
and the client cancel flow) with proper inline error banners shown in context.

### Two real bugs caught and fixed during this build — worth knowing about

1. **Edge Runtime incompatibility.** `src/lib/auth/session.ts` originally used Node's `crypto`
   module. Next.js runs middleware in the **Edge Runtime** by default, which doesn't have Node's
   built-ins — `next build` failed the first time it was run. Fixed by rewriting session
   signing/verification to use only the **Web Crypto API** (`crypto.subtle`).
2. **A duplicate object-literal property** in the bookings dashboard — TypeScript caught it as a
   compile error before it could silently misbehave at runtime.

Both were caught by actually running the build and type-checker, not by inspection.

### How everything was verified

`tsc --noEmit` and `next build`'s compile step both succeed across the **entire** codebase except
one single, well-understood line — `src/lib/db/client.ts`'s import of the real generated
`PrismaClient` type, which needs `prisma generate` run somewhere with internet access to
`binaries.prisma.sh` (not available in this sandbox). Confirmed to be exactly that gap and
nothing more by temporarily stubbing Prisma's types just long enough to prove the rest of the
project type-checks cleanly given a real client (not shipped; removed immediately after).

The booking service's logic is verified with 26 checks (up from 22 — added ownership-check
coverage this pass) against a lightweight in-memory mock satisfying the same `Db` interface a
real `PrismaClient` satisfies — see `src/lib/db/mockDb.ts` and
`scripts/verify-booking-service.ts`. `npm run verify` runs all 70 checks across the whole app.

## What's genuinely still open — not "finished," by necessity

- **File upload to Supabase Storage** (`src/lib/storage.ts`) — written correctly against
  Supabase's documented SDK, but **cannot be verified from this sandbox**, which has no network
  path to Supabase at all (unlike Resend, which is at least reachable in principle). This isn't a
  scope choice — it's a hard constraint of the environment this was built in. **Before this
  handles a real booking: upload one real file through `/api/upload` against a real Supabase
  project and confirm the returned URL actually loads.** Nothing else should be assumed working
  until that one test passes.
- **Visual design polish** — ports the confirmed color palette and layout logic faithfully, but
  hasn't had the detailed, iterative styling pass the prototype went through (that took many
  rounds of back-and-forth on spacing, typography, and specific component behavior). This is
  open-ended creative work, not a fixed checklist — flagging it as a deliberate stopping point
  rather than continuing to guess at design decisions that should involve the person running the
  business.

## Adding WhatsApp later (when Twilio/Meta approval clears)

1. Fill in `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` in `.env`
2. Open `src/lib/whatsapp.ts` — replace the stub body with the real Twilio call (exact code is in
   a comment at the top of that file)
3. Nothing else needs to change.

## Setup, in order

1. **Install dependencies**: `npm install`
2. **Create a Supabase project** (free tier). Copy the connection string into `.env` as
   `DATABASE_URL`. Create a public storage bucket named `reference-photos`.
3. **Push the schema**: `cp .env.example .env` (fill in `DATABASE_URL`), then `npm run db:push`
4. **Sign up for Resend**, set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PHOTOGRAPHER_EMAIL`,
   `PHOTOGRAPHER_PHONE` in `.env`
5. **Set up admin login**: `ADMIN_EMAIL`; `ADMIN_PASSWORD_HASH` (run
   `npx tsx scripts/hash-password.ts "your-chosen-password"`); `ADMIN_SESSION_SECRET` (e.g.
   `openssl rand -base64 32`)
6. **Run the verification suite** (works without a database): `npm run verify`
7. **Run it locally**: `npm run dev` — visit `/book`, `/lookup`, and `/admin/login`
8. **Smoke-test file upload** — see the flagged gap above, do this before anything else
9. **Deploy**: push to GitHub, import in Vercel, add the same `.env` variables there
10. **Point the domain**: CNAME `book.mamamiyo-photography.com` → Vercel

## Notes for whoever picks this up next (including a future me)

- Don't recompute pricing/PayNow/availability/notification-wording logic inline anywhere — import
  from `src/lib/`.
- Run `npm run verify` after any change to `src/lib/` — catches regressions in seconds.
- If you add anything to `middleware.ts` or anything it imports, remember it runs in the **Edge
  Runtime** — no Node built-ins, only Web-standard APIs. Run `next build` (not just `tsc`) to
  actually catch violations.
- Session types/pricing are hardcoded in `constants.ts` — worth moving to an editable database
  table + dashboard UI given how often these changed during prototyping.
