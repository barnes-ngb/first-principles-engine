Barnes Family Homeschool — Master Project Outline v15 **Version:** v15 — April 1, 2026 **Status:** Updated — Shelly Chat context tabs (Lincoln/London/General), deep child context loading, follow-up suggestions, markdown rendering Project Summary Homeschool management app for the Barnes family: Shelly (parent, fibromyalgia), Nathan (dad, builds the system), Lincoln (10, neurodivergent, speech challenges), London (6, loves drawing/stories). Both boys. **Tech:** React + TypeScript + Vite, Firebase (Auth, Firestore, Storage, Cloud Functions, Hosting), MUI, Anthropic Claude API, OpenAI DALL-E 3 (scenes + armor sheets) + gpt-image-1 (transparent stickers + photo transform). Repo: github.com/barnes-ngb/first-principles-engine Live: first-principles-engine.web.app Scale: ~100k lines TypeScript (src/ ~91k + functions/ ~9k), 52 test files, 600+ tests, 113 commits, 28 Firestore collections, 18 Cloud Functions, 13 chat task types, 0 TS errors What's Built and Working Navigation Parent: Today, Plan My Week, Weekly Review, Progress, Records, Dad Lab, Settings Kid: Today, Knowledge Mine, Game Workshop, My Books, My Armor, Dad Lab Today Page
* Plan-first layout with daily checklist
* Energy selector (Normal/Low/Overwhelmed → MVD mode)
* Week Focus card (theme, virtue, scripture, heart question)
* Teach Helper sparkle button per item → lesson card + print worksheet
* Engagement emoji feedback per completed item (😊😐😫❌)
* Per-item work capture (camera → photo → link to activity)
* Quick review/grading (manual note: "5/6 correct, missed #4")
* Quick Capture section (note, photo, audio)
* MVD mode (shows only essential items)
* XP awarded on all Must-Do completion (10 XP, once/day)
* Teach-Back prompt (parent view) — "Teach London" card appears after 3+ items completed or 50% must-do. Text capture, tags as Explain engine stage.
* Teach-Back prompt (kid view) — Lincoln gets "I Taught London!" button with subject chips + audio recording. No text input — respects speech/writing challenges.
* Extra Activity Logger (kid view) — "I Did More Mining!" lets Lincoln log tablet time (Reading Eggs, Math App, etc.) with activity + duration chips. All taps, no typing. Adds to checklist as completed item, counts toward hours and teach-back trigger.
* Weekly Conundrum card — expandable discussion scenario from week plan
* Chapter Question card — Stonebridge narrative question from unified weekly focus
* **SectionErrorBoundary** — per-section crash isolation prevents one broken section from taking down the whole page
* **Evaluation nudge** — planner shows nudge when no skill snapshot exists
* **Skip guidance display** — Parent checklist shows per-item AI skip/focus notes color-coded (green for mastered/skip, amber for frontier/focus, grey for info). Not shown in kid view.
* **Minutes-logged indicator** — Today checklist shows tracked minutes per item
* **HelpStrip guidance** — contextual help on Records, Weekly Review, and Progress pages
* **Per-child materials theming** — Lincoln gets Minecraft-themed worksheets, London gets story/adventure-themed worksheets
* **Decomposition (completed):** TodayPage shell (816L) + TodayChecklist (720L) + QuickCaptureSection (285L) + WeekFocusCard (163L) + TeachBackSection (97L) + ChapterQuestionCard (60L) + ReadingRoutineItems + MathRoutineItems + SpeechRoutineItems + RoutineSection + ExplorerMap + WorkshopGameCards + KidCaptureForm + CreativeTimeLog + LadderQuickLog + HelperPanel
* **Kid Today View decomposition (completed):** KidTodayView shell + KidChecklist (484L) + KidTeachBack (167L) + KidChapterResponse (159L) + KidConundrumResponse (209L) + KidExtraLogger (163L) + KidCelebration (117L)
* **Diamonds Mined card** — Kid Today shows today's quest summary (diamonds, level, domain, streak) or "Ready to mine?" invite with navigation to Knowledge Mine
* **Scheduled evaluations** — Knowledge Mine and Fluency Practice are scheduled as real checklist items in the weekly plan. Evaluation items have `itemType: 'evaluation'` and `evaluationMode` fields. Blue left border distinguishes them from workbook items. "Start Mining" button navigates directly to Knowledge Mine. Quest/fluency completion auto-marks the matching evaluation item as done with actual minutes logged. Evaluation time counts toward subject hours (Reading or Math).

### Curriculum Photo Scanning
* ScanButton component — camera capture of workbook/worksheet pages
* ScanResultsPanel — AI analysis results display
* Cloud Function: `chat` with `taskType: 'scan'` — Claude analyzes photo for curriculum content
* Scan records saved to `families/{familyId}/scans`

Plan My Week
* Page title "Plan My Week" with subtitle "Set up your week, review the plan, and you're done."
* **Auto-suggested Week Focus** — AI pre-fills theme, virtue, scripture, heart question on page load (editable)
* **Compact setup for returning users** — energy selector, routine shown read-only with Edit option, workbooks as chips, special notes field. Full wizard only on first visit.
* **Per-subject default times** — configurable minutes per subject (Reading: 30m, Math: 30m, etc.), saved per child, used as AI baseline
* AI-powered plan generation (Sonnet) with full enriched context (snapshot, workbooks, evaluation findings, engagement data, subject defaults)
* **Full-width plan preview** — renders outside chat area, day cards with Must-Do / Choose sections clearly labeled
* Single set of quick adjustment chips (tap to apply immediately) + chat-based free-form adjustments
* Skip guidance per item from evaluation data + week skip summary + per-item skipGuidance color-coded on parent Today checklist (green=skip, amber=focus, grey=info; not shown in kid view)
* Completed program exclusion — workbooks marked complete or matching completedPrograms are filtered from plan generation context
* Recent scans context — planner receives last scan position per workbook to know what lesson to assign next
* Plan generation intent detection — typing "generate a plan" in chat redirects to proper generation path
* Robust JSON parsing — handles code-fenced responses, truncated JSON, fallback recovery
* "Lock In This Plan" button → daily checklists with subjectBucket tagging + auto-generate lesson cards
* "Go to Today →" shortcut after applying
* Print Materials — per-day or all-week Minecraft-themed worksheet generation
* "Repeat Last Week" shortcut for low-energy weeks
* **Evaluation scheduling** — AI planner auto-includes Knowledge Mine and Fluency Practice sessions in the Choose section based on child's Skill Snapshot (emerging/not-yet skills). Max 1 quest + 1 fluency per day, spread across the week, not on heavy days (230m+).
* AI feature flag defaults to ON (no manual Settings toggle needed)
* Weekly Conundrum — AI-generated open-ended discussion scenario tied to week theme/virtue/subjects. No right answer. Separate prompts for Lincoln (deeper) and London (simpler). Saved to week plan, visible on Today.
* **Explicit daily item ordering** — AI prompt enforces: Formation → Core Reading → Core Math → Read-Aloud → Support Skills → Apps → Enrichment. Reading right after Scripture gets highest-energy slot.
* **Daily variation / rotation** — Support skills (handwriting, sight words, booster cards, memory cards, language arts) rotate across the week (2-3 days each) instead of appearing identically every day. Monday is fullest, Friday is lightest.
* **Day-aware time budgets** — Mon/Tue full day (3-3.5h), Wed/Thu standard (2.5-3h), Friday lighter (2-2.5h). Item count adjusts to fit.
* **Read-aloud as distinct block** — Family read-aloud book (e.g. Narnia) placed after core academics, before support skills, with chapter question in contentGuide field.
* **Plan My Week decomposition (completed):** PlannerChatPage (2,112L) + PlannerSetupWizard (201L) + WeekFocusPanel (88L) + PlanDayCards (104L) + PlannerChatMessages (65L). Render reduced 800→500L; state management still unified in main page.

