# Handoff: Principles Foundry — Mobile & Tablet Redesign

## Overview

This is a high-fidelity design pass for the **first-principles-engine** homeschool app, covering both Shelly's parent mode and Lincoln's hero (kid) mode, in mobile and tablet layouts.

The design's goals:

1. Make Shelly's day calmer — clear "Today" view, kid columns side-by-side on tablet, behavior log that uses **no-judge** language ("noticed / flow / stuck / joy", never "missed" or "behind").
2. Make Lincoln's hero world more atmospheric — bigger pixel scenes, a Stonebridge metaknarrative, ore-block tasks for Knowledge Mine, Faith Stats (Strength / Wisdom / Mercy / Courage).
3. Make state-required portfolio collection nearly invisible — auto-collect from every screen, surface a State Checklist sidebar, one-tap PDF export.
4. Close the loop between parent insight and kid action — Shelly AI builds a gentle test → Lincoln sees it as a quest on Today → result returns to Shelly with a pattern.

## About the design files

The files in this bundle are **design references created in HTML/React** — prototypes that demonstrate the intended look and behavior, **not production code to copy directly**.

Your task is to **recreate these designs inside the existing `first-principles-engine` codebase** (React + TypeScript + MUI + React Router) using its established patterns:

- Use the existing `buildTheme(mode)` in `app/theme.ts` — **do not rewrite the theme**. The mocks were intentionally built against the exact tokens already in `theme.ts` (the `lincoln` Minecraft palette, the `family` parent palette, Press Start 2P, Space Mono, Inter).
- Use the existing `<AppShell>` for sidebar/drawer layout. The tablet mocks assume the sidebar is visible at ≥900px (which it already is).
- Use existing routes (`/today`, `/planner/chat`, `/records`, `/avatar`, `/quest`, `/chat`). No new routes are needed for the redesign.
- Use MUI components and the existing component overrides — they already produce the pixel-shadow buttons, blocky chips, XP-bar styling for `lincoln` mode.

The HTML mocks recreate this MUI behavior with raw CSS for portability. **Prefer MUI primitives over reproducing the inline styles.**

## Fidelity

**High-fidelity.** Colors, typography, spacing, copy, and layout decisions in the mocks should be matched faithfully. Exceptions:

- SVG icons in `ui-kit.jsx` are Lucide-style outline icons — substitute with `@mui/icons-material` equivalents where convenient.
- The pixel "hero" sprite in `lincoln-screens.jsx` (PixelHero) is a placeholder block-figure. The real app already has a configurable avatar (`AvatarThumbnail` from `features/avatar/`). Keep using that — the design just shows it bigger and on themed backdrops.
- Armor item SVGs (BeltSVG, BreastSVG, etc.) are simplified — the app may already have proper pixel-art versions; prefer those.

## Screens / Views

There are **10 mobile screens** (390×844) and **6 tablet screens** (1180×820 landscape). Each is registered as a `<DCArtboard>` in `app.jsx`. The two columns below list mobile and tablet variants of the same logical surface.

---

### 1. Today (Shelly)

**Route:** `/today` · **File:** `features/today/TodayPage.tsx` (already exists)

**Purpose:** Shelly checks the day's plan, marks blocks done as the day unfolds, logs energy, sees this-week progress at a glance. Auto-saves a Daily Log.

**Mobile layout**

- Top: small date eyebrow ("TUE · MAY 26"), `<h1>Today</h1>` (28px / 700 / -0.4 letter-spacing).
- Kids selector row: pills for Lincoln (active = filled indigo) and London, plus a dashed-border `+ Add` chip.
- Green soft banner: "Daily Log saved · 2:24 PM" with a green ✓ circle. `theme.palette.success.main`.
- Energy segmented control: Normal / Low / Overwhelmed — three-up grid, active is filled indigo on indigo-soft background.
- Three subject sections (Language Arts / Reading / Math & Other), each a white card with:
  - A colored left bar (4×16 rounded) in the section's accent color (indigo / violet / amber).
  - Title + "N blocks" + "0/N" counter on the right.
  - List of Block rows: 22px rounded checkbox (green when done), label (line-through + ink3 when done), small meta line ("15 min · app").
