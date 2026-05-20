# Testing Plan — First Principles Engine
Date: 2026-02-07

This plan keeps testing lightweight but real. We focus on:
- **Pure logic tests** (fast, reliable)
- **Smoke tests** (manual checklists you can run on phone)
- **Optional emulator tests** (when we want confidence in Firestore rules/queries)

---

## 1) Test Tooling ✅
### Packages (all installed)
- [x] `vitest`
- [x] `@testing-library/react`
- [x] `@testing-library/user-event`
- [x] `@testing-library/jest-dom`
- [x] `jsdom`

### What we test first
- [x] `engine.logic.ts` (flywheel counts + status + suggestions)
- [x] date helpers in `lib/time.ts`
- [x] date formatting + CSV escaping in `lib/format.ts`
- [x] ladder gating logic (can't mark achieved without evidence)

---

## 2) Unit Tests (Vitest)
### Target modules
1. `src/features/engine/engine.logic.ts` ✅
   - [x] `getWeekRange()`
   - [x] `computeLoopStatus()`
   - [x] `suggestNextStage()`
   - [x] `countUniqueRungsInRange()`
   - [x] `countMilestonesAchievedInRange()`

2. `src/lib/time.ts` ✅
   - [x] `getSchoolYearRange()` (Jul 1 → Jun 30)

3. `src/lib/format.ts` ✅
   - [x] `formatDateYmd()`
   - [x] `parseDateYmd()` (valid, invalid, impossible dates)
   - [x] `normalizeDateString()`
   - [x] `formatDateForInput()` / `formatDateForCsv()`
   - [x] `toCsvValue()` — escapes commas/quotes/newlines

4. `src/features/kids/ladder.logic.ts` ✅
   - [x] `rungIdFor()` (explicit id + fallback)
   - [x] `getActiveRungId()` (first unachieved, all achieved, sort order, fallback ids)
   - [x] `getRungStatus()` (achieved/active/locked, legacy boolean)
   - [x] `canMarkAchieved(linkedArtifacts)` → requires >= 1 artifact link

### Minimal success bar
- 10–25 tests total → **33 tests across 4 test files** ✅
- Under 1 second to run locally ✅

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
