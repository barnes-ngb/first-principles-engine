# Economy Audit Part 2 — Earning & Spending Paths

**Date:** 2026-04-07
**Scope:** All code paths that earn or spend XP/diamonds
**Status:** READ-ONLY audit — no code changes made

---

## 1. Earning Table

### XP_EVENTS Constants (source of truth: `src/core/types/xp.ts:228-244`)

```
QUEST_DIAMOND:        2   (per diamond mined in quest)
QUEST_COMPLETE:       15  (quest session finished)
CHECKLIST_ITEM:       3   (per completed daily checklist item)
CHECKLIST_PRAYER:     5   (formation/prayer item)
CHECKLIST_DAY_COMPLETE: 10 (all must-do items checked off)
DAILY_ALL_COMPLETE:   15  (bonus: ALL items for the day)
WEEKLY_ALL_COMPLETE:  50  (bonus: all 5 days completed)
BOOK_COMPLETE:        25  (finished creating a book)
BOOK_READ:            15  (finished reading a book)
BOOK_PAGE_READ:       1   (per page read)
EVALUATION_COMPLETE:  25  (full evaluation chat)
DAD_LAB_COMPLETE:     20  (finished a Dad Lab)
ARMOR_DAILY_COMPLETE: 5   (all earned pieces applied today)
MANUAL_AWARD:         0   (parent-awarded, amount varies)
```

### Full Earning Call Sites

| Activity | XP Amount | Diamond Amount | File:Line | Has Dedup? |
|---|---|---|---|---|
| **Checklist item complete** | 3 (prayer/formation: 5) | — | `src/features/today/KidChecklist.tsx:88-94` | Yes: `item-${item.id}-${today}` |
| **All must-do items done** | 10 | — | `src/features/today/KidTodayView.tsx:414-422` | Yes: `checklist_${today}` |
| **All items (must-do + choose) done** | 15 | — | `src/features/today/KidTodayView.tsx:432-441` | Yes: `daily-bonus-${today}` |
| **Quest complete** | 15 | — | `src/features/quest/useQuestSession.ts:755-762` | Yes: `quest-complete_${docId}` |
| **Quest diamonds (per correct answer)** | 2 per correct | 1 per correct | `src/features/quest/useQuestSession.ts:770-798` | Yes: `quest_${docId}` / `quest-complete_${docId}-diamond` |
| **Fluency assessment** | 2 per diamond | 1-5 (per passage) | `src/features/quest/useQuestSession.ts:1433-1450` | Yes: `fluency_${docId}` / `fluency_${docId}-diamond` |
| **Book finished (created)** | 25 | 5 | `src/features/books/useBook.ts:263-280` | Yes: `book_complete_${bookId}` / `book_complete_${bookId}-diamond` |
| **Book reading session** | 15 | 3 | `src/features/books/BookReaderPage.tsx:245-262` | Yes: `book_${bookId}_${date}` / `book_${bookId}_${date}-diamond` |
| **Evaluation complete** | 25 | — | `src/features/evaluate/EvaluateChatPage.tsx:545-551` | Yes: `eval_${sessionDocId}` |
| **Dad Lab complete** | 20 | 10 | `src/features/dad-lab/useDadLabReports.ts:103-110,132-139` | Yes: `dadlab-${reportId}` / `dadlab-${reportId}-diamond` |
| **Teach-back complete** | 15 | 5 | `src/features/today/KidTeachBack.tsx:95-113` | Yes: `teachback_${today}-xp` / `teachback_${today}-diamond` |
| **Conundrum response (text)** | 5 | 5 | `src/features/today/KidConundrumResponse.tsx:129-139` | Yes: `conundrum_${date}-xp` / `conundrum_${date}-diamond` |
| **Conundrum response (drawing)** | 5 | 5 | `src/features/today/KidConundrumResponse.tsx:169-179` | Yes: `conundrum_${date}-xp` / `conundrum_${date}-diamond` |
| **Extra activity logged** | 5 | 2 | `src/features/today/KidExtraLogger.tsx:64-74` | Yes: `extra_${label}_${today}-xp` / `extra_${label}_${today}-diamond` |
| **Workshop game/adventure/card** | 5 | 3 | `src/features/workshop/WorkshopPage.tsx:718-723,777-782,848-853` | Yes: `workshop_${gameId}_${date}-xp` / `workshop_${gameId}_${date}-diamond` |
| **Daily armor equip (all pieces)** | 5 | — | `src/features/avatar/MyAvatarPage.tsx:673` | Yes: `armor_daily_${today}` |
| **Week complete (all 5 days)** | 50 | — | NOT WIRED — defined in `XP_EVENTS` and `XP_AWARDS` but no `addXpEvent` call found |
| **Book page read** | 1 | — | NOT WIRED — defined in `XP_EVENTS` but no `addXpEvent` call found |
| **Parent manual award (ArmorTab)** | variable | — | `src/features/progress/ArmorTab.tsx:283` | Yes: `manual_${Date.now()}` |
| **Admin XP adjust** | variable | — | `src/features/settings/AvatarAdminTab.tsx:184-196` | Yes: `admin_${Date.now()}` (bypasses `addXpEvent`, writes directly) |

