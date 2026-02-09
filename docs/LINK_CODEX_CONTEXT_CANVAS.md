# Codex Context Engineering Canvas — First Principles Engine
Date: 2026-02-08

Use this document as the **single source of truth** for Codex when you ask it to implement changes.
Keep it short, explicit, and file-scoped.

> Tip: OpenAI Codex prompting guidance emphasizes providing clear context, referencing relevant files, and being explicit about constraints and acceptance criteria. citeturn0search2turn0search0turn0search9

---

## 1) Product identity
**App name:** First Principles Engine  
**Purpose:** A family learning notebook that cuts noise and keeps a simple learning engine running—especially for Lincoln.

### Primary outcomes
- Daily flow is **frictionless** on a phone.
- Evidence capture is fast and meaningful.
- Weekly progress is visible (flywheel + ladders).
- Records can be exported (hours + logs).

---

## 2) Core users & roles
### Roles
- **Parent**: full access; creates plans/ladders; reviews/approves evidence; exports records.
- **Lincoln**: icon-driven daily check-in + proof; minimal text; sees “current rung / next rung”.
- **London**: language + teach-back + lab; can submit proof; sees limited progress.

### Role rules
- Only **Parents** can mark rungs achieved (kids can “suggest”).
- Kids mostly create **daily additions** (Done + minutes + “felt” + quick proof).
- Both kids can use **Dad Lab** (Lab Mode).

---

## 3) Lincoln “Noise-cut” learning spec (drives UI)
### Only 4 priorities
1) Literacy Engine (daily)
2) Math Engine (daily)
3) Speech/Language micro-reps (daily)
4) Curiosity Engine (weekly deep work: Dad Lab)

### Plan A / Plan B
- **Plan A:** Formation + Literacy + Math + Together
- **Plan B:** 20m Literacy + 15–20m Math, done—no guilt.

### Weekly sensors (Scoreboard)
- phonics mastery count
- decodable fluency (WCPM)
- spelling % (8–10 words)
- math mixed review (/10)
- independence start (Y/N)

---

## 4) IA: pages and what they contain
### Dashboard
- Parent: overview + review queue + start Lab
- Lincoln: big icon tiles (Formation, Literacy, Math, Together, Dad Lab) with Done/minutes/felt
- London: Language, Teach-back, Dad Lab, optional Service

### Scoreboard
- Parent: edit weekly sensors per child
- Kids: read-only “wins/level-up” summary

### Dad Lab (Lab Mode)
- Mission + constraints + roles
- 5 stage capture buttons: Wonder/Build/Explain/Reflect/Share
- End: “Tell the story” (3 sentences or short narration)

### Ladders
- Parent: full ladders + link evidence + mark achieved
- Kids: current rung + examples + submit proof (suggest link)

### Records
- Parent only: hours totals + exports

### Settings
- Parent: seed data, role mode, theme mode

---

## 5) Data model & Firestore paths (v1)
All docs under: `families/{familyId}/`

- `children/`
- `weeks/`
- `days/`
- `artifacts/`
- `hours/`
- `weeklyMetrics/` (Scoreboard sensors)
- `ladders/`
- `milestoneProgress/`
- `labSessions/` (Dad Lab sessions)

### Required Artifact tags
- `childId`
- `engineStage` (Wonder/Build/Explain/Reflect/Share)
- `subjectBucket` (Reading/LanguageArts/Math/Science/SocialStudies/Other)
- `location` (Home/Away)
- `domain` (free text)
- optional: `ladderRef`, `weekId`, `dayId`, `labSessionId`

---

## 6) Tech stack & constraints
- React + TypeScript + Vite
- MUI (Material UI)
- Firebase Firestore (+ Storage later)
- Mobile-first: big tap targets, minimal typing, default values.

### Visual style constraints
- Kid vibes: voxel/pixel-inspired is ok.
- **No copyrighted characters/assets** (no Minecraft blocks, no Mario art).

---

## 7) Coding rules for Codex
When you implement:
- Prefer **small, file-scoped** edits.
- Avoid rewrites unless requested.
- No new libraries without a reason.
- Add `try/catch` for Firestore calls and show user-friendly errors.
- Add unit tests for pure logic (Vitest) when you touch logic.

---

## 8) Acceptance criteria template
For any task, define:
- What page/role is impacted
- What data is created/updated
- What “done” looks like (click path)
- What is explicitly out-of-scope

---

## 9) Where to put repo instructions for Codex
Codex can read repo-level instruction files (commonly `AGENTS.md`) to keep behavior consistent across changes. citeturn0search0turn0search2

Recommended:
- Root: `AGENTS.md` (working rules)
- Docs: `docs/agent/*.md` (phase scopes)
