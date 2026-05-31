# Barnes Homeschool — Project Context
> Auto-generated 2026-05-29. Use as Claude.ai project context file.
> Sources: repo docs (MASTER_OUTLINE v15, CLAUDE.md, FIRST_PRINCIPLES_ALIGNMENT, GAME_WORLD_ECONOMY, STONEBRIDGE_BIBLE, FINDINGS_PIPELINE, HEALTH_REPORT 2026-05-29), code (AppShell, contextSlices.ts, tasks/index.ts), and Drive docs (Charter v2, Dad Lab Charter, State Compliance Guide).

## Family
- **Shelly** — parent; runs the weekday routine (formation first, then fundamentals). Fibromyalgia: energy management is non-negotiable and the app adapts to her energy. Her direct attention is the primary schedulable resource. One-tap evidence capture; MVDs are real school.
- **Nathan** — dad; runs Saturday Dad Lab and builds the system.
- **Lincoln (10, he/him)** — neurodivergent, speech challenges. ~3rd-grade math, ~1st-grade reading; phonics recently clicking. Short/visual/predictable instructions; narration is first-class evidence (speaks before he writes); celebrate small wins (persistence IS the goal); never pressure reading aloud in shaming ways; he teaches London. Motivators: Minecraft, Lego, art. Extra tablet time counts.
- **London (6, he/him)** — kindergarten; story-driven, creates own books. Knows most letter sounds. Activities must be interactive and voice-first; disengages when unsupervised. Drawing/creating ARE core curriculum. The "wonder engine."

## Values (Charter v2, Mar 2026)
**North Star (verbatim):** "We learn to know God, love people, and build useful things with wisdom and courage. We pursue truth in Scripture and in God's world, grow skill with our hands and minds, and use what we learn to bless others."

**Aim:** Wholehearted in faith · Capable in skill · Steady in character · Strong in body and curiosity · Ready to contribute.

**Culture Code:** Faith first · Truth with humility · Courage + perseverance · Craft + attention · Curiosity + wonder · Service + stewardship · Rest by design.

**Learning Loop:** Wonder → Build → Explain → Reflect → Share (completes over time, not in a single session).

**The five dispositions ARE the report card** (no grades): Curiosity, Persistence, Articulation, Self-Awareness, Ownership.

**Minimum Viable Day (the floor — real school):** Prayer + Scripture + gratitude (short), read aloud, math practice, one hands-on activity, one-sentence reflection or photo. The app never frames an MVD as failure.

**What We Don't Do:** No grades ("You mined 8 diamonds," not "80%") · No shame (a bad day is data) · No heroics (built for fibromyalgia / neurodivergence / a six-year-old) · No busywork.

**Conundrums:** weekly open-ended scenario, no right answer, tied to studies + the week's virtue. First-principles ethical reasoning.

**Lincoln teaches London:** Feynman technique; his explanations (audio/notes/photos) are the richest portfolio artifacts. **AI assists, humans decide.**

## App: First Principles Engine
A phone-fast family learning notebook: expresses the Charter, runs daily school (Normal / MVD), captures evidence (notes/photos/audio), visualizes weekly progress, tracks growth (dispositions + milestones), exports MO-friendly records, and adapts weekly via an AI evaluation loop.

**Tech:** React + TypeScript + Vite · Firebase (Auth/Firestore/Storage/Functions/Hosting) · MUI · Claude (Anthropic) for reasoning + OpenAI (gpt-image-1.5) for images.
**Live:** https://first-principles-engine.web.app

**Scale (computed 2026-05-29):**
- TypeScript lines: **160,818** (src + functions)
- Commits: **118** on `claude/hopeful-knuth-uRZOG` (HEALTH_REPORT shows 122 on the audit branch off main)
- Test files: **125** · Tests passing: **2,038** across 124 files (per HEALTH_REPORT 2026-05-29; full suite not re-run here)
- Firestore collection/doc helpers in `firestore.ts`: **34**
- Cloud Functions exported: **24**
- Chat task types (`tasks/index.ts` registry): **17**
- Routes (`router.tsx`): **33**
- Bundle (main chunk): **3.7 MB / 1.13 MB gzip** (per HEALTH_REPORT; not re-built here)