- "This week" card at the bottom: title + "0 / 12.6 hrs" total + a 5-day mini bar chart (Mon–Fri). Today is highlighted with an indigo outline.
- Bottom: 5-tab `<ParentTabBar>` (Today / Plan / Log / Records / Shelly AI), pinned, blurred translucent background.

**Tablet layout**

- Left sidebar (220px) from `<AppShell>` — visible at ≥900px.
- Top bar in main area: date + "Daily Log saved" pill + "+ Add note" outlined button.
- Week strip: 5-column grid, each cell shows day name, hours value (e.g. "2.4h"), and "N/N blocks". Today gets the indigo border.
- **Two kid columns side-by-side**: Lincoln + London each as their own card with avatar header (color-tinted), counter chip ("1 / 7 done"), and the block list flat inside.
- Bottom: Shelly insight card (indigo gradient) with copy + "Build it" / "Not yet" buttons.

**Components & tokens**

- Card: `border-radius: 16` (mobile) / `12` (tablet table cells); `1px solid rgba(20,22,30,0.08)`; `background: #fff`.
- Section accent bar: 4×16, `border-radius: 2`, color = subject accent.
- Block checkbox: 22×22 (mobile) / 20×20 (tablet); `border-radius: 6`; `1.5px solid` either `success.main` (done) or border color.
- Subject accent colors (parent mode): Language Arts = `palette.primary.main` (`#5c6bc0`), Reading = `palette.secondary.main` (`#7e57c2`), Math/Other = warm amber `#b45309`, Science = green `#1f9d55`.
- Day bar: `height: 56px`, `border-radius: 8`, filled from bottom with primary color.

**Copy**

- "Daily Log saved · 2:24 PM" / "Auto"
- "How's Lincoln's energy?" / "Normal" / "Low" / "Overwhelmed"
- "This week" / "0 / 12.6 hrs"
- Shelly tablet insight: "Lincoln hit flow on Reading Eggs again today — 3 weeks running. Want a 5-minute long-A check tomorrow?"

---

### 2. Plan My Week (Shelly)

**Route:** `/planner/chat` · **File:** `features/planner-chat/PlannerChatPage.tsx`

**Purpose:** Review/adjust the auto-generated weekly plan. Coverage view + free-form chat with Shelly AI to tweak.

**Mobile layout**

- Eyebrow: "This week · Week 22", `<h1>Plan My Week</h1>`, subtitle "Set up your week, review, you're done."
- Kid pills row.
- "Lincoln's plan" card: section bar + "3.1h/day" pill + summary chips ("Reading Eggs 15m", "Math app / Typing 15m", "Read-aloud nightly").
- COVERAGE list: 4 rows (Language Arts / Reading / Math / Other), each row = small color square + name + blocks-count on the right.
- Green "Plan applied · Lincoln's week is ready" banner with "Open Today" CTA.
- Read-aloud book card: 56×76 book-spine thumbnail (linear-gradient brown) + title + chapter progress + progress bar.
- "Adjust" section: list of one-tap suggestion buttons ("More phonics, less math this week", "Light week — 2h/day cap", "Free-form: tell Shelly anything").

**Tablet layout — split view**

- Left pane (1.1fr): the plan view (banner, coverage card, read-aloud).
- Right pane (0.9fr): full chat panel.
  - Header: "Plan with Shelly" + "Free-form · she'll do the math" subtitle, sparkles avatar.
  - Bubbles (`<Bubble dir="bot|me">`): bot = `#fff` with bottom-left flat corner, user = primary indigo with bottom-right flat corner. Max-width ~78% for user.
  - Composer pinned at bottom: pill input + mic icon + send circle.

**Bubble interaction notes**

- Bot bubbles can contain inline preview blocks (greyish nested card with `palette.background.default` background, 10px padding, border) for showing what action will apply.
- `<Mini>` action chips appear below relevant bot replies — primary filled or ghost variants.

