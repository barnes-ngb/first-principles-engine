# PROMPT — Backup & Restore Check (one-time, do this first)

> **Run in:** Claude Code web, on the repo. **One-time investigation** (re-run anytime to re-verify).
> **Closes:** ledger item **DATA-03**.
> **Why first:** the app is Lincoln's legal Missouri school record. Every other fix assumes the data
> still exists. This confirms it's recoverable before we touch anything else.
> **Environment:** phone-first. You (Claude Code web) do all the work in your own environment. Never
> ask the human to run a command — they only paste, upload, and review/merge.

---

You are answering one question: **if the Firestore data were lost or corrupted tomorrow, could the
Barnes family get it back?** Then you make the cheapest reliable fix if the answer is no.

## Step 1 — Inventory what exists in the repo

Search the whole repo (root, `functions/`, `firebase.json`, `.firebaserc`, any `scripts/`) for any of:
- scheduled Firestore export (`gcloud firestore export`, `exportDocuments`, a scheduled CF using `@google-cloud/firestore` admin export)
- a backup Cloud Function or cron/Pub-Sub schedule writing to a GCS bucket
- documented manual backup steps in `docs/08_RUNBOOK.md` or any runbook
- point-in-time-recovery (PITR) configuration

Report exactly what you find, with file paths. State plainly whether the repo configures **any**
automated backup. (Expected, per DATA-03: it does not — the runbook mentions backups but nothing
implements them.)

## Step 2 — Note what you cannot see

You can only see the repo, not the live Google Cloud project. Two backup mechanisms can exist
**outside** the repo and you must call them out as unknowns for the human to confirm in the Firebase/GCP console:
- **Firestore PITR** (Point-in-Time Recovery) — a console toggle, gives 7 days of recovery.
- **Scheduled backups / managed exports** — configured in the console or via `gcloud`, not necessarily in the repo.

Write a 2-line note: "Confirm in console: is PITR on? Are scheduled backups configured?" so the human
can check from their phone. Do not assume either way.

## Step 3 — Recommend the cheapest reliable backup (if repo has none)

If the repo configures no backup, propose the lowest-effort durable option, in this order of preference:
1. **Enable Firestore PITR + scheduled backups in the console** — zero code, managed by Google, 7-day
   PITR + daily backups. This is almost certainly the right answer for a single-family app. Write the
   exact console path / `gcloud` command the human (or you, if you have project access) would use.
2. **A scheduled Cloud Function** that calls the admin export API to a GCS bucket weekly — only if
   console-managed backups are unavailable on the plan. If you propose this, include the function
   skeleton, the schedule, the bucket, and the IAM role needed — but **do not deploy it**; leave it as
   a reviewable proposal.

Whichever you recommend, also confirm the data **export** path that already exists for compliance
(`handleExportHoursCsv` + `handleExportPortfolioMd` in `RecordsPage.tsx`) still works — that's the
human-readable record, separate from a full-database backup. Note the distinction: export = "give the
state a printable copy"; backup = "survive a data disaster."

## Step 4 — Write it up

1. Update ledger item **DATA-03** in `docs/review/REVIEW_HOME_BASE.md`:
   - If a backup exists → status `FIXED`, with what/where.
   - If none exists → keep `OPEN`, append the recommended option and the console-confirmation note.
2. If you wrote a code proposal (option 2), put it in a `docs:` PR titled
   `docs: backup proposal (DATA-03)` — proposal only, no deployed code. **Do not merge.**
3. End with a 4-line answer to the original question: can they recover today (yes/no/unknown-pending-
   console-check), what you recommend, and the single next action for the human.

Remember: do **not** deploy backup infrastructure or change data in this run. Investigate, confirm,
propose. The human decides.