## Navigation (from `src/app/AppShell.tsx`)
**Parent:** Today · Plan My Week · Weekly Review · Progress · Records · Books · Game Workshop · Dad Lab · Settings · Ask AI
(Progress sub-tabs: Learning Profile · Monthly Books · Learning Map · Curriculum · Skill Snapshot · Word Wall · Ladders · Engine · Armor · Milestones)

**Kid:** Today · Knowledge Mine (`/quest`) · My Books · Books About Me (`/books-about-me`) · **My Hero** (`/avatar`) · My Stuff (`/records/portfolio`) · Game Workshop · Dad Lab

> **Canonical term:** the avatar destination is **"My Hero"** (nav label) / **"Hero Hub"** (page title), route `/avatar` (`/hero`, `/armor` redirect in). MASTER_OUTLINE v15 reframed the former "My Armor" page. Use **My Hero / Hero Hub**, not "My Armor."

## What's Built (summary)
- **Today (Parent):** Week Ribbon (Mon–Fri progress dots), Unified Capture Card (one card → artifact + hours, preset chips, kid variant), checklist, week focus, chapter question pool, draft-ready monthly-book card.
- **Today (Kid):** KidTodayView — checklist, teach-back, chapter pool, conundrum response, extra logger, celebration, Knowledge Mine card. Visible save-error alerts on all kid save flows.
- **Plan My Week:** AI chat planner with returning-user compact setup as default, full wizard for first-visit, "Repeat Last Week" clone with lesson advancement, edit-setup back-link.
- **Weekly Review:** scheduled (Sun 7pm CT) + manual; "Week in Evidence" surfaces raw book/teach-back counts alongside the AI narrative.
- **Monthly Books (Phase 1):** per-child/per-month review books; 5 MVP sections (Cover, Month in a Sentence, What You Loved, What You Worked Through, By the Numbers); Draft/Publish; kids see only published under "Books About Me"; "More from this month" overflow gallery.
- **Hero Hub:** identity + mission place (mission card → Stonebridge preview → 3D character → suit-up → armor gallery); mission states Suit Up → Conundrum → Chapter → Hero Ready; launcher tiles (Mine/Workshop/Books).
- **3D Avatar (Armor of God):** voxel character, MeshPhong materials, edge outlines, open-face helmet, cape, Accessories system (10 cosmetics, slot conflicts), Brothers View, Night/Room background toggle.
- **Knowledge Mine:** interactive reading quest; produces EvaluationFindings; auto-tracks Reading hours.
- **Books:** kid-authored books, editor (undo/redo, version history, sketch cleanup, stickers/scenes), reader, story guide, sight-word dashboard; Story Gen V2 (chat entry + per-page review with voice "change this").
- **Dad Lab:** plan → start → contribute → complete lifecycle; reports feed portfolio + hours + disposition signals.
- **Game Workshop:** board / choose-your-adventure / card games.
- **Records:** hours, MO compliance, evaluations, portfolio.
- **Voice Input (Phase 1):** reusable `<VoiceInput>` + Whisper-backed `transcribeAudio` CF; per-child `voiceInputEnhanced` flag (Lincoln defaults true); writes `transcriptionEvents`.
- **Two-currency economy + armor progression gating** (see Economy).
- **Stonebridge narrative foundation:** shared world bible imported into CF prompt context.

