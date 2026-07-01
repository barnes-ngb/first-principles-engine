# Architecture Audit — 2026-06-28

> **Type:** Monthly deep audit (end-of-June run; primary June run: `ARCHITECTURE_AUDIT_2026-06.md`; mid-cycle supplement: `ARCHITECTURE_AUDIT_2026-06-21.md`).
> **Auditor:** Claude Code (claude-sonnet-4-6) · **Date:** 2026-06-28
> **Branch:** `claude/brave-feynman-qugfka` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc corrections applied directly.

---

## Step 0 — Baseline

Commands run in the remote Claude Code environment:

```
npm run lint          → 3 warnings (LINT-01 react-hooks/exhaustive-deps, same three locations — unchanged)
npx tsc -b            → CLEAN
npx vitest run        → 3,381 tests passing (223 files)
cd functions && npm test → 474 tests passing (24 files)
npm run build         → dist/assets/index-*.js  3,976.67 kB │ gzip: 1,174.14 kB
```

**Baseline: GREEN.** No new failures introduced. Test suite grew substantially: +546 root tests (+38 files) and +10 functions tests since the June 21 audit. Bundle grew +20.94 kB / +6.82 kB gzip (within noise — sticker feature + compliance module).

### Notable closures since the June 21 audit

Three of the top-recommended PROMPT_FIX targets from June 21 have been addressed:

| Issue | Status | PR |
|---|---|---|
| **ETHOS-01** — charter preamble absent from 5 child-facing tasks | **FIXED** (2026-06-27) | #1465 |
| **ARCH-38** — `analyzePatterns.ts` name-gates neurodivergence on `"lincoln"` | **FIXED** (2026-06-28) | #1466 |
| **ARCH-39** — dead `ladders` collection query in `generate.ts` | **FIXED** (2026-06-28) | #1466 |
| **DATA-12** — MO compliance hardcoded in 3 files, no state-config layer | **SUBSTANTIALLY FIXED** (2026-06-27) | #1464 |

---

## Step 0.5 — Audit lenses carried forward

All three lenses from `PROCESS_OVERVIEW.md` applied throughout Steps 1–4:

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate
2. **Multi-kid generality** — anything hard-coded to one kid?
3. **MO→TX compliance** — state rules/exports MO-hardcoded in a way that blocks a clean TX toggle?

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Large files (>1,500L)

| File | Lines | vs June 21 | Judgment |
|---|---|---|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | **2,729** | stable | Tangled — wizard/chat/plan/apply state ~1,700L without a reducer. ARCH-02 OPEN. |
| `functions/src/ai/chat.ts` | **2,577** | +29L | Tangled — `buildQuestPrompt` 400+L + new `buildQuestVarietyDirectiveSection`. ARCH-01 OPEN. |
| `src/features/quest/useQuestSession.ts` | **2,168** | +7L | Tangled — 5 question pipelines. Fifth consecutive report at 2,000+L. ARCH-04 OPEN. |
| `src/features/books/BookEditorPage.tsx` | **2,103** | stable | Cohesive-but-big. ARCH-03 low urgency. |
| `src/features/avatar/MyAvatarPage.tsx` | **1,876** | stable | Cohesive — forge + portal + Stonebridge. Leave as-is. |
| `src/features/workshop/WorkshopPage.tsx` | **1,623** | stable | Cohesive — delegates to sub-components. Not urgent. |
| `src/features/avatar/VoxelCharacter.tsx` | **1,606** | stable | Three.js render loop — splitting risky. Standing decision: leave. |
| `functions/src/ai/contextSlices.ts` | **1,566** | stable | Growth paused this cycle. ARCH-14 OPEN (watching). |

**No new files crossed the 1,500L threshold this cycle.** The previously fast-growing files (`PlannerChatPage`, `contextSlices`) are stable for the first time in three consecutive audits. That's a positive signal.

**Files approaching 1,000L (watch list):**
- `src/features/settings/AvatarAdminTab.tsx`: 1,104L — new entrant, grew with forge + portal admin UI.
- `src/features/today/TodayPage.tsx`: 1,094L — stable, near-watch threshold.

