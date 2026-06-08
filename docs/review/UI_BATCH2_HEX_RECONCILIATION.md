# UI Batch 2 — MUI-default hex vs. the real theme palette (READ-ONLY recon)

**Status:** Decision aid only. **This document changes no code.** It exists because the ARCH-18
audit framed Batch 2 as "swap MUI-duplicate hexes for `theme.palette.*` refs," and a gauge showed
that swap is **not** color-neutral: the app's theme palette is *customized*, while most of the
hardcoded hexes are MUI *defaults*. Swapping them would re-render colors — a visual decision for
Nathan, not a mechanical rename. Each group below is framed as an **option**, not a change.

Ledger row: **ARCH-22**. Follow-up swaps (only the groups Nathan approves) are a separate
confirm-gated run.

---

## Step 1 — The ACTUAL resolved theme palette

`src/app/theme.ts` builds **three** themes via `buildTheme(mode)` (`family`, `lincoln`, `london`).
Each only overrides a *subset* of palette roles; **every un-overridden role falls back to the MUI
default color object.** MUI version: **`@mui/material ^7.3.7`** (v7 light defaults below — stable
across v5–v7).

### MUI v7 default light palette (the fallback for any role a theme doesn't set)

| Role | `.main` | `.light` | `.dark` |
|---|---|---|---|
| primary | `#1976d2` | `#42a5f5` | `#1565c0` |
| secondary | `#9c27b0` | `#ba68c8` | `#7b1fa2` |
| error | `#d32f2f` | `#ef5350` | `#c62828` |
| warning | `#ed6c02` | `#ff9800` | `#e65100` |
| info | `#0288d1` | `#03a9f4` | `#01579b` |
| success | `#2e7d32` | `#4caf50` | `#1b5e20` |

> Note: when a theme supplies only a role's `.main`, MUI **computes** `.light`/`.dark` from it
> (tonalOffset 0.2) — they do **not** stay at the default. When a theme omits a role **entirely**,
> MUI uses the full default object above (main + light + dark all canonical). That distinction is
> what makes some hexes EXACT and others NEAR-DUP.

### Resolved `.main` per theme (what a component actually gets)

`src/app/tokens.ts` supplies `kidPalette`: `xpGreen #7EFC20`, `gold #FCDB5B`, `diamond #5BFCEE`.

| Role | `family` (parent default) | `lincoln` (Minecraft) | `london` (Mario) |
|---|---|---|---|
| **primary.main** | `#5c6bc0` *(custom)* | `#5A8C32` *(custom)* | `#E52521` *(custom)* |
| **secondary.main** | `#7e57c2` *(custom)* | `#8B6914` *(custom)* | `#FBD000` *(custom)* |
| **success.main** | `#2e7d32` *(default)* | `#7EFC20` *(custom = xpGreen)* | `#2e7d32` *(default)* |
| **warning.main** | `#ed6c02` *(default)* | `#FCDB5B` *(custom = gold)* | `#ed6c02` *(default)* |
| **error.main** | `#d32f2f` *(default)* | `#d32f2f` *(default)* | `#d32f2f` *(default)* |
| **info.main** | `#0288d1` *(default)* | `#5DECF5` *(custom)* | `#0288d1` *(default)* |

**Resolved `.light` / `.dark` for roles that fall back to default** (family & london success/warning/error/info):
`success.light #4caf50` · `success.dark #1b5e20` · `warning.light #ff9800` · `warning.dark #e65100` ·
`error.light #ef5350` · `error.dark #c62828` · `info.light #03a9f4` · `info.dark #01579b`.

**Key consequences for the swap:**
1. **success / warning / error / info are NOT customized in `family`/`london`** — so a hardcoded
   `#4caf50`, `#2e7d32`, `#ff9800`, `#e65100`, `#d32f2f`, `#c62828`, `#0288d1` rendered on a parent
   surface is **already exactly** the corresponding theme value. Swapping is color-neutral there.
2. **primary & secondary ARE customized in every theme.** A hardcoded MUI-default `#9c27b0`,
   `#7b1fa2`, `#1976d2`, `#1565c0`, `#42a5f5` does **not** match the theme's purple/indigo — swapping
   shifts the color.
