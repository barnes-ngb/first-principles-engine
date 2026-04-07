# Economy Audit Part 1 — Data Model & Current State

**Date:** 2026-04-07
**Scope:** Read-only inventory of the avatar economy data model and Firestore collections

---

## 1. Files Involved

All files containing economy-related references (`totalXp`, `diamondBalance`, `forgeBalance`, `forgeCost`, `diamondCost`, `xpLedger`, `armorCost`, `pieceCost`):

### Core Types & Logic
| File | Role |
|---|---|
| `src/core/types/xp.ts` | Master type definitions: `XpLedger`, `AvatarProfile`, `ArmorPiece`, `ForgedPieceEntry`, `XP_EVENTS`, `CurrencyType`, `DiamondCategory`, `ARMOR_PIECES`, `ACCESSORIES` |
| `src/core/xp/addXpEvent.ts` | Awards XP or diamonds to a child (dedup, cumulative doc, profile cache, armor unlock) |
| `src/core/xp/addXpEvent.test.ts` | Tests for XP/diamond awarding |
| `src/core/xp/useXpLedger.ts` | React hook: real-time XP listener on cumulative ledger doc |
| `src/core/xp/getDiamondBalance.ts` | Computes diamond balance by summing all diamond ledger entries (O(n)) |
| `src/core/xp/getDiamondBalance.test.ts` | Tests for diamond balance + spending |
| `src/core/xp/checkAndUnlockArmor.ts` | Checks XP thresholds, unlocks pieces/tiers, migrates legacy data |
| `src/core/xp/armorTiers.ts` | Legacy 7-tier armor progression (None/Leather/Chain/Iron/Gold/Diamond/Netherite) |
| `src/core/xp/forgeArmorPiece.ts` | Forge flow: check tier unlock, check balance, spend diamonds, update `forgedPieces` |
| `src/core/xp/forgeCosts.ts` | Diamond cost table per tier per piece |
| `src/core/firebase/firestore.ts` | Collection refs: `xpLedgerCollection`, `avatarProfilesCollection`, `xpLedgerDocId` |

### Avatar Feature UI
| File | Role |
|---|---|
| `src/features/avatar/MyAvatarPage.tsx` | Main avatar page — forge flow, equip, suit-up, portal transitions |
| `src/features/avatar/ArmorPieceGallery.tsx` | Gallery grid showing forge status/cost per piece |
| `src/features/avatar/ArmorVerseCard.tsx` | Verse prompt + forge button for individual pieces |
| `src/features/avatar/ArmorGateScreen.tsx` | Gate check before kids access Today |
| `src/features/avatar/armorGate.ts` | Logic: active forge tier, equippable pieces, armor completion check |
| `src/features/avatar/normalizeProfile.ts` | Normalize raw Firestore → safe `AvatarProfile`, legacy migrations |
| `src/features/avatar/voxel/tierMaterials.ts` | 6-tier material system (WOOD/STONE/IRON/GOLD/DIAMOND/NETHERITE) with XP thresholds |
| `src/features/avatar/VoxelCharacter.tsx` | 3D character renderer |
| `src/features/avatar/AvatarHeroBanner.tsx` | Hero banner with XP display |
| `src/features/avatar/MinecraftXpBar.tsx` | XP progress bar |
| `src/features/avatar/AvatarCharacterDisplay.tsx` | Character display wrapper |
| `src/features/avatar/AvatarCustomizer.tsx` | Color customization panel |
| `src/features/avatar/AccessoriesPanel.tsx` | Accessories panel (XP-gated cosmetics) |
| `src/features/avatar/AvatarThumbnail.tsx` | Thumbnail renderer |
| `src/features/avatar/BrothersVoxelScene.tsx` | Dual character scene |