**Standing decomposition candidates:**
- **ARCH-01** (`chat.ts`): +29L this cycle. `buildQuestVarietyDirectiveSection` added inline (1375L) for Knowledge Mine question variety. Quest prompt logic now spans `buildQuestPrompt` (~500L) + `buildComprehensionQuestPrompt`, `buildFluencyPassagePrompt`, and the new variety directive. Proposed seam: extract `functions/src/ai/tasks/prompts/questPrompts.ts`. Design-first.
- **ARCH-02** (`PlannerChatPage.tsx`): stable for first time in three reports. Not growing; still OPEN.
- **ARCH-04** (`useQuestSession.ts`): fifth consecutive report above 2,000L, only +7L this cycle. Stable but persistent. Proposed seam: `useQuestCore` + domain-specific session hooks. Design-first.

### 1.2 Bundle (ARCH-05 / ARCH-08)

**Current:** 3,976.67 kB / 1,174.14 kB gzip — minimal growth.

Root blocker unchanged: `AvatarThumbnail.tsx` imports Three.js and is used in `AppShell.tsx`, so Three.js lands in the main chunk on every route. Even lazy-loading `MyAvatarPage` cannot help until the thumbnail is decoupled.

**Proposed 4-step split** (unchanged from prior audits):
1. Move `AvatarThumbnail.tsx` off Three.js (2D canvas or SVG thumbnail).
2. `React.lazy` → `MyAvatarPage` (isolates Three.js + ~600 kB).
3. `React.lazy` → `BookEditorPage` (jsPDF + canvas drawing ~200–300 kB).
4. `React.lazy` → `WorkshopPage` (~100 kB).

Estimated initial-load reduction: 800–1,100 kB. Architectural decision — proposal only. **ARCH-05 / ARCH-08 still OPEN.**

### 1.3 WorkbookConfig → ActivityConfig migration (ARCH-06)

Ref counts unchanged since June 21: **49 WorkbookConfig refs** in `src/` across 9 files. The planner cluster (`PlannerChatPage`, `PlannerSetupWizard`, `PhotoLabelForm`, `PlannerCompactSetup`, `pace.logic.ts`) and the Firebase helpers (`firestore.ts`, `migrateActivityConfigs.ts`, `planning.ts`) are the main holders.

Migration still not safe until the planner cluster migrates to `activityConfigs` exclusively. **ARCH-06 still OPEN.**

### 1.4 Test coverage (TEST-01 / TEST-04)

**Root tests: 3,381 passing (223 files).** Growth of +546 tests since June 21 represents good progress — primarily from FUNC-04–12 fixes and FEAT-33 sticker slices.

Zero-test areas unchanged:

| Feature | Test files | Notes |
|---|---|---|
| `progress/` | 0 | `DispositionProfile.tsx` AI-narrative-parse + override merge: 0 tests (TEST-04 OPEN) |
| `dad-lab/` | 0 | `useDadLabReports.ts` hours/XP loop: 0 tests (TEST-04 OPEN) |

- **TEST-01** remains PARTIAL (progress + dad-lab).
- **TEST-02** (`BookEditorPage.cover.test.tsx` nondeterministic flake): file present at 117L; status not re-verified this cycle.
- **TEST-04** (useDadLabReports + DispositionProfile): OPEN, unchanged.

### 1.5 Drift since June 21 audit

| File | June 21 | Now | Delta | Judgment |
|---|---|---|---|---|
| `chat.ts` | 2,548 | 2,577 | +29 | ARCH-01 growth; `buildQuestVarietyDirectiveSection` added inline |
| `useQuestSession.ts` | 2,161 | 2,168 | +7 | negligible |
| Others | stable | stable | ±0 | No new growth signals |

**Growth has paused across all previously-watched files.** The three rapid-growth cycles (ARCH-02 +102L, ARCH-14 +81L in June 21) appear to have resolved. **No new silent growth found this cycle.**

**ARCH-12 PARTIAL UPDATE:** `useQuestSession.ts` now imports and uses `writeSnapshotUpdate` from `src/features/evaluate/skillSnapshotWrites.ts` — this writer is migrated. **Two inline writers remain:** `EvaluateChatPage.tsx:608–614` (the primary eval apply path, `setDoc` with `merge: true` + `updateDoc` for blocks) and `SkillSnapshotPage.tsx:96,115` (the manual quick-check edit path). Both are additive-only, so no correctness risk, but they represent drift from the central writer invariant.

---

## Step 2 — Functional / UX Loop (Band 2)

### 2.1 Where is Lincoln (FUNC-01)

**RESOLVED-WITH-DECISION** — no regression. Authority hierarchy confirmed intact: `skillSnapshots` (academic state), `children` (identity), `childSkillMaps` (curriculum coverage), `activityConfigs` (position), `dispositionCache` (derived).

### 2.2 Learning-loop trace

