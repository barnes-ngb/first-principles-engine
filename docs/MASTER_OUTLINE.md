# First Principles Engine — Master Outline

> **Last updated:** 2026-03-15 (Sprint: Knowledge Mine Phase 1)
>
> This is the current source of truth for project status. For the original phased scope from February 2026, see `00_MASTER_SCOPE.md`.

---

## Project Summary

**First Principles Engine** is a phone-fast family learning notebook for the Barnes family homeschool.

| | |
|---|---|
| **Family** | Shelly (lead teacher), Nathan (Dad Lab + engineering), Lincoln (10), London (6) |
| **Tech stack** | React + TypeScript + Vite, Material UI, Firebase (Firestore, Auth, Storage, Cloud Functions), Claude API (Anthropic), OpenAI (DALL-E) |
| **Repo** | `barnes-ngb/first-principles-engine` |
| **Live URL** | Firebase Hosting (production) |
| **Design principle** | Mobile-first, frictionless daily use, small artifacts over perfect documentation |

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

**Kid view (4 items):**
1. Today
2. Knowledge Mine
3. My Stuff
4. Dad Lab

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

### Knowledge Mine (Phase 1 — just built)
- Interactive reading quest for Lincoln
- Minecraft-themed UI (diamonds, bricks)
- Adaptive multiple-choice questions (3 options, tap to answer)
- AI-generated questions via Cloud Function (`taskType: 'quest'`)
- Adaptive difficulty: 3 correct → level up, 2 wrong → level down, 2 level-downs → end session
- 6-level reading skill progression (letter sounds → vowel teams)
- Session timer (max 10 questions or 8 minutes)
- Streak tracking (consecutive days)
- Saves to `evaluationSessions` with `sessionType: 'interactive'`
- `InteractiveSessionData`: questions array, finalLevel, diamondsMined, streakDays
- Findings extracted from AI responses and auto-applied to skill snapshot
- Pure adaptive logic module (`questAdaptive.ts`) with comprehensive tests
- Quest prompt gets enriched context (child profile, skill snapshot, recent evaluation, engagement, grades)

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
- My Stuff (portfolio page, kid nav)
- Kid Lab (Dad Lab page, kid nav)
- Knowledge Mine (quest page, kid nav)

### Cloud Functions (5 exports)

| Function | Purpose | Model |
|---|---|---|
| `chat` | Unified AI endpoint — taskTypes: `plan`, `chat`, `evaluate`, `quest`, `generate` | Sonnet for plan/evaluate/quest; Haiku for chat/generate |
| `weeklyReview` / `generateWeeklyReviewNow` | AI-generated weekly adaptive review | Sonnet |
| `generateActivity` | Content generation (worksheets, prompts) | Haiku |
| `generateImage` | Image generation proxy (OpenAI DALL-E 3) | DALL-E 3 |
| `healthCheck` | Service health verification | — |

### AI Context Pipeline

Every AI call assembles context from:
1. **Charter preamble** — family values, formation-first, split-block scheduling
2. **Child profile** — name, grade, priority skills, supports, stop rules
3. **Enriched context** (plan/evaluate/quest) — recent sessions, workbook paces, week theme/virtue/scripture, hours progress, engagement summaries, grade results
4. **Recent evaluation** (plan/quest) — last completed evaluation session findings and recommendations
5. **Task-specific prompt** — plan output format, evaluation diagnostic sequence, or quest interaction format

---

## Firestore Collections

23+ collections under `families/{familyId}/`:

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
| `dadLab` | Dad lab weeks |
| `skillSnapshots` | Per-child skill snapshots |
| `plannerSessions` | Planner workflow sessions |
| `plannerConversations` | Conversational planner chat history |
| `lessonCards` | Lesson card definitions |
| `weeklyReviews` | AI-generated weekly adaptive reviews |
| `workbookConfigs` | Workbook pace tracking configs |
| `aiUsage` | AI token usage tracking |

---

## What's Built but Untested

- **Weekly Review**: AI-generated adaptive review (UI built, Cloud Function deployed, not yet user-tested)
- **Minecraft avatar**: Explorer Map theming (built, not validated with Lincoln)
- **Print materials / lesson cards**: Auto-generated from plan items (built, not tested with real printing)
- **Skip guidance**: AI skip/modify suggestions based on mastery gate (built, untested with real data)
- **Lincoln's kid view**: Full kid nav with profile switcher (built, not tested in Lincoln's hands)
- **Knowledge Mine reading quest**: Phase 1 complete, needs real-world testing with Lincoln

---

## What's Not Built Yet

### Priority Items (from Shelly Feedback)
- Voice/audio evidence capture workflow (narration-first for Lincoln)
- Real-time engagement alerts or daily summary notifications
- Offline-first support for capture in low-connectivity settings

### Knowledge Mine Phases 2-4
- **Phase 2**: Voice input (speech-to-text for Lincoln), type-to-answer question type
- **Phase 3**: Pre-generated question bank (reduce AI latency), avatar integration
- **Phase 4**: Math domain, Speech domain, cross-domain quests

### Planned Features
- Multi-child simultaneous quest sessions
- Parent dashboard for quest session review and trend analysis
- Weekly quest summary in weekly review
- Streak rewards and milestone celebrations
- London's quest experience (age-appropriate, story-themed)

### Deferred Items
- Offline-first PWA with service worker sync
- Native mobile app
- Multi-family support
- External tutor/co-teacher accounts
- State compliance auto-export (MO Pack PDF generation)

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
