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
3. If you opened a PR, run **End of run** below and post the 4-line answer there, under the `CODEX ROUND:`
   first line (an investigation that opened no PR just answers). Either way the answer is: can they recover
   today (yes/no/unknown-pending-console-check), what you recommend, and the single next action for the human.

Remember: do **not** deploy backup infrastructure or change data in this run. Investigate, confirm,
propose. The human decides.

## End of run

A run is not finished when the PR opens; it is finished when the **automated review round on that PR is
answered**. This is the run's last step, and the summary below is the run's **one** summary — do not post a
finish-looking summary before it.

1. **Poll for the Codex round**, up to 10 minutes, reading three things:
   - the PR's **reviews** (`/repos/{owner}/{repo}/pulls/{n}/reviews`);
   - its **inline review threads** (`/pulls/{n}/comments`, or the GraphQL `reviewThreads`) — Codex anchors
     its findings to lines, and `gh pr view <n> --comments` fetches top-level comments and review bodies but
     **no** review threads, so it shows a review that looks empty while every finding sits unread;
   - the **reactions** on the PR and on the comment that asked for the round — Codex signals *reviewed,
     nothing to say* with a 👍 rather than a review, and no review endpoint returns that. It counts **only
     when the reaction is the Codex reviewer's own** (`chatgpt-codex-connector[bot]`) and, on the PR itself,
     was added **within this round's window**: a 👍 from a human or another bot is not a review result, and
     an older one is not this round's. A qualifying 👍 closes the round clean immediately; don't burn the
     rest of the window on it.
2. **If the round raised no findings, go straight to step 5.** Never re-ask for a review of an unchanged head.
3. **Address every finding in the same PR**, and push.
4. **Ask for the next round** with an `@codex review` comment — Codex reviews on PR open, on a draft going
   ready, and on that comment, **not** on every push, so without the ask the next window times out silently
   — then poll another full 10-minute window, reactions included, against the new head commit. **If that
   round raises a finding, go back to step 3 and repeat 3–4** — as many times as it takes. The round is done
   when one comes back clean or a whole window passes with nothing; never stop on an unanswered one.
5. **Post the summary**, with as its first line one of:
   - `CODEX ROUND: done — safe to merge`
   - `CODEX ROUND: none arrived in 10 min — safe to merge`
   - `CODEX ROUND: open — do not merge yet`

Then **stop**. Do not subscribe to the PR, do not schedule a check-in, reminder, wake-up or scheduled
task of any kind, and do not stay resident to "watch CI" — CI's result is on the PR page. If CI fails
after you stop, the human pastes the log into a new run. **A merged PR is never touched again by the run
that opened it**; a fix that is still needed goes on a new branch and PR.

The human merges only a PR whose summary's first line says `safe to merge`.