## Data Model (Firestore — under `families/{familyId}/`)
| Collection | Purpose |
|---|---|
| `children` | Child profiles |
| `weeks` / `days` | Weekly plans / daily logs |
| `artifacts` | Evidence (photos/audio/notes) |
| `hours` / `hoursAdjustments` | Manual hours + adjustments |
| `evaluations` / `evaluationSessions` | Skill evaluations / interactive sessions (Knowledge Mine) |
| `skillSnapshots` | Per-child skill snapshots (prioritySkills, supports, stopRules, conceptualBlocks, workingLevels) |
| `ladderProgress` | Per-child ladder progression (partially deprecated) |
| `dailyPlans` | Daily session plans |
| `dadLabReports` | Dad Lab session reports |
| `plannerConversations` | Planner chat conversations |
| `lessonCards` | Lesson card definitions |
| `weeklyReviews` / `monthlyReviews` | AI weekly/monthly reviews (`monthlyReviews` doc id `{childId}_{YYYY-MM}`) |
| `workbookConfigs` | Legacy workbook config (→ activityConfigs) |
| `activityConfigs` | Structured activity definitions (primary; replaces routine text + workbook configs) |
| `xpLedger` | XP + Diamond event log (`currencyType`) |
| `books` / `bookProgress` / `bookThemes` | Kid books / read-aloud progress + question pools / theme presets |
| `stickerLibrary` | Family sticker assets |
| `sightWordProgress` | Per-child sight word mastery (canonical "sight words" store) |
| `aiUsage` | AI token usage + cost tracking |
| `avatarProfiles` / `dailyArmorSessions` | Avatar customization / daily armor XP sessions |
| `storyGames` | Workshop games |
| `scans` | Curriculum photo scan records |
| `shellyChatThreads` (+ `/messages`) | Shelly AI chat threads + messages |
| `chapterResponses` | Read-aloud chapter discussion responses |
| `childSkillMaps` | Per-child curriculum knowledge maps |

**Subcollections:** `children/{childId}/transcriptionEvents` (Whisper events), `children/{childId}/wordProgress` (Knowledge Mine word progress).
**Global:** `chapterBooks` (shared chapter book library).
**Settings docs:** `settings/plannerDefaults_{childId}`.

### Dates & tags conventions
- Dates stored as `YYYY-MM-DD` strings. PlanType uses `'normal'` / `'mvd'` (legacy `'A'`/`'B'` normalized on read).
- Artifact tags (required): `childId`, `engineStage`, `subjectBucket`, `location`, `domain`. Optional: `ladderRef`, `weekId`, `dayId`, `pillar`.

## AI Pipeline
**Architecture:** client (`src/core/ai/`) assembles prompts; all API calls route through Firebase Cloud Functions (`functions/src/ai/`). No API keys in client code. Charter values injected into every system prompt (`CHARTER_PREAMBLE` in `contextSlices.ts`).

**Model selection by task:**
- Sonnet (`claude-sonnet-4-6`): plan, evaluate, quest, generateStory, workshop, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, revisePage, monthlyReview — complex reasoning.
- Haiku (`claude-haiku-4-5-20251001`): generate, chat — routine generation (kid-facing utility; ≤1024 tokens).
- Images: gpt-image-1.5 (OpenAI).

**24 Cloud Functions:** `chat` (task dispatch), `analyzeEvaluationPatterns`, `weeklyReview`, `generateWeeklyReviewNow`, `generateMonthlyReview`, `generateMonthlyReviewNow`, `publishMonthlyReview`, `unpublishMonthlyReview`, `auditMonthlyReviewSources`, `generateActivity`, `transcribeAudio`, `healthCheck`, + 12 image functions (`generateImage`, `generateAvatarPiece`, `generateStarterAvatar`, `transformAvatarPhoto`, `generateArmorPiece`, `generateBaseCharacter`, `generateArmorSheet`, `generateArmorReference`, `extractFeatures`, `generateMinecraftSkin`, `generateMinecraftFace`, `enhanceSketch`).

**17 chat task types** (`tasks/index.ts`): plan, chat, generate, evaluate, quest, generateStory, reviseStory, revisePage, workshop, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, chapterQuestions, monthlyReview.