**Copy samples** (chat thread)

> Shelly: Lincoln's plan looks balanced. Anything to tweak?
> You: Light Wednesday — we have a doctor's appt at 10.
> Shelly: Capped Wed at 1.5h. Moved math & typing to Thursday. Read-aloud still on for the evening.
> You: Perfect. And add a Dad Lab on Friday?
> Shelly: Done. Picked **The Water Filter Challenge** from Dad Lab. Materials list went to your Notes.

---

### 3. Behavior Log (Shelly)

**Route:** new path under `/today` or `/records` — pick the natural home in your IA. Suggested: `/today/log` or merge into `/records/log`.

**Purpose:** Time-stamped narrative log of what Shelly noticed today. Replaces "What counts as done?" cards with a richer journaling surface. Critical for emotional tone of the app.

**Mobile layout**

- Eyebrow + title "What I noticed" + tagline **"No judge zone — just what's true today."**
- "How was he?" mood chip row — multi-select: Focused / Curious / Restless / Overwhelmed / Playful / Tender. Selected chips are filled indigo.
- Timeline of notes — each note card has:
  - Left rail (64px): timestamp + a colored category tag chip ("noticed" / "flow" / "stuck" / "joy"). Tag colors:
    - noticed = indigo `#5c6bc0`
    - flow = green `#1f9d55`
    - stuck = amber `#b45309` (warm, never red)
    - joy = violet `#7e57c2`
  - Right: note text (13.5px, line-height 1.5, `text-wrap: pretty`).
- Add-note card: dashed border, "Add a note…", quick-tag chips, Voice button on the right.
- Bottom: Shelly insight card (indigo/violet gradient) with sparkles icon, "Shelly noticed" eyebrow, and an action prompt ("Want me to weight Reading Eggs earlier next week?") with Yes/Not-yet buttons.

**Critical copy guardrails**

- Never use the words: "missed", "behind", "failed", "couldn't".
- Always use: "noticed", "flow", "stuck", "tried", "took a break", "came back".
- The amber "stuck" tag is for context — pair it with what came next (e.g. "We took a movement break, came back, finished 4 of 6.").

---

### 4. Records (Shelly)

**Route:** `/records` and `/records/portfolio` · **Files:** `features/records/RecordsPage.tsx`, `PortfolioPage.tsx`

**Purpose:** State-ready evidence collection. Auto-collects from every other screen. One-tap quarterly PDF export.

**Mobile layout**

- Eyebrow "Portfolio · Q4 2025-26" + title "Records" + subtitle "Everything the state needs, gathered as you go."
- Three top tabs: Portfolio (active, filled black pill) / Attendance / Evaluations.
- 3-up metrics: 247 work samples / 182 hours logged / 3 of 3 quarterly evals — each metric in its accent color (indigo / violet / green).
- Filter row: "All subjects" (active) / "This quarter" / right-aligned **"⬇ Export PDF"** in solid black.
- Artifact list — each row:
  - 44×44 subject tag tile (colored, 11px bold 3-letter code: "SCI", "LAN", "MAT", "REA").
  - Title + meta line ("May 26 · photo + reflection · 3 pages [AUTO]").
  - Right chevron.
- AUTO chip (green soft bg, green text, 1px 5px padding) marks anything auto-collected — these don't need Shelly to confirm.

**Tablet layout — table + sidebar**

- Main left: full table (cols: Date / Subject / Sample / Type / Child / Size / →).
- Right sidebar (280px):
  - **State checklist** for the user's state (default: NY) — Quarterly report Q4, Attendance log (180d) (with progress bar at 92%), Subject coverage, Annual evaluation (40%).
  - **Quarterly export card** — indigo→violet gradient, "Bundle everything Q4 in one PDF", white "⬇ Export PDF" button.
  - Disclaimer: "We auto-pull from Today logs, app sessions (Reading Eggs, Typing Club), and Dad Lab photos. You only confirm."

**Data model implications**

