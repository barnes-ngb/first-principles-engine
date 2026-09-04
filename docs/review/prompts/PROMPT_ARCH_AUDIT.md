# PROMPT — Monthly Architecture & Functional Audit

> **Run in:** Claude Code web, on the repo. **Cadence:** monthly (1st, after the /3-day health audit).
> **To schedule:** create a scheduled Claude Code task whose prompt is:
> *"Read `docs/review/prompts/PROMPT_ARCH_AUDIT.md` and execute it fully."*
> **To run manually:** paste this whole file into Claude Code on the repo.
> **Priority order (do not reorder):** 1 Architecture & tech debt · 2 Functional/UX loop · 3 Pedagogy/ethos · 4 Data integrity. A lower-band item still jumps the queue if compliance- or time-sensitive.

---

You are performing the monthly deep audit for the First Principles Engine. This is **inspect and
validate and propose** — you do **not** apply risky fixes here (those go through `PROMPT_FIX.md`,
one issue at a time, reviewed). Mechanical, zero-risk doc corrections may be applied directly.

## Step 0 — Orient

1. Read `docs/PROCESS_OVERVIEW.md` **first** — how this project is developed, the audit pipeline (incl. the COLLISION rule), and the kid learning loop. The three lenses below come straight from it.
2. Read `docs/review/REVIEW_HOME_BASE.md` (the issue ledger in §6 is your working memory).
3. Read the latest `docs/HEALTH_REPORT.md` so you don't re-derive what Tier 1 already computed.
4. Read `docs/MASTER_OUTLINE.md` (current version header) and `CLAUDE.md` (tech debt section + AI Development Operating Model).
5. Confirm a clean baseline before judging anything. Run these yourself in your environment (do not ask the human to run anything):

   ```bash
   npm run lint
   npx tsc -b
   npx vitest run
   cd functions && npm run lint && npx tsc --noEmit && npm test && cd ..
   ```

   Record pass/fail. If the baseline is red, that is the first finding and the audit stops at triage.

## Step 0.5 — Audit lenses (apply across every step)

Carry these three lenses through Steps 1–4. They cut across the bands — a finding can be both an
architecture issue *and* a lens hit; note the lens in the finding. Grounded in `docs/PROCESS_OVERVIEW.md`
(the kid learning loop + Strategic Direction).

1. **Learning-loop integrity.** Does the capture → save+state-label → evaluate → plan → teach → re-evaluate
   loop actually **close**? In particular: is **every kid's work saved *and* state-labeled** (artifact/day-log
   persisted *and* tagged so it counts toward compliance)? Trace at least one real path for a break. Re-check
   the known weak links called out in `PROCESS_OVERVIEW.md` (iii): sparse-upload days, Lincoln doing Knowledge
   Mine only ~weekly, the learning-map "shows missing things he's actually learned" under-reporting bug, and
   Knowledge Mine being too limited / needing more levels.
2. **Multi-kid generality.** Is anything **hard-coded to one kid** (name/age branches, single-child storage
   keys, London-shaped gaps — e.g. the just-fixed chapter-question London gap, ARCH-15 identity coupling) that
   would **block a clean kid-add**? The engine is shared with distinct per-child paths; gate on **capability,
   never on name**. Flag any new name-gating as a regression.
3. **MO→TX compliance.** Compliance must track **both** Missouri and Texas (TX is stricter in respects MO
   isn't, and MO-only exports won't transfer). Flag anywhere state rules/exports are **MO-hardcoded** such
   that a MO ⇄ TX toggle couldn't be added cleanly. Building the TX feature is out of scope; *not deepening MO
   assumptions* is in scope.

## Step 1 — Architecture & tech debt (BAND 1, primary)

Investigate, with file paths and line counts as evidence:

- **Largest files.** List everything over 1,500L. For each, judge: is it *cohesive-but-big* (leave it) or *tangled* (decomposition candidate)? Name the seams you'd cut along. Re-check the standing candidates: `chat.ts` (ARCH-01), `PlannerChatPage.tsx` (ARCH-02), `BookEditorPage.tsx` (ARCH-03), `useQuestSession.ts` (ARCH-04).
- **Bundle (ARCH-05).** Confirm current main-chunk size. Identify the heaviest imports and which routes pull them. Propose a concrete route-level `React.lazy` split with an estimated initial-load reduction. This is an architectural decision, not an auto-fix — write it up, don't do it.
- **Test coverage (TEST-01).** Re-list features with 0 test files. For each, decide: genuinely untestable UI shell, or missing coverage on real logic? Propose the 1–2 highest-value test files to add.
- **Migrations / deprecations.** WorkbookConfig→ActivityConfig (ARCH-06): count remaining legacy refs, list the files, judge whether completion is safe yet. Ladder deprecation (ARCH-07): are the TODO-marked refs removable now?
- **Drift since last audit.** Any file that grew >150L since the last dated audit report. Flag silent growth.