**Context slices** (`TASK_CONTEXT` in `contextSlices.ts`) — per-task assembly of: `charter`, `childProfile`, `workbookPaces` (curriculum coverage, NO pace pressure), `weekFocus`, `hoursProgress`, `engagement`, `gradeResults`, `bookStatus`, `sightWords`, `recentEval`, `recentHistoryByDomain`, `wordMastery`, `generatedContent`, `workshopGames`, `mastery`, `skillSnapshot`, `childSkillMap` (curriculum-map node coverage; `shellyChat`-only, read-only), `recentScans`, `activityConfigs`, `dayToday`, `dadLabReports`. Examples:
- `plan` → 18 slices (the richest).
- `chat` → `["charter","childProfile"]` only (Haiku, kid-facing — pinned by isolation test; must NOT gain eval/disposition context).
- `shellyChat` → 15 shared slices (incl. `childSkillMap` curriculum-coverage, FUNC-03) + 8 supplemental queries in `tasks/shellyChat.ts` (disposition profile, weekly review strip, conundrum, teach-backs). Sonnet, planning-partner mode.
- `weeklyReview` → charter, childProfile, skillSnapshot, activityConfigs, recentHistoryByDomain, recentScans, wordMastery, dadLabReports (+ week-scoped `assembleWeekContext`); not routed through `chat` dispatch (dedicated scheduled CF).

**Findings pipeline:** `EvaluationFinding { skill, status: mastered|emerging|not-yet|not-tested, evidence, notes?, testedAt }` (`evaluation.ts`). Created by Knowledge Mine quests (`<quest>` tag), guided evaluations (`<finding>` tag), and curriculum scans (findings-shaped). Written to `evaluationSessions` (replace) and `skillSnapshots.prioritySkills` (merge); feeds `childSkillMaps` via `updateSkillMapFromFindings()`.

## Economy (two-currency: XP + Diamonds)
- **XP** = passive progression / tier-unlock axis; never spent. Earned from all activities.
- **Diamonds** = active spend currency (forge armor, future cosmetics/decorations). Earned from active-effort activities only (quests, teach-back, Dad Lab, reading, etc.).
- **Tier thresholds (XP):** Wood 0, Stone 200, Iron 500, Gold 1000, Diamond 2000, Netherite 5000. Biomes: Stonebridge Village → Caves → Mountains → Desert Temple → The End → The Nether.
- **Forge model:** spend diamonds once to forge a piece, then equip toggle is free. Per-tier totals (diamonds): 44 / 130 / 240 / 385 / 610 / 910.
- **Gating:** loose gate (next tier visible but locked with reason); dual requirement (XP threshold AND prior tier fully forged); `forgedPieces[]` distinct from `equippedPieces`; tier-completion diamond bonuses (Wood 20 … Netherite 200). Daily Suit Up equips OWNED pieces only.
- **Gateways:** `addXpEvent()` and `addDiamondEvent()` are the ONLY award paths (direct balance writes are bugs). `xpLedger` stores both via `currencyType`.
- **Faith Stats** (kid-facing, derivation pending Shelly review): Strength (stuck→came-back), Wisdom (mastery avg), Mercy (gentler retry / helping London), Courage (suit-up streak × tier). Do NOT replace Dispositions.

