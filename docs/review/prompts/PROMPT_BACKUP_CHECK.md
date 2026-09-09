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

**Numbers in prose are derived, never counted by hand.** Any count this run asserts in a document — files
found, refs remaining, retention windows — must come from a **committed** test or script that derives it
from the source of truth, and the number you write must be the number that script prints; where it cannot be
derived, write the qualifier ("most", "at least N") and say why. See **Numbers in prose are derived, never
counted by hand** in `CLAUDE.md`. Where a figure's source of truth is **outside** the repo (a PR's review
history, a console reading), no committed script can pin it: cite it precisely enough to be audited (PR
number, commit SHA, date) and mark it hand-counted. The case this exists for is a **survey** — a count read across a body of code larger than the change;
a count over the run's own diff is pinned by that diff, so naming the command that prints it is derivation
enough, and a short list is best **named rather than counted**.

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
   `docs: backup proposal (DATA-03)` — proposal only, no deployed code. **Do not merge.** Whatever you run to
   check the tree (`npm run docs:check` at least), **run it on the exact tree you push, after the last edit** —
   a green run from before your final fix is evidence about a tree that no longer exists; and note that a moved
   head also invalidates a pending review ask, which must then be re-made against the new commit.
3. If you opened a PR, run **End of run** below and post the 4-line answer there, under the `CODEX ROUND:`
   first line (an investigation that opened no PR just answers). Either way the answer is: can they recover
   today (yes/no/unknown-pending-console-check), what you recommend, and the single next action for the human.

Remember: do **not** deploy backup infrastructure or change data in this run. Investigate, confirm,
propose. The human decides.

## End of run

A run is not finished when the PR opens; it is finished when the **automated review round on that PR is
answered**. This is the run's last step, and the summary below is the run's **one** summary — do not post a
finish-looking summary before it.

1. **Poll for the Codex round** on a **60–90 second** interval, up to 10 minutes — the ten minutes is the
   **ceiling, not the duration**: act on the first qualifying signal, and a window that has already produced
   its answer is over. **Report once per round, not once per tick** — one line when the round is asked
   (naming the head and the clock time), and one line when it comes back or the window closes. A tick that
   finds nothing is not worth a line; the next line the human reads should be the round's result. **A wall of
   identical status lines is indistinguishable from a hung run to the person reading it** — PR #1817 polled
   three rounds at the old 30-second cadence, produced well over a hundred consecutive lines reading
   "Waiting.", and the owner interrupted the session to ask whether it was looping. Read three things:
   - the PR's **reviews** (`/repos/{owner}/{repo}/pulls/{n}/reviews`);
   - its **inline review threads** (`/pulls/{n}/comments`, or the GraphQL `reviewThreads`) — Codex anchors
     its findings to lines, and `gh pr view <n> --comments` fetches top-level comments and review bodies but
     **no** review threads, so it shows a review that looks empty while every finding sits unread;
   - the PR's **top-level comments** and the **reactions** on the PR and on the comment that asked — because
     a clean round does **not** come back as a review. It arrives as a plain top-level comment from the
     reviewer ("Codex Review: Didn't find any major issues", naming the reviewed commit) or as a 👍 reaction,
     and the review endpoints return neither. Either counts **only when it is the Codex reviewer's own**
     (`chatgpt-codex-connector[bot]`) and belongs to **this** head: when the comment names a reviewed commit,
     that commit must **be** the head you asked about — one naming an older SHA is the previous round
     arriving late, however recent its timestamp — and only when none is named may you fall back to it
     post-dating the ask; a reaction on the PR itself must have been added **within this round's window**.
     A 👍 from a human or another bot is not a review result, and an older one is not this round's.
2. **A round that comes back clean ends the run — go straight to step 5 and stop.** A qualifying clean signal
   closes the round the moment it arrives; don't burn the rest of the window on it. There is **no confirming
   round, no second window, and no re-ask on an unchanged head.**
3. **Address every finding in the same PR**, and push.
4. **Ask for the next round** with an `@codex review` comment — Codex reviews on PR open, on a draft
   going ready, and on that comment, **not** on every push, so without the ask the next window times out
   silently — then poll another window on the same rule, reactions included, against the new head commit.
   **If that round raises a finding, go back to step 3 and repeat 3–4** — up to the cap below. The
   round is done when one comes back clean or a whole window passes with nothing; never stop on an
   unanswered one.

   **The cap follows the size of the change.** Measure the PR at open with
   `git diff --shortstat origin/main...HEAD` and state the figure in the PR body, so the cap is auditable.
   **Changed lines** = insertions + deletions as `--shortstat` reports them; the boundary is **exact**, so
   two runs cannot classify the same PR differently: **under 500 → at most two rounds; 500 or more → at most
   three**. A clean round ends
   the run before either cap (step 2), so the cap only ever binds on a PR that is still raising findings —
   and a small diff still raising real findings at its cap is a diff that should have been two runs. At the
   cap, address what you can, post `CODEX ROUND: open — do not merge yet` naming exactly what is outstanding
   and on which head, and stop. The human decides whether to merge, open a follow-up, or paste the remainder
   into a new run.
5. **Post the summary**, with as its first line one of:
   - `CODEX ROUND: done — safe to merge`
   - `CODEX ROUND: none arrived in 10 min — safe to merge`
   - `CODEX ROUND: open — do not merge yet`

   **On the line after it, state how long each round actually took to come back** (e.g. *"rounds: 6m, 4m,
   clean at 3m"*), so the ceiling can be tuned from evidence rather than guessed again.

   **Your ledger rows' status cells are flipped** to the house `**MERGED** (PR #NNNN, …)` form before the
   run ends — **whatever the round's outcome, including `open — do not merge yet`**, since the human is the
   one who merges and the row reaches `main` only if they do; the *"round N is unreviewed"* fact belongs in
   the **row body** and in this summary's first line, never in the status cell, which `[ledger-status]` reads
   as a claim that the PR is open.

   **Flip in the same push as your last content change** (step 3), so the head that was reviewed is the head
   you hand over — the PR's number is known the moment it opens, so every push answering a round carries the
   flip with it. Exactly one case has no such push: a run whose **first** round came back clean or empty with
   nothing to answer. There the flip is its own final commit, it carries **nothing but the status cell** — no
   code, and no prose the reviewer read — so it does not re-open the round, and this summary names **both**
   commits, the head that was reviewed and the head that carries the flip. Anything more in that commit is a
   content change: push it, ask a fresh round against it (step 4), and poll.

   Either way, before posting: run `node scripts/check-docs-alignment.mjs` and confirm `[ledger-status]`
   reports no row claiming an open PR — **a run must not stop while its own PR is unmergeable**, and that
   check is part of finishing, not part of merging.

Never subscribe to the PR, never schedule a check-in, reminder, wake-up or scheduled task of any kind, and
never stay resident to "watch CI" — CI's result is on the PR page. Then, as the **last action of the run**:
where the harness subscribed the session for you when the PR was created, **unsubscribe** — otherwise the run
stays armed exactly as this protocol exists to prevent — and only **then stop**. If CI fails
after you stop, the human pastes the log into a new run. **A merged PR is never touched again by the run
that opened it**; a fix that is still needed goes on a new branch and PR.

The human merges only a PR whose summary's first line says `safe to merge`.
