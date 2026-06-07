# UI Consistency Audit (read-only inventory)

**Date:** 2026-06-07 · **Type:** Read-only audit — no code/style/theme changes in this run.
**Purpose:** Enumerate the visual rough edges (hardcoded colors, one-off styling, inconsistent
patterns) so they don't have to be named by hand. This is a categorized, prioritized inventory of
UI drift against the **current** theme (`src/app/theme.ts`). It audits drift against the existing
design — it does **not** propose a redesign.

The fixes are confirm-gated, batch-at-a-time follow-ups after Nathan reviews this inventory and
picks the order (see §Batches).

## Baseline (measured 2026-06-07)

| Metric | Value |
|---|---|
| Component files (`*.tsx` under `src/`) | 274 |
| Files carrying hardcoded hex colors (`*.tsx`/`*.ts`) | 105 |
| Files using inline `sx=` | 221 |
| Total `#7EFC20` (XP green) occurrences | 48 |
| Hardcoded `fontSize: '<n>rem'` in `sx` (features) | 338 |
| Hardcoded `fontWeight: <n>` in `sx` (features) | 306 |
| Theme-scale spacing tokens (`p:`/`m:`/`gap:` numeric, features) | 1,928 |
| Hardcoded `px` spacing in `sx` (features) | 53 |
| Files with inline `<CircularProgress>` loading (features) | 49 |
| Files using MUI `<Skeleton>` | 2 |
| Shared empty/loading/error component | **none exists** |

**Reading of the baseline:** color and typography are the real drift; **spacing is mostly fine**
(theme scale used ~36× more than hardcoded px) and is low priority. The single biggest "rough edge"
is the **absence of shared state components** (loading/empty/error) — every feature rolls its own.

## What the theme already gives us (`src/app/theme.ts`)

The theme is per-mode (`family` / `lincoln` / `london`) via `buildTheme(mode)`:
- **Palette** per mode. Lincoln (Minecraft) already names `success.main #7EFC20` (XP green),
  `info.main #5DECF5` (diamond cyan), `warning.main #FCDB5B` (gold). London (Mario) names
  `primary #E52521`, `secondary #FBD000`.
- **Shape** (border radius) per mode; **typography** (heading/body fonts + per-mode h1–h6 scale);
  **component overrides** for Button, Card, Paper, AppBar, Chip, Avatar, LinearProgress, Tab, Alert.

**Key gap:** the kid palette tokens exist *only inside* `theme.ts` and are referenced by **hardcoded
hex elsewhere** rather than via `theme.palette.*`. There is **no exported design-token module** (no
`src/app/tokens.ts`), so non-MUI surfaces (Three.js, gradients, SVG, canvas) have nowhere to import a
named color from and copy the hex instead.

---

## 1. Color drift (severity: HIGH)

Hardcoded hex instead of `theme.palette.*`. Grouped by intent as requested.

### Top recurring hex (counts across `src/**`)

| Hex | Count | Intent / group |
|---|---|---|
| `#7EFC20` | 48 | (a) kid — XP green (== `lincoln.success.main`) |
| `#4CAF50` | 32 | (b) MUI green duplicate (`success`) |
| `#FFFFFF` | 25 | (c) white — often legitimate, some tokenizable |
| `#FFD700` | 24 | (a) kid — gold (gold star / coin) |
| `#FCDB5B` | 21 | (a) kid — gold yellow (== `lincoln.warning.main`) |
| `#FF9800` | 16 | (b) MUI orange duplicate (`warning`) |
| `#5BFCEE` / `#5BFCEE`-family `#5DECF5` | 16 | (a) kid — diamond cyan (≈ `lincoln.info.main`) |
| `#9C27B0` | 11 | (b) MUI purple duplicate (`secondary`-ish) |
| `#E8F5E9` | 11 | (b) MUI green-50 tint duplicate |
| `#2E7D32` / `#388E3C` | 9 / 7 | (b) MUI green-dark duplicates |

### (a) Kid / Minecraft theme colors that *should become named tokens*

The greens/golds/cyans recur because **each quest/progress file re-declares its own local palette
constant**. This is the clearest tokenization win. Representative `file:line`:

- `src/features/quest/KnowledgeMinePage.tsx:32-34` — `{ gold: '#FCDB5B', green: '#7EFC20', diamond: '#5BFCEE' }`
- `src/features/quest/BuildSentenceQuestion.tsx:23-25` — same trio
- `src/features/quest/FluencyPractice.tsx:15-17` — same trio
- `src/features/quest/QuestSummary.tsx:14-16` — same trio
- `src/features/quest/ReadingQuest.tsx:22-24` — same trio
- `src/features/quest/BuildWordQuestion.tsx:18-20` — same trio
- `src/features/quest/QuestErrorBoundary.tsx:9` — `gold` only
- `src/features/quest/TappableText.tsx` — local color const
- `src/features/progress/PatternSummary.tsx:8-9`, `src/features/progress/WordWall.tsx:24`,
  `src/features/progress/WordDetail.tsx:83` — same kid trio
