# First Principles Engine — Document Index

> Where everything lives. Updated 2026-04-05.

---

## Repo Docs (`/docs`)

| Document | Status | Notes |
|---|---|---|
| `MASTER_OUTLINE.md` | **CURRENT** (v15) | Single source of truth: features, status, sprint history. Updated Apr 5: Two-currency economy, curriculum pipeline, activity configs, Learning Map, quest expansion, book themes, planning improvements |
| `DOCUMENT_INDEX.md` | **CURRENT** | This file — maps all docs in repo and Google Drive |
| ~~`PARENT_EXPERIENCE_AUDIT.md`~~ | REMOVED | Superseded by `FIRST_PRINCIPLES_ALIGNMENT.md` |
| ~~`PARENT_EXPERIENCE_ALIGNMENT_PLAN.md`~~ | REMOVED | All items done Mar 25, 2026. Superseded by `FIRST_PRINCIPLES_ALIGNMENT.md` |
| `FIRESTORE_AUDIT.md` | **STALE** (Mar 21) | Data model, indexes, collections audit — stale since Mar 21. CLAUDE.md table is now authoritative at 31 collections + 2 subcollections. |
| `WEEKLY_CONUNDRUM_ARC.md` | **CURRENT** | Weekly conundrum story arc design — Stonebridge narrative, recurring characters, ethical reasoning scenarios |
| `KNOWLEDGE_MINE_BRIEF.md` | **CURRENT** | Interactive evaluation design doc (Knowledge Mine) — Phase 1 shipped |
| `barnes-story-game-workshop-design.md` | **CURRENT** | Story Game Workshop design doc — wizard, 3 game types, art gen, voice recording, playtester, play experience |
| `ENGINE_V2.md` | **CURRENT** | Learning framework: family snapshot, curriculum mapping, energy modes, weekly rhythm |
| `FIRST_PRINCIPLES_ALIGNMENT.md` | **NEW** | Ad Astra pedagogy alignment — disposition tracking, conundrums, teach-back philosophy |
| `GAME_WORLD_ECONOMY.md` | **CURRENT** | Two-currency economy design (XP + Diamonds), choice-based armor forging, Stonebridge world |
| `HEALTH_REPORT.md` | **CURRENT** | Weekly code health metrics — line counts, test coverage, bundle size, tech debt tracking |
| `PROFILE_LIMITS_AUDIT.md` | **CURRENT** | Profile-based rate limits and experience audit — AI usage caps, generation limits, cost controls |
| `SYSTEM_PROMPTS.md` | **CURRENT** (v4) | Task dispatch, model selection, context slices — 13 task types including scan + shellyChat |
| `barnes-testing-guide-v2.md` | **STALE** | Needs update — missing Knowledge Mine, Workshop, Books, Avatar/Armor coverage |
| `KNOWLEDGE_MINE_AUDIT_2026-04.md` | **NEW** | Knowledge Mine audit (Part 1/4): quest type inventory, level system analysis, Level 7 mystery resolution, difficulty progression, Lincoln constraint compliance |
| `KNOWLEDGE_MINE_CRASH_INVESTIGATION_2026-04-07.md` | **NEW** | Crash investigation: session ejection + precision TypeError + resume card failure after Level 6→7 promotion in comprehension quest. Root cause chain identified, 7 fixes proposed. |
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
| `GAME_WORLD_ECONOMY.md` | Working on XP/Diamond economy, armor forging, tier progression |
| `HEALTH_REPORT.md` | Working on code health, tech debt, bundle size optimization |
| `PROFILE_LIMITS_AUDIT.md` | Working on rate limits, AI usage caps, cost controls |
| `08_RUNBOOK.md` | Working on deployment, backups, operations |
| `barnes-testing-guide-v2.md` | Working on tests (stale — needs Knowledge Mine, Workshop, Books, Armor coverage) |

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
| `src/core/types/` | Domain types split by area: `common.ts`, `family.ts`, `planning.ts`, `evaluation.ts`, `books.ts`, `compliance.ts`, `dadlab.ts`, `workshop.ts`, `xp.ts`, `skillTags.ts`, `shellyChat.ts`, `zod.ts` |
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
