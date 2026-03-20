# First Principles Engine — Master Outline

> **Version:** v5 — March 16, 2026
>
> **Status:** Living document — updated after Sprint E, My Books, Avatar/XP
>
> This is the current source of truth for project status. For the original phased scope from February 2026, see `00_MASTER_SCOPE.md`.

---

## Project Summary

**First Principles Engine** is a phone-fast family learning notebook for the Barnes family homeschool.

| | |
|---|---|
| **Family** | Shelly (lead teacher), Nathan (Dad Lab + engineering), Lincoln (10), London (6) |
| **Tech** | React + TypeScript + Vite, Firebase (Auth, Firestore, Storage, Cloud Functions, Hosting), MUI, Anthropic Claude API (Sonnet for planning/evaluation/stories, Haiku for prompt rewriting), OpenAI DALL-E 3 (scenes) + gpt-image-1 (transparent stickers) |
| **Repo** | `barnes-ngb/first-principles-engine` |
| **Live URL** | Firebase Hosting (production) |
| **Design principle** | Mobile-first, frictionless daily use, small artifacts over perfect documentation |
| **Scale** | 52k+ lines TypeScript, 30 test files, 575+ tests, 29+ Firestore collections, 0 TS errors |

---

## What's Built and Working

### Navigation

**Parent view (7 items):**
1. Today
2. Plan My Week
3. Weekly Review
4. Progress
5. Records
6. Dad Lab
7. Settings

**Kid view (5 items):**
1. Today
2. Knowledge Mine
3. My Books
4. My Stuff
5. Dad Lab

### Today Page
- Plan-first flow: day plan renders as checklist from weekly plan
- Energy selector (Normal Day / MVD toggle via `PlanType`)
- Per-item engagement feedback (`engaged` / `okay` / `struggled` / `refused`)
- Per-item evidence capture (artifact link)
- Per-item grade/review results
- MVD mode: filters to `mvdEssential` items only
- Checklist items with `category`: `must-do` vs `choose`
- Session runner integration

### Plan My Week (Planner Chat)
- Guided conversational wizard with Shelly
- Photo upload + workbook extraction (page/lesson recognition)
- AI-generated weekly plans (5-day, per-child, respects hours budget)
- Skip guidance: AI suggests skip/modify based on mastery gate levels
- Print materials / lesson cards (auto-generated per plan item)
- App block support (Reading Eggs, math apps, etc.)
- Must-do / choose categorization
- MVD essential marking
- Plan apply → creates checklist items on Today page

### Evaluation Chat
- Shelly-guided reading diagnostic (structured 6-level assessment)
- Walk-through one step at a time, wait for parent response
- `<finding>` block extraction per response
- `<complete>` block with summary, recommendations, supports, stop rules, evidence definitions
- Findings → skill snapshot apply pipeline
- Supports enriched context (sessions, workbook pace, engagement, grades)

### Knowledge Mine (Interactive Quest)
- Interactive reading quest for Lincoln
- Minecraft-themed UI (diamonds, bricks)
- Adaptive multiple-choice questions (3 options, tap to answer)
- AI-generated questions via Cloud Function (`taskType: 'quest'`)
- Adaptive difficulty: 3 correct → level up, 2 wrong → level down, 2 level-downs → end session
- 6-level reading skill progression (letter sounds → vowel teams)
- Session timer (max 10 questions or 8 minutes)
- Streak tracking (consecutive days)
- Saves to `evaluationSessions` with `sessionType: 'interactive'`
- Auto-apply findings to skill snapshot on quest end
- AI-generated session summary with recommendations
- Phoneme display fixed (Levels 1–3 only, plain notation)
- Parent visibility in Evaluation History tab
- 24 unit tests for adaptive logic
- Quest diamonds → 2 XP each → avatar progression
- Quest prompt gets enriched context (child profile, skill snapshot, recent evaluation, engagement, grades)

### My Books (Book Builder + AI Story Generator) — NEW

