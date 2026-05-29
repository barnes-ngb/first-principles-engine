# PROMPT — Fix Runner (one issue at a time)

> **Run in:** Claude Code web, on the repo. **Manual, on demand.**
> **Usage:** paste this file, then on the last line set `ISSUE_ID:` to one ID from the ledger.
> Example final line: `ISSUE_ID: ARCH-01`
> **One issue per run.** Small, reviewable PRs. Never merge — leave for human review.
> **Environment:** phone-first; the human does not run anything locally. You (Claude Code web) run all builds/lint/tests/git yourself. Never ask the human to run a command — their only actions are pasting this prompt, uploading files, and reviewing/merging the PR.

---

You are closing exactly one issue from the review ledger. Work carefully; this codebase runs a real
family's homeschool and its compliance records.

## Guardrails (read first)

- **Never auto-fix anything touching an invariant** without an explicit human go-ahead in the run:
  the **additive-hours rule**, the **XP/diamond ledger**, **MO compliance math**, or the **charter
  preamble**. If the assigned issue touches one of these, stop after the proposal step and ask.
- **Never merge.** Branch + PR + summary. Review-before-merge is the rule.
- **No new heavy dependencies** without flagging it. Bundle size is already a tracked problem (ARCH-05).
- **Honor the ethos** in any user-facing change: no scores/grades, no pace/shame language, taps over typing, voice-first for the boys.

## Step 0 — Load the issue

1. Read `docs/review/REVIEW_HOME_BASE.md`; find the row matching `ISSUE_ID`.
2. Read the latest `docs/review/ARCHITECTURE_AUDIT_<...>.md` if it elaborates the issue.
3. Restate, in your own words: what's wrong, where, why it matters, and which priority band it's in.
4. If the issue is `NEEDS-DATA` or requires a live Firestore export, stop and say so — it can't be closed from the repo alone.

## Step 1 — Establish a green baseline

Run these yourself in your environment (do not ask the human to run anything):

```bash
npm run lint
npx tsc -b
npx vitest run
cd functions && npm run lint && npx tsc --noEmit && npm test && cd ..
```

If baseline is red, fix the baseline first or report it — do not stack a change on a broken tree.

## Step 2 — Inspect & validate

- Read every file the issue touches. Map the blast radius: who imports this, who reads/writes this state, what tests cover it today.
- Confirm the issue still reproduces / still holds (line counts, refs, behavior). If it's already resolved, mark it `FIXED` in the ledger with a note and stop.
- For decomposition issues: name the exact seams (which components/hooks/pure-logic modules come out), and confirm the split preserves behavior (no prop or state contract changes the caller can see).

## Step 3 — Decide: fix now, or propose

- **Mechanical / low-risk / well-tested area** → implement (Step 4).
- **Invariant-touching, or design-level (e.g. FUNC-01 source-of-truth), or large architectural (e.g. ARCH-05 bundle split)** → write the proposal into the dated audit report + ledger, open a `docs:` PR with the proposal only, and stop. These get a human decision in the home-base chat first.

## Step 4 — Implement (only if Step 3 says fix now)

- Make the smallest change that fully closes the issue. Branch name: `fix/<issue-id>-<slug>` (e.g. `fix/arch-01-extract-quest-prompt`).
- For decompositions: extract to new files, keep the public surface identical, leave the shell importing the parts.
- **Add or update tests** proving the fix — especially for TEST-01 targets and anything with logic.
- Update any doc that referenced the old structure (`CLAUDE.md` paths, `MASTER_OUTLINE.md`, `DOCUMENT_INDEX.md`).

## Step 5 — Verify

Re-run the full Step 1 suite. All green, or the run isn't done. Report the before/after of whatever
the issue measured (line counts, bundle size, test count, etc.).

## Step 6 — Close out

1. Open a PR: `fix(<area>): <issue-id> — <short description>`. Include before/after evidence and the test results. **Do not merge.**
2. Update the ledger row in `docs/review/REVIEW_HOME_BASE.md` → status `IN PROGRESS` (PR open, awaiting review) with the PR link.
3. End with a 4-line summary: what changed, what's verified, any follow-on issues discovered (add them to the ledger with new IDs), and whether anything still needs a human decision.

---

ISSUE_ID:
