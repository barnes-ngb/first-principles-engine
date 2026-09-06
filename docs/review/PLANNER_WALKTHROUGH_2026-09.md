# Plan My Week — a walkthrough, top to bottom (FEAT-205)

**Date:** 2026-09-06 · **Surface:** `src/features/planner-chat/` · **Ids:** `UX-233` → `UX-260`
**Owner ask:** *"Let's do a review of the planner from top to bottom, UI/UX, and make any adjustments
to ensure it's functioning and make it more intuitive and user friendly."*

Two phases, one PR. Phase 1 walked every screen as a parent on a 390px phone in all three page
phases. Phase 2 fixed everything whose change is inside one component and alters no write. Everything
structural is filed as Batch B and **not built** — see §6.

---

## 1 · What Shelly will see tonight, top to bottom, after this PR

She opens **Plan My Week**. Under the title, instead of one sentence that reads the same on every
screen, it now says **"Step 1 of 3 · Tell me about the week, then generate a plan."** She picks
Lincoln. The blue foundations banner is still there and still long — that one is filed, not fixed.
Under it, **This week / Next week** with the real dates, then a small card of chips: the day's hours,
the app blocks, and — the change here — no more truncated `short-i-vs-e 5x, ful 5x, comparin…`. Tag
codes that the app cannot name in English are counted but no longer printed.

Then the setup card. **"How's this week looking?"** with three buttons that are now three plain
words: **Normal · Lighter · Tough (Minimum Viable Day)**. *Normal* used to carry `(4.8h/day)` and the
other two carried nothing, which made it look like the real option and the others like reductions of
it — and that number is one the app worked out for itself, not a setting she chose. The number is
still on the summary chip above.

Under that, the read-aloud book, then the one box that matters most: **"Anything different this
week?"** It says exactly that on both versions of this card now — it used to say *"Anything special
this week?"* whenever she had planned before, which is most of the time. Below it, her list of
Lincoln's activities — and for the first time a **View/Edit Activities** link that actually appears
and goes to Curriculum. That link has been in the code all along with nothing wired to it, which is
why a week of duplicated activities sat visible on this screen with no way out of it.

She taps **Generate Plan for Sep 7–11**. If the AI is not reachable, she will now be *told* — a line
in the chat saying the built-in planner wrote this one and it won't have picked up what she typed.
Before this, that failure was silent and the only clue was the absence of the words "(AI-powered)".

The plan arrives. The subtitle says **Step 2 of 3**. If the week has no theme, the empty *"This Week
in Stonebridge"* box is simply gone rather than a heading over white space. Each day card heads its
non-routine rows **"Focus"** rather than **"Today's Focus"** on all five days. One **Apply to Sep
7–11** button, sticky at the bottom. Below the days, the quick-adjust chips have one heading now
instead of two, and the "what to review" sentence appears once instead of twice.

She taps Apply. **Step 3 of 3 · Applied — it's on Today. You can still change any day.** The rows no
longer wear green ticks — a tick meant "done", and every row wore one the moment the week was
written. Rows she *unticked* before applying now say **"You left this one out, so it isn't on the
day. Redo the plan to put it back."** instead of the alarming *"That item isn't on the day any
more — reopen the week"*, which read as though her week had lost things. And the button under it
says **Redo Plan**, the same words as the dialog it opens, instead of *Start Over (Redo Plan)*.

**Two things she will still hit, deliberately not fixed here:** the red `330m / 288m` on the day
headers (the budget is computed from the routine it is supposed to constrain, so it is always wrong —
UX-206/UX-252, an owner decision) and the long blue banner pushing the controls down the page
(UX-247, a layout move).

---

## 2 · The three passes

Walked against the source at `035e1ad`, at a 390px viewport, as a parent profile.

### Pass 1 — first plan ever (wizard path)

`hasPriorPlan === false`. What she sees, in order:

1. `Plan My Week` + a subtitle · ⓘ icon (no visible name, `title` only — a hover tooltip that never
   opens on a phone) → **UX-242**
2. `ChildSelector`
3. `FoundationsFocusLine` — a full-width blue `Alert` carrying *"This week's foundation focus: …
   because …"*, typically four to six lines at 390px → **UX-247**
4. `PlanningWeekSelector` — This week / Next week, both dated. Good.
5. `PlanSummaryPanel` — `4.8h/day` + app-block chips. Coverage is empty pre-draft, so at setup this
   card is two or three chips and a border → **UX-248**