- **Bookshelf** — filter tabs (All / My Stories / Generated / Sight Words), 3-dot menu (Read/Edit/Print/Delete), auto-cover from first page image, completed badges, relative time, sort drafts first
- **Book Editor** — page editor with text, photos, voice recording, speech-to-text dictation, AI scene generation ("Make a Scene"), sticker picker, drag-to-position images, text sizing (Big/Medium/Small), font family (Handwriting/Print/Pixel), page reorder arrows, Together Book toggle, "Finish My Book" with cover picker
- **AI Scene Generation** — Claude Haiku rewrites prompts for copyright safety, DALL-E 3 generates scenes, world-type quick-pick chips (Lincoln: adventure themes, London: fairy/animal themes), 6 world styles: 4 base + Garden Battle (PvZ-style) + Platformer World (Mario-style)
- **Sticker Generation** — gpt-image-1 with native transparent backgrounds
- **AI Book Generator** — paste story idea + optional word list → Claude generates full story → DALL-E illustrates every page → progressive save (text first, images update incrementally) → progress UI
- **Book Reader** — full-screen swipeable page flipper, cover/content/back cover, audio playback, dot indicator, Edit + Print buttons
- **Reading Session Tracking** — timer starts on open, pages-viewed counter, reading session logged to hours on close, portfolio artifact created on completion
- **Sight Word System** — all words tappable for TTS (not just sight words), tap for pronunciation + "I know this!", per-word mastery tracking (new → practicing → familiar → mastered), sound-it-out mode (letter by letter then whole word), Shelly override, SightWordDashboard
- **Print** — PDF via html2canvas + jsPDF, settings dialog (Letter/Half-letter/A4/Booklet, White/Cream/Dark background, sight word style), images loaded via Firebase SDK getBlob, fixed 3:2 aspect ratio for sticker positioning
- **Child-specific** — Lincoln: Minecraft/dark theme, adventure worlds, 10 pages. London: storybook/cream theme, fairy/animal worlds, 6 pages, Fredoka font
- **Content violation handling** — blocked prompts show upload/import guidance, sticker rewriter allows generic characters
- **Sketch cleanup** — client-side background removal for uploaded drawings, auto-detects overlay context
- **Pinch-to-zoom** — two-finger resize on tablet, enlarged resize handle

### Avatar / XP System — NEW

- XP Ledger (Firestore collection, cumulative event log)
- MinecraftAvatar + XpBar on KidTodayView and Knowledge Mine
- Quest diamonds → 2 XP each, written to ledger on session end
- QuestSummary shows XP earned + armor progress + tier-up celebration animation
- Armor tiers defined: leather → iron → gold → diamond → netherite
- Basic pixel avatar rendering (custom Lincoln/London avatars not yet built)
- XP events: quest diamonds, checklist completion (planned), books read (planned)

### Dad Lab
- Full project lifecycle: suggest → idea → plan → active → complete
- Project board with status cards
- Per-project session log (append-only entries)
- Kid view with artifact gallery
- Per-child lab reports (prediction, explanation, observation, creation)
- Materials list, role assignments (Lincoln/London)
- Archive and soft-delete support

### Progress
- Ladders: card-based skill ladder definitions with rungs, evidence, supports
- Ladder progress tracking per child (streak, support level, history)
- Engine page: flywheel visualization
- Milestones: milestone achievement tracking
- Skill snapshot view (priority skills, supports, stop rules, evidence definitions)

### Records
- Hours tracking: manual entries + auto-generation from day logs
- Hours adjustments collection
- Compliance: MO target hours (1000) with progress percentage
- Evaluations page: evaluation session history
- Portfolio page: artifact gallery with filtering

### Kid Views
- KidTodayView (via profile switcher + Today page)
- Explorer Map (Minecraft-themed, in kid nav as part of progress)
- My Books — bookshelf, book editor, reader, AI story generator
- My Stuff (portfolio page, kid nav)
- Kid Lab (Dad Lab page, kid nav)
- Knowledge Mine Phase 1 — reading quest with adaptive AI questions (updated from "Knowledge Mine" stub)