### Activities with NO earning code

| Activity | Status | Notes |
|---|---|---|
| First piece of new tier | NOT WIRED | No XP/diamond bonus for forging a tier's first piece |
| Full tier complete | NOT WIRED | No XP/diamond bonus for completing all 6 pieces in a tier |
| Prayer/formation complete | Covered | Handled as checklist item with higher XP (5 vs 3) |
| Chapter response | NOT WIRED | `KidChapterResponse.tsx` has no `addXpEvent` calls |

---

## 2. Spending Call Sites

### 2a. Diamond spending function

**File:** `src/core/xp/getDiamondBalance.ts:43-68`

`spendDiamonds(familyId, childId, amount, dedupKey, category, itemId?)`:
- Checks `amount > 0` and `balance >= amount`
- Creates negative diamond ledger entry via `addXpEvent` with `-amount`
- Uses `currencyType: 'diamond'` and passed `category`
- Returns `true` on success, `false` on insufficient balance

### 2b. Forge spending (only spending call site)

**File:** `src/core/xp/forgeArmorPiece.ts:58-59`

```typescript
const dedupKey = `forge_${tier}_${piece}_${childId}`
const spent = await spendDiamonds(familyId, childId, cost, dedupKey, 'forge', `${tier}_${piece}`)
```

- **Trigger:** User taps unforged piece → answers verse question → confirms forge
- **Amount:** From `FORGE_COSTS` table (see below)
- **Dedup:** `forge_${tier}_${piece}_${childId}` — prevents double-forging
- **Pre-checks:** tier unlocked, piece not already forged, cost > 0, balance >= cost

### 2c. No other spending paths exist

There is exactly ONE place diamonds are spent: `forgeArmorPiece()`. No other spending mechanism exists in the codebase.

---

## 3. Cost Table (Forge Costs)

**Source of truth:** `src/core/xp/forgeCosts.ts:7-14` (single definition, no duplicates)

| Piece | Wood | Stone | Iron | Gold | Diamond | Netherite |
|---|---|---|---|---|---|---|
| Belt | 5 | 15 | 30 | 50 | 80 | 120 |
| Shoes | 5 | 15 | 30 | 50 | 80 | 120 |
| Breastplate | 8 | 20 | 40 | 65 | 100 | 150 |
| Shield | 8 | 25 | 45 | 70 | 110 | 160 |
| Helmet | 8 | 25 | 45 | 70 | 110 | 160 |
| Sword | 10 | 30 | 50 | 80 | 130 | 200 |
| **Tier Total** | **44** | **130** | **240** | **385** | **610** | **910** |
| **Cumulative** | **44** | **174** | **414** | **799** | **1,409** | **2,319** |

- Costs are in **diamonds only** (not forge points, not XP)
- ONE source of truth: `FORGE_COSTS` in `forgeCosts.ts`
- Helper: `getForgeCost(tier, piece)` returns cost or 0
- Helper: `getTierTotalCost(tier)` sums all 6 pieces for a tier

