-- Read-only order aggregation. All bookings shown separately from the consented subset.
-- Cohort by creation date; confirmed means paid deposit and confirmed status, not full payment.
SELECT date_trunc('week', "createdAt") AS cohort,
       COALESCE("analyticsAttribution"->>'source','unattributed') AS source,
       COALESCE("analyticsAttribution"->>'medium','unattributed') AS medium,
       "sessionTypeId" AS package_type,
       COUNT(*) AS submitted,
       COUNT(*) FILTER (WHERE "depositStatus"='paid' AND "status"<>'cancelled') AS confirmed,
       ROUND(100.0 * COUNT(*) FILTER (WHERE "depositStatus"='paid' AND "status"<>'cancelled') / NULLIF(COUNT(*),0),2) AS submit_to_confirm_percent,
       SUM("depositAmount") FILTER (WHERE "depositStatus"='paid' AND "status"<>'cancelled') AS deposit_received_sgd
FROM "Booking"
WHERE "createdAt">=CURRENT_DATE-INTERVAL '90 days'
  AND COALESCE(("analyticsAttribution"->>'test')::boolean,false)=false
  AND "bundleSessionNumber" IS DISTINCT FROM 2 AND "bundleSessionNumber" IS DISTINCT FROM 3
GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;
