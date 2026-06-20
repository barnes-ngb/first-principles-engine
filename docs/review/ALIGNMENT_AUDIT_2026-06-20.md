# Documentation–Code Alignment Audit — 2026-06-20

> **Scope:** Full crawl of all 104 documentation files against actual codebase.
> **Build:** ✅ tsc clean, lint clean, 2,746 tests passing (181 files), 0 failures.
> **Branch:** `docs/alignment-audit-2026-06-20`

---

## 1. Mechanical Stat Drift (AUTO-FIXED in this PR)

| File | Field | Was | Now | Fix |
|------|-------|-----|-----|-----|
| README.md | Test count | 958 | 2,746 | ✅ |
| README.md | Component files | 22 | 36 | ✅ |
| README.md | Cloud Functions | 19 | 25 | ✅ |
| README.md | Feature dirs | "kids, ladders" | "evaluation, monthly-review" | ✅ |
| CLAUDE.md | BookEditorPage.tsx | 2,278L | 2,103L | ✅ |
| CLAUDE.md | MyAvatarPage.tsx | 1,875L | 1,876L | ✅ |
| CLAUDE.md | ShellyChatPage.tsx | 645L | 647L | ✅ |
| CLAUDE.md | Bundle size | 3.8MB/1.1MB | 3.9MB/1.2MB | ✅ |
| MASTER_OUTLINE.md | TS lines | 179,214 | 180,429 | ✅ |
| MASTER_OUTLINE.md | Commits | 119 | 117 | ✅ |
| MASTER_OUTLINE.md | Test files | 178 | 181 | ✅ |
| REVIEW_HOME_BASE.md | All §5 stats | June 2 baseline | June 20 verified | ✅ |
| Testing guide v2 | Node.js version | 18+ | 20+ | ✅ |
| Testing guide v2 | npm version | 9+ | 10+ | ✅ |

---

## 2. SYSTEM_PROMPTS.md — Substantive Gaps (NEEDS HUMAN-ASSIGNED FIX)

`docs/SYSTEM_PROMPTS.md` (v4, last updated 2026-06-09) has significant drift from actual code.
This is the highest-priority documentation fix.

### 2a. Missing context slices (38% undocumented)

Documentation lists 13 context slices; code in `contextSlices.ts` defines 21. Missing from docs:

| Slice | Used by | Impact |
|-------|---------|--------|
| `activityConfigs` | plan, scan, shellyChat | Curriculum pacing context |
| `childSkillMap` | shellyChat | Coverage-aware AI responses |
| `dadLabReports` | weeklyReview | Dad Lab evidence in reviews |
| `dayToday` | plan | Current-day context |
| `mastery` | plan | Mastery-level context |
| `recentHistoryByDomain` | plan, quest, scan, disposition | Foundational adaptive context |
| `recentScans` | plan, quest, scan | Scan history for AI |
| `skillSnapshot` | plan, quest, scan, disposition | Core child state for AI |

### 2b. Incorrect "self-loading" characterization

Two tasks marked "self-loading" in §3 actually use `buildContextForTask`:
- **`disposition`** — loads 7 shared slices
- **`shellyChat`** — loads 14 shared slices

Only 4 tasks are truly self-loading: `conundrum`, `weeklyFocus`, `chapterQuestions`, `monthlyReview`.

### 2c. Missing task handler documentation

§4 documents 15 of 19 task types. Missing:
- `reviseStory`
- `chapterQuestions`
- `bookLookup`
- `lessonVideo`
- `monthlyReview`

### 2d. Incomplete model selection table

Main table (§2) lists 16 Sonnet tasks but code assigns Sonnet to 19. Missing: `reviseStory`, `monthlyReview`.

**Recommended action:** Assign a fix run targeting `SYSTEM_PROMPTS.md` with the above as a checklist. This is mechanical doc work — no code changes needed.

---

