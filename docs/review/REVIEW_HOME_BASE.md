# Review Home Base — First Principles Engine

> **What this is:** the single anchor for the Barnes homeschool app's architecture & functional review.
> **Where reviewing happens:** a dedicated Claude.ai chat (the "home base"). It owns the recurring
> audit, holds the live issue ledger, and spins out fix runs.
> **Where fixing happens:** Claude Code web, driven by the prompts in `prompts/`, reviewed before merge.
> **Repo:** github.com/barnes-ngb/first-principles-engine · **Live:** first-principles-engine.web.app
> **Created:** 2026-05-29 · **Last audit:** 2026-05-31 (monthly — `ARCHITECTURE_AUDIT_2026-06.md`)

---

## 1. Why this exists

The project already has a working maintenance system (Tiers 1–3 below) that keeps stats and docs
honest every few days. What it lacked was **teeth on architecture** and a path from *finding* to *fix*.
This home base adds that: one recurring deep audit focused on structure and the end-to-end loop, plus
a repeatable fix runner so issues don't just get logged — they get closed.

## 2. Review priority order

Set by Nathan, 2026-05-29. The audit and ledger weight findings in this order:

1. **Architecture & tech debt** — structure, decomposition, bundle, test coverage. *(primary)*
2. **Functional / UX completeness** — does the evaluate → plan → execute → review loop actually work for Shelly and the boys.
3. **Pedagogy & ethos alignment** — charter fidelity, disposition-over-mastery, no-shame, coverage-not-pace.
4. **Data integrity & compliance** — hours aggregation, MO 600-core line, source-of-truth conflicts.

> Note: an item in a lower band still jumps the queue if it is **time-sensitive or compliance-critical**
> (e.g. DATA-01 below, which affects the June 30 MO core-hours line).

## 3. How to run the home base

| Action | Where | How |
|---|---|---|
| **Monthly deep audit** | Claude Code web (scheduled) | Run `prompts/PROMPT_ARCH_AUDIT.md`. Same scheduling mechanism as your /3-day health audit. Suggested: 1st of month, after the health audit. |
| **Fix an issue** | Claude Code web (manual) | Run `prompts/PROMPT_FIX.md` with one issue ID from the ledger (§6). |
| **Strategy / triage / "should we even do this"** | Claude.ai home-base chat | Paste this file + the latest dated audit report. Talk it through. Decisions land back in the ledger. |
| **Refresh project context** | Claude.ai project settings | Point the project at `docs/PROJECT_CONTEXT.md` (regenerated weekly by Tier 3), not the stale v14 outline. See DOC-01. |

## 4. The existing maintenance system (unchanged — for reference)

| Tier | Cadence | Output | Owner |
|---|---|---|---|
| **1 — Health Audit** | every 3 days | `docs/HEALTH_REPORT.md` (stats, build/lint/test, doc drift, auto-fixes numbers) | Claude Code scheduled |
| **2 — Fix Companion** | after Tier 1 | auto-fixes mechanical doc gaps (undocumented tasks, missing collections, nav, index) | Claude Code scheduled |
| **3 — Context Gather** | weekly | `docs/PROJECT_CONTEXT.md` (AI-optimized context for design chats) | Claude Code scheduled |
| **4 — Deep Audit** | **monthly (this system)** | dated `docs/review/ARCHITECTURE_AUDIT_<YYYY-MM>.md` + ledger update | Home base → Claude Code |

Tiers 1–3 stay as they are. This home base **is** Tier 4, made concrete.

## 5. Architecture map (as of 2026-05-29)

**Stack:** React + TypeScript + Vite · Firebase (Auth/Firestore/Storage/Functions/Hosting) · MUI ·
Three.js r128 (3D avatar) · Anthropic Claude (Sonnet 4.6 primary, Haiku 4.5 for image-prompt rewrites) ·
OpenAI DALL-E 3 + gpt-image-1.

**Scale (verified against repo):** ~160,818 TS lines · 135 commits on main · 34 Firestore collections ·
24 Cloud Functions · 17 chat task types · 33 routes · 125 test files · 2,038 tests passing ·
build/lint/tsc all green.

**The core loop (this is what "functional review" traces):**

