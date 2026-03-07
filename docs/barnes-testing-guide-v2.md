# First Principles Engine — Testing Guide (v2)

> Last updated: 2026-03-07

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Weekly Planning Flow](#2-weekly-planning-flow)
3. [Daily Execution Flow](#3-daily-execution-flow)
4. [Evaluation Flow](#4-evaluation-flow)
5. [Dad Lab Flow](#5-dad-lab-flow)
6. [Records & Compliance](#6-records--compliance)
7. [Quick Smoke Test (5 min)](#7-quick-smoke-test-5-min)
8. [Common Issues & Troubleshooting](#8-common-issues--troubleshooting)

---

## 1. Prerequisites

### Environment Setup

- **Node.js**: 18+ (check: `node -v`)
- **npm**: 9+ (check: `npm -v`)
- **Firebase CLI**: installed globally (`npm i -g firebase-tools`)
- **Firebase project**: configured and authenticated (`firebase login`)

### Local Development

```bash
# Install dependencies
npm install
cd functions && npm install && cd ..

# Start dev server
npm run dev

# Start Firebase emulators (separate terminal)
cd functions && npm run serve
```

### Running Tests

```bash
# All unit tests
npm test

# Type-check only
npx tsc -b

# Lint
npm run lint

# Full build (tsc + vite)
npm run build
```

### Required State

Before testing flows, ensure:

1. **Logged in** — Anonymous auth auto-creates on first visit; upgrade to email for persistence
2. **Family created** — At least one family with `familyId` matching auth UID
3. **Children added** — Lincoln and London profiles in `families/{familyId}/children`
4. **At least one ladder** — Reading or Math ladder in `families/{familyId}/ladders`

### Accounts & Profiles

| Profile | Role | What They See |
|---------|------|---------------|
| Parent (Shelly/Nathan) | Full access | All routes, all admin features |
| Lincoln | Kid | Today, My Stuff, Dad Lab |
| London | Kid | Today, My Stuff, Dad Lab |

Profile selection happens at `/login` (ProfileSelectPage) before accessing the app.

---

## 2. Weekly Planning Flow

**Route:** `/planner/chat` (parent-only)

**Purpose:** AI-powered conversational weekly plan creation.

### Step-by-step

1. **Navigate** to Plan My Week from sidebar (or `/planner/chat`)
2. **Verify** profile selection gate — must be logged in as parent
3. **Select child** — choose Lincoln or London from the child selector
4. **Start conversation** — the chat interface loads with a greeting
5. **Provide context** — tell the AI about the week:
   - Energy level expectations
   - Any schedule constraints ("we have a dentist appointment Tuesday")
   - Focus areas ("Lincoln needs extra phonics this week")
   - App blocks to include ("Reading Eggs 15 min daily")
6. **Request plan generation** — say "generate the plan" or "make a plan"
7. **Verify JSON response** — AI should return a `DraftWeeklyPlan` JSON:
   - [ ] 5 days (Monday-Friday)
   - [ ] Each day has a `timeBudgetMinutes`
   - [ ] Formation block first each day
   - [ ] 3-4 items marked `mvdEssential: true`
   - [ ] Items have `category`: `"must-do"` or `"choose"`
   - [ ] App blocks have `isAppBlock: true`
   - [ ] Valid `subjectBucket` values
   - [ ] `minimumWin` sentence present
8. **Review plan preview** — plan should render in the UI preview panel
9. **Accept/modify** — user can accept items, remove them, or ask for changes
10. **Save plan** — confirm it writes to `families/{familyId}/weeks/{weekKey}`

### What to Watch For

- Plan respects hours budget (doesn't exceed daily limit)
- MVD items are the core 3-4 (formation, math, reading, speech if applicable)
- Skip suggestions populated if AI sees redundancy
- Recent evaluation context is injected (check that recommendations appear)
- Enriched context loads: workbook pace, recent sessions, hours progress

---

## 3. Daily Execution Flow

**Route:** `/today`

**Purpose:** Daily log, routine tracking, artifact capture.

### Step-by-step

1. **Navigate** to Today (default route, `/today`)
2. **Verify date** — shows today's date, correct day of week
3. **Select child** — switch between Lincoln and London
4. **Choose plan type:**
   - [ ] Normal Day — full routine loads
   - [ ] MVD (Minimum Viable Day) — only `must-do` items show
5. **Set energy level** — normal / low / overwhelmed
6. **Work through sessions:**
   - [ ] Tap a session to start it
   - [ ] Log result: hit / near / miss
   - [ ] Session timer tracks duration
   - [ ] Session saves to `families/{familyId}/sessions`
7. **Capture artifacts:**
   - [ ] Photo — camera or gallery upload
   - [ ] Audio — record narration
   - [ ] Note — quick text entry
   - [ ] Verify tags: childId, engineStage, subjectBucket, location
   - [ ] Artifact saves to `families/{familyId}/artifacts`
8. **Log hours:**
   - [ ] Hours auto-calculated from sessions
   - [ ] Manual hours entry available
   - [ ] Subject bucket attribution
   - [ ] Saves to `families/{familyId}/hours`
9. **End of day:**
   - [ ] All sessions marked complete or skipped
   - [ ] Daily plan saved to `families/{familyId}/dailyPlans`
   - [ ] Hours total visible

### What to Watch For

- MVD mode hides non-essential items (only `must-do` / `mvdEssential` items)
- Energy level persists if page is refreshed
- Audio recording works on mobile (test on phone)
- Large tap targets — usable with one thumb
- Session results update the scoreboard in real-time

---

## 4. Evaluation Flow

**Route:** `/evaluate`

**Purpose:** AI-guided diagnostic skill assessment (reading, math, etc.)

### Step-by-step

1. **Navigate** to Evaluate from sidebar (or `/evaluate`)
2. **Select child** — choose Lincoln or London
3. **Select domain** — reading (primary), math, or other
4. **Start evaluation chat:**
   - [ ] AI introduces itself as a diagnostic specialist
   - [ ] First prompt: specific instruction to parent ("Ask him to read: cat, hat, sat")
5. **Report results to AI:**
   - [ ] Type what the child did ("He got cat and hat but not sat")
   - [ ] AI should respond with a `<finding>` block in the response
6. **Verify finding extraction:**
   - [ ] `<finding>` JSON parsed by the app
   - [ ] Skill tag, status, evidence, notes captured
   - [ ] Finding appears in the UI findings panel
7. **Continue 3-4 exchanges:**
   - [ ] AI adapts — skips mastered areas, digs deeper on struggles
   - [ ] Each response includes at least one `<finding>` block
   - [ ] AI progresses through diagnostic levels appropriately
8. **Complete evaluation:**
   - [ ] AI outputs a `<complete>` block
   - [ ] Verify all fields: summary, frontier, recommendations, skipList, supports, stopRules, evidenceDefinitions, nextEvalDate
   - [ ] `nextEvalDate` is 4-6 weeks from today
9. **Save evaluation:**
   - [ ] Evaluation session saved to `families/{familyId}/evaluationSessions`
   - [ ] Skill snapshot updated at `families/{familyId}/skillSnapshots/{childId}`
   - [ ] Supports and stop rules from `<complete>` block stored

### What to Watch For

- AI never gives multiple diagnostic steps at once (one step at a time)
- AI uses specific words/examples, not vague instructions
- Finding blocks contain valid JSON
- Complete block `supports` are specific to observed behavior (not generic)
- Complete block `stopRules` are actionable ("If Lincoln misses 3 in a row, stop")
- `nextEvalDate` is correctly calculated from today's date

---

## 5. Dad Lab Flow

**Route:** `/dad-lab`

**Purpose:** Saturday lab sessions — Nathan leads hands-on project-based learning.

### Step-by-step

1. **Navigate** to Dad Lab from sidebar (or `/dad-lab`)
2. **Create a new lab plan:**
   - [ ] Select a topic or project theme
   - [ ] Set estimated duration
   - [ ] Add materials list
   - [ ] Optionally generate AI suggestions for activities
   - [ ] Plan saves to `families/{familyId}/dadLab`
3. **Start the lab session:**
   - [ ] Tap "Start Lab" to begin
   - [ ] Timer starts tracking session duration
   - [ ] Session state: `planned` → `active`
4. **Lincoln contributes:**
   - [ ] Switch to Lincoln's profile (or Lincoln's device)
   - [ ] Lincoln sees the kid lab view
   - [ ] Lincoln can capture artifacts (photos, audio narration, notes)
   - [ ] Artifacts tagged with `engineStage`, `domain: dadlab`
   - [ ] Lincoln's contributions appear in the lab session
5. **London contributes:**
   - [ ] Same flow as Lincoln
   - [ ] Age-appropriate interface
6. **Complete the lab:**
   - [ ] End the session
   - [ ] Session state: `active` → `complete`
   - [ ] Review captured artifacts
   - [ ] Lab report summary generated
   - [ ] Hours logged to `families/{familyId}/hours`
   - [ ] Session saved to `families/{familyId}/labSessions`

### What to Watch For

- Kid profile view is simplified — large buttons, minimal text
- Audio recording works for Lincoln's narration
- Artifacts properly tagged with dad lab metadata
- Hours from lab session count toward yearly total
- Lab report captures both children's contributions

---

## 6. Records & Compliance

**Route:** `/records` (parent-only)

**Purpose:** Hours tracking, evaluations, portfolio, and MO-compliant exports.

### Step-by-step

1. **Navigate** to Records from sidebar (or `/records`)

#### Hours Summary
2. **View hours dashboard:**
   - [ ] Total hours this school year (Aug 1 - Jun 30)
   - [ ] Progress toward 1000-hour MO target
   - [ ] Hours by subject bucket breakdown
   - [ ] Per-child hours split
3. **Manual hours entry:**
   - [ ] Add hours for field trips, co-ops, etc.
   - [ ] Select child, subject, date, minutes
   - [ ] Entry saves to `families/{familyId}/hours`

#### Evaluations (`/records/evaluations`)
4. **Monthly evaluation form:**
   - [ ] Navigate to evaluations sub-route
   - [ ] Fill out monthly progress narrative
   - [ ] Per-child, per-subject observations
   - [ ] Save to `families/{familyId}/evaluations`

#### Portfolio (`/records/portfolio`)
5. **Demo night highlights:**
   - [ ] Navigate to portfolio sub-route
   - [ ] Select artifacts for showcase
   - [ ] Add narrative context
   - [ ] Preview portfolio layout

#### Export Pack
6. **Generate export:**
   - [ ] CSV: hours log (date, child, subject, minutes)
   - [ ] CSV: daily activity log
   - [ ] Markdown: evaluations
   - [ ] Markdown: portfolio highlights
   - [ ] Download all as a bundle

#### Weekly Review (`/weekly-review`)
7. **AI weekly review:**
   - [ ] Navigate to Weekly Review
   - [ ] Select child and week
   - [ ] View or generate review
   - [ ] Review includes: progressSummary, paceAdjustments, planModifications, energyPattern, celebration
   - [ ] Status: `draft` → `approved`
   - [ ] Review saved to `families/{familyId}/weeklyReviews`

### What to Watch For

- Hours calculate correctly across date boundaries
- School year starts Aug 1 (not Jan 1)
- Export CSVs properly escape commas and quotes
- Monthly evaluations don't overwrite previous months
- Weekly review tone is warm and constructive (never shaming)

---

## 7. Quick Smoke Test (5 min)

Run these 5 checks to verify the app is functional:

### Check 1: App Loads & Auth (30s)
- [ ] Navigate to the app URL
- [ ] Profile selection page loads
- [ ] Select parent profile
- [ ] Today page renders with correct date

### Check 2: Today Page Works (60s)
- [ ] Select Lincoln as active child
- [ ] Plan type toggle works (Normal ↔ MVD)
- [ ] At least one session item is visible
- [ ] Tap a session — result picker appears (hit/near/miss)

### Check 3: Planner Chat Loads (60s)
- [ ] Navigate to `/planner/chat`
- [ ] Chat interface renders
- [ ] Type a message and send
- [ ] AI responds (may take a few seconds with real API)
- [ ] If using emulator without API key: verify graceful error message

### Check 4: Records Page (60s)
- [ ] Navigate to `/records`
- [ ] Hours summary loads (even if 0)
- [ ] Subject breakdown renders
- [ ] No console errors

### Check 5: Navigation & Profile Switch (60s)
- [ ] Sidebar opens (hamburger on mobile)
- [ ] All expected nav items present
- [ ] Switch to London's profile
- [ ] Today page updates for London
- [ ] Switch to Lincoln's kid profile — verify restricted nav (Today, My Stuff, Dad Lab only)

---

## 8. Common Issues & Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| **"Authentication required" error on AI calls** | Not logged in or auth token expired | Refresh the page to re-authenticate; check Firebase Auth emulator is running |
| **"Missing CLAUDE_API_KEY secret"** | API key not set in Cloud Functions | Run `firebase functions:secrets:set CLAUDE_API_KEY` or create `functions/.secret.local` |
| **AI returns empty response** | Model returned empty content block | Check Cloud Function logs; verify `max_tokens` is sufficient; may be a rate limit |
| **Plan JSON parse error** | AI included markdown fences or preamble | The `sanitizeAndParseJson` helper strips fences; check if prompt instructions are being followed |
| **"You do not have access to this family"** | `auth.uid !== familyId` | Family doc ID must match the authenticated user's UID |
| **Enriched context missing** | Firestore collections empty or query failed | Check that `sessions`, `workbookConfigs`, `weeks`, `hours` collections have data; check for missing composite indexes |
| **Weekly review not generating** | Scheduled function not deployed or no data | Deploy with `firebase deploy --only functions`; verify children exist; check that the previous week has session/hours data |
| **Image generation fails** | OpenAI API key missing or DALL-E quota exceeded | Set `OPENAI_API_KEY` secret; check OpenAI billing dashboard |
| **`<finding>` blocks not extracted** | AI response doesn't include the XML-like tags | Check evaluation system prompt is being sent; may need to re-run the evaluation |
| **Hours showing 0 despite logging** | Wrong school year boundary | Hours query filters by `date >= schoolYearStart` (Aug 1); verify dates are stored as `YYYY-MM-DD` |
| **MVD mode shows all items** | Items not properly tagged with `category` or `mvdEssential` | Check plan data in Firestore; `mvdEssential: true` and `category: "must-do"` required |
| **Profile selection loop** | Profile not persisting in context | Check `ProfileProvider` state; may need to clear localStorage and re-select |
| **TypeScript build fails with "enum" error** | Used `enum` instead of `as const` | `erasableSyntaxOnly` is enabled; convert to `as const` object pattern |
| **Import errors** | Missing `type` keyword on type-only imports | `verbatimModuleSyntax` requires `import type` for types |
| **Emulator functions timeout** | Cold start + API calls | Increase timeout in emulator config; first call is always slowest |
| **Composite index error in Firestore** | Missing index for multi-field query | Click the link in the error message to create the index in Firebase Console |
| **Dad Lab session won't start** | No plan created first | Create a lab plan before starting a session |
| **Audio recording fails on mobile** | Browser permissions not granted | Ensure HTTPS (required for `getUserMedia`); check browser audio permissions |
| **Export CSV has garbled characters** | Encoding issue | Exports should use UTF-8 BOM; check `records.logic.ts` CSV generation |
