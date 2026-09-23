ALTER TABLE "GalleryInbox"
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "selectionEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "selectionReminderSentAt" TIMESTAMP(3),
ADD COLUMN "expiryReminderSentAt" TIMESTAMP(3),
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "GalleryInbox_expiresAt_idx" ON "GalleryInbox"("expiresAt");
