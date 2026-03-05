# First Principles Engine — Testing Guide v2

**Updated: March 5, 2026**
**Previous version: March 3, 2026**

---

## 1. PREREQUISITES

Before testing, ensure the following are in place:

### AI Feature Flag
1. Open **Settings** (gear icon)
2. Toggle **"AI-Powered Planning"** to ON
   - This enables AI-generated plans via Cloud Functions
   - Without it, the planner uses local logic fallback (still functional, but not the AI path)
   - Stored in localStorage (`fpe_ai_flag_`) — persists across sessions and syncs across tabs

### Child Profiles
- At least one child profile must exist: **Lincoln (10)** is the primary test profile
- Lincoln should have a **skill snapshot** populated (used by AI for context-aware planning)
- Optionally add **London (6)** to test multi-child flows and kid-themed views

### Workbook Configs (Recommended)
- Open Settings → Workbook Configuration
- Add at least 2-3 workbooks (e.g., "Saxon Math Lesson 45", "Explode the Code Book 3")
- Fields: name, subjectBucket, currentPosition, totalUnits, unitLabel
- Workbooks are used during plan setup and photo content extraction
- Position auto-advances when plans are applied (lesson number increment logic)

### Demo Data (Optional)
- Settings page has a **Seed Demo Data** function for quick test setup
- Populates sample children, weeks, and assignments

---

## 2. WEEKLY PLANNING FLOW (Core Test)

This is the most complex flow and the primary feature to verify.

### Step 1: Open Plan My Week
- Navigate to **Plan My Week** from the main nav
- **Verify:** Setup wizard appears (if no conversation exists for this week)
- If a plan already exists, you'll see the conversation view instead

### Step 2: Guided Setup Wizard
- Fill out:
  - **Week energy level:** Full / Lighter / MVD
  - **Hours per day** target
  - **Workbook selections** (pulls from your workbook configs)
  - **Read-aloud** selection
  - **Notes** (free-form context for the AI)
- **Verify:** All dropdowns populate correctly; workbook list matches your configs

### Step 3: Generate Plan
- Click Generate after completing setup
- **Verify (AI path):** Loading indicator appears → structured plan preview returns
- **Verify (Local fallback):** If AI flag is off, local logic generates a plan instantly
- Plan items should include: title, estimatedMinutes, category (must-do / choose), skillTags

### Step 4: Review Preview
- Inspect the generated plan across all days
- **Verify:** Each day has reasonable items distributed across subjects
- **Verify:** Items have correct categories (must-do for core, choose for electives)
- **Try an adjustment:** Type a free-form command like "make Wednesday light" or "move math to Tue/Thu"
  - Adjustment intents are parsed by `parseAdjustmentIntent()` and plan regenerates locally
- **Try a coverage question:** Ask "what does the week cover?" → should get a formatted summary

### Step 5: Apply Plan
- Click **Apply** to commit the plan
- **Verify:** Progress indicator shows lesson card generation (batches of 3)
- **Verify:** Console shows `[LessonCards] Generating card for...` and `[LessonCards] Generated X of Y cards`
- **Verify:** After apply completes:
  - Conversation is locked (no further adjustments)
  - `applied` state is true
  - DayLog checklist items created for each day
  - DayBlock items created for non-app-block items
  - Week plan updated with childGoals
  - Lesson cards written to Firestore `lessonCards` collection

### Step 6: Check Today
- Navigate to **Today**
- **Verify:** Checklist items appear for today's date
- **Verify:** Items show label + planned minutes
- **Verify:** Color dots correspond to subject buckets
- **Verify:** Week focus (theme/virtue/scripture) displays if set during planning

### Step 7: Check This Week
- Navigate to **This Week** view
- **Verify:** All days show their planned items
- **Verify:** Items match what was generated in the planner

### Redo Plan (Important!)
- If items look wrong (stale duplicates, 0m planned), use **Redo Plan**:
  1. Go back to Plan My Week
  2. Click **Redo Plan** → confirmation dialog appears
  3. Confirm → clears planner-generated checklist items (preserves manually-added items)
  4. Clears week focus fields
  5. Resets conversation to Draft status
  6. Re-run the setup wizard and generate a fresh plan

### Repeat Last Week
- Alternative to fresh planning: **Repeat Last Week** button
- Clones previous plan with auto-advanced lesson numbers
- Regex patterns detect: "Lesson", "Ch", "Chapter", "Unit", "Page" followed by a number
- **Verify:** Lesson numbers increment correctly (e.g., "Saxon Math Lesson 45" → "Saxon Math Lesson 46")

