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

1. Read `docs/review/REVIEW_HOME_BASE.md` (the issue ledger in §6 is your working memory).
2. Read the latest `docs/HEALTH_REPORT.md` so you don't re-derive what Tier 1 already computed.
3. Read `docs/MASTER_OUTLINE.md` (current version header) and `CLAUDE.md` (tech debt section).
4. Confirm a clean baseline before judging anything. Run these yourself in your environment (do not ask the human to run anything):

   ```bash
   npm run lint
   npx tsc -b
   npx vitest run
   cd functions && npm run lint && npx tsc --noEmit && npm test && cd ..
   ```

   Record pass/fail. If the baseline is red, that is the first finding and the audit stops at triage.

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
5. End with a 5-line summary: baseline status, top 3 findings by leverage, and which issue IDs you
   recommend running `PROMPT_FIX.md` against next.