6. `PlannerSetupWizard`: energy toggle → read-aloud → *"Anything different this week?"* → activities
   wall → mastery summary → photo accordion → **Generate Plan for Sep 7–11**

**Taps to Generate:** 1 (the button), assuming she changes nothing. **Scrolls to reach it: ~2.5
screens.** Words to read before the first control (`ChildSelector`): 13. Words before **Generate**:
roughly 150–190 depending on the focus line and the activity list.

Then: draft → review → `Apply to Sep 7–11` → applied. No error, no dead end, nothing false — except
the items listed in §4.

### Pass 2 — second week (compact path), planning next week on a Saturday

`hasPriorPlan === true` → `PlannerCompactSetup`. Same header stack, then a *different card*: it names
the week in a caption (the wizard does not), offers workbook include/exclude chips (the wizard does
not), offers **Repeat Last Week** (the wizard does not), and **drops** the photo upload and the
mastery summary (which the wizard has). Its energy question was worded differently and its request
field was named differently. → **UX-235 / UX-236 / UX-249**

On a Saturday, `PlanningWeekSelector` correctly greys "This week" out as *already passed* and
`generateButtonLabel` names the upcoming dates (UX-183 landed). Apply re-resolves the week at the
write and refuses a rolled-over one with a plain sentence. **This part of the flow is in good shape.**

### Pass 3 — mid-week return, moving one item from Thursday to Friday

Wednesday: `resolvePlanningWeek(null, Wed)` returns *this* week, the conversation doc for that week
loads with `status: Applied`, so she lands in **active** with the day cards live. The 📅 control on
the Thursday row opens the day picker and the move is written straight into the saved day. **This
works.**

Two observations from the walk:

- On **Friday and Saturday** the default rolls forward, so she lands on *next* week's empty setup
  card. To edit today's live week she must first notice the selector and tap "This week". Correct by
  FEAT-196's design, and the affordance is right there — but it is a step, and it is unannounced.
  → **UX-256**
- The rows carrying *"That item isn't on the day any more"* are the thing she will actually notice.
  See **UX-230** below.

---

## 3 · The seeds, each confirmed or struck

