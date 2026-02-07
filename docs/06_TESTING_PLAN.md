# Testing Plan — First Principles Engine
Date: 2026-02-07

This plan keeps testing lightweight but real. We focus on:
- **Pure logic tests** (fast, reliable)
- **Smoke tests** (manual checklists you can run on phone)
- **Optional emulator tests** (when we want confidence in Firestore rules/queries)

---

## 1) Add Test Tooling (recommended)
### Packages
- `vitest`
- `@testing-library/react`
- `@testing-library/user-event`
- `@testing-library/jest-dom`
- `jsdom`

### What we test first
- `engine.logic.ts` (flywheel counts + status + suggestions)
- date helpers in `lib/time.ts`
- records CSV builder in `lib/format.ts`
- ladder gating logic (can’t mark achieved without evidence)

---

## 2) Unit Tests (Vitest)
### Target modules
1. `src/features/engine/engine.logic.ts`
   - `getWeekRange()`
   - `computeStageCounts()`
   - `computeLoopStatus()`
   - `suggestNextStage()`

2. `src/lib/time.ts`
   - `getSchoolYearRange()` (Jul 1 → Jun 30)
   - `isInRange()`

3. `src/lib/format.ts`
   - CSV output escapes commas/quotes/newlines

4. `src/features/kids/ladder.logic.ts` (Phase 2)
   - `getActiveRung()`
   - `canAchieveRung(evidenceCount)` → requires >= 1 artifact link

### Minimal success bar
- 10–25 tests total
- Under 1 second to run locally

---

## 3) Manual Smoke Test Checklist (phone-fast)
Run this after any meaningful change:

### Today
- [ ] App loads without console errors
- [ ] DayLog auto-creates for today
- [ ] Toggle a checklist item; refresh; it persists
- [ ] Enter minutes + quick note; refresh; it persists
- [ ] Create a Note artifact with tags; confirm it saves

### Engine
- [ ] Flywheel shows stage counts for Lincoln/London
- [ ] After creating artifacts, counts update
- [ ] Status correctly shows Full/Minimum/Incomplete
- [ ] Suggested next stage is sensible

### Kids (Phase 2)
- [ ] Ladders render for each child
- [ ] Link an artifact to a rung
- [ ] Mark rung achieved only when evidence exists

### Records
- [ ] Generate hours from DayLogs
- [ ] School-year totals look sane
- [ ] Export CSV downloads and opens

---

## 4) Optional: Firebase Emulator (later)
Use when:
- you add Auth + Rules
- you want safer local testing without touching prod

Tools:
- Firebase Emulator Suite (Firestore + Auth)

---

## 5) CI (nice-to-have)
When ready, add GitHub Actions:
- run `npm test` on PR
- run `npm run build` on PR
