Barnes Family Homeschool — Master Project Outline v8 **Version:** v8 — March 22, 2026 **Status:** Living document — updated after architecture cleanup sprint Project Summary Homeschool management app for the Barnes family: Shelly (parent, fibromyalgia), Nathan (dad, builds the system), Lincoln (10, neurodivergent, speech challenges), London (6, loves drawing/stories). Both boys. **Tech:** React + TypeScript + Vite, Firebase (Auth, Firestore, Storage, Cloud Functions, Hosting), MUI, Anthropic Claude API, OpenAI DALL-E 3 (scenes + armor sheets) + gpt-image-1 (transparent stickers + photo transform). Repo: github.com/barnes-ngb/first-principles-engine Live: first-principles-engine.web.app Scale: 52k+ lines TypeScript, 30+ test files, 600+ tests, 32+ Firestore collections, 0 TS errors What's Built and Working Navigation Parent: Today, Plan My Week, Weekly Review, Progress, Records, Dad Lab, Settings Kid: Today, Knowledge Mine, My Books, My Armor, Dad Lab Today Page
* Plan-first layout with daily checklist
* Energy selector (Normal/Low/Overwhelmed → MVD mode)
* Week Focus card (theme, virtue, scripture, heart question)
* Teach Helper sparkle button per item → lesson card + print worksheet
* Engagement emoji feedback per completed item (😊😐😫❌)
* Per-item work capture (camera → photo → link to activity)
* Quick review/grading (manual note: "5/6 correct, missed #4")
* Quick Capture section (note, photo, audio)
* MVD mode (shows only essential items)
* XP awarded on all Must-Do completion (10 XP, once/day) Plan My Week
* Guided setup wizard (energy, workbooks, read-aloud, notes)
* AI-powered plan generation (Sonnet)
* Plan preview with per-item details, quick adjustment chips, chat-based adjustments
* Skip guidance per item from evaluation data + week skip summary
* Apply plan → daily checklists with subjectBucket tagging + auto-generate lesson cards
* Print Materials — per-day or all-week Minecraft-themed worksheet generation Evaluation Chat
* Shelly-guided reading diagnostic, AI walks through structured assessment levels
* Live findings panel, <finding> and <complete> block extraction
* Report view: skill map, frontier, recommendations, what to skip
* Apply to Skill Snapshot → updates priority skills + supports + stop rules
* Plan Week from Evaluation → carries findings into planner
* Download report as markdown, learning roadmap visualization
* Previous evaluations list
* XP awarded on Apply to Skill Snapshot (25 XP, once/session)
* Pattern Detection — after <complete>, second Sonnet pass analyzes last 5 sessions, identifies conceptual blocks (ADDRESS_NOW vs DEFER), surfaces in "Foundations" section of report and Skill Snapshot Knowledge Mine (Interactive Evaluation)
* Minecraft-themed reading quest, AI-generated adaptive MC questions
* 6 difficulty levels, adaptive pacing (3 correct → up, 2 wrong → down)
* Session limits: 10 questions, 8 minutes, frustration detection
* Word stimulus display — target word renders large and clear above answer options
* Text-only questions — no image-based question types (Phase 1)
* Question type variety — rotates through multiple formats per level (word ID, rhyming, sentence completion, sound matching, etc.)
* Auto-apply findings to skill snapshot on quest end
* AI-generated session summary + recommendations
* Quest → Planner pipeline — recommendations generated from findings, planner reads interactive sessions alongside guided evals
* Parent visibility in Evaluation History tab
* Phoneme display — simple /s/ /t/ /o/ /p/ notation at Levels 1-3 only, no IPA symbols
* End-on-a-win — bonus round question if last question is wrong, framed as "BONUS ROUND"
* 24 unit tests for adaptive logic
* Quest diamonds → 2 XP each → avatar progression
* Math Quest + Speech Quest shown as "coming soon" My Books (Book Builder + AI Story Generator)
* Bookshelf — filter tabs (All/My Stories/Generated/Sight Words), theme filter row (9 themes: Adventure, Animals, Family, Fantasy, Minecraft, Science, Sight Words, Faith, Other), 3-dot menu (Read/Edit/Print/Delete), auto-cover, sort drafts first
* Book Editor — page editor with text, photos, voice recording, speech-to-text dictation, AI scene generation ("Make a Scene"), sticker picker, drag-to-position images, text sizing (Big/Medium/Small), font family (Handwriting/Print/Pixel), page reorder, Together Book toggle, "Finish My Book" with cover picker
* AI Scene Generation — Claude Haiku rewrites prompts for copyright safety, DALL-E 3 generates scenes, 6 world styles (4 base + Garden Battle + Platformer World), world-type quick-pick chips
* Sticker Generation — gpt-image-1 transparent backgrounds, post-generation tagging (tags + Lincoln/London/Both profile), Sticker Library in Settings
* AI Book Generator — paste/guided story idea → Claude generates full story → DALL-E illustrates every page → progressive save → progress UI
* Story Guide — 5-question guided conversation replaces raw text input; questions read aloud via TTS; voice input with read-back confirmation; Lincoln's questions are action-oriented (Minecraft-themed), London's are imaginative; sight words auto-injected from skill snapshot; optional AI shaping step; hands off to generator
* Book Reader — full-screen swipeable page flipper, cover/content/back cover, audio playback, dot indicator, Edit + Print buttons
* Reading Session Tracking — timer starts on open, pages-viewed counter, reading session logged to hours on close, portfolio artifact created, 15 XP awarded once/book/day
* Sight Word System — all words tappable for TTS, tap for pronunciation + "I know this!", per-word mastery tracking (new → practicing → familiar → mastered), sound-it-out mode, Shelly override, SightWordDashboard
* Print — PDF via html2canvas + jsPDF, settings dialog (Letter/Half-letter/A4/Booklet, background options, sight word style), images via Firebase SDK getBlob, fixed 3:2 aspect ratio
* Book Organization — theme tags auto-inferred on generation, manual assignment in editor, additive filtering (type + theme)
* Sticker controls — move/rotate/z-index toolbar, edge boundary clamping, percentage-based position storage (stable on print/resize)
* Child-specific — Lincoln: Minecraft/dark theme, adventure worlds, 10 pages. London: storybook/cream/Fredoka, fairy/animal worlds, 6 pages
* Content violation handling — blocked prompts show upload/import guidance
* Sketch cleanup — client-side background removal for uploaded drawings
* Pinch-to-zoom — two-finger resize on tablet My Armor (Avatar + Armor of God Daily Ritual) — NEW
* Daily ritual — character starts bare each morning; child applies each earned piece; ghost outlines show what's waiting; visual tension → release
* 6-piece Armor of God progression (Ephesians 6): Belt of Truth (50 XP), Breastplate of Righteousness (150 XP), Shoes of Peace (300 XP), Shield of Faith (500 XP), Helmet of Salvation (750 XP), Sword of the Spirit (1000 XP)
* Tier system — Lincoln: Stone → Diamond → Netherite (all 6 stone → full set upgrades). London: Basic → Powerup → Champion
* Cohesive set generation — DALL-E 3 generates all 6 pieces as a single 3×2 reference sheet; client-side cropping (cropArmorSheet) gives each piece its individual image; matching art style, lighting, proportions guaranteed
* SVG icons — 6 hand-crafted vector icons (belt/buckle, breastplate/cross, boots/wing, shield/rays, helmet/visor, sword/crossguard); tier-colored variants (stone=brown/iron, diamond=blue/gold, netherite=dark/purple); locked state (30% opacity + padlock badge); applied state (green checkmark badge)
* Base character — DALL-E 3 generates bare character (no gear) once on first visit, saved to Firebase; Lincoln: blocky pixel warrior; London: cute platformer girl
* Verse card — full-screen card on piece tap; TTS auto-reads verse on open; word-by-word highlight synced to TTS via onboundary event; tap any word to hear/replay it; "Put it on!" button applies piece
* Attachment animation — piece icon flies from card to character body via portal-rendered arc animation; landing bounce (scale 1.2 → 0.9 → 1.0); particle burst at landing (squares for Lincoln, stars for London); character white flash; pose shift nudge; progressive glow via drop-shadow filter on character silhouette
* Full armor on! state — all earned pieces applied → maximum glow, idle sway animation, shimmer sweep, gold card borders, Web Audio fanfare (4-note chord, no audio files)
* Photo transform — upload photo → gpt-image-1 transforms into themed character style → saves as base character layer; armor overlays apply on top
* XP system — xpLedger collection, cumulative event log; dedup guards per source; 5 XP for completing daily armor ritual (once/day)
* Tier upgrade — all 6 pieces collected → full-set celebration, new tier sheet generates in parallel, before/after reveal
* Parent controls — Settings → Avatar & XP tab: add/subtract XP, delete pieces, reset avatar, force tier upgrade (testing), activity log
* Daily session — DailyArmorSession per child per date; resets at midnight; tracks applied pieces

