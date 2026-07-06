# Architecture Audit — 2026-07

> **Type:** Monthly deep audit. **Auditor:** Claude Code (claude-sonnet-5) · **Date:** 2026-07-05
> **Branch:** `claude/brave-feynman-gyue39` · **Prompt:** `docs/review/prompts/PROMPT_ARCH_AUDIT.md`
> **Rule:** inspect / validate / propose only — no structural fixes applied here; mechanical doc corrections applied directly.
> **Prior:** `ARCHITECTURE_AUDIT_2026-06-28.md`

---

## Step 0 — Baseline

The remote environment started with `node_modules` absent for both the root and `functions/` packages
(fresh container, no persisted install) — `npm ci` / `cd functions && npm ci` run first, then:

```
npm run lint                          → 3 warnings (LINT-01, same 3 locations — unchanged), 0 errors
npx tsc -b                            → CLEAN
npx vitest run                        → 3,277 tests passing (232 files), 0 failing, 0 skipped
cd functions && npm run lint          → CLEAN
cd functions && npx tsc --noEmit      → CLEAN
cd functions && npm test              → 527 tests passing (27 files)
npm run build                         → dist/assets/index-*.js  4,066.18 kB │ gzip: 1,203.37 kB
npm run docs:check                    → all 5 HARD checks PASS; 2 known SOFT warnings (unchanged, see §1.6)
```

**Baseline: GREEN.** No new failures. Root test count reads lower than 2026-06-28's reported figure
(3,277 vs 3,381) despite +9 test files (232 vs 223) and **zero test-file deletions** since then
(`git diff --diff-filter=D 15aa262 HEAD -- '*.test.ts' '*.test.tsx'` → empty; 32 files added, 0 renamed).
`git ls-tree` at the June 28 audit commit shows only **199** total `*.test.(ts|tsx)` files repo-wide vs
that report's claimed "223 files" — the two audits appear to have used different counting scopes (root-only
vs repo-wide, since `vite.config.ts` has no `test.include` filter and picks up `functions/src/**/*.test.ts`
in the same run as `src/**`). Not a regression; flagged so a future audit states its counting method
explicitly rather than re-deriving this every cycle. Functions' own `npm test` count (527/27) is a
**subset** of the repo-wide 3,277/232, not additive to it.

`npm run docs:check` (new since 2026-06-28, added by **DOC-08**) independently confirms: 43 Firestore
collection helpers, ledger ID uniqueness (144 rows, no collisions — the FEAT-44 collision DOC-08 flagged
is resolved), and index↔filesystem doc parity. This retired a large share of the manual stat-verification
this audit would otherwise have had to redo by hand.

---

## Step 0.5 — Audit lenses carried forward

1. **Learning-loop integrity** — capture → save+state-label → evaluate → plan → teach → re-evaluate
2. **Multi-kid generality** — anything hard-coded to one kid?
3. **MO→TX compliance** — state rules/exports MO-hardcoded in a way that blocks a clean TX toggle?

---

## Step 1 — Architecture & Tech Debt (Band 1)

### 1.1 Large files (>1,500L)

| File | Lines | vs 2026-06-28 | Judgment |
|---|---|---|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | **2,745** | +16L | Tangled — stable for two consecutive cycles now. ARCH-02 OPEN. |
| `functions/src/ai/chat.ts` | **2,666** | **+89L** | Tangled — growth **accelerating** (was +29L last cycle). New Knowledge Mine queued-preferences intake (FEAT-54 slice 2c) and `foundationsReview`/`helpCard` task additions (FEAT-51/43) landed inline. ARCH-01 OPEN. |
| `src/features/quest/useQuestSession.ts` | **2,215** | +47L | Tangled — sixth consecutive report above 2,000L. FEAT-54 slice 2c (learner-model write-back) added inline. ARCH-04 OPEN. |
| `src/features/books/BookEditorPage.tsx` | **2,103** | stable | Cohesive-but-big. ARCH-03 low urgency. |
| `src/features/avatar/MyAvatarPage.tsx` | **1,876** | stable | Cohesive. Leave as-is. |
| `src/features/workshop/WorkshopPage.tsx` | **1,623** | stable | Cohesive. Not urgent. |
| `src/features/avatar/VoxelCharacter.tsx` | **1,606** | stable | Three.js render loop — leave. |
| `functions/src/ai/contextSlices.ts` | **1,581** | +15L | Stable growth. ARCH-14 OPEN (watching). |

