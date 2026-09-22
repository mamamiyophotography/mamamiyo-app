CREATE TABLE "AdditionalOrder" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "galleryId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "items" JSONB NOT NULL,
  "total" INTEGER NOT NULL,
  "bonusRetouches" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "invoiceRef" TEXT NOT NULL,
  "invoiceGeneratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdditionalOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdditionalOrder_invoiceRef_key" ON "AdditionalOrder"("invoiceRef");
CREATE UNIQUE INDEX "AdditionalOrder_galleryId_version_key" ON "AdditionalOrder"("galleryId", "version");
CREATE INDEX "AdditionalOrder_bookingId_createdAt_idx" ON "AdditionalOrder"("bookingId", "createdAt");