### Diamond Earning Sources
| File | Role |
|---|---|
| `src/features/quest/useQuestSession.ts` | Awards diamonds: 1 per correct answer in Knowledge Mine |
| `src/features/quest/KnowledgeMinePage.tsx` | Quest page (references XP) |
| `src/features/today/KidTeachBack.tsx` | Awards 5 diamonds for teach-back |
| `src/features/today/KidConundrumResponse.tsx` | Awards 5 diamonds for conundrum response |
| `src/features/today/KidExtraLogger.tsx` | Awards 2 diamonds for extra activity |
| `src/features/books/useBook.ts` | Awards 3 diamonds for reading a book |
| `src/features/books/BookReaderPage.tsx` | Awards diamonds for book page reads |
| `src/features/dad-lab/useDadLabReports.ts` | Awards 10 diamonds for Dad Lab completion |
| `src/features/workshop/WorkshopPage.tsx` | Awards 3 diamonds per workshop game type |

### HUD & Display
| File | Role |
|---|---|
| `src/components/XpDiamondBar.tsx` | HUD bar: XP progress + diamond balance (polls every 10s) |
| `src/components/ProfileMenu.tsx` | Profile menu with XP display |
| `src/components/ChildSelector.tsx` | Child selector with XP |
| `src/components/ContextBar.tsx` | Context bar |
| `src/app/AppShell.tsx` | App shell |

### Admin & Progress
| File | Role |
|---|---|
| `src/features/settings/AvatarAdminTab.tsx` | Admin: adjust XP, recalculate, delete profile |
| `src/features/progress/ArmorTab.tsx` | Armor progress tab with recent XP events |

### Tests
| File | Role |
|---|---|
| `src/features/avatar/__tests__/armorGate.test.ts` | Forge/equip gate logic tests |
| `src/features/avatar/__tests__/avatarSystem.test.ts` | Avatar system tests |
| `src/features/avatar/__tests__/minecraftSkin.test.ts` | Skin tests |

### Cloud Functions
| File | Role |
|---|---|
| `functions/src/ai/imageTasks/extractFeatures.ts` | References avatarProfile for feature extraction |

---

## 2. AvatarProfile Data Model

**Type location:** `src/core/types/xp.ts:410-476`
**Firestore path:** `families/{familyId}/avatarProfiles/{childId}`

| Field | Type | Default | Purpose |
|---|---|---|---|
| `childId` | `string` | required | Child document ID |
| `themeStyle` | `'minecraft' \| 'platformer'` | `'minecraft'` | Lincoln=minecraft, London=platformer |
| `pieces` | `ArmorPieceProgress[]` | `[]` | Per-piece unlock progress (legacy 2D system) |
| `currentTier` | `ArmorTier \| PlatformerTier` | `'stone'` | Current material tier (note: default is 'stone' not 'wood') |
| `characterFeatures` | `CharacterFeatures` | Lincoln defaults | AI-extracted photo features (skin, hair, eyes) |
| `ageGroup` | `'older' \| 'younger'` | `'older'` | Body proportions template |
| `photoUrl` | `string?` | undefined | Original uploaded photo URL |
| `equippedPieces` | `string[]` | `[]` | Currently shown voxel piece IDs |
| `lastEquipAnimation` | `string?` | undefined | Last animated piece (prevents re-animation) |
| `customization` | `OutfitCustomization?` | undefined | Shirt/pants/shoe/cape colors, armor dyes, shield emblem, helmet crest, background, accessories, proportions |
| `skinTextureUrl` | `string?` | undefined | AI-generated Minecraft skin face URL (cached) |
| `skinTextureGeneratedAt` | `string?` | undefined | Skin texture generation timestamp |
| `faceGrid` | `string[]` (64 entries) | undefined | Cached 64-color hex array for pixel face |
| `baseCharacterUrl` | `string?` | deprecated | Legacy 2D base character |
| `photoTransformUrl` | `string?` | deprecated | Legacy 2D photo transform |
| `armorSheetUrls` | `Record<string,string>?` | deprecated | Legacy 2D armor sheets |
| `armorReferenceUrls` | `Record<string,string>?` | deprecated | Legacy 2D armor references |
| `croppedRegionUrls` | `Record<ArmorPiece,string>?` | deprecated | Legacy 2D cropped regions |
| `unlockedPieces` | `string[]` | `[]` | Legacy voxel piece IDs unlocked by XP — superseded by `forgedPieces` |
| `unlockedTiers` | `string[]` | `['wood']` | Tiers unlocked by XP threshold (e.g. `['wood','stone']`) |
| `forgedPieces` | `Record<string, Record<string, ForgedPieceEntry>>?` | undefined | **Primary forge state.** Outer key = tier, inner key = voxel piece ID. Each entry: `{ forgedAt, verseResponse?, verseResponseAudio? }` |
| `lastPortalTier` | `string?` | undefined | Tier where portal animation last played |
| `lastArmorEquipDate` | `string?` | undefined | YYYY-MM-DD when armor was last equipped |
| `armorStreak` | `number` | `0` | Consecutive days with all forged pieces equipped |
| `lastFullArmorDate` | `string?` | undefined | YYYY-MM-DD of last full armor day |
| `totalXp` | `number` | `0` | **Cached** from xpLedger cumulative doc — source of truth is xpLedger |
| `updatedAt` | `string` | now() | Last update timestamp |