3. **Components that render in `lincoln`/`london` mode resolve differently.** `success`/`warning`/`info`
   are overridden there, so a `#4caf50`/`#ff9800` on a kid/avatar surface that swaps to
   `theme.palette.success.main` would become `#7EFC20`/gold — a large shift. This is why the avatar
   lane is held for the Hero Hub chat (see scope note).

---

## Step 2 — Classification of every MUI-ish hardcoded hex usage

**Class legend:** **EXACT** — hex === the theme value it'd map to (color-neutral swap, in the noted
theme). **NEAR-DUP** — hex ≈ a role but the theme customized that role, so swapping shifts color.
**NO-EQ** — a hand-picked Material shade with no matching palette role (`green[400/700]`, `blue[500]`,
`red[500/600]`, `orange[700]`, `purple[800]`); leave literal or mint a token.

**Lane:** `home` = parent/home-base surface (renders `family` mode → EXACT swaps are safe). `avatar` =
avatar/Hero-Hub lane (renders kid mode, **out of scope** — Hero Hub chat). `kid` = kid-facing today/quest
surface (renders kid mode). `print` = static HTML/PDF export string (no theme access at all — `theme.*`
is literally unavailable, so these can only ever be a shared token, never a palette ref).

### Greens — `#4caf50` (32) · `#2e7d32` (9) · `#66bb6a` (2) · `#388e3c` (7)

| file:line | styles | hex | maps to | class | lane |
|---|---|---|---|---|---|
| `XpDiamondBar.tsx:71` | XP count text | `#4CAF50` | success.light | EXACT* | avatar |
| `XpDiamondBar.tsx:104` | XP bar gradient | `#2E7D32`/`#4CAF50`/`#66BB6A` | success.main/light + green[400] | EXACT*/NO-EQ | avatar |
| `progress/ArmorTab.tsx:195` | progress bar | `#4caf50` | success.light | EXACT* | avatar |
| `progress/ArmorTab.tsx:385` | XP chip bg | `#4caf50` (+`#e65100`) | success.light / warning.dark | EXACT | home |
| `progress/ArmorTab.tsx:386` | chip hover | `#388e3c` (+`#bf360c`) | green[700] | NO-EQ | home |
| `progress/ArmorTab.tsx:603` | +/- amount text | `#4caf50` (+`#e53935`) | success.light / red[600] | EXACT/NO-EQ | home |
| `progress/WordBlock.tsx:7` | "known" bg/border | `#2e7d32`/`#4caf50` | success.main/light | EXACT | home |
| `progress/learning-map/SkillNodeCard.tsx:20` | "Mastered" | `#4caf50` | success.light | EXACT | home |
| `progress/learning-map/DomainSection.tsx:23` | "applying" | `#66bb6a` | green[400] | NO-EQ | home |
| `progress/learning-map/LearningMap.tsx:94` | buffer bar | `#4caf50` | success.light | EXACT | home |
| `books/SightWordDashboard.tsx:25` | "mastered" | `#4caf50` | success.light | EXACT | home |
| `books/SightWordDashboard.tsx:147` | progress bar | `#4caf50` | success.light | EXACT | home |
| `books/BookReaderPage.tsx:362` | Lincoln accent | `#4caf50` | success.light | EXACT* | kid |
| `books/StoryGuidePage.tsx:57-58` | Lincoln accent + hover | `#4caf50`/`#388e3c` | success.light / green[700] | EXACT*/NO-EQ | kid |
| `books/StoryGuideQuestion.tsx:56` | Lincoln accent | `#4caf50` | success.light | EXACT* | kid |
| `records/ComplianceDashboard.tsx:41` | Status.Green | `#4caf50` | success.light | EXACT | home |
| `records/MonthlyTrend.tsx:47,102` | legend + bar | `#4caf50` | success.light | EXACT | home |
| `today/KidChapterPool.tsx:326,339,456,458` | done border/text/bg + hover | `#4CAF50`/`#388E3C` | success.light / green[700] | EXACT*/NO-EQ | kid |
| `today/KidChecklist.tsx:218,221,412,415` | done bg + hover | `#4CAF50`/`#388E3C` | success.light / green[700] | EXACT*/NO-EQ | kid |
| `avatar/AccessoriesPanel.tsx:199` | equipped chip | `#4caf50` | success.light | EXACT* | avatar |
| `avatar/ArmorGateScreen.tsx:92,109,110,115` | equipped/CTA (non-Lincoln branch) | `#4caf50` | success.light | EXACT* | avatar |
| `avatar/ArmorPieceGallery.tsx:225,327` | status dot/chip | `#4caf50` | success.light | EXACT* | avatar |
| `avatar/ArmorVerseCard.tsx:352` | accent text | `#4caf50` | success.light | EXACT* | avatar |
| `avatar/icons/ArmorIcons.tsx:47` | SVG `fill` | `#2e7d32` | success.main | EXACT* | avatar |
| `workshop/BoardSpace.tsx:159` | "+N" move text | `#2e7d32` | success.main | EXACT | home |
| `workshop/GamePlayView.tsx:42` · `useGameSession.ts:35` | PLAYER_COLORS[2] | `#388e3c` | green[700] | NO-EQ | home |
| `planner-chat/generateMaterials.ts:231,235,240` | print CSS | `#2e7d32`/`#4caf50` | success.main/light | EXACT/print | print |
| `planner/TeachHelperDialog.tsx:228,235` | print CSS | `#2e7d32`/`#4caf50` | success.main/light | EXACT/print | print |
| `records/records.logic.ts:746` | print CSS border | `#4caf50` | success.light | EXACT/print | print |

