ALTER TABLE "Booking" ADD COLUMN "analyticsReference" TEXT, ADD COLUMN "analyticsAttribution" JSONB;
CREATE UNIQUE INDEX "Booking_analyticsReference_key" ON "Booking"("analyticsReference");
CREATE TABLE "AnalyticsOutbox" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventKey" TEXT NOT NULL UNIQUE,
  "bookingId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "deliveryStatus" TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX "AnalyticsOutbox_claimedAt_idx" ON "AnalyticsOutbox"("claimedAt");
