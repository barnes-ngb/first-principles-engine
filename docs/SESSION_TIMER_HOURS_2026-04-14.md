# Session Timer: Auto-Tracked Instructional Hours

**Date:** 2026-04-14
**Status:** Implemented

## Overview

Evaluations and Knowledge Mine quest sessions now automatically log instructional hours to the `hours` collection when a session completes. This closes the gap identified in `WORKINGLEVELS_INSPECTION_2026-04-09.md` where evaluation and quest hours were not being counted toward compliance totals.

## Design Principles

- **Under-count over over-count.** The timer tracks *active* time only. If idle detection fires, the timer retroactively credits time only up to the last user interaction — not the full idle threshold.
- **No confirmation prompt.** Hours are logged silently when a session completes. No user action required.
- **Safety cap.** A single session can credit at most 60 minutes (`MAX_SESSION_SECONDS = 3600`). Anything beyond that is clamped.
- **Minimum threshold.** Sessions under 5 minutes of active time are not logged.
- **Minutes rounding.** Active seconds are rounded up to the nearest 5-minute increment, matching the creative timer pattern.

## Idle-Aware Session Timer

**File:** `src/core/utils/sessionTimer.ts`

### How it works

The timer uses span-based tracking with retroactive idle detection:

1. **Active span** begins when `startTimer()` is called.
2. **Tick interval** (1s) checks two conditions each second:
   - **Page hidden?** (`document.hidden` via Page Visibility API)
   - **User idle?** (no input events for 60 seconds)
3. If either condition is true, the current span ends. For idle detection, the span end is backdated to the last user interaction time — this is the key "under-count" behavior.
4. When the user returns (tab visible + interaction), a new span begins.
5. `stop()` returns `min(totalSpanSeconds, MAX_SESSION_SECONDS)`.

### User activity events tracked

`click`, `touchstart`, `keydown`, `scroll`, `mousemove` (throttled to 2s)

### API

```ts
// React hook
const { startTimer, getCurrentSeconds, stop, isActive, isPaused } = useSessionTimer()

// Plain class (for non-React contexts)
const timer = new SessionTimer()
timer.startTimer()
timer.getCurrentSeconds()  // active seconds so far
timer.stop()               // finalize + return clamped seconds
```

### Constants (exported, tunable)

| Constant | Default | Purpose |
|---|---|---|
| `IDLE_THRESHOLD_MS` | 60,000 (60s) | Inactivity window before pause |
| `MAX_SESSION_SECONDS` | 3,600 (60 min) | Safety cap per session |

## Integration Points

### Evaluation Sessions (`EvaluateChatPage.tsx`)

| Event | Timer action |
|---|---|
| `startEvaluation()` called | `startTimer()` |
| In-progress session resumed from Firestore | `startTimer()` |
| AI signals `<complete>` | `stop()` → log hours |
| Clear & Restart | `stop()` (discard, no hours logged) |

**HoursEntry fields:**
- `source: 'evaluation-session'`
- `subjectBucket`: mapped from evaluation domain via `domainToSubjectBucket()`
- `notes`: e.g. "Reading evaluation session"

### Knowledge Mine Quest Sessions (`useQuestSession.ts`)

| Event | Timer action |
|---|---|
| `startQuest()` called (all modes) | `startTimer()` |
| `resumeSession()` (partial session resume) | `startTimer()` |
| `endSession()` (interactive quest completes) | `stop()` → log hours |
| `endFluencySession()` (fluency practice completes) | `stop()` → log hours |
| `resetToIntro()` (early exit) | `stop()` (discard, no hours logged) |

**HoursEntry fields:**
- `source: 'quest-session'`
- `subjectBucket`: mapped from quest domain via `domainToSubjectBucket()`
- `notes`: e.g. "phonics quest session", "fluency quest session"

### Domain → Subject Mapping (`domainMapping.ts`)

| Domain | SubjectBucket |
|---|---|
| `reading` | Reading |
| `math` | Math |
| `speech` | LanguageArts |
| `writing` | LanguageArts |

## Records Display

**RecordsPage.tsx** now shows a unified auto-tracked sessions summary:

> Includes 5 auto-tracked sessions (1.2h): 2 creative, 1 evaluation, 2 quest

This replaces the previous creative-timer-only display.

**Daily log CSV** now includes a `Source` column identifying the origin of each entry:
- `evaluation-session` — auto-logged from evaluation
- `quest-session` — auto-logged from quest/fluency
- `creative-timer` — auto-logged from creative timer
- `day-log` — generated from daily checklist blocks
- (blank) — manual entry or book reading

## Dual Timer in Quest Sessions

Quest sessions run **two timers in parallel**:

1. **Game timer** (`timerRef` → `questState.elapsedSeconds`): Wall-clock seconds for UI display and adaptive progression. Not idle-aware.
2. **Session timer** (`sessionTimer`): Idle-aware active seconds for hours logging. Pauses on idle/hidden tab. Used only for the `HoursEntry`.

This design ensures the game UI shows total elapsed time (important for pacing), while compliance hours reflect only active instructional time.

## Files Changed

| File | Change |
|---|---|
| `src/core/utils/sessionTimer.ts` | New — `SessionTimer` class + `useSessionTimer` hook |
| `src/core/utils/sessionTimer.test.ts` | New — 13 unit tests |
| `src/core/utils/domainMapping.ts` | New — `domainToSubjectBucket()` |
| `src/core/utils/domainMapping.test.ts` | New — 4 unit tests |
| `src/features/evaluate/EvaluateChatPage.tsx` | Wire timer into evaluation lifecycle |
| `src/features/quest/useQuestSession.ts` | Wire timer into quest/fluency lifecycle |
| `src/features/records/RecordsPage.tsx` | Unified auto-tracked sessions display |
| `src/features/records/records.logic.ts` | Add Source column to daily log CSV |
| `src/features/records/records.logic.test.ts` | Update + add CSV source tests |