**Undeclared fields (set at runtime but not in interface):**
| Field | Set by | Purpose |
|---|---|---|
| `pendingTierUpgrade` | `addXpEvent.ts:135` | Set to tier key when tier upgrade happens; consumed by UI for ceremony |

---

## 3. Collections

### 3a. xpLedger — `families/{familyId}/xpLedger`

**Dual purpose:** Stores both XP and Diamond entries in a single collection. Currency is distinguished by `currencyType` field.

**Document types:**

| Doc ID Pattern | Purpose | Fields |
|---|---|---|
| `{childId}` | **Cumulative XP doc** (XP only, diamonds excluded) | `childId`, `totalXp`, `sources: { routines, quests, books }`, `lastUpdatedAt` |
| `{childId}_{dedupKey}` | **Per-event doc** (both XP and diamond entries) | `childId`, `totalXp`, `sources`, `dedupKey`, `type`, `amount`, `meta`, `awardedAt`, `lastUpdatedAt`, `currencyType?`, `category?`, `itemId?` |

**Writers:**
| Writer | File | What it writes |
|---|---|---|
| `addXpEvent()` | `src/core/xp/addXpEvent.ts` | Per-event doc + cumulative doc (XP only) |
| `spendDiamonds()` | `src/core/xp/getDiamondBalance.ts` | Negative diamond per-event doc via `addXpEvent` |
| Admin XP adjust | `src/features/settings/AvatarAdminTab.tsx` | Direct writes to cumulative + per-event docs |

**Readers:**
| Reader | File | What it reads |
|---|---|---|
| `useXpLedger()` | `src/core/xp/useXpLedger.ts` | Real-time listener on cumulative doc `{childId}` |
| `getDiamondBalance()` | `src/core/xp/getDiamondBalance.ts` | Query all docs where `currencyType == 'diamond'` for child, sum `amount` |
| `XpDiamondBar` | `src/components/XpDiamondBar.tsx` | Same diamond query, polled every 10s |
| `checkAndUnlockArmor()` | `src/core/xp/checkAndUnlockArmor.ts` | Reads cumulative doc for XP total |
| `AvatarAdminTab` | `src/features/settings/AvatarAdminTab.tsx` | Reads recent events for display, recalculates |
| `ArmorTab` | `src/features/progress/ArmorTab.tsx` | Reads recent events for display |

**Dedup:** Yes — doc ID is `{childId}_{dedupKey}`. If doc exists, `addXpEvent()` returns 0 (no double award). Examples: `quest_abc123`, `checklist_2026-03-20`, `book_xyz_2026-03-20`.

### 3b. diamondLedger

**Does not exist.** There is no separate `diamondLedger` collection. Diamond entries are stored in `xpLedger` with `currencyType: 'diamond'`.

### 3c. forgeLedger

**Does not exist.** Forge transactions are stored as diamond spend entries in `xpLedger` with `category: 'forge'`. The `forgedPieces` map on `avatarProfile` is the state-of-record for what's been forged.

### 3d. dailyArmorSessions — `families/{familyId}/dailyArmorSessions`

**Purpose:** Track daily armor equip ritual per child.