- Every Today block completion should write a `WorkSample` with: date, kid_id, subject, source (manual / app-session / photo / voice), pages_or_duration, source_artifact_ref.
- App integrations (Reading Eggs, Typing Club) should auto-create `WorkSample` rows when sessions complete, tagged `aut: true`.
- Dad Lab activity photos should auto-attach with date + the lab title.
- The export job should bundle the quarter's `WorkSample`s into a single PDF (cover page + per-subject sections + attendance hours table).

---

### 5. Shelly AI (Parent chat)

**Route:** `/chat` · **File:** `features/shelly-chat/ShellyChatPage.tsx`

**Purpose:** Conversational copilot. Shelly tells it natural-language directives ("Light Wednesday", "Build a long-A test") and it acts.

**Mobile layout**

- Header: 36px gradient circle (indigo→violet) + sparkles icon, "Your homeschool co-pilot" eyebrow, "Shelly AI" title.
- Chat thread: bot bubbles, user bubbles, **insight bubbles** (indigo/violet gradient background, "Pattern · last 14 days" eyebrow).
- Bot bubbles can include:
  - Action chips: "Build the test" (filled primary), "Not today" (ghost).
  - Preview blocks showing what will be created (e.g. a test question preview with the 4 word options rendered as 4 small white tiles).
- Composer pinned just above the tab bar: pill input + mic + send circle.

**Key action: "Build a test"**

When Shelly accepts, the AI should:
1. Create a `Quest` record on Lincoln's account targeting the agreed skill (e.g. long-A pattern).
2. Generate 8 audio-first multiple-choice questions, each with 2 re-tries allowed.
3. Schedule it to appear on Lincoln's `/today` as **"Long-A check"** the next morning.
4. Optionally alert Shelly when complete (this is the explicit follow-up chip).

---

### 6. Hero Hub (Lincoln)

**Route:** `/avatar` · **File:** `features/avatar/MyAvatarPage.tsx`

**Purpose:** Lincoln's home page. He sees his hero, today's mission, the Stonebridge quest progress, XP, and where to go next.

**Mobile layout**

- Background: `#0f1614` with a faint 16×16 green grid (the existing `lincoln` mode body bg pattern already in `theme.ts`).
- Top: pixel-box "HERO HUB" / "LINCOLN" header (Press Start 2P, 11px, green).
- **Today's Mission card** — cyan border, glow shadow:
  - Eyebrow "⚡ TODAY'S MISSION" (gold, Press Start 2P, 9px).
  - Body in Space Mono, 14px, gold: "Your armor rests beside you. Time to put it on again."
  - Full-width cyan glow button: "SUIT UP & BEGIN →".
- **Stonebridge banner** — secondary pixel-box (bg3 slightly raised). "🏰 STONEBRIDGE · WEEK 1" header, body "Banner Rally missions coming soon — your reading will help repair Stonebridge.", thin 6px progress bar (18% filled green).
- Mode chips row: "🧑‍🤝‍🧑 BROTHERS" / "🌙 NIGHT" — Press Start 2P pixel-shadow buttons.
- **Avatar scene** (220px tall on mobile, 460px on tablet):
  - Night-sky gradient `#1a1d3a → #050818`, 7+ white pixel stars, gold moon top-right with cyan glow ring.
  - Ground band at bottom: `#2a2d4a → #1a1d34` with a borderHi top.
  - Hero sprite centered on a stone pedestal.
  - Top-left badge: "IRON ⚔ LV 27", cyan border, black 60% bg.
- Emote bar: 6 chips — VICTORY / SHIELD / PRAYER / WAVE / BATTLE / DAB (the existing emotes in your code; keep them).
- XP bar block: level + XP/total + tier on a single line, then 14px-tall pixel XP bar (green gradient, dark border, inner shadow), then "+ N XP to STEEL" / "◆ Gold" footer.
- "NEXT ACTION" dashed divider + full-width green glow "⚔ SUIT UP" button + "0/2 equipped today · 2/6 forged" meta line.
- "WHERE TO NEXT?" dashed divider + 3-up grid: MINE / WORKSHOP / BOOKS — each is a pixel-box card with a big emoji icon and a Press Start 2P label colored to the accent (green / cyan / gold).
- Bottom: 5-tab pixel nav (TODAY / MINE / HERO / BOOKS / STUFF), Press Start 2P, with active item glowing green.