### 3D Avatar — Armor of God System

**Route:** `/armor` (kid nav: "My Armor")

**3D Voxel Character (Three.js r128):**
* Minecraft-proportioned character (2:3:3 head:torso:legs ratio)
* Photo-based feature extraction → skin tone, hair color, hair style applied to character
* Programmatic 8×8 pixel face texture from extracted features (painted face)
* Lincoln: fair skin, medium brown tousled hair past ears, gray creeper shirt, navy shorts
* London: younger proportions (0.85 scale, larger head ratio)
* Idle animations: gentle bob, arm sway, blinking every 3-6 seconds
* Edge outlines on all blocks (Minecraft aesthetic)
* Dynamic lighting: warm key, cool fill, rim, bounce

**Armor Pieces (Ephesians 6):**
* 6 pieces: Belt of Truth, Breastplate of Righteousness, Shoes of Peace, Shield of Faith, Helmet of Salvation, Sword of the Spirit
* Each piece is 3D geometry sitting ON TOP of body parts
* Equip/unequip toggle via card tap
* Three visual states: equipped (solid), unlocked (ghost 15%), locked (ghost 6%)
* Equip animation: scale-in with glow + particle burst
* Open-face helmet design with helmet-compatible hair variant
* Sword blade always blue (Word of God) with emissive glow
* Shield with cross emblem and rim detail
* Arms pivot from shoulder — sword/shield are children of arm groups

