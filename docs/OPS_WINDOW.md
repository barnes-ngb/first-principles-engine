# Monthly Ops Window

> A recurring **practice**, not a review skill. On the **first weekend of each
> month**, the owner runs this one-page checklist in a **Claude.ai design
> session** (home-base chat) — **NOT** a Claude Code run. It reviews the
> resilience census, traces two family journeys read-only, and clears the
> standing items below. Fixes it decides on are handed to Claude Code as normal
> run-prompts; this window only **decides and records**.

**Last run:** _(none yet — seed this line on the first execution, format `YYYY-MM-DD`)_

Paste this whole file into the home-base chat to run the window. Work top to
bottom; nothing here asks you to run a local command.

---

## 1. Docs-check + silent-fallback census

The `docs:check` CI job (DOC-08 + DOC-09) runs on every PR — you never run it
locally. Open the latest PR's `docs-check` job log (or the most recent `main`
run) and read the **Resilience invariants (DOC-09)** section:

- **`remote-timeout-finally` (SOFT → HARD after one clean month):** every raw
  `httpsCallable` in `src/features/**` should be within reach of a timeout
  (`timeout:` option, the FEAT-61 `withTimeout` wrapper, or an AbortController)
  **and** a `finally`. For each warning: decide **fix** (hand a run-prompt to
  Claude Code) or **allowlist** (add a `remoteCallAllow` entry with a reason +
  ledger ref). The goal is a **clean month** so this can flip HARD — track
  progress here.
- **`image-downscale` (SOFT):** every image file-input should route through a
  downscale/compress util. For each warning: fix, or allowlist under
  `imageDownscaleAllow` (genuine originals-needed, or a pointer to the handler
  that downscales).
- **`silent-fallback-census` (report-only, never fails CI):** the list of
  `catch` blocks in `src/features/**` that swallow failures (no rethrow, no
  user-visible error, no warn+ log). This is the **swallowed-failure census**.
  Skim the top files; if any sit on a load-bearing path (a write, an upload, a
  compliance number), file a ledger row to make the failure honest.

Record the three census numbers each month so the trend is visible:

| Month | remote-guard | image-downscale | silent catches |
|---|---|---|---|
| 2026-07 (day one) | 8 | 1 | 87 (47 files) |

---

## 2. Flow audit (pick 2 of ~8 named journeys)

Trace **two** of the family journeys below **read-only** in this design session
— follow the data from the first capture to the final store, hunting **silent
gates** (a `catch`/guard that drops data without telling anyone) and **pipeline
splits** (a capture that saves in one place but never reaches the surface that's
supposed to reflect it — the FEAT-62 shape). Rotate which two you pick each
month. No code changes here; anything you find becomes a ledger row.

1. **Today capture → scan → position** (per-item Camera/Upload → curriculum
   position; FEAT-62's exact failure mode)
2. **Review chat → attest → learner model** (Foundations Review → concept
   states → `learnerModels`)
3. **Upload → proposals → confirm** (Shelly portal: image/upload → parsed
   actions → confirm-gated write)
4. **Quest → evidence** (Knowledge Mine session → findings / working levels)
5. **Plan lock-in → help cards** (Plan My Week → `dailyPlans` → Today help cards)
6. **Dad Lab report → hours → arc** (lab report → `hoursAdjustments` → concept arc)
7. **Book read → hours → portfolio** (read-aloud session → hours → portfolio evidence)
8. **Weekly review → synthesis** (Sunday weekly review → learner synthesis beat)

**Picked this month:** _(record the two + one-line findings)_

---

## 3. Standing items (check status every window)

### July window backlog — **flag prominently until closed**
These three were **still OPEN from the 2026-06 review** and need owner action
against a **live Firestore export** (repo-only work can't resolve them):

- [ ] **DATA-02** — hours dedupe analysis. Near-identical 5-subject backfill
  batches dated 2025-07-15 & 2025-08-15; key the analysis on the
  post-DATA-09 shape (date, subject, minutes, reason, `childId: 'both'`),
  same export as DATA-05.
- [ ] **DATA-05** — export verification. Confirm zero null-`childId`
  `hoursAdjustments` remain post-migration; spot-check `'both'` attribution on
  migrated docs (re-attribute where the parent knows the work was one kid's).
- [ ] **DATA-13** — HTML export "Missouri" three-liner. Add `reportTitle` to
  `StateComplianceConfig` and use it at the four hardcoded sites in
  `records.logic.ts` (title/heading/`<td>`/purpose line) so a TX export doesn't
  carry a Missouri heading. Small PROMPT_FIX — hand to Claude Code.

### Recurring reviews
- [ ] **Opus pilot review** (due ~**Jul 19**) — `evaluate` + `learnerSynthesis`
  run on `claude-opus-4-8` (FEAT-58). After ~2 weeks decide keep vs. revert to
  Sonnet 5 (one-line change in `functions/src/ai/models.ts`); judge on quality
  delta vs. cost.
- [ ] **Allowlist re-review** — walk `scripts/docs-alignment.allow.json`. Each
  entry still justified? The `rawRefsAllow` (xpLedger/days raw refs) and the new
  `remoteCallAllow` / `imageDownscaleAllow` seeds — any that a fix has made
  obsolete? A stale entry is flagged by `docs:check`; retire it.
- [ ] **Model / pricing check** — **Sonnet 5 intro pricing ends Aug 31.**
  Decide keep/adjust before then; verify the `models.ts` table against the
  current Anthropic catalog.
- [ ] **ARCH-17 Node runtime countdown** — **hard stop Oct 30** (Node 20
  functions stop deploying). Bump the Functions runtime + `firebase-functions`
  SDK together before the deadline. Track months remaining here.

---

## 4. Close the window

- [ ] Update the **Last run** line at the top of this doc (`YYYY-MM-DD`).
- [ ] Add this month's row to the **census trend** table (§1).
- [ ] Record the **two journeys** picked + findings (§2).
- [ ] Update any **ledger rows** this window resolved or advanced (status only —
  additive, single-writer discipline per `CLAUDE.md`).

---

Ledger anchor: DOC-09 — encodes the resilience checks (FEAT-61, FEAT-62 lessons)
this window reviews. See also `docs/DOCS_ALIGNMENT.md` (DOC-08 + DOC-09 checks)
and `docs/PROCESS_OVERVIEW.md` (the audit pipeline this practice complements).
