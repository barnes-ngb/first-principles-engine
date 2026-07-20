# Runbook — Firestore Point-in-Time Recovery (PITR)

Ledger anchor: FEAT-113

## Why

`days` docs (`families/{familyId}/days/{date}_{childId}`) are the **irrecoverable
source of truth** for what school actually happened. Hours are *derived* and
regenerable (Records → **Generate Hours**); day logs are not. The in-app
preservation guard (`src/features/today/dayWriteGuard.ts`) stops a write from
*silently dropping* completed work, but it cannot help against a day doc that is
**destroyed outright**. PITR (7-day recovery window) is the safety net for that
one gap — recommended by the 2026-07-20 P0 audit.

## Enable it (preferred: CI, phone-friendly)

The owner is phone-only and cannot use the Firebase Console, so PITR is enabled
from CI using the same deploy credential the main deploy already uses, mirroring
`create-shop-site.yml`.

1. GitHub mobile app → **Actions** → **"Enable Firestore PITR"** → **Run workflow**.
2. Read the log:
   - `FIRESTORE PITR: ENABLED (7-day recovery window)` → done.
   - **Permission error** → one IAM grant fixes it. Grant the deploy service
     account **Cloud Datastore Owner** (`roles/datastore.owner`, which carries
     the `datastore.databases.update` permission), then re-run. The log names
     this exact role.
3. Re-running after PITR is already on is a safe no-op.

Workflow: `.github/workflows/enable-firestore-pitr.yml`. Project
`barneshome-3dfbb`, database `(default)`.

## Fallback: enable it from the Firebase / GCP Console

If CI cannot be used (e.g. the IAM grant is declined), enable it by hand:

- **GCP Console** → Firestore → **Databases** → select `(default)` → **Backups**
  / **Point-in-time recovery** → toggle **Enable** (7-day window).
- Or via `gcloud` from an authorized machine:
  ```
  gcloud firestore databases update --database="(default)" \
    --enable-pitr --project=barneshome-3dfbb
  ```

## Recovering a destroyed day (deliberate, rare)

PITR only *enables* recovery; it does not restore anything on its own. If a day
doc is ever destroyed, recover within the 7-day window via a deliberate restore
(new database from a timestamp), then copy the recovered doc back:

```
gcloud firestore databases restore \
  --source-database="(default)" \
  --snapshot-time=<RFC3339 timestamp within 7 days> \
  --destination-database=recovery-tmp --project=barneshome-3dfbb
```

Read the recovered `families/{familyId}/days/{docId}` from `recovery-tmp` and
re-write it to the live default database, then delete `recovery-tmp`. This is a
one-off engineering action, not a routine.
