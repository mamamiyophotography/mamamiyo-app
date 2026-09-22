ALTER TABLE "Booking"
ADD COLUMN "invoiceStale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "BookingAuditLog" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookingAuditLog_bookingId_createdAt_idx" ON "BookingAuditLog"("bookingId", "createdAt");
