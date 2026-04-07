# Economy Audit Part 1 — Data Model & Current State

**Date:** 2026-04-07
**Scope:** Read-only inventory of the avatar economy data model and Firestore collections.

---

## 1. Files Involved

All files that reference economy primitives (`totalXp`, `diamondBalance`, `forgeBalance`, `xpLedger`, `forgeCost`, etc.):

| # | File | Role |
|---|------|------|
| 1 | `src/core/types/xp.ts` | Type definitions: `XpLedger`, `AvatarProfile`, `ArmorPiece`, `ForgedPieceEntry`, `CurrencyType`, `DiamondCategory`, `XP_EVENTS`, `ARMOR_PIECES`, `ACCESSORIES`, `ACCESSORY_XP_THRESHOLDS` |
| 2 | `src/core/xp/addXpEvent.ts` | Core XP/diamond award function. Dedup via per-event docs. Updates cumulative XP doc + avatarProfile. |
| 3 | `src/core/xp/getDiamondBalance.ts` | Computes diamond balance by summing all diamond ledger entries (O(n)). Also exports `spendDiamonds`. |
| 4 | `src/core/xp/forgeArmorPiece.ts` | Forge flow: check tier unlock, check piece status, spend diamonds, update `forgedPieces` on profile. |
| 5 | `src/core/xp/forgeCosts.ts` | `FORGE_COSTS` table: diamond cost per piece per tier (wood through netherite). |
| 6 | `src/core/xp/checkAndUnlockArmor.ts` | Auto-unlock armor pieces and tiers based on XP thresholds. Legacy migration logic. |
| 7 | `src/core/xp/useXpLedger.ts` | React hook: real-time listener on cumulative XP doc. Returns `totalXp`, `sources`, `armorTier`, `nextTierProgress`. |
| 8 | `src/core/xp/armorTiers.ts` | **Legacy** tier system: 7 tiers (None/Leather/Chain/Iron/Gold/Diamond/Netherite) with different XP thresholds than the voxel system. |
| 9 | `src/core/firebase/firestore.ts` | Collection helpers: `xpLedgerCollection`, `avatarProfilesCollection`, `xpLedgerDocId`. |
| 10 | `src/features/avatar/voxel/tierMaterials.ts` | **Canonical** tier system: `TIERS` (Wood/Stone/Iron/Gold/Diamond/Netherite) with minXp thresholds. `calculateTier()`. |
| 11 | `src/features/avatar/voxel/buildArmorPiece.ts` | `XP_THRESHOLDS` per voxel piece (belt=0, breastplate=150, shoes=300, shield=500, helmet=750, sword=1000). |
| 12 | `src/features/avatar/normalizeProfile.ts` | Normalizes raw Firestore data into safe `AvatarProfile`. Includes `migrateEquippedToForged` legacy migration. |
| 13 | `src/features/avatar/armorGate.ts` | Armor gate logic: `isArmorComplete`, `getArmorGateStatus`, `getActiveForgeTier`, `getEquippablePieces`. |
| 14 | `src/features/avatar/MyAvatarPage.tsx` | Main avatar UI. Duplicates `getActiveForgeTier` / `getEquippablePieces` from `armorGate.ts`. Calls `forgeArmorPiece`. |
| 15 | `src/features/avatar/ArmorVerseCard.tsx` | Forge UI: verse response + forge button. Takes `forgeCost`, `isForged`, `onForge` props. |
| 16 | `src/features/avatar/ArmorPieceGallery.tsx` | Piece grid UI. Shows forge cost and status per piece. |
| 17 | `src/features/avatar/ArmorGateScreen.tsx` | Gate screen shown when armor is incomplete. |
| 18 | `src/features/avatar/AvatarHeroBanner.tsx` | Shows totalXp, diamond balance via `XpDiamondBar`. |
| 19 | `src/features/avatar/MinecraftXpBar.tsx` | XP progress bar. |
| 20 | `src/features/avatar/VoxelCharacter.tsx` | 3D voxel renderer. Uses `totalXp` for tier-based materials. |
| 21 | `src/features/avatar/BrothersVoxelScene.tsx` | Multi-child voxel scene. Uses `XP_THRESHOLDS`. |
| 22 | `src/features/avatar/AvatarCharacterDisplay.tsx` | Character display wrapper. |
| 23 | `src/features/avatar/AvatarCustomizer.tsx` | Customizer panel. |
| 24 | `src/features/avatar/AccessoriesPanel.tsx` | Accessories UI (uses `ACCESSORY_XP_THRESHOLDS`). |
| 25 | `src/features/avatar/AvatarThumbnail.tsx` | Thumbnail renderer. |
| 26 | `src/features/avatar/PortalTransition.tsx` | Portal transition animation between tiers. |
| 27 | `src/features/avatar/tierBiomes.ts` | Biome flavor text per tier. |
| 28 | `src/features/avatar/voxel/tierUpCeremony.ts` | Tier-up celebration animation. |
| 29 | `src/components/XpDiamondBar.tsx` | HUD bar showing XP + diamond balance. Polls diamond balance every 10s. |
| 30 | `src/components/ProfileMenu.tsx` | Profile menu, shows XP. |
| 31 | `src/components/ChildSelector.tsx` | Child selector, shows XP. |
| 32 | `src/components/ContextBar.tsx` | Context bar, shows XP. |
| 33 | `src/features/today/KidTodayView.tsx` | Kid today view. Awards XP/diamonds. Uses `XP_THRESHOLDS`. |
| 34 | `src/features/progress/ArmorTab.tsx` | Armor progress tab. Uses `XP_THRESHOLDS`. |
| 35 | `src/features/quest/KnowledgeMinePage.tsx` | Quest page, awards diamonds. |
| 36 | `src/features/settings/AvatarAdminTab.tsx` | Admin tab for manual XP/diamond adjustments. |
| 37 | `src/features/workshop/BoardSpace.tsx` | Workshop board space. |
| 38 | `src/app/AppShell.tsx` | App shell, renders `XpDiamondBar`. |
| 39 | `functions/src/ai/imageTasks/extractFeatures.ts` | AI feature extraction (references profile). |
| 40 | `src/core/xp/addXpEvent.test.ts` | Tests for XP/diamond award logic. |
| 41 | `src/core/xp/getDiamondBalance.test.ts` | Tests for diamond balance computation. |