| Field | Type | Purpose |
|---|---|---|
| `familyId` | `string` | Family reference |
| `childId` | `string` | Child reference |
| `date` | `string` | YYYY-MM-DD |
| `appliedPieces` | `ArmorPiece[]` | Pieces applied during today's session |
| `manuallyUnequipped` | `string[]?` | Pieces intentionally removed today |
| `completedAt` | `string?` | ISO timestamp when all earned pieces applied |

---

## 4. Forge References

"Forge" is **not a separate system from diamonds** — it's the act of spending diamonds to materialize an armor piece at a specific tier. The flow:

1. Child earns diamonds from active-effort activities
2. Child taps an unforged piece on the Avatar page
3. `ArmorVerseCard` shows the verse prompt + forge cost
4. Child responds to verse (text or audio) and taps "Forge it!"
5. `forgeArmorPiece()` checks balance, calls `spendDiamonds()`, writes to `forgedPieces` map

### Key forge references:

| File:Line | What it does |
|---|---|
| `src/core/xp/forgeArmorPiece.ts:20` | `forgeArmorPiece()` — main forge function: validates tier, checks dedup, spends diamonds, updates profile |
| `src/core/xp/forgeArmorPiece.ts:95` | `isPieceForged()` — check if piece is forged at tier |
| `src/core/xp/forgeArmorPiece.ts:104` | `getForgedPiecesForTier()` — list all forged pieces for a tier |
| `src/core/xp/forgeCosts.ts:7` | `FORGE_COSTS` — diamond cost table per tier per piece |
| `src/core/xp/forgeCosts.ts:17` | `getForgeCost()` — lookup function |
| `src/core/xp/forgeCosts.ts:22` | `getTierTotalCost()` — sum all pieces for a tier |
| `src/core/types/xp.ts:403-408` | `ForgedPieceEntry` interface — `{ forgedAt, verseResponse?, verseResponseAudio? }` |
| `src/core/types/xp.ts:459-462` | `forgedPieces` field on `AvatarProfile` |
| `src/features/avatar/MyAvatarPage.tsx:93-112` | `getActiveForgeTier()` + `getEquippablePieces()` — duplicated from armorGate.ts |
| `src/features/avatar/MyAvatarPage.tsx:582-607` | `handleForgePiece()` — UI handler calling `forgeArmorPiece()` |
| `src/features/avatar/ArmorVerseCard.tsx:19-25` | Props: `isForged`, `forgeCost`, `onForge` |
| `src/features/avatar/ArmorPieceGallery.tsx:17-29` | `activeForgeTier` prop, shows forge status per piece |
| `src/features/avatar/armorGate.ts:3-22` | `getActiveForgeTier()` + `getEquippablePieces()` — canonical versions |
| `src/core/xp/checkAndUnlockArmor.ts:193-201` | Legacy migration: old `unlockedPieces` → `forgedPieces.wood` |
| `src/features/avatar/normalizeProfile.ts:17-35` | Legacy migration: old `equippedPieces` → `forgedPieces.wood` |

**Note:** `getActiveForgeTier()` and `getEquippablePieces()` are **duplicated** between `armorGate.ts` and `MyAvatarPage.tsx`.

---

## 5. Tier Thresholds

### System A: Voxel Material Tiers (active system — used for forge gating)

**Source:** `src/features/avatar/voxel/tierMaterials.ts:12-19`

| Tier | minXp | Label |
|---|---|---|
| WOOD | 0 | Wood |
| STONE | 200 | Stone |
| IRON | 500 | Iron |
| GOLD | 1,000 | Gold |
| DIAMOND | 2,000 | Diamond |
| NETHERITE | 5,000 | Netherite |

Used by `calculateTier()` in `tierMaterials.ts`, `checkAndUnlockArmor()`, and `addXpEvent()` for tier unlock gating.

### System B: Legacy Armor Tiers (used for XP bar display only)

**Source:** `src/core/xp/armorTiers.ts:42-106`

