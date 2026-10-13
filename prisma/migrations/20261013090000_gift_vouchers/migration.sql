CREATE TABLE "GiftVoucher" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purchaserName" TEXT NOT NULL,
    "purchaserEmail" TEXT NOT NULL,
    "purchaserPhone" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "sessionTypeId" TEXT NOT NULL,
    "sessionLabel" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GiftVoucher_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GiftVoucher_code_key" ON "GiftVoucher"("code");
CREATE INDEX "GiftVoucher_status_idx" ON "GiftVoucher"("status");
CREATE INDEX "GiftVoucher_purchaserEmail_idx" ON "GiftVoucher"("purchaserEmail");
ALTER TABLE "Booking" ADD COLUMN "voucherCode" TEXT,
ADD COLUMN "voucherAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "voucherId" TEXT;
CREATE UNIQUE INDEX "Booking_voucherId_key" ON "Booking"("voucherId");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "GiftVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