---

## 2. AvatarProfile Data Model

**Type definition:** `src/core/types/xp.ts:410-476`
**Collection path:** `families/{familyId}/avatarProfiles/{childId}`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `childId` | `string` | `''` | Child identifier (doc ID) |
| `themeStyle` | `'minecraft' \| 'platformer'` | `'minecraft'` | Visual theme |
| `pieces` | `ArmorPieceProgress[]` | `[]` | Per-piece unlock/image tracking |
| `currentTier` | `ArmorTier \| PlatformerTier` | `'stone'` | Current display tier |
| `characterFeatures` | `CharacterFeatures` | Lincoln defaults | AI-extracted facial features |
| `ageGroup` | `'older' \| 'younger'` | `'older'` | Body proportions template |
| `photoUrl` | `string?` | `undefined` | Original uploaded photo URL |
| `equippedPieces` | `string[]` | `[]` | Currently equipped voxel piece IDs |
| `lastEquipAnimation` | `string?` | `undefined` | Last piece animated |
| `customization` | `OutfitCustomization?` | `undefined` | Colors, emblems, crests, accessories, proportions, background |
| `skinTextureUrl` | `string?` | `undefined` | AI-generated Minecraft face URL |
| `skinTextureGeneratedAt` | `string?` | `undefined` | Skin generation timestamp |
| `faceGrid` | `string[]?` | `undefined` | 64-color hex array for pixel face |
| `baseCharacterUrl` | `string?` | `undefined` | **DEPRECATED** legacy 2D base |
| `photoTransformUrl` | `string?` | `undefined` | **DEPRECATED** legacy 2D transform |
| `armorSheetUrls` | `Record<string, string>?` | `undefined` | **DEPRECATED** legacy 2D armor sheets |
| `armorReferenceUrls` | `Record<string, string>?` | `undefined` | **DEPRECATED** legacy 2D references |
| `croppedRegionUrls` | `Record<ArmorPiece, string>?` | `undefined` | **DEPRECATED** legacy 2D crops |
| `unlockedPieces` | `string[]` | `[]` | **Legacy**, superseded by `forgedPieces` |
| `unlockedTiers` | `string[]` | `['wood']` | Tiers unlocked by XP (grants forge access) |
| `forgedPieces` | `Record<string, Record<string, ForgedPieceEntry>>?` | `undefined` | Individually forged pieces. Outer key = tier, inner key = voxel piece ID. |
| `lastPortalTier` | `string?` | `undefined` | Tier where portal transition last played |
| `lastArmorEquipDate` | `string?` | `undefined` | Date of last armor equip (daily reset) |
| `armorStreak` | `number` | `0` | Consecutive days with full armor |
| `lastFullArmorDate` | `string?` | `undefined` | Last date all pieces equipped |
| `totalXp` | `number` | `0` | **Cached** from xpLedger cumulative doc |
| `updatedAt` | `string` | `now()` | ISO timestamp |
| `pendingTierUpgrade` | `string?` | `undefined` | **Undeclared on type** — set by `addXpEvent` on tier change, cleared by `MyAvatarPage` via `deleteField()` |