---

## 3. DAILY EXECUTION FLOW

### Opening Today
1. Navigate to **Today**
2. **Verify:** Checklist loads for current date
3. **Verify:** Energy level selector shows current mode
4. **Verify:** Morning greeting appears (time-appropriate: morning/afternoon/evening)

### Checklist Interaction
- Tap checkbox to mark items complete
- **Verify:** Completion persists (reload page → still checked)
- **Verify:** When all items for a block are checked, `actualMinutes` auto-populates on the corresponding block
- **Verify:** Subject inference works — items with labels like "phonics" or "math" get correct subjectBucket

### Teach Helper
1. Tap the **school icon** (📚) next to an incomplete item
2. **Verify:** TeachHelperDialog opens
3. **Verify:** Shows skill snapshot + matching lesson card (if generated during Apply)
4. **Verify:** Displays ladder rung, supports, stop rules, common mistakes
5. If no lesson card exists, a **micro-lesson template** (5-min structure) is shown
6. **"Generate Specific Lesson" button:** Creates a lesson card on demand (see Lesson Card section)

### Artifact Capture
- Quick Capture section at bottom of Today view
- Toggle between **Note / Photo / Audio**
- **Verify:** Photo triggers PhotoCapture component
- **Verify:** Audio triggers AudioRecorder
- **Verify:** All artifacts tagged with: childId, engineStage, subjectBucket, domain, location
- **Verify:** Artifacts appear scoped to current dayLog + child

### MVD Mode Toggle
- Change energy level dropdown: `full` → normal day, `low/overwhelmed` → MVD
- **Verify:** Non-mvdEssential items are dimmed/de-emphasized in MVD mode
- **Verify:** First 3 items default as mvdEssential if no category was explicitly set
- **Verify:** Plan type changes persist via `saveDailyPlan()`

### Inline Editing (New since v1)
1. Tap **Edit** button on Today view
2. **Verify:** Edit mode activates — shows text fields for label + minutes
3. **Verify:** Reorder arrows appear (move items up/down)
4. **Verify:** Delete button removes items
5. **Verify:** "Add Item" button reveals form with title, minutes, and subject dropdowns
6. **Verify:** Changes persist immediately via `persistDayLogImmediate()`
7. Exit edit mode → items reflect changes

---

## 4. LESSON CARD FLOW

### Auto-Generation During Apply
- Triggered automatically when you Apply a plan
- Only generates for items that are: accepted, not app-blocks, not in 'choose' category
- Deduplicates by title (same activity across multiple days = one card)
- Batch processing in groups of 3 (watch console)
- **Console pattern:** `[LessonCards] Generating card for "Saxon Math Lesson 46"...`
- **Console pattern:** `[LessonCards] Generated 5 of 8 cards`
- Non-fatal: if generation fails for one card, the rest continue

### Manual Generation via Teach Helper
1. Open Teach Helper for any item
2. Click **"Generate Specific Lesson"**
3. **Verify:** Loading state appears
4. **Verify:** Card generates with: title, objective, materials[], steps[], successCriteria[]
5. **Verify:** Card saved to Firestore with planItemId linkage

### Verification in Firestore
- Check `families/{familyId}/lessonCards` collection
- Each card should have: childId, planItemId, title, durationMinutes, objective, materials[], steps[], evidenceChecks[], skillTags[], ladderRef (optional), createdAt
- **Lookup chain:** TeachHelper finds cards by: (1) lessonCardId on plan item → (2) query by planItemId → (3) fallback title keyword match

### Known Fix: Unicode Escapes
- AI-generated content may contain Unicode escape sequences
- `fixUnicodeEscapes()` utility handles this in both TeachHelper and LessonCard display
- **Verify:** No raw `\u00XX` sequences appear in rendered card text

---

## 5. KID VIEW TESTING

### Switching to Kid View
1. Select **Lincoln** from the child profile selector
2. **Verify:** KidTodayView loads (different layout from parent view)
3. Lincoln gets **Press Start 2P** font (Minecraft-style theme)
4. London gets **Fredoka/Luckiest Guy** fonts (playful theme)

### Must-Do / Choose-Your-Adventure Flow
1. **Verify:** Must-Do section shows required items with checkboxes
2. Complete all Must-Do items
3. **Verify:** "Great job! Now pick your adventures!" message appears
4. **Verify:** Choose-Your-Adventure section unlocks
5. Select up to 2 adventure items (configurable `maxChoices`)
6. **Verify:** Selected choices show checkboxes; unselected use radio-style selectors
7. Complete selected adventures
8. **Verify:** Celebration message appears (random, deterministic per day-of-year)