**Tier Progression:**
* 7 tiers: Wood → Stone → Leather → Iron → Gold → Diamond → Netherite
* Each tier resets piece collection (recollect all 6 in new material)
* Tier thresholds: 0 / 100 / 250 / 500 / 1000 / 2500 / 5000 XP
* Weathering system with color variation per tier
* Platform color matches current tier

**6 Interactive Poses:**
* Victory, Shield Wall, Prayer, Wave, Battle Ready, Dab
* Keyframe animation engine with smooth interpolation
* Pose buttons + swipe to cycle + auto-pose on equip
* Smooth return to idle after pose completes

**TTS Scripture:** Web Speech API reads verse aloud on piece tap (0.85 rate)

**Touch Controls:** Single-finger drag rotation with momentum + friction, auto-rotate after 4s

**XP System:** xpLedger collection, separate tracks per child, checkAndUnlockArmor on XP change

Progress
* Ladders tab (skill progression), Engine tab, Milestones tab
* Skill Snapshot — priority skills, supports, stop rules, evidence definitions, workbook configs
* Conceptual Blocks — conceptualBlocks[] on Skill Snapshot from pattern detection; ADDRESS_NOW vs DEFER; plain language rationale + strategies
* "Evaluate Skills" button → evaluation chat Records
* Hours & Compliance — additive computation (day logs + hours entries + adjustments)
* Add Historical Hours backfill tool
* MO compliance dashboard (1000h total / 600h core), hours by subject
* Evaluations tab — AI evaluation history
* Portfolio tab — artifact gallery with photo thumbnails + audio playback Dad Lab
* Full lifecycle: Plan → Start → Lincoln Contributes → Nathan Completes
* "Suggest a Lab" AI, "I Have an Idea", "Plan a Lab" manual
* Kid view: prediction, explanation, photo + audio capture
* Artifact gallery, compliance hours auto-logged on completion Settings
* General family profile, AI usage dashboard
* Avatar & XP tab — parent XP controls, piece management, force tier upgrade
* Sticker Library tab — all generated stickers, tag editing, child profile assignment Cloud Functions (6 deployed, task registry pattern)
1. `chat` — Task registry routing to: plan, chat, evaluate, quest, generateStory
2. `analyzePatterns` — Standalone evaluation pattern analysis (extracted from chat)
3. `generateActivity` — Lesson card generation
4. `generateImage` — Task registry routing to: scene, armorSheet, sticker, photoTransform, avatarPiece, baseCharacter, starterAvatar
5. `weeklyReview` — Scheduled Sunday 7pm CT
6. `healthCheck` — Diagnostic AI Context Pipeline (task-specific slicing)
- Each task type receives only the context slices it needs (defined in contextSlices.ts)
- Plan/chat: full context (charter, child profile, skill snapshot, workbook configs, eval findings, compressed engagement, week focus)
- Evaluate: charter + child profile + sight words only
- Quest: child profile + skill snapshot + recent eval + quest recommendations from findings
- Planner reads both guided and interactive evaluation sessions
- Story generation: child profile + skill snapshot + week focus only
- Pattern analysis: child profile + skill snapshot + eval findings + conceptual blocks
- Engagement data compressed to summary format (reduces tokens ~60%)
- Token usage logged per task type to aiUsage collection Firestore Collections (31) families/{familyId}/ + children, weeks, days, artifacts, hours, hoursAdjustments, skillSnapshots, workbookConfigs, plannerConversations, lessonCards, avatarProfiles, dailyPlans, weeklyReviews, aiUsage, evaluationSessions, ladders, ladderProgress, milestoneProgress, sessions, projects, labSessions, weeklyScores, dadLabReports, books, bookPages, sightWordProgress, xpLedger, readingSessions, dailyArmorSessions, stickerLibrary, weeklyScores