\* EXACT against `family`/`london` only. On a `lincoln`-mode surface (avatar/kid Lincoln branch),
`success.main` resolves to `#7EFC20` — swapping to the palette ref would shift the green.

### Oranges — `#ff9800` (16) · `#e65100` (8)

| file:line | styles | hex | maps to | class | lane |
|---|---|---|---|---|---|
| `app/AppShell.tsx:114,125` | nav badge bg/text | `#FF9800` | warning.light | EXACT | home |
| `progress/learning-map/SkillNodeCard.tsx:19` | "InProgress" | `#ff9800` | warning.light | EXACT | home |
| `progress/learning-map/LearningMap.tsx:95` | buffer bar 2 | `#ff9800` | warning.light | EXACT | home |
| `progress/WordBlock.tsx:8` | "emerging" bg/border | `#e65100`/`#ff9800` | warning.dark/light | EXACT | home |
| `progress/PatternSummary.tsx:90` | gradient | `#ff9800`→`#e65100` | warning.light→dark | EXACT | home |
| `records/ComplianceDashboard.tsx:42` | Status.Yellow | `#ff9800` | warning.light | EXACT | home |
| `books/ComprehensionQuestions.tsx:30` | "inference" | `#ff9800` | warning.light | EXACT | home |
| `workshop/BoardSpace.tsx:86,93` | special-space border/text | `#ff9800` | warning.light | EXACT | home |
| `workshop/ChallengeCard.tsx:196,247` | stretch border + text | `#ff9800`/`#e65100` | warning.light/dark | EXACT | home |
| `avatar/AccessoriesPanel.tsx:112,170` | conflict border/text | `#ff9800` | warning.light | EXACT* | avatar |
| `avatar/ArmorPieceGallery.tsx:158,222,344` | upgrade/warn (non-Lincoln branch) | `#FF9800`/`#E65100` | warning.light/dark | EXACT* | avatar |
| `avatar/icons/ArmorIcons.tsx:13` | powerup SVG stroke | `#FF9800` | warning.light | EXACT* | avatar |
| `avatar/TierUpgradeCelebration.tsx:213` | accent (non-Lincoln) | `#E65100` | warning.dark | EXACT* | avatar |

\* On a `lincoln`-mode surface `warning.main` = gold `#FCDB5B`; swapping shifts the orange.

### Purples — `#9c27b0` (11) · `#7b1fa2` (4) · `#6a1b9a` (3)

These are the clearest **NEAR-DUP** family: `#9c27b0`/`#7b1fa2` are MUI **default** secondary
main/dark, but **every theme customizes `secondary`** (`#7e57c2` / `#8B6914` / `#FBD000`). Mapping
to `theme.palette.secondary.*` would turn these purples into indigo/brown/gold — a drastic shift.
`#6a1b9a` (`purple[800]`) has no role at all.