- `src/app/theme.ts:306` and `src/features/quest/QuestSummary.tsx:291` — **identical** XP-bar
  gradient `linear-gradient(180deg, #7EFC20 0%, #5BC010 50%, #3A8008 100%)` duplicated verbatim

**Recommend:** export a named token set (e.g. `src/app/tokens.ts`: `xpGreen`, `gold`, `diamondCyan`,
plus the `xpBarGradient` string) and have these files import it. These colors must stay available
**outside** MUI's `sx` (gradients, Three.js, SVG), so a token module — not just `theme.palette` — is
the right home. Then `theme.ts` references the same tokens so palette and raw usages can't drift.

### (b) Duplicates of MUI palette values → should just use the theme

These hexes are literally the default MUI palette and should be `theme.palette.success.main`, etc.,
or `color="success"` props. Representative `file:line`:

- `src/components/XpDiamondBar.tsx:71,104` — `#4CAF50` + `#2E7D32`/`#66BB6A` gradient (MUI greens)
- `src/app/AppShell.tsx:114,125` — `#FF9800` (MUI orange / `warning`)
- `src/features/records/ComplianceDashboard.tsx:41-42` — `#4caf50`, `#ff9800` mapped to status enum
- `src/features/records/MonthlyTrend.tsx:47,102` — `#4caf50` legend swatch + bar
- `src/features/progress/PatternSummary.tsx:89` — `#ff9800 → #e65100` gradient (MUI orange family)
- `src/features/planner/TeachHelperDialog.tsx:235`, `src/features/planner-chat/generateMaterials.ts:240`,
  `src/features/records/records.logic.ts:746` — `#4caf50` / `#e8f5e9` baked into **print/PDF HTML**
  templates (these are export-only; lower priority but still a duplicate of the palette)

### (c) True one-offs

Decorative/illustrative hexes used once (skin tones, voxel materials, location art). Mostly
legitimate art assets — leave unless they coincide with a token. Representative:

- `src/features/avatar/voxel/minecraftSkin.ts` (12 hex), `src/features/avatar/normalizeProfile.ts`
  (9 hex), `src/features/workshop/BoardSpace.tsx` (12 hex), `src/features/avatar/icons/ArmorIcons.tsx`
  (10 hex), `src/core/xp/armorTiers.ts` (12 hex — armor-tier colors, arguably a token set of their own)

**Severity: HIGH** — color is the most-cited drift and the kid-palette duplication (a) is both
high-volume and mechanical to fix.

---

## 2. Spacing drift (severity: LOW)

The codebase already overwhelmingly uses the MUI theme spacing scale: **1,928** numeric
`p:`/`m:`/`gap:` token uses vs only **53** hardcoded `px` strings in `sx` across features. Spacing is
**not** a meaningful source of drift.

Representative residual hardcoded spacing (cleanup, not urgent):
- A handful of `padding: '<n>px'` / `width: '<n>px'` literals in `sx` — scattered, no hotspot file.

**Recommend:** opportunistic only — convert stray `px` literals to the spacing scale when a file is
touched for another reason. Not worth a dedicated batch.

---

## 3. Typography drift (severity: MED-HIGH)

Heavy inline overrides of the theme type scale: **338** `fontSize: '<n>rem'` and **306**
`fontWeight: <n>` in `sx` across features. The theme defines h1–h6 per mode but body/caption sizing
is repeatedly hand-set, producing inconsistent text sizes for the same semantic role.

Representative `file:line`:
- `src/features/evaluation/QuickCheckPanel.tsx:193,202` — `fontSize: '0.75rem'`, `'0.65rem'`
- `src/features/evaluation/WorkingLevelsSection.tsx:205` — `fontSize: '1.5rem'`
- `src/features/records/ChapterResponsesTab.tsx:482` — `fontSize: '1.5rem'`
- `src/features/quest/KnowledgeMinePage.tsx:192,218,222` — `'0.4rem'`, `'2.5rem'`, `'0.8rem'`
  (Press-Start-2P pixel sizing — a legitimate kid-mode need, but it should be a named
  `pixelFont` typography variant, not per-call literals)

