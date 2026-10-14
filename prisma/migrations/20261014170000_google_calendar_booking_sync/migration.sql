ALTER TABLE "Booking"
ADD COLUMN "googleCalendarEventId" TEXT,
ADD COLUMN "googleCalendarEventUrl" TEXT,
ADD COLUMN "googleCalendarSyncedAt" TIMESTAMP(3);