| file:line | styles | hex | maps to (default role) | class | lane |
|---|---|---|---|---|---|
| `books/ComprehensionQuestions.tsx:31` | "opinion" tag | `#9c27b0` | secondary.main (default) | NEAR-DUP | home |
| `workshop/BoardSpace.tsx:159` | "neutral" move text | `#6a1b9a` | purple[800] | NO-EQ | home |
| `avatar/ArmorSuitUpPanel.tsx:108,224` | accent (non-Lincoln) | `#9C27B0` | secondary.main | NEAR-DUP | avatar |
| `avatar/MyAvatarPage.tsx:1337,1339` | portal btn bg/hover | `#7B1FA2`/`#9C27B0` | secondary.dark/main | NEAR-DUP | avatar |
| `avatar/PortalTransition.tsx:126,133` | portal btn bg/hover | `#7B1FA2`/`#9C27B0` | secondary.dark/main | NEAR-DUP | avatar |
| `avatar/Particles.tsx:43` | particle color | `#9C27B0` | secondary.main | NEAR-DUP | avatar |
| `avatar/TierRevealBanner.tsx:47` | accent (non-Lincoln) | `#7B1FA2` | secondary.dark | NEAR-DUP | avatar |
| `avatar/TierUpgradeCelebration.tsx:62,197` | confetti + accent | `#9C27B0` | secondary.main | NEAR-DUP | avatar |
| `avatar/UnlockCelebration.tsx:159` · `VerseCard.tsx:407` | accent (non-Lincoln) | `#9C27B0` | secondary.main | NEAR-DUP | avatar |
| `avatar/ArmorSuitUpPanel`… / `icons/ArmorIcons.tsx:11` | netherite stroke/glow | `#9C27B0`/`#7B1FA2` | secondary.main/dark | NEAR-DUP | avatar |
| `avatar/OutfitCustomizer.tsx:23` · `ArmorDyePanel.tsx:27` | dye swatch "Purple" | `#6A1B9A` | purple[800] | NO-EQ | avatar |

### Reds — `#d32f2f` (2) · `#c62828` (3) · `#f44336` (2) · `#e53935` (1)

| file:line | styles | hex | maps to | class | lane |
|---|---|---|---|---|---|
| `workshop/GamePlayView.tsx:42` · `useGameSession.ts:35` | PLAYER_COLORS[1] | `#d32f2f` | error.main | EXACT | home |
| `workshop/BoardSpace.tsx:159` | "-N" move text | `#c62828` | error.dark | EXACT | home |
| `avatar/OutfitCustomizer.tsx:19` · `ArmorDyePanel.tsx:24` | dye swatch "Red" | `#C62828` | error.dark | EXACT* | avatar |
| `progress/WordBlock.tsx:9` | "struggling" border | `#f44336` | red[500] (error.light=`#ef5350`) | NO-EQ | home |
| `records/ComplianceDashboard.tsx:43` | Status.Red | `#f44336` | red[500] | NO-EQ | home |
| `progress/ArmorTab.tsx:603` | negative amount text | `#e53935` | red[600] | NO-EQ | home |

\* `error` is default in all three themes, so even avatar-lane red swaps are color-neutral — but
the avatar lane is still deferred to Hero Hub for ownership reasons.

### Blues — `#0288d1` (2) · `#1976d2` (2) · `#1565c0` (2) · `#42a5f5` (2) · `#2196f3` (2) · `#f57c00` (2, orange tail)

| file:line | styles | hex | maps to | class | lane |
|---|---|---|---|---|---|
| `settings/AvatarAdminTab.tsx:678,829` | diamond balance text | `#0288d1` | info.main | EXACT | home |
| `workshop/GamePlayView.tsx:42` · `useGameSession.ts:35` | PLAYER_COLORS[0]/[3] | `#1976d2`/`#f57c00` | primary.main (default) / orange[700] | NEAR-DUP/NO-EQ | home |
| `books/SightWordDashboard.tsx:26` | "familiar" | `#2196f3` | blue[500] (info.light=`#03a9f4`) | NO-EQ | home |
| `books/ComprehensionQuestions.tsx:29` | "recall" | `#2196f3` | blue[500] | NO-EQ | home |
| `progress/learning-map/DomainSection.tsx:24` | "extending" | `#42a5f5` | primary.light (default) | NEAR-DUP | home |
| `books/printBook.ts:24` | print sight-word bg | `#42A5F5` | primary.light | NEAR-DUP/print | print |
| `avatar/OutfitCustomizer.tsx:20` · `ArmorDyePanel.tsx:25` | dye swatch "Blue" | `#1565C0` | primary.dark (default) | NEAR-DUP | avatar |