## Step 2 — Functional / UX loop (BAND 2)

Trace the core loop end to end and look for breaks, not just code smells:

- **The "where is Lincoln" problem (FUNC-01).** This is the centerpiece. Map every surface that claims to know Lincoln's current state (Skill Snapshot, Ladders, Milestones, Learning Map, Curriculum position, Disposition). For each: who writes it, who reads it, can they disagree? Propose which one should be **authoritative** and how the others should derive from or defer to it. This is a design proposal — capture options and trade-offs, don't implement.
- **Loop integrity.** Pick one real path (e.g. an evaluation finding → does it actually reach the planner → does it actually shape the next checklist → does the weekly review actually see the result?). Note any dead ends, orphaned state, or silent drops.
- **Shelly's path.** Energy selector → plan → today → review. Anywhere it could create shame, dead-end on a bad day, or demand typing where a tap should do — flag it against the no-shame rule.
- **Kid voice-first.** Spot-check that Lincoln/London surfaces honor taps-over-typing and read-aloud.

## Step 3 — Pedagogy & ethos (BAND 3)

- Scan AI prompts/context slices for **pace/pressure language** that violates coverage-not-pace.
- Confirm "diamonds not scores" and disposition-over-mastery framing held in any new surfaces.
- Confirm the charter preamble still reaches all 17 task types.

## Step 4 — Data integrity & compliance (BAND 4 — but DATA-01 is top-of-queue)

- **DATA-01 (compliance, time-sensitive).** Re-verify the `MonthlyTrend` vs `computeHoursSummary()` divergence. Restate the authoritative core-hours figure and the gap to the MO 600-core line. The fix touches the additive-hours invariant → keep it as a **proposal** in the ledger; do not apply here.
- **DATA-02.** Flag the suspected duplicate backfill. Mark NEEDS-DATA (requires a live Firestore export — out of scope for the repo-only audit).
- Re-affirm the additive-hours invariant is still obeyed by any view added since last audit.

## Step 5 — Write the report and update the ledger

1. Create `docs/review/ARCHITECTURE_AUDIT_<YYYY-MM>.md` with sections mirroring Steps 1–4, each
   finding carrying: evidence (path:line), severity, band, and a concrete proposed action.
2. Update the ledger in `docs/review/REVIEW_HOME_BASE.md`:
   - Add new findings with fresh IDs (`ARCH-`, `FUNC-`, `TEST-`, `DATA-`, `DOC-` prefixes).
   - Update status on existing items (e.g. `FIXED` if a prior fix run closed it).
   - Bump the "Last audit" date in the header.
3. Apply **only** mechanical doc fixes directly (stat numbers, missing index entries, nav labels).
   Everything structural or invariant-touching stays a proposal.
4. Open a single PR titled `chore: monthly architecture audit <YYYY-MM>` containing the new report,
   the ledger update, and any mechanical doc fixes. **Do not merge** — leave for review.
5. Then run **End of run** below, and post the 5-line summary there — baseline status, top 3 findings by
   leverage, and which issue IDs you recommend running `PROMPT_FIX.md` against next, under the `CODEX ROUND:`
   first line. Do not post a summary before the Codex round is answered.

## End of run

A run is not finished when the PR opens; it is finished when the **automated review round on that PR is
answered**. This is the run's last step, and the summary below is the run's **one** summary — do not post a
finish-looking summary before it.

1. **Poll for the Codex round**, up to 10 minutes, reading three things:
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
     A 👍 from a human or another bot is not a review result, and an older one is not this round's. A qualifying clean signal closes the round
     immediately; don't burn the rest of the window on it.
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

Then **stop**. Do not subscribe to the PR — and where the harness subscribes for you when the PR is
created, **unsubscribe before you stop**, or the run stays armed exactly as this protocol exists to prevent.
Do not schedule a check-in, reminder, wake-up or scheduled task of any kind, and do not stay resident to
"watch CI" — CI's result is on the PR page. If CI fails
after you stop, the human pastes the log into a new run. **A merged PR is never touched again by the run
that opened it**; a fix that is still needed goes on a new branch and PR.

The human merges only a PR whose summary's first line says `safe to merge`.
