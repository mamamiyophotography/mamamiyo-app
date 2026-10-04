# Production tracking status — 2026-10-04

Completed: encrypted production backup, reviewed additive analytics migration with unchanged booking count, Squarespace consent-based single tag, production deployment, GA4 cross-domain and privacy configuration, server MP secret, developer exclusion, key event and five custom dimensions.

Property: Mamamiyo Photography, account 271826890, property 381340771; stream 5340766757; G-46ZYQWWCYP. Production: https://book.mamamiyo-photography.com/book. Final deployment dpl_CgLbAbCpCYWMxfzABoz6vG5MGxLR Ready. All three analytics flags enabled; GA4_API_SECRET is Vercel Secret, never in client source. Temporary secret files removed.

Cross-domain acceptance: official _gl present on website→booking navigation; client ID SHA-256 fingerprints equal. Source, medium, package and landing handoff verified. Real DebugView received page_view, package_view, booking_click and booking_start. Strict MP validation returned zero messages; synthetic booking_confirmed received in DebugView with package newborn and value_basis synthetic_test, value zero. No production booking or notification created. The first attempt with an unestablished synthetic client was HTTP accepted only; successful ingestion was verified separately after establishing a client via gtag.js.

GA4: enhanced measurement off; email and ten query keys redacted. booking_confirmed key event, once per event, no default value. Custom dimensions package_type/source/medium/landing_page/value_basis saved. User and event retention remains verified 14 months; notice accurately says this. App analytics retention daily task set to90days. Existing CRON_SECRET is configured on Vercel but unavailable locally, so maintenance endpoint was not manually invoked.

Tests: analysis privacy/consent/dedupe/test suppression suite passed, including debug attribution marked test; existing business verification passed with notification dry runs. Final Vercel build and deployment passed. Existing Next config skips full type checks; earlier unrelated full tsc failures remain.

Limitation: real end-to-end booking_submit and paid-deposit confirmation were not exercised with a production order. They are covered by isolated tests, and should be reconciled after the first real consented booking. PayNow has no automatic payment webhook; confirmed means administrator-confirmed deposit received, not full payment. A preselected-package consent timing issue found during acceptance was fixed: analytics readiness rechecks the visible package without duplication.

Evidence: debugview-browser-events.jpg, debugview-server-confirmed.jpg, debug-filter-active.jpg, key-event-saved.jpg, custom-dimensions-saved.jpg, cross-domain-saved.jpg. Detailed Chinese handover: DELIVERY.md.
