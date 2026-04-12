# Barnes Family Homeschool — Master Project Outline v15

**Version:** v15 — April 12, 2026  
**Status:** Updated since v14 — Hero Hub reframe, two-currency economy hardening, Stonebridge narrative foundation, armor progression gating, capture pipeline unification, working levels, chapter book pool, and Lincoln Acceleration Sprint 1 (UFLI Foundations).

## Project Summary
Homeschool management app for the Barnes family: Shelly (parent, fibromyalgia), Nathan (dad, builder), Lincoln (10, neurodivergent, speech challenges), London (6, drawing/story-first).

---

## North Star: Lincoln Acceleration (April–July 2026)

Everything else pauses. Lincoln's reading is the #1 priority for the next 3 months.

**Goal:** Move Lincoln from UFLI Lesson 62 → Lesson 90+ by end of July 2026 using structured phonics (UFLI Foundations) with the Phonics Forge guided flow.

**Key decisions:**
- UFLI Foundations is the backbone — 128 lessons, systematic scope & sequence
- Lincoln starts at Lesson 62 (VCe Review 3; Exceptions) — assessed anchor point
- Shelly delivers lessons using free UFLI Toolbox PDFs + the app's tracking layer
- Weekly encoding checks gate advancement (not time-based)
- Minecraft "Phonics Forge" theming on kid-facing UI

**Reference:** See `docs/LINCOLN_ACCELERATION.md` and `docs/UFLI_INTEGRATION.md` for full design.

**Tech:** React + TypeScript + Vite, Firebase (Auth/Firestore/Storage/Functions/Hosting), MUI, Claude + OpenAI image stack.

**Scale (current):**
- TypeScript lines: **124,045** total (`src/` 111,106 + `functions/src/` 12,939)
- Commits: **~1,541**
- Tests: **52 test files**
- Firestore collections: **34** (32 family-scoped + 2 global)
- Cloud Functions: **18**
- Chat task types: **14**
- Routes: **27**

## Navigation
**Parent:** Today, Plan My Week, Weekly Review, Progress, Records, Books, Ask AI, Game Workshop, Dad Lab, Settings  
**Kid:** Today, Knowledge Mine, Game Workshop, My Books, **Hero Hub**, Dad Lab

---

## What's Built and Working

### Hero Hub (formerly My Armor)
- Reframed from a settings-style page into a **place** with identity + mission focus.
- Above-the-fold order: hero render → mission card → Stonebridge preview → stat row.
- Mission state progression implemented for hub card logic: **Suit Up → Conundrum → Chapter → Hero Ready**.
- Stonebridge preview surfaces current chapter/conundrum context.
- Existing customization controls are preserved below the fold.

### 3D Avatar — Armor of God System
- Family-tuned voxel proportions: `headSize 1.8`, `torsoW 1.7`, `armW 1.0`, `legH 2.8`, `sleeveRatio 0.7`, `bootRatio 0.3`.
- Sleeves + forearm split with wrist wraps.
- Boots include lower-leg band (lower ~30%).
- Cape defaults on all characters with gentle sway.
- Tunic details: collar, trim band, cloth belt + buckle, skirt, shoulder pads.
- Thin dark edge outlines on character + armor blocks (Legends readability pass).
- Open-face helmet design keeps face visible.
- Shield position fixed in front of arm (no torso clip).
- Ghost armor visuals removed (binary equipped/hidden model).
- Lighting overhaul: warm key, cool fill, gold rim, bounce fill.
- `MeshPhongMaterial` baseline with tier-specific specular/emissive tuning.
- Scene polish: gradient sky, floating gold particles, stone pedestal with edge glow.
- Idle loop includes breathing, arm sway, head micro-movement, and cape sway.

### Accessories System
- 10 cosmetic accessories unlocked at XP milestones.
- Slot model: eyes, head, back, hand, shoulder, neck.
- Conflict rules applied (e.g., helmet hides crown, shield hides book).
- Persisted on profile at `customization.accessories`.

