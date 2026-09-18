ALTER TABLE "Booking"
ADD COLUMN "balancePaidAt" TIMESTAMP(3),
ADD COLUMN "furtherRetouchReminderSentAt" TIMESTAMP(3);

-- Existing paid Basic Retouch records do not have an exact payment timestamp.
-- Start their one-month reminder window from deployment to avoid immediate mail.
UPDATE "Booking"
SET "balancePaidAt" = CURRENT_TIMESTAMP
WHERE "balanceStatus" = 'paid'
  AND "status" IN ('pending_balance', 'basic_retouch')
  AND "balancePaidAt" IS NULL;
