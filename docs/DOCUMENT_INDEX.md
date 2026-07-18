# First Principles Engine — Document Index

> Where everything lives. Updated 2026-07-16.

---

## Repo Docs (`/docs`)

| Document | Status | Notes |
|---|---|---|
| `MASTER_OUTLINE.md` | **CURRENT** (v16) | Single source of truth: features, status, sprint history. Updated July 16, 2026 (v16): added the **Learner Model & adaptive loop-closing arc** section (FEAT-44→72) and known-open items; charter-alignment sweep filed. Prior feature sections current as of April 13, 2026. |
| `design-pass-v1/` | **CURRENT** | 10 mobile + 6 tablet design mocks + handoff README for v1 refine pass (May 26, 2026) |
| `DOCUMENT_INDEX.md` | **CURRENT** | This file — maps all docs in repo and Google Drive |
| `DOCS_ALIGNMENT.md` | **CURRENT** (new 2026-07-04) | Docs & data alignment routine (DOC-08 + DOC-09) — the nine drift/resilience checks run by `scripts/check-docs-alignment.mjs` on every PR (`npm run docs:check`), allowlist discipline, generated collection-count spans, PowerShell-friendly local usage. |
| `OPS_WINDOW.md` | **CURRENT** (new 2026-07-10) | Monthly ops-window **practice** (DOC-09) — first-weekend Claude.ai design-session checklist: review the docs-check SOFT warnings + silent-fallback census, trace 2 of the ~8 named family journeys read-only, and clear standing items (July DATA backlog, Opus pilot review, allowlist re-review, Sonnet 5 pricing, ARCH-17 Node countdown). |
| `PROCESS_OVERVIEW.md` | **CURRENT** (new 2026-06-20) | How the project is developed (dev loop, ledger discipline), the audit pipeline (daily health / weekly test builder / monthly ARCH_AUDIT / monthly human deep-audit + COLLISION rule), and the kid learning loop with its loose points. **Audits read this first** (linked from `PROMPT_ARCH_AUDIT.md` Step 0). |
| ~~`PARENT_EXPERIENCE_AUDIT.md`~~ | REMOVED | Superseded by `FIRST_PRINCIPLES_ALIGNMENT.md` |
| ~~`PARENT_EXPERIENCE_ALIGNMENT_PLAN.md`~~ | REMOVED | All items done Mar 25, 2026. Superseded by `FIRST_PRINCIPLES_ALIGNMENT.md` |
| `FIRESTORE_AUDIT.md` | **STALE** (Mar 21) | Data model, indexes, collections audit — stale since Mar 21. CLAUDE.md table is now authoritative; `firestore.ts` defines <!-- gen:collection-count -->44<!-- /gen --> exported collection helpers (count generated + verified by `npm run docs:check`; see `DOCS_ALIGNMENT.md`). |
| `WEEKLY_CONUNDRUM_ARC.md` | **CURRENT** | Weekly conundrum story arc design — Stonebridge narrative, recurring characters, ethical reasoning scenarios |
| `KNOWLEDGE_MINE_BRIEF.md` | **CURRENT** | Interactive evaluation design doc (Knowledge Mine) — Phase 1 shipped |
| `barnes-story-game-workshop-design.md` | **CURRENT** | Story Game Workshop design doc — wizard, 3 game types, art gen, voice recording, playtester, play experience |
| `GARDEN_DEFENSE_QUEST_PLAN.md` | **CURRENT** (v0.1, 2026-06-19) | Barnes Bros business-track strategy — Garden Defense Quest kit brand. FPE reuse map, product/price line, roles, curriculum tie-in, Track A (physical proof) / Track B (app build → FEAT-27/FEAT-28), open economics decisions (D1 home-print vs service), safety/IP guardrails. Ledger anchor: FEAT-29. |
| `SEED_VAULT_V1_RUNBOOK.md` | **CURRENT** (v1, 2026-06-19) | Seed Vault first-kit build runbook — phased build (story + stickers via FPE tools; clue cards/map/badge by hand), roles (London/Lincoln/Nathan), 3–5 family test. Doubles as TEST-03 pipeline verification. Companion to `GARDEN_DEFENSE_QUEST_PLAN.md`; iterations feed the FEAT-27 kit assembler. |
| `BUSINESS_TAB_DESIGN.md` | **CURRENT** (v0.1, 2026-06-19) | Barnes Bros business-tab design spec — curation layer (locked "report of a book"), Lincoln-operator ops + goal surface, tiered Xbox+games thermometer, sticker composer, kit assembler. July build. Anchored by FEAT-29; first slice tracked as the new operations+goal row. |
| `GDQ_KIT_BUILDER_DESIGN.md` | **NEW (design)** (v0.1, 2026-07-17) | GDQ Kit Builder — voice-first **roster** capture for Barnes Bros kits (a *cast + rules*, not a story): a `KitRoster` (vault, hero name/look/move, 4–6 defenders name+power, 3–4 invaders name+menace, win condition) stored as business data under the business feature, additive. **Reuses the Story Guide capture surface** (TTS prompt, voice/type, "I heard…/yes/try again" confirm) — recon-confirmed reusable via a small extraction (presentational `StoryGuideQuestion` + voice primitives; the fixed-5-question linear orchestration is story-specific); the new pattern is the **repeat-until-done** defender/invader capture with mid-list write-through + resume. Names (doesn't build) the downstream: `gpt-image-1.5` transparent stickers, booklet/map/clue-cards/badge, and an honest learning-loop linkage (portfolio artifact, **not** an auto learner-model write — a roster is creative, not an assessment). Serialized 4-slice build plan; 6 open decisions. Design-only, no build assigned. Ledger anchor: **FEAT-78**. Companion to `GARDEN_DEFENSE_QUEST_PLAN.md` (FEAT-29) + `BUSINESS_TAB_DESIGN.md` (FEAT-30). |
| `BARNES_BROS_CATALOG_DESIGN.md` | **NEW (design)** (v0.1, 2026-07-17) | Barnes Bros product **catalog** (the "show") + **website export path** (the "sell") — fills the make→show→sell gap: the business can make (Books/stickers/kits) and track sales (`businessLog`) but can't display what the boys offer. Proposes an additive `CatalogProduct` type (reuses `BusinessItemType` so a catalog item and a sale line-item share vocabulary) + a `catalogProducts` collection (auto-ID + converter, mirroring `businessLog`); products are parent-curated, authored manually **or promoted from an existing artifact** (finished `Book` → catalog Book, sticker set, FEAT-78 `KitRoster` → catalog kit), always **referencing already-generated art, never regenerating**. In-app catalog = a sibling `SectionCard` on `BusinessPage` (cards grouped by type, pride-wall doubling, honest empty state). Website path designed **not built** — three honestly-costed options: **A** printable/PDF order sheet (near-zero, works today once products exist), **B** Etsy listing-field export (respects the GDQ adult-account + MO tax/licensing constraints), **C** public static storefront (**a second Firebase Hosting target** + a **static snapshot export** of `status:'listed'` products — the current app is a single fully-authed SPA with a catch-all rewrite and no public route, so C needs its own site + build step; recommends the static snapshot to keep `firestore.rules` untouched). **Hard dependency + gate stated up front:** catalog can only be populated once FEAT-78 ships a real kit #1, and **no website is built until kit #1 is real AND has had one parent-confirmed sale** (the GDQ validation gate; reuses `BusinessLogEntry.confirmed`). Serialized 5-slice build plan (all gated after FEAT-78; C gated on the sale); 6 open decisions. Design-only, no build assigned. Ledger anchor: **FEAT-79**. Depends on **FEAT-78**; companion to `BUSINESS_TAB_DESIGN.md` (FEAT-30) + `GARDEN_DEFENSE_QUEST_PLAN.md` (FEAT-29). |
| `STICKER_CHARACTER_STUDIO.md` | **CURRENT** (v0.1, 2026-06-19) | Standalone Sticker/Character Studio design — pulls creation out of the book editor into an upstream surface (sketch→sticker, scene→extract-characters, organized library) that books, stories, and the business tab draw from. July build; tracked as FEAT-33. |
| `TODAY_TEACHING_HELP_DESIGN.md` | **NEW (design)** (v0.1, 2026-07-02) | Today Teaching Help — consolidation-first design for an inline, auto-generated, sparse-data-grounded **Help Card** (Play it / Say this / Watch this / Skip signal) on Today checklist items. Reframes (not greenfield): unifies the existing modal `TeachHelperDialog` + already-shipped `LessonVideoDialog` (FEAT-14→23) into one inline affordance; adds passive-signal grounding, two-kid variants, MVD degradation. Doc only, no build assigned; tracked as FEAT-40. |
| `ENGINE_V2.md` | **CURRENT** | Learning framework: family snapshot, curriculum mapping, energy modes, weekly rhythm |
| `DAD_LAB_CONCEPT_ARCS_DESIGN.md` | **NEW** (design, 2026-07-02) | Dad Lab concept arcs design — additive `ConceptArc`/`ArcStep` layer above the live `DadLabReport` object (Project layer is unwired scaffold), carry-forward from step N→N+1 (prior `nextTime`/`bestMoment`/predictions-vs-outcomes), dedicated Sonnet `dadLabArc` task for arc generation. Open decision D1 (where concepts live: recommend self-contained arc steps for v1, own concept map as growth path, avoid extending the Learning Map). Preserves DATA-04 both-children credit; build-order dependency on `ARCH-40`. Anchored by `FEAT-41`. |
| `FIRST_PRINCIPLES_ALIGNMENT.md` | **NEW** | Ad Astra pedagogy alignment — disposition tracking, conundrums, teach-back philosophy |
| `LEARNING_STRUCTURES_DESIGN.md` | **NEW** (design — strategic, 2026-07-02) | Projects & Play as first-class learning structures alongside Routine. Thesis (worksheets are one output format; app already built the pattern 4× ad hoc), three-structure definition layer, how a Project meets the planner (single-writer lane, elastic contributions, sparse-logging/artifact-as-progress), the Seed Vault pilot recommendation, what generalizes later, and the never-do constraints (no counting-rule changes). Design-only, no build assigned. Ledger anchor: **FEAT-42**. |
| `LEARNER_MODEL_DESIGN.md` | **AMENDED v0.2** (design — strategic; 2026-07-03, amended 2026-07-04 FEAT-49) | The Learner Model ("the central brain") — a strictly-additive synthesis layer that reads the nine existing evidence streams (skill snapshots, Learning-Map working levels, eval/quest sessions, scans, sight words, day-log teach-backs, Dad Lab reports, dispositions, conceptual blocks) and computes one stored per-child model: concept states (`solid`/`forming`/`frontier`/`not-yet`) on a shared K→5 reading+math **foundations spine**, each with a tappable evidence trail; modality calibration; what-matters-next; asks routed to kid-facing checks; cross-child teach-back suggestions. Reuses the FEAT-35/36 re-derivation invariants (upgrade-only, manual-freeze, persist-delta) for parent overrides-as-attestation. Absorbs the Progress "Learning Profile" tab into a first **Foundations** tab (dispositions become a section). Serves `plan` / `helpCard` (FEAT-40/43) and the Dad Lab calibration re-point (fills the ETHOS-03-deferred per-child enrichment) via a canonical `learnerModel` context slice. Writes no plans/hours/compliance. Slice 1 shipped (FEAT-48). **Phase 3b shipped (FEAT-65, read-only):** the **Foundations tab** (index 0, absorbing Learning Profile) + the Plan-My-Week focus line + the `→ solid` loop-confirmation, all read-only over the stored model via the shared `useLearnerModel` hook (the §6.3 attest-override write path stays deferred). **Amendment (FEAT-49, §§11–15):** the Foundations **Review Chat** becomes the slice-2 primary interface (subject-scoped conversation establishing states by evidence or testing; propose→confirm→write; mid-chat upload → multi-extraction; quest-queue handoff); new `curriculumPosition` evidence + external-curriculum **bridge** (`FAST_PHONICS_BRIDGE_V0.md`); **covered ≠ mastered** cap (`curriculumPosition` maxes at `forming`); **display rules** (no band numbers, no percentages, name the source); slice reorder (tab demoted to slice 3); weekly-review-adoption finding logged as backlog. Ledger anchor: **FEAT-46**; amendment **FEAT-49**. |
| `foundations/READING_GRAPH_V0.md` | **CURATED v1** (2026-07-03) | Reading half of the Foundations spine — 31 concepts, K→5, kid-word name + parent description + `underlies` edges, grounded in the repo's `PHONICS`/`COMPREHENSION` level ladders, `READING_MAP`, quest mechanics, and Dolch sight-word lists. Owner-curated 2026-07-03 (FEAT-47): sight words collapsed to one node, `reading.comprehension.listen` added, r-controlled re-banded to 3. **Authoritative for the FEAT-46 build**; ships as versioned data in a build slice. Appendix to `LEARNER_MODEL_DESIGN.md`. |
| `foundations/MATH_GRAPH_V0.md` | **CURATED v1** (2026-07-03) | Math half of the Foundations spine — 29 concepts, K→5, kid-word name + parent description + `underlies` edges, grounded in the repo's `MATH_SKILL_LEVEL_MAP` / `MATH_CONCEPT_BANDS` (L1–8) and `MATH_MAP`. Owner-curated 2026-07-03 (FEAT-47): `math.problemSolving.oneStep` added, money/time split kept, Data/Graphs + Patterns/Algebra marked evidence-only, L7/L8 node-mapped seeding. **Authoritative for the FEAT-46 build**; ships as versioned data in a build slice. Appendix to `LEARNER_MODEL_DESIGN.md`. |
| `foundations/FAST_PHONICS_BRIDGE_V0.md` | **CURATED v1** (2026-07-04, FEAT-50; curates FEAT-49 draft) | External-curriculum bridge — maps Fast Phonics (Reading Eggs) **Peaks 1–20** to reading-graph node ids, so completing a peak supplies `covered` evidence for its concepts. **v1 replaces the v0 draft's per-peak content layer with the official Reading Eggs scope & sequence** (verified 2026-07-04, follows the UK Letters and Sounds **Phases 2–5**, not the US-conventional order the draft reconstructed): digraphs at Peak 8, vowel teams + r-controlled + diphthongs interleaved in Phase 3 (Peaks 9–12), adjacent-consonant blends + multisyllable begin Phase 4 (Peaks 13–14), silent-e (`longVowels`) is a late Phase-5 peak (Peak 18). Includes the versioned bridge-data shape (`CurriculumBridge` / `BridgeUnit`, now with `phase`), the covered≠mastered semantics (caps at `forming`, quiz scores promote only *within* forming), the sight-word multi-source rule, the words-known-milestones-≠-Dolch note, a corrected worked "Peak 13 complete" example (Phase-4 blends frontier; silent-e correctly ahead-of-frontier; corroborated by the FEAT-48 seeded frontier), and a **Curation resolutions** section answering all five of the draft's open questions from the cited source. **Authoritative for the FEAT-46 build** (same status the graphs reached at FEAT-47); still ships as versioned data. Appendix to `LEARNER_MODEL_DESIGN.md` §12. |
| `foundations/MATHSEEDS_BRIDGE_V0.md` | **OWNER-CURATED v1** (2026-07-15, FEAT-64; official-source verified; shipped as data) | External-curriculum bridge — maps Mathseeds lessons (200 lessons, 50/grade band: K 1–50 · G1 51–100 · G2 101–150 · G3 151–200) to math-graph node ids, turning the tracked Mathseeds position (config reads Level 122) into `covered` evidence and closing the model's blind spot on the child's primary **math** curriculum. **v1 replaces the FEAT-63 draft's reconstructed guesses with the owner-adopted mapping, verified against the official Mathseeds content-overview + lesson-overview pages (2026-07-15)** and transcribed into `src/core/foundations/mathseedsBridge.ts`. Native unit = **band ceiling** with **in-band credit** (`lessonToUnit` rounds the lesson UP to the band it is inside — L122 → band 150). Inherits the Fast Phonics semantics (covered≠mastered `forming` cap, cumulative, never-downgrade, dedup); Mathseeds content with no graph node (rounding) recorded in a **notes** column, never invented. Curation questions RESOLVED (appended). Appendix to `LEARNER_MODEL_DESIGN.md` §12. |
| `foundations/TGTB_LA1_BRIDGE_V0.md` | **OWNER-CURATED v1 — COARSE by design** (2026-07-15, FEAT-64; official-source verified; shipped as data) | External-curriculum bridge — maps The Good and the Beautiful **Language Arts Level 1** lessons (120 lessons, 3 units) to reading-graph node ids, turning the tracked TGTB LA1 position (config reads Level 110) into `covered` evidence, **multi-source** alongside Fast Phonics on shared reading nodes. **v1 replaces the FEAT-63 draft with the owner-adopted mapping, verified against the official TGTB Level 1 course pages (2026-07-15)** and transcribed into `src/core/foundations/tgtbLa1Bridge.ts`. Deliberately **COARSE (three broad bands)**: TGTB's phonics progression lives in the self-paced **Reading Booster B cards**, not the lesson number, so the lesson is only a coarse proxy — a precise **Booster B card→node bridge** (card numbers are printed on the photographed cards) is the named future tracker. Native unit = band ceiling with in-band credit (L110 → band 120). Inherits the Fast Phonics semantics. Curation questions RESOLVED (appended). Appendix to `LEARNER_MODEL_DESIGN.md` §12. |
| `foundations/TAG_CONCEPT_BRIDGE_V0.md` | **DRAFT v1 — flagged for OWNER REVIEW** (2026-07-16, FEAT-69; consumed as data) | skillTag → foundations-concept bridge — maps the `skillTags.ts` catalog tags (22 v1 tags) to reading/math-graph node ids, so a **non-workbook** daily struggle (a "stuck" mastery chip or an `engagement:'struggled'` flag) resolves to a foundation concept and seeds the re-test queue. Mirrors the workbook bridges (FEAT-53/63/64): versioned, owner-reviewed data + a pure tolerant resolver; **no-guess** (unmapped tag → `[]`); high-confidence 1:1 pairs only, every target id pinned to a real graph node. `writing.*`/`regulation.*` map to `[]` by design (v1 graph is reading+math; regulation is not a concept domain). Transcribed into `src/core/foundations/tagConceptBridge.ts`. Open curation questions (`reading.fluency.short` lane, `writing.spelling.*` → encoding-node candidates, multi-map) appended for the owner. Appendix to `LEARNER_MODEL_DESIGN.md` §11.5. |
| `ECONOMY_AUDIT_PART1.md` | **CURRENT** | Economy code inventory — earning/spending paths, collection audit, event types |
| `ECONOMY_AUDIT_PART2.md` | **CURRENT** | Economy unified model — two-currency design, balance reconciliation, pacing math |
| `STONEBRIDGE_BIBLE.md` | **CURRENT** | Canonical narrative world bible — 8 places, 10+ characters, values, tone, continuity rules |
| `GAME_WORLD_ECONOMY.md` | **CURRENT** | Two-currency economy design (XP + Diamonds), choice-based armor forging, Stonebridge world |
| `HEALTH_REPORT.md` | **CURRENT** | Weekly code health metrics — line counts, test coverage, bundle size, tech debt tracking |
| `ARCH-10_rules_hardening_plan.md` | **CURRENT** | Firestore rules hardening recon — feasibility, regression baseline, proposed rule structure. Build pending. |
| `LONDON_BACKLOG.md` | **CURRENT** | Active London deferral register — per-surface breakdown of what works today vs. what's held until tuned for a 6-year-old |
| `COMPLIANCE_YEAR_END_CLOSEOUT.md` | **CURRENT** | Annual compliance closeout checklist — MO year-end (June) hours verification, exports, freeze window, July data-hygiene handoff |
| `SESSION_TIMER_HOURS_2026-04-14.md` | **HISTORICAL** | Implementation doc for auto-tracked instructional hours via session timer (shipped Apr 14, 2026) |
| `SHELLY_PORTAL_CONTEXT.md` | **CURRENT** | Code-verified recon reference for the Shelly Chat control portal build — corrects the design brief against actual code |
| `SHELLY_PORTAL_FEEDBACK_LOOP.md` | **CURRENT** | Friction log → GitHub issue feedback loop (shipped end-to-end) — ops notes, secret setup, Step 5a+5b architecture |
| `barnes-shelly-chat-portal-design.md` | **CURRENT** | Shelly Chat control portal design doc — feature-complete (Tier A reads, Tier B confirmed writes, Tier C Option 2 additive snapshot edits) |
| `PROJECT_CONTEXT.md` | **CURRENT** (regenerated 2026-06-20) | Synthesized project context file for Claude.ai — family context, current sprint, nav structure, AI task registry, key design decisions, **+ Strategic Direction (multi-kid / autonomy; Texas cutover)**. Regenerated by hand from MASTER_OUTLINE v15 + HEALTH_REPORT 2026-06-13 + ledger §5 (no generator script exists — a stat/nav generator would make this mechanical; flagged in the file header). |
| `PROFILE_LIMITS_AUDIT.md` | **CURRENT** | Profile-based rate limits and experience audit — AI usage caps, generation limits, cost controls, per-function model + cost-per-call mapping |
| `SYSTEM_PROMPTS.md` | **CURRENT** (v4, updated 2026-06-09) | Task dispatch, model selection, context slices — 19 task types in `tasks/index.ts` registry (plan, chat, generate, evaluate, quest, generateStory, reviseStory, revisePage, workshop, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, chapterQuestions, bookLookup, lessonVideo, monthlyReview); `analyzeEvaluationPatterns` exported separately |
| `barnes-testing-guide-v2.md` | **STALE** | Needs update — missing Knowledge Mine, Workshop, Books, Avatar/Armor coverage |
| `SCRIPT_CONVENTIONS.md` | **CURRENT** | Cross-platform npm script conventions (cross-env, path separators, admin scripts) |
| `KNOWLEDGE_MINE_AUDIT_2026-04.md` | **NEW** | Knowledge Mine audit (Part 1/4): quest type inventory, level system analysis, Level 7 mystery resolution, difficulty progression, Lincoln constraint compliance |
| `KNOWLEDGE_MINE_CRASH_INVESTIGATION_2026-04-07.md` | **RESOLVED** | Crash investigation: session ejection + precision TypeError + resume card failure after Level 6→7 promotion in comprehension quest. Root cause chain identified, 4 fixes landed (try/catch, WebGL safety, forceContextLoss, errorElement). |
| `FINDINGS_PIPELINE.md` | **CURRENT** (reconciled 2026-05-16) | End-to-end trace of EvaluationFinding data flow. Writers section + "Does NOT do" checklist refreshed for Phase 1+2 of EVALUATION_METHODOLOGY (four conceptualBlocks writers, mergeBlock semantics). |
| `EVALUATION_METHODOLOGY_2026-04.md` | **CURRENT** (reconciled 2026-05-16) | Phased build plan for the blocker-driven learning engine. §2 rewritten as post-Phase-1+2 current state; pre-Apr-21 narrative kept in §2.1 for context. Phases 3 (synthesis) and 4 (downstream wiring) remain backlog. |
| `LEARNING_ENGINE_AUDIT_2026-04.md` | **HISTORICAL / REFERENCE** (single-row fix 2026-05-16) | April audit of the evaluation/learning engine. Line 1179 conceptualBlocks data-flow row footnoted to reflect mergeBlock writes; rest of doc untouched as historical record. |
| `EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md` | **CURRENT** (closures appended 2026-05-16/17) | May 2026 evidence-first full sweep: R1-R6 verification, journey traces, G55 hardcoded-Lincoln finding, phantom-write tier, post-Phase-1+2 gap re-sweep. Post-Audit Closures section tracks G55 / G54 / G50 fixes from Prompt B, G26 from Prompt C, and G4 / G5 / G6 skip-advisor closures from Prompt D. |
| `LONDON_GENDER_VERIFY_2026-05.md` | **NEW** | London gender verification sweep: codebase grep confirmed CLEAN; 3 active-doc pronoun fixes landed alongside this report. |
| `MODEL_UPGRADE_PROPOSAL_2026-05.md` | **DELIVERED** (2026-05-24) | Read-only audit of Claude + OpenAI model usage with per-task UPGRADE/KEEP/EVALUATE recommendations. Phase A + B shipped on 2026-05-25 (see `IMAGE_MIGRATION_PLAN_2026-05.md` + `IMAGE_MIGRATION_SMOKE_TEST_2026-05.md`); implementation log appended to the bottom of this doc. Phase C (Opus 4.7 narrative tasks) still pending. |
| `IMAGE_MIGRATION_PLAN_2026-05.md` | **NEW** (2026-05-25) | Image generation migration plan executing the Phase A + B of the Model Upgrade proposal. Step 0 read-only inventory of all dall-e-3 + gpt-image-1 call sites; Step 1 BEFORE/AFTER per-site migration map with five resolved defaults (medium quality, png output, legacy size remap, hard-fail on org verification, no client contract change). Pairs with the implementation commits on branch `claude/image-gen-migration-phaseAB` (PR #1217). |
| `IMAGE_MIGRATION_SMOKE_TEST_2026-05.md` | **NEW** (2026-05-25) | Tablet-runnable smoke test checklist for the Phase A + B image migration. Pre-flight org-verification gate + 11 path-specific sanity checks (5 Phase A, 6 Phase B counting the sticker variant of generateImage) with Storage + aiUsage confirmations and failure-mode triage. Run after deploy lands. |
| `CHAT_LINK_PHASE1_PLAN_2026-05.md` | **NEW** (2026-05-24) | Chat-Link Phase 1 plan + implementation audit. Step 0 inventory (chat vs shellyChat reconciliation), Step 1 expansion plan with prompt-addendum draft, Step 2 implementation audit (3 dead-read fixes + teach-back loader + planning-partner addendum). Branch: `claude/awesome-pascal-IE9Wg` (PR #1208). |
| `CHAT_LINK_PHASE1_VERIFY_2026-05.md` | **NEW** (2026-05-24) | Tablet-runnable manual verification checklist for Chat-Link Phase 1. 5 baseline questions + 3 dead-read recovery probes + 1 London confabulation negative test + failure-mode triage. Pairs with the plan doc above. |
| `DESIGN_STORY_GENERATION_V2.md` | **Phase 2 COMPLETE** (2026-05-29) | Story Generation V2 design — single-prompt entry, post-generation review chat with TTS read-back + voice-driven page revision, retires Story Guide wizard. **Phase 1 (prompt quality) and Phase 2 (Generate Chat + Per-Page Review + entry replacement) both shipped**; Phase 3 polish sketched/optional. Phase 2 landed in two PRs: PR-A (Generate Chat surface + `reviseStory` task) and PR-B (Per-Page Review — `BookReviewChat` + `useBookReview` + `revisePage` task, auto-opens after the kid commits). Builds on `useTTS`, `VoiceInput`, `useBookGenerator` progressive save, `generateStory` task. Pairs with `DESIGN_MONTHLY_REVIEW_BOOK.md`. |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | **CURRENT** (Phase 1 landed Apr 14, 2026) | Skip System V2 design — data model (`activityConfigId`, `skipReason`, `rolledOver`, `rolledOverFrom`), auto-rollover logic, scan-advance auto-complete, "Accept & advance" button. Phase 1 shipped. Phase 2 (skip analytics, skip-advisor improvements) still proposed. Supersedes `DESIGN_SKIP_SYSTEM_2026-04-09.md`. |
| `DESIGN_SKIP_SYSTEM_2026-04-09.md` | **HISTORICAL** | Initial skip system proposal (Apr 2026). Superseded by `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md`. |
| `SKIP_INVENTORY_2026-04-09.md` | **HISTORICAL** | Apr 2026 inventory of scan pipeline, checklist skip logic, and AI recommendation flow. Research substrate for the skip system design. |
| `REVIEW_INTENT_2026-04-09.md` | **HISTORICAL** | Read-only charter alignment audit (Apr 9, 2026). Rates each charter principle against the codebase — Aligned / Partially Aligned / Violated, with file citations. |
| `REVIEW_INTENT_ACTIONS.md` | **HISTORICAL** | Action items from the Apr 2026 charter alignment review, ordered by priority. Most items completed in subsequent sprints. |
| `WORKINGLEVELS_INSPECTION_2026-04-09.md` | **HISTORICAL** | Read-only investigation (Apr 9–14, 2026): whether `workingLevels` was firing in production, and hours-partial-day edge case analysis. No code changes. |
| `DOC_INDEX_UPDATES_FOR_STORY_GEN_V2.md` | **HISTORICAL** | Companion patch doc for `DESIGN_STORY_GENERATION_V2.md` indexing. Already applied to this index. |
| `DESIGN_VOICE_INPUT_MODULE.md` | **PHASE 1 SHIPPED** (2026-05-27) | Reusable voice-input module — `useAudioRecording` + `useTranscription` hooks + `<VoiceInput>` component routing per-child between Whisper (server) and Web Speech (browser) via `child.voiceInputEnhanced`. Adds new `transcribeAudio` Firebase callable, writes per-transcription `transcriptionEvents` substrate for future trouble-word tracking (§12), and migrates `BookGenerateChat` composer as the first integration. Phase 2 (migrating other voice surfaces) and Phase 3 (confidence-aware correction UX) deferred. See `VOICE_INPUT_USAGE.md` for the developer guide. |
| `VOICE_INPUT_USAGE.md` | **NEW** (2026-05-27) | Developer guide for the voice input module. Shows how to drop `<VoiceInput>` into a new surface, the per-profile flag semantics, server contract, and migration recipe from raw `useSpeechRecognition`. |
| `WRITING_SPELLING_DESIGN.md` | **CURRENT** (Phases 1–2 decided, IN PROGRESS) | Writing & spelling progression design for Lincoln (`FEAT-11`). Tap/voice-only (no forced typing); blend sight-word + phonics frontier word source; spelling as own tracked signal; phases: 1 = spell-the-word (tile assembly in quest), 2 = build-the-sentence. Phase 3 (dictate→reorder voice on-ramp) deferred. |
| `CAPTURE_PIPELINE_INVESTIGATION_2026-04-07.md` | **RESOLVED** | Today page capture pipeline: 3 fragmented entry points (camera icon, pre-completion scan, post-completion scan) competing for same visibility gate. Unified into single AI-routed handler. Worksheets→scans, everything else→artifacts. |
| `CLEANUP_AUDIT_2026_04_07.md` | **HISTORICAL** | Point-in-time audit (Apr 7): ladder deprecation status, milestone reachability, WorkbookConfig→ActivityConfig migration gaps |
| `HERO_HUB_ANIMATION_TUNING.md` | **CURRENT** | Hero Hub animation debug workflow — `?heroDebug=1` tuning panel, centralized config in `heroAnimationTuning.ts` |
| `HERO_HUB_ANIMATION_PR_QUEUE_TRIAGE_2026-04-07.md` | **RESOLVED** | PR queue triage for Hero Hub animation chain — merge order, duplicate branch cleanup |
| `HERO_HUB_DEPLOY_AUDIT_2026-04-07.md` | **RESOLVED** | Deploy audit validating merged animation guardrails/tuning reached production |
| `WORKBOOK_ACTIVITYCONFIG_BACKFILL.md` | **CURRENT** | Server-side guaranteed backfill: legacy workbookConfigs → activityConfigs before quest/AI dispatch |
| `first-principles-system-review.md` | **CURRENT** | Full-loop system review: evaluation → planning → execution, curriculum pacing, disposition tracking |
| `LONDON_BACKLOG.md` | **CURRENT** | London-specific work tracking per Lincoln-first / London-minimal policy |
| `SESSION_TIMER_HOURS_2026-04-14.md` | **HISTORICAL** | Session timer hours tracking investigation (Apr 14, 2026) |
| `SHELLY_PORTAL_CONTEXT.md` | **CURRENT** | Context document for Shelly Chat portal feature |
| `SHELLY_PORTAL_FEEDBACK_LOOP.md` | **CURRENT** | Feedback loop design for portal interactions; includes one-time human secret step for GitHub PAT |
| `barnes-shelly-chat-portal-design.md` | **CURRENT** | Shelly Chat portal design doc — tiered write model, action grammar, confirm-gate UX |
| `ARCH-10_rules_hardening_plan.md` | **CURRENT** (2026-06-01) | Firestore rules hardening plan for portal writes |
| `investigations/backend-reliability-assessment.md` | **CURRENT** | Backend reliability investigation |
| `DESIGN_MONTHLY_REVIEW_BOOK.md` | **CURRENT** | Monthly review book design — per-child monthly narrative, photo curation, section types, reader layouts. Phase 1 shipped. |
| `review/REVIEW_HOME_BASE.md` | **NEW** (2026-05-29) | Monthly deep audit coordination hub — 4-tier review priority, prompt-driven audit methodology |
| `review/ARCHITECTURE_AUDIT_2026-05.md` | **HISTORICAL** (2026-05-29) | May 2026 architecture audit — baseline green, Band 1 largest file analysis (ARCH-01–09), decomposition candidates |
| `review/ARCHITECTURE_AUDIT_2026-06.md` | **HISTORICAL** (2026-06-01) | June 2026 primary monthly architecture audit |
| `review/ARCHITECTURE_AUDIT_2026-06-21.md` | **HISTORICAL** (2026-06-21) | June 2026 mid-cycle supplement — ETHOS-01, ARCH-38/39, DATA-12 scoped findings |
| `review/ARCHITECTURE_AUDIT_2026-06-28.md` | **HISTORICAL** (2026-06-28) | June 2026 end-of-month audit — ETHOS-01/38/39/DATA-12 confirmed fixed; ARCH-40, DATA-13, DOC-07 new |
| `review/ARCHITECTURE_AUDIT_2026-07.md` | **HISTORICAL** (2026-07-05) | July 2026 primary monthly audit — ARCH-40/DOC-07/TEST-01(dad-lab) confirmed fixed; ARCH-41/42 new (name-gating regressions in KidTodayView/MyAvatarPage/KidLabView) |
| `review/ARCHITECTURE_AUDIT_2026-07-12.md` | **CURRENT** (2026-07-12) | July 2026 mid-cycle re-verification — baseline green; ARCH-01 first decrease in cycles (FEAT-58); ARCH-06 trend reversed (35→43 refs, FEAT-62); ARCH-41/42 still open unfixed; 7 ledger rows (FEAT-57–62, DOC-09) corrected from stale "PR open" to MERGED |
| `review/ALIGNMENT_AUDIT_2026-06-20.md` | **CURRENT** (2026-06-20) | Alignment audit — cross-feature consistency and operating-model alignment check |
| `review/LOOP_CLOSING_REVIEW_2026-07-15.md` | **CURRENT** (2026-07-15) | Adaptive loop-closing code review — what's already closed (quest→model→plan, stuck-chip→snapshot, foundations-review→quest) vs open (whatMattersNext surface, daily-signal seeding); proposed FEAT-64/65/66 sequence |
| `review/CHARTER_ALIGNMENT_SWEEP_2026-07-16.md` | **CURRENT** (2026-07-16) | Whole-system audit against **Barnes Family Learning Charter v2** — per-commitment ALIGNED/PARTIAL/DRIFT with file evidence (no-grades, no-shame, MVD, formation-first, dispositions-as-report-card, the loop, teach-back-as-evidence, whatMattersNext feedback, AI-assists-humans-decide, conundrums, weekly retro, London). Prioritized gap list → proposed FEAT-75→79 + one ARCH item. |
| `review/STATE_COMPLIANCE_DESIGN.md` | **CURRENT** (2026-06-27) | State-configurable compliance design (DATA-12) — MO active + byte-identical; TX + TEFA defined, not activated |
| `review/DECISION_FUNC-01_source_of_truth.md` | **CURRENT** (2026-05-30) | "Where is Lincoln" source-of-truth decision — layered ownership with named write-through (Model 2 adopted) |
| `review/INTEGRATION_MAP.md` | **CURRENT** (2026-06-01) | Integration seams audit — cross-feature data flow, dead-ends, routing gaps. Referenced from FEAT-07/08/09/10. |
| `review/PER_CHILD_DELINEATION_AUDIT.md` | **CURRENT** (2026-06-01) | Per-child data separation audit — shared-vs-per-child writes, cross-kid bleed risks. Referenced from DATA-04/DATA-05/FUNC-05. |
| `review/UI_CONSISTENCY_AUDIT.md` | **CURRENT** | UI consistency audit — hardcoded colors, inline sx usage, theme compliance |
| `review/UI_BATCH2_HEX_RECONCILIATION.md` | **CURRENT** | MUI hex vs theme palette reconciliation for batch 2 surfaces |
| `review/DATA_COMPONENT_TRACE.md` | **CURRENT** | Data component trace — data flow through UI components |
| `review/LONDON_EVAL_READINESS.md` | **CURRENT** | London evaluation readiness assessment — age-adjusted UX gap analysis |
| `review/LEARNING_MAP_DIAGNOSIS.md` | **CURRENT** (2026-06-20) | Why the Learning Map under-credits learned skills + proposed fix (companion to the fix run). Working levels never reach the map; fix reuses the `workingLevels.ts` tag→level maps. Anchored by DOC-06. |
| `review/HOURS_UNDERCOUNT_DIAGNOSIS.md` | **CURRENT** (2026-07-01) | Why completed checklist work is dropped from Records hours + fix options. Completed items with no matching tracked block count on Today but are dropped by Records once any block has actuals (carried-over items especially). Companion to the fix run; anchored by DATA-14. |
| `review/SCAN_CURRICULUM_DIAGNOSIS.md` | **CURRENT** (2026-07-01) | Why multiple scanned workbooks collapse to one config + multi-page scan gap + fix plan. `isWorkbookMatch`'s bare same-subject fallback merges distinct workbooks; find-or-create updates the survivor instead of creating. Companion to the fix run; anchored by DATA-15. |
| `review/prompts/` | **CURRENT** (2026-05-29) | Reusable audit prompts: `PROMPT_ARCH_AUDIT.md` (monthly), `PROMPT_AUTO_ARCH_FIX.md` (auto-fix runner), `PROMPT_BACKUP_CHECK.md`, `PROMPT_FIX.md` (issue runner) |
| `design-pass-v1/copy-pass-audit.md` | **CURRENT** | Design pass copy audit — terminology, tone, label consistency across UI surfaces |
| `archive/00_MASTER_SCOPE.md` | ARCHIVED | Original phased scope from Feb 2026. Phases 1-5 complete. |
| `archive/01–07_*.md` | ARCHIVED | Phase 1–5 specs, original testing plan, Saturday lab runbook — all superseded by current docs |
| `08_RUNBOOK.md` | **CURRENT** (Reference) | Operational runbook: deploy, backups, key rotation, troubleshooting |
| `archive/` | HISTORICAL | Old reference docs |

---

## Which Docs to Include — Context Guide

### Always Include (Core Reference)

| Document | Why |
|----------|-----|
| `MASTER_OUTLINE.md` | Single source of truth: features, status, sprint history |
| `FIRST_PRINCIPLES_ALIGNMENT.md` | Architecture direction: disposition tracking, conundrums, teach-back philosophy |
| `CLAUDE.md` | Build commands, constraints, conventions, project structure |

### Include When Working on Specific Areas

| Document | Use When |
|----------|----------|
| `SYSTEM_PROMPTS.md` | Working on AI prompts, task handlers, context slices |
| `KNOWLEDGE_MINE_BRIEF.md` | Working on quest/interactive evaluation |
| `barnes-story-game-workshop-design.md` | Working on workshop feature |
| `ENGINE_V2.md` | Working on engine/flywheel framework |
| `FIRESTORE_AUDIT.md` | Working on data model, indexes, collections |
| `WEEKLY_CONUNDRUM_ARC.md` | Working on conundrums, weekly theme integration |
| `ECONOMY_AUDIT_PART1.md` | Working on XP/Diamond economy code paths, event wiring |
| `ECONOMY_AUDIT_PART2.md` | Working on economy pacing, balance reconciliation, currency model |
| `STONEBRIDGE_BIBLE.md` | Working on narrative content, conundrums, chapter questions, Banner Rally |
| `GAME_WORLD_ECONOMY.md` | Working on XP/Diamond economy, armor forging, tier progression |
| `HEALTH_REPORT.md` | Working on code health, tech debt, bundle size optimization |
| `PROFILE_LIMITS_AUDIT.md` | Working on rate limits, AI usage caps, cost controls |
| `08_RUNBOOK.md` | Working on deployment, backups, operations |
| `barnes-testing-guide-v2.md` | Working on tests (stale — needs Knowledge Mine, Workshop, Books, Armor coverage) |
| `design-pass-v1/README.md` | Use when working on any v1 implementation queue item |
| `DESIGN_MONTHLY_REVIEW_BOOK.md` | Working on monthly review books, photo curation, kid reader |
| `DESIGN_VOICE_INPUT_MODULE.md` | Working on voice input, transcription, Whisper integration |
| `DESIGN_SKIP_SYSTEM_V2_2026-04-09.md` | Working on skip/rollover logic, scan-advance |
| `EVALUATION_METHODOLOGY_2026-04.md` | Working on blocker-driven learning engine, evaluation phases |
| `FINDINGS_PIPELINE.md` | Working on evaluation findings, conceptual blocks, merge semantics |
| `SCRIPT_CONVENTIONS.md` | Writing npm scripts (cross-env, Windows compat) |
| `LONDON_BACKLOG.md` | Working on London-specific features |
| `barnes-shelly-chat-portal-design.md` | Working on Shelly Chat portal writes, action grammar |
| `SHELLY_PORTAL_FEEDBACK_LOOP.md` | Working on feedback capture, feature request filing |
| `PROCESS_OVERVIEW.md` | Running any audit, onboarding to the dev loop / ledger discipline, tracing the kid learning loop |
| `review/REVIEW_HOME_BASE.md` | Running monthly audits, reviewing architecture health |
| `review/DECISION_FUNC-01_source_of_truth.md` | Working on data ownership, write-through rules |

---

## Google Drive Docs (`BarnesHomeschool/`)

These are family/values documents maintained outside the repo. They inform AI prompts and project direction but are not code artifacts.

| Document | Purpose | When |
|---|---|---|
| Barnes Family Learning Charter | Values, culture code, north star. System prompts reference this. | Always |
| Learner Profiles | Lincoln + London: levels, strengths, challenges, motivators, supports | When working on child context, evaluation |
| Shelly Feedback Action Plan | User requirements, build priorities, what Shelly wants next | When prioritizing features |
| Dad Lab Charter | Saturday lab vision, engineering + wonder philosophy | When working on Dad Lab |
| Kid Experience Design | Philosophy: acknowledgment not reward, diamonds not scores | When working on kid-facing UI |
| State Compliance Guide | MO/TX requirements for homeschool reporting | When working on hours/records |

---

## Other Key Files in Repo

| File | Purpose |
|---|---|
| `CLAUDE.md` | AI assistant instructions: build commands, constraints, conventions, project context |
| `src/core/types/` | Domain types split by area: `common.ts`, `family.ts`, `planning.ts`, `evaluation.ts`, `disposition.ts`, `books.ts`, `compliance.ts`, `dadlab.ts`, `workshop.ts`, `xp.ts`, `skillTags.ts`, `shellyChat.ts`, `monthlyReview.ts`, `feedback.ts`, `errorLog.ts`, `zod.ts` |
| `src/core/types/enums.ts` | All enum-like `as const` objects and companion types |
| `functions/src/ai/chat.ts` | Cloud Function: system prompt assembly, enriched context, quest prompt |
| `src/features/quest/questTypes.ts` | Knowledge Mine types (QuestState, SessionQuestion, InteractiveSessionData) |
| `src/features/quest/questAdaptive.ts` | Pure adaptive logic (level up/down, frustration limit, streak calculation) |
| `scripts/check-docs-alignment.mjs` | Docs & data alignment checker (DOC-08 + DOC-09) — 6 drift checks + 3 resilience checks; `npm run docs:check` / `docs:fix`. See `DOCS_ALIGNMENT.md`. |
| `scripts/docs-alignment.allow.json` | Checker config + allowlists (collection-count docs, EvidenceRef kinds, raw refs) — every entry carries a reason + owning ledger ID. |

---

## Workflow

```
Claude.ai (design chat)
  ↓ designs features, generates prompts, reviews architecture
  ↓
Claude Code (this repo)
  ↓ builds features, updates repo docs, runs tests
  ↓
Google Drive (BarnesHomeschool/)
  → family/values docs (Charter, Learner Profiles, Shelly Feedback)
  → referenced by system prompts but not stored in repo
```

- **Claude.ai** is the design + strategy layer — Shelly and Nathan discuss features, generate prompt drafts, review priorities
- **Claude Code** is the build layer — implements features, maintains repo docs, runs CI
- **Google Drive** holds family context documents that are referenced by AI system prompts but don't belong in a code repo