**Capture:** Strong. Multi-photo + audio in place. Sticker feature (FEAT-33) adds creative artifact capture.

**Saved + state-labeled:** MO artifacts tagged and compliance-counted. TX state config is scaffolded (`stateCompliance.ts`) but the switch UI (`homeschoolState` field on family doc) is not built yet — TX is defined-not-activated. Lens 3 hit: acceptable for now, not deepening MO assumptions.

**Evaluated:** ETHOS-01 now FIXED — charter runs through quest, generateStory, reviseStory, revisePage, and scan. Charter framing is now present for all 19 task types. ARCH-38 FIXED — `analyzePatterns.ts` reads `snapshot.supports[]` instead of name-gating. The disposition AI framing is now capability-driven for all children.

**Planned:** `analyzePatterns` → `plannerConversations` → checklist. Chain closes.

**Taught:** `TeachBackSection` writes to `artifacts` + feeds the `disposition` context slice (FEAT-09 FIXED). Rich feedback loop confirmed.

**Re-evaluated:** Knowledge Mine ~weekly (operational gap, not a code issue). `updateSkillMapFromFindings` called from `EvaluateChatPage` on findings commit. Map update is best-effort/fire-and-forget.

**Loop verdict:** Closes end to end. No new dead ends.

### 2.3 Shelly's path

- MVD floor confirmed as a non-dead-end path through compliance records.
- `TodayChecklist` "Find a video" button crash (FUNC-11 FIXED) resolved — no longer undefined-writes.
- Duplicate video buttons removed (FUNC-12 FIXED).
- No new typing-required surfaces; audio/tap maintained.

### 2.4 Kid voice-first

- `KidTodayView`, `KidChecklist`, `KidChapterPool`, `KidTeachBack`: tap-over-typing confirmed.
- `BuildWordQuestionScreen` + `BuildSentenceQuestionScreen`: tap-only, no text input (asserted in tests).
- `KidExtraLogger`, `UnifiedCaptureCard` kid variant: chip-required, +/- stepper, no typing. No regressions.

### 2.5 NEW: Dad Lab name-coupling residual — ARCH-40 (Lens 2)

`src/features/dad-lab/KidLabView.tsx:50` uses `childName.toLowerCase()` as a lookup key into `childReports` (a JSON object the AI returns with per-child keyed sub-objects). If a child is named anything other than what the AI was trained to expect, the lookup returns `undefined` and the lab data doesn't render for that child.

Additionally:
- `KidLabView.tsx:267,369` — renders `activeLab.lincolnRole` (a hardcoded Firestore field name specific to Lincoln)
- `LabSuggestions.tsx:96,122` — parses `lincolnRole: get("Lincoln's role") || get('Lincoln')` from AI JSON response