## 3. Testing Guide v2 — STALE (NEEDS REWRITE)

`docs/barnes-testing-guide-v2.md` was last updated 2026-03-07 (3.5 months ago). It covers:
- ✅ Weekly planning, daily execution, evaluation, Dad Lab, records/compliance
- ❌ Missing: Knowledge Mine, Workshop, Books/BookEditor, Armor/Avatar, Shelly Chat, Monthly Books, Voice Input, Stonebridge, curriculum map, scan pipeline

The HEALTH_REPORT already flags this. Recommend a full v3 rewrite as a ledger item.

---

## 4. PROJECT_CONTEXT.md — Correctly Marked STALE

Last generated 2026-05-29 (22 days). REVIEW_HOME_BASE Tier 3 is supposed to regenerate weekly.
Either the Tier 3 routine isn't running or its output isn't landing. Worth investigating.

---

## 5. Document Organization Assessment

### What's working well

- **CLAUDE.md** is comprehensive and accurate (minor stat drift fixed above). The single-file convention doc approach works well for AI sessions.
- **DOCUMENT_INDEX.md** is thorough — all 77 non-archive docs indexed with accurate status labels.
- **Review ledger system** (REVIEW_HOME_BASE §6) provides good issue tracking with clear ownership.
- **Archive separation** is clean — 12 obsolete docs properly filed under `docs/archive/`.
- **Design doc discipline** is strong — each major feature has a dated design doc with clear phase tracking.
- **Decision records** exist for settled architecture choices (DECISION_FUNC-01).

### Structural concerns

1. **Documentation volume is high (104 files, ~24k lines).** The 4-tier maintenance system keeps it honest, but some docs serve overlapping purposes:
   - `MASTER_OUTLINE.md` and `HEALTH_REPORT.md` both track the same scale stats
   - `FIRESTORE_AUDIT.md` is marked stale because CLAUDE.md now owns the collection table
   - `PROJECT_CONTEXT.md` is a synthesis of other docs — if Tier 3 isn't regenerating, it becomes a stale mirror

2. **Investigation docs accumulate.** 8 investigation files (crash, working levels, skip inventory, capture pipeline, etc.) are historical one-shots. Consider moving resolved investigations to `docs/archive/` to reduce noise:
   - `KNOWLEDGE_MINE_CRASH_INVESTIGATION_2026-04-07.md` (RESOLVED)
   - `CAPTURE_PIPELINE_INVESTIGATION_2026-04-07.md` (RESOLVED)
   - `HERO_HUB_ANIMATION_PR_QUEUE_TRIAGE_2026-04-07.md` (RESOLVED)
   - `HERO_HUB_DEPLOY_AUDIT_2026-04-07.md` (RESOLVED)
   - `WORKINGLEVELS_INSPECTION_2026-04-09.md` (no code changes)

3. **Audit docs from April are historical but not archived.** `CLEANUP_AUDIT_2026_04_07.md`, `LEARNING_ENGINE_AUDIT_2026-04.md`, and `KNOWLEDGE_MINE_AUDIT_2026-04.md` served their purpose and could move to archive with a forwarding note.

---

## 6. Code Scoping Assessment

### Well-scoped areas
- **Feature module boundaries** are clean — 21 directories, each owning its UI + logic.
- **Core module separation** is sound — types, hooks, utils, firebase, xp, curriculum all have clear single-responsibility.
- **Cloud Functions structure** maps cleanly to task types with a central dispatch.
- **Shelly Chat decomposition** (ARCH-09) is a model: 647L page shell, state/flows/actions/pure-modules cleanly separated.

### Areas to watch

1. **`contextSlices.ts` (1,566L, +241L cumulative growth)** — CLAUDE.md already flags this. 21 slice loaders in one file is approaching the threshold where a domain-group split (e.g., `slices/child.ts`, `slices/curriculum.ts`, `slices/history.ts`) would improve navigability. Not urgent but trending.

