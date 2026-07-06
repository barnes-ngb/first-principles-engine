# Operational Runbook

## Prerequisites

- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`
- Authenticated: `firebase login`
- Project selected: `firebase use barneshome-3dfbb`

---

## Deploy

### Full deploy (hosting + rules)

```bash
npm run deploy
```

This builds the app and deploys hosting, Firestore rules, and storage rules.

### Hosting only

```bash
npm run deploy:hosting
```

### Rules only (Firestore + Storage)

```bash
npm run deploy:rules
```

### CI/CD (automatic)

Push to the `deploy` branch to trigger the GitHub Actions pipeline. It runs lint, tests, build, then deploys hosting, Firestore rules + indexes, Storage rules + CORS, and (when `functions/` or `firestore.indexes.json` changed) Cloud Functions.

### CI/CD (manual trigger)

Use this when functions need to be redeployed without a code push — e.g., to ship Cloud Functions that were already merged but haven't deployed yet.

1. Go to https://github.com/barnes-ngb/first-principles-engine/actions
2. Click **Deploy to Firebase** in the left sidebar
3. Click **Run workflow** (top right), select the `deploy` branch, then click the green **Run workflow** button

Manual runs always deploy Cloud Functions in addition to hosting + rules (the change-detection check is bypassed). Logs for deployed functions live at https://console.firebase.google.com/project/barneshome-3dfbb/functions.

---

## Environment Variables

All Firebase config values are injected at build time via Vite. They must start with `VITE_`.

- **Local dev:** Copy `.env.example` to `.env` and fill in values from the Firebase Console.
- **CI/CD:** Set as GitHub repository secrets (see `.github/workflows/deploy.yml`).

| Variable | Source |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Console > Project Settings |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Console > Project Settings |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Console > Project Settings |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Console > Project Settings |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Console > Project Settings |
| `VITE_FIREBASE_APP_ID` | Firebase Console > Project Settings |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase Console > Project Settings (optional) |
| `FIREBASE_SERVICE_ACCOUNT` | GitHub secret — JSON key for CI deploy |

---

## Key Rotation

### Firebase API Key

1. Go to Google Cloud Console > APIs & Services > Credentials
2. Create a new API key with the same restrictions
3. Update the `VITE_FIREBASE_API_KEY` in `.env` (local) and GitHub Secrets (CI)
4. Redeploy: `npm run deploy:hosting`
5. Delete the old key once the new deploy is live

### Firebase Service Account (CI)

1. Go to Google Cloud Console > IAM & Admin > Service Accounts
2. Create a new key for the existing service account (JSON)
3. Update the `FIREBASE_SERVICE_ACCOUNT` GitHub secret with the new JSON
4. Delete the old key

---

## Backups

### Firestore Export

```bash
gcloud firestore export gs://barneshome-3dfbb.appspot.com/backups/$(date +%Y-%m-%d)
```

### Firestore Import (restore)

```bash
gcloud firestore import gs://barneshome-3dfbb.appspot.com/backups/YYYY-MM-DD
```

### Manual Data Export

Use the Records page in the app to export:
- Hours Summary CSV
- Daily Log CSV
- Evaluations Markdown
- Portfolio Index Markdown

These are client-side exports and don't require Firebase Admin access.

---

## Adding a Child

1. Open the app and navigate to **Settings**
2. Seed demo data (if starting fresh), or use the Firebase Console:
   - Go to Firestore > `families/{familyId}/children`
   - Add a document with fields: `name` (string), `birthdate` (string, optional), `grade` (string, optional)

---

## Adding / Editing Ladders

1. Go to Firestore Console > `families/{familyId}/ladders`
2. Create a new document with:
   - `childId`: the child's document ID
   - `title`: ladder name (e.g., "Reading Fluency")
   - `domain`: category (e.g., "Language Arts")
   - `rungs`: array of objects, each with `id`, `title`, `description`, `order`, `proofExamples`

---

## Authentication

The app uses Firebase Authentication:

- **Anonymous sign-in** happens automatically on first visit (zero friction)
- **Email/Password upgrade** is available in Settings > Account
- The user's UID becomes their `familyId` — all data is stored under `families/{uid}/`
- Upgrading from anonymous to email/password preserves the same UID and all data

### Firestore Rules

- Only authenticated users can read/write
- Users can only access `families/{uid}/*` where `uid` matches their auth UID
- See `firestore.rules` and `storage.rules`

---

## Firestore Indexes

All queries use single-field range or equality filters, which Firestore auto-indexes. The `firestore.indexes.json` file declares explicit `fieldOverrides` for the fields used in scoped queries:

| Collection | Field | Used by |
|---|---|---|
| `artifacts` | `dayLogId` | TodayPage (equality) |
| `artifacts` | `createdAt` | EnginePage, RecordsPage, EvaluationsPage, PortfolioPage (range) |
| `milestoneProgress` | `achievedAt` | EnginePage (range) |
| `hours` | `date` | RecordsPage (range) |
| `days` | `date` | RecordsPage (range) |
| `hoursAdjustments` | `date` | RecordsPage (range) |
| `evaluations` | `monthStart` | RecordsPage (range) |

Deploy indexes:

```bash
firebase deploy --only firestore:indexes
```

No composite indexes are currently required (all queries filter on a single field).

---

## Monitoring

- **Firebase Console > Hosting** — view deploy history, traffic
- **Firebase Console > Firestore > Usage** — read/write counts, storage
- **Firebase Console > Authentication > Users** — active users
- **GitHub Actions** — check workflow runs for deploy status

---

## Cloud Function resource limits (AI + vision)

The shared `chat` Cloud Function (`functions/src/ai/chat.ts`) fans out every AI
chat task, including the vision-extraction path used by Shelly Chat uploads and
the Foundations Review Chat photo upload (FEAT-53/61). It runs with explicit
headroom:

- `timeoutSeconds: 300` (5 min) and `memory: "1GiB"`.

Client callers set their own, **shorter** ceilings so the client always gets the
first honest word before the function is force-killed:

- `useAI` callable timeout: `300_000` ms (matches the function; the backstop).
- Foundations Review upload: a hard **120s** `withTimeout` on the extraction call
  (`src/features/foundations-review/uploadTimeout.ts`) — well under 300s. On
  expiry the user sees "That took too long — try fewer photos", not a silent spin.

FEAT-61 verified this config already provides ample headroom (the earlier report
of "defaults" was stale); no reduction was made — dropping memory below 1GiB
would risk large multi-image vision requests. Client photos are downscaled to a
1600px longest edge before upload (`downscaleImage`), and the upload dialog caps a
message at 4 photos, so the request the function receives is bounded.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Deploy fails in CI | Check `FIREBASE_SERVICE_ACCOUNT` secret is valid JSON |
| "Permission denied" in app | Verify Firestore/Storage rules are deployed (`npm run deploy:rules`) |
| Blank page after deploy | Check that env vars are set in the deploy workflow |
| Auth not working | Ensure Anonymous + Email/Password providers are enabled in Firebase Console > Authentication > Sign-in method |
