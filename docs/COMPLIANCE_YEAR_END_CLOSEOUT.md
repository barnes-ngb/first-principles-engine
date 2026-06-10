# Year-End Compliance Closeout (Missouri)

The MO school year runs July 1 – June 30 (RSMo 167.012). Run this checklist
in the final 2–3 weeks of June every year.

## Targets (per compulsory-age child — currently Lincoln)
- **1,000+ total instructional hours**
- **600+ core hours** (Reading, Language Arts, Math, Social Studies, Science)
- **400+ of those core hours at the regular homeschool location** (app does a
  rough check only — sanity-check this manually)
- **Buffer policy:** do not close the year at the line. Target at least
  **+5–10h over** each threshold (e.g., ≥605–610 core, ≥1,010 total) so a
  later correction can never drop the year below a requirement.

## Checklist
1. [ ] Open **Records → Hours & Compliance**. Record the canonical numbers
   (total / core / by subject) here with the date checked.
2. [ ] If core or total is under the buffer target: log real instructional
   hours through the normal entry paths only (day logs, hours entries,
   Quick Add). Every entry must be attributed (`childId`) — the write
   guards enforce this.
3. [ ] **Freeze window (June 1 – June 30):** no counting-rule, scoping, or
   dedupe change to hours computation. Display-only and hours-neutral
   fixes require explicit owner sign-off that totals cannot move.
4. [ ] Run all exports from Records and save copies to Google Drive
   (outside the app): hours CSV, portfolio markdown, daily log, evaluation
   markdown, zip bundle. These are the at-home records MO requires.
5. [ ] Confirm Firebase scheduled backups are still enabled (console:
   daily, 98-day retention — see ledger DATA-03).
6. [ ] After July 1 (new year, clean slate), open the data-hygiene window:
   - Pull a Firestore export.
   - Verify the DATA-09 migration left zero null-childId adjustments;
     re-attribute 'both' docs to a single child where appropriate
     (remaining DATA-05 scope).
   - DATA-02: dedupe suspect duplicate backfill batches (post-migration
     shape: childId='both').
   - Then proceed to ARCH-10 (rules hardening) on clean data.

## Notes
- Dad Lab credits hours to both children by design (DATA-04).
- Work samples + evaluations are kept at home; never submitted unless
  legally required.

_Last run: 2026-06 (first use)._