### Tier XP Thresholds (for unlocking tiers)

**Source:** `src/features/avatar/voxel/tierMaterials.ts:12-18`

| Tier | Min XP to Unlock |
|---|---|
| Wood | 0 |
| Stone | 200 |
| Iron | 500 |
| Gold | 1,000 |
| Diamond | 2,000 |
| Netherite | 5,000 |

### Piece XP Thresholds (for unlocking individual pieces within Wood tier)

**Source:** `src/features/avatar/voxel/buildArmorPiece.ts:159-166`

| Piece | XP Required |
|---|---|
| Belt | 0 |
| Breastplate | 150 |
| Shoes | 300 |
| Shield | 500 |
| Helmet | 750 |
| Sword | 1,000 |

---

## 4. Equip Logic Flow

### Phase 1: Unlock (automatic, free)

1. Child earns XP via any activity
2. `addXpEvent()` awards XP → updates cumulative ledger → calls `checkAndUnlockArmor()` (`src/core/xp/checkAndUnlockArmor.ts:113-223`)
3. `checkAndUnlockArmor()` compares `totalXp` against `XP_THRESHOLDS` per piece
4. If `xp >= threshold`, piece is added to `unlockedPieces` on profile
5. If piece is already **forged** (or legacy unlocked), it's auto-added to `equippedPieces`
6. Tier unlock: compares XP against `TIERS[].minXp`, updates `unlockedTiers` array

### Phase 2: Forge (costs diamonds, one-time)

1. User taps unforged piece → ArmorVerseCard UI shown
2. User answers verse question → taps "Forge" button
3. `handleForgePiece()` (`MyAvatarPage.tsx:583-612`) calls `forgeArmorPiece()`
4. `forgeArmorPiece()` (`src/core/xp/forgeArmorPiece.ts:20-92`):
   a. Validates tier is unlocked (`unlockedTiers`)
   b. Validates piece not already forged (`forgedPieces[tier][piece]`)
   c. Gets cost from `getForgeCost(tier, piece)`
   d. Calls `spendDiamonds()` — checks balance, creates negative ledger entry
   e. Updates `forgedPieces[tier][piece]` with `ForgedPieceEntry` (timestamp, verse response)
   f. **Auto-equips** the piece by adding to `equippedPieces` array

### Phase 3: Equip/Unequip (always free)

1. `handlePieceTap()` (`MyAvatarPage.tsx:734-765`) checks piece state:
   - If **equipped** → unequip (toggle off, no cost)
   - If **forged but not equipped** → equip immediately + read verse aloud (no cost)
   - If **not forged** → show ArmorVerseCard (forge UI)
2. `handleApplyPiece()` (`MyAvatarPage.tsx:615-682`):
   - Adds piece to `DailyArmorSession.appliedPieces`
   - Updates `avatarProfile.equippedPieces`
   - If all earned pieces applied → awards 5 XP (`ARMOR_DAILY_COMPLETE`)
   - **No diamond check, no diamond cost**
3. `handleUnequipDirect()` (`MyAvatarPage.tsx:684-718`):
   - Removes from `appliedPieces`
   - Adds to `manuallyUnequipped` (prevents auto-re-equip)
   - **No cost, no refund**
4. `suitUpAll()` (`MyAvatarPage.tsx:768-784`):
   - Equips all forged pieces with stagger animation
   - **No cost**

### Key answer: Equipping is FREE once forged. Cost is paid once at forge time. Re-equipping never costs again.

---

## 5. Conflicts and Bugs Found

### Bug 1: `WEEKLY_ALL_COMPLETE` defined but never wired

- **Defined:** `src/core/types/xp.ts:236` — `WEEKLY_ALL_COMPLETE: 50`
- **Referenced in:** `src/features/avatar/xpAwards.ts:14` — `weeklyAllComplete: 50`
- **Referenced in:** `src/features/progress/ArmorTab.tsx:65,96` — display labels
- **No `addXpEvent` call exists** for `WEEKLY_ALL_COMPLETE` anywhere in the codebase
- **Impact:** Kids never receive the 50 XP weekly bonus even if they complete all 5 days

