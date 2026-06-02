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
| Chapter response | NOT WIRED | Kid chapter response component (now replaced by `KidChapterPool`) has no `addXpEvent` calls |

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

**Source:** `src/features/avatar/voxel/tierMaterials.ts:12-19`

| Tier | Min XP to Unlock |
|---|---|
| Wood | 0 |
| Stone | 100 |
| Iron | 750 |
| Gold | 1,500 |
| Diamond | 2,500 |
| Netherite | 5,000 |

> **Canonical (resolved 2026-06-02):** these are the live values in `tierMaterials.ts`, set by commit `cedc5b3` (2026-04-17, Phase A — Lincoln ~1000 XP → Iron by design), superseding the earlier `200 / 500 / 1000 / 2000` set. **Pacing against this canonical curve is re-derived in Appendix C** (XP tier-unlock timing + forge-affordability alignment); Appendix A's *diamond/forge-cost* tables remain valid (forge costs did not change).

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

- **File:** legacy kid chapter response component (later replaced by `KidChapterPool`)
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
- Kid chapter response save path (now `src/features/today/KidChapterPool.tsx`) — add 5 XP + 3 diamonds for chapter discussion responses

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

The diamond earn-rate and forge-cost tables above are **unchanged** by the tier-threshold
update — forge costs (`forgeCosts.ts`) did not move, so "~20 weeks to forge everything at
~120 diamonds/week" still holds. What had to be re-derived is the **XP tier-unlock pacing**
and its alignment with forge affordability against the canonical curve. See Appendix C.

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

## Appendix C: XP Tier-Unlock Pacing (re-derived 2026-06-02, canonical curve)

**Canonical thresholds** (`src/features/avatar/voxel/tierMaterials.ts`): Wood 0 / Stone 100 /
Iron 750 / Gold 1,500 / Diamond 2,500 / Netherite 5,000. This supersedes the
`200/500/1000/2000/5000` set the original Appendix A pacing was computed on.

### C.1 Earn-rate model — ⚠️ assumptions, flag for human sanity-check

XP gates the tiers, so the pacing turns on **XP earned per week**, not diamonds. There is no
production telemetry here; the rates below are a **product judgment** built from the
`XP_EVENTS` constants (`src/core/types/xp.ts`) and the §1 earning call sites. **Please
sanity-check these baskets against how Lincoln actually uses the app before relying on the
week counts.**

**Typical active school day basket (XP):**

| Source | XP | Event |
|---|---|---|
| Must-do checklist (1 prayer @5 + 4 items @3) | 17 | `CHECKLIST_PRAYER` + `CHECKLIST_ITEM` |
| All must-do done | 10 | `CHECKLIST_DAY_COMPLETE` |
| Quest complete | 15 | `QUEST_COMPLETE` |
| Quest diamonds mined (~5 correct × 2) | 10 | `QUEST_DIAMOND` |
| Book reading session | 15 | `BOOK_READ` |
| **Day total** | **67** | |

**Weekly extras (less than daily):** ~2 teach-backs (2×15=30) + 1 book completion (25) +
1 Dad Lab (20) + 1 evaluation (25) ≈ **100/week**.

This yields three planning rates (5 active days/week):

- **Conservative** (must-do + quest only, no book, few extras): ~**210 XP/week**
- **Central** (typical basket, not every optional every day): ~**300 XP/week**
- **Fuller** (full daily basket + all weekly extras): ~**435 XP/week**

> Note: `WEEKLY_ALL_COMPLETE` (50) and `BOOK_PAGE_READ` (1/page) are **NOT WIRED** (§5 Bugs
> 1–2), so they are excluded from these baskets. Wiring them would raise the rate.

### C.2 Time-to-tier under the canonical curve

Cumulative XP from 0, and weeks to reach each tier at the three rates:

| Tier | Cumulative XP | Gap from prev tier | @210/wk | @300/wk (central) | @435/wk |
|---|---|---|---|---|---|
| Stone     | 100   | +100  | ~0.5 wk  | ~0.3 wk  | ~0.2 wk |
| Iron      | 750   | +650  | ~3.6 wk  | ~2.5 wk  | ~1.7 wk |
| Gold      | 1,500 | +750  | ~7.1 wk  | ~5.0 wk  | ~3.4 wk |
| Diamond   | 2,500 | +1,000| ~11.9 wk | ~8.3 wk  | ~5.7 wk |
| Netherite | 5,000 | +2,500| ~23.8 wk | ~16.7 wk | ~11.5 wk |

**Stone→Iron is the intentionally-enlarged early gap (Phase A).** Relative to the old curve
(Stone→Iron was 500−200 = **300 XP**), the canonical curve makes it **650 XP** — roughly
double. The effect: Stone is reached almost immediately (a quick first-win on day ~1–2), then
the child does a **meaningful, multi-week climb to Iron** so Iron lands as the first *earned*
material milestone. At the central rate Lincoln reaches **Iron in ~2–3 weeks** and does not
touch **Gold until ~week 5** — i.e. he **experiences Iron well before Gold**, exactly the
Phase A intent. The gaps then keep widening (Iron→Gold 750, Gold→Diamond 1,000,
Diamond→Netherite 2,500) so the top tiers stay aspirational rather than auto-granted.

### C.3 XP-unlock vs. forge-affordability alignment (re-derived)

Earlier text claimed "XP-to-unlock and diamonds-to-afford align roughly." On the canonical
curve this is **no longer the right framing** — XP now unlocks each tier **ahead of** the
diamonds needed to forge it. Using diamond accrual ~120/wk (Appendix A, unchanged) and the
central XP rate (~300/wk):

| Tier unlock | XP week (central) | Diamonds banked by then (~120/wk) | Cumulative forge cost through tier | Affordability at unlock |
|---|---|---|---|---|
| Stone   | ~0.3 wk  | ~40   | 174 (Wood 44 + Stone 130)   | partial — forging trails unlock |
| Iron    | ~2.5 wk  | ~300  | 414                          | ~72% of cumulative cost |
| Gold    | ~5.0 wk  | ~600  | 799                          | ~75% |
| Diamond | ~8.3 wk  | ~1,000| 1,409                        | ~71% |
| Netherite | ~16.7 wk | ~2,000 | 2,319                      | ~86% |

**Conclusion:** the tier becomes **visible/accessible** (XP unlock) before the child has
banked enough diamonds to **forge all six pieces** of it — diamonds run roughly **70–85% of
the cumulative forge cost** at each unlock moment. This is a reasonable shape: unlocking a
tier is itself a reward (the new material lights up and forging becomes possible), and the
diamond grind to actually forge the set trails by a week or two. It is **not** the old
"unlock ≈ afford" coupling, and docs/UX copy should not imply a child can forge a whole tier
the moment it unlocks. (All week counts inherit the §C.1 assumption flag.)