**No new files crossed the 1,500L threshold this cycle.**

**Watch list (approaching 1,000–1,500L):**
- `src/features/dad-lab/LabReportForm.tsx`: **1,143L** — grew with FEAT-55/56 (type→subject routing, three-beat capture). Still cohesive (planning fields untouched, new capture UI additive), but now the largest file in a directory that gained 9 new test files this cycle — worth a line-count check next audit.
- `src/features/records/RecordsPage.tsx`: 1,269L (+21L since the 2026-06-13 health report's 1,248L).
- `src/features/settings/AvatarAdminTab.tsx`: 1,104L, `src/features/today/TodayPage.tsx`: 1,113L — both stable, unchanged from prior cycle's watch flags.

**Standing decomposition candidates (unchanged verdicts, updated line counts above):**
- **ARCH-01** (`chat.ts`): the accelerating growth (+29L → +89L) makes this the highest-leverage target again. Proposed seam unchanged: extract `functions/src/ai/tasks/prompts/questPrompts.ts`.
- **ARCH-02** (`PlannerChatPage.tsx`): stable two cycles running. Not urgent.
- **ARCH-04** (`useQuestSession.ts`): persistent but slow growth. Proposed seams unchanged (`useQuestCore` + domain hooks).

### 1.2 Bundle (ARCH-05 / ARCH-08)

**Current:** 4,066.18 kB / 1,203.37 kB gzip — up **+89.5 kB / +29.2 kB gzip** since 2026-06-28 (largest single-cycle growth in several audits; tracks the FEAT-51/54/55/56 feature landings).

Root blocker **unchanged**: `src/features/avatar/AvatarThumbnail.tsx` still statically imports `three` (`import * as THREE from 'three'`) and is used directly in `AppShell.tsx:15`, so Three.js ships in the main chunk on every route. `src/app/router.tsx` has **zero** `React.lazy()` usage — no route-level code splitting exists anywhere in the app yet.

**Proposed 4-step split (unchanged from prior audits, restated because bundle growth is now the largest of any recent cycle):**
1. Move `AvatarThumbnail.tsx` off Three.js (2D canvas or SVG thumbnail) — this is the actual prerequisite, not optional.
2. `React.lazy` → `MyAvatarPage` (isolates Three.js + ~600 kB).
3. `React.lazy` → `BookEditorPage` (jsPDF + canvas drawing ~200–300 kB).
4. `React.lazy` → `WorkshopPage` (~100 kB).

Estimated initial-load reduction: 800–1,100 kB, now proportionally larger against a 4,066 kB base. Architectural decision — proposal only. **ARCH-05 / ARCH-08 still OPEN.**

### 1.3 WorkbookConfig → ActivityConfig migration (ARCH-06)

Re-verified: **35 `WorkbookConfig` references across 8 files** in `src/` (planner cluster:
`PlannerChatPage.tsx`, `PlannerSetupWizard.tsx`, `PlannerCompactSetup.tsx`, `PhotoLabelForm.tsx`,
`pace.logic.ts`; Firebase layer: `firestore.ts`, `migrateActivityConfigs.ts`, `planning.ts`). Down from
49 refs / 9 files at the 2026-06-21 audit — real but slow progress. Migration still not safe until the
planner cluster (21+ of the 35 refs) moves to `activityConfigs` exclusively. **ARCH-06 still OPEN.**

### 1.4 Test coverage (TEST-01 / TEST-02 / TEST-04)

**Root: 3,277 tests / 232 files; functions: 527 tests / 27 files** (subset of the root count — see Step 0 note).

| Feature | Test files | Change | Notes |
|---|---|---|---|
| `dad-lab/` | **9** | **0 → 9** | `dadLabPrompts`, `LabReportForm`, `dadLabGrouping`, `labTypeSubjects`, `ConceptArcsSection`, `childRoles`, `hoursRoutingAudit`, `KidLabView`, `arcSteps` — real logic coverage from FEAT-44/54/55/56/ARCH-40. **TEST-01's dad-lab gap is ADDRESSED.** |
| `progress/` | 1 | unchanged | `multiPageScan.test.ts` only — unrelated to `DispositionProfile.tsx`. **TEST-01's progress gap still OPEN.** |

- **TEST-04** (`useDadLabReports.ts` hours/XP credit loop + `DispositionProfile.tsx` narrative-parse/override-merge): confirmed **still OPEN** — despite dad-lab's 9 new test files, none exercises `useDadLabReports.ts` directly (`grep -l useDadLabReports src/features/dad-lab/*.test.*` → empty), and `DispositionProfile.tsx` remains untested.
- **TEST-02** (`BookEditorPage.cover.test.tsx` nondeterministic flake): file still present (`src/features/books/__tests__/BookEditorPage.cover.test.tsx`); not re-verified for flake behavior this cycle (ran green in this pass, but flakiness by definition doesn't show every run).

### 1.5 Drift since 2026-06-28 audit

| File | 06-28 | Now | Delta | Judgment |
|---|---|---|---|---|
| `chat.ts` | 2,577 | 2,666 | **+89** | Growth accelerating — was +29 last cycle |
| `useQuestSession.ts` | 2,168 | 2,215 | +47 | Steady, persistent |
| `PlannerChatPage.tsx` | 2,729 | 2,745 | +16 | Slowing further |
| `contextSlices.ts` | 1,566 | 1,581 | +15 | Slow, stable |
| `LabReportForm.tsx` (new watch) | ~1,100 (est.) | 1,143 | — | New entrant to the watch list |

No file newly crossed 1,500L. Bundle growth (+89.5 kB) is proportionally the largest recent-cycle jump, driven by the same feature wave (FEAT-51/54/55/56) that drove the `chat.ts`/`useQuestSession.ts` line growth — architecture drift and bundle drift share a root cause this cycle, not independent trends.

### 1.6 New findings — multi-kid name-gating regression (Lens 2)

Two related but distinct new findings, both instances of the exact pattern **ARCH-15** already fixed once
(gate on capability, never on name) reappearing in code that postdates that fix:

**ARCH-41 (cosmetic, LOW-MEDIUM):** `src/features/today/KidTodayView.tsx:235` —
`const isLincoln = child.name.toLowerCase() === 'lincoln'` — drives greeting text, celebration copy, retro
font, and section labels, and is threaded into `KidChecklist.tsx` (`:128,286,298,305,320` — quest-vs-checklist
copy). A second, independent instance at `src/features/avatar/MyAvatarPage.tsx:1365`
(`childIsLincoln = child.name.toLowerCase() === 'lincoln'`, inside the child-switcher tab loop) exists
alongside that same file's own **correctly-fixed** active-child `isLincoln` at line 246 (which the file's own
comment documents as deriving from `profile.themeStyle`/age group specifically "never the child's name
(ARCH-15)"). A third child, or a renamed Lincoln, gets mismatched theme/voice in both surfaces. Doesn't
block adding a kid — cosmetic only.

**ARCH-42 (MEDIUM, blocks second-child use):** `src/features/dad-lab/KidLabView.tsx:54,278` —
`isLincoln = childName === 'Lincoln'` gates a genuine **feature branch**, not styling: when true and the
lab type is `'science'`, kids get a 5-step Scientific-Method flow with per-step audio + typed fields; every
other name gets a simpler 2-field form. This is the exact code FEAT-56's own ledger row already named as a
not-yet-built follow-up ("KidLabView beat alignment" / "`KidLabView.tsx` untouched") — this finding supplies
the concrete evidence and severity for that acknowledged gap. A second Lincoln-aged sibling would silently
get London's simpler branch purely because their name isn't literally `"Lincoln"`.

Both new rows added to the ledger (§ below) with proposed fixes. Neither is a regression of already-shipped
behavior for Lincoln/London today — both are latent traps for the next child added to the family, which is
exactly what Lens 2 exists to surface before that happens.

---

## Step 2 — Functional / UX Loop (Band 2)

*(Delegated to a background research pass; findings verified against source before inclusion.)*

### 2.1 "Where is Lincoln" (FUNC-01) — confirmed-fine

Authority hierarchy holds: `skillSnapshots` (academic state, written from `EvaluateChatPage.tsx:503-526`),
`children` (identity), `childSkillMaps` (curriculum coverage, fire-and-forget via
`updateSkillMapFromFindings`), `activityConfigs` (position), `dispositionCache` (derived). New Dad Lab
`childReports`/`childRoles` data (post-ARCH-40) records lab-specific role/report content, not academic
state — doesn't compete with the hierarchy. No new surface claims authority outside it.

### 2.2 Loop integrity trace — confirmed-fine, closes end to end

Traced concretely: `EvaluateChatPage.tsx:503` builds `prioritySkills` from findings → written to
`skillSnapshots` (`:619`, also fires `updateSkillMapFromFindings`) → `PlannerChatPage.tsx:576,779,1393`
reads the snapshot into `generateDraftPlanFromInputs`/`buildCoverageSummary` → `handleApplyPlan`
(`:1756-1900`) writes `ChecklistItem[]` (`source: 'planner'`) directly into the DayLog read by
`TodayChecklist`/`TodayPage` — no orphaned intermediate state. `functions/src/ai/evaluate.ts:544-565`
(weekly review) independently reloads the same `skillSnapshots` doc plus checklist-completion counts — a
real second consumer, not a dead end. No new breaks found.

### 2.3 Shelly's path — confirmed-fine

Energy selector is tap-only (`ToggleButtonGroup`, `TodayPage.tsx:922-931`) → `energyToPlanType` maps to MVD.
MVD floor: unfinished non-essential items dim rather than block (`TodayChecklist.tsx:261-266,504`) and roll
forward via `useRolloverUnchecked` — no missed-day punishment. `ComplianceDashboard.tsx:163-172` already
carries a "no-judge v1" softening (was "significantly behind" → now "tracking under target") — parent-facing,
appropriate for a records dashboard, not a shame surface.

### 2.4 Kid voice-first — confirmed-fine

`BuildWordQuestion.tsx`/`BuildSentenceQuestion.tsx` remain tap-only, zero `TextField`. `KidTodayView.tsx`'s
one `TextField` ("How did it go? (optional)") sits alongside `PhotoCapture` as the primary action, matching
prior audits. **New spot-check finding (adjacent to Band 1):** `KidLabView.tsx`'s Lincoln-gated
Scientific-Method branch (§1.6, ARCH-42) leans on typed `TextField`s ("I think...", "It happened
because...") alongside `AudioRecorder` — audio is present, not typing-only, so this doesn't independently
violate voice-first, but it's the same code region flagged for name-gating.

### 2.5 Multi-kid generality sweep — see §1.6 (ARCH-40 FIXED; ARCH-41/ARCH-42 new)

**ARCH-40 confirmed FIXED**: `src/features/dad-lab/childRoles.ts` (`normalizeChildRoles` /
`resolveChildReport` / `parseChildRoles`) now resolves by `child.id` with legacy-name fallback; `KidLabView.tsx`
and `LabSuggestions.tsx` route through it. The two new findings (ARCH-41 cosmetic, ARCH-42 feature-branch)
are written up in §1.6 rather than duplicated here.

### 2.6 MO→TX compliance, Band-2/UX layer — confirmed-fine

No MO-specific hours/subject constants found in the functional-loop UX layer itself:
`chatPlanner.logic.ts` derives time budget from user-entered `hoursPerDay`, not a state config;
`PlannerChatPage.tsx`/`TodayPage.tsx` have zero references to `getStateConfig`/`homeschoolState`. MO
assumptions stay isolated to the records/compliance module (Band 4 territory).

---

## Step 3 — Pedagogy & Ethos (Band 3)

*(Delegated to a background research pass; findings verified against source before inclusion.)*

### 3.1 Charter preamble coverage — confirmed-fine, no regression

`CHAT_TASKS` (`functions/src/ai/tasks/index.ts:25-47`) now has **21 keys** (19 at the last audit + 2 new:
`foundationsReview` FEAT-51, `helpCard` FEAT-43). All 21 carry the charter preamble — 14 via
`TASK_CONTEXT`/`buildContextForTask` (`contextSlices.ts`), 6 more via direct `CHARTER_PREAMBLE`
interpolation in family-level generators (`conundrum.ts`, `weeklyFocus.ts`, `chapterQuestions.ts`,
`bookLookup.ts`, `lessonVideo.ts`, `monthlyReview.ts`), plus the non-chat-dispatch `weeklyReview` callable.

**Minor informational note (not a finding requiring action):** those same 6 family-level generators have no
`TASK_CONTEXT` registry entry at all. If one is ever migrated to `buildContextForTask` without adding a
registry key, the fallback (`contextSlices.ts:374`, `TASK_CONTEXT[taskType] || TASK_CONTEXT["chat"]`) would
silently degrade its context (charter survives, richer slices don't). No action needed while they bypass the
registry entirely; worth a one-line reminder in any future migration ticket for those six.

### 3.2 Pace/pressure language scan — confirmed-fine

All "behind"-adjacent hits are either UI-layout terms or **explicit anti-pace guardrails**: `helpCard.ts:129`
("Gaps are normal, not failure. No shame."), `monthlyReview.ts:350,403,442` ("Never grades, never says
'ahead' or 'behind'... coverage, never pace"), and the new `foundationsReview.ts:170-172` ("NEVER show band
numbers, grade levels, or 'level N'... NEVER show percentages or raw counts framed as scores") — the
strongest explicit no-shame contract of any task seen so far. No pace/deadline framing in the new
`dadLabPrompts.ts` (ETHOS-03/04) either.

### 3.3 Diamonds-not-scores — confirmed-fine

New `MineRecapCard` (FEAT-45, Today parent recap) and `HelpCardStrip.tsx` (FEAT-43) carry no
correct/total/percentage/level-number rendering; `MineRecapCard.test.tsx` actively asserts the absence of
those signals. No regressions.

### 3.4 New-surface charter alignment — confirmed-fine

FEAT-56's `LabCaptureBeats.tsx` writing prompt is explicitly optional/no-shame by code comment
("never required, never validated, no empty-state shame"). `foundationsReview.ts` carries its own explicit
"no shame, ever" section. ETHOS-03→ETHOS-04 shows active charter-review discipline in action (ETHOS-04
corrected ETHOS-03's over-correction into avoidance). No new surface introduces shame or grading.

---

## Step 4 — Data Integrity & Compliance (Band 4)

*(Delegated to a background research pass; findings verified against source before inclusion.)*

### 4.1 DATA-01 — still FIXED

`collectHoursContributions` (`records.logic.ts:219`) remains the sole counting path; both
`computeHoursSummary` (`:290`) and `computeMonthlyTrend` (`:389`) fold from it. The shared per-day extractor
`dayLogMinuteContributions` (`:148`) received a real logic change since the last audit (DATA-14, §4.4), but
both consumers still call the same function — no divergence introduced.

### 4.2 DATA-02 — still NEEDS-DATA, freeze window now elapsed

Ledger status unchanged since 2026-06-09: frozen until 2026-07-01, keyed on the post-DATA-09
`childId:'both'` shape. **That date has now passed** (today is 2026-07-05) with no repo-visible follow-up —
no commit or ledger note references DATA-02 since. This remains genuinely un-resolvable from a repo-only
audit (needs a live Firestore export); flagging as **due now** so the owner can trigger the July dedupe pass.

### 4.3 DATA-13 — still OPEN, now with two more uncaptured sites

`StateComplianceConfig` (`stateCompliance.ts:49-61`) still has no `reportTitle` field. The original two
hardcoded-"Missouri" sites shifted with file growth (DATA-14) from `:785,812` to **`:809,836`** (content
byte-identical, just moved). Two more sites not previously captured: **`:873`** (`<td>Core at home (MO
≥600)</td>`) and **`:909`** ("...intended for Missouri homeschool record-keeping purposes."). All four
predate 2026-06-28 (blame: `e372f96`, 2026-06-20) — not a regression, just a fuller accounting of the same
residual. Still a 3–4 line PROMPT_FIX: add `reportTitle` (and parameterize the `≥600`/"Missouri" strings) on
`StateComplianceConfig`.

### 4.4 Additive-hours invariant — one non-additive change found, process-compliant

Commits since 2026-06-28 touching `src/features/records/`: `9a05178` (DATA-14), `d95c576` (lint-only),
`3aa67c7` (test-only). **`9a05178` does change hours arithmetic**, not merely add to it —
`dayLogMinuteContributions` now additionally emits `checklistItemCountedMinutes(item)` for unmatched
completed checklist items in block-actuals mode (raises totals, retroactively for the closed 2025-26 year,
per the ledger's stated boundary decision). This followed the propose-and-confirm discipline correctly: a
read-only diagnosis doc (`docs/review/HOURS_UNDERCOUNT_DIAGNOSIS.md`) preceded the fix commit, and the
ledger entry is marked "Run SOLO. Do not merge." — it's already on `origin/main` via the normal branch→PR→
human-merge path, consistent with the operating model (not a self-merge). Noting here only so the owner has
a clear pointer that this specific commit is the one hours-affecting change of the cycle, in case it wasn't
reviewed with that framing before merge. No other hours-adjacent commit this cycle touched computation logic.

### 4.5 New MO-hardcoding since 2026-06-28 — none found

Full re-sweep of `src/` and `functions/src/` for new "Missouri"/"MO"/600-hour literals found only the
DATA-13 sites (§4.3, all pre-existing) plus the already-known MO defaults in `RecordsPage.tsx`,
`ComplianceDashboard.tsx`, and `complianceMapping.ts` (all last touched 2026-06-20). No fresh Lens-3
regression.

### 4.6 Other DATA- ledger items (status as recorded, not re-investigated in depth)

- **DATA-14** — RESOLVED (PR open 2026-07-02): checklist/block-actuals undercount fix (see §4.4).
- **DATA-15** — RESOLVED (PR open 2026-07-03): `isWorkbookMatch` bare same-subject fallback removed.
- **DATA-16** — BUILT (PR open 2026-07-04), do not merge: Dad Lab hours-routing audit, propose→confirm
  additive corrections, routes through unmodified `collectHoursContributions`.

No `DATA-17+` rows exist yet.

---

## Step 5 — Findings Table and Summary

### Items re-verified / status-updated this cycle

| ID | Band | Was | Now | Notes |
|---|---|---|---|---|
| ARCH-01/02/04/05/13/14 | 1 | various OPEN | OPEN, re-verified | Current line/bundle counts recorded; see §1.1/1.2/1.5 |
| ARCH-06 | 1 | OPEN | OPEN, re-verified | 35 refs / 8 files (down from 49/9) |
| ARCH-40 | 1 | OPEN | **FIXED** | `childRoles.ts` confirmed live; `KidLabView`/`LabSuggestions` route through it |
| TEST-01 | 1 | PARTIAL | **ADDRESSED (dad-lab)**, still OPEN (progress) | dad-lab gained 9 test files |
| DATA-13 | 4 | OPEN | OPEN, expanded | Two more hardcoded-Missouri sites found (§4.3) |
| DATA-02 | 4 | NEEDS-DATA | NEEDS-DATA, **due now** | Freeze window (2026-07-01) has elapsed |
| DOC-07 | N/A | OPEN | **FIXED** | All three docs confirmed indexed |

### New findings

| ID | Band | Status | Title | Severity | Lens | Proposed action |
|---|---|---|---|---|---|---|
| **ARCH-41** | 1 | OPEN | `KidTodayView.tsx`/`MyAvatarPage.tsx` re-introduce name-gated cosmetic personalization | LOW-MEDIUM | 2 | Thread `themeStyle`/`ageGroup` (already resolved in `MyAvatarPage.tsx:246-248`) into `KidTodayView` + child-switcher loop instead of `child.name` |
| **ARCH-42** | 1 | OPEN | `KidLabView.tsx` gates a real feature branch (Scientific Method steps) on literal name `"Lincoln"` | MEDIUM | 2 | Replace with a capability flag, or retire the branch by extending `LabCaptureBeats.tsx` to the kid view (FEAT-56's own named follow-up) |

### 5-line executive summary

**Baseline GREEN** — lint 3 warnings (unchanged), tsc clean, 3,277/232 root tests + 527/27 functions tests
passing, bundle 4,066 kB (+89.5 kB, largest recent-cycle jump), `docs:check` all HARD checks pass.
**Confirmed fixed since June 28:** ARCH-40 (Dad Lab `childRoles` migration), DOC-07 (doc indexing), and dad-lab's
share of TEST-01 (9 new test files) — all closed cleanly, no regressions found across Bands 2–4.
**Top new finding:** ARCH-42 — `KidLabView.tsx`'s kid-facing Scientific Method flow is still gated on the
literal string `"Lincoln"`, the exact gap FEAT-56 already named as a follow-up; this audit supplies the
concrete evidence and severity. **Second new finding:** ARCH-41, the same name-gating pattern reappearing
cosmetically in `KidTodayView`/`MyAvatarPage`'s child-switcher — lower severity, same root cause.
**Recommended PROMPT_FIX sequence:** DATA-13 (trivial, now 4 sites, closes DATA-12 cleanly) → ARCH-42
(higher-severity multi-kid blocker, aligns with FEAT-56's planned direction) → ARCH-41 (cosmetic, smaller
scope) → TEST-04 (weekly test-builder: `useDadLabReports.ts` + `DispositionProfile.tsx`) → DATA-02 (not a
PROMPT_FIX — needs owner action against a live Firestore export, now past its freeze date).