### Fields NOT on the TypeScript type but written to Firestore:
- `pendingTierUpgrade` — Written by `addXpEvent.ts:135`, read/cleared by `MyAvatarPage.tsx:1105` and `normalizeProfile.ts:84`. **Not declared on the `AvatarProfile` interface.**

### Notable absences:
- **No `diamondBalance` field** on `AvatarProfile`. Diamond balance is computed on-the-fly from ledger entries every time.
- **No `forgeBalance` field** exists anywhere. "Forge" is the action of spending diamonds to craft armor — it is not a separate currency.

---

## 3. Collections

### 3.1 xpLedger

**Path:** `families/{familyId}/xpLedger/{docId}`
**Doc ID scheme:** Cumulative doc = `{childId}`, Event docs = `{childId}_{dedupKey}`

This single collection serves **dual purpose**: XP tracking AND diamond tracking, differentiated by `currencyType`.

| Field | Type | Present on | Description |
|-------|------|-----------|-------------|
| `childId` | `string` | Both | Child identifier |
| `totalXp` | `number` | Both | Cumulative XP (cumulative doc) or event amount (event doc) |
| `sources` | `{ routines, quests, books }` | Both | XP breakdown by source |
| `lastUpdatedAt` | `string` | Both | ISO timestamp |
| `dedupKey` | `string?` | Event only | Unique event identifier |
| `type` | `string?` | Event only | XP event type (e.g., `'CHECKLIST_DAY_COMPLETE'`) |
| `amount` | `number?` | Event only | XP/diamond amount for this event (negative for spends) |
| `meta` | `Record<string, string>?` | Event only | Optional metadata |
| `awardedAt` | `string?` | Event only | ISO timestamp of award |
| `currencyType` | `CurrencyType?` | Event only | `'xp'` (default/legacy) or `'diamond'` |
| `category` | `DiamondCategory?` | Diamond events | `'earn'`, `'forge'`, `'cosmetic'`, `'decoration'` |
| `itemId` | `string?` | Diamond events | Reference to purchased item |

**Writers:**
- `addXpEvent()` in `src/core/xp/addXpEvent.ts` — all XP and diamond entries
- `spendDiamonds()` in `src/core/xp/getDiamondBalance.ts` — calls `addXpEvent` with negative amount

**Readers:**
- `useXpLedger()` hook — real-time listener on cumulative doc (`{childId}`)
- `getDiamondBalance()` — queries all docs where `currencyType == 'diamond'` and sums `amount`
- `XpDiamondBar` component — duplicates `getDiamondBalance` logic inline, polls every 10s
- `checkAndUnlockArmor()` — reads cumulative doc for XP total
- `ArmorTab` — reads event docs for history display

**Dedup:** Yes — doc ID = `{childId}_{dedupKey}`. If doc exists, award is skipped.

### 3.2 diamondLedger

**Does NOT exist as a separate collection.** Diamond transactions are stored in the `xpLedger` collection with `currencyType: 'diamond'`. There is no `diamondLedger` collection.

### 3.3 forgeLedger

**Does NOT exist.** Forge spend events are diamond entries in `xpLedger` with `category: 'forge'`.

### 3.4 Other economy-adjacent collections

| Collection | Path | Purpose |
|-----------|------|---------|
| `dailyArmorSessions` | `families/{familyId}/dailyArmorSessions/{docId}` | Tracks which armor pieces were applied each day |
| `avatarProfiles` | `families/{familyId}/avatarProfiles/{childId}` | Avatar state including cached `totalXp` |

---

## 4. Forge References

"Forge" is the action of spending diamonds to craft/materialize an armor piece at a specific tier. It is **not** a separate currency. It uses the diamond currency.