| Tier | minXp | Label | Title | Pieces |
|---|---|---|---|---|
| None | 0 | No Armor | New Player | 0 |
| Leather | 50 | Leather Armor | Survivor | 1 |
| Chain | 150 | Chainmail Armor | Explorer | 2 |
| Iron | 350 | Iron Armor | Warrior | 3 |
| Gold | 600 | Gold Armor | Champion | 4 |
| Diamond | 1,000 | Diamond Armor | Diamond Scholar | 4 |
| Netherite | 1,800 | Netherite Armor | Netherite Legend | 4 |

Used only by `useXpLedger()` hook for the `armorTier` and `nextTierProgress` return values (display in ProfileMenu/ContextBar).

### Inconsistencies

| Tier | System A (voxel) | System B (legacy) |
|---|---|---|
| Stone | 200 XP | N/A (leather=50, chain=150) |
| Iron | 500 XP | 350 XP |
| Gold | 1,000 XP | 600 XP |
| Diamond | 2,000 XP | 1,000 XP |
| Netherite | 5,000 XP | 1,800 XP |

**The two systems use entirely different thresholds.** System A gates forge access. System B is used for a progress display that may show a different tier than what the forge system thinks.

### Individual Piece XP Unlock Thresholds

**Source:** `src/features/avatar/voxel/buildArmorPiece.ts:159-166` and `src/core/types/xp.ts:127-226`

| Piece | XP Required |
|---|---|
| Belt of Truth | 0 |
| Breastplate of Righteousness | 150 |
| Shoes of Peace | 300 |
| Shield of Faith | 500 |
| Helmet of Salvation | 750 |
| Sword of the Spirit | 1,000 |

These thresholds determine when a piece becomes *available* to forge (at any unlocked tier). Consistent between both definition sites.

---

## 6. Lincoln's Actual Firestore State

**Note:** Cannot directly access Firestore from this audit — no Firebase Admin SDK or console access. The following is derived from code analysis of what *should* exist based on the write paths.

### What the code tells us about runtime state:

- **`totalXp` on avatarProfile:** Cached value, written by `addXpEvent()` every time XP is awarded
- **`totalXp` on xpLedger cumulative doc:** Source of truth for XP, written atomically with per-event doc
- **Diamond balance:** Not stored anywhere — computed on-the-fly by `getDiamondBalance()` summing all `currencyType: 'diamond'` docs
- **No `diamondBalance` or `forgeBalance` field exists** on avatarProfile or any other document

### Potential data issues visible from code:

1. **Race condition in `spendDiamonds()`** (`getDiamondBalance.ts:43-68`): Reads balance, then writes spend doc — no transaction. Two concurrent forge requests could both pass the balance check and overspend.

2. **`pendingTierUpgrade` is set but not declared** in the `AvatarProfile` interface (`addXpEvent.ts:135`). It's preserved by `normalizeAvatarProfile` via spread (`normalizeProfile.ts:84`), but it's a ghost field.

3. **`currentTier` default is `'stone'`** in both `normalizeAvatarProfile` and `defaultAvatarProfile`, even though WOOD tier starts at 0 XP. A brand-new profile with 0 XP would show `currentTier: 'stone'` — a tier that requires 200 XP.

---

## 7. Initial Observations

1. **Two competing tier systems with different thresholds.** The voxel material tier system (WOOD at 0, STONE at 200, ... NETHERITE at 5,000) is used for actual forge gating, while the legacy armor tier system (Leather at 50, ... Netherite at 1,800) is used for some XP progress displays. A child could be shown "Diamond Scholar" title at 1,000 XP but not have access to Diamond-tier forging until 2,000 XP.

2. **Diamond balance has no cached state and no transactional safety.** Balance is computed O(n) on every check by scanning all diamond ledger entries. The `spendDiamonds()` function has a read-then-write race condition — no Firestore transaction wraps the balance check + spend write, so concurrent spends could overdraw.

3. **`getActiveForgeTier()` and `getEquippablePieces()` are duplicated** between `src/features/avatar/armorGate.ts` and `src/features/avatar/MyAvatarPage.tsx` (identical logic, ~20 lines each). This is a maintenance risk if forge tier logic changes.
