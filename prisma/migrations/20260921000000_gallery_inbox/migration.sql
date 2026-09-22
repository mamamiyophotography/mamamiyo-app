CREATE TABLE "GalleryInbox" (
  "galleryId" TEXT PRIMARY KEY,
  "bookingId" TEXT NOT NULL REFERENCES "Booking"("id"),
  "version" INTEGER NOT NULL,
  "items" JSONB NOT NULL,
  "submitted" BOOLEAN NOT NULL DEFAULT false,
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "deliveredAt" TIMESTAMP(3),
  "emailKey" TEXT,
  "emailSentAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "GalleryInbox_bookingId_idx" ON "GalleryInbox"("bookingId");
