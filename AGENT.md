# AGENT.md — How We Work (First Principles Engine)
Date: 2026-02-07

This repo is built in two modes:

- **Agent mode** = planning, scoping, alignment, checklists, acceptance criteria, “what/why”
- **Codex mode** = implementation, file edits, refactors, commits, tests, “do the work”

The goal is to keep momentum while preventing scope creep and churn.

---

## 1) North Star
**First Principles Engine** is a phone-fast family learning notebook that:
- expresses our **Charter/Ethos**
- runs daily school (Plan A / Plan B)
- captures **evidence artifacts** (notes/photos/audio)
- visualizes weekly progress (**Flywheel**)
- tracks growth (**Ladders + Milestones**)
- exports records (MO-friendly: logs + hours + portfolio + eval)

---

## 2) Non‑negotiables (Project Principles)
1. **Frictionless daily use**: “Today” must be usable in under 60 seconds.
2. **Small artifacts > perfect documentation**: capture evidence quickly.
3. **Narration counts**: audio evidence is first-class (especially for Lincoln).
4. **Tags power everything**: engineStage + subjectBucket + location + ladderRef.
5. **Defaults everywhere**: reduce decision fatigue.
6. **No heroics**: ship thin slices; keep UI simple; iterate.

---

## 3) Roles & Responsibilities
### Agent (planning + alignment)
Agent produces:
- scope docs, acceptance criteria, risks
- task breakdowns and priorities
- data model / UX rules (no code edits)
- “Codex prompts” that are specific and file-scoped

Agent avoids:
- editing actual repo files
- long speculative rewrites
- over-optimizing early architecture

### Codex (implementation)
Codex produces:
- file changes (adds/edits)
- working features
- cleanup, refactors, tests
- small commits with clear messages

Codex avoids:
- changing scope without updating docs
- large rewrites without a clear benefit

---

## 4) Workflow (the loop)
### A) Plan (Agent)
- Choose **one phase slice** (see plan docs)
- Define **acceptance criteria**
- Define **data inputs/outputs**
- Write a **Codex prompt** that is:
  - explicit on files to create/edit
  - explicit on behavior
  - explicit on constraints (phone-fast, minimal)

### B) Build (Codex)
- Implement the slice
- Keep changes small
- Commit early and often

### C) Verify
- Run app locally
- Sanity checks:
  - no console errors
  - data saved + loads correctly
  - UI works on mobile viewport (basic)

### D) Document
- Update the relevant phase doc:
  - mark checklist items complete
  - record decisions that matter

---

## 5) Definition of Done (MVP v0.1)
A week is “working” when we can:
- log DayLog blocks + minutes
- capture ≥ 3 artifacts (Wonder, Explain, Reflect)
- see flywheel status for each child on Engine page
- export Daily Log CSV and see hours totals in Records

---

## 6) Repo Conventions
### Naming
- Repo: `first-principles-engine`
- App name in UI: **First Principles Engine**
- “Family” default id for MVP: `demo-family` (until auth added)

### Dates
- Store dates as `YYYY-MM-DD` strings for easy Firestore queries and sorting.

### Tags (required for artifacts)
- `childId`
- `engineStage` (Wonder/Build/Explain/Reflect/Share)
- `subjectBucket` (Reading/LanguageArts/Math/Science/SocialStudies/Other)
- `location` (Home/Away)
- `domain` (free-text)
- optional: `ladderRef`, `weekId`, `dayId`, `pillar`

### Mobile-first UI
- large tap targets
- minimal text entry
- prefer dropdowns + templates
- keep forms short

---

## 7) Firestore Collections (v1)
All under: `families/{familyId}/`

- `children`
- `weeks`
- `days`
- `artifacts`
- `hours`
- `evaluations`
- `ladders`
- `milestoneProgress`

---

## 8) Commit & PR Guidelines
### Commit style
Use clear prefixes:
- `chore: ...`
- `feat: ...`
- `fix: ...`
- `refactor: ...`
- `docs: ...`

### Small slices
Aim for commits that:
- implement one component / one flow
- can be reverted cleanly
- do not mix scope areas

---

## 9) Risk Guardrails
- If a feature adds friction to **Today**, it’s a red flag.
- If we add a field that parents must fill every time, default it.
- If we can’t explain why a feature exists in one sentence, defer it.

---

## 10) Where to Look (Alignment Docs)
- `docs/00_MASTER_SCOPE.md`
- `docs/01_MVP_V0_1.md`
- `docs/02_ENGINE_LADDERS.md`
- `docs/03_RECORDS_COMPLIANCE.md`
- `docs/04_MEDIA_CAPTURE.md`
- `docs/05_DEPLOYMENT_OPERATIONS.md`

---

## 11) How to Request Work
### Ask Agent when you need
- a scope doc
- acceptance criteria
- a plan for the next slice
- “what should we do next?”

### Ask Codex when you need
- new files/components
- integration wiring
- refactors
- bug fixes
- test additions

---

## 12) Current Phase (set this as you work)
- [x] Phase 1 — MVP v0.1
- [x] Phase 2 — Engine + Ladders
- [x] Phase 3 — Records + Compliance Pack
- [ ] Phase 4 — Media Capture
- [ ] Phase 5 — Deployment + Ops
