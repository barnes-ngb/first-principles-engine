# First Principles Engine — Document Index

> Where everything lives. Updated 2026-03-31.

---

## Repo Docs (`/docs`)

| Document | Status | Notes |
|---|---|---|
| `MASTER_OUTLINE.md` | **CURRENT** (v14) | Single source of truth: features, status, sprint history. Updated Mar 31: 4 file decompositions (22 new components), architecture audit, first-week polish, materials theming, weekly review fixes |
| `DOCUMENT_INDEX.md` | **CURRENT** | This file — maps all docs in repo and Google Drive |
| ~~`PARENT_EXPERIENCE_AUDIT.md`~~ | REMOVED | Superseded by `FIRST_PRINCIPLES_ALIGNMENT.md` |
| ~~`PARENT_EXPERIENCE_ALIGNMENT_PLAN.md`~~ | REMOVED | All items done Mar 25, 2026. Superseded by `FIRST_PRINCIPLES_ALIGNMENT.md` |
| `FIRESTORE_AUDIT.md` | **STALE** (Mar 21) | Data model, indexes, collections audit — code now has 27 collections (scans added); `sessions` orphan removed; `wordProgress` subcollection still referenced in quest.ts |
| `WEEKLY_CONUNDRUM_ARC.md` | **CURRENT** | Weekly conundrum story arc design — Stonebridge narrative, recurring characters, ethical reasoning scenarios |
| `KNOWLEDGE_MINE_BRIEF.md` | **CURRENT** | Interactive evaluation design doc (Knowledge Mine) — Phase 1 shipped |
| `barnes-story-game-workshop-design.md` | **CURRENT** | Story Game Workshop design doc — wizard, 3 game types, art gen, voice recording, playtester, play experience |
| `ENGINE_V2.md` | **CURRENT** | Engine framework (flywheel, stages, scoring) |
| `FIRST_PRINCIPLES_ALIGNMENT.md` | **NEW** | Ad Astra pedagogy alignment — disposition tracking, conundrums, teach-back philosophy |
| `SYSTEM_PROMPTS.md` | **STALE** (Mar 21) | Task dispatch, model selection, context slices — needs update for scan task handler (12 total), unified weekly focus, disposition prompts |
| `barnes-testing-guide-v2.md` | **STALE** | Needs update — missing Knowledge Mine, Workshop, Books, Avatar/Armor coverage |
| `00_MASTER_SCOPE.md` | HISTORICAL | Original phased scope from Feb 2026. Phases 1-5 complete. |
| `01_MVP_V0_1.md` | HISTORICAL | Phase 1 — MVP (Today, artifacts, engine, records) |
| `02_ENGINE_LADDERS.md` | HISTORICAL | Phase 2 — Engine + Ladders |
| `03_RECORDS_COMPLIANCE.md` | HISTORICAL | Phase 3 — Records + Compliance |
| `04_MEDIA_CAPTURE.md` | HISTORICAL | Phase 4 — Media Capture |
| `05_DEPLOYMENT_OPERATIONS.md` | HISTORICAL | Phase 5 — Deployment + Ops |
| `06_TESTING_PLAN.md` | HISTORICAL | Phase testing plan |
| `07_SATURDAY_LAB_RUNBOOK.md` | HISTORICAL | Saturday lab runbook |
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
| `barnes-testing-guide-v2.md` | Working on tests |

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
| `src/core/types/` | Domain types split by area: `common.ts`, `family.ts`, `planning.ts`, `evaluation.ts`, `books.ts`, `compliance.ts`, `dadlab.ts`, `workshop.ts`, `xp.ts`, `skillTags.ts` |
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