### Brothers View
- Toggle to render Lincoln + London side-by-side.
- Shared 3D scene with synchronized pose actions.
- Each child keeps independent armor/customization state.

### Night / Room Background Toggle
- **Night (default):** dark sky + moon/stars.
- **Room:** Minecraft-style interior (stone walls, wood floor, torch glow, crafting table, chest).
- Persisted at `customization.background`.

### Two-Currency Economy (XP + Diamonds)
(Reference docs: `docs/ECONOMY_AUDIT_PART1.md`, `docs/ECONOMY_AUDIT_PART2.md`.)

- XP = passive progression (tier unlock axis); Diamonds = active spend currency.
- Current voxel tier thresholds: Wood 0, Stone 200, Iron 500, Gold 1000, Diamond 2000, Netherite 5000.
- Forge model: spend diamonds once to forge piece, then equip toggle is free.
- `addXpEvent()` and `addDiamondEvent()` are the intended award gateways (dedup + transactional-safe patterns).
- Parent admin UI supports manual awards/deductions across both currencies.
- `xpLedger` stores both currencies via `currencyType`.
- `diamondBalance` cache/read-path work added for responsive UI.
- Lincoln backfill applied to restore fair early-progress economics.

### Armor Progression Gating
- **Loose gate** — next-tier pieces visible but locked with clear reason text (aspirational, not hidden).
- **Dual requirement** — both XP threshold AND prior tier fully forged needed to unlock next tier.
- **`forgedPieces[]`** field on AvatarProfile (distinct from `equippedPieces`).
- **Migration backfill** — infers forged pieces from current equipped state + ledger history.
- **`armorGate.ts`** with `isTierComplete()`, `canForgePiece()`, `getHighestCompletedTier()`.
- **Milestone rewards** — diamond bonuses on tier completion: Wood 20, Stone 30, Iron 50, Gold 75, Diamond 120, Netherite 200.
- **Daily Suit Up** — based on OWNED pieces, not all 6 total (can't equip what you haven't forged).
- **Phantom piece fix** — gate counts from active forge tier down, ignoring stale data in higher tiers.

### Stonebridge Narrative Foundation
- Canonical narrative bible documented at `docs/STONEBRIDGE_BIBLE.md`.
- Shared world model with recurring places/characters (designed for continuity over novelty).
- Imported into Cloud Functions prompt context (`functions/src/ai/stonebridgeBible.ts`).
- Chapter question and conundrum generation now use Stonebridge context.
- Sets continuity foundation for Banner Rally mission layer.

### UFLI Foundations — Lincoln Acceleration (Sprint 1)
- 128-lesson scope & sequence seeded as static data (`functions/src/data/ufliLessons.json`).
- `UFLILesson` + `UFLIProgress` types in `src/core/types/ufli.ts`.
- Per-child UFLI progress tracking (`families/{familyId}/children/{childId}/ufliProgress/current`).
- UFLI lesson collection (`families/{familyId}/ufliLessons/{lessonNumber}`).
- Settings > UFLI Progress admin tab — view/adjust current lesson, mastered count, encoding scores.
- Parent Today: "Lincoln's UFLI Lesson" card — shows current lesson, graphemes, heart words, toolbox link, mark-complete.
- Kid Today: "Phonics Forge" Minecraft-themed card — shows quest label, tapping shows toast ("Shelly will open this with you").
- Migration script for seeding lesson data (`functions/src/migrations/seedUfliLessons.ts`).