The `lincolnRole` field is a data-model coupling, not just a display branch. Any second child added to a Dad Lab report has no equivalent role field in the schema. This was explicitly deferred from ARCH-15 (PR #1338 evidence note: "deferred + noted (data-model name coupling, separate runs): `KidLabView` `childReports[childName.toLowerCase()]` storage key + `lincolnRole` field — a data migration").

- **Evidence:** `src/features/dad-lab/KidLabView.tsx:50,267,369` + `src/features/dad-lab/LabSuggestions.tsx:96,122`
- **Severity:** MEDIUM (Lens 2 violation; blocks second-child Dad Lab as currently shaped)
- **Lens:** Lens 2 (multi-kid generality)
- **Proposed fix:** Change AI prompt to return `childRoles: { [childId: string]: string }` keyed by childId; update `DadLabReport` schema to replace `lincolnRole` with `childRoles`; update `KidLabView` lookup to `childRoles[activeChildId]`. This is a prompt + schema change — data migration required for existing reports (opt-in: existing `lincolnRole` field can be mapped on read).
- **New ledger row:** **ARCH-40**

---

## Step 3 — Pedagogy & Ethos (Band 3)

### 3.1 Charter preamble — ETHOS-01 FIXED

Direct verification of `functions/src/ai/contextSlices.ts` TASK_CONTEXT registry:

```ts
quest:          ["charter", "childProfile", ...]   // ✅ was absent in June 21
generateStory:  ["charter", "childProfile", ...]   // ✅ was absent in June 21
reviseStory:    ["charter", "childProfile", ...]   // ✅ was absent in June 21
revisePage:     ["charter", "childProfile", ...]   // ✅ was absent in June 21
scan:           ["charter", "childProfile", ...]   // ✅ was absent in June 21
```

**All 19 task types now carry the charter preamble via `buildContextForTask`.** ETHOS-01 is RESOLVED.

### 3.2 Pace/pressure language scan

- **`buildQuestVarietyDirectiveSection` (new, `chat.ts:1375`):** "Repeating questions is the #1 way to lose this child" — instruction-to-AI, not user-facing. Pedagogically appropriate framing for the model; no shame language exposed to the kid. Acceptable.
- No other new AI prompts or user-facing strings with pressure language found.
- `ScanResultsPanel.tsx`: "behind" maps to "new — teach first" (parent-facing, pedagogically framed). Unchanged.

### 3.3 Diamonds-not-scores

No regressions. Quest diamond bar driven by `diamondsMined` count (FUNC-04 FIXED).

### 3.4 ETHOS-02 status

`ETHOS-02` appears in the ledger — not investigated in this audit (scope of home-base chat).

---

## Step 4 — Data Integrity & Compliance (Band 4)

### 4.1 DATA-01 — FIXED

`computeMonthlyTrend()` confirmed as the single authoritative trend path; shares `dayLogMinuteContributions` with `computeHoursSummary()`. No re-verification needed.

### 4.2 DATA-11 — FIXED

`collectHoursContributions` confirmed as the single counting path in `records.logic.ts:195`. Both `computeHoursSummary` and `computeMonthlyTrend` fold from it. Guard tests in the 3,381 root suite.

### 4.3 DATA-02 — NEEDS-DATA

Frozen until 2026-07-01 per owner decision. No action this cycle.

### 4.4 DATA-12 — SUBSTANTIALLY FIXED; residual tracked as DATA-13

**What was fixed (PR #1464, merged 2026-06-27):**
- New `src/core/compliance/stateCompliance.ts` — `MO_CONFIG` + `TX_CONFIG` + `getStateConfig()` abstraction. MO byte-identical; TX defined-not-activated (three-mode model: MO / TX-baseline / TX-TEFA).
- `ComplianceDashboard.tsx` wired through `getStateConfig(homeschoolState)` for hours targets + required subjects.
- `records.logic.ts:722` — `legalCitation` now dynamic via `getStateConfig(input.homeschoolState).legalCitation`.
- `RecordsPage.tsx` and `ComplianceDashboard.tsx` wired to pass `homeschoolState` through.
- `FamilySettings.homeschoolState` type defined, defaults to `'MO'` everywhere.
- Design doc: `docs/review/STATE_COMPLIANCE_DESIGN.md`.
- Characterization tests in `src/core/compliance/stateCompliance.test.ts` lock MO byte-identity.

**Residual (not in PR #1464 scope):**
`records.logic.ts:785` `<title>Missouri Homeschool Compliance Report — ${childName}</title>` and `records.logic.ts:812` `<h1>Missouri Homeschool Compliance Report</h1>` still hardcode "Missouri" in the HTML export. The `legalCitation` is now dynamic but the document title/heading label is not. `StateComplianceConfig` has no `reportTitle` field.

- **Evidence:** `src/features/records/records.logic.ts:785,812`
- **Severity:** LOW (display-only; doesn't affect MO compliance or the hours computation; but the TX export would say "Missouri" if the switch were ever activated)
- **Lens:** Lens 3 (MO→TX compliance — a TX-activated export with a "Missouri" heading would be wrong)
- **Proposed fix:** Add `reportTitle: string` to `StateComplianceConfig` (e.g. `'Missouri Homeschool Compliance Report'` for MO, `'Texas Homeschool Records'` for TX). Use it at `records.logic.ts:785,812`. A 3-line PROMPT_FIX.
- **New ledger row:** **DATA-13**

### 4.5 Additive-hours invariant

All code merged since June 21 that touches hours:
- FEAT-33 (stickers) — no hours write
- ARCH-38/39 cleanup — no hours write
- ETHOS-01 — no hours write
- DATA-12 state config — reads only the target/citation from config; `collectHoursContributions` and `computeHoursSummary` untouched

**Invariant obeyed.** No arithmetic changes found.

---

## Step 5 — Findings Table and Summary

### Items closed / confirmed resolved since June 21

| ID | Band | Was | Now | Evidence |
|---|---|---|---|---|
| ETHOS-01 | 3 | OPEN | **FIXED** | `contextSlices.ts:56–59,67` — `"charter"` added to 5 slices |
| ARCH-38 | 1 | OPEN | **FIXED** | `analyzePatterns.ts` reads `snapshot.supports[]` (PR #1466) |
| ARCH-39 | 1 | OPEN | **FIXED** | Dead `ladders` query removed from `generate.ts` (PR #1466) |
| DATA-12 | 4 | OPEN | **SUBSTANTIALLY FIXED** | `stateCompliance.ts` + `getStateConfig()` scaffolded (PR #1464); residual → DATA-13 |
| DATA-11 | 4 | DONE | **FIXED** | `collectHoursContributions` single path confirmed in baseline |

### New findings

| ID | Band | Status | Title | Severity | Proposed action |
|---|---|---|---|---|---|
| **ARCH-40** | 1 | OPEN | `KidLabView` data-model name coupling: `childReports[childName.toLowerCase()]` + `lincolnRole` field | MEDIUM | Prompt + schema change to `childRoles: {[childId]: string}`; data migration for existing reports. Deferred from ARCH-15. |
| **DATA-13** | 4 | OPEN | DATA-12 residual: HTML export `<title>` and `<h1>` hardcode "Missouri" | LOW | Add `reportTitle` to `StateComplianceConfig`; 3-line PROMPT_FIX |
| **DOC-07** | N/A | OPEN | Three new docs not indexed in `DOCUMENT_INDEX.md`: `STATE_COMPLIANCE_DESIGN.md`, `ALIGNMENT_AUDIT_2026-06-20.md`, `ARCHITECTURE_AUDIT_2026-06-21.md` | LOW | Add index entries — mechanical fix applied directly in this PR |

### Existing items confirmed open (status unchanged)

| ID | Band | Status | Notes |
|---|---|---|---|
| ARCH-01 | 1 | OPEN | `chat.ts` 2,577L (+29L); `buildQuestVarietyDirectiveSection` added inline |
| ARCH-02 | 1 | OPEN | `PlannerChatPage.tsx` 2,729L (stable for first time) |
| ARCH-04 | 1 | OPEN | `useQuestSession.ts` 2,168L (+7L); 5th consecutive report at 2,000+L |
| ARCH-05/08 | 1 | OPEN | Bundle 3,976 kB; Three.js split blocked by `AvatarThumbnail.tsx` in AppShell |
| ARCH-06 | 1 | OPEN | WorkbookConfig→ActivityConfig: 49 refs remaining in planner cluster |
| ARCH-12 | 1 | OPEN (PARTIAL) | `useQuestSession` migrated ✅; `EvaluateChatPage.tsx:608–614` + `SkillSnapshotPage.tsx:96,115` still inline |
| ARCH-13 | 1 | OPEN (watch) | `useShellyChatFlows.ts` 1,123L — stable; watch |
| ARCH-14 | 1 | OPEN | `contextSlices.ts` 1,566L — stable (growth paused) |
| TEST-01 | 1 | PARTIAL | progress/dad-lab still 0 test files |
| TEST-02 | 1 | OPEN | `BookEditorPage.cover.test.tsx` nondeterministic flake |
| TEST-04 | 1 | OPEN | `useDadLabReports.ts` + `DispositionProfile.tsx` 0 tests |
| DATA-02 | 4 | NEEDS-DATA | Frozen to 2026-07-01 |

### 5-line executive summary

**Baseline GREEN** — lint 3 warnings (LINT-01 unchanged), tsc clean, 3,381/474 tests passing, bundle 3,976 kB.
**Three top items from June 21 are now closed:** ETHOS-01 (charter in all 19 task types), ARCH-38 (name-gate removed from disposition AI), ARCH-39 (dead ladders query gone). DATA-12 is substantially fixed — the state-config abstraction is live and byte-identical for MO; TX is defined-not-activated.
**Top new finding:** ARCH-40 — Dad Lab `childReports[childName.toLowerCase()]` + `lincolnRole` field are data-model name coupling (Lens 2 violation deferred from ARCH-15); fixing this requires a prompt + schema change with read-migration for existing reports.
**Second new finding:** DATA-13 — HTML export title/heading still hardcode "Missouri" despite DATA-12's work; a 3-line PROMPT_FIX (add `reportTitle` to `StateComplianceConfig`).
**Recommended PROMPT_FIX sequence:** DATA-13 (trivial 3-line cleanup, closes DATA-12 cleanly) → ARCH-12 (migrate `EvaluateChatPage` + `SkillSnapshotPage` inline writers) → ARCH-40 (Dad Lab schema; design-first conversation recommended first) → TEST-04 (weekly test-builder).
