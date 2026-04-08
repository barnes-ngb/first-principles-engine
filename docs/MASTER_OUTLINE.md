# Barnes Family Homeschool — Master Project Outline v15

**Version:** v15 — April 7, 2026  
**Status:** Updated since v14 — Hero Hub reframe, two-currency economy hardening, and Stonebridge narrative foundation.

## Project Summary
Homeschool management app for the Barnes family: Shelly (parent, fibromyalgia), Nathan (dad, builder), Lincoln (10, neurodivergent, speech challenges), London (6, drawing/story-first).

**Tech:** React + TypeScript + Vite, Firebase (Auth/Firestore/Storage/Functions/Hosting), MUI, Claude + OpenAI image stack.

**Scale (current):**
- TypeScript lines: **120,662** total (`src/` 108,370 + `functions/src/` 12,292)
- Commits: **1,429**
- Tests: **59 test files**, **1,004 test cases**
- Firestore collections: **31**
- Cloud Functions: **18**
- Chat task types: **13**
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

### Stonebridge Narrative Foundation
- Canonical narrative bible documented at `docs/STONEBRIDGE_BIBLE.md`.
- Shared world model with recurring places/characters (designed for continuity over novelty).
- Imported into Cloud Functions prompt context (`functions/src/ai/stonebridgeBible.ts`).
- Chapter question and conundrum generation now use Stonebridge context.
- Sets continuity foundation for Banner Rally mission layer.

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
| Character Proportions + Mobile Polish | Apr 2026 | Family-tuned proportions, edge outlines, mobile sizing improvements |
| Armor Visual Fixes | Apr 2026 | Open-face helmet, shield positioning correction, ghost armor removal |
| Economy Audit + Fixes | Apr 2026 | Two-part audit, gateway hardening, admin adjustment fixes, backfill policy |
| Legends Visual Overhaul | Apr 2026 | Lighting/material pass, particles, gradient sky, pedestal scene polish |
| Hero Hub Phase 1 | Apr 2026 | My Armor → Hero Hub, mission card, Stonebridge preview card |
| Crash Cascade Stabilization | Apr 7, 2026 | Quest graceful error paths, `/quest` error boundary, AvatarThumbnail WebGL safety |
| Unified Capture Pipeline | Apr 8, 2026 | Merged 3 Today capture entry points into 1 AI-routed handler. Worksheets/textbooks/tests → scans + curriculum update; everything else → artifacts. Fixes "Last updated" staleness on Progress. |

## Removed Features / Concepts
- Ghost armor visual state (moved to binary on/off only).
- Legacy tier model (consolidated around voxel tier thresholds).
- “Forge” as separate currency (re-merged into Diamonds economy).
- `parent_adjustment` event type (replaced by `MANUAL_AWARD` / `MANUAL_DEDUCT`).

## Key Design Decisions
1. **Two currencies, distinct roles** — XP = progression, Diamonds = choice.
2. **Forge then equip** — spend once to forge, free equip toggles forever.
3. **Stonebridge is one shared world** — all narrative systems build continuity in the same canon.
4. **Hero Hub is a place, not a settings page** — mission context above customization.
5. **Knowledge Mine vs Banner Rally split** — measure vs adventure (both needed).
6. **Family-tuned proportions** — design with the child in a live playground, not by guesswork.
7. **Edge outlines for readability** — biggest visual clarity gain per implementation cost.
8. **Open-face helmet** — identity and recognition beat full visual coverage.

---

## Architecture Notes

### Top 5 Largest Files (Current)
| File | Lines | Status |
|---|---:|---|
| `src/features/planner-chat/PlannerChatPage.tsx` | 2,257 | Still primary planner shell/state center |
| `src/features/books/BookEditorPage.tsx` | 1,886 | Stable high-complexity editor |
| `src/features/quest/useQuestSession.ts` | 1,758 | Largest hook; future split candidate |
| `src/features/avatar/MyAvatarPage.tsx` | 1,666 | Grew with Hero Hub layout + mission surfaces |
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
| `functions/src/ai/tasks/index.ts` | Chat task registry (13 task types) |

---

Last updated: April 7, 2026