## Key Design Decisions (guardrails)
1. Two currencies, distinct roles — XP = progression, Diamonds = choice.
2. Forge then equip — spend once to forge, free equip toggles forever.
3. Stonebridge is one shared world — all narrative builds the same canon.
4. Hero Hub is a place, not a settings page — mission context above customization.
5. Knowledge Mine vs Banner Rally split — measure vs adventure.
6. Family-tuned proportions — design with the child in a live playground.
7. Edge outlines for readability.
8. Open-face helmet — identity beats coverage.
9. Loose tier gate — visible but locked, aspirational not hidden.
10. Daily Suit Up = equip all OWNED pieces, not all 6.
11. Gateway functions for currency (`addXpEvent`/`addDiamondEvent` only).
12. Nothing is ever lost — drawings auto-save; image replacements keep `previousVersions[]` (max 5).
13. Drawings are stickers, scenes are backgrounds.
14. Cleaned drawings reimagine as transparent stickers by default.
15. One Capture surface, three behaviors (media+duration / media / duration).
16. Evidence beats narrative (Week in Evidence raw counts).
17. Faith Stats kid-facing; Dispositions parent-facing.
18. No-judge vocabulary enforced in user-facing strings (banned: missed/behind/failed/couldn't; required: noticed/flow/stuck/tried/took a break/came back; every "stuck" paired with what came next).
19. Quest Complete mom-note is hand-written by Shelly, never AI-generated (fallback: "Mom will see this tonight.").

## Architecture
**Top files (computed):** PlannerChatPage.tsx (2,620) · functions/src/ai/chat.ts (2,466) · BookEditorPage.tsx (2,278) · useQuestSession.ts (1,870) · MyAvatarPage.tsx (1,804) · ShellyChatPage.tsx (1,632) · WorkshopPage.tsx (1,623) · VoxelCharacter.tsx (1,562) · chatPlanner.logic.ts (1,363) · contextSlices.ts (1,325).

**shelly-chat (`src/features/shelly-chat/`):** ShellyChatPage (thin shell), ChatThreadDrawer, ChatMessageBubble, openChatWithContext, formatRelativeTime, `useShellyChatState` (thread/message/image state — ARCH-09), `useShellyChatFlows` (effects + send/image/upload/thread-CRUD handlers), `reflectionSuggestions` (pure heuristics), `parseFollowups` (pure `[FOLLOWUP]` parser), `parseChatActions` (pure `<action>` extractor + `ChatAction` allowlist). **Portal write layer (Build Steps 3b + 4, live — Tier B complete):** `useShellyChatActions` (propose→confirm→write; allowlist + active-child guards; no write before a confirm tap; applied writes audited inline via `appliedActions`) + `ActionConfirmCard` (inline Confirm / Dismiss / Confirm-all cards; sight words one-liner, `editProfileField` before→after diff). Two write kinds: sight words via shared `addSightWord`/`removeSightWord` in `useSightWordProgress`, and **profile soft fields via the shared `updateChildSoftProfile` writer (`src/core/family/`) — `editProfileField` for `motivators`/`interests`/`strengths` only (the `field` literal IS the allowlist; `supports`/`grade`/Tier-C paths are unrepresentable + rejected by `parseChatActions`)**. The same `updateChildSoftProfile` backs Settings' `SoftProfileSection` (no fork). `<action>` grammar (both kinds) taught via `buildSightWordActionAddendum` in `functions/src/ai/tasks/shellyChat.ts`. `supports` stays Tier C (`skillSnapshots`); Tier-C snapshot writes + ARCH-10 rules hardening out of scope. Tests (TEST-01): `parseFollowups`, `formatRelativeTime`, `useShellyChatState`, `reflectionSuggestions`, `parseChatActions`, `ShellyChatPage` smoke, `useShellyChatActions.logic`, plus `updateChildSoftProfile`.

**Decomposition status:** Today, Kid Today, Planner render layers, and Avatar subpanels partially decomposed. ShellyChatPage state extracted to `useShellyChatState` (ARCH-09 IN PROGRESS). Risk concentration is state-heavy files (PlannerChatPage, useQuestSession, MyAvatarPage).

**Known tech debt:** Ladder system partially deprecated (Dispositions replacing it; data kept). WorkbookConfig → ActivityConfig migration incomplete (both exist; ActivityConfig is primary). chat.ts CF large (prompt builders inline). Bundle ~3.7MB (code-split Three.js/jsPDF candidates). AvatarThumbnail spawns N WebGLRenderer instances. Hardcoded admin UID in SettingsPage.tsx. Hours partial-day edge (only tracked blocks count).

**Deploy:** push to `main` runs tests + auto-deploys Firestore indexes if changed; push to `deploy` does full deploy. Never deploy functions without indexes.

## Compliance (State Compliance Guide, Mar 2026)
**Missouri (current) — RSMo 167.012.** No registration / notice / testing / reporting / curriculum approval / home visits.
- **1,000 instructional hours/year**; **≥600** across the five core subjects; **≥400 core hours** at the regular location; school year **July 1 – June 30**.
- Five core subjects: **Reading, Language Arts, Mathematics, Social Studies, Science.**
- Records kept at home (never submitted unless a legal proceeding): plan book/daily log, work samples per child, evaluation records.
- Compulsory ages 7–17 (Lincoln 10 in-scope; London 6 below compulsory age but homeschooled).
- ⚠️ **Known gap:** Social Studies is not explicitly in the current plan — cover via read-alouds (historical fiction/biography), Theme Engine (geography/maps/community), or the citizenship/formation thread.
- **MOScholars ESA** (statewide since 2025): IEP students up to 175% of state adequacy target; low-income up to 125%. Covers curriculum, tutoring, and **speech therapy**. Requires annual standardized assessment + EAO application.

**Texas (future move):** treated as a private school (Leeper; 2025 HB 2674). Five subjects: Reading, Spelling, Grammar, Math, Good Citizenship. No hours/testing/reporting. TX ESA (SB2) ~late 2026, up to $10,000/student.

**App implication:** compliance module should support a **MO ⇄ TX state toggle** — MO actively tracks hours/subjects; TX relaxes to portfolio-only. Underlying data collection stays the same.

## Dad Lab (Charter, Mar 6, 2026)
"It's not school. It's the forge." Three pillars: **Wonder** ("What if…?") · **Build** ("Let's find out," artifact = evidence) · **Explain** ("Teach it back," Lincoln teaches London).

**Saturday 2-hour rhythm:** Gather (9:00, 10m) → Wonder (9:10, 10m) → Build/Explore (9:20, 45–60m) → Explain (10:15, 15m) → Reflect & Record (10:30, 15m) → Done (10:45).

**Lab types (rotating):** Science & Discovery · Engineering & Building · Adventure & Exploration · Heart & Character.
**Quarterly Rites (Heart Journey):** Q1 Expedition · Q2 Build · Q3 Service · Q4 Adventure.
**Feeds the engine:** artifacts → portfolio; hours → MO compliance (Science / Social Studies / PE by lab type); Lincoln's explanation recordings → speech-progress evidence.

## Stonebridge (narrative world)
Medieval-fantasy village at an old river crossing, slowly healing through honesty, service, and steady courage. Lincoln is the young rising hero. Places: Village Square, Old Bridge, Watchtower, Library Hut, Forge, Lantern Path, Beacon Hill, Banner Hall. Characters: Mara the Builder, Old Tomas, Captain Wren. Bible: `docs/STONEBRIDGE_BIBLE.md`; CF import: `functions/src/ai/stonebridgeBible.ts`. Foundation for the future Banner Rally mission layer.

## What's Not Built Yet — Priority Queue
1. Banner Rally missions (Hero Hub Phase 2) — adaptive reading missions in Stonebridge.
2. Restoration Map (Phase 2) — village repair nodes / progress map.
3. In-app character tuner (slider playground in production UX).
4. Curriculum scanning expansion (workbook photo → skill-mapping refinement).
5. Eval close-the-loop automation (re-eval triggers from engagement patterns).
6. Math evaluation parity (reading-style flow for math).
7. London-specific evaluation flow (age-adjusted UX).
8. Tier-up ceremony (armor shatter/reveal).
9. Screenshot & share (avatar → PNG).
10. Minecraft skin export (64×64).
11. Seasonal themes.
12. Faith Stats bars on `/avatar` (derivation pending Shelly review).

**Design Pass v1 queue** (mocks landed May 26, implementation queued): no-judge copy pass (step 1, partially applied) · Faith Stats bars · Behavior Log richer layout · Records table + State Checklist + PDF rail · Plan My Week split view · Hero Hub bigger scene · Knowledge Mine depth meter · Shelly AI "build a test" · Quest Complete celebration with mandatory mom-note.

## Drive Documents
- ✅ **Barnes Family Learning Charter v2.0** (Mar 27, 2026) — two identical copies in Drive (consider deleting one).
- ✅ **Dad Lab Charter** (Mar 6, 2026) — exists (⚠️ refers to London as she/her — see flags).
- ✅ **State Compliance Guide** (Draft 0.1, Mar 3, 2026) — exists.
- ❌ **Learner Profiles** — NOT CREATED. Child context lives in Charter "Commitment to Each Child" + `functions/src/ai/charterPreamble.ts` + MASTER_OUTLINE.
- ❌ **Shelly Feedback Action Plan** — NOT CREATED. Priorities live in MASTER_OUTLINE "What's Not Built Yet."
- ❌ **Kid Experience Design** — NOT CREATED. Philosophy in Charter "What We Don't Do" + MASTER_OUTLINE Key Design Decisions #12–#15.

## Doc Alignment Flags
- **Terminology:** Canonical is **My Hero / Hero Hub** (`/avatar`), NOT "My Armor." MASTER_OUTLINE v15 reframed it; the original runbook and older CLAUDE.md references to "My Armor"/"Hero Hub" should be reconciled to match the live nav label "My Hero."
- **London pronoun drift:** Dad Lab Charter (Mar 6) uses she/her; Charter v2 + MASTER_OUTLINE use he/him. **Canonical: he/him** — flag Dad Lab doc for cleanup. (See also `docs/LONDON_GENDER_VERIFY_2026-05.md`.)
- **Social Studies compliance gap:** not explicitly in the current plan; cover via read-alouds / Theme Engine / citizenship thread (see Compliance).
- **Stat drift:** computed commits = 118 on this branch; HEALTH_REPORT (2026-05-29) cites 122 (audit branch off main). MASTER_OUTLINE v15 header still references some v14-era figures; HEALTH_REPORT 2026-05-29 is the freshest numbers source.
- **Phase 1 docs present:** FINDINGS_PIPELINE.md, GAME_WORLD_ECONOMY.md, HEALTH_REPORT.md, and STONEBRIDGE_BIBLE.md all exist (the runbook marked several "may not exist yet" — they do).

## Current Sprint (last 20 commits)
- chore: update package-lock.json after npm install (health audit)
- chore: automated health audit 2026-05-29 — 5 stat fixes, 9 doc gaps resolved
- feat(books): Story Gen V2 Phase 2 PR-B — Per-Page Review surface
- chore: automated health audit 2026-05-29 — 7 stat discrepancies, 8 items need attention
- fix(monthly-review): include Dad Lab photos in curation
- diag(monthly-review): in-app diagnostic + Dad Lab schema fix + minutes unit
- docs(books): add Phase 2-P illustration persistence + resume design
- fix(voice): add explicit Done button during recording
- feat(voice): Phase 1 voice input module — Whisper-backed, per-child opt-in
- refactor(books): unify image generation across wizard and chat flows
- fix(books): restore per-page image generation in Generate Chat commit
- feat(books): confirm-first flow in Generate Chat before story generation
- feat(books): Story Gen V2 Phase 2 PR-A — Generate Chat surface
- chore(copy): apply no-judge vocabulary pass per audit (design-v1 step 1)
- docs(design-v1): no-judge copy pass audit for review
- docs(design-v1): record design pass + Faith Stats layering + no-judge vocab guardrail
- docs(design-v1): import design pass bundle
- Docs: Story Gen V2 design pivot — chat-based entry, split review surfaces
- Docs: correct generateStory context slices in SYSTEM_PROMPTS
</content>
</invoke>