Evaluation Chat
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
* Quest summary ethos fix — "questions explored" not "correct/total" (disposition over content mastery)
* Math Quest enabled (was "coming soon"), Speech Quest still coming soon
* **Skill Snapshot → Quest pipeline** — quest context slices include skillSnapshot; adaptive start reads priority skills, emerging/secure levels, stop rules, and conceptual blocks
* **Skill Snapshot → Planner pipeline** — plan context slices include skillSnapshot with calibration guidance (skip Secure, practice Emerging, direct-instruct Not Yet, ADDRESS_NOW blocks)
* **Pattern detection from quest sessions** — after endSession, if 3+ evaluation sessions exist, fires analyzeEvaluationPatterns (non-blocking) to detect conceptual blocks
* **Word completion blank validation** — prompt rules require blank count === answer length; client-side `validateQuestion()` rejects mismatched questions before display
* **TTS on math questions** — auto-reads question text on appear; tap prompt or options to replay; mute toggle in header; reading quest TTS is selective (reads prompt for word-ID/rhyming, but not word-completion stimulus)
* **Struggling words display fix** — summary shows reconstructed target words (not raw blanked stimuli)
* 30 unit tests for quest helpers (including 6 new validateQuestion tests)

### Story Game Workshop
- Kid nav item → `/workshop` route (London's creative space)
- **Three game types:** 🎲 Board Games, 📖 Choose-Your-Adventure, 🃏 Card Games
- **Voice-first guided wizard** with read-aloud tiles (tap to hear, tap again to select)
  - Game Type → Theme → Players → type-specific steps
  - TTS prompts at every step (SpeechSynthesis API)
  - Keyboard dictation for text input (native device mic)
  - Draft auto-save — resume wizard at last completed step
- **Player selection** pulls real family members:
  - Lincoln/London use Minecraft avatars from `avatarProfiles`
  - Mom/Dad get DALL-E generated themed tokens
  - London auto-selected as Story Keeper (always plays)
- **Board Games:** CSS Grid snaking path, 15/25/35 spaces, challenge cards (Reading/Math/Story/Action), boss challenges, bonus/setback/shortcut spaces
- **Choose-Your-Adventure:** AI-generated branching story tree, 2-3 choices per node, no dead ends (retry endings), embedded challenges at nodes, scene illustrations via DALL-E
- **Card Games (3 mechanics):** Matching (Memory), Collecting (Go Fish), Battle (War+). 20-30% of cards have embedded learning elements.
- **DALL-E art generation** in parallel during wizard completion:
  - Board backgrounds, title screens, per-type challenge card art, parent tokens, adventure scene illustrations, card game faces/backs
  - `Promise.allSettled` — partial failures graceful, CSS/emoji fallbacks
  - "Regenerate Art" retry for failed generations
- **Polished play experience:**
  - Animated dice roll, space-by-space token movement, 3D card flip reveals
  - Boss challenge dramatic reveal (screen shake, glow border)
  - Sound effects throughout (dice, cards, success, bonus, setback, game over fanfare)
  - Confetti celebration on game completion
  - Mute toggle for sound effects (TTS stays on)
- **London voice recording** — optional post-creation step:
  - Records his voice for any card/node via MediaRecorder API
  - Plays back during game INSTEAD of TTS
  - 🎤 badge on games with recordings
  - Reusable `useAudioRecorder` hook
- **Lincoln Playtester:**
  - Dedicated Playtest mode — goes through ALL cards/nodes
  - Per-item feedback: 👍🤔😬😴🔄 with text/audio comments
  - London reviews flagged items, "Fix It" or "Keep It"
  - AI-assisted card fixes
  - Version tracking + revision history
- **Cross-device visibility** — all family members see all games
- **Save/resume** — in-progress game state persists, "Pick up where you left off?" prompt
- **Today page integration:**
  - "London made a new game!" card for unplayed games
  - "Continue [Title]?" card for in-progress games
- **Hours logging** split proportionally by challenge card types
- Completed games saved as portfolio artifacts
- My Games gallery with type icons (🎲📖🃏), title art thumbnails, play count
- Cloud Function: `chat` with `taskType: 'workshop'` (board/adventure/card gen + card fixes)
- Saves to `families/{familyId}/storyGames/{gameId}`

My Books (Book Builder + AI Story Generator)
* Bookshelf — filter tabs (All/My Stories/Generated/Sight Words), theme filter row (9 themes: Adventure, Animals, Family, Fantasy, Minecraft, Science, Sight Words, Faith, Other), 3-dot menu (Read/Edit/Print/Delete), auto-cover, sort drafts first
* Book Editor — page editor with text, photos, voice recording, speech-to-text dictation, AI scene generation ("Make a Scene"), sticker picker, drag-to-position images, text sizing (Big/Medium/Small), font family (Handwriting/Print/Pixel), page reorder, Together Book toggle, "Finish My Book" with cover picker, Edit Background floating toolbar (Change/Remove) over background images, title edit visual affordance (pencil icon + dashed underline)
* AI Scene Generation — Claude Haiku rewrites prompts for copyright safety, DALL-E 3 generates scenes, 6 world styles (4 base + Garden Battle + Platformer World), world-type quick-pick chips
* Sticker Generation — gpt-image-1 transparent backgrounds, post-generation tagging (tags + Lincoln/London/Both profile), Sticker Library in Settings, hardened Claude Haiku rewriter with explicit character-to-visual-description examples (handles Mario/Pikachu/Elsa/etc.), regex fallback strip when rewriter unavailable, friendly error messages on content policy blocks, "Try Again" preview before saving (re-generate or tweak prompt), Upload Sticker from camera/photos
* AI Book Generator — paste/guided story idea → Claude generates full story → DALL-E illustrates every page → progressive save → progress UI. Story prompt enforces copyright name avoidance (copyrighted characters auto-replaced with original archetypes)
* Story Guide — 5-question guided conversation replaces raw text input; questions read aloud via TTS; voice input with read-back confirmation; Lincoln's questions are action-oriented (Minecraft-themed), London's are imaginative; sight words auto-injected from skill snapshot; optional AI shaping step; hands off to generator
* Book Reader — full-screen swipeable page flipper, cover/content/back cover, audio playback, per-page TTS read-aloud (Web Speech API, 0.85x rate for kids), dot indicator, Edit + Print buttons
* Reading Session Tracking — timer starts on open, pages-viewed counter, reading session logged to hours on close, portfolio artifact created, 15 XP awarded once/book/day
* Sight Word System — all words tappable for TTS, tap for pronunciation + "I know this!", per-word mastery tracking (new → practicing → familiar → mastered), sound-it-out mode, Shelly override, SightWordDashboard
* Print — PDF via jsPDF, settings dialog (Letter/Half-letter/A4/Booklet/Mini-5×7/Square-6, background options, sight word style), images via Firebase SDK getBlob, aspect-ratio-locked (3:2) image container matching editor + reader exactly (percentage-based sticker positions map 1:1), PDF clipping rect on image container to match reader `overflow:hidden` (prevents sticker drift in mini-book/narrow formats), cover-fit for scene images, contain-fit for stickers, dynamic font sizing with overflow guard (scaled down for narrow page formats)
* Book Organization — theme tags auto-inferred on generation, manual assignment in editor, additive filtering (type + theme)
* Sticker controls — move/rotate/flip H/flip V/z-index toolbar, edge boundary clamping, percentage-based position storage (stable on print/resize). Rotation + flip persists to reader and PDF print via CSS transforms and jsPDF rotation/canvas flip
* Child-specific — Lincoln: Minecraft/dark theme, adventure worlds, 10 pages. London: storybook/cream/Fredoka, fairy/animal worlds, 6 pages
* Content violation handling — blocked prompts show upload/import guidance
* Sketch cleanup — client-side background removal for uploaded drawings
* Pinch-to-zoom — two-finger resize on tablet My Armor (Avatar + Armor of God Daily Ritual) — NEW
* Daily ritual — character starts bare each morning; child applies each earned piece; ghost outlines show what's waiting; visual tension → release
* 6-piece Armor of God progression (Ephesians 6): Belt of Truth (50 XP), Breastplate of Righteousness (150 XP), Shoes of Peace (300 XP), Shield of Faith (500 XP), Helmet of Salvation (750 XP), Sword of the Spirit (1000 XP)
* Tier system — Lincoln: Stone → Diamond → Netherite (all 6 stone → full set upgrades). London: Basic → Powerup → Champion
* Cohesive set generation — DALL-E 3 generates all 6 pieces as a single 3×2 reference sheet; client-side cropping (cropArmorSheet) gives each piece its individual image; matching art style, lighting, proportions guaranteed
* SVG icons — 6 hand-crafted vector icons (belt/buckle, breastplate/cross, boots/wing, shield/rays, helmet/visor, sword/crossguard); tier-colored variants (stone=brown/iron, diamond=blue/gold, netherite=dark/purple); locked state (30% opacity + padlock badge); applied state (green checkmark badge)
* Base character — DALL-E 3 generates bare character (no gear) once on first visit, saved to Firebase; Lincoln: blocky pixel warrior; London: cute platformer boy
* Verse card — full-screen card on piece tap; TTS auto-reads verse on open; word-by-word highlight synced to TTS via onboundary event; tap any word to hear/replay it; "Put it on!" button applies piece
* Attachment animation — piece icon flies from card to character body via portal-rendered arc animation; landing bounce (scale 1.2 → 0.9 → 1.0); particle burst at landing (squares for Lincoln, stars for London); character white flash; pose shift nudge; progressive glow via drop-shadow filter on character silhouette
* Full armor on! state — all earned pieces applied → maximum glow, idle sway animation, shimmer sweep, gold card borders, Web Audio fanfare (4-note chord, no audio files)
* Photo transform — upload photo → gpt-image-1 transforms into themed character style → saves as base character layer; armor overlays apply on top
* XP system — xpLedger collection, cumulative event log; dedup guards per source; 5 XP for completing daily armor ritual (once/day)
* Tier upgrade — all 6 pieces collected → full-set celebration, new tier sheet generates in parallel, before/after reveal
* Parent controls — Settings → Avatar & XP tab: add/subtract XP, delete pieces, reset avatar, force tier upgrade (testing), activity log
* Daily session — DailyArmorSession per child per date; resets at midnight; tracks applied pieces
* **MyAvatarPage decomposition (completed):** MyAvatarPage (1,234L) + ArmorPieceGallery (271L) + ArmorVerseCard (169L) + AvatarPhotoUpload (250L) + AvatarHeroBanner (199L) + AvatarCharacterDisplay (288L) + ArmorSuitUpPanel (296L) + AvatarCustomizer (133L) + speakVerse (19L)

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

**Two-Currency Economy (v1):**
* **XP** (experience) — progression currency, never decreases. Unlocks tier access.
* **Diamonds** — inventory currency, earned from active effort, spent to forge armor and buy cosmetics.
* Both stored in xpLedger with `currencyType` field ('xp' | 'diamond')
* Diamond balance computed from ledger sum (positive = earn, negative = spend)
* Active effort (quests, teach-back, Dad Lab, workshops, conundrums) earns both XP + Diamonds
* Routine activities (daily checklist, armor ritual) earn XP only

**Choice-Based Armor Forging:**
* XP unlocks the TIER (access to forge pieces in that material)
* Lincoln chooses which piece to forge and pays diamonds
* Each forge includes verse engagement (response chips or audio recording)
* Forge costs scale by tier: Wood (5-10), Stone (15-30), up to Netherite (120-200) per piece
* ArmorVerseCard shows verse prompt + "Why does a warrior need [piece]?" + forge button

**Tier Biomes:**
* Wood = Stonebridge Village, Stone = The Caves, Iron = The Mountains
* Gold = The Desert Temple, Diamond = The End, Netherite = The Nether
* Portal transition moment when completing a tier's armor set (all 6 forged + next tier XP reached)
* Subtle background tinting per active biome

**XP + Diamond HUD:**
* XpDiamondBar component: green Minecraft-style XP progress bar + cyan diamond count
* Shown on Kid Today view and My Armor page
* Diamond count with bump animation on balance increase

### Creative Time Tracking
- "Start creating" timer on Bookshelf, Book Editor, My Stuff pages
- Auto-logs to hours system (Art, Language Arts, Math, Practical Arts subject buckets)
- 5-minute minimum threshold
- Persists across navigation via localStorage
- Entries appear in Records with 'auto-tracked' indicator

### Print-Ready Mini-Book PDF
- Print options dialog: format (full page / mini-book), background color, cover options
- Mini-book format: 5.5x8.5" staple-ready booklet with cover page
- Fixed CORS image rendering (fetch as blob → base64 embed)
- White background default (ink-saving for physical product printing)
- jsPDF direct generation replaces html2canvas approach
- Sticker rotation fix: jsPDF rotates around bottom-left (not top-left); corrected `adjustForCenterRotation` so stickers rotate in-place matching CSS `transform-origin: center`
- Sticker overflow clipping: PDF clip rect (`beginClipRect`) + position clamping prevents stickers from rendering outside the image container in all PDF viewers
- All print formats maintain 3:2 image container aspect ratio matching the BookReader
- Dynamic font sizing for narrow page formats (half-letter, mini-5x7) prevents text clipping

### Sketch-to-Story Pipeline
- "Add my drawing" camera capture on book page editor
- London photographs paper drawings → become page illustrations
- "Make it fancy" AI enhancement via DALL-E (original + enhanced saved)
- Side-by-side comparison — child picks which version
- Standalone "Capture Drawing" on My Stuff for non-book sketches
- Sketch artifacts in portfolio gallery

Progress
* Tabs: Learning Profile (default), Skill Snapshot, Ladders, Word Wall, Engine, Milestones, Armor
* **Learning Profile** — AI-generated disposition narrative (Curiosity, Persistence, Articulation, Self-Awareness, Ownership) from 4 weeks of day log data, evaluations, and Dad Lab reports. First tab in Progress.
  * Dispositions mapped to Wonder→Build→Explain→Reflect→Share learning loop
  * Replaces manual ladder logging as the primary growth visibility tool
* Skill Snapshot — priority skills, supports, stop rules, evidence definitions, workbook configs with Mark Complete (greyed card + reactivate) and visual completion indicator
* Conceptual Blocks — conceptualBlocks[] on Skill Snapshot from pattern detection; ADDRESS_NOW vs DEFER; plain language rationale + strategies
* "Evaluate Skills" button → evaluation chat Records
* Hours & Compliance — additive computation (day logs + hours entries + adjustments)
* Add Historical Hours backfill tool
* MO compliance dashboard (1000h total / 600h core), hours by subject
* Evaluations tab — AI evaluation history (guided + Knowledge Mine quest sessions, filter chips, quest detail with collapsible question breakdown, struggling words, recommendations)
* Portfolio tab — artifact gallery with photo thumbnails + audio playback Dad Lab
* Full lifecycle: Plan → Start → Lincoln Contributes → Nathan Completes
* "Suggest a Lab" AI, "I Have an Idea", "Plan a Lab" manual
* Kid view: prediction, explanation, photo + audio capture
* Artifact gallery, compliance hours auto-logged on completion Settings
* General family profile, AI usage dashboard
* Avatar & XP tab — parent XP controls, piece management, force tier upgrade
* Sticker Library tab — all generated stickers, tag editing, child profile assignment ### Shelly's AI Chat (Ask AI)
* **Context tabs: Lincoln | London | General** — primary filter at top of page; each tab shows only its threads, loads child-specific data into Claude, and has tailored suggestion buttons
* Lincoln tab context: skill snapshot, recent evaluation findings, today's plan items, engagement history, disposition profile, sight word progress
* London tab context: skill snapshot, recent evaluation findings, today's plan items, engagement history, disposition profile
* General tab: family charter, both children overview, week theme — no child-specific deep data
* Persistent conversation threads saved to Firestore, tagged with chatContext (rename, archive, list in drawer)
* Claude-powered responses with full family + child context
* Markdown rendering in assistant messages (bold, lists, headers, code blocks)
* Suggested follow-up questions — 2-3 tappable chips after each response, specific to conversation context
* Image generation via DALL-E with prompt refinement flow — AI asks clarifying questions with tappable chip options before generating; "Just generate" escape hatch
* Image upload — camera/gallery picker; three actions:
  - "Analyze this image" — Claude vision analyzes photo in family/child context
  - "Use as reference for image creation" — Claude describes reference, feeds into DALL-E prompt
  - "Attach to my next message" — pending attachment strip, sends with next typed message
* Mobile-first chat interface — slim inline toolbar, tabs, input bar always visible
* Pre-seeded chat utility — `openChatWithContext` auto-selects correct tab based on child
* FAB on parent Today page for quick access
* Parent nav: "Ask AI" (last item)
* Saves to `families/{familyId}/shellyChatThreads` (tagged with chatContext) + messages subcollection
* Firebase Storage: `families/{familyId}/chat-uploads/` for uploaded images Cloud Functions (18 exported, 13 task types)
1. `chat` — Task dispatch (13 task types): plan, evaluate, quest, workshop, generateStory, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat (context-aware general chat + vision analysis), chat, generate. shellyChat loads child-specific context (skill snapshot, evals, engagement, disposition, sight words, today's plan) based on chatContext. Supports multi-part content for image analysis via Claude vision.
2. `weeklyReview` — Scheduled Sunday 7pm CT
3. `generateWeeklyReviewNow` — Manual trigger
4. `generateActivity` — Lesson card generation
5. `healthCheck` — Diagnostic
6. `analyzeEvaluationPatterns` — Pattern analysis from evaluation sessions
7–18. Image functions (12): `generateImage`, `generateAvatarPiece`, `generateStarterAvatar`, `transformAvatarPhoto`, `generateArmorPiece`, `generateBaseCharacter`, `generateArmorSheet`, `generateArmorReference`, `extractFeatures`, `generateMinecraftSkin`, `generateMinecraftFace`, `enhanceSketch` AI Context Pipeline (task-specific slicing)
- Each task type receives only the context slices it needs (defined in contextSlices.ts)
- Plan/chat: full context (charter, child profile, skill snapshot, workbook configs, eval findings, compressed engagement, week focus)
- Evaluate: charter + child profile + sight words only
- Quest: child profile + skill snapshot + recent eval + quest recommendations from findings
- Planner reads both guided and interactive evaluation sessions
- Story generation: child profile + skill snapshot + week focus only
- Workshop: story inputs + skill snapshot for challenge calibration + game structure constraints + adventure tree generation + card game generation + card fix suggestions
- Pattern analysis: child profile + skill snapshot + eval findings + conceptual blocks
- Engagement data compressed to summary format (reduces tokens ~60%)
- Token usage logged per task type to aiUsage collection Firestore Collections (28 in firestore.ts) families/{familyId}/ + children, weeks, days, artifacts, hours, hoursAdjustments, skillSnapshots, workbookConfigs, plannerConversations, lessonCards, avatarProfiles, dailyPlans, weeklyReviews, aiUsage, evaluationSessions, ladders, ladderProgress, milestoneProgress, dadLabReports, books, sightWordProgress, xpLedger, dailyArmorSessions, stickerLibrary, storyGames, evaluations, scans, shellyChatThreads

* `avatarProfiles` — per-child avatar data (features, XP, tier, equipped pieces, customization, forgedPieces, unlockedTiers)
* `xpLedger` — append-only XP/Diamond event history per child (currencyType: 'xp' | 'diamond', category, itemId fields)

* `scans` — curriculum photo scan records
* `shellyChatThreads` — Shelly's AI chat threads tagged with `chatContext` (`'lincoln'` | `'london'` | `'general'`) + messages subcollection. Messages may include `uploadedImageUrl` (Firebase Storage) and `imageAction` (`'analyze'` | `'transform'`).
* `chapterResponses` — read-aloud chapter discussion responses per child. Stores full question context (book, chapter, question text, questionType), audio recording URL, week theme/virtue/scripture. Powers the Book Responses tab in Records and feeds into the disposition profile narrative.

**Note:** xpEventLog merged into xpLedger (dedup via dedupKey field on ledger entries). Interactive quest sessions stored in `evaluationSessions` with `sessionType: 'interactive'` field. Story games stored in `storyGames` with `gameType` field ('board' | 'adventure' | 'cards'). `wordProgress` is a child subcollection (`children/{childId}/wordProgress`) used by Knowledge Mine — not in `firestore.ts` collection helpers. What's Built but Untested with Real Users
* Weekly Review (needs full week of data)
* Print materials (quality varies — book PDFs and worksheets)
* Skip guidance (depends on evaluation data quality)
* Lincoln's kid Today view (Must-Do/Choose flow — needs real week)
* Knowledge Mine quest — Phase 2 pipeline fixes shipped (skill snapshot → planner/quest, pattern detection trigger, blank validation, math TTS). Kid-friendly question language — no metalanguage (consonant blend, digraph, phoneme). Single valid answer enforcement — word completion verified for unique solutions. TTS on answer options — speaker icon per option, blend pronunciation guides for digraphs/blends. Question variety rules — max 2 word-completion per session, 7 format types rotating (word ID, rhyming, sound matching, word building, sentence completion, odd-one-out, fill-in-blank). Needs Lincoln to verify: adaptive start from snapshot data, question quality with blank validation, math TTS auto-read, pattern detection after 3+ sessions
* Story Game Workshop — needs London to test: voice recognition via keyboard dictation, wizard flow, all three game types, art generation quality, playtester flow with Lincoln
* My Books full flow (needs Shelly + kids — AI story gen, sight word tracking, reading sessions)
* Story Guide handoff to generator (questions work, generator handoff unverified)
* Book theme filter row on bookshelf (auto-tagging unverified)
* Evaluation pattern detection — Foundations section (now triggered automatically from quest sessions when 3+ evals exist; needs verification that conceptual blocks appear in skill snapshot)
* Armor piece overlays on character (in flight — overlay prompt just run)
* Avatar XP adjustment (Firestore undefined error — fix prompt run, needs verification)
* Armor attachment animation + verse TTS sync (prompt written, not yet run)
* Tier-up animation (crossing tier boundaries)
* London's avatar (younger proportions, separate XP)
* Customization UI (dye colors, emblems, crests)
* AvatarThumbnail on other pages
* Parent XP management UI
* Shelly's AI Chat — context tab switching, child-specific context quality (skill snapshot, evals, engagement, disposition), image generation with prompt refinement, image upload + vision analysis, follow-up suggestion quality, mobile UX
* Auto-XP from checklist/quest/book completion What's Not Built Yet Priority Queue (ready to prompt)
* Lincoln Development Chat — dedicated AI chat mode reviewing evaluations, skill snapshot, recent progress → recommends what to work on this week
* Planning improvements — activity ideas mode, engagement-based suggestions (PARTIALLY DONE: per-subject defaults and must-do/choose now built; engagement-based suggestions and activity ideas still TODO)
Story Game Workshop — Future
* Print & Draw (printable board PDF, cut-out cards, London's hand-drawn art)
* Open Creator (freeform + AI chat helper + game remix)
* Quiz show game type
* Multi-device play (Firestore real-time sync across tablets)
* Week Focus integration (virtue → game theme suggestions)
* Together Time block (London's games as paired activities)
* Avatar integration (game creation → crafting materials, "Story Keeper" armor)
* Evaluation tie-in (challenge card performance → skill snapshot feedback)

Knowledge Mine Phase 2-4
* Phase 2: Voice input (Web Speech API) + type-to-answer questions — **NOTE: `useSpeechRecognition`, `useTTS`, and `useAudioRecorder` hooks now exist from Workshop build, reuse them**
* Phase 3: Pre-generated question bank (zero latency)
* Phase 4: Full avatar integration (quest → mine → armor XP)
* Parent review view for interactive sessions in Records — **DONE** (quest sessions in Evaluations tab with detail view, filter chips, collapsible questions)
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

Game World Economy — Future
* Stonebridge world map (2.5D isometric, regions unlock with tiers)
* Diamond shop for cosmetics (dyes, emblems, capes, particles — gated by tier)
* World decorations (place items in Stonebridge with diamonds)
* Pet companion system (wolf/cat/parrot/Sunny)
* London's Workshop games as map locations
* Dad Lab discoveries on map
* Streak bonuses (consecutive day diamonds)
* Verse journal subcollection (track all verse responses across forges)
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
Mine/Eval Engine Mar 22 Quest display fixes (word stimulus, text-only, question variety), XP pipeline (quest→ledger→avatar), eval pipeline (findings→snapshot→planner recommendations), phoneme simplification, end-on-a-win
Workshop P1 Mar 22 Voice-first story game wizard, board game play, reusable TTS/speech hooks, read-aloud tiles
Workshop P1.5 Mar 22 Player selection with avatars, DALL-E art generation (boards, titles, cards, tokens), saving/cross-device/resume, Today page cards, draft auto-save
Workshop P2 Mar 22 Play polish (animations, sound effects, confetti), London voice recording for cards, Lincoln playtester feedback loop with AI card fixes, version tracking
Workshop P3 Mar 22 Choose-your-adventure game type (branching story tree, scene art, retry endings), Card game type (Matching/Collecting/Battle mechanics)
Plan My Week Fix Mar 23 Critical bug fixes (handleSetupComplete routing, JSON parsing, feature flag default), UX rewrite (auto-suggest focus, compact setup, full-width plan preview, must-do/choose sections, per-subject default times, renamed UI, combined adjustment chips)
Cleanup Mar 24 Parent experience audit, dead code removal (5.6k+ lines), model unification (all Sonnet → claude-sonnet-4-6), plan quality fixes (timeBudget 185m, estimatedMinutes 30m, routine promotion, must-do default), hours computation fix, AI Usage panel model labels, docs refresh, orphaned collections/types/seed cleanup, CHARTER_PREAMBLE dedup, Progress tab reorder
First Principles Mar 25 Weekly review rewrite (day logs + type alignment), disposition profile, teach-back (parent + kid), conundrum generation, extra activity logger, Firestore indexes, first principles alignment
Business Prep Mar 28+ Creative timer, mini-book PDF, sketch-to-story pipeline
Audit Mar 29-31 Architecture audit: dead code cleanup, TodayPage decomposition, error handling (SectionErrorBoundary), XP ledger perf, prompt consolidation, docs v14, first-week polish (evaluation nudge, minutes-logged indicator, HelpStrips, warmer empty states), materials theming (per-child), weekly review fixes (7PM schedule, CHARTER_PREAMBLE + addendum, empty-week guard), quest summary ethos fix, KidTodayView decomposition, PlannerChatPage decomposition, MyAvatarPage decomposition
Shelly Chat  Mar 31  Shelly's AI Chat: persistent threads, Claude with family context, inline DALL-E image gen, image upload + Claude vision analysis, prompt refinement flow with tappable options, thread drawer (rename/archive), suggestion buttons, pre-seeded chat utility, FAB on Today, parent nav entry
Shelly Chat  Apr 1  Shelly's AI Chat: context tabs (Lincoln/London/General), persistent threads, deep child context (skill snapshot + evals + engagement + disposition + sight words + today's plan), markdown rendering, follow-up suggestions, DALL-E with prompt refinement, image upload + Claude vision, thread drawer, pre-seeded chat utility, FAB on Today, parent nav entry
Economy v1  Apr 4  Two-currency system (XP + Diamonds), choice-based armor forging with verse engagement, diamond earn sources (quest/teach-back/Dad Lab/workshop/conundrum/extra activity/books), forge costs per tier, XP bar + diamond count HUD, portal moments between tier biomes

Removed Features (Cleanup Sprint, Mar 24-25)
* Sessions (1,720 lines) — orphaned feature with no nav links; sessionsCollection removed
* Scoreboard (736 lines) — orphaned; weeklyScoresCollection + WeeklyScore type removed
* Projects (858 lines) — orphaned; projectsCollection removed
* WeekPage (628 lines) — replaced by Weekly Review
* Legacy Planner (863 lines) — superseded by PlannerChatPage
* Minecraft XP components — relocated to core/xp/ and features/avatar/
* Dead CF code (buildSystemPrompt, loadEnrichedContext) — replaced by contextSlices.ts task-specific slicing
* Orphaned collection helpers: labSessionsCollection, plannerSessionsCollection, sightWordListsCollection
* Orphaned types: Session, PlannerSession, WeeklyScore, ScoreMetric, GoalResult
* Seed data for deleted features (sessions + projects blocks)

Key Design Decisions
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
25. Poses are formation moments — Prayer pose (arms together, head bowed, eyes closed) is intentionally included. The armor is spiritual, not violent.
26. Voice-first for London — he talks, the app listens; he listens, the app talks. Reading/typing are fallbacks, not primary input
27. London creates, Lincoln refines — Story Keeper / Playtester roles give both boys meaningful work from one feature
28. Players ARE the family — game tokens are real people with real avatars, not fictional characters
29. **Setup once, confirm weekly** — Shelly configures routine and subject times once. Weekly planning is: pick energy, note exceptions, generate, lock in. Under 2 minutes.
30. **Reading right after Scripture** — highest priority gets highest energy. Reading is Lincoln's biggest growth area, so it goes second (right after Formation) while focus is fresh. Math third, support skills after.
31. **Evaluations are school** — Knowledge Mine and Fluency Practice are scheduled, counted toward hours, and checked off like any other activity. Not extra — real school.
32. **Disposition over content mastery** — track how a child approaches learning (curiosity, persistence, articulation, self-awareness, ownership), not what they can pass
33. **Teach-back is evidence** — Lincoln explaining to London is the richest learning signal
34. **AI synthesizes growth narrative from existing data** — no additional tracking burden on Shelly
35. **Conundrums build ethical reasoning** — weekly open-ended scenarios with no right answer, connected to what they're studying
36. **Kid-initiated logging** — Lincoln logs his own extra tablet time and teach-back moments. All taps, no typing. Respects his speech/writing challenges.
35. **Flexible triggers** — features activate based on meaningful work done (3+ items OR 50% must-do), not rigid thresholds. Lincoln's day isn't always linear.
37. **School creates product** — London's books and art in the app ARE the business inventory
38. **Sunny the brand** — family golden retriever is the mascot tying all products and content together
39. **Chapter discussions are formation evidence** — the richest signal of how Lincoln thinks. Audio recordings of chapter question responses capture articulation, personal connection, and ethical reasoning in context. Stored in dedicated `chapterResponses` collection for easy querying and disposition narrative feeding.
39. **Context tabs over toggle** — Lincoln/London/General tabs are the primary chat filter, not a small toggle. Changes which threads show, what data Claude loads, and which suggestions appear. Each child gets their own conversation space.
40. **Refine before generating** — image generation asks clarifying questions with tappable options before spending an API call. Better results without prompt engineering skill.
41. **Camera-first on mobile** — image upload uses standard file picker (camera + gallery) so Shelly can photograph worksheets or pick from saved images.
42. **Follow-ups reduce friction** — every assistant response suggests 2-3 specific follow-up questions as tappable chips. Shelly keeps the conversation going without typing.
43. **Two currencies, like Minecraft** — XP is your level (always climbing, unlocks access). Diamonds are your inventory (earned from active effort, spent to forge and craft). Lincoln already understands this from Minecraft.
44. **Forge, don't unlock** — armor pieces are individually forged with diamonds, not auto-given. Lincoln chooses his build order. Each forge includes verse engagement.
45. **Tiers are biomes** — each armor tier is a Minecraft-like world (Caves, Plains, Mountains, Desert Temple, The End, The Nether). Portal moments between them.
46. **Active effort earns diamonds** — quests, teach-back, Dad Lab, and creative engagement earn diamonds. Routine activities (checklist, daily ritual) earn XP only.
46. **Spending is placing, not losing** — diamonds become permanent things (forged armor, cosmetics, world decorations). Nothing disappears.

### Key Files Reference

| File | Purpose |
|------|---------|
| `src/app/AppShell.tsx` | Nav structure (parent + kid) |
| `src/app/router.tsx` | All routes (21 pages + 6 redirects) |
| `src/core/types/index.ts` | Barrel re-export of split type files (common, family, planning, evaluation, xp, books, compliance, dadlab, workshop, skillTags) |
| `src/core/firebase/firestore.ts` | All 28 collection references |
| `src/core/ai/useAI.ts` | Chat + generateImage hooks |
| `src/core/xp/addXpEvent.ts` | XP writer with dedup guards |
| `src/core/xp/checkAndUnlockArmor.ts` | Tier unlock + sheet generation trigger |
| `src/core/avatar/getDailyArmorSession.ts` | Daily reset logic |
| `src/core/utils/perf.ts` | Performance measurement helpers |
| `functions/src/ai/chat.ts` | AI pipeline (plan/evaluate/quest/generateStory/analyzePatterns) |
| `functions/src/ai/imageGen.ts` | DALL-E 3 + gpt-image-1 routing |
| `functions/src/ai/tasks/` | Chat task registry (13 handlers: plan, chat, evaluate, quest, generateStory, analyzeWorkbook, disposition, conundrum, weeklyFocus, workshop, scan, shellyChat + analyzePatterns export) |
| `functions/src/ai/imageTasks/` | Image task registry (11 handlers) |
| `functions/src/ai/contextSlices.ts` | Task-specific context assembly + engagement compression |
| `src/features/avatar/` | My Armor (MyAvatarPage + 8 extracted panels, VoxelCharacter, voxel/) |
| `src/features/books/` | My Books |
| `src/features/quest/` | Knowledge Mine |
| `src/features/today/` | Today page |
| `src/features/records/` | Records + compliance |
| `src/features/shelly-chat/` | Shelly's AI Chat (Ask AI page, context tabs, thread drawer, image upload/vision, prompt refinement, pre-seeded chat utility) |
| `src/features/workshop/` | Story Game Workshop |
| `src/features/settings/` | Settings (AvatarAdminTab, StickerLibraryTab) |
| `docs/FIRESTORE_AUDIT.md` | Firestore collection + index audit |
| `docs/MASTER_OUTLINE.md` | This file (update after each session) |
| `.github/workflows/deploy.yml` | CI/CD pipeline |

### Architecture Notes

#### Top 5 Largest Files
| File | Lines | Status |
|------|-------|--------|
| `PlannerChatPage.tsx` | 2,112 | Decomposed render (800→500L), state management unified. Stable. |
| `WorkshopPage.tsx` | 1,549 | Stable — phase-based rendering, shared currentGame state |
| `BookEditorPage.tsx` | 1,419 | Stable — clear section boundaries |
| `VoxelCharacter.tsx` | 1,264 | Three.js render code. Leave as-is. |
| `MyAvatarPage.tsx` | 1,234 | Decomposed from 1,862L. State + ceremony flow. Stable. |

#### Decompositions (All Completed)

**TodayPage** — Original: 1,789L → Shell: 816L + 5 extracted components
- `TodayChecklist.tsx` (720L) — daily checklist rendering and interaction
- `QuickCaptureSection.tsx` (285L) — note/photo/audio quick capture
- `WeekFocusCard.tsx` (163L) — week theme/virtue/scripture card
- `TeachBackSection.tsx` (97L) — teach-back prompt and capture
- `ChapterQuestionCard.tsx` (60L) — Stonebridge narrative question

**KidTodayView** — Original: 1,813L → Shell: 805L + 6 extracted components
- `KidChecklist.tsx` (484L) — kid daily checklist with must-do/choose sections
- `KidConundrumResponse.tsx` (209L) — weekly conundrum response
- `KidTeachBack.tsx` (167L) — "I Taught London!" capture
- `KidExtraLogger.tsx` (163L) — extra activity logger ("I Did More Mining!")
- `KidChapterResponse.tsx` (159L) — chapter question response
- `KidCelebration.tsx` (117L) — completion celebration

**PlannerChatPage** — Original: 2,363L → Shell: 2,112L + 4 extracted components (render 800→500L)
- `PlannerSetupWizard.tsx` (201L) — first-visit setup wizard
- `PlanDayCards.tsx` (104L) — day card rendering in plan preview
- `WeekFocusPanel.tsx` (88L) — week focus display panel
- `PlannerChatMessages.tsx` (65L) — chat message rendering

**MyAvatarPage** — Original: 1,862L → Shell: 1,234L + 8 extracted components
- `ArmorSuitUpPanel.tsx` (296L) — daily armor suit-up flow
- `AvatarCharacterDisplay.tsx` (288L) — character display wrapper
- `ArmorPieceGallery.tsx` (271L) — armor piece card gallery
- `AvatarPhotoUpload.tsx` (250L) — photo upload + transform
- `AvatarHeroBanner.tsx` (199L) — hero banner with character + XP
- `ArmorVerseCard.tsx` (169L) — verse card with TTS
- `AvatarCustomizer.tsx` (133L) — customization UI (dye, emblems, crests)
- `speakVerse.ts` (19L) — verse TTS utility

#### Ladder System Deprecation
- Partially deprecated. Disposition system (curiosity, persistence, articulation, self-awareness, ownership) is replacing ladder-based tracking.
- TODO comments added in 5 files marking ladder references for removal.
- Ladders page still exists at `/ladders` route but is secondary to the Learning Profile tab.

#### AI Prompt Patterns
- 5 tasks use `buildContextForTask` (contextSlices.ts): plan, evaluate, quest, disposition, weeklyFocus
- 3 tasks use `CHARTER_PREAMBLE` directly: conundrum, generateStory, workshop
- 4 tasks build prompts inline: chat, scan, analyzeWorkbook, analyzePatterns
- shellyChat builds context per chatContext tab (see below)
- Consolidation pending.

#### shellyChat Context Loading
- Lincoln/London tabs: loads 6 context sources per child (skill snapshot, eval findings, today's plan, engagement history, disposition profile, sight words)
- General tab: loads family charter, children overview, week theme only
- Each context source wrapped in independent try/catch — partial failures don't block response
- All queries use `.limit()` to bound cost

#### Firebase Storage Paths
- `families/{familyId}/chat-uploads/{threadId}/{timestamp}.jpg` — user-uploaded chat images (Shelly's AI Chat)

#### Known Technical Debt
- **PlannerChatPage.tsx (2,112L)** — Decomposed render (800→500L) but state management is still ~1,600L. Interconnected wizard/chat/plan/apply state makes further splitting complex. Stable as-is.
- **evaluate.ts (weekly review)** — Now uses CHARTER_PREAMBLE + addendum, but still separate from the task system. Not in task registry.
- **Hours partial-day edge** — If a day has some blocks with actualMinutes and others without, only tracked blocks count. By design but undocumented.
- **Dead `sessions` collection** — Fully removed (PR #651). No orphaned references remain.

#### Avatar / Three.js Architecture
- Three.js scene lifecycle managed in a single React component with `useEffect` cleanup
- `initScene` callback decoupled from re-render cycle (intentional `eslint-disable`)
- `enforceArmorOpacity` runs every frame — could optimize to on-change only
- Character and armor meshes stored in `useRef` (not React state)
- `equippedPieces` React state → `useEffect` syncs to Three.js mesh materials
- Consider extracting Three.js lifecycle into custom `useThreeScene` hook
- `DailyArmorSession` and `AvatarProfile` both track equipped pieces — potential drift

#### Two-Currency Economy Architecture
- XP (progression) + Diamonds (spending) both stored in xpLedger with `currencyType` field
- Diamond balance computed from ledger sum (positive = earn, negative = spend)
- Forge flow: tier unlock (XP) → piece selection → diamond payment → verse engagement → forge
- `forgedPieces` on avatarProfile tracks per-tier per-piece forge state with verse responses
- `unlockedTiers` computed from TIERS thresholds on XP change
- Legacy backward compat: existing unlocked pieces auto-migrated to forgedPieces at wood tier

## Barnes Bros Business Integration

Family business workstream layered on top of the homeschool system. London (art/books) + Lincoln (operations/sales tracking) + Sunny the golden retriever (brand mascot).

### What's Built
- Creative time tracking (auto-logs art/writing/making hours as school)
- Mini-book PDF export (London's AI books → printable physical products)
- Sketch-to-story pipeline (paper drawings → book illustrations → sticker source material). `enhanceSketch` now filters captions through the same copyright rewriter pipeline as `generateImage` (shared via `copyrightUtils.ts`)

### What's Planned
- Barnes Bros Dashboard (kid nav page): sales log, earnings tracker, goal thermometer
- Firestore collection: `families/{familyId}/businessLog`
- Etsy product pipeline: London's sketches → stickers (raw) + prints (AI-enhanced)
- YouTube channel content capture integration

### Business ↔ School Mapping
| Business Activity | School Subject | Hours Source |
|---|---|---|
| Drawing stickers / book art | Art | Creative timer |
| Writing book stories / product descriptions | Language Arts | Creative timer |
| Counting inventory / pricing / tracking sales | Math | Manual or timer |
| Assembling products / craft fair setup | Practical Arts | Manual entry |
| Filming / explaining experiments (YouTube) | Speech / Language Arts | Manual entry |

### Key Design Decisions (Business)
13. **School creates product** — London's books and art ARE the inventory
14. **Sunny is the brand** — Golden retriever ties all products + content together
15. **Lincoln's Xbox goal** — Real motivator, not manufactured. Business serves his goal.
16. **No live selling pressure** — Nathan handles customer interactions. Lincoln grows into it.
17. **Two product lines per drawing** — Raw sketch = authentic sticker, AI-enhanced = art print

Architecture Review Notes (March 29, 2026) The following areas are flagged for architecture review:
* XP system — xpLedger uses dedup guard pattern; totalXp computed from full ledger on every award (O(n), fix pending)
* Avatar generation costs — DALL-E 3 sheet generation per tier per child; when to generate vs cache; cost implications at scale
* Cloud Function sprawl — chat function handles 13 task types; generateImage handles 12 image tasks; whether these should be split into separate functions
* Firestore collection count — 27 formal collections + `wordProgress` raw subcollection reference in quest.ts
* Client-side image processing — cropArmorSheet, sketch cleanup, and print PDF all do heavy canvas work client-side; perf on low-end devices
* AI context pipeline size — system prompt includes many data sources; token cost and latency implications
* AI prompt drift — 3 different patterns for system prompt construction across task handlers; consolidation pending
* Type safety — types split across 10 files (common, family, planning, evaluation, xp, books, compliance, dadlab, workshop, skillTags) with barrel re-export via index.ts
* Decomposition queue — all 4 targets completed (TodayPage, KidTodayView, PlannerChatPage, MyAvatarPage). Next largest files are WorkshopPage (1,549L) and BookEditorPage (1,419L), both stable.

Last updated: April 1, 2026