> `#1976d2`/`#1565c0`/`#42a5f5` are MUI-**default** primary shades, but **every theme customizes
> `primary`** (`#5c6bc0`/`#5A8C32`/`#E52521`) — mapping to `theme.palette.primary.*` would shift
> these blues to indigo/green/red. `#0288d1` is the lone EXACT blue because `info` is left at default
> in `family`/`london`.

### Pinks (already non-MUI — noted, not in-scope)
`#f06292`, `#e8a0bf`, `#e91e8c` (StoryGuide/BookReader London-branch accents) and `#FF69B4` (confetti)
are **not** MUI palette defaults — they're bespoke London-pink accents with no role. Listed only so a
later run doesn't mistake them for swap candidates. **NO-EQ; leave literal or token under the kid lane.**

---

## Step 3 — Per-color-family reconcile options (decide nothing)

> Recommendations are **options for Nathan.** "Unify" = accept any color shift for theme consistency.
> "Keep" = the literal is intentional / a swap would change rendering. "Token" = mint a named constant
> (extends `src/app/tokens.ts` or a new semantic token set) for values with no palette role and/or for
> print strings where `theme.*` is unavailable.

### 🟢 Greens — ~50 usages (`#4caf50` ×32, `#2e7d32` ×9, `#388e3c` ×7, `#66bb6a` ×2)
- **Semantics:** "success / mastered / known / done / equipped / positive-delta." `#4caf50`=success.light,
  `#2e7d32`=success.main, `#388e3c`=hover-darker (green[700]), `#66bb6a`=lighter fill (green[400]).
- **Theme value:** `success.light`/`success.main` — but **only in `family`/`london`.** On kid/Lincoln
  surfaces success = `#7EFC20`.
- **Recommendation — split by lane:**
  - **home-lane EXACT greens (`ArmorTab` chip, `WordBlock`, `SkillNodeCard`, `SightWordDashboard`,
    `ComplianceDashboard`, `MonthlyTrend`, `LearningMap`, `BoardSpace`):** *unify to
    `theme.palette.success.main/.light`* — color-neutral, real consistency win.
  - **`#388e3c` hovers & `#66bb6a`:** *keep or token* — no palette role; if unified they'd need
    `success.dark` (`#1b5e20`, a visible shift). Recommend a `successHover` token if consistency wanted.
  - **kid/avatar greens (`KidChecklist`, `KidChapterPool`, `BookReader`, `StoryGuide*`, all `avatar/*`):**
    *defer to Hero Hub / keep* — these render in kid mode where the palette ref ≠ `#4caf50`.
  - **print CSS greens:** *token only* — `theme.*` is unreachable in export strings.

### 🟠 Oranges — ~24 usages (`#ff9800` ×16, `#e65100` ×8)
- **Semantics:** "warning / in-progress / emerging / stretch / yellow-status." `#ff9800`=warning.light,
  `#e65100`=warning.dark.
- **Theme value:** `warning.light`/`warning.dark` (default in `family`/`london`; gold in Lincoln).
- **Recommendation:** **home-lane** (`AppShell` badge, `SkillNodeCard`, `LearningMap`, `WordBlock`,
  `PatternSummary`, `ComplianceDashboard`, `ComprehensionQuestions`, `BoardSpace`, `ChallengeCard`):
  *unify to `warning.light/.dark`* — color-neutral. **avatar-lane** oranges: *defer to Hero Hub*
  (Lincoln warning = gold). Net: the single cleanest, lowest-risk group to unify.

### 🟣 Purples — ~18 usages (`#9c27b0` ×11, `#7b1fa2` ×4, `#6a1b9a` ×3)
- **Semantics:** "portal / netherite / celebration accent / opinion tag / neutral move."
- **Theme value:** would map to `secondary.*` — **but secondary is customized in all themes**
  (`#7e57c2`/`#8B6914`/`#FBD000`). Mapping ⇒ indigo/brown/gold, a drastic shift.
- **Recommendation:** ***keep as-is*** (or mint an `accentPurple`/`netherite` token). These purples are
  deliberate (Minecraft netherite, Nether-portal). Do **not** unify to `secondary`. Most are avatar-lane
  anyway → Hero Hub. The one home-lane purple (`ComprehensionQuestions "opinion"` `#9c27b0`) is a chart
  category color, not a "secondary brand" — keep or token, don't unify.