* `avatarProfiles` — per-child avatar data (features, XP, tier, equipped pieces, customization)
* `xpLedger` — append-only XP event history per child

**Note:** xpEventLog merged into xpLedger (dedup via dedupKey field on ledger entries). Interactive quest sessions stored in `evaluationSessions` with `sessionType: 'interactive'` field. What's Built but Untested with Real Users
* Weekly Review (needs full week of data)
* Print materials (quality varies — book PDFs and worksheets)
* Skip guidance (depends on evaluation data quality)
* Lincoln's kid Today view (Must-Do/Choose flow — needs real week)
* Knowledge Mine reading quest — core bugs fixed Mar 22, needs Lincoln to verify question quality + adaptive pacing + XP accumulation
* My Books full flow (needs Shelly + kids — AI story gen, sight word tracking, reading sessions)
* Story Guide handoff to generator (questions work, generator handoff unverified)
* Book theme filter row on bookshelf (auto-tagging unverified)
* Evaluation pattern detection — Foundations section (needs 2+ prior evals, not yet tested)
* Armor piece overlays on character (in flight — overlay prompt just run)
* Avatar XP adjustment (Firestore undefined error — fix prompt run, needs verification)
* Armor attachment animation + verse TTS sync (prompt written, not yet run)
* Tier-up animation (crossing tier boundaries)
* London's avatar (younger proportions, separate XP)
* Customization UI (dye colors, emblems, crests)
* AvatarThumbnail on other pages
* Parent XP management UI
* Auto-XP from checklist/quest/book completion What's Not Built Yet Priority Queue (ready to prompt)
* Lincoln Development Chat — dedicated AI chat mode reviewing evaluations, skill snapshot, recent progress → recommends what to work on this week
* Planning improvements — activity ideas mode, engagement-based suggestions, individual time adjustments, better day generation
* Docs update — this outline (v6) needs to go into the repo as docs/MASTER_OUTLINE.md Knowledge Mine Phase 2-4
* Phase 2: Voice input (Web Speech API) + type-to-answer questions
* Phase 3: Pre-generated question bank (zero latency)
* Phase 4: Full avatar integration (quest → mine → armor XP)
* Parent review view for interactive sessions in Records
* Math Quest + Speech Quest domains Avatar System — Remaining
* **Parent XP Management** — Quick award buttons, XP history, tier-up notifications (HIGH)
* **Tier-Up Animation** — Old armor shatters, new tier announced, ghost pieces appear (HIGH)
* **London's Avatar** — Younger proportions, separate profile, own photo/features (HIGH)
* **AvatarThumbnail** — Compact 3D preview for Today page header, nav sidebar, Knowledge Mine (MEDIUM)
* **Customization UI** — Dye colors (Stone+), shield emblems (Iron+), helmet crests (Iron+), enchantment glow (Gold+), cape (Gold+), particle effects (Diamond+) (MEDIUM)
* **Auto-XP Wiring** — Checklist items, quests, books auto-award XP (MEDIUM)
* **Daily Armor Session** — Track which pieces equipped today, streak tracking (LOW)
* **Avatar in Knowledge Mine** — Character celebrates correct answers (LOW)
* **Pet companion** — Minecraft-style wolf/cat/parrot follows character (LOW) Avatar Phase 2
* Memorization mode on verse card (hide words, speak from memory, major XP reward)
* Daily streak counter
* Piece order guidance (canonical Ephesians 6 order hints)
* Kid-friendly verse explanation (1-sentence plain language, Shelly-editable)
* Nathan notification on tier upgrade
* Verse progress tracking (reads → memorized gold star) My Books Backlog
* Evaluation → Sight Words pipeline (findings auto-populate word list, already partially built via Story Guide injection)
* Collaborative "Read to London" mode (Lincoln reads aloud, London follows highlighted words)
* Improved AI story quality (longer, more varied sentences) Planned Features
* Math evaluation chat
* Speech evaluation chat
* London's learner profile and evaluation
* Adaptive loop closing (evaluate → plan → teach → re-evaluate automatically)
* Heart Journey tracker (quarterly rites)
* YouTube integration in Teach Helper
* Google Calendar integration for field trips Brainstorm Backlog (March 16, 2026)
* London's Game Builder (Mario Maker-style level designer)
* Field trip / activity research (Kansas City area homeschool finder)
* Custom Lincoln/London Minecraft avatars (pixel art, child-specific face/features)
* Photo transform improvements (better pose matching) Deferred
* Multi-family support
* Mobile app (web-only for now)
* Co-op integration, full curriculum database
* Automated worksheet grading (AI vision) Sprint History Sprint Date What A Mar 3-4 Core pipeline fixes (Firebase, AI planner, date bugs, MVD) B Mar 4 Data richness (workbook configs, energy selector, enriched chat) C Mar 4-5 UX cleanup (nav consolidation, plan quality, Today layout) Planning Mar 5 Lesson card fixes, guided setup wizard, auto-generate on Apply P0 Bugs Mar 5 Generate failures, 0m planned, stale items, week theme display Evaluation Mar 5-6 Reading diagnostic chat, findings extraction, Apply to Snapshot Dad Lab Mar 6-7 Charter, capture page, lifecycle, kid view, artifact gallery Hours Mar 7-9 Additive computation, backfill tool, clear test data D1-D4 Mar 9 Engagement emoji, print materials, skip guidance, per-item capture Worksheets Mar 14 Improved worksheet generation, per-item print from Teach Helper Knowledge Mine Mar 15 Interactive quest Phase 1: MC reading quest, adaptive leveling E1 Mar 15 Quest loop fixes, adaptive logic, 24 unit tests E2 Mar 15 Diamonds → XP → Avatar (XP ledger, armor tiers, KidTodayView bar) E3-E5 Mar 15-16 My Books core: editor, AI scene gen, finish flow, reader, reorder Infra Mar 16 Storage rules, deploy pipeline, Firestore indexes, signed URL fix Sticker Mar 16 gpt-image-1 transparent stickers SightWord Mar 16 Sight word reader, mastery tracking, dashboard, AI story generator Print Mar 16 PDF fix, settings dialog, NaN fix London Mar 16 London theming, child-aware generation, content violation helpers Fixes Mar 16 Progressive save, reading tracking, tappable words, sketch cleanup, pinch-to-zoom (#353-357) F1 Mar 21 Armor of God daily ritual system (full rewrite): verse card, daily reset, tier progression, DALL-E sheet generation, client-side crop, parent controls F2 Mar 21 Armor fixes: XP undefined error, duplicate children selector, base character regen prompt F3 Mar 21 Armor overlays: CharacterDisplay layering, percentage positions, fly animation scaffolding F4 Mar 21 Book editor polish: sticker toolbar, edge clamping, London card max-width, percentage-based sticker positions F5 Mar 21 Story Guide: 5-question TTS-driven wizard, sight word injection, AI shaping, generator handoff F6 Mar 21 Book organization: 9 themes, filter row, sticker tagging, Sticker Library in Settings F7 Mar 21 Evaluation pattern detection: Foundations section, conceptual blocks, Skill Snapshot integration F8 Mar 21 Cohesive armor set: DALL-E 3×2 sheet, cropArmorSheet utility, bigger cards, readable text F9 Mar 21 Armor animation UX: SVG icons (6 pieces), fly-to-body animation, landing impact + particles, pose shift, progressive glow, full armor on! state, word-by-word TTS verse sync
Avatar v1 Mar 15 2D crop-based armor overlay (REPLACED)
Avatar System Mar 15-20 My Armor ritual, XP system, armor generation, verse cards, animations, photo transform, parent controls
Books + Stories Mar 16-19 Story guide wizard, book editor polish, book organization, sticker library, evaluation pattern detection
Avatar v2 Mar 21 3D voxel character, basic armor equip
Avatar v3 Mar 21 Minecraft proportions, edge outlines, platform, tier colors
Avatar v4 Mar 21 Iron tier weathering, Lincoln likeness, ghost armor
Architecture Cleanup Mar 21 Split domain.ts (1336→8 files), merge xpEventLog into xpLedger, task registry pattern for Cloud Functions, AI context slicing (task-specific), perf instrumentation, Firestore audit
Avatar v5 Mar 22 Poses (6), pixel face, helmet redesign, arm clipping fixes
Avatar Audit Mar 22 Memory leak fix, event listener cleanup, camera auto-frame, XP bar fix
Mine/Eval Engine Mar 22 Quest display fixes (word stimulus, text-only, question variety), XP pipeline (quest→ledger→avatar), eval pipeline (findings→snapshot→planner recommendations), phoneme simplification, end-on-a-win Key Design Decisions
1. Portfolio over grades — no scores, no rankings, evidence-based assessment
2. No shame rule — MVD is real school, bad days count, app never makes Shelly feel like failing
3. Formation first — prayer/scripture before academics every day
4. Lincoln teaches London — Feynman technique, builds confidence + speech practice
5. Evaluate before plan — know the frontier, then every minute counts
6. Print the stack — Shelly needs physical materials, not just a digital checklist
7. Engagement > completion — tracking HOW it went, not just IF it got done
8. Additive hours — all sources counted (day logs + hours entries + adjustments)
9. Dad Lab is separate — different rhythm, different goals, Nathan's domain
10. Minecraft framing — Lincoln's language, not school language
11. Interactive eval = learning — quest sessions are BOTH assessment AND practice
12. Diamonds, not scores — "You mined 8 diamonds" not "You got 80%"
13. Scene-first workflow — AI generates illustrated worlds, kids provide their own characters via upload
14. Reading = building — every book read logs hours and creates a portfolio artifact automatically
15. Words are learnable anywhere — tap any word in any book for pronunciation; mastery tracked passively
16. Armor is devotional, not decorative — daily ritual of putting on each piece teaches scripture through repetition and embodiment
17. Cohesive generation — when multiple visual assets share a theme, generate together for visual consistency (armor sheets, not individual pieces)
18. Quest variety over repetition — AI rotates question types within a session, never same format twice in a row
19. End on a win — quest always finishes with success, bonus round if needed
20. 3D over 2D — 2D image cropping for armor overlay failed (alignment impossible between two AI-generated images). 3D voxel geometry solves alignment permanently.
21. Tier reset = always earning — each tier resets piece collection so there's always 6 pieces to earn. Prevents "I have everything" at 1000 XP.
22. Open-face helmet — Lincoln's face must be visible through the helmet. Identity > armor coverage.
23. Arms pivot from shoulder — sword/shield are children of arm groups, not the character root. Poses animate arms and weapons move naturally.
24. Painted face > photo pixelation — client-side photo-to-8×8 pixelation creates zombie/camo artifacts. Programmatic face painting from extracted features is reliable.
25. Poses are formation moments — Prayer pose (arms together, head bowed, eyes closed) is intentionally included. The armor is spiritual, not violent. Key Files Reference src/app/AppShell.tsx — nav structure (parent + kid) src/app/router.tsx — all routes src/core/types/domain.ts — ALL data types src/core/firebase/firestore.ts — ALL collection references src/core/ai/useAI.ts — chat + generateImage hooks src/core/xp/addXpEvent.ts — XP writer with dedup guards src/core/xp/checkAndUnlockArmor.ts — tier unlock + sheet generation trigger src/core/avatar/getDailyArmorSession.ts — daily reset logic src/core/avatar/cropArmorSheet.ts — client-side 3x2 sheet cropper functions/src/ai/chat.ts — AI pipeline (plan/evaluate/quest/generateStory/analyzePatterns) functions/src/ai/imageGen.ts — DALL-E 3 + gpt-image-1 + Haiku rewriter src/features/avatar/ — My Armor (MyAvatarPage, VerseCard, ArmorIcons, AttachAnimation, CharacterDisplay, Particles) src/features/books/ — My Books (22+ files, 6500+ lines) src/features/quest/ — Knowledge Mine (7 files) src/features/today/ — Today page src/features/records/ — Records + compliance src/features/settings/ — Settings (AvatarAdminTab, StickerLibraryTab) src/core/types/                         — split type files (common, family, planning, evaluation, xp, books, compliance, dadlab)
src/core/types/index.ts                 — barrel re-export (replaces old domain.ts)
src/core/utils/perf.ts                  — performance measurement helpers
functions/src/ai/tasks/                 — chat task registry (plan, chat, evaluate, quest, generateStory, analyzePatterns)
functions/src/ai/imageTasks/            — image task registry (7 handlers)
functions/src/ai/contextSlices.ts       — task-specific context assembly + engagement compression
docs/FIRESTORE_AUDIT.md                — Firestore collection + index audit (March 21, 2026)
docs/MASTER_OUTLINE.md — this file (update after each session) .github/workflows/deploy.yml — CI/CD pipeline

### Architecture Notes

#### Avatar / Three.js Architecture
- Three.js scene lifecycle managed in a single React component with `useEffect` cleanup
- `initScene` callback decoupled from re-render cycle (intentional `eslint-disable`)
- `enforceArmorOpacity` runs every frame — could optimize to on-change only
- Character and armor meshes stored in `useRef` (not React state)
- `equippedPieces` React state → `useEffect` syncs to Three.js mesh materials
- Consider extracting Three.js lifecycle into custom `useThreeScene` hook
- `DailyArmorSession` and `AvatarProfile` both track equipped pieces — potential drift

Architecture Review Notes (March 21, 2026) The following areas are flagged for architecture review in the next chat session:
* XP system — xpLedger + xpEventLog as separate collections; dedup guard pattern; whether totalXp should be cached on avatarProfile or always summed from ledger
* Avatar generation costs — DALL-E 3 sheet generation per tier per child; when to generate vs cache; cost implications at scale
* Cloud Function sprawl — chat function handles 6+ task types; generateImage handles 4+; whether these should be split into separate functions
* Firestore collection count — 32+ collections; some may be better as subcollections; composite index requirements growing
* Client-side image processing — cropArmorSheet, sketch cleanup, and print PDF all do heavy canvas work client-side; perf on low-end devices
* AI context pipeline size — system prompt includes many data sources; token cost and latency implications
* Type safety — domain.ts is the single source of truth; growing large; worth splitting by feature domain? Last updated: March 22, 2026
