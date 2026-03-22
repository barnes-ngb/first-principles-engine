# First Principles Engine — Document Index

> Where everything lives. Updated 2026-03-22.

---

## Repo Docs (`/docs`)

| Document | Status | Notes |
|---|---|---|
| `MASTER_OUTLINE.md` | **CURRENT** | Single source of truth for project status, feature inventory, sprint history |
| `DOCUMENT_INDEX.md` | **CURRENT** | This file — maps all docs in repo and Google Drive |
| `KNOWLEDGE_MINE_BRIEF.md` | **CURRENT** | Interactive evaluation design doc (Knowledge Mine) — Phase 1 shipped, implementation status added Mar 22 |
| `00_MASTER_SCOPE.md` | HISTORICAL | Original phased scope from Feb 2026. Phases 1-5 complete. |
| `01_MVP_V0_1.md` | HISTORICAL | Phase 1 — MVP (Today, artifacts, engine, records) |
| `02_ENGINE_LADDERS.md` | HISTORICAL | Phase 2 — Engine + Ladders |
| `03_RECORDS_COMPLIANCE.md` | HISTORICAL | Phase 3 — Records + Compliance |
| `04_MEDIA_CAPTURE.md` | HISTORICAL | Phase 4 — Media Capture |
| `05_DEPLOYMENT_OPERATIONS.md` | HISTORICAL | Phase 5 — Deployment + Ops |
| `06_TESTING_PLAN.md` | HISTORICAL | Phase testing plan |
| `07_SATURDAY_LAB_RUNBOOK.md` | HISTORICAL | Saturday lab runbook |
| `08_RUNBOOK.md` | HISTORICAL | Operational runbook |
| `ENGINE_V2.md` | **CURRENT** | Engine framework (flywheel, stages, scoring) |
| `SYSTEM_PROMPTS.md` | STALE | Needs update — quest prompt added, evaluation prompt significantly expanded since Mar 7 |
| `barnes-testing-guide-v2.md` | STALE | Needs update — Knowledge Mine, engagement, print materials, skip guidance untested |
| `archive/` | HISTORICAL | Old reference docs |

---

## Google Drive Docs (`BarnesHomeschool/`)

These are family/values documents maintained outside the repo. They inform AI prompts and project direction but are not code artifacts.

| Document | Purpose |
|---|---|
| Barnes Family Learning Charter | Values, culture code, north star. System prompts reference this. |
| Learner Profiles | Lincoln + London: levels, strengths, challenges, motivators, supports |
| Shelly Feedback Action Plan | User requirements, build priorities, what Shelly wants next |
| Dad Lab Charter | Saturday lab vision, engineering + wonder philosophy |
| Kid Experience Design | Philosophy: acknowledgment not reward, diamonds not scores |
| State Compliance Guide | MO/TX requirements for homeschool reporting |

---

## Other Key Files in Repo

| File | Purpose |
|---|---|
| `CLAUDE.md` | AI assistant instructions: build commands, constraints, conventions, project context |
| `src/core/types/domain.ts` | All TypeScript domain types (50+ interfaces) |
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
