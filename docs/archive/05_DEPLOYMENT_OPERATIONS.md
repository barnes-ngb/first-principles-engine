# Phase 5 — Deployment + Operations ✅
Date: 2026-02-07

## Objective
Make it reliable and safe long-term.

## In-Scope Deliverables
- [x] Hosting — Firebase Hosting configured (`firebase.json`), GitHub Actions deploy pipeline (`deploy.yml`)
- [x] Auth — Anonymous sign-in on first visit, Email/Password upgrade path (Settings > Account)
- [x] Firestore rules — `firestore.rules` scopes reads/writes to authenticated user's family
- [x] Storage rules — `storage.rules` updated to require auth + match familyId
- [x] Runbook — `docs/RUNBOOK.md` covers deploy, key rotation, backups, adding children/ladders

## Acceptance Criteria
- [x] One-click deploy pipeline (`npm run deploy` or push to `deploy` branch)
- [x] Auth + rules prevent public reads/writes (anonymous sign-in auto-creates session; Firestore/Storage rules require `request.auth.uid == familyId`)
- [x] Backup/export process is documented and doable (Firestore export via gcloud + in-app CSV/MD exports)

## Implementation Notes

### Auth Flow
1. App loads → `AuthProvider` listens to `onAuthStateChanged`
2. No user → auto `signInAnonymously()` (zero friction)
3. User's UID becomes `familyId` → all data under `families/{uid}/`
4. Upgrade to Email/Password via Settings > Account (preserves UID + data)
5. Sign out → new anonymous session

### Security Rules
- Firestore: `request.auth.uid == familyId` on all `families/{familyId}/**` paths
- Storage: same UID check + 25 MB size limit + content type validation
- Default deny on all other paths

### Deploy Options
- `npm run deploy` — full deploy (build + hosting + rules)
- `npm run deploy:hosting` — hosting only
- `npm run deploy:rules` — Firestore + Storage rules only
- Push to `deploy` branch — CI/CD via GitHub Actions