### Chapter Book Progress Tracking (Chapter Pool P1-P3)
- Chapter Question Pool card — book picker in planner generates per-chapter questions into a pool. Today renders unanswered chapters as tappable chips; picked chapters stack with audio recording per chapter. Progress persists across weeks.
- `useBookProgress` hook — live `onSnapshot` subscription on `bookProgress/{childId}_{bookId}` doc. Provides `updateChapter` callback for atomic pool entry updates.
- `ChapterQuestionPool` component — four render states: no book selected, loading (pool generation in flight), in-progress (chapter picker + stacked cards), complete (celebration).
- Per-chapter audio recording uses shared `useAudioRecorder` hook. Save flow writes to Storage + `chapterResponses` + `artifacts` + `bookProgress`.
- Legacy `ChapterQuestionCard` deleted. `DayLog.chapterQuestion` deprecated (reads only, no new writes). `DraftDayPlan.chapterQuestion` removed.

---

### Paused for Lincoln Acceleration
- Math Quest (Knowledge Mine math domain expansion)
- Speech Quest (Knowledge Mine speech domain)
- London's Avatar customization UI
- Avatar Customization UI polish
- Barnes Bros dashboard

---

## What's Built but Untested with Real Users
- Full Hero Hub mission-state cycle end-to-end across multiple weeks.
- Brothers View sustained usage (especially London-led sessions).
- Stonebridge continuity quality over 2–3 week narrative runs.
- Diamond economy pacing over sustained real usage (earn/spend cadence).
- Edge-outline render performance on lower-end mobile tablets.

## What's Not Built Yet — Priority Queue
1. **Banner Rally missions (Hero Hub Phase 2)** — adaptive reading missions in Stonebridge.
2. **Restoration Map (Phase 2)** — village repair nodes and progress map.
3. **In-app character tuner** — slider playground directly in production UX.
4. **Curriculum scanning expansion** — workbook photo → AI skill mapping refinement.
5. **Eval close-the-loop automation** — re-eval triggers from engagement patterns.
6. **Math evaluation parity** — reading-style evaluation flow for math.
7. **London-specific evaluation flow** — age-adjusted assessment UX.
8. **Tier-up ceremony** — armor shatter / reveal celebration on tier transitions.
9. **Screenshot & share** — export avatar to PNG.
10. **Minecraft skin export** — 64x64 skin output from avatar config.
11. **Seasonal themes** — date-aware winter/fall/Christmas/Easter theming.

---

## Sprint History (Since v14)