### Categorization Logic
- Items categorized by `category` field: 'must-do' vs 'choose'
- **Fallback:** If no categories set, first 3 items are must-do
- MVD-essential items always appear in must-do

### Explorer Map (Week Visualization)
- Visual trail with themed emoji sets
- **Themes rotate weekly:** Forest / Space / Island / Castle (based on weekNum % 4)
- London gets special garden theme: 🌱🌿🌸🌺🌻
- **Verify:** Completed days show as "explored" on the trail
- **Verify:** Streak count displays (consecutive explored days backward from today)
- **Verify:** Progress text: "X days explored! Y to discover..."

### My Stuff (Artifacts)
- Shows today's artifacts (Photo / Note)
- **Add Photo / Add Note** buttons trigger KidCaptureForm
- **Verify:** Artifacts display title + timestamp
- **Verify:** Photos show thumbnail image

### Week Focus Display
- If week focus was set during planning:
  - Theme, virtue, scriptureRef, heartQuestion display in kid view
  - Scripture shown in italic box
- **Verify:** No verse displayed if Week Focus fields weren't set (known behavior, not a bug)

---

## 6. WEEKLY REVIEW

### How to Test
- **Scheduled:** Automatically triggers Sunday at 7 PM via Firebase Cloud Scheduler
- **Manual trigger:** Navigate to Weekly Review → click **"Generate Now"** (appears in empty state)
- Calls `generateReviewFn()` Cloud Function with familyId, childId, weekKey

### Data Requirements for Meaningful Review
- At least 3-4 days of completed checklist items for the week
- Some artifacts captured
- Skill snapshot populated for the child
- Hours logged (via block completion or manual entry)

### Review Structure
- **Status flow:** PendingReview → Reviewed → Applied
- Review contains:
  - **Celebration:** warm affirmation of the week
  - **Summary:** week overview
  - **Wins[]:** specific achievements
  - **Growth Areas[]:** areas to develop
  - **Pace Adjustments[]:** per-adjustment cards with accept/reject
  - **Recommendations[]:** next week guidance

### Pace Adjustment Cards
1. Each shows: area, currentPace → suggestedPace, rationale
2. **Verify:** Thumb up/down buttons toggle accept/reject per adjustment
3. Click **Apply** → accepted adjustments persist for next plan generation
4. **Verify:** Review status changes to "Applied"

### Real-time Updates
- Review page uses `onSnapshot()` for real-time updates
- **Verify:** Child selector switches between children correctly
- **Verify:** Loading state resets when switching children

---

## 7. RECORDS & COMPLIANCE

### Hours Accumulation
- Hours accumulate from two sources:
  1. **Automatic:** DayLog blocks with `actualMinutes` (set when checklist items completed)
  2. **Manual:** HoursEntry records (takes precedence when entries exist)
- Hours adjustments via HoursAdjustment records

### Subject Tracking
- `computeHoursSummary()` aggregates by subject (bySubject[]) and by date (byDate{})
- Core subjects: Reading, LanguageArts, Math, Science, SocialStudies
- Non-core tracked separately
- Home vs other locations tracked per entry

### Compliance Dashboard
- **MO requirements:** 1000 total hours, 600 core hours
- **Per-subject target:** ~120 hours each (600 ÷ 5 core subjects)
- **Status indicators:**
  | Color | Overall | Per-Subject |
  |-------|---------|-------------|
  | 🟢 Green | ≥90% of expected | ≥85% of target |
  | 🟡 Yellow | 75-90% of expected | 60-85% of target |
  | 🔴 Red | <75% of expected | <60% of target |
- **Verify:** Progress bars reflect actual logged hours
- **Verify:** School year progress percentage is based on elapsed time

### Portfolio Export
- Exports artifacts (photos/notes/audio) with metadata
- CSV export of day logs with dates, subjects, durations
- Hours summary by subject + date
- Evaluation records with skill progression

---

## 8. COMMON ISSUES & TROUBLESHOOTING