| Seed | Verdict | Finding |
|---|---|---|
| **S1** blue banner pushes controls down | **Confirmed** | `FoundationsFocusLine` renders a full-width `Alert` with an un-truncated `why`. → UX-247 (Batch B) |
| **S2a** `h/day` chip is a derived number | **Confirmed** | `hoursPerDay` = `parseRoutineTotalMinutes(dailyRoutine)`; UX-206. → UX-248 / UX-252 (Batch B) |
| **S2b** raw tag ids in the coverage chip | **Confirmed** | `coverageSummary.ts:56` fell back to `tag.split('.').pop()` for any tag missing from `SKILL_TAG_MAP`, and printed *every* tag. → **UX-237, fixed** |
| **S2c** *Other* is the largest bucket, says nothing | **Confirmed** | `entry.subject` is the raw `SubjectBucket`; `Other` carries formation/prayer/misc. → UX-259 (Batch B) |
| **S3** one field, two labels | **Confirmed** | Wizard *"Anything different this week?"*, compact *"Anything special this week?"* — and two different placeholders. → **UX-235, fixed** |
| **S4** two setup components for one job | **Confirmed, and wider than seeded** | Six affordances exist on exactly one of the two (below). → **UX-236 fixed (copy)**, UX-249 (Batch B) |
| **S5** activities summary is a wall | **Confirmed, and worse** | `onViewActivities` is optional and **the page never passed one**, so the *View/Edit Activities* button had never rendered. → **UX-241, fixed**; the wall itself → UX-258 |
| **S6** the energy row's number | **Confirmed** | `weekEnergyLabel('full', h)` alone carried `(4.8h/day)`. Label-only. → **UX-238, fixed** |
| **S7** heading over nothing | **Confirmed** | `WeekFocusPanel.tsx:30` — unconditional `subtitle2`, everything below gated on `theme`/`conundrum`. → **UX-234, fixed** |
| **S8** read-aloud book in three places | **Struck as stated; re-filed** | Only ever ONE picker per phase, never two at once, and each phase's is reachable and useful. The real defect is that setup's writes nothing (`handleSelectedBookChange`, local state; Apply persists it) while review's and active's write `plannerDefaults` eagerly (`handleBookChangeAndPersist`). Same control, two behaviours — and a write change, so → UX-250 (Batch B) |
| **S9** grey check-circle on every row | **Confirmed, split** | In **review** the circle is a real accept/reject toggle (`onToggleItem` passed) — correct. In **active** it is inert, and it is the same green/grey tick the live checklist uses for *done*. → **UX-240, fixed** · density → UX-251 (Batch B) |
| **S10** "TODAY'S FOCUS" on every day | **Confirmed** | `PlanPreviewCard.tsx:480`. → **UX-239, fixed** |
| **S11** red `330m / 288m` | **Confirmed** | The chip goes `error` at `total > budget + 15`; the budget is the routine's own unweighted sum. Loudest thing on the review screen, structurally always wrong. → UX-252 (Batch B) |
| **S12** two Apply buttons | **STRUCK** | There is one. FEAT-111's sticky bar replaced the second, and the row under the quick suggestions now holds **Print Week Materials** only (`PlannerChatPage.tsx:3213`). Nothing to fix. |
| **S13** no phase indicator | **Confirmed** | One static subtitle on all three screens. A one-line fix was in scope. → **UX-243, fixed** · a real stepper → UX-254 |
| **S14** *"isn't on the day any more"* on every row | **Confirmed in part** | The mechanism named in the run prompt was already opened and struck by UX-230 (`resolveLiveRow`, `useAppliedWeekDays` and `handleApplyPlan` all derive from the page's one `weekRange` memo; the label join is byte-identical). Independently re-read here and the same conclusion holds. **The one confirmed sufficient mechanism — a row the parent unticked, which Apply never wrote — is fixed** (**UX-230**, partially). Two candidates still need the live app and stay OPEN. |
| **S15** "Start Over (Redo Plan)" | **Confirmed** | Two names in one label, over a dialog titled *Redo Plan?* confirming with *Redo Plan*. → **UX-246, fixed** |
| **S16** returning mid-week | **Confirmed working** | Lands in `active` with editable days. One rough edge on Fri/Sat. → UX-256 |
| **S17** the ⓘ drawer | **Confirmed** | Titled *"Context"* (internal word), reached by an icon whose only name was a `title` tooltip, and it named the week as **`Week of 2026-09-06`** — a raw key, and the *Sunday*, while every other control on the page says *Sep 7–11*. → **UX-242, fixed** |
| **S18** copy length | **Measured** | 13 words before the first control; ~150–190 before **Generate**, of which the blue banner is 25–40 and the activities wall up to 8 names. → UX-247 / UX-258 |
| **S19** failure states | **Mostly confirmed present; one real gap** | Apply-refused, stale-week, past-week, save-failed, print-failed, move/remove/swap-failed and AI-unavailable-in-chat all say what happened. **Generate's own AI failure said nothing** — `useAI().chat` returns `null` rather than throwing, so the path fell into the local planner silently. → **UX-233, fixed** |

### The S4 parity table

| Affordance | `PlannerSetupWizard` | `PlannerCompactSetup` |
|---|---|---|
| Names the week in the card | ✗ | ✓ (caption) |
| Energy toggle | ✓ | ✓ (**was** worded differently — now shared) |
| Read-aloud picker | ✓ | ✓ |
| Request field | ✓ (**was** *different*) | ✓ (**was** *special*) |
| Workbook include/exclude chips | ✗ | ✓ |
| Activities summary | ✓ | ✗ |
| Mastery ("last 2 weeks") summary | ✓ | ✗ |
| Photo / scan upload | ✓ | ✗ |
| Repeat Last Week | ✗ | ✓ |
| Generating label | *"Generating your week…"* | *"Generating…"* |

The copy differences are fixed. The six structural asymmetries are UX-249 and are **not** fixed —
consolidating two components is exactly the Batch B line.

---

## 4 · Findings by severity

**P1** — cannot complete the task, or the screen says something false.

| Id | Finding | Status |
|---|---|---|
| **UX-252** | The day-header overflow chip goes red against a budget derived from the routine it constrains, so it is structurally always wrong and is the loudest element on the review screen. | Batch B (UX-206/209, owner decision) |

**P2** — she can, but the page works against her.

| Id | Finding | Status |
|---|---|---|
| **UX-233** | Generate's AI failure was silent — the local planner stood in with no notice, and the parent's typed request reached nothing. | **Fixed** |
| **UX-230** | An unticked row on the applied week read *"isn't on the day any more"* — the wording for a deleted row. | **Fixed (this half)**; two candidates stay OPEN |
| **UX-234** | `WeekFocusPanel` rendered a bordered heading over white space when the week had no theme. | **Fixed** |
| **UX-235** | The request field — the highest-authority input on the page — had two names. | **Fixed** |
| **UX-237** | The coverage chip printed raw skill-tag identifiers and truncated mid-word. | **Fixed** |
| **UX-238** | The energy toggle put a derived number on one of three peer options. | **Fixed** |
| **UX-240** | Rows on a read-only card wore the completion tick the live checklist uses for *done*. | **Fixed** |
| **UX-241** | The activities summary's *View/Edit Activities* link had never been wired. | **Fixed** |
| **UX-242** | The context drawer used an internal title, an unnamed opener, and a raw Sunday key for the week. | **Fixed** |
| **UX-247** | The blue foundations banner pushes the week selector and the setup card below the fold. | Batch B |
| **UX-248** | `PlanSummaryPanel` renders in all three phases and has no stated job at setup. | Batch B |
| **UX-249** | Two setup components, six asymmetric affordances. | Batch B |
| **UX-251** | Four controls per row × ~15 rows × 5 days on a phone; ↑↓ is the least used and the most thumb-hostile. | Batch B |
| **UX-253** | A fourth `hoursPerDay` source — the conversation doc's stored `availableHoursPerDay`. | Batch B |

**P3** — polish.

`UX-236` (energy question wording, **fixed**) · `UX-239` (*Today's Focus*, **fixed**) · `UX-243`
(step line, **fixed**) · `UX-244` (mastery line twice, **fixed**) · `UX-245` (two captions over one
chip row, **fixed**) · `UX-246` (*Start Over (Redo Plan)*, **fixed**) · `UX-250` · `UX-254` ·
`UX-255` · `UX-256` · `UX-257` · `UX-258` · `UX-259` · `UX-260`.

---

## 5 · Phase 2 — what changed, before → after

| Id | File | Before | After |
|---|---|---|---|
| UX-233 | `plannerDraftNotice.ts` (new), `PlannerChatPage` | AI fails → local plan, no message | Draft turn carries *"The AI planner wasn't available…"* + a snackbar |
| UX-230 | `today/liveDayEdit.ts`, `PlannerChatPage` | Unticked row: *"That item isn't on the day any more — reopen the week…"* | *"You left this one out, so it isn't on the day. Redo the plan to put it back."* (the removed-row wording is untouched for the real case) |
| UX-234 | `weekFocusContent.ts` (new), `WeekFocusPanel` | Heading + empty box | Renders nothing |
| UX-235 | `plannerRequest.ts`, both setup cards | *"Anything different…"* / *"Anything special…"* | `PLANNER_REQUEST_LABEL` on both |
| UX-236 | `weekEnergyLabels.ts`, both setup cards | *"How's this week looking?"* / *"How's the week looking?"* | `WEEK_ENERGY_QUESTION` on both |
| UX-237 | `coverageSummary.ts` | `Reading: 27 blocks (short-i-vs-e 5x, ful 5x, comparin…` | Unnameable tags counted, not printed; details capped at 3 |
| UX-238 | `weekEnergyLabels.ts` | `Normal (4.8h/day)` · `Lighter` · `Tough (Minimum Viable Day)` | `Normal` · `Lighter` · `Tough (Minimum Viable Day)` |
| UX-239 | `PlanPreviewCard` | `TODAY'S FOCUS · CHOOSE 2` on all five days | `FOCUS · CHOOSE 2` |
| UX-240 | `PlanPreviewCard` | Green/grey `CheckCircle` on every row of a read-only card | A neutral bullet; no completion tick |
| UX-241 | `PlannerChatPage` | *View/Edit Activities* never rendered | Renders, goes to `/progress?tab=curriculum` |
| UX-242 | `ContextDrawer`, `PlannerChatPage` | `Context` · `Week of 2026-09-06` · unnamed ⓘ | `What Shelly is planning with` · `Week of Sep 7–11` · `aria-label` |
| UX-243 | `plannerPhaseLine.ts` (new), `PlannerChatPage` | One static subtitle on all three screens | `Step 1/2/3 of 3 · …` |
| UX-244 | `PlanDayCards`, `PlannerChatPage` | `masteryReviewLine` rendered twice on review | Once, in the pinned summary panel |
| UX-245 | `PlannerChatPage` | *"Want to adjust anything?"* above *"Quick adjustments:"* | One heading |
| UX-246 | `PlannerChatPage` | `Start Over (Redo Plan)` | `Redo Plan` |

**Deliberately untouched:** FEAT-198's Shaped-by line, FEAT-196's week selector and its stale-week
rail, UX-183's dated Generate/Apply buttons, `applyWeekPlan.ts`, `liveDayEdit`'s write paths,
`chatPlanner.logic.ts`'s minute math, and the page's phase logic.

**Tests added:** `plannerWalkthrough.copy.test.tsx` (17, new) · `coverageSummary.test.ts` (8 → 10) ·
`PlanDayCards.test.tsx` (10 → 12, and two existing FEAT-133 assertions retargeted at the new marker) ·
`liveDayEdit.test.ts` (36 → 39). One existing assertion updated for the shared label
(`PlannerCompactSetup.test.tsx`), and `plannerPlanType.invariant.test.ts` for the dropped argument.

---

## 6 · Batch B — filed, not built

The line held: nothing in this PR edits `PlannerChatPage`'s phase logic, `applyWeekPlan.ts`,
`liveDayEdit.ts`'s write paths, or any minute computation.

| Id | Band | Proposed shape |
|---|---|---|
| **UX-247** | 2 | Collapse `FoundationsFocusLine` to one clamped line with a *why* expander, **or** move it below the setup card. Placement decision + a component change. |
| **UX-248** | 2 | Decide what `PlanSummaryPanel` is FOR at setup. Either gate it to review/active, or label it as summarising the *previous* plan. Entangled with UX-252. |
| **UX-249** | 2 | One setup component with capability/state-driven sections, replacing the wizard/compact pair. Six asymmetric affordances (table in §3). |
| **UX-250** | 3 | Make the three read-aloud pickers agree on when they persist. Setup is local-only; review/active write `plannerDefaults` on change. **A write change.** |
| **UX-251** | 2 | Row density on a phone. Move ↑↓ behind an overflow, or drop the within-day reorder. |
| **UX-252** | 1 | The day budget. `hoursPerDay` is `parseRoutineTotalMinutes(dailyRoutine)` — computed from the thing it constrains. `routineDailyBudgetMinutes` exists, tested, wired to nothing. Needs cadence to reach day construction: UX-206 / UX-208 / UX-209, one piece of work, owner-led. |
| **UX-253** | 2 | A **fourth** `hoursPerDay` source: `PlannerChatPage.tsx:644` sets it from the conversation doc's stored `availableHoursPerDay`, which can disagree with the effect that derives it from `weekEnergy` + `dailyRoutine`. Fold into UX-252. |
| **UX-254** | 3 | A real three-step indicator, if the one-line version proves too quiet. |
| **UX-255** | 3 | On review, the quick-adjust chips and *Print Week Materials* render **below** the free-form chat drawer. Reorder. |
| **UX-256** | 3 | On Fri/Sat the planner opens on next week; editing the live week needs the selector first. Consider a line naming the live week when one is applied. |
| **UX-257** | 3 | *"· Choose 2"* is hardcoded for any focus count ≥ 3. Either derive it or drop it. |
| **UX-258** | 3 | Replace the truncated activities wall with a count + the (now working) link. |
| **UX-259** | 3 | *Other* is routinely the largest coverage bucket and names nothing. Either split it or stop showing it. |
| **UX-260** | 3 | Setup copy load: ~150–190 words before **Generate**. Depends on UX-247 and UX-258. |

---

## 7 · The Shelly walkthrough — five lines, to read aloud

1. Open **Plan My Week**, tap **Lincoln**.
2. Check the two buttons under the blue box say the right week — **This week** or **Next week**.
3. Scroll to the white card. Pick **Normal**, **Lighter** or **Tough**. In *"Anything different this
   week?"* type anything unusual — a trip, an appointment, "less math, we're packing".
4. Tap the big blue **Generate Plan for …** button and wait. Read the days. Tap the **✕** on
   anything you don't want.
5. Tap the green **Apply to …** button at the bottom. It's on Today. You can still change any day
   from here all week.