### 🔴 Reds — ~8 usages (`#d32f2f` ×2, `#c62828` ×3, `#f44336` ×2, `#e53935` ×1)
- **Semantics:** "error / wrong / negative-delta / red-status / player-2."
- **Theme value:** `error` is **default in all three themes**, so `#d32f2f`=error.main and
  `#c62828`=error.dark are **EXACT everywhere** (rare cross-mode safe swap). `#f44336` (red[500]) and
  `#e53935` (red[600]) have no role.
- **Recommendation:** *unify EXACT reds* (`d32f2f`/`c62828` → `error.main`/`.dark`) — safe in every
  theme. For `#f44336`/`#e53935`: *keep or token* (`error.light` is `#ef5350`, a shift). `ComplianceDashboard`
  Status.Red `#f44336` pairs with the green/yellow status set — recommend unifying the whole status trio
  consistently (Green→success.light, Yellow→warning.light, Red→**error.light** accepting the shift, *or*
  keep all three as a self-contained status token set). Flag for Nathan.

### 🔵 Blues (+orange tail) — ~10 usages (`#0288d1` ×2, `#1976d2` ×2, `#1565c0` ×2, `#42a5f5` ×2, `#2196f3` ×2, `#f57c00` ×2)
- **Semantics:** "diamond balance / player colors / familiar word / recall / extending / dye swatch."
- **Theme value:** only `#0288d1`=info.main is EXACT (info default in family/london). `#1976d2`/`#1565c0`/
  `#42a5f5` are default-**primary** shades but primary is customized everywhere → NEAR-DUP. `#2196f3`
  (blue[500]) and `#f57c00` (orange[700]) have no role.
- **Recommendation:** *unify the two `#0288d1` diamond-balance usages → `info.main`* (color-neutral).
  *Keep everything else:* PLAYER_COLORS is an intentional fixed 4-color set (unifying would make two
  players match the brand and lose contrast) — **keep as a token array**, don't map to palette. Dye-swatch
  blues are a fixed paint palette — **keep**. `#2196f3` chart categories — keep or token.

### Cross-cutting note: print/export strings
`generateMaterials.ts`, `TeachHelperDialog.tsx`, `records.logic.ts`, `printBook.ts` build raw HTML/CSS
strings with **no React/theme context** — `theme.palette.*` is literally unavailable there. Any
"consistency" for these can only be a **shared TS token**, never a palette ref. Group them under a
`tokens.ts` export if unification is desired.

---

## Summary table — recommendation by group

| Group | In-scope usages | Class mix | Recommendation |
|---|---|---|---|
| Greens (home lane) | ~18 | mostly EXACT | **Unify** to `success.main/.light` (color-neutral) |
| Greens (`#388e3c`/`#66bb6a`) | ~9 | NO-EQ | Keep / `successHover` token |
| Greens (kid + avatar) | ~14 | EXACT* (mode-shifted) | Defer (Hero Hub) / keep |
| Oranges (home lane) | ~13 | EXACT | **Unify** to `warning.light/.dark` (cleanest group) |
| Oranges (avatar) | ~5 | EXACT* | Defer (Hero Hub) |
| Purples | ~18 | NEAR-DUP / NO-EQ | **Keep** (don't map to customized `secondary`) |
| Reds (`d32f2f`/`c62828`) | ~5 | EXACT (all themes) | **Unify** to `error.main/.dark` (safe everywhere) |
| Reds (`f44336`/`e53935`) | ~3 | NO-EQ | Keep / decide status-trio together |
| Blues (`#0288d1`) | 2 | EXACT | **Unify** to `info.main` |
| Blues/orange (player/dye/chart) | ~8 | NEAR-DUP / NO-EQ | **Keep** (intentional fixed sets) |
| Print/export strings | ~8 | n/a (no theme) | Token only if unifying |

**Bottom line:** the safe, color-neutral wins are the **home-lane greens, oranges, the two EXACT reds,
and the two `#0288d1` blues.** Purples and the player/dye/chart fixed sets should stay literal. Anything
on a kid/avatar surface is mode-shifted and belongs to the Hero Hub lane. Each approved group is a
separate confirm-gated swap run.