```
Evaluate ──► Skill Snapshot ──► Plan My Week ──► Daily checklist (Today) ──► Weekly Review
   ▲              (priority skills,                  (evidence: completion,        │
   │               supports, stop rules,             engagement, mastery,         │
   └───────────────conceptual blocks)                minutes, artifacts) ─────────┘
```

**AI pipeline:** 17 task types dispatched via `functions/src/ai/tasks/` registry; per-task context
slices in `functions/src/ai/contextSlices.ts`; charter preamble injected into all calls.

**Feature homes:** `today/` · `planner-chat/` · `quest/` (Knowledge Mine) · `avatar/` (Hero Hub) ·
`books/` · `workshop/` · `shelly-chat/` (Ask AI) · `evaluate/` · `records/` · `dad-lab/` · `progress/`.

**The central architecture tension (already named in `first-principles-system-review.md`):**
the system can answer *"where is Lincoln right now?"* from **six** places — Skill Snapshot, Ladders,
Milestones, Learning Map, Curriculum position, Disposition profile — and **none is authoritative**.
The loop isn't missing; it has too many overlapping truths. Sharpening that authority is the single
highest-leverage architecture move. Tracked as **FUNC-01**.

## 6. Live issue ledger

Status: `OPEN` · `IN PROGRESS` · `FIXED` · `WONTFIX` · `NEEDS-DATA` (requires live Firestore export).
Band = priority band from §2. The audit prompt updates this table; the fix prompt flips status.