| Sprint | Date | Outcome |
|---|---|---|
| Phase 2-3 Polish | Apr 2026 | XP toasts, tier-up ceremony, armor detail, scene polish, London avatar with younger proportions |
| Parent XP Mgmt | Apr 2026 | XP dashboard, award/adjust UI with presets |
| Legends Overhaul | Apr 2026 | Lighting, materials, gradient sky, particles, pedestal, dye/enchant glow/cape/emblem |
| Proportions Playground | Apr 2026 | In-chat slider tuner, Lincoln designed his own character, family-approved values applied |
| Edge Outlines + Mobile Fix | Apr 2026 | EdgesGeometry on all blocks, accessories grid overflow fixes, pose button truncation |
| Ghost Armor Removed | Apr 2026 | Binary on/off visibility only |
| Shield/Helmet Fix | Apr 2026 | Open-face helmet (5 pieces), shield positioned in front of body |
| Dream Features | Apr 2026 | Accessories (10 items), screenshot/share, Minecraft skin export, seasonal themes |
| Economy Audit | Apr 2026 | 2-part read-only audit, 7 bugs identified, pacing math, fix plan |
| Economy P0 Fixes | Apr 2026 | Consolidated voxel tier system, addXpEvent for admin, valid XP_EVENTS keys, transactional spendDiamonds, WOOD default tier |
| Economy P1 Fixes | Apr 2026 | WEEKLY_ALL_COMPLETE wired, BOOK_PAGE_READ wired, diamonds on evals, chapter response earning, conundrum dedup split |
| Economy P2 Cleanup | Apr 2026 | Cached balance used everywhere, forge helpers extracted to shared util |
| Diamond Gateway | Apr 2026 | addDiamondEvent(), DIAMOND_EVENTS constants, parent admin UI, spendDiamonds uses gateway |
| Phase 1A Stonebridge | Apr 2026 | Story bible, AI prompt injection for conundrum + chapter questions |
| Phase 1B Hero Hub | Apr 2026 | Nav rename, mission card, Stonebridge preview, above/below-fold layout |
| Armor Progression Gate | Apr 2026 | forgedPieces tracking, isTierComplete, canForgePiece, milestone bonuses, loose gate UI |
| Suit Up Bug Hunt | Apr 2026 | Tier display fixed (compute from XP), suit up counts owned pieces, phantom tier data bug fixed |
| Crash Cascade Stabilization | Apr 7, 2026 | Quest graceful error paths, `/quest` error boundary, AvatarThumbnail WebGL safety |
| Unified Capture Pipeline | Apr 8, 2026 | Merged 3 Today capture entry points into 1 AI-routed handler. Worksheets/textbooks/tests → scans + curriculum update; everything else → artifacts. Fixes "Last updated" staleness on Progress. |
| Scan Analysis + Parent Override | Apr 9, 2026 | Post-capture scan analysis visible inline on Today (expandable panel on "Captured ✓"). Progress Recent scans now tap-to-expand. New "This Week's Scans" section on Progress — 7-day rolling list. Parent override on AI recommendations — Shelly can correct classifications, originals preserved for audit. Shared ScanAnalysisPanel component. |
| Kid Unified Capture | Apr 9, 2026 | Extended unified capture pipeline to kid views. KidTodayView now uses shared `useUnifiedCapture` hook — Lincoln's captures route through AI scan, update curriculum, and appear in Shelly's Progress view identically to parent captures. Kid-friendly feedback (snackbar, no analysis panel). |
| Working Levels Data Model | Apr 9, 2026 | Per-domain working level tracking for Knowledge Mine progression (phonics/comprehension/math). Starting levels persist across sessions via `workingLevels` field on skill snapshot. Updated by quest completion, guided evaluation, and curriculum scans. Manual overrides protected for 48 hours. Fixes "starts at Level 2 every session" regression. (Part 1 — plumbing only; parent UI in Part 2.) |
| Bugfix Apr 10 | Apr 10, 2026 | Planner lock-in off-by-one: Friday plans were written to Thursday's date key because WEEK_DAYS (Monday=0) was added to a Sunday-based weekRange.start. Extracted `dateKeyForDayPlan` pure helper + unit tests. |
| Chapter Pool P1 | Apr 10, 2026 | Chapter book question pool foundation: ChapterBook + BookProgress types, Narnia seed data (17 chapters with summaries), chapterQuestions Cloud Function task handler, Firestore collection helpers. |
| Lincoln Acceleration Sprint 1 | Apr 11, 2026 | UFLI Foundations data layer: 128-lesson scope & sequence JSON, UFLILesson + UFLIProgress types, per-child progress tracking, ufliLessons Firestore collection, Settings admin tab, parent Today lesson card, kid Phonics Forge card, migration script. Lincoln anchored at Lesson 62. |
| Chapter Pool P2 | Apr 12, 2026 | Planner book picker (Autocomplete from library), readAloudBookId persistence on WeekPlan + plannerDefaults, handleApplyPlan triggers chapter question pool generation via chapterQuestions task, removed inline chapterQuestion prompt injection. (Apr 12 fix: picker now visible in review and active phases, not just setup wizard). (Apr 12 diagnostic: temp raw-response logging added for Monday plan fragment investigation). |
| Hotfix: chapterBooks path | Apr 12, 2026 | Moved chapterBooks from invalid `curriculum/chapterBooks` path (even segment count = document ref, not collection) to top-level `chapterBooks` collection. Updated Firestore rules, seed, and all references. |
| Chapter Pool P3 | Apr 12, 2026 | Today ChapterQuestionPool component (parent view): chapter picker + stacked question cards + per-chapter audio recording + live bookProgress updates. Deleted legacy ChapterQuestionCard. Deprecated DayLog.chapterQuestion field (reads only, no new writes). Removed P2 Monday diagnostic logging. Cleaned chapterQuestion from DraftDayPlan and AI plan schema. |