### Bug 2: `BOOK_PAGE_READ` defined but never wired

- **Defined:** `src/core/types/xp.ts:239` — `BOOK_PAGE_READ: 1`
- **Referenced in:** `src/features/avatar/xpAwards.ts:10` — `bookPageRead: 1`
- **Referenced in:** `src/features/progress/ArmorTab.tsx:75,100` — display labels
- **No `addXpEvent` call exists** for `BOOK_PAGE_READ` in `BookReaderPage.tsx` or elsewhere
- **Impact:** Per-page reading XP is never awarded; only session-level book reading (15 XP) fires

### Bug 3: Admin XP adjust bypasses `addXpEvent` — no armor unlock check

- **File:** `src/features/settings/AvatarAdminTab.tsx:143-202`
- `handleAdjustXp()` directly writes to Firestore (setDoc on profile + manual ledger entry)
- It does NOT call `addXpEvent()`, so it never triggers `checkAndUnlockArmor()`
- It manually computes unlocked pieces but only updates the `pieces` array (legacy structure)
- Does NOT update `unlockedTiers` when XP crosses tier thresholds
- **Impact:** Admin XP adjustments can push a child past tier thresholds without unlocking the tier

### Bug 4: Admin XP adjust writes `type: 'parent_adjustment'` — not a valid `XP_EVENTS` key

- **File:** `src/features/settings/AvatarAdminTab.tsx:190`
- Writes `type: 'parent_adjustment'` to xpLedger, but this is not in the `XP_EVENTS` const
- The ArmorTab display (`ArmorTab.tsx:104`) handles this via the `default` case, so it renders but with generic label
- **Impact:** Minor — cosmetic inconsistency in event log display

### Bug 5: Conundrum text vs drawing share same dedup key — only first awards

- **File:** `src/features/today/KidConundrumResponse.tsx:129,169`
- Text response dedup: `conundrum_${conundrumDate}-xp`
- Drawing response dedup: `conundrum_${conundrumDate}-xp`
- **Same key!** If a child submits a text response AND a drawing for the same conundrum on the same day, only the first one awards XP/diamonds
- **Impact:** Likely by design (one reward per conundrum per day), but the user could be confused if they draw after typing and get no reward

### Bug 6: Evaluation complete awards XP but no diamonds

- **File:** `src/features/evaluate/EvaluateChatPage.tsx:545-551`
- Awards 25 XP with dedup `eval_${sessionDocId}`
- **No diamond award** — unlike most other activities which award both
- **Impact:** Evaluations are a significant activity (25 XP) but don't contribute to forge economy

### Bug 7: Chapter responses award nothing

- **File:** `src/features/today/KidChapterResponse.tsx`
- No `addXpEvent` calls found
- Chapter responses (read-aloud discussion) have no XP or diamond reward
- **Impact:** Missing incentive for a key learning activity

### Observation 1: No auto-equip vs spend-to-equip conflict

The system cleanly separates forge (costs diamonds) from equip (free). The auto-equip in `checkAndUnlockArmor()` only auto-equips pieces that are **already forged**. There is no contradiction.

### Observation 2: Diamond balance is O(n) — computed by summing all ledger entries

- **File:** `src/core/xp/getDiamondBalance.ts:16-37`
- Every balance check queries ALL diamond ledger entries for a child and sums them
- This is noted as a TODO in the code comments
- **Impact:** Performance concern at scale, not a bug currently

### Observation 3: Forge dedup includes childId, but XP dedup keys vary

- Forge dedup: `forge_${tier}_${piece}_${childId}` — includes childId
- Most XP dedup keys do NOT include childId (e.g., `checklist_${today}`)
- However, the ledger doc ID is `${childId}_${dedupKey}` (`addXpEvent.ts:68`), so childId is effectively included
- **Not a bug** — just an inconsistency in key format

---

## 6. Top 3 Recommended Fixes