### Cloud Functions (5 exports)

| Function | Purpose | Model |
|---|---|---|
| `chat` | Unified AI endpoint — taskTypes: `plan`, `chat`, `evaluate`, `quest`, `generateStory`, `generate` | Sonnet for plan/evaluate/quest; Haiku for chat/generate/generateStory |
| `weeklyReview` / `generateWeeklyReviewNow` | AI-generated weekly adaptive review | Sonnet |
| `generateActivity` | Content generation (worksheets, prompts) | Haiku |
| `generateImage` | DALL-E 3 (scenes) + gpt-image-1 (stickers) + Haiku prompt rewriter | DALL-E 3 / gpt-image-1 |
| `healthCheck` | Service health verification | — |

Note: AI story generation runs via `chat` Cloud Function with `taskType: 'generateStory'`

### AI Context Pipeline

Every AI call assembles context from:
1. **Charter preamble** — family values, formation-first, split-block scheduling
2. **Child profile** — name, grade, priority skills, supports, stop rules
3. **Enriched context** (plan/evaluate/quest) — recent sessions, workbook paces, week theme/virtue/scripture, hours progress, engagement summaries, grade results
4. **Recent evaluation** (plan/quest) — last completed evaluation session findings and recommendations
5. **Task-specific prompt** — plan output format, evaluation diagnostic sequence, quest interaction format, or story generation prompt (child profile, sight word list, page count, world style)

---

## Firestore Collections

29+ collections under `families/{familyId}/`:

| Collection | Purpose |
|---|---|
| `children` | Child profiles |
| `weeks` | Weekly plans (theme, virtue, scripture, heart question) |
| `days` | Daily logs (checklist, engagement, grades) |
| `artifacts` | Evidence artifacts (photos/audio/notes) |
| `hours` | Manual hours entries |
| `hoursAdjustments` | Hours adjustments |
| `evaluations` | Skill evaluations (monthly) |
| `evaluationSessions` | Diagnostic assessment sessions (guided + interactive) |
| `ladders` | Skill ladder definitions |
| `ladderProgress` | Per-child ladder progression |
| `milestoneProgress` | Milestone achievement tracking |
| `sessions` | Skill practice sessions |
| `dailyPlans` | Daily session plans |
| `projects` | Long-form projects (Dad Lab) |
| `weeklyScores` | Weekly score summaries |
| `labSessions` | Saturday lab sessions |
| `dadLabReports` | Dad lab reports |
| `skillSnapshots` | Per-child skill snapshots |
| `plannerSessions` | Planner workflow sessions |
| `plannerConversations` | Conversational planner chat history |
| `lessonCards` | Lesson card definitions |
| `weeklyReviews` | AI-generated weekly adaptive reviews |
| `workbookConfigs` | Workbook pace tracking configs |
| `aiUsage` | AI token usage tracking |
| `xpLedger` | Per-child XP tracking (cumulative) |
| `books` | Book Builder documents |
| `bookPages` | Individual book pages |
| `stickerLibrary` | Generated sticker assets |
| `sightWordProgress` | Per-child per-word mastery tracking |
| `sightWordLists` | Curated sight word lists |
| `readingSessions` | Book reading sessions (timer, pages viewed, completion) |

---

## What's Built but Untested with Real Users

- **Weekly Review**: AI-generated adaptive review (scheduled function, needs full week of data)
- **Print materials**: Worksheets and book PDFs generate but quality varies
- **Skip guidance**: AI skip/modify suggestions based on mastery gate (depends on evaluation data quality)
- **Lincoln's kid view**: Must-Do/Choose flow — needs real week
- **Knowledge Mine reading quest**: Needs Lincoln to test question quality + adaptive pacing
- **My Books full flow**: Needs Shelly + kids to test AI story gen, sight word tracking, reading sessions
- **Reading session hours logging**: Hours auto-log on book close — needs verification
- **Avatar XP progression**: Tier-up logic untested end-to-end

