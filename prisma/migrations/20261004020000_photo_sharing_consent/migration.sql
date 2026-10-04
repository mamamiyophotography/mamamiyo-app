ALTER TABLE "Booking"
ADD COLUMN "photoSharingConsent" TEXT NOT NULL DEFAULT 'not_recorded',
ADD COLUMN "photoSharingConsentAt" TIMESTAMP(3);