| File:Line | What it does |
|-----------|-------------|
| `src/core/types/xp.ts:13` | `DiamondCategory.Forge = 'forge'` — category tag for forge spend events |
| `src/core/types/xp.ts:403-408` | `ForgedPieceEntry` interface — records `forgedAt`, optional `verseResponse`/`verseResponseAudio` |
| `src/core/types/xp.ts:449-462` | `AvatarProfile.unlockedPieces` (legacy), `unlockedTiers`, `forgedPieces` fields |
| `src/core/xp/forgeCosts.ts:7-14` | `FORGE_COSTS` table — diamond costs per piece per tier |
| `src/core/xp/forgeCosts.ts:17-18` | `getForgeCost(tier, piece)` — lookup helper |
| `src/core/xp/forgeCosts.ts:22-26` | `getTierTotalCost(tier)` — sum all piece costs for a tier |
| `src/core/xp/forgeArmorPiece.ts:20-92` | `forgeArmorPiece()` — main forge function: validates tier/piece, spends diamonds, updates profile |
| `src/core/xp/forgeArmorPiece.ts:94-101` | `isPieceForged()` — check if piece forged at tier |
| `src/core/xp/forgeArmorPiece.ts:103-111` | `getForgedPiecesForTier()` — list forged pieces for a tier |
| `src/core/xp/forgeArmorPiece.ts:113-119` | `isTierComplete()` — check if all 6 pieces forged for a tier |
| `src/core/xp/getDiamondBalance.ts:59` | `spendDiamonds()` called with `category: 'forge'` during forge |
| `src/features/avatar/armorGate.ts:4-16` | `getActiveForgeTier()` — finds lowest unlocked tier with unforged pieces |
| `src/features/avatar/armorGate.ts:19-23` | `getEquippablePieces()` — pieces forged in active tier |
| `src/features/avatar/MyAvatarPage.tsx:93-107` | **Duplicate** of `getActiveForgeTier()` from `armorGate.ts` |
| `src/features/avatar/MyAvatarPage.tsx:108-112` | **Duplicate** of `getEquippablePieces()` from `armorGate.ts` |
| `src/features/avatar/MyAvatarPage.tsx:582-608` | `handleForgePiece()` — UI handler calling `forgeArmorPiece()` |
| `src/features/avatar/ArmorVerseCard.tsx:19-102` | Verse card with forge button UI |
| `src/features/avatar/ArmorPieceGallery.tsx:63-65` | Shows forge status and cost per piece |
| `src/features/avatar/normalizeProfile.ts:17-35` | `migrateEquippedToForged()` — legacy migration: treats equipped pieces as wood-tier forged |
| `src/core/xp/checkAndUnlockArmor.ts:193-201` | Legacy migration: unlocked pieces → wood-tier forged |
| `src/features/avatar/PortalTransition.tsx:218` | Flavor text: "Your armor awaits. Forge it from the {tier}..." |
| `src/features/avatar/tierBiomes.ts:7,11` | Flavor text mentioning forge |
| `src/components/avatar/TierUpCeremony.tsx:156` | "Your armor has been reforged!" |
| `src/features/avatar/voxel/tierUpCeremony.ts:182,316` | "Armor reforged!" ceremony text |

---

## 5. Tier Thresholds

### TWO CONFLICTING TIER SYSTEMS EXIST

#### System A: Voxel Tier System (canonical for 3D armor)
**Source:** `src/features/avatar/voxel/tierMaterials.ts:12-19`
**Used by:** `calculateTier()`, `checkAndUnlockArmor()`, `addXpEvent()`, `XpDiamondBar`

| Tier | minXp |
|------|-------|
| Wood | 0 |
| Stone | 200 |
| Iron | 500 |
| Gold | 1,000 |
| Diamond | 2,000 |
| Netherite | 5,000 |

#### System B: Legacy ArmorTier System (used by XP progress bar)
**Source:** `src/core/xp/armorTiers.ts:42-106`
**Used by:** `useXpLedger()` hook → `getArmorTier()`, `getNextTierProgress()`

| Tier | minXp |
|------|-------|
| None | 0 |
| Leather | 50 |
| Chain | 150 |
| Iron | 350 |
| Gold | 600 |
| Diamond | 1,000 |
| Netherite | 1,800 |

#### System C: Per-Piece XP Unlock Thresholds
**Source:** `src/features/avatar/voxel/buildArmorPiece.ts:159-166`
**Used by:** `checkAndUnlockArmor()`, `ArmorTab`, `KidTodayView`, `MyAvatarPage`, `BrothersVoxelScene`

| Piece | XP Required |
|-------|-------------|
| Belt | 0 |
| Breastplate | 150 |
| Shoes | 300 |
| Shield | 500 |
| Helmet | 750 |
| Sword | 1,000 |

These thresholds gate which pieces are **available** to forge (XP unlock), but forging still costs diamonds.

