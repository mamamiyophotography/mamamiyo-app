-- Existing post-shoot bookings without a linked Gallery are still waiting for
-- the photographer to finish Basic Retouch. Keep bookings that already have a
-- Gallery in the client-selection stage.
UPDATE "Booking" AS b
SET "status" = 'pending_basic_retouch'
WHERE b."status" = 'basic_retouch'
  AND NOT EXISTS (
    SELECT 1
    FROM "GalleryInbox" AS g
    WHERE g."bookingId" = b."id"
  );
