# UX Audit — 2026-08-17

> **What this is:** the first run in this repo whose *job* was UI coherence. The monthly
> architecture audit walks the code; this walks the **screens**. Same method — walk, file, rank,
> **fix nothing** (one narrow exception, §9).
>
> **Why it exists.** Owner direction, 2026-08-17: *"this boilerplate that just has a deluge of
> videos seemed like a poor starting setup… it's UI things like this that make me wish you did a
> better job."* The cause is structural, not careless: ~50 runs of defect fixes and feature slices,
> every review aimed at **data safety and honesty**, and no run has ever owned **what the screen
> says and how it reads**. Copy got reviewed for truthfulness about writes; it never got reviewed
> for whether a parent could tell what a button did.
>
> **Method.** This session cannot run the app. Every finding is read off the JSX and its data
> layer, and every one carries a `file:line`. Nothing here is speculative UI taste — each finding
> names the concrete state a parent or a kid can reach.
>
> **Base:** `origin/main` @ `212a928` (post FEAT-152). **Branch:** `claude/ux-audit-2026-08-banjov`.
> **Scope:** parent surfaces walked in full; kid surfaces read-only (flag, don't touch).

---

## 0. Severity key

| | Meaning |
|---|---|
| **P1** | **Confusing or dishonest.** The screen tells the parent something that isn't true, or leaves them stuck. |
| **P2** | **Inconsistent.** Same concept, different words or different treatment, on adjacent surfaces. |
| **P3** | **Polish.** Real, small, cheap. |

**28 findings: 11 P1 · 11 P2 · 6 P3.** Ledger rows filed for P1s only (§10) — the doc carries the rest.

---

## 1. Watch Library — `/watch`

The surface the owner named. FEAT-139 already did real work here (filters, subject grouping, an
Archive tab, three distinct empty states), so the "deluge" is partly addressed. What survives is
the **verb** and the **first screenful**.

### UX-01 · P1 · The button said "Remove"; the system retires and never deletes

`src/features/watch/WatchVideoCard.tsx:166` (row action), `:129` (confirm body), `:139` (confirm
button); `src/features/watch/WatchLibraryTab.tsx:211`, `:232`, `:244`.

Every other part of the feature agrees that this is reversible: `retireVideo` sets
`status: 'retired'`, the tab is literally called **Archive**, the retired row's own action is
**"Put back"**, and the chat tells a parent *"It's in the Archive tab of Watch Library — put it
back from there if you want it again"* (`src/features/shelly-chat/watchActions.ts:105`). One word
disagreed with all of it. The tell was in the confirm copy itself: it had to spend an entire
sentence undoing the fear the verb had just created ("It stays in any week it was already planned
into… You'll find it in the Archive").

**A parent should never need the data model to trust a button.**
**Fixed in this run** (§9). Text only, no behaviour touched.

### UX-02 · P1 · A video added yesterday is labelled "Not watched in the last 90 days"

`src/features/watch/WatchVideoCard.tsx:122`; window from
`src/features/watch/useWatchHistory.ts:32`.

The history line renders `Not watched in the last ${historyWindowDays} days` for **any** entry with
no completed watch in the index — including one vetted in ten minutes ago. The claim is technically
true and reads as an accusation. `historyUnavailable` already establishes the right instinct
(loading and failure both mean *no claim*); "younger than the window" is the third case that
deserves the same silence.

**Proposed fix:** suppress the negative when `vettedAt` is inside the window; say nothing, or
"Added {date}".

### UX-03 · P1 · The library opens with the add-a-video form, not the library

`src/features/watch/WatchLibraryTab.tsx:148`.

`WatchVetInForm` renders unconditionally above the Divider, the tabs, the filters and the shelf —
a title field, a link field, a minutes field, ten subject chips, three scope chips and a
free-text box. On a phone that is roughly the whole first screen. A parent arrives here to **find**
a video far more often than to add one; FEAT-132's own docstring says the reason it got a route was
*"I can't even remember where the video library is."*

**Proposed fix:** collapse the vet-in behind an "Add a video" button/accordion, expanded by default
only when the library is empty.

### UX-04 · P2 · "Added by a parent" and "Added by parent" on adjacent cards

`src/features/watch/watchCuratorLabel.ts:26` returns `'a parent'` for an opaque uid;
`src/features/watch/WatchVetInForm.tsx:103` stamps the literal `'parent'`. The chip template is
`` `Added by ${watchCuratorLabel(video.addedBy)}` `` (`WatchVideoCard.tsx:111`), so a video vetted
in from the form reads **"Added by parent"** and one vetted in through the Shelly portal reads
**"Added by a parent"** — same fact, two spellings, side by side on the same shelf.

**Proposed fix:** return `'parent'` from the uid branch. One word.

### UX-05 · P3 · "Who is it for?" vs "Who it's for"

`src/features/watch/WatchVetInForm.tsx:187` vs `src/features/watch/WatchLibraryFilters.tsx:87`.
Same concept, same screen, two labels. Pick one.

### UX-06 · P3 · The scope chip reads "Both" but the filter's all-value reads "Everyone"

`WatchLibraryTab.tsx:35` (`'Both'`) vs `WatchLibraryFilters.tsx:91` (`"Everyone"`), and the filter
bar then needs a caption to explain the relationship (`:109`). Two words for "not scoped to one
boy" on one screen is why the caption is needed at all.

---

## 2. Today (parent) — `/today`

### UX-07 · P1 · "Est. finish: 2:55 AM"

`src/features/today/TodayChecklist.tsx:403-412`, rendered at `:692`.

`estimatedFinishLabel` is `wall-clock now + remaining planned minutes`, formatted as a time of day,
and it renders whenever any incomplete visible item has minutes. Three ways it says something
absurd:

1. **Evening review of an unstarted day** — 9 PM + 350 planned minutes → "Est. finish: 2:55 AM".
   The owner's own cited example.
2. **Any day that is not today.** `TodayPage` has a date picker (`TodayPage.tsx:113`,
   `selectedDate`, plus `isToday` at `:116`), and `TodayChecklist` renders for the selected day.
   Reviewing Wednesday's plan on Friday produces a finish time computed from Friday's clock.
3. **Any past day at all** — a finish time in the future for a day that is over.

The projection is only meaningful for *today, during the school day*. `isToday` already exists one
component up and is not consulted here.

**Proposed fix:** render the label only when `isToday` **and** the projected time is still inside a
plausible school window; otherwise show remaining minutes with no clock time.

### UX-08 · P2 · Four capitalisation conventions in one column of section headers

`src/features/progress/CurriculumTab.tsx:466` "This week's scans" · `:483` "Active Workbooks" ·
`:511` "Routine Activities" · `:546` "Evaluations (auto-managed)" · `:562` "Completed". Sentence
case, Title Case, and a parenthetical implementation note, stacked vertically. (Filed under Today's
sibling surface; see §4.)

### UX-09 · P3 · Empty-state copy is written for a developer

`CurriculumTab.tsx:486` "No workbooks configured" · `:519` "No routine activities configured."
(with a trailing period the sibling doesn't have). "Configured" is not a word a parent uses about
their child's math book.

---

## 3. Ask AI — `/chat`

### UX-10 · P1 · The "General" tab looks like a peer of the child tabs and has no hands

`src/features/shelly-chat/ShellyChatPage.tsx:310-313` (three equal-weight full-width tabs) and
`:78-86` (the General empty state).

`contextChildId` is `''` on General (`:137-139`), and every action grammar is child-bound — so
**nothing said on the General tab can ever produce a confirm card or a write**. FEAT-152 (merged
today, `6be1944`) fixed the *model* claiming otherwise: it added
`buildGeneralNoWriteContract` and forbade the words "Pushed"/"Added"/"Updated" on that branch. That
was a prompt + write-layer fix and it changed **zero UI copy** — the diff touches
`functions/src/ai/tasks/shellyChat.ts`, `useShellyChatActions.ts` and their tests, nothing else.

So the surface still reads exactly as it did when it lied: three identical tabs, and General's own
subtitle promising *"Ask me anything — teaching ideas, curriculum questions, scheduling"* with
**"Weekly planning help"** as its first suggested prompt — an invitation to ask for precisely the
thing that tab cannot act on. The model now declines gracefully; the screen still sets the parent up
for the decline.

**Proposed fix:** say it in the tab's own empty state — one line, e.g. *"General chat can talk
things through but can't change the app. Switch to Lincoln or London to make changes."*

### UX-11 · P1 · "Confirm all" fires writes, a draft, and a navigation with one tap

`src/features/shelly-chat/ActionConfirmCard.tsx:793-802` → `confirmAll` in
`src/features/shelly-chat/useShellyChatActions.ts:1095-1100`.

`confirmAll` loops every pending card through `applyChatAction` indiscriminately. But the cards are
not the same kind of thing, and the code already knows it — the per-card button is
**"Confirm"**, **"Draft it"**, or **"Review in Plan My Week"** depending on kind
(`ActionConfirmCard.tsx:744-748`). So:

- "Confirm all (3)" confirms a card whose own button explicitly **is not a confirm**.
- A `proposePlanAdjustment` in the batch calls `navigateToPlanner()`
  (`useShellyChatActions.ts:1005-1007`) — **mid-loop**. The parent is teleported to Plan My Week
  while the remaining writes are still landing, and never sees which of them succeeded.

**Proposed fix:** exclude the two non-write kinds from `confirmAll`'s batch and relabel to the count
of actual writes; or, minimally, order the loop so a navigation runs last.

### UX-12 · P1 · "Archive" on a chat thread is a one-way door with no confirm

`src/features/shelly-chat/ChatThreadDrawer.tsx:196` (a bare `MenuItem`) →
`useShellyChatFlows.ts:1072-1086` (`{ archived: true }`).

The word is honest about the write — but `archived == false` is the *only* filter any query uses
(`useShellyChatFlows.ts:167`, `:210`), and **nothing in the app ever reads `archived: true`**. There
is no archived view, no restore, no undo, and no confirmation step: one tap on a menu item and a
whole conversation leaves every list permanently, as far as the UI is concerned.

**This is the exact inverse of UX-01, and the pair is the finding.** The Watch Library said
"Remove" for something reversible with a full Archive tab; Ask AI says "Archive" for something with
no way back. Two surfaces, opposite words, opposite behaviours.

**Proposed fix:** either a confirm + an "Archived" section in the drawer, or rename to "Delete
conversation" with a confirm, so the word matches the door.

### UX-13 · P2 · "Back" and "New" sit adjacent and do the identical thing

`ShellyChatPage.tsx:280` (`aria-label="Back"`, `onClick={handleNewThread}`) and `:295`
(`startIcon={<AddIcon />}`, "New") — both call `handleNewThread`
(`useShellyChatFlows.ts:1050-1058`). Two controls, two names, one behaviour, ~200px apart in a slim
toolbar. Neither says the thread you're leaving is kept.

### UX-14 · P3 · The tab strip hardcodes two children by name

`ShellyChatPage.tsx:310-311` (`value="lincoln"` / `"london"`) and the name-matching at `:137-139`
(`children.find(c => c.name.toLowerCase() === chatContext)`). Cosmetic today. Noted because the
repo's standing rail is *capability, never name* (ARCH-41/42/43), and this is the most visible
place the UI still reads a name.

---

## 4. Progress — `/progress`

### UX-15 · P1 · Six tabs, four of which answer the same question

`src/features/progress/ProgressPage.tsx:28-35`: **Foundations · Monthly Books · Learning Map ·
Curriculum · Skill Snapshot · Word Wall.**

Four of those six — Foundations, Learning Map, Curriculum, Skill Snapshot — are four different
renderings of *"where is Lincoln right now?"*, which is **FUNC-01**, the ledger's named central
architecture tension ("the system can answer *where is Lincoln right now* from six places and none
is authoritative"). This audit's contribution is that **the tension is not only architectural — it
is the literal top-level navigation of the parent's main progress screen**, six items wide on a
phone, with no hierarchy and no indication which one to trust.

**Proposed fix (structural, not this run):** nest the three derived views under Foundations (which
FEAT-65 already made the first-class home), leaving a top level of Foundations · Monthly Books ·
Word Wall.

### UX-16 · P2 · Curriculum leads with a scan feed, not the curriculum

`CurriculumTab.tsx:465-480` puts "This week's scans" first, above "Active Workbooks" (`:483`) — the
thing the tab is named after and the thing a parent opens it to check. When there are no scans, the
first thing on the screen is an empty state telling them to go use a different page.

### UX-17 · P2 · The Kid/Parent toggle is unlabelled and gates a hidden panel

`src/features/monthly-review/MonthlyReviewReader.tsx:262-276`: a bare `ToggleButtonGroup` reading
**Kid | Parent**, centred in the top bar with no label. Nothing says it switches *how the book
renders*; it reads like a profile or account switch. It also silently gates the diagnostic panel
(`:315`), so a parent who taps "Kid" watches a panel vanish with no cause given.

**Proposed fix:** label it "View as", or use "Kid view" / "Parent view".

### UX-18 · P2 · Five hidden surfaces, two flag names, zero toggles, on a phone-first app

`?diag=1`: `ProgressPage.tsx:90` (Foundations seeder), `ProgressPage.tsx:94`
(`DataReviewExportPanel`, gated at `records/DataReviewExportPanel.tsx:110`),
`MonthlyReviewReader.tsx:315` (`DiagnosticPanel`, gated at
`monthly-review/DiagnosticPanel.tsx:56`). `?debug=1`: `components/DebugPanel.tsx:53`.

Five debug surfaces, gated by **two different query-string names for the same idea**, none of which
can be turned on or off from any UI. The repo's own rule is *phone-first — the human's actions are
limited to pasting a run, uploading a file, and reviewing a PR*; hand-editing a URL on a phone is
outside that. `DebugPanel` is the only one that even offers a minimise tap (`:85`), and the
`DiagnosticPanel` — raw JSON on a page a kid can be handed — offers no dismiss at all.

**Proposed fix:** one flag name, and one long-press/hidden entry point that sets it.

---

## 5. Planner — `/planner/chat`

### UX-19 · P1 · After Apply, dead controls look exactly like live ones

`src/features/planner-chat/PlanDayCards.tsx:130-135` gates four handlers to `undefined` once
`applied`; `src/features/planner-chat/PlanPreviewCard.tsx:205-223` and `:261-264` are where that
lands.

- **The accept toggle:** with a handler it's an `IconButton` wrapping `CheckCircleIcon`; without
  one it's the *same icon*, bare (`:217-223`). Pixel-identical, silently inert.
- **Planned minutes:** `EditableTime` with `editable={!!onUpdateTime}` (`:261-264`) renders as plain
  text post-Apply — same number, same place.

So a parent who edited minutes ninety seconds ago taps the same number and nothing happens, with no
explanation. What makes this a defect rather than a limitation is that **the same card already knows
how to say why**: FEAT-138's `itemEditLockReason` gives a plain-language reason for row locks on
finished work. One class of post-Apply restriction explains itself; the other just goes quiet.

**Proposed fix:** reuse the `itemEditLockReason` treatment — e.g. "Minutes are set for the week —
change it on Today."

### UX-20 · P1 · The applied week still shows rows that were never written

`applyWeekPlan.ts:261` (`.filter(item => item.accepted && !item.isAppBlock)`) and `:362`
(`dayPlan.items.filter(item => item.accepted)`) — Apply writes **accepted items only**. But the
post-Apply `PlanDayCards` renders `currentDraft` unchanged (`PlannerChatPage.tsx:3048-3063`), so
unaccepted rows are still on the card, struck through at 0.4 opacity
(`PlanPreviewCard.tsx:202`, `:228`).

Post-Apply the cards are advertised as a mirror of the saved days
(`PlannerChatPage.tsx:1895`, "the day cards are a MIRROR of saved documents"). They are not: they
show rows that exist nowhere in the child's record, and the toggle that would put one back is the
one UX-19 just disabled. A parent reading "what's on Wednesday" reads items that aren't.

**Proposed fix:** drop unaccepted items from the applied-phase render.

### UX-21 · P2 · Two chips for the same idea, one prose, one raw enum

`PlanPreviewCard.tsx:242-246` renders `SkipAdvisorChip` with a written label ("Skip eligible" /
"Lighter"). Six lines later, `:253-258` renders `label={item.skipSuggestion.action}` — and that
field is typed `'skip' | 'modify'` (`core/types/planning.ts:476`). So the card can show a chip
reading **"Skip eligible"** next to a chip reading **"skip"**, lowercase, straight out of the union.

### UX-22 · P3 · "Start Over (Redo Plan)"

`PlannerChatPage.tsx:3108`. The label says the same thing twice, and the most destructive control on
the page carries the same visual weight as "Print Week Materials" (`:3087-3095`). The confirm dialog
behind it (`:3112-3117`) is excellent and honest — the button is the weak link.

---

## 6. App shell / nav — every surface

### UX-23 · P1 · The parent sidebar stacks two identical-looking identity pills; only one is tappable

`src/app/AppShell.tsx:80-112`.

Row 1 is `ProfileMenu` — a 32px avatar plus a name, tappable, and it switches **who is using the
app** (`components/ProfileMenu.tsx:92-130`). Row 2, directly beneath it, is an
`AvatarThumbnail` plus a `Chip` with the active child's name — visually the same construction, and
it has **no `onClick` at all**. Nothing labels either one. A parent who taps "Lincoln" to change
which child they're looking at gets nothing; the child selector lives inside individual tabs
(e.g. `CurriculumTab.tsx:451-458`), not here.

**Proposed fix:** label the child row ("Viewing: Lincoln") and either make it the child switcher or
visually demote it out of pill shape.

### UX-24 · P2 · A parent on Records → Portfolio sees the mobile header say "My Stuff"

`AppShell.tsx:198-202`. `allNavItems` is `[...navItems, ...kidNavItems]`, and the first pass is an
**exact** path match — so `/records/portfolio` matches the *kid* nav entry
(`{ label: 'My Stuff', to: '/records/portfolio' }`, `:47`) before the parent's `/records` entry can
be reached by the prefix pass. The parent's own header renders the kid's word for the page.

### UX-25 · P2 · Reachable parent pages whose mobile header reads "Home"

Same block, the `?? 'Home'` fallback at `AppShell.tsx:202`. `/evaluate`
(`router.tsx:73` — the reading evaluation chat, a real parent destination) and `/stickers`
(`:78`) are in no nav list, so the mobile header labels them **"Home"** — a page name that
corresponds to nothing in this app (`/` redirects to `/today`).

---

## 7. Kid surfaces — read-only pass

Findings only. **Nothing in this section was touched**, per the run's rails.

### UX-26 · P2 · Two irreconcilable counts, one inch apart

`src/features/today/KidChecklist.tsx:320` renders `{mustDoCompleted} of {mustDo.length} quests
done` — denominator is must-do checklist items only. Line `:343` renders
`${listRemaining} quests to go!` where `listRemaining = combinedRemaining(mustDoRemaining,
ritualsRemaining)` (`:110`) — must-do remaining **plus** visible rituals
(`kidRitualRows.ts:78-83`).

With 11 must-do items, 1 done, and three rituals open, the kid reads **"1 of 11 quests done"**
directly above **"13 quests to go!"** The two numbers cannot both be about the same list, and the
second is larger than the first's denominator minus its numerator. The module's docstring
(`kidRitualRows.ts:21`) is explicit that the widened finish-line is display-only and deliberate —
the bug is that only *one* of the two lines got widened.

**Proposed fix:** widen the "done" line to the same set, or drop it.

### UX-27 · P2 · A kid is told to visit a screen that isn't in their nav

`src/features/today/KidTodayView.tsx:610`: *"No armor forged yet—want to visit Avatar and craft your
first piece?"* The kid's nav has no "Avatar" — the entry for `/avatar` is labelled **"My Hero"**
(`AppShell.tsx:46`). The prompt names the route, not the destination the kid can see.

### UX-28 · P3 · 0.4rem body text on the surface built for a 10-year-old with speech needs

`KidTodayView.tsx:570`, `:581`, `:593`, `:605` (`fontSize: isLincoln ? '0.4rem'`) and
`TodayChecklist.tsx:701` (`'0.45rem'`). That is ~6.4px. It is the *Press Start 2P* pixel-font
treatment, so it's a deliberate aesthetic — but it is applied to the motivation line, the armor
status line and the XP chip, i.e. the copy those elements exist to deliver.

---

## 8. Ranked top 10

Ranked by *how often a parent hits it* × *how wrong the screen is when they do*.

| # | ID | P | Finding | Where |
|---|---|---|---|---|
| 1 | **UX-01** | P1 | "Remove" for a retire-don't-delete archive | `WatchVideoCard.tsx:166` — **fixed this run** |
| 2 | **UX-07** | P1 | "Est. finish: 2:55 AM"; also wrong on every non-today day | `TodayChecklist.tsx:403` |
| 3 | **UX-19** | P1 | Post-Apply dead controls look identical to live ones | `PlanPreviewCard.tsx:217`, `:261` |
| 4 | **UX-20** | P1 | Applied week shows rows Apply never wrote | `PlannerChatPage.tsx:3048` + `applyWeekPlan.ts:261` |
| 5 | **UX-10** | P1 | "General" tab promises help it structurally cannot give | `ShellyChatPage.tsx:78`, `:310` |
| 6 | **UX-12** | P1 | Chat "Archive" is an unconfirmed one-way door | `ChatThreadDrawer.tsx:196` |
| 7 | **UX-11** | P1 | "Confirm all" mixes writes with a navigation | `ActionConfirmCard.tsx:793` |
| 8 | **UX-02** | P1 | "Not watched in the last 90 days" on a video added yesterday | `WatchVideoCard.tsx:122` |
| 9 | **UX-23** | P1 | Two identity pills, one inert, neither labelled | `AppShell.tsx:80` |
| 10 | **UX-15** | P1 | Six Progress tabs, four answering one question | `ProgressPage.tsx:28` |

UX-03 (library opens with the form) is the eleventh and the one the owner actually pointed at; it
ranks below these only because it costs a scroll rather than a wrong belief.

---

## 9. Suggested batching into fix runs

Deliberately ordered **highest value per line changed first**. Each is one PR.

### Batch A — wording only (~15 lines, no behaviour, no new tests beyond copy assertions)

The cheapest run in the list and the one that closes the most "the app lied to me" reports.

- **UX-01** — Remove → Archive. ✅ **Already done in this run** (§10).
- **UX-04** — `watchCuratorLabel` returns `'parent'`, not `'a parent'`.
- **UX-05 / UX-06** — one label for "who it's for", one word for the shared scope.
- **UX-09** — de-jargon the two Curriculum empty states.
- **UX-17** — label the Kid/Parent toggle "View as".
- **UX-21** — give `skipSuggestion.action` a display label instead of rendering the union member.
- **UX-22** — "Start Over" (drop the parenthetical).
- **UX-27** — say "My Hero", not "Avatar", in the kid's armor prompt.

### Batch B — computed copy that can be wrong (small, each needs one guard + tests)

- **UX-07** — gate "Est. finish" on `isToday` and a plausible window.
- **UX-02** — suppress the "not watched" negative for entries younger than the window.
- **UX-24 / UX-25** — resolve the mobile header label against the *current profile's* nav list, and
  replace the `'Home'` fallback.
- **UX-10** — one honest line in the General tab's empty state.

### Batch C — mode and state honesty in the planner + chat (the real work)

- **UX-19** — explain post-Apply locks with the existing `itemEditLockReason` treatment.
- **UX-20** — drop unaccepted rows from the applied-phase render.
- **UX-11** — take navigation-only and draft-only kinds out of `confirmAll`.
- **UX-12** — decide whether chat threads archive (needs a restore path) or delete (needs a confirm).

### Not batched — owner decisions, not fix runs

- **UX-15** (Progress tab structure) — a navigation restructure and a FUNC-01-adjacent call.
- **UX-03** (collapse the vet-in form) — small, but it changes the shape of the screen the owner
  named; worth his eye first.
- **UX-23** (identity pills) — depends on whether the child chip should *become* the switcher.
- **UX-18** (diag flags) — needs a decision on one flag name and one entry point.
- **UX-28** (0.4rem kid type) — a deliberate aesthetic; his call, not a run's.

---

## 10. What this run changed

**Filed, not fixed:** 27 of 28 findings.

**Fixed — the run's single narrow exception** (pure label text, dishonest about the data model, no
behaviour):

| File | Was | Now |
|---|---|---|
| `WatchVideoCard.tsx:166` | `Remove` | `Archive` |
| `WatchVideoCard.tsx:139` | `Remove from library` | `Move to Archive` |
| `WatchVideoCard.tsx:129` | "Remove “X” from the library?" | "Archive “X”?" + "you can put it back any time" |
| `WatchLibraryTab.tsx:211` | "have been removed from the library" | "are archived" |
| `WatchLibraryTab.tsx:232` | "Videos you removed from the library." | "Videos you archived." |
| `WatchLibraryTab.tsx:244` | "Videos you remove from the library land here" | "Videos you archive land here" |

`WatchLibraryTab.test.tsx` updated to the new wording, plus **one new case** pinning the rule so it
can't regress: *"never calls the affordance 'Remove' — the write is reversible and the word says
so"*. `retireVideo` / `restoreVideo` / `onArmRetire` / `onConfirmRetire` are untouched; the propose→
confirm behaviour is asserted unchanged by the same suite (20 files / 241 tests green).

**Ledger:** one row for the audit itself (`DOC-15`, arch-audit form), plus **one row per P1** and
nothing else — the doc carries the P2s and P3s so the ledger doesn't fill with paper cuts. The
eleven P1s map to `FUNC-16` … `FUNC-26`:

| UX id | Ledger row | UX id | Ledger row |
|---|---|---|---|
| UX-01 (fixed here) | `FUNC-16` | UX-12 | `FUNC-22` |
| UX-02 | `FUNC-17` | UX-15 | `FUNC-23` |
| UX-03 | `FUNC-18` | UX-19 | `FUNC-24` |
| UX-07 | `FUNC-19` | UX-20 | `FUNC-25` |
| UX-10 | `FUNC-20` | UX-23 | `FUNC-26` |
| UX-11 | `FUNC-21` | | |

Additive only — `+12 rows / −0`, no existing row rewritten, reordered, or reopened. See
`REVIEW_HOME_BASE.md` §6.

---

## 11. The finding behind the findings

Every P1 in this document is a **truthful screen that was never read out loud**. Not one is a bug in
the sense the architecture audits hunt: the writes are safe, the guards hold, the confirm cards say
what they will do, and several of these files carry long, careful docstrings explaining exactly why
the behaviour is right. UX-01's confirm copy is the perfect miniature — it precisely and honestly
described a reversible operation, in a sentence that only existed to walk back the button above it.

The gap this audit fills is that no run has ever been assigned **"read the screen as a tired parent
at 9 PM."** The architecture audit protects the data. This one protects the sentence. Both need to
run.

**Recommendation:** make this recurring, quarterly, at the same cadence and in the same shape as the
monthly architecture audit — walk, file, rank, fix only dishonest words. The reusable prompt should
land in `docs/review/prompts/` on the first repeat run, once the shape has proven itself twice.