---

## What's Not Built Yet

### Priority Items (from Shelly Feedback)
- Voice/audio evidence capture workflow (narration-first for Lincoln)
- Real-time engagement alerts or daily summary notifications
- Offline-first support for capture in low-connectivity settings

### Knowledge Mine Phases 2-4
- **Phase 2**: Voice input (speech-to-text for Lincoln), type-to-answer question type
- **Phase 3**: Pre-generated question bank (reduce AI latency)
- **Phase 4**: Avatar integration full build (custom pixel avatars for Lincoln/London, skin export)
- "End on a win" logic (add easy question if ending on wrong answer)
- Parent review view for interactive sessions in Records
- Math Quest domain
- Speech Quest domain

### My Books — Planned Improvements
- Evaluation → Sight Words pipeline: evaluation findings auto-populate sight word practice list
- Book generator pulls Lincoln's weakest sight words: "Generate a story using his 10 current words"
- Collaborative read-aloud mode ("Read to London") — Lincoln reads aloud or TTS reads, London follows highlighted words
- Improved AI story quality (longer, more varied sentence structures)
- Voice-only book creation mode (dictate entire story)

### Planned Features
- Multi-child simultaneous quest sessions
- Parent dashboard for quest session review and trend analysis
- Weekly quest summary in weekly review
- Streak rewards and milestone celebrations
- London's quest experience (age-appropriate, story-themed)
- "Read to London" mode (Lincoln reads aloud while London follows highlighted words)
- Evaluation → Sight Words → Stories pipeline (auto-populate word lists from evaluations)
- Custom Lincoln/London Minecraft avatars (pixel art, child-specific)

### Deferred Items
- Offline-first PWA with service worker sync
- Native mobile app
- Multi-family support
- External tutor/co-teacher accounts
- State compliance auto-export (MO Pack PDF generation)

### Brainstorm Backlog (March 16, 2026)

These ideas came from Shelly + Nathan — not yet designed or scoped:

**Planning**
- Adjust times on individual activities in weekly plan
- Activity IDEAS mode (not just scheduling) — draw from past wins like "nerf shooting sight words"
- Activity suggestions based on engagement data ("Lincoln loved hands-on last week")
- Homeschool activity research + lookup for specific skills
- Better day generation — full schedule from energy + available time

**Lincoln Development Chat**
- Dedicated chat mode: "What should we work on with Lincoln this week?"
- AI reviews evaluations, skill snapshot, recent progress → recommends next steps

**London's Game Builder**
- Mario Maker-style level/game designer
- London designs, family plays
- Tie into her love of drawing + stories

**Minecraft Avatar Upgrade**
- Custom Minecraft-style avatars for Lincoln and London (not generic Steve)
- Visual progression: leather → iron → gold → diamond → netherite
- Display on Today page, Knowledge Mine, bookshelf

**Field Trip / Activity Research**
- Kansas City area homeschool field trip finder
- "Research how to get into places like bee hives and police stations"
- Google Calendar integration for scheduling

---

## Sprint History

