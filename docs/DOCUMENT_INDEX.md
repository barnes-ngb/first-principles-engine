# First Principles Engine — Document Index

> Where everything lives. Updated 2026-06-01.

---

## Repo Docs (`/docs`)

| Document | Status | Notes |
|---|---|---|
| `MASTER_OUTLINE.md` | **CURRENT** (v15) | Single source of truth: features, status, sprint history. Updated May 26, 2026: Design Pass v1 implementation queue added, Faith Stats kid-layer + no-judge vocab guardrail recorded as Key Design Decisions. |
| `design-pass-v1/` | **CURRENT** | 10 mobile + 6 tablet design mocks + handoff README for v1 refine pass (May 26, 2026) |
| `DOCUMENT_INDEX.md` | **CURRENT** | This file — maps all docs in repo and Google Drive |
| ~~`PARENT_EXPERIENCE_AUDIT.md`~~ | REMOVED | Superseded by `FIRST_PRINCIPLES_ALIGNMENT.md` |
| ~~`PARENT_EXPERIENCE_ALIGNMENT_PLAN.md`~~ | REMOVED | All items done Mar 25, 2026. Superseded by `FIRST_PRINCIPLES_ALIGNMENT.md` |
| `FIRESTORE_AUDIT.md` | **STALE** (Mar 21) | Data model, indexes, collections audit — stale since Mar 21. CLAUDE.md table is now authoritative at 31 collections + 2 subcollections. |
| `WEEKLY_CONUNDRUM_ARC.md` | **CURRENT** | Weekly conundrum story arc design — Stonebridge narrative, recurring characters, ethical reasoning scenarios |
| `KNOWLEDGE_MINE_BRIEF.md` | **CURRENT** | Interactive evaluation design doc (Knowledge Mine) — Phase 1 shipped |
| `barnes-story-game-workshop-design.md` | **CURRENT** | Story Game Workshop design doc — wizard, 3 game types, art gen, voice recording, playtester, play experience |
| `ENGINE_V2.md` | **CURRENT** | Learning framework: family snapshot, curriculum mapping, energy modes, weekly rhythm |
| `FIRST_PRINCIPLES_ALIGNMENT.md` | **NEW** | Ad Astra pedagogy alignment — disposition tracking, conundrums, teach-back philosophy |
| `ECONOMY_AUDIT_PART1.md` | **CURRENT** | Economy code inventory — earning/spending paths, collection audit, event types |
| `ECONOMY_AUDIT_PART2.md` | **CURRENT** | Economy unified model — two-currency design, balance reconciliation, pacing math |
| `STONEBRIDGE_BIBLE.md` | **CURRENT** | Canonical narrative world bible — 8 places, 10+ characters, values, tone, continuity rules |
| `GAME_WORLD_ECONOMY.md` | **CURRENT** | Two-currency economy design (XP + Diamonds), choice-based armor forging, Stonebridge world |
| `HEALTH_REPORT.md` | **CURRENT** | Weekly code health metrics — line counts, test coverage, bundle size, tech debt tracking |
| `PROJECT_CONTEXT.md` | **CURRENT** (auto-generated 2026-05-29) | Synthesized project context file for Claude.ai — family context, current sprint, nav structure, AI task registry, key design decisions. Regenerated on demand from repo docs + Drive docs. |
| `PROFILE_LIMITS_AUDIT.md` | **CURRENT** | Profile-based rate limits and experience audit — AI usage caps, generation limits, cost controls, per-function model + cost-per-call mapping |
| `SYSTEM_PROMPTS.md` | **CURRENT** (v4, updated 2026-05-29) | Task dispatch, model selection, context slices — 17 task types in `tasks/index.ts` registry (plan, chat, generate, evaluate, quest, generateStory, reviseStory, revisePage, workshop, analyzeWorkbook, disposition, conundrum, weeklyFocus, scan, shellyChat, chapterQuestions, monthlyReview); `analyzeEvaluationPatterns` exported separately |
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
| `review/ARCHITECTURE_AUDIT_2026-06.md` | **CURRENT** (2026-06-01) | June 2026 monthly architecture audit |
| `review/DECISION_FUNC-01_source_of_truth.md` | **CURRENT** (2026-05-30) | "Where is Lincoln" source-of-truth decision — layered ownership with named write-through (Model 2 adopted) |
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