## Removed Features / Concepts
- Ghost armor visual state (moved to binary on/off only).
- Legacy tier model (consolidated around voxel tier thresholds).
- “Forge” as separate currency (re-merged into Diamonds economy).
- `parent_adjustment` event type (replaced by `MANUAL_AWARD` / `MANUAL_DEDUCT`).
- Hardcoded `/6` denominators in suit up UI (now uses actual forgedCount).

## Key Design Decisions
1. **Two currencies, distinct roles** — XP = progression, Diamonds = choice.
2. **Forge then equip** — spend once to forge, free equip toggles forever.
3. **Stonebridge is one shared world** — all narrative systems build continuity in the same canon.
4. **Hero Hub is a place, not a settings page** — mission context above customization.
5. **Knowledge Mine vs Banner Rally split** — measure vs adventure (both needed).
6. **Family-tuned proportions** — design with the child in a live playground, not by guesswork.
7. **Edge outlines for readability** — biggest visual clarity gain per implementation cost.
8. **Open-face helmet** — identity and recognition beat full visual coverage.
9. **Loose tier gate** — next tier visible but locked with clear requirement, aspirational not hidden.
10. **Daily Suit Up = equip all OWNED pieces** — not all 6 total. Can't equip what you haven't forged.
11. **Gateway functions for currency** — `addXpEvent()` and `addDiamondEvent()` are the ONLY paths. All direct Firestore writes to balances are bugs.

---

## Architecture Notes

### Top 5 Largest Files (Current)
| File | Lines | Status |
|---|---:|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,249 | Still primary planner shell/state center |
| `src/features/books/BookEditorPage.tsx` | 1,907 | Stable high-complexity editor |
| `src/features/quest/useQuestSession.ts` | 1,763 | Largest hook; future split candidate |
| `src/features/avatar/MyAvatarPage.tsx` | 1,703 | Grew with Hero Hub layout + mission surfaces |
| `src/features/shelly-chat/ShellyChatPage.tsx` | 1,653 | Stable, still large |

### Decomposition Status
- Today page, Kid Today view, Planner render layers, and Avatar subpanels have all been partially decomposed.
- Remaining risk concentration is state-heavy files (`PlannerChatPage`, `useQuestSession`, `MyAvatarPage`).

---

## Key Files Reference
| File | Purpose |
|---|---|
| `docs/MASTER_OUTLINE.md` | Master state snapshot (this file) |
| `docs/ECONOMY_AUDIT_PART1.md` | Economy model + data inventory |
| `docs/ECONOMY_AUDIT_PART2.md` | Economy earning/spending path audit |
| `docs/STONEBRIDGE_BIBLE.md` | Canonical narrative world bible |
| `functions/src/ai/stonebridgeBible.ts` | Stonebridge prompt import for CF context |
| `src/core/xp/addXpEvent.ts` | XP event gateway |
| `src/core/xp/addDiamondEvent.ts` | Diamond event gateway |
| `src/features/avatar/MyAvatarPage.tsx` | Hero Hub shell + avatar systems |
| `src/features/avatar/HeroMissionCard.tsx` | Hero Hub mission card logic + rendering |
| `src/features/avatar/StonebridgePreviewCard.tsx` | Stonebridge narrative preview surface |
| `src/features/avatar/BrothersVoxelScene.tsx` | Side-by-side brothers scene |
| `src/features/avatar/AccessoriesPanel.tsx` | Accessories system UI + slot conflicts |
| `src/features/avatar/armorGate.ts` | Forge tier gate logic + phantom piece fix |
| `functions/src/ai/tasks/index.ts` | Chat task registry (14 task types) |

---

Last updated: April 12, 2026