| ID | Band | Status | Title | Evidence / location |
|---|---|---|---|---|
| **DATA-01** | 4† | **FIXED** | **View-layer reconciliation** (classified SAFE): `MonthlyTrend` was re-deriving core hours from completed-checklist `estimatedMinutes` (and skipping logs with no checklist), inflating Lincoln's cumulative core **over the 600 line** while the canonical `computeHoursSummary()` reads **598.73h** (1.27h **under**). Fix points the chart at the new canonical `computeMonthlyTrend()` in `records.logic.ts`, which shares the exact data sources, core-bucket set, and block-vs-checklist rule (extracted into `dayLogMinuteContributions`) used by `computeHoursSummary`. **No stored hours value or canonical computation changed** — display-only reconciliation; the 46 existing `computeHoursSummary` tests still pass unchanged, proving the extraction is result-identical. Locked by a `computeMonthlyTrend` test asserting cumulative core **===** `computeHoursSummary().coreMinutes` for a fixed dataset (incl. adjustments + partial-day edge) + a `MonthlyTrend` render test. Branch `fix/data-01-core-hours-overcount`. | `MonthlyTrend.tsx` now calls `computeMonthlyTrend` (`records.logic.ts`); guards in `records.logic.test.ts` (+5) and `MonthlyTrend.test.tsx` (new) |
| **ARCH-01** | 1 | OPEN | `chat.ts` CF 2,466L; `buildQuestPrompt` 400+L — extract prompt builders | `functions/src/ai/chat.ts` |
| **ARCH-02** | 1 | OPEN | `PlannerChatPage.tsx` 2,620L; ~1,700L interconnected state | `src/features/planner-chat/PlannerChatPage.tsx` |
| **ARCH-03** | 1 | OPEN | `BookEditorPage.tsx` 2,278L — section-bounded, low urgency | `src/features/books/BookEditorPage.tsx` |
| **ARCH-04** | 1 | OPEN | `useQuestSession.ts` 1,870L handles 4 quest types in one hook | `src/features/quest/useQuestSession.ts` |
| **ARCH-05** | 1 | OPEN | Main bundle 3.84MB / 1.13MB gzip, **zero code splitting**. AvatarThumbnail blocks Three.js split (in AppShell). Proposed 4-step plan in `ARCHITECTURE_AUDIT_2026-05.md §1.2` | `router.tsx`, `AppShell.tsx:15`, `AvatarThumbnail.tsx` |
| **ARCH-06** | 1 | OPEN | WorkbookConfig → ActivityConfig migration incomplete. **30 legacy refs** (was 34; 4 removed in recent cleanup). Planner cluster dominates (21 refs across 4 files). Migration not safe until planner migrated exclusively to activityConfigs. | `PlannerChatPage.tsx` (10), `PlannerCompactSetup.tsx` (4), `PhotoLabelForm.tsx` (4), `PlannerSetupWizard.tsx` (3), `firestore.ts` (5), plus 3 others |
| **ARCH-07** | 1 | **IN PROGRESS** | Ladder UI surfaces removed; `/ladders` → `/progress` redirect; `ladders/` dir + dead `LadderQuickLog` deleted; data layer (`ladderRef` tag, `ladderProgress` collection, `Ladder*` types) retained. PR open, awaiting review. | [PR #1263](https://github.com/barnes-ngb/first-principles-engine/pull/1263) — touched `router.tsx`, `TodayPage.tsx`, `TeachHelperDialog.tsx`, deleted `src/features/ladders/*` + `LadderQuickLog.tsx` |
| **ARCH-08** | 1 | OPEN (new) | `AvatarThumbnail.tsx` imports Three.js; used in AppShell — prerequisite for any bundle split | `AppShell.tsx:15`, `ContextBar.tsx:14`, `ChildSelector.tsx:10`, `ProfileMenu.tsx:15` |
| **ARCH-09** | 1 | **FIXED** | `ShellyChatPage` decomposition completed across [PR #1274](https://github.com/barnes-ngb/first-principles-engine/pull/1274) (state hook + `[FOLLOWUP]` parser) and [PR #1277](https://github.com/barnes-ngb/first-principles-engine/pull/1277) (flows + reflection module): **1,632 → 611L**, first tests added. The page is now a thin shell composing `useShellyChatState` + `useShellyChatFlows` + the actions/confirm-card write layer. _History:_ Decompose of `ShellyChatPage` proceeded in steps. **Step 1:** 23+ `useState`/`useRef` → `useShellyChatState`; `[FOLLOWUP]` parser → `parseFollowups` ([PR #1274](https://github.com/barnes-ngb/first-principles-engine/pull/1274)). **Decompose continued (this PR):** effects + flow handlers (send/response, image gen/refine, image analysis/attach upload cluster, thread CRUD) → **`useShellyChatFlows`**, and the branchy reflection-suggestion heuristics → pure **`reflectionSuggestions`**; the page is now a thin shell composing state + flows, **1,632→611L**, behavior-preserving (same `shellyChatThreads`/`shellyChatMessages` reads/writes, same props/route + CF shape, **no write capability added**). **Step 3a landed (no writes):** pure `parseChatActions` + `ChatAction` allowlist union + shared `src/core/utils/sanitizeJson` client port — all unwired (page untouched). **Step 3b landed (first portal writes):** `useShellyChatActions` (propose→confirm→write for sight words) + `ActionConfirmCard` inline confirm cards, wired into `useShellyChatFlows`' response handlers; shared `addSightWord`/`removeSightWord` writers added to `useSightWordProgress`; `<action>` grammar taught to the model via `buildSightWordActionAddendum` (child-tab only). Allowlist + active-child guards keep the write Tier-A/B only (no Tier-C reach); **no write before a confirm tap**; applied writes audited inline on the message (`appliedActions`). Profile-field (Step 4) + Tier-C snapshot writes still out of scope; ARCH-10 rules tightening should pair with this write portal (see `docs/SHELLY_PORTAL_CONTEXT.md §6`). Seams per `docs/SHELLY_PORTAL_CONTEXT.md §6`. | [PR #1274](https://github.com/barnes-ngb/first-principles-engine/pull/1274) + decompose PR + 3b PR — `src/features/shelly-chat/{ShellyChatPage,useShellyChatState,useShellyChatFlows,reflectionSuggestions,parseFollowups,parseChatActions,useShellyChatActions,ActionConfirmCard}` + `src/features/books/useSightWordProgress.ts` + `functions/src/ai/tasks/shellyChat.ts` |
| **ARCH-10** | 1 | OPEN | Security rules are one blanket `if isFamily(familyId)` write grant across all family data — kids' tablet sessions can write `hours`/`xpLedger`/`evaluations`; no field validation. A kid-UI bug could corrupt compliance data. **This is the FEAT-01 portal follow-on run:** now that Tier B writes (`children` soft fields via `editProfileField`, sight words) are live, the rules should constrain the portal's write surface — a dedicated run (partial adds are ineffective under Firestore OR-semantics). **Recon done** (`docs/ARCH-10_rules_hardening_plan.md`): rules tests proven to run **end-to-end in Claude Code web** (Java 21 + `npx firebase-tools` emulator + `@firebase/rules-unit-testing`, 3/3 assertions incl. the current shape-gap), CI gate goes in `ci.yml`; ~30 golden client writers across 28 collections must stay green; rules **cannot** distinguish kid vs parent (same family UID), so hardening = **shape validation only**; staged as 3 PRs (harness+tests+CI → narrow blanket write+shape blocks → optional economy). Build pending. | `firestore.rules:11-14` (blanket grant; stale `:29-31` was the redundant shellyChat block); plan: `docs/ARCH-10_rules_hardening_plan.md` |
| **ARCH-11** | 1 | **IN PROGRESS** | Client error reporting added — Firebase-native, privacy-first, **no third party / no heavy dep**. Global `window` `error` + `unhandledrejection` handlers and both error boundaries route through a central pure `scrubError()` (strips child names/content/quoted text/emails/URLs/ids → shape only) → rate-limited + de-duped `errorSink` → family-scoped `errorLog` collection with **anonymized (hashed)** user/child ids. Read-only parent **Diagnostics** tab in Settings. No `firestore.rules` change needed (the existing `families/{familyId}/{document=**}` catch-all already scopes `errorLog` to the owner). [PR #1291](https://github.com/barnes-ngb/first-principles-engine/pull/1291). | `src/core/observability/*` (scrubError + tests, errorSink + tests, reporter, anonymize, buildInfo, ErrorReporterSync); `components/{ErrorBoundary,SectionErrorBoundary}.tsx`; `main.tsx`; `app/App.tsx`; `features/settings/{SettingsPage,DiagnosticsTab}.tsx`; `firestore.ts`; `types/errorLog.ts` |
| **ARCH-12** | 1 | OPEN (new) | Three inline `skillSnapshots` writers (`EvaluateChatPage`, `useQuestSession`, `SkillSnapshotPage`) not yet migrated onto the central `skillSnapshotWrites.ts` — FUNC-02 Step 4 deferred. Finishing it makes the writer truly central and removes drift risk. | `src/features/evaluate/EvaluateChatPage.tsx`, `src/features/quest/useQuestSession.ts`, `src/features/evaluation/SkillSnapshotPage.tsx`, `skillSnapshotWrites.ts` |
| **TEST-01** | 1 | **ADDRESSED (shelly-chat); OPEN (progress, evaluation, dad-lab)** | `shelly-chat` confirmed **9 files / 57+ tests** as of 2026-05-31 audit: `parseFollowups`, `parseChatActions`, `parseFriction`, `reflectionSuggestions`, `useShellyChatState`, `useShellyChatActions`, `formatRelativeTime`, `logFeatureRequest`, `ShellyChatPage` shell. `progress`, `evaluation`, `dad-lab` still at 0. Highest-value next target: `DispositionProfile.tsx` has testable AI-narrative-parse + parent-override-merge logic. Second: `SkillSnapshotPage` snapshot merge path. | `src/features/shelly-chat/*.test.*` (confirmed 2026-05-31); remaining: `src/features/progress/DispositionProfile.tsx`, `src/features/evaluation/SkillSnapshotPage.tsx` |
| **TEST-02** | 1 | OPEN (new) | `BookEditorPage.cover.test.tsx` is a nondeterministic flake — passes in isolation, blips under full-suite load. Stabilize (fake timers / await the async cover render). | `src/features/books/__tests__/BookEditorPage.cover.test.tsx` |
| **FUNC-01** | 2 | **RESOLVED-WITH-DECISION** | Decided 2026-05-30: **Model 2 — layered ownership + named write-through.** `skillSnapshots` = current academic state (authority); `children` = stable identity; `childSkillMaps` = curriculum coverage; `activityConfigs` = position; `dispositionCache` = derived (not authoritative); Milestones computed; Ladders deprecated. Tier C portal green-lit. Full ruling + build prompt in `docs/review/DECISION_FUNC-01_source_of_truth.md`. | `DECISION_FUNC-01_source_of_truth.md` |
| **FUNC-02** | 2 | **FIXED** | Scan → Skill Snapshot write-through landed (commit `b60c3d6`, [PR #1281](https://github.com/barnes-ngb/first-principles-engine/pull/1281), awaiting review). New central writer `src/features/evaluate/skillSnapshotWrites.ts` — pure `applyToSnapshot` reducer (additive, block-merging by slugified skill name, idempotent, never downgrades, leaves RESOLVED/DEFER untouched, tolerates a missing snapshot) + thin `writeSnapshotUpdate` Firestore writer (writes only on change, strips `undefined`). Wired into both scan paths: certificate (`useCertificateProgress.applyUpdate` folds `suggestedSnapshotUpdate.masteredSkills`, RESOLVED when the milestone reads complete) and worksheet (`CertificateScanSection` advances blocks for skills the scan reports "ahead"). Both best-effort/non-blocking. 17 reducer unit tests. Verified green: root vitest 2117 ✓, functions 405 ✓, tsc + lint clean. The three inline snapshot writers (eval apply / quest end / manual edit) were intentionally **not** migrated onto the new module — tracked separately as **ARCH-12** (FUNC-01 hardening). | `src/features/evaluate/skillSnapshotWrites.ts` (+ `__tests__/skillSnapshotWrites.test.ts`); `useCertificateProgress.ts:240-256`; `CertificateScanSection.tsx:78-96` |
| **FUNC-03** | 2 | **FIXED** | Tier A "Knowing" complete + merged ([PR #1275](https://github.com/barnes-ngb/first-principles-engine/pull/1275)). Added the `childSkillMap` read slice to `shellyChat` only — `loadChildSkillMapContext` + pure `formatChildSkillMap` (template: `loadSkillSnapshotContext`). Compact COVERAGE block: tracked-node totals by status, per-domain counts, current frontier (in-progress names), recently-advanced nodes — coverage, NOT per-skill grades (snapshot owns levels). Omit-on-empty. **Read-only** — no `childSkillMaps` write introduced (owned by `updateSkillMapFromFindings`). Role-section nudge names `CURRICULUM MAP / COVERAGE`. Cross-task isolation test pins it to `shellyChat`. Tier A "Knowing" complete. | [PR #1275](https://github.com/barnes-ngb/first-principles-engine/pull/1275) — `contextSlices.ts` (slice + loader + formatter), `tasks/shellyChat.ts` (prompt nudge), `contextSlices.test.ts` / `shellyChat.test.ts`; recon in `docs/SHELLY_PORTAL_CONTEXT.md §1` |
| **ETHOS-01** | 3 | OPEN (resolved-for-shellyChat) | **Verified for the portal surface:** `shellyChat` already carries `CHARTER_PREAMBLE` end-to-end — `"charter"` is the first slice in its list (`contextSlices.ts:68`), `buildContextForTask` prepends `CHARTER_PREAMBLE` when slices include `"charter"` (`contextSlices.ts:324-325`), and the handler builds `systemPrompt` from that shared context (`shellyChat.ts:235,242,451`). No change needed for the write-capable chat. Still open elsewhere: charter preamble absent from 5/17 task types — `generateStory`, `reviseStory`, `revisePage`, `quest`, `scan` (story trio highest concern). | `contextSlices.ts:56-58,55,66`; `generateStory.ts`, `revisePage.ts`, `reviseStory.ts` |
| **FEAT-01** | 2 | IN PROGRESS | Shelly Chat control portal — see `barnes-shelly-chat-portal-design.md`. Ask AI becomes Shelly's read+assist+write portal via the proven AI-proposes → human-confirms → one-writer-commits loop (no tool-use). **Tier A (read)** done (FUNC-03 — `childSkillMaps` slice). **Tier B (write) COMPLETE:** sight words (Step 3b) + **profile soft fields (Step 4 — `editProfileField` for `motivators`/`interests`/`strengths` only)**. **Step 5a (silent friction capture) SHIPPED:** `featureRequests` collection + `parseFriction` + `logFeatureRequest` + `<friction>` grammar (`buildFrictionCaptureAddendum`) — silent-by-design feedback metadata, **separate from `applyChatAction`**, deduped by `dedupKey`. **Step 5b (auto-issue routine) SHIPPED — the feedback loop now runs end-to-end:** the scheduled `fileFeatureRequests` CF (`functions/src/feedback/`, daily 08:00 CT) reads `'new'` entries, opens one GitHub issue per distinct want via GitHub REST (`fetch`, no Octokit — the only repo code that talks to GitHub), writes back `status:'filed'` + `githubIssueUrl`, with belt-and-suspenders dedup and safe degradation when the `GITHUB_PAT` secret is unset. **Activation needs one one-time human secret step** (create a fine-grained PAT, `firebase functions:secrets:set GITHUB_PAT`) — see `docs/SHELLY_PORTAL_FEEDBACK_LOOP.md` §0; until then the routine is a harmless no-op. Step 4 added the `editProfileField` `ChatAction` kind (the `field` literal IS the allowlist — `supports`/`grade`/Tier-C paths unrepresentable + rejected by `parseChatActions`), a single shared `updateChildSoftProfile` writer (Settings + chat go through it — no fork), routed through `applyChatAction` under the same active-child guard, with a before→after `ActionConfirmCard` preview and `<action>` grammar taught to the model. `supports` stays **Tier C** (lives on `skillSnapshots`). **Next portal run:** Tier C (snapshot writes) — unblocked now FUNC-02 is FIXED; and **ARCH-10** rules hardening (the dedicated rules run that should pair with the now-live write portal). Closes ARCH-09 + TEST-01 + ETHOS-01 along the way. Phase-1 build prompt in the design doc §9. | `src/features/shelly-chat/`, `src/core/family/updateChildSoftProfile.ts`, `functions/src/ai/tasks/shellyChat.ts`, `functions/src/ai/contextSlices.ts`; grounded in `docs/SHELLY_PORTAL_CONTEXT.md` + `docs/SHELLY_PORTAL_FEEDBACK_LOOP.md` |
| **DATA-02** | 4 | NEEDS-DATA | Possible duplicate hours backfill: near-identical 5-subject batches dated 2025-07-15 & 2025-08-15 | de-dupe `hoursAdjustments` on (date,subject,minutes,reason) — requires live Firestore export |
| **DATA-03** | 4† | **RESOLVED (2026-05-31)** | **Firebase console confirms daily Firestore backups are enabled with 98-day retention — records ARE recoverable.** The investigation found no backup config *in the repo* (no scheduled exports, backup CF, or PITR in code — full sweep of root, `functions/`, `firebase.json`, `.firebaserc`, `scripts/`, `.github/workflows/`; only **manual** `gcloud firestore export`/`import` *docs* in `08_RUNBOOK.md:89-101`), but the backup is configured **console-side** (managed by Google, not version-controlled — the right answer for a single-family app). Console-confirmed from phone: scheduled daily backups on, 98-day retention window. The app is Lincoln's legal MO record and there **is** now a recovery path: a 98-day-deep daily backup. **PITR (point-in-time recovery, ~7-day window) remains available as an optional enhancement** for finer-grained sub-day recovery — a nice-to-have, **not a gap**: `gcloud firestore databases update --database='(default)' --enable-pitr`. Compliance **export** path (separate concern from backup) verified working: `RecordsPage.tsx` `handleExportHoursCsv`/`handleExportPortfolioMd`/daily-log/eval-MD/zip handlers intact (export = printable copy for the state; backup = survive a data disaster). | repo-wide sweep + Firebase console (daily backups, 98-day retention). Investigated via `prompts/PROMPT_BACKUP_CHECK.md` |
| **DOC-01** | 1 | OPEN | Claude.ai project still points at MASTER_OUTLINE **v14** (Mar 31); repo is **v15**. Repoint at `PROJECT_CONTEXT.md` | this project's loaded context |
| **DOC-02** | 1 | **FIXED** | Operating model (how AI sessions are assigned work, branch+PR-never-merge, propose-and-confirm invariants, ledger-as-backlog, two-chat ownership split, routines-detect-humans-assign, phone-first) documented as a new top-level `## AI Development Operating Model` section in `CLAUDE.md`, with a pointer added to `docs/PROJECT_CONTEXT.md` so design chats inherit it. Additive only — no existing code/convention sections rewritten. Branch `docs/ai-operating-model`. | `CLAUDE.md` › AI Development Operating Model; `docs/PROJECT_CONTEXT.md` Operating model pointer |
| **ARCH-13** | 1 | OPEN (new 2026-05-31) | `useShellyChatFlows.ts` grown to 1,123L since ShellyChatPage decomposition. 19 handler functions: send/response cluster, image gen/refine, image analysis/upload, thread CRUD. Not urgent but on the watch list. Seams if needed: image cluster (~300–550), thread CRUD (~900–1050). | `src/features/shelly-chat/useShellyChatFlows.ts` |
| **ARCH-14** | 1 | OPEN (new 2026-05-31) | `contextSlices.ts` grew from 1,325L → 1,485L (+160L), crossing the +150L drift threshold. Contains 20+ slice loaders for all task types. Candidate split: domain-group loaders into `contextSlices.curriculum.ts`, `contextSlices.books.ts`, `contextSlices.family.ts`; keep main file as TASK_CONTEXT registry + re-exports. Architectural decision required first. | `functions/src/ai/contextSlices.ts` |
| **DOC-03** | 1 | **FIXED (2026-05-31)** | `HEALTH_REPORT.md` listed `ShellyChatPage.tsx` at 1,653L (pre-decomposition). Actual size is 645L. Also listed `useShellyChatFlows.ts` (new, 1,123L) and updated `contextSlices.ts` count (+160L). Applied directly as mechanical doc correction. | `docs/HEALTH_REPORT.md` — large-file table + decomposition-candidates table |
| **LINT-01** | 1 | WONTFIX? | 3 `react-hooks/exhaustive-deps` warnings (intentional timer-ref pattern) | `EvaluateChatPage.tsx:282`, `useQuestSession.ts:679,1760` |

† DATA-01 and DATA-03 were in band 4 by topic but **promoted to top of queue**: DATA-01 as compliance- and time-sensitive (June 30); DATA-03 because the app is Lincoln's only legal MO record and a data-loss recovery path had to be confirmed. DATA-03 is now **RESOLVED** — Firebase console confirms daily backups (98-day retention).

## 7. Triggers (phone-first cheat-sheet)

Everything below is either fully automatic or a single short message pasted into Claude Code web.
No local commands, ever.

### Fully automatic (set once)
- **Monthly audit** — scheduled Claude Code task, same as the /3-day health audit. Task prompt:
  > Read `docs/review/prompts/PROMPT_ARCH_AUDIT.md` and execute it fully.

  Suggested schedule: 1st of the month, after the health audit. It auto-applies safe doc fixes and
  opens a PR for everything else. You just review + merge from the phone.

### One-line triggers (paste into Claude Code web on the repo)
- **Run a fix** (you pick the issue ID from §6):
  > Read `docs/review/prompts/PROMPT_FIX.md` and run it for ISSUE_ID: DATA-01

- **Run the audit now** (off-schedule, e.g. before a design session):
  > Read `docs/review/prompts/PROMPT_ARCH_AUDIT.md` and execute it fully.

- **Just triage / ask** (in the Claude.ai home-base chat, not Claude Code):
  > Read REVIEW_HOME_BASE.md and the latest audit report. What should I fix next and why?

### What is and isn't automated (by design)
- **Auto, no touch:** the audit, stat/doc corrections, PR creation.
- **One tap from you:** merging any PR.
- **Deliberately manual:** fixes that change real code or data — compliance hours, XP ledger, charter
  preamble. These propose-and-stop so a human decides. That's a safety feature for a system holding a
  child's school records, not a gap to close.



## 8. Conventions for this system

- **Design here, build there.** This home base produces decisions and prompts. Claude Code makes the code changes, always on a branch, always reviewed before merge.
- **Inspect → validate → propose for anything touching an invariant.** Hours math, XP ledger, and the additive-hours rule are never auto-fixed. They land as a proposal in the ledger for a human call.
- **One issue ID per fix run.** Keeps PRs small and reviewable.
- **Ledger is the memory.** If it isn't in the ledger, it didn't happen. Every audit and fix updates it.
- **Environment is Claude Code web, phone-first.** Nathan rarely runs anything locally. Claude Code web executes all builds/lint/tests/git in its own environment as part of running a prompt. No prompt should ask the human to run a command, install tooling, or use a local shell. The human's actions are limited to: pasting a prompt, uploading files, and reviewing/merging PRs from the phone.