| Issue | Symptom | Fix |
|-------|---------|-----|
| **"0m planned" on Today items** | Checklist items show 0 minutes | Go to Plan My Week → Redo Plan → re-generate and re-apply. This was a lesson generation handler bug (fixed in `9b2acc7`) — if you see it, redo clears stale data. |
| **Stale duplicate items** | Same items appear multiple times on Today | Redo Plan — clears planner-sourced items and regenerates fresh. Redo only removes `source === 'planner'` items, preserving manual additions. |
| **Generate Specific Lesson fails** | Teach Helper "Generate" button shows error or nothing happens | Check browser console for error details. Verify AI feature flag is ON. Check Firebase function logs for 500 errors. Ensure child has skill snapshot. |
| **No verse on Today** | Scripture/verse area is blank | Set Week Focus fields (theme, virtue, scriptureRef) during the planning wizard. If already planned, Redo and re-plan with focus fields filled. |
| **500 error on chat** | Plan generation fails with server error | Check Firebase Cloud Function logs (`firebase functions:log`). Common causes: missing API key, token limit exceeded, malformed prompt. Local fallback should still work with AI flag OFF. |
| **Unicode artifacts in lesson cards** | Raw `\u00XX` sequences in card text | Should be auto-fixed by `fixUnicodeEscapes()`. If visible, check that the fix is applied in both TeachHelper and LessonCardPreview. |
| **Lesson cards not generated during Apply** | Console shows no `[LessonCards]` messages | Verify items are: accepted, not app-blocks, and not 'choose' category. This was a category filter bug (fixed in `61773e7`). |
| **Items not categorized in Kid View** | All items show as must-do, no adventures | Ensure plan items have `category` field set. Fallback: first 3 items become must-do if no categories exist. |
| **Week focus not showing on Today** | Theme/virtue missing after planning | Fixed in `a7b4344`. Week focus now propagates from Week → Today views via route params and props. Redo plan if stale. |
| **Photo scan not matching workbook** | Photo content extraction misses workbook | Verify workbook configs exist in Settings. AI extraction looks for matching workbook name + calculates lesson number. |

---

## 9. QUICK SMOKE TEST (5 Minutes)

A minimal test to verify the app is functioning end-to-end:

### 1. Plan Generation (1 min)
- [ ] Open **Plan My Week**
- [ ] Does the setup wizard appear? (If returning, does the conversation load?)
- [ ] Fill in energy level + at least one workbook
- [ ] Click Generate → does a structured preview appear within ~10 seconds?

### 2. Apply Plan (1 min)
- [ ] Click **Apply**
- [ ] Watch console for `[LessonCards]` messages
- [ ] Does the apply complete without errors?

### 3. Today View (1 min)
- [ ] Navigate to **Today**
- [ ] Do checklist items appear for today?
- [ ] Are minutes displayed (not "0m")?
- [ ] Is the week focus/verse visible (if set)?

### 4. Teach Helper (1 min)
- [ ] Tap the school icon on any incomplete item
- [ ] Does the TeachHelperDialog open?
- [ ] Does it show lesson content or a micro-lesson template?

### 5. Completion & Persistence (1 min)
- [ ] Check off one item → does it save?
- [ ] Reload the page → is it still checked?
- [ ] Switch to Kid View → does KidTodayView load with Must-Do items?

### Smoke Test: PASS / FAIL

If any step fails, check the troubleshooting table in Section 8 above.

---

## Appendix: Key File Paths for Debugging

| Area | File |
|------|------|
| Planner Chat (main) | `src/features/planner-chat/PlannerChatPage.tsx` |
| Plan Generation Logic | `src/features/planner-chat/chatPlanner.logic.ts` |
| Repeat Last Week | `src/features/planner-chat/repeatWeek.logic.ts` |
| Adjustment Parsing | `src/features/planner-chat/intentParser.ts` |
| Today (Parent) | `src/features/today/TodayPage.tsx` |
| Today (Kid) | `src/features/today/KidTodayView.tsx` |
| Day Log Hook | `src/features/today/useDayLog.ts` |
| Explorer Map | `src/features/today/ExplorerMap.tsx` |
| Teach Helper | `src/features/planner/TeachHelperDialog.tsx` |
| Lesson Card Preview | `src/features/planner-chat/LessonCardPreview.tsx` |
| Weekly Review | `src/features/weekly-review/WeeklyReviewPage.tsx` |
| Records / Compliance | `src/features/records/ComplianceDashboard.tsx` |
| Hours Computation | `src/features/records/records.logic.ts` |
| AI Feature Flags | `src/core/ai/featureFlags.ts` |
| Settings | `src/features/settings/SettingsPage.tsx` |
| Cloud Functions (chat) | `functions/src/ai/chat.ts` |
| Cloud Functions (generate) | `functions/src/ai/generate.ts` |
| Cloud Functions (evaluate) | `functions/src/ai/evaluate.ts` |