**Recommend:** (1) add a small set of `theme.typography` variants for the recurring roles
(e.g. a `caption`-small and the Minecraft pixel scale) and use `variant=` instead of inline
`fontSize`; (2) the kid pixel-font sizes are the densest cluster and the best candidate for a named
variant. **Severity MED-HIGH** — high volume, but lower blast-radius per change than color.

---

## 4. Component-pattern inconsistency (severity: MED)

Multiple one-off implementations of the same UI primitive.

- **Loading buttons** — the `startIcon={busy ? <CircularProgress size={N}/> : <Icon/>}` pattern is
  re-implemented in many files with differing `size` values (14/16/20/24): e.g.
  `src/features/planner-chat/PlannerSetupWizard.tsx:223`, `ChapterBookPicker.tsx:149,312`,
  `PhotoLabelForm.tsx:267`, `PlannerCompactSetup.tsx:176,187`,
  `src/features/progress/CertificateScanSection.tsx:201,301`,
  `src/features/planner/TeachHelperDialog.tsx:390`. → a shared `<BusyButton>` (or a `loading` prop
  wrapper) would consolidate.
- **Dialogs** — 48 `<Dialog>` usages across features, each wiring its own title/actions/spacing.
  No shared `<ConfirmDialog>` / `<FormDialog>` shell. Candidate for a thin shared wrapper for the
  common confirm/cancel shape.
- **Cards** — `SectionCard.tsx` exists as a shared card shell but many feature pages still build
  bare `<Card>`/`<Paper>` with bespoke padding/headers (see the `sx` hotspots in §6). Worth a sweep
  to route section headers through `SectionCard`.
- **Local palette constants** — the duplicated `{ gold, green, diamond }` const (§1a) is also a
  component-pattern smell: the same constant copy-pasted into 10 files.

**Recommend:** introduce `<BusyButton>` and a `<ConfirmDialog>` shell; extend `SectionCard` adoption.
**Severity MED** — real consolidation, but each is a contained, low-risk component.

---

## 5. State-pattern inconsistency — empty / loading / error (severity: HIGH)

**This is the biggest source of rough edges.** There is **no shared empty/loading/error component**
(`src/components/` has `Page`, `SectionCard`, `ErrorBoundary`, `SectionErrorBoundary` — but nothing
for the in-flight/empty/failed *data* states). Each feature improvises:

- **Loading:** inline `<CircularProgress>` in **49 feature files**, sizes/placement ad-hoc; only
  **2 files** use MUI `<Skeleton>`. Some show `'Loading...'` text (8 occurrences), some a spinner,
  some nothing. e.g. `src/features/evaluate/EvaluateChatPage.tsx:809`,
  `src/features/quest/ReadingQuest.tsx:59`, `src/features/planner-chat/PlannerChatPage.tsx:2328,2608`.
- **Empty:** ad-hoc `<Typography color="text.secondary">No …</Typography>` with per-file copy. e.g.
  `src/features/evaluation/SkillSnapshotPage.tsx:361,442,480,523` (four different "No …" lines),
  `src/features/progress/ArmorTab.tsx:578`, `src/features/workshop/AdventurePlaytestView.tsx:182`.
- **Error:** mix of `Alert severity="error"` (22 files) and `Typography color="error"` (29 files);
  no consistent retry affordance or layout.

Across the feature pages called out in the run (Today, Progress, Records, Books, Curriculum, Hero
Hub) the same three states are each handled differently per page.

**Recommend:** add `<LoadingState>` (spinner/skeleton), `<EmptyState>` (icon + message + optional
action), and `<ErrorState>` (message + retry) in `src/components/`, then migrate feature pages onto
them. **Severity HIGH** — biggest perceived-polish win, and it standardizes behavior, not just looks.

---

## 6. Inline-`sx` hotspots (severity: MED)

Files where heavy inline styling could be themed or extracted. Top offenders by `sx=` count:

| File | `sx=` count |
|---|---|
| `src/features/books/BookEditorPage.tsx` | 102 |
| `src/features/today/TodayChecklist.tsx` | 63 |
| `src/features/quest/ReadingQuest.tsx` | 57 |
| `src/features/shelly-chat/ShellyChatPage.tsx` | 54 |
| `src/features/dad-lab/DadLabPage.tsx` | 45 |
| `src/features/books/BookshelfPage.tsx` | 45 |
| `src/features/today/KidTodayView.tsx` | 40 |
| `src/features/books/BookReaderPage.tsx` | 38 |
| `src/features/today/KidChecklist.tsx` | 37 |
| `src/features/quest/QuestSummary.tsx` | 37 |

Files with most hardcoded hex (color + sx overlap): `MyAvatarPage.tsx` (21), `OutfitCustomizer.tsx`
(19), `ArmorDyePanel.tsx` (15), `KidChapterPool.tsx` (14), `ProfileSelectPage.tsx` (14),
`TodayChecklist.tsx` (13).