| Sprint | Date | Focus |
|---|---|---|
| **A** | Mar 3 | MVP: Today page, day logs, basic nav, hours tracking |
| **B** | Mar 4-5 | Engine + Ladders: flywheel, skill tracking, ladder progress |
| **C** | Mar 5-6 | Records + Compliance: hours generation, CSV export, evaluations |
| **D** | Mar 6 | Planner v1: photo upload, workbook extraction, plan generation |
| **E** | Mar 7 | Deployment: Firebase Hosting, Auth, CI/CD, security rules |
| **F** | Mar 7-8 | AI Integration: Cloud Functions, Claude API, system prompts, evaluation chat |
| **G** | Mar 8-9 | Dad Lab: project lifecycle, session log, kid view, artifact gallery |
| **H** | Mar 9-10 | Planner Chat: conversational wizard, guided plan generation |
| **I** | Mar 10-11 | Enriched Context: workbook pace, engagement tracking, grade results, skip guidance |
| **J** | Mar 11-12 | Kid Experience: profile switcher, kid nav, explorer map, must-do/choose, MVD |
| **K** | Mar 12-13 | Weekly Review: AI adaptive loop, pace adjustments, celebration/growth areas |
| **L** | Mar 14-15 | Knowledge Mine Phase 1: interactive reading quest, adaptive MC, Minecraft theme |
| **E1** | Mar 15 | Knowledge Mine: quest loop fixes, adaptive logic, 24 unit tests |
| **E2** | Mar 15 | Diamonds → XP → Avatar (XP ledger, armor tiers, KidTodayView bar) |
| **E3–E5** | Mar 15–16 | My Books core: editor, AI scene gen, finish flow, reader, reorder, text sizing |
| **Infra** | Mar 16 | Storage rules, deploy pipeline, Firestore indexes, signed URL → download token fix |
| **Sticker** | Mar 16 | gpt-image-1 transparent stickers |
| **SightWord** | Mar 16 | Sight word reader, mastery tracking, dashboard, AI story generator |
| **Print** | Mar 16 | PDF (getBlob fix), settings dialog, NaN fix |
| **London** | Mar 16 | London theming, child-aware generation, content violation helpers |
| **Fixes** | Mar 16 | Progressive save, reading tracking, tappable words, sketch cleanup, pinch-to-zoom, Firestore undefined fix, print sticker overlap (PRs #353–357) |

---

## Key Design Decisions

1. **Firestore over SQL** — real-time sync, offline support, Firebase ecosystem alignment
2. **Cloud Functions for AI** — no API keys in client code, model selection by task type, usage tracking
3. **Charter in every prompt** — family values injected into every AI system prompt
4. **Skill tags are dot-delimited** — `phonics.cvc.short-a` enables hierarchical querying
5. **PlanType: 'normal' / 'mvd'** — not legacy A/B; MVD is "the floor, not failure"
6. **Split-block scheduling** — Shelly's attention is the constraint; Lincoln and London alternate direct support
7. **Evaluation → Skill Snapshot pipeline** — diagnostic findings flow into planner context automatically
8. **Engagement feedback on every item** — captures what works/doesn't for adaptive planning
9. **Must-do / Choose categories** — kid-facing: complete must-dos, then pick from choose items
10. **Append-only session logs** — Dad Lab projects accumulate history, never overwrite
11. **Interactive evaluation = learning** — Knowledge Mine is assessment AND practice; Lincoln learns while we evaluate
12. **Diamonds not scores** — game metaphor (diamonds mined) replaces test scores; always end on a win
13. **Scene-first workflow** — AI generates illustrated worlds, kids provide their own characters via photo upload
14. **Reading = building** — every book read logs hours and creates a portfolio artifact automatically
15. **Words are learnable anywhere** — tap any word in any book for pronunciation; sight word mastery tracked passively through use

---

## Key Files Reference

```
src/app/AppShell.tsx           — nav structure (parent + kid)
src/app/router.tsx             — all routes
src/core/types/domain.ts       — ALL data types
src/core/firebase/firestore.ts — ALL collection references
src/core/ai/useAI.ts           — chat + generateImage hooks
functions/src/ai/chat.ts       — AI pipeline (plan, evaluate, quest, generateStory, chat)
functions/src/ai/imageGen.ts   — DALL-E 3 + gpt-image-1 + Haiku prompt rewriter
src/features/books/            — My Books (22 files, 6300+ lines)
src/features/quest/            — Knowledge Mine (7 files)
src/features/minecraft/        — Avatar + XP (5 files)
src/features/today/            — Today page
src/features/records/          — Records + compliance
docs/MASTER_OUTLINE.md         — this file
.github/workflows/deploy.yml   — CI/CD pipeline
```