### Fix 1: Wire `WEEKLY_ALL_COMPLETE` (50 XP)

**Priority:** High — this is a major motivator (biggest single XP award) that kids never receive.

**Where:** Add logic in `KidTodayView.tsx` or a weekly check. When all 5 school days in a week have `CHECKLIST_DAY_COMPLETE` events, fire `addXpEvent(familyId, childId, 'WEEKLY_ALL_COMPLETE', 50, weekly_${weekId})`. Could also add a diamond bonus (e.g., 20 diamonds) for consistency with other activities.

**Rationale:** The constant is defined, the display label exists, the award amount is set — the only missing piece is the trigger call. This is clearly intended functionality that was never connected.

### Fix 2: Fix admin XP adjust to use `addXpEvent` + tier unlock

**Priority:** High — admin adjustments silently break tier state.

**Where:** `src/features/settings/AvatarAdminTab.tsx:143-202`

**What:** Replace the direct Firestore write with a call to `addXpEvent()`, which will:
- Properly update the cumulative ledger doc
- Trigger `checkAndUnlockArmor()` for tier unlocks
- Use a valid `XP_EVENTS` type (`MANUAL_AWARD`)

**Rationale:** The admin tool is used to test and correct child state. If it doesn't trigger the same unlock pipeline as normal earning, it creates inconsistent state that's hard to debug.

### Fix 3: Add diamond rewards to evaluations and chapter responses

**Priority:** Medium — missing economic incentives for significant learning activities.

**Where:**
- `src/features/evaluate/EvaluateChatPage.tsx:545-551` — add 10 diamonds alongside the 25 XP
- `src/features/today/KidChapterResponse.tsx` — add 5 XP + 3 diamonds for chapter discussion responses

**Rationale:** Evaluations are the most effortful activity (25 XP) but contribute nothing to the forge economy. Chapter responses are a key learning moment (read-aloud discussion) with zero reward. Both gaps reduce motivation to engage with high-value learning activities.

---

## Appendix A: Diamond Economy Balance Check

### Daily earning potential (typical school day)

| Source | Diamonds |
|---|---|
| Checklist items (no diamonds) | 0 |
| Quest (5 correct answers) | 5 |
| Book reading | 3 |
| Teach-back | 5 |
| Conundrum | 5 |
| Extra activity | 2 |
| **Daily total** | **~20** |

### Weekly earning potential

| Source | Diamonds |
|---|---|
| 5 school days × ~20 | ~100 |
| Dad Lab (weekend) | 10 |
| Book completion (1/week) | 5 |
| Workshop (1-2/week) | 3-6 |
| **Weekly total** | **~118-121** |

### Weeks to complete each tier

| Tier | Cost | Weeks at ~120/wk |
|---|---|---|
| Wood | 44 | < 1 week |
| Stone | 130 | ~1 week |
| Iron | 240 | ~2 weeks |
| Gold | 385 | ~3 weeks |
| Diamond | 610 | ~5 weeks |
| Netherite | 910 | ~8 weeks |
| **Total** | **2,319** | **~20 weeks** |

### Observation

The economy pacing seems reasonable: a full school year (~36 weeks) gives enough time to complete all tiers with margin. The XP thresholds for tier unlocking (200/500/1000/2000/5000) also align roughly with the earning rate, so kids won't have the XP to unlock a tier long before they can afford to forge it.

## Appendix B: XP-only Awards (no diamond companion)

These activities award XP but not diamonds. Intentional or oversight?

| Activity | XP | Diamond | Notes |
|---|---|---|---|
| Checklist items | 3-5 | 0 | High-frequency, small reward — diamonds would add up fast |
| All must-do complete | 10 | 0 | Daily bonus, could add diamonds |
| All items complete | 15 | 0 | Daily bonus, could add diamonds |
| Weekly complete | 50 | 0 | NOT WIRED at all |
| Evaluation complete | 25 | 0 | Significant effort, missing diamonds |
| Daily armor equip | 5 | 0 | Meta-reward for using the system |
| Admin/manual award | varies | 0 | XP only — no diamond companion |