**Recommend:** treat the inline-`sx` reduction as a *consequence* of Batches 1–4 (tokenizing colors
+ extracting state/components naturally removes large `sx` blocks) rather than a standalone refactor.
Several of these files are already on the §"Known Technical Debt" large-file list — don't open a
pure-styling refactor on them in isolation; fold styling cleanup into their existing decomposition
work. **Severity MED.**

---

## Recommended fix-batches (propose only — no code in this run)

Each batch is a coherent, reviewable unit. **Do not fix here** — these are confirm-gated, one-at-a-
time follow-ups after Nathan picks the order. Theme/token changes touch shared UI broadly, so each
should ship as its own PR with a screenshot pass per mode (family/lincoln/london).

### Batch 1 — Tokenize the recurring kid palette (HIGH, do first)
- **Scope:** create `src/app/tokens.ts` exporting `xpGreen (#7EFC20)`, `gold (#FCDB5B)`,
  `diamondCyan (#5BFCEE/#5DECF5)`, `goldStar (#FFD700)`, and the shared `xpBarGradient` string;
  point `theme.ts` palette at the tokens; replace the ~10 duplicated local `{ gold, green, diamond }`
  consts and the 48 `#7EFC20` usages with imports.
- **Files:** `src/app/tokens.ts` (new), `src/app/theme.ts`, the quest cluster
  (`KnowledgeMinePage`, `ReadingQuest`, `QuestSummary`, `BuildWordQuestion`, `BuildSentenceQuestion`,
  `FluencyPractice`, `QuestErrorBoundary`, `TappableText`), `progress/{PatternSummary,WordWall,WordDetail}`.
- **Risk:** LOW-MED — mechanical, but it's the kid-facing surface; verify XP-bar gradient renders
  identically (it's duplicated, so unify carefully). One color family at a time keeps diffs reviewable.

### Batch 2 — Swap MUI-duplicate hexes for theme references (MED)
- **Scope:** replace `#4CAF50`/`#FF9800`/`#9C27B0`/`#E8F5E9`/green-darks with `theme.palette.*` or
  semantic `color=`/`severity=` props. Leave the print/PDF HTML templates' hexes for last (they're
  export-only, outside MUI).
- **Files:** `components/XpDiamondBar.tsx`, `app/AppShell.tsx`, `records/{ComplianceDashboard,
  MonthlyTrend}.tsx`, `progress/PatternSummary.tsx`; (deferred) the print templates in
  `TeachHelperDialog.tsx`, `generateMaterials.ts`, `records.logic.ts`.
- **Risk:** LOW — palette values are identical, so no visual change expected.

### Batch 3 — Unify empty/loading/error states behind shared components (HIGH)
- **Scope:** add `<LoadingState>`, `<EmptyState>`, `<ErrorState>` to `src/components/`; migrate the
  high-traffic feature pages (Today, Progress, Records, Books, Curriculum, Hero Hub) onto them.
- **Files:** new components in `src/components/`; consumers across `features/{today,progress,records,
  books,quest,evaluation,avatar}`.
- **Risk:** MED — touches many pages; migrate page-by-page, not big-bang. Biggest polish payoff.

### Batch 4 — Consolidate one-off button/card/dialog variants (MED)
- **Scope:** `<BusyButton>` (replaces the `startIcon={busy ? <CircularProgress/> : …}` pattern),
  a `<ConfirmDialog>` shell, and broader `SectionCard` adoption.
- **Files:** new shared components; consumers in the planner-chat / progress / planner clusters and
  the 48 `<Dialog>` sites (migrate the simple confirm dialogs first).
- **Risk:** MED — behavior-preserving wrappers; verify spinner sizes and focus/keyboard behavior.

### Batch 5 (optional / opportunistic) — Typography variants + stray spacing
- **Scope:** add `theme.typography` variants for the recurring caption-small role and the Minecraft
  pixel scale; convert the densest inline `fontSize`/`fontWeight` clusters and the ~53 stray `px`
  spacing literals when their files are touched anyway.
- **Risk:** LOW per change, but high count — fold into other work rather than a dedicated sweep.

**Suggested order:** 1 → 2 → 3 → 4 → 5. Batches 1–2 are mechanical and low-risk (good warm-up,
immediate consistency win); Batch 3 is the highest perceived-polish payoff; Batch 4 reduces future
drift; Batch 5 is ongoing hygiene.

## Out of scope (this audit)
- Any code/style/theme change — read-only.
- A fresh visual redesign — this catalogs drift against the *current* design only.
</content>
</invoke>
