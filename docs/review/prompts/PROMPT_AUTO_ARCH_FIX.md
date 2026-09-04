# PROMPT — Autonomous Architecture Fix (inspect-first, one issue)

> **Used by:** the "Bigger architecture fixes" routine. Point the routine's prompt at this file:
> *"Read `docs/review/prompts/PROMPT_AUTO_ARCH_FIX.md` and execute it fully."*
> **Cadence:** weekly (its current Saturday slot is fine).
> **Contract:** inspect before touching anything; fix at most **one** ledger item; **branch + PR, never
> merge**; never touch an invariant or human-claimed work. Phone-first — do all build/git yourself.

---

You are the autonomous architecture-fix routine. You **inspect first, then fix** — and only safe,
decision-free work. Anything needing a human judgment call you leave alone.

## Step 1 — Select one item (and skip what isn't yours)
Read `docs/review/REVIEW_HOME_BASE.md` §6. Choose the **single highest-priority `OPEN` `ARCH-` or
`TEST-` row** that is **all** of:
- **not** `IN PROGRESS` / `FIXED` / `NEEDS-DATA` / `WONTFIX` (those are claimed, done, or parked);
- **not** invariant-touching — skip anything that would change `hours`/compliance math, `xpLedger`,
  `skillSnapshots`, the charter preamble, or `firestore.rules`;
- **not** build-chat-owned — skip `ARCH-10`, `FEAT-*`, and any portal/`FUNC-*` row;
- **decision-free** — a decomposition, dead-code removal, migration completion, or test fix. If the item
  needs a provider/design/scope choice (e.g. picking an error-reporting service, a bundle-split
  strategy), it's a **human** call — skip it.

If nothing qualifies, do nothing this run and say so. Don't invent work.

## Step 2 — Claim it
Immediately set the chosen row to `IN PROGRESS` (note: "auto-fix routine, <date>") and push that ledger
update first, so a concurrent human run won't grab the same item. If you can't claim cleanly, stop.

## Step 3 — Establish a green baseline
Run root + functions lint/tsc/tests yourself. If red, stop and report — don't stack onto a broken tree.

## Step 4 — Inspect (this is the gate)
Read every file the item touches. Confirm it still reproduces. Map the blast radius (importers,
state, current tests). For a decomposition, name the exact seams and confirm the public surface stays
identical. **If inspection reveals it actually touches an invariant or needs a decision you didn't catch
in Step 1 → revert the claim to `OPEN`, write a one-paragraph proposal into the ledger row, and stop.**

## Step 5 — Fix (only decision-free, behavior-preserving)
Make the smallest change that closes it. Preserve behavior exactly (no observable contract change).
Add/keep tests proving it. No new heavy dependencies (bundle is tracked debt).

## Step 6 — Verify & PR
Green before and after. Branch `auto/arch-<id>-<slug>`. PR `fix(<area>): <id> — <desc> (auto)`.
**Do not merge.** Update the ledger row to `IN PROGRESS` with the PR link. End with a 4-line summary:
the item, what changed, before/after evidence, and confirmation no invariant was touched. A green run
status means it executed, not that it's correct — the human reviews the PR.

## End of run

A run is not finished when the PR opens; it is finished when the **automated review round on that PR is
answered**. After opening the PR: wait for the Codex review (poll the PR's reviews/comments every 60 s,
up to 10 minutes — `gh pr view <n> --comments`, or the PR API), address every finding it raises **in the
same PR**, push, and poll once more for a follow-up round. Then post the run summary with, as its first
line, one of:

- `CODEX ROUND: done — safe to merge`
- `CODEX ROUND: none arrived in 10 min — safe to merge`
- `CODEX ROUND: open — do not merge yet`

Then **stop**. Do not subscribe to the PR, do not schedule a check-in, reminder, wake-up or scheduled
task of any kind, and do not stay resident to "watch CI" — CI's result is on the PR page. If CI fails
after you stop, the human pastes the log into a new run. **A merged PR is never touched again by the run
that opened it**; a fix that is still needed goes on a new branch and PR.

The human merges only a PR whose summary's first line says `safe to merge`.