**Tablet layout**

- Sidebar (220px) — pixel-styled (rgba(8,12,10,0.6) bg, green active-item left border).
- Main: top status bar (HERO HUB · STONEBRIDGE | XP | GOLD | TIER).
- Two-column body:
  - Left (1.3fr): big 460px avatar scene + bottom emote bar (6 dark squares with emoji glyphs).
  - Right (1fr): Today's Mission, Stonebridge banner, XP bar, 3-up next-action grid.

**Pixel-box style** (use as a primitive — already implementable as an MUI `<Box sx>` or styled component):

```css
background: #152221;
border: 2px solid #284035;
box-shadow: 4px 4px 0 0 rgba(0,0,0,0.45);
border-radius: 0;
```

For glowing cards (mission, AI quest), add an outer halo shadow:

```css
border: 2px solid #5DECF5; /* or the accent color */
box-shadow: 0 0 0 2px rgba(93,236,245,0.13), 4px 4px 0 rgba(0,0,0,0.5);
```

---

### 7. Daily Mission (Lincoln)

**Route:** `/today` (Lincoln's variant) · **File:** `features/today/TodayPage.tsx` (use mode-based rendering, or split into a `LincolnTodayView` subcomponent).

**Purpose:** Lincoln's gamified Today checklist. Every block earns XP. Energy honesty cue at the bottom shifts the workload.

**Mobile layout**

- DAILY MISSION header.
- Horizontal date scroller — 5 boxes (MON 25 / TUE 26 / WED 27 / THU 28 / FRI 29). Today has a green border + halo.
- **Objective card** — gold border + gold halo. Eyebrow "⚡ OBJECTIVE", body "Mine 4 blocks today. Suit up at least 2 pieces. Read one chapter."
- Checklist: 7 row cards. Each row:
  - 22×22 checkbox (green-bordered green-fill when on).
  - Icon (🛡 / ⛏ / ▤) + label.
  - Right: `+5xp` / `+25xp` etc. in Press Start 2P 8px.
  - Done rows have green border + slightly tinted bg (`#1a2a18`).
- "HOW ARE YOU?" 3-up energy grid:
  - 💪 READY (green) / 🐢 SLOW (gold) / 😴 TIRED (ink2). Selected gets accent border + halo.
- Footer line: **"On slow days, smaller blocks. No judge. Just grow."**

**Important behavior**

- Selecting "SLOW" or "TIRED" should re-rank the day's quest list — heavier subjects auto-fold to "tomorrow", smaller blocks float to top. Make this a soft, visible shift, not a destructive change.

---

### 8. Knowledge Mine (Lincoln)

**Route:** `/quest` · **File:** `features/quest/KnowledgeMinePage.tsx`

**Purpose:** Today's learning sessions presented as ore deposits in a mine. Quests are "blocks" to mine. Tests are special "new quests" with cyan halo.

**Mobile layout**

- KNOWLEDGE MINE / DAY 28 header.
- **Depth meter card**: title + LEVEL N. 16 small 18px-tall blocks in a row — first 11 are green with inset shadow (mined), block 12 is gold (today's progress), rest are black (unmined). Footer: "Mine 4 more blocks to break through to STEEL."
- "TODAY'S VEIN" dashed gold divider.
- Quest list — each quest is an **ore block + content row**:
  - Left: 48×48 colored block with inset shadow (top highlight + bottom shadow), a subtle inner accent square, and a black-overlay ✓ when done.
  - Right: subject label (Press Start 2P 7px, accent color), task text (Space Mono 12px), meta ("20 min · +25 XP" or "✓ Mined · +25 XP").
  - Ore colors: EMERALD (Language Arts, green), DIAMOND (Reading, cyan), AMETHYST (Math, purple `#b388ff`), GOLD (Science, gold).
- **AI Check card** — cyan border + halo:
  - "⚡ NEW QUEST" eyebrow.
  - Description: "Shelly built you a 5-minute check. 8 words. You can re-try twice."
  - Inner preview block (`#0a0a0a` bg, dark border): "QUESTION 1 OF 8" / "🔊 'Tap the word that says the long-A sound.'" / 2×2 word tile grid.
  - Cyan glow button: "BEGIN CHECK · +60 XP".

**Tablet layout**

- Sidebar + top bar.
- Full-width depth meter (28 blocks instead of 16 — represents the full week).
- Two-column body:
  - Left (1.2fr): 2×2 ore-block grid (the 4 today's quests).
  - Right (0.8fr): AI Check card + a "STREAK · 5 DAYS" panel showing 7 day-pips, 5 filled green.

---

### 9. Armor Forge (Lincoln)

**Route:** `/avatar` (sub-view) or could be its own page · **File:** `features/avatar/MyAvatarPage.tsx`

**Purpose:** Equip and upgrade armor pieces. Tiered progression: Wood → Stone → Iron → Steel → Diamond. Maps to the Armor of God: Belt of Truth, Breastplate, Shoes of Peace, Shield of Faith, Helmet, Sword.

**Mobile layout**

- ARMOR FORGE / "2/6 IRON" header.
- 140px mini avatar pedestal (smaller version of Hub scene), with XP and Gold counters in corners.
- Tier toggle row: 4 pixel-buttons (WOOD ✓ / STONE ✓ / IRON ◆ active / STEEL 🔒). Active has green border + halo + bg tint.
- Gold warning banner: gold border, dark `#221c08` background, body text centered. The same "Your armor rests beside you." rest message.
- "FORGE QUEUE" divider.
- 2×3 armor grid — each card is a pixel-box (88px tall) with:
  - 56px square inset with a `#0a1010` bg and a 2px border holding the armor pixel-art glyph.
  - Press Start 2P label (8px) for the piece name.
  - "Current: Stone" meta in Space Mono 9px.
  - Bottom action chip — green border for `EQUIP` (new pieces), gold border for `◆35 UPGRADE`.
  - A `!` badge in the top-right corner for pieces with newly available actions (18×18 gold square with a 2px outer border matching the bg).
- "FAITH STAT" divider + stats card:
  - 4 rows: STRENGTH (green) / WISDOM (cyan) / MERCY (rose `#FF6B6B`) / COURAGE (gold).
  - Each row is a Press Start 2P label + value + 6px progress bar (filled to value × 3% — i.e. value of 31 = 93% wide).

**Tablet layout**

- Sidebar + top bar.
- 5-button tier row (adds DIAMOND locked).
- Two-column body:
  - Left (0.9fr): 280px avatar pedestal + Faith Stats card.
  - Right (1.1fr): warning banner + 2×3 armor grid (larger 80px tiles, 1.6× scaled SVGs).

---

### 10. Quest Complete (Lincoln)

**Route:** Modal/page reached on quest completion from `/quest`.

**Purpose:** Celebrate effort + mastery separately. Always include a personal mom-note. Frame misses as "what to mine next."

**Mobile layout**

- "QUEST COMPLETE" / "LONG-A · 7/8" header.
- Victory scene (200px): green border + halo, dark gradient bg, 8 radial light rays from the center in gold, hero sprite centered, "★ VICTORY ★" in gold Press Start 2P with text-shadow glow.
- Reward stack (3 rows):
  - **XP EARNED** + 60 (green, ◆ icon).
  - **GOLD** + 3 (gold, ◆ icon).
  - **MASTERY** Long-A · 87% (cyan, ✓ icon).
  - Each row icon is a 40px colored square with chiseled inset shadows.
- **Note from Mom card** — slightly raised pixel-box:
  - "📜 NOTE FROM MOM" eyebrow in cyan.
  - Quoted note in Space Mono 12px. Example: *"You only missed 'snail'. Big deal — you got 'rake' right after the squirrel distraction. I'm proud of you. — Mom"*
- "WHAT TO MINE NEXT" divider — a single missed-word card:
  - 36px gold square with a `?` glyph.
  - Word label in Press Start 2P 8px gold.
  - Body: *"The 'ai' likes to hide. We'll catch it tomorrow."*
- Two stacked buttons: green glow "⛏ KEEP MINING" / ghost "🏠 BACK TO HUB".

**Critical interaction**

- The mom-note must be **manually written by Shelly** in her parallel "Shelly noticed" insight. Never auto-generated. If she hasn't written one yet, surface a softer fallback like "Mom will see this tonight." — never a generic AI praise blurb.

---

## Interactions & Behavior

- **Mode switching**: the `useProfile().themeMode` already controls `lincoln` vs `family` vs `london`. The redesign respects this — no new mode switching needed.
- **Kid switching** (within parent mode): `useActiveChild()` already in place. Sidebar and Today should react instantly. The Today tablet layout shows both kids simultaneously — when `activeChild` is set, that column gets a subtle highlight, but both remain visible.
- **Auto-save Daily Log**: existing behavior. The "Daily Log saved · 2:24 PM" pill should update whenever the underlying save fires.
- **Energy chip**: persists to the DayLog record. Selecting "SLOW" on Lincoln's Daily Mission should trigger a soft re-rank of the block list (smaller blocks first).
- **Armor halo glow animation** (optional): the `glow` variant of `<PxButton>` could gain a 2s ease-in-out pulse on the box-shadow to draw attention. Keep subtle.
- **Quest Complete entrance**: stars/rays appear on mount with a stagger; hero sprite scales in from 0.6→1.0 in 400ms ease-out-back; rewards stack in one at a time with a 120ms stagger.
- **Records auto-collection**: every block tick on Today writes a `WorkSample`. Photos taken in Dad Lab (already exists as a feature) auto-tag the day. App integrations write attendance hours. No new user action required.

## State management

Existing hooks should cover this. Confirm/add:

- `useDayLog(kidId, date)` — read/write the day log.
- `useWeekPlan(kidId, weekStart)` — coverage + applied state.
- `useAvatarProfile(familyId, kidId)` — already exists; ensure `equippedPieces`, `forgedPieces`, `tier`, `xp`, `gold`, `faithStats` (new) are on the profile.
- `useWorkSamples(kidId, range)` — for the Records views.
- `useQuests(kidId, date)` — list today's Knowledge Mine quests.
- `useShellyChat()` — chat thread with build-quest action effects.

The Faith Stats (Strength / Wisdom / Mercy / Courage) are a new concept — they should be derived rather than manually set:

- Strength = % of "stuck" entries with a "came back" follow-up.
- Wisdom = mastery average across subjects.
- Mercy = times Lincoln chose the gentler retry path or helped London.
- Courage = streak of suit-up days × tier multiplier.

Decide on derivation formulas with Shelly; the mocks just show the visual bars.

## Design tokens

The existing `app/theme.ts` already defines:

- Per-mode palettes (family / lincoln / london)
- Per-mode shape, typography, background patterns
- Per-mode component overrides (MuiButton, MuiCard, MuiPaper, MuiAppBar, MuiChip, MuiAvatar, MuiLinearProgress, MuiTab, MuiAlert)

**Do not redefine these.** The mocks were authored against:

| Token | Value | Mode |
|---|---|---|
| `palette.primary.main` | `#5c6bc0` | family |
| `palette.secondary.main` | `#7e57c2` | family |
| `palette.background.default` | `#f5f5f7` | family |
| `palette.primary.main` | `#5A8C32` | lincoln |
| `palette.success.main` | `#7EFC20` | lincoln (XP green) |
| `palette.info.main` | `#5DECF5` | lincoln (diamond cyan) |
| `palette.warning.main` | `#FCDB5B` | lincoln (gold) |
| `shape.borderRadius` | `0` | lincoln |
| `shape.borderRadius` | `12` | family |
| Heading font | Press Start 2P | lincoln |
| Body font | Space Mono | lincoln |
| Heading + body | Inter | family |

**Additional values used in mocks** (add as theme extensions if you need them in TS):

- Parent ink: `#1c1d22` / `#5e616c` / `#9094a0`
- Parent line: `rgba(20,22,30,0.08)`
- Parent indigo-soft fill: `#eef0fa`
- Parent amber: `#b45309` (warm, never red)
- Parent rose (use sparingly): `#be3a47`
- Lincoln bg2 (panel): `#152221`
- Lincoln bg3 (raised): `#1a2a26`
- Lincoln border: `#284035` / `#3a5e4d`
- Lincoln rose (Mercy): `#FF6B6B`
- Lincoln greenDeep (XP shadow): `#3A8008`

## Assets

- **Avatar sprites**: the codebase already has the configurable hero (`AvatarThumbnail`, equip pieces). The pixel block-figure in `lincoln-screens.jsx > PixelHero` is a placeholder — keep using the real one.
- **Armor item icons**: the codebase likely has real pixel-art versions in `features/avatar/`. Prefer those over the simplified SVGs in `lincoln-screens.jsx`.
- **Read-aloud book cover**: stub gradient in mocks. Use the real book artwork when available; fall back to the gradient + title text.
- **Star/moon scene**: pure inline pixels and CSS — no asset needed.

## Files in this bundle

These are the reference HTML/React files. Open `index.html` in a browser to see all artboards on a pan/zoom canvas, or open any one fullscreen by double-clicking its label.

- `index.html` — entry, loads React + Babel + the scripts below.
- `app.jsx` — composes the `<DesignCanvas>` with all sections and artboards.
- `design-canvas.jsx` — the canvas container component (pan/zoom/reorder/focus). Not part of the production app.
- `ui-kit.jsx` — `<Phone>`, `<StatusBar>`, `<ParentTabBar>`, icon set.
- `shelly-screens.jsx` — mobile parent screens (Today, Plan, Log, Records, AI) + the shared `SH` token bag.
- `lincoln-screens.jsx` — mobile hero screens (Hub, Forge, Mine, Test, Mission) + the shared `LX` token bag + pixel sprite + armor SVGs.
- `tablet-screens.jsx` — tablet variants of the 6 most important screens.

## Suggested implementation order

Sized smallest → largest. Each step is safely shippable in isolation.

1. **No-judge copy pass** — find/replace "missed", "behind", "couldn't" in `features/today/`, `features/records/`, `features/avatar/` and replace with the noticed/flow/stuck/joy vocabulary. Small, high-impact emotional change.
2. **Faith Stats bars** on `/avatar` — pure visual addition under the existing XP bar.
3. **Daily Log richer layout** — promote the existing "What I noticed" surface into the timeline+mood-chip layout described in Section 3.
4. **Records table view + State Checklist sidebar + PDF export rail** — adds significant value for Shelly's state reporting, contained to `features/records/`.
5. **Plan My Week split view at tablet+** — reflow `PlannerChatPage.tsx` to a 2-pane grid above the `md` breakpoint.
6. **Hero Hub bigger scene + Stonebridge banner + emote bar** — visual upgrade to `MyAvatarPage.tsx`.
7. **Knowledge Mine depth meter + ore-block tasks** — replaces existing quest list rendering in `KnowledgeMinePage.tsx`.
8. **Shelly AI "build a test" action** — wire the chat to actually create a `Quest` record from a natural-language directive.
9. **Quest Complete celebration screen** — modal or route reached from `/quest`. Make sure mom-note is required (or graceful fallback).

## Out of scope (intentionally)

- **London's Mario theme screens.** Theme is in `theme.ts` but no London-specific screens were designed. Suggested follow-up.
- **Dad Lab** redesign. Existing list view is fine.
- **Game Workshop** redesign.
- **Settings**, **Login**, **Profile select**.

If you want to extend these in a follow-up, open a new design pass and reference this README so the visual vocabulary stays consistent.