2. **`chat.ts` CF (2,548L)** — Still the highest-leverage decomposition target. `buildQuestPrompt` (400+L) and other prompt builders could be co-located with their task handlers in `tasks/`. This would reduce `chat.ts` to dispatch + shared utilities.

3. **`PlannerChatPage.tsx` (2,669L, +42L this cycle)** — Growing slowly but consistently. The interconnected wizard/chat/plan/apply state makes splitting genuinely hard, but the upward trend means it'll cross 3,000L within a few months.

4. **Test coverage gaps** — Features with 0 test files: `progress`, `planner`, `dad-lab`, `auth`. The `progress` module is a multi-tab aggregation view that deserves at least snapshot/integration tests. `dad-lab` has a full lifecycle flow worth covering.

---

## 7. Architecture & Methodology Recommendations

### High priority

1. **Fix SYSTEM_PROMPTS.md** — The 38% context-slice documentation gap means AI sessions building new tasks or modifying context loading can't trust the docs. This is the single most impactful doc fix. Ledger it as `DOC-xx`.

2. **Bundle code-splitting** — 3.9MB main chunk is repeatedly flagged. Route-level `React.lazy` for the heaviest features (avatar/Three.js, books/jsPDF, quest, workshop) would cut initial load significantly. This is an architectural decision that should be recorded as a decision doc when made.

3. **Dead `ladders` collection query** — `functions/src/ai/generate.ts` still queries a collection that's never written to. Trivial cleanup, safe to remove.

### Medium priority

4. **Consolidate stat tracking** — MASTER_OUTLINE, HEALTH_REPORT, and REVIEW_HOME_BASE all carry scale stats. Consider making HEALTH_REPORT the single source and having the others reference it, reducing the surface area for drift.

5. **Archive resolved investigations** — Move the 5 RESOLVED investigation docs to `docs/archive/` to keep the docs/ directory focused on current reference material.

6. **Testing guide v3** — The current guide covers ~40% of features. A rewrite organized by user flow (parent daily, kid daily, AI chat, avatar/XP, books, records) with the 8 missing features would be valuable for manual testing.

7. **WorkbookConfig → ActivityConfig migration completion** — CLAUDE.md notes ActivityConfig is primary (106 refs vs 34). The remaining 34 workbookConfig references are a persistent source of confusion for AI sessions.

### Low priority / watch items

8. **`contextSlices.ts` domain split** — Not urgent at 1,566L but worth planning before it hits 2,000L.

9. **Tier 3 routine health** — Verify `PROJECT_CONTEXT.md` weekly regeneration is actually running. If not, either fix the routine or remove the stale doc.

10. **`sanitizeJson` duplication** — CLAUDE.md notes deliberate client/server duplication with a TODO to consolidate. If both implementations are stable and tested, either consolidate or remove the TODO to stop it appearing in reviews.

---

## 8. What's NOT broken

For a 180k-line codebase with 25 Cloud Functions and 37 Firestore collections, the documentation discipline is exceptional:

- **CLAUDE.md accuracy:** 96%+ — only 4 minor line-count drifts and 1 bundle-size rounding
- **Feature coverage:** All 21 feature modules documented with accurate descriptions
- **Collection table:** 37/37 collections documented with correct purposes
- **Cloud Functions:** 25/25 documented with correct names and descriptions
- **Navigation:** Code nav matches MASTER_OUTLINE exactly (verified by HEALTH_REPORT)
- **Charter alignment:** All 19 chat tasks verified to reference charter context
- **Index completeness:** All docs indexed, no orphans on disk
- **Archive hygiene:** Clean separation of obsolete docs

The 4-tier maintenance system (health audit → fix companion → context gather → deep audit) is working as designed for mechanical drift. The gaps found here are all in areas that require human judgment (SYSTEM_PROMPTS substantive content, testing guide feature coverage, architecture decisions).