#### System D: Per-Piece Stone-Tier Thresholds (from ARMOR_PIECES)
**Source:** `src/core/types/xp.ts:136-227`

| Piece | xpToUnlockStone |
|-------|-----------------|
| Belt of Truth | 0 |
| Breastplate of Righteousness | 150 |
| Shoes of Peace | 300 |
| Shield of Faith | 500 |
| Helmet of Salvation | 750 |
| Sword of the Spirit | 1,000 |

These match System C. `xpToUnlockDiamond` and `xpToUnlockNetherite` are all 0, meaning higher-tier pieces are unlocked by **tier upgrade**, not individual XP thresholds.

### Forge Costs (Diamond Currency)

**Source:** `src/core/xp/forgeCosts.ts:7-14`

| Tier | Belt | Shoes | Breastplate | Shield | Helmet | Sword | **Total** |
|------|------|-------|-------------|--------|--------|-------|-----------|
| Wood | 5 | 5 | 8 | 8 | 8 | 10 | **44** |
| Stone | 15 | 15 | 20 | 25 | 25 | 30 | **130** |
| Iron | 30 | 30 | 40 | 45 | 45 | 50 | **240** |
| Gold | 50 | 50 | 65 | 70 | 70 | 80 | **385** |
| Diamond | 80 | 80 | 100 | 110 | 110 | 130 | **610** |
| Netherite | 120 | 120 | 150 | 160 | 160 | 200 | **910** |

**Grand total to forge all tiers:** 2,319 diamonds.

---

## 6. Lincoln's Actual Firestore State

**Note:** Cannot directly read Firestore from this environment. However, from code analysis:

### What we know from code defaults:
- Lincoln's `childId` would be stored in `families/{familyId}/children`
- His profile defaults: `themeStyle: 'minecraft'`, `ageGroup: 'older'`
- Character features: `LINCOLN_FEATURES` (skinTone: `#F5D6B8`, hairColor: `#6B4C32`, hairStyle: `'medium'`)

### xpLedger structure:
- **Cumulative doc:** `families/{familyId}/xpLedger/{childId}` — has `totalXp`, `sources`
- **Event docs:** `families/{familyId}/xpLedger/{childId}_{dedupKey}` — one per XP/diamond event
- No separate `diamondLedger` collection exists

### Diamond earning sources found in code:
| Source | Amount | File |
|--------|--------|------|
| Quest diamonds (per diamond mined) | 2 | `useQuestSession.ts:773,790` |
| Quest diamond (fluency) | 2 | `useQuestSession.ts:1436,1445` |
| Quest diamond (with diamond category) | 2 | `useQuestSession.ts:797,1449` |
| Book completed | variable | `useBook.ts:279` |
| Book page read | variable | `BookReaderPage.tsx:261` |
| Dad Lab complete | variable | `useDadLabReports.ts:110` |
| Dad Lab (per child) | variable | `useDadLabReports.ts:139` |
| Conundrum response | variable | `KidConundrumResponse.tsx:138,178` |
| Extra activity log | variable | `KidExtraLogger.tsx:73` |
| Teach-back | variable | `KidTeachBack.tsx:112` |
| Workshop (board/adventure/card) | variable | `WorkshopPage.tsx:723,782,853` |

---

## 7. Initial Observations

1. **Two conflicting tier systems exist.** The voxel system (`tierMaterials.ts`) uses thresholds 0/200/500/1000/2000/5000 with tier names Wood/Stone/Iron/Gold/Diamond/Netherite. The legacy system (`armorTiers.ts`) uses thresholds 0/50/150/350/600/1000/1800 with tier names None/Leather/Chain/Iron/Gold/Diamond/Netherite. The `useXpLedger` hook returns tier info from the **legacy** system, while `addXpEvent` and `checkAndUnlockArmor` use the **voxel** system. This means the XP bar progress indicator may show a different tier than what the avatar actually displays.

2. **Diamond balance is computed O(n) on every read** by scanning all diamond ledger entries. `XpDiamondBar` duplicates the `getDiamondBalance` query logic inline and polls every 10 seconds, creating unnecessary Firestore reads. There is no cached `diamondBalance` on the profile (the code has a TODO acknowledging this).

3. **`MyAvatarPage.tsx` duplicates `getActiveForgeTier()` and `getEquippablePieces()`** from `armorGate.ts` — identical implementations exist in both files. Also, `pendingTierUpgrade` is written to and read from Firestore but is **not declared on the `AvatarProfile` TypeScript interface**, relying on `as unknown` casts to work.
