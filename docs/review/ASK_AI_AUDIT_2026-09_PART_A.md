# Ask AI functional audit — Part A: the writes that reach a child's record

> **Run:** FEAT-192a · 2026-09-05 · branch `claude/ask-ai-audit-part-a-jek98o`
> **Scope:** the eleven `ChatAction` kinds that write a child's own record, plus the chat's image door.
> **Out of scope (Part B / FEAT-192b):** `proposePlanAdjustment` · `removeItemFromDay` · `moveItemToDay` ·
> `addItemToDay` · `vetInVideo` · `planVideoOnDay` · `draftNextWeek` · `createConceptArc` · `planLab` ·
> thread management · context-scope switching · the follow-up / friction capture paths.
>
> **This audit changed no behaviour.** Every defect below is filed, not fixed. Two of them sit on
> propose-and-confirm invariants (`skillSnapshots`, `sightWordProgress`) and are the owner's to rank.
>
> **Ground confirmed at Step 0:** `main` at `f5984744`; the `ChatAction` union carries **20 kinds**,
> exactly the eleven in scope plus the nine handed to Part B. Baseline suite: **518 files / 7,464 tests,
> all passing** — unchanged by this run.

---

## 1 · The owner's answer

**Should Shelly be doing these eleven things through Ask AI?** For three of them, yes, and not as a
convenience — as the only door there is. **Adding or removing a sight word has no other affordance in the
app.** `SightWordDashboard` (`/books/sight-words`) can only confirm or un-confirm mastery on a word the
reader already put there; it has no "add a word" and no "remove a word" control, and the writers
`addSightWord` / `removeSightWord` say so in their own header ("*so `SightWordDashboard` can adopt them
later*" — it hasn't). If Shelly wants "said" on Lincoln's list because she heard him read it at the
kitchen table, Ask AI is where she does that or she does not do it. The same is true, more weakly, of the
soft-profile fields: Settings has an editor, but reaching it is four taps and a keyboard, and *"Lincoln's
really into Lego now too"* is one sentence. For those three kinds the chat is not a worse door with more
steps — it is the door.

**For the four snapshot kinds the answer is: not until two defects are fixed, and then only for adding.**
The Skill Snapshot page already does everything the chat does and more — it adds, edits *and* removes
priority skills, supports and stop rules — so the chat is a strictly weaker second door whose only
advantage is that it takes one sentence. That trade would still be worth making, except that
`markSkillProgress` currently does not do what its card says. A card reading *"Mark 'th digraph' as
**progressing** for Lincoln"* writes `level: "secure"`, `masteryGate: 3` — the app's top mastery rating —
because `fullyMastered` gates only the conceptual-block branch of `applyToSnapshot` and never the
priority-skill branch (**F2**, verified by execution). And when the skill text the model composed does not
slug-match an existing entry exactly, the write does nothing at all while the card stamps "Done ✓"
(**F5**). Shelly's own sentence — *"he finally got his 'th' sound"* — hits both: it is a progressing
claim that lands as mastery if it matches, and a silent no-op with a green tick if it doesn't. The
snapshot is the authority for what to teach next. Until the card and the write agree, the dedicated page
is the better door for these four, and it isn't close.

**For the four curriculum kinds the chat is genuinely good, and `setActivityMinutes` is the best-built
write in the portal.** Its card names the activity, shows a real `30m → 20m` off the live config, says
loudly when the activity is shared, and states what the write does not touch — and the writer underneath
sets exactly one field. *"Make the math block 20 minutes instead of 30"* works end to end, and doing it at
Progress → Curriculum means finding the row and opening a dialog. `markActivityComplete` is nearly as
good (it is the one card in the app that warns there is no undo). `setActivityPosition` works but its
footnote is incomplete — the write also moves the learner model (**F7**). `addActivity` works but its card
hides `type`, the field that decides whether the thing you just created is a workbook or an app
(**F8**). Net: use the chat for all four; fix the two cards.

**The two answers that are not per-kind.** First: **`/chat` is nav-gated, not route-gated, and seven of
the eleven kinds have no capability gate at all.** Every part-B kind is `canEdit`-checked at three
layers; the two sight-word kinds, `editProfileField` and all four snapshot kinds are checked at none. A
child profile that reaches `/chat` by URL can confirm a write to `skillSnapshots` (**F3**). Second: the
chat's **image door is ungated and unmetered** — no `isParent`, and `src/features/shelly-chat/` contains
no reference to `artQuota` whatsoever, so it stands outside the "one counter, five surfaces" accounting
FEAT-175 describes (**F4**). Neither of these is about whether Ask AI is a good door. They are about who
is standing at it.

**And the honest caveat on the question Shelly actually asked.** She said the planner "wasn't updating
correctly to things she wanted." FEAT-198 diagnosed and fixed exactly that on 2026-09-05 — her typed
request now goes last and fenced in every planner prompt. This audit found the *structural* reason the
chat felt more responsive than the planner: **the chat's request has always been the last message**, and
the planner's was not. That asymmetry is closed. What this audit adds is a number for the other side of
it: the chat's system prompt carries a **41,635-character static floor before any family data**, of which
**68.6% is action grammar** (§4). Whether eleven grammars competing in one prompt is why some sentences
produce a card and some don't is not something this audit can answer without live calls — but the number
is now on the record, and nobody had looked at it.

---

## 2 · The eleven kinds

Legend: ✅ holds · ⚠️ holds with a defect · ❌ does not hold. Cells that are not ✅ name the finding.

| # | Kind | Q1 Reachable | Q2 Parse matches addendum | Q3 Card complete | Q4 Write matches card | Q5 Touches an invariant | Q6 Better door |
|---|---|---|---|---|---|---|---|
| 1 | `addSightWord` | ✅ | ⚠️ F14 | ❌ **F1** | ❌ **F1** | ⚠️ **F3** (ungated) | **Chat — it is the only door** |
| 2 | `removeSightWord` | ✅ | ⚠️ F14 | ⚠️ F9 | ✅ | ⚠️ **F3** | **Chat — it is the only door** |
| 3 | `editProfileField` | ✅ | ✅ | ⚠️ F10 | ⚠️ F15 | ⚠️ **F3** | Chat (Settings is 4 taps) |
| 4 | `addPrioritySkill` | ✅ | ✅ | ✅ | ⚠️ F5 | ⚠️ **F3** · `skillSnapshots` | Snapshot page (chat can't remove) |
| 5 | `addSupport` | ✅ | ✅ | ✅ | ⚠️ F5 | ⚠️ **F3** · `skillSnapshots` | Snapshot page |
| 6 | `addStopRule` | ✅ | ✅ | ✅ | ⚠️ F5 | ⚠️ **F3** · `skillSnapshots` | Snapshot page |
| 7 | `markSkillProgress` | ✅ | ✅ | ❌ **F2** | ❌ **F2** · F5 | ⚠️ **F3** · `skillSnapshots` | **Snapshot page — until F2/F5 are fixed** |
| 8 | `addActivity` | ✅ | ✅ | ⚠️ **F8** | ✅ | ✅ none | Chat |
| 9 | `markActivityComplete` | ✅ | ⚠️ F16 | ✅ | ✅ | ✅ none | Chat |
| 10 | `setActivityPosition` | ✅ | ⚠️ F16 | ⚠️ **F7** | ⚠️ **F7** | ⚠️ `learnerModels` | Chat |
| 11 | `setActivityMinutes` | ✅ | ⚠️ F16 | ✅ | ✅ | ✅ none | **Chat — the best-built write here** |

**Cross-cutting, so not a column:** every one of the eleven is staged without checking that
`action.childId` is the active child or even a family child, so a mismatched card renders and its Confirm
button is silently inert (**F6**); and the acting child is bound by the literal name union
`'lincoln' | 'london' | 'general'` (**F11**).

### Q1 in detail — reachability

All eleven **are** reachable. Hypothesis 1 from the run prompt is confirmed in full: every kind has a
grammar addendum, `editProfileField` lives inside `buildSightWordActionAddendum`
(`functions/src/ai/tasks/shellyChat.ts:944`), and all four builders that carry part-A kinds are
concatenated into the system prompt at `shellyChat.ts:1846–1849`. Each returns `""` when `childId` is
absent, so the General tab emits no grammar — and hypothesis 4 is confirmed too: `stagePendingActions`
drops every action when `activeChildIdRef.current` is empty, out loud, via `generalTabDropNotice`
(`useShellyChatActions.ts:781`).

The three id-taking curriculum kinds depend on `formatChatActivities` (`shellyChat.ts:131`), which does
render each config's real doc id (`(id: <docId>)`) and instructs the model to copy it exactly. It returns
`""` when the family has no active configs — see **F16** for what that costs.

The model can also see what it needs to compose good payloads: `TASK_CONTEXT.shellyChat`
(`contextSlices.ts:103`) includes `childProfile` (which prints `Motivators:` / `Interests:` /
`Strengths:` when non-empty, `contextSlices.ts:351–358`), `sightWords`, and `skillSnapshot`. So the
`editProfileField` replace-write does have the current value in front of it, and `markSkillProgress` does
have the real priority-skill labels. Both mitigations are real; neither is structural (F11, F5).

### Q2 in detail — parse vs addendum

Field-by-field, every addendum example parses. The three mismatches are small:

- `word` is validated on `obj.word.trim()` but returned **untrimmed** (`parseChatActions.ts:197`), then
  trimmed by the writer — so the card can display padding the write will not store (**F15**).
- `editProfileField.value` is deliberately allowed to be empty ("*clearing a field*"), which is a
  designed capability, correctly surfaced by `confirmVerb` → `"Clear this field"`. Not a defect.
- The literal placeholder `<id from ACTIVITIES>` in three addendum examples is a non-empty string and
  therefore **parses**, reaching the resolver as an unmatched id (**F16**).

### Q5 in detail — what the eleven touch

**No part-A kind reaches hours, `xpLedger`, a `dayLog`, or an applied week.** Traced end to end and
confirmed:

- The sight-word and profile writers touch one document each (`sightWordProgress` / `children`).
- `applySnapshotAction` → `writeSnapshotUpdate` writes `skillSnapshots` only, merge-only, and never
  `workingLevels`.
- `updateActivityConfigMinutes` writes `defaultMinutes` + `updatedAt`, nothing else.
- `addActivityConfig` / `completeActivityConfig` write one `activityConfigs` doc.
- **The one surprise:** `setActivityConfigPosition` additionally calls `syncActivityPositionToModel` →
  `syncWorkbookPositionToModel`, which **can** merge-write `learnerModels.conceptStates`, `openQuestions`,
  `changeFeed` and `synthesisStaleAt` (`activityConfigWrites.ts:200`, `workbookPositionSync.ts:118`). It is a
  **conditional** side effect, not an unconditional second write — see **F7** for the five gates it has to
  clear. This is **parity with the Curriculum surface**, not a chat-only path, and it is upgrade-only, so it
  is not a P1. But when it does fire, the card does not say so.

There is **no reachable path from any part-A kind to an hours or XP write.** The invariant holds.

---

## 3 · The image door

Files: `src/features/shelly-chat/useShellyChatFlows.ts` (`handleGenerateImageDirect:533`,
`handleImageFlowOpen:638`, `handleImageIdeaSubmit:658`, `handleImageRefinementGenerate:729`,
`handleJustGenerate:800`, `handleUploadGenerate:1047`) and `ShellyChatPage.tsx:712`.

**Q-I1 · Reachability — a child profile can reach it. P1 (F4).** `/chat` sits outside `RequireParent` in
`src/app/router.tsx:105`; only the nav entry is gated (`AppShell.tsx:38`, `parentOnly: true`). The
codebase acknowledges this repeatedly in its own comments ("*a kid who reached `/chat` directly (the
route is nav-gated, not route-gated)*"). The image button itself carries **no capability check at all** —
`<IconButton onClick={handleImageFlowOpen} disabled={isBusy}>` — and neither does any of the six
handlers. `ShellyChatPage` computes `isParent` and threads it into six other things; the image door is
not one of them.

**Q-I2 · Quota — hypothesis 5 confirmed. P1 (F4).** `grep -rn "artQuota|useArtQuota|recordGeneration"
src/features/shelly-chat/` returns **zero matches**. For a *parent* this is correct and by design: every
quota host passes `{ capped: isChildProfile }` and parent doors are uncapped. The gap is the kid path —
because the door has no capability gate either, a child at `/chat` gets an image generator that is both
ungated and unmetered. It is the one paid generator in the app outside FEAT-175's "one counter, five
surfaces" accounting, so a child's weekly art number is no longer the honest total FEAT-175 claims it is.

**Q-I3 · Refusals — FEAT-195 is wired, but only as prose. P3 (F18).** Confirmed: `useShellyChatFlows.ts`
imports `classifyImageGenerationFailure`, `imageFailureAlternatives` and `imageFailureChatMessage` from
`books/imageGenerationFailure` and composes the same content the shared card would show, with the same
empty-suggester fallback to `BLOCKED_TIPS`. The code states the reason it differs — *"a chat reply cannot
hold the shared card — it is persisted text, not a component"* — and that is true. The consequence is
that FEAT-195's headline property does **not** hold on this door: the alternatives are text the parent
retypes, not taps that spend a new generation. Not a dead end; not the card either.

**Q-I4 · Where it lands — the chat thread and nowhere else. P2 (F13).** A successful generation is
written as one assistant message carrying `imageUrl` (`useShellyChatFlows.ts:584`). There is **no
`artifacts` write, no `stickerLibrary` write, and no `childId`** — the only child association is the
thread's `chatContext`, which is the name-keyed tab (F11). So an image Shelly generates in Ask AI is not
evidence, cannot be tagged, will not appear in a portfolio or a monthly review book, and cannot be
back-filled by child the way B14's artifact backfill does. Separately, every chat generation sends
`style: 'general'`, the prefix FEAT-193 moved the Game Workshop *off*, so the **server** contributes no
visual recipe and the whole look rides on the composed prompt — which the refinement path supplies and the
other paths do not (**F17**).

---

## 4 · The prompt measurement

Measured by **assembling the real template** at `shellyChat.ts:1841–1863` byte for byte — the nine action
grammars, `buildShellyChatRoleSection`, friction capture, web search, `CHARTER_PREAMBLE` and the fixed
follow-up postamble — for a child-scoped call with two children, with the two per-family slices left empty.
This is the **static floor**: every row below is present on every child-tab turn before a single byte of
family data.

Measured on the assembled string, not by summing the rows: the template's own separators are part of the
prompt. The components total 41,620 characters and the assembled prompt is **41,635** — 15 newlines the
template inserts (four around `supplementalContext`, eleven between `roleSection` and the builders that
follow it).

| Section | Chars | ~Tokens |
|---|---:|---:|
| `CHARTER_PREAMBLE` | 2,361 | 590 |
| `roleSection` | 8,125 | 2,031 |
| **sight word + profile grammar** | **2,639** | **660** |
| **snapshot grammar** | **2,003** | **501** |
| **activity-minutes grammar** | **2,115** | **529** |
| **curriculum grammar** | **4,623** | **1,156** |
| dad lab grammar | 3,976 | 994 |
| day item grammar | 3,465 | 866 |
| watch grammar | 4,085 | 1,021 |
| plan-adjustment grammar | 2,834 | 709 |
| next-week-draft grammar | 2,817 | 704 |
| friction capture | 864 | 216 |
| web search | 1,301 | 325 |
| follow-up postamble | 412 | 103 |
| template separators | 15 | ~4 |
| **TOTAL (assembled static floor)** | **41,635** | **~10,409** |
| **of which action grammar** | **28,557** | **~7,139 — 68.6%** |

**Part A's four grammars are 11,380 chars (27.3% of the floor); Part B's five are 17,177 (41.3%).**
(The three shares are unchanged by the separator correction at this precision.)

On top of this sit the per-family slices — charter extras, child profile, learner model, engagement,
grade results, recent eval, sight words, week focus, word mastery, workbook paces, skill snapshot, child
skill map, cross-domain history, recent scans, hours progress, today's day, Dad Lab reports, plus the
supplemental block (all children, disposition, weekly reviews, conundrum, completion patterns, chapter
responses, teach-backs, concept arcs). Those need Firestore and were **not** measured; the handler already
logs their real size at `shellyChat.ts:1802` (`sharedContextLength` / `supplementalLength`), so the true
figure is recoverable from a production log without further work.

Only the **last 20 messages** are sent (`shellyChat.ts:1868`).

### Contradictions found

One, and it touches two part-A kinds (**F12**). Both the activity-minutes grammar and the curriculum
grammar route "reshaping next week" to the plan-adjustment handoff:

> *"use the plan-adjustment handoff below instead"* (activity minutes)
> *"Reshaping NEXT week is the plan-adjustment handoff below."* (curriculum)

The handoff grammar then says the opposite about itself:

> *"**PRECEDENCE (read this first): if a NEXT-WEEK DRAFT section appears below, that is the default route
> for reshaping next week, and this handoff is NOT.**"*

The ordering is right (handoff before draft, so "below" resolves), and the handoff's own rule is the later
and more specific instruction, so a careful reader lands correctly. But two grammars name a route that a
third grammar disowns, which is precisely the shape FEAT-198 named: an instruction whose precedence is
stated somewhere else is a wish. No other contradiction was found among the eleven — the "lane boundary"
sentences at the end of each grammar are mutually consistent and each names its neighbours correctly.

---

## 5 · Findings

### P1 — data is wrong, an invariant moves, or a parent confirms something she cannot see

---

**F1 · `addSightWord` resets an existing word's progress to zero, and its own docblock says it doesn't.**
`src/features/books/useSightWordProgress.ts:27–51`

`addSightWord` builds a `seed: SightWordProgress` carrying **every field of the type** — `encounters: 0`,
`selfReportedKnown: 0`, `helpRequested: 0`, `shellyConfirmed: false`, `masteryLevel: 'new'`,
`firstSeen: now`, `lastSeen: now`, `lastLevelChange: now` — and writes it with
`setDoc(docRef, seed, { merge: true })`. Firestore's `merge` operates per field: fields **present** in the
payload are overwritten, only absent ones survive. `SightWordProgress` (`src/core/types/books.ts:465–480`)
has exactly nine fields and the seed sets all nine. So the merge preserves nothing.

The docblock claims the opposite in as many words: *"Idempotent: writes with `{ merge: true }` … so
re-adding a word that already exists is a **no-op-ish merge rather than a progress reset**."*

**Failure scenario — the run prompt's own sentence.** Lincoln has read "said" thirty times; the reader has
written `encounters: 30`, `masteryLevel: 'mastered'`, `shellyConfirmed: true`. Shelly types *"He knows
'said' now"*. The model proposes `addSightWord`. The card reads **"Add sight word "said" for Lincoln"** —
no mention of a reset — she taps Confirm, and the record becomes `encounters: 0`, `masteryLevel: 'new'`,
`shellyConfirmed: false`, `firstSeen` today. The dashboard now shows a mastered word as new; the Generate
Chat's practice-word channel (FEAT-169/172) will hand it back as a `new` word to practise. The sentence
that caused this is the sentence a parent would most plausibly say.

**This is the two-doors-to-one-collection case FEAT-188 warned about**, and the two doors disagree: the
reader's `recordInteraction` accumulates, the chat's add resets. `removeSightWord` has no equivalent
problem.

*Report only — `sightWordProgress` is a child's record and a fix is a separate, confirmed run.*

---

**F2 · `markSkillProgress` marked "progressing" writes full mastery.**
`src/features/evaluate/skillSnapshotWrites.ts:212–222` · card at
`src/features/shelly-chat/ActionConfirmCard.tsx:183`

`applySnapshotAction` maps `markSkillProgress` to `writeSnapshotUpdate({ masteredSkills: [skill],
fullyMastered: action.mastered === true, … })`. Inside `applyToSnapshot`, `fullyMastered` is consulted in
exactly one place — `targetStatus` for the **conceptual-block** branch. The **priority-skill** branch never
reads it:

```ts
if (gate >= MasteryGate.IndependentConsistent && skill.level === SkillLevel.Secure) return skill
skillsChanged = true
return { ...skill, level: SkillLevel.Secure, masteryGate: MasteryGate.IndependentConsistent }
```

**Verified by execution**, not by reading a test. Given a priority skill `{ label: 'th digraph',
level: Emerging, masteryGate: NotYet }` and `{ masteredSkills: ['th digraph'], fullyMastered: false }`,
`applyToSnapshot` returns `changed: true` and
`{"tag":"th-digraph","label":"th digraph","level":"secure","masteryGate":3}`.

**Failure scenario.** Shelly says *"he's getting the hang of CVCe"*. The model correctly omits `mastered`.
The card says **"Mark "CVCe long vowels" as progressing for Lincoln"**. She taps. The snapshot records
`secure` / `IndependentConsistent` — the app's top rating, the same value a completed guided evaluation
would write. Every downstream reader that gates on level (the planner's priority-skill targeting, quest
targeting, Knowledge Mine access) now believes a skill she described as *forming* is finished. The
snapshot is additive-only by design, so there is **no chat path back** — only the Skill Snapshot page can
lower it, and only if someone notices.

The word "progressing" appears on the card and nowhere in the write. This is the exact defect class the
run prompt named: *a card saying one thing over a writer that does another.*

*Report only — `applyToSnapshot` is the central `skillSnapshots` writer and is propose-and-confirm. Note
that this is a property of the shared reducer, so the FUNC-02 scan write-through carries it too; the scan
path just never renders a card promising otherwise.*

---

**F3 · Seven of the eleven record-write kinds have no capability gate.**
`src/features/shelly-chat/useShellyChatActions.ts:753–966` (stage) and `:1029–1128` (`rejectReason`)

`canEditActivityConfigs` (wired from `isParent`, `ShellyChatPage.tsx:245`) gates `setActivityMinutes`, the
three live-day kinds, the three curriculum kinds, both watch kinds, `draftNextWeek` and both Dad Lab
kinds — at stage time, at `rejectReason`, and again in the write lane. It gates **none** of:
`addSightWord`, `removeSightWord`, `editProfileField`, `addPrioritySkill`, `addSupport`, `addStopRule`,
`markSkillProgress`.

`/chat` is outside `RequireParent` (`router.tsx:105`); the nav entry is `parentOnly` but the URL is open,
which the code's own comments state as a known fact. The system prompt is not profile-aware — a fact
`stagePendingActions` writes down explicitly — so a child on Lincoln's tab gets the full grammar and full
cards.

**Failure scenario.** Lincoln opens `/chat` on the family tablet, picks his own tab, and types *"I'm
really good at fractions"*. The model proposes `markSkillProgress` or `addPrioritySkill`. The card renders
with its "Updates Lincoln's skill snapshot" warning label. He taps Confirm. The authoritative
what-to-teach-next record is written by a ten-year-old, with a parent-directive evidence stamp
(`"parent directive via chat — 2026-09-05"`) that says a parent did it.

The asymmetry is the tell: the *lower*-stakes kinds (an activity's default minutes) are gated at three
layers; the *higher*-stakes ones (the snapshot) at zero. The likely history is that Tiers A/B/C predate
FEAT-133's capability lesson and the later kinds were built after it.

*Report only. The fix is one line per kind but it changes who can write a child's record, which is the
owner's call.*

---

**F4 · The chat's image door is an ungated, unmetered paid generator.**
`src/features/shelly-chat/ShellyChatPage.tsx:712–719` · `useShellyChatFlows.ts:533`

Two absences compounding. **(a) No capability gate:** the image `IconButton` and all six handlers carry no
`isParent` check, on a route that is nav-gated only. **(b) No quota:** `src/features/shelly-chat/` has
zero references to `artQuota` / `useArtQuota` / `recordGeneration`. For a parent, (b) alone is correct —
parent doors are uncapped by design (`{ capped: isChildProfile }`). Together with (a) it means a child
profile reaches an image generator that is neither refused nor counted.

**Failure scenario.** A child navigates to `/chat`, taps the image icon, and generates images in a loop.
Each is a paid `gpt-image-1.5` call. Nothing refuses him, nothing counts it, and his `artQuota` document
for the week still reads whatever the five accounted surfaces put there — so the number FEAT-175 describes
as *"the honest total of what they spent on art that week across every surface"* is not.

*Report only. Note the two halves are separable: the capability gate is the safety fix; whether the door
should also be metered for a parent is a design question FEAT-175 already answered "no" for other parent
doors.*

---

### P2 — the kind does not work, or works confusingly

---

**F5 · A snapshot write that does nothing still stamps "Done ✓".**
`useShellyChatActions.ts:312–350` (`applySnapshotAction` returns `Promise<void>`) ·
`skillSnapshotWrites.ts:334` (`if (!changed) return { changed: false }`)

`writeSnapshotUpdate` returns `{ changed }` and skips the Firestore write when nothing matched.
`applySnapshotAction` **discards that return value**, so `performChatAction` falls through to
`setPending(… status: 'applied')` and the card shows a green tick.

**Verified by execution.** `applyToSnapshot` with `masteredSkills: ['th sound']` against a snapshot whose
only priority skill is labelled `'th digraph'` returns `changed: false`. The match is exact slug equality
— `generateBlockId` lowercases, trims and collapses non-alphanumerics, nothing more — so any paraphrase
misses. Against an **empty snapshot** (a child never evaluated), `markSkillProgress` returns
`changed: false` unconditionally: there is nothing to match.

**Failure scenario.** London has no skill snapshot yet. Shelly says *"he's got all his letter sounds
now"*. The card says "Mark "letter sounds" as mastered for London". She taps. Nothing is written. The card
says Done. She believes the record reflects it and moves on.

The three `add*` kinds share the swallow but not the harm — a deduped add is a no-op because the state is
already what was asked for, so "Done" is arguably true. For `markSkillProgress` it is not.

---

**F6 · A card for the wrong child renders, and its Confirm button is silently inert.**
`useShellyChatActions.ts:753` (stage — no binding check) · `:1255` (`applyChatAction` early return) ·
`ActionConfirmCard.tsx:679` (`?? 'this child'`)

`stagePendingActions` checks only that *some* child tab is selected. It never checks that
`action.childId` equals `activeChildIdRef.current`, nor that it names a family child. Those checks live
only in `rejectReason`, which runs on the **tap** — and `applyChatAction` returns `false` before setting
any status and before the `try/catch` that produces `item.error`. `ShellyChatPage` wires
`onConfirm={applyChatAction}` and the click handler discards the boolean.

Result: the card renders, sits at `status: 'pending'`, and tapping Confirm does **nothing at all** — no
write, no error, no notice, no state change. This confirms hypothesis 6: `childName()`'s `'this child'`
fallback **is** reachable on part-A cards whenever the id names no family child, so the card can read
*"Add sight word "said" for this child"* and then do nothing.

**Failure scenario.** On Lincoln's tab Shelly says *"add 'because' for both boys"*. The model emits two
`addSightWord` blocks, one per child, both with real ids from the ALL CHILDREN context. Lincoln's writes.
London's card renders identically and its button is dead. She taps it twice and gives up. The suppressed-
notice mechanism — built precisely so *"a reply that says 'confirm with a tap' never leaves the parent
waiting on a card that will never appear"* — does not cover this case, because the card **did** appear.

---

**F7 · `setActivityPosition` can also write the learner model, and the card's footnote never mentions it.**
`src/core/firebase/activityConfigWrites.ts:155–201` · `src/core/foundations/workbookPositionSync.ts:84–125`
· footnote at `curriculumActions.ts:301`

`setActivityConfigPosition` fires `syncActivityPositionToModel` → `syncWorkbookPositionToModel`, which
merge-writes `learnerModels.conceptStates`, `openQuestions`, `changeFeed`, `updatedAt` and
`synthesisStaleAt`. **This is a conditional side effect, not a second write on every position set** — it is
skipped, silently and by design, at five gates:

1. a shared (`'both'`) config, or one with no resolvable `name`/`curriculum` (`syncActivityPositionToModel`);
2. `no-bridge` / `ambiguous` — the workbook name matches no curated bridge, or ties two;
3. `pending-curation` — the matched bridge has no curated `lessonToUnit` map (the Fast Phonics case);
4. `no-model` — the child has no `learnerModels` document yet;
5. `no-coverage` — the native position covers no concepts, or none that are not already at that state.

So for many families and many activities, confirming the card updates **only** `activityConfigs`, and the
footnote is complete. The defect is narrower than "the card hides a second write": it is that **when the
write does fire the card gave no hint it could**, and there is nothing on the card to distinguish the two
cases. The write itself is parity with the Curriculum surface (same writer, same trigger) and upgrade-only,
so no data is wrong — which is why this is P2 and not P1. When it fires it surfaces as new "What moved"
entries on the Foundations tab and stales the LLM synthesis.

*Scope corrected after Codex round 1 flagged the original wording as claiming an unconditional write.*

---

**F8 · `addActivity`'s card never shows `type`.**
`curriculumActions.ts:265–281` (`describeAddActivityShape`) · writer at `useShellyChatActions.ts:546–570`

The card shows `subjectBucket · defaultMinutes · frequency` plus position. The write additionally sets
`type` (taken from the action) and derives `scannable` (from whether units/position were given) and
`unitLabel: 'lesson'`. `type` is the field that decides whether the row is a workbook — which decides
DATA-08 ownership, whether the scan pipeline can match a photo to it, and how the planner treats it.

**Failure scenario.** Shelly says *"add Explode the Code 4 for Lincoln, 15 minutes a day — he's on lesson 1
of 60"*. Every number she gave is representable, so the model emits `frequency: "daily"`, `totalUnits: 60`,
`currentPosition: 1` — and the router therefore derives `scannable: true` and `unitLabel: 'lesson'`. The card
reads *"Add "Explode the Code 4" to Lincoln's curriculum"* over *"LanguageArts · 15m · daily · lesson 1 of
60"*: **every visible field is correct**. But the model picked `type: "activity"` rather than `"workbook"`,
and `resolveScannableWorkbook` filters `c.type === 'workbook' && c.scannable !== false`
(`workbookMatching.ts:111`) — so the row is flagged scannable and is still never matched by a workbook photo
scan, and `PlannerChatPage.tsx:376`'s `cfg.type === 'workbook'` filter skips it too. The one field that broke
it is the one field the card does not show.

*Scenario corrected after Codex round 2: the original used "4 days a week", which has no `ActivityFrequency`
member and would surface on the card as a visibly wrong `3x`, and supplied no units — which alone would have
made the row non-scannable, so the hidden `type` was not what caused the failure being described.*

---

**F9 · `removeSightWord` permanently deletes a progress record with no warning.**
`useSightWordProgress.ts:57–69` (`deleteDoc`) · card at `ActionConfirmCard.tsx:159`

The card reads *"Remove sight word "the" for Lincoln"* with no footnote. The write is a hard `deleteDoc`
of the whole `sightWordProgress` document: every encounter count, the mastery level, `firstSeen`, and any
parent confirmation. There is no undo anywhere in the app and no other surface can recreate the history.

Compare `markActivityComplete`, whose footnote states *"There is no undo for this, here or in Progress →
Curriculum"* — for a write that is strictly less destructive (it sets three fields and keeps the row).
The irreversible one is the one with no warning.

---

**F10 · `editProfileField`'s only guard against a truncating replace is a caption-sized diff.**
`ActionConfirmCard.tsx:551–570` · grammar at `shellyChat.ts:957`

The write is a wholesale field replacement. Nothing in the parser, the stage gate, the resolver or the
writer compares the new value to the old one; the sole protection is the `ProfileEditPreview`
before → after lines, rendered at `variant="caption"`.

The mitigation is genuine — the CHILD PROFILE slice *does* carry the current value
(`contextSlices.ts:351`), the grammar *does* say twice to compose the full replacement, and the before/after
diff *does* render. So the run prompt's sharp case ("does the model emit just `"Lego"`?") is not a
structural hole. What is missing is any backstop: if the model does drop "Minecraft, Art", the only thing
between that and the write is two lines of caption text on a phone at 9pm, and the Confirm button says
"Confirm" exactly as it does for a one-word sight word. A shrinking replace could warrant the treatment
`confirmVerb` already gives the empty case.

---

**F11 · The portal's entire child binding is keyed on a literal child name.**
`ShellyChatPage.tsx:147–149`, `:332–333` · `shellyChat.ts` type `ChatContext`

```ts
const contextChildId = chatContext === 'general'
  ? ''
  : children.find((c) => c.name.toLowerCase() === chatContext)?.id ?? ''
```

`ChatContext` is the literal union `'lincoln' | 'london' | 'general'`; the tabs are hardcoded
`<Tab value="lincoln" …>`. `contextChildId` is what **all eleven** part-A kinds bind to and what
`rejectReason` validates against, so a renamed child or a third child gets no tab, `contextChildId` falls
to `''`, and every write in the portal is dropped as "the General tab cannot write".

Filed for completeness rather than as new: the 2026-09 name-gate audit already classified "chat context"
among B6–B12, the **name-keyed data shapes and choice sets** the owner left standing after FEAT-183 closed
the behavioural gates. This row records that the item is not merely cosmetic — it is the acting-child
binding for every confirmed write in Ask AI — so it should be ranked with that in view.

---

**F12 · Two grammars route "reshaping next week" to a handoff that disowns the role.**
`shellyChat.ts:1033` (activity minutes) and `:1096` (curriculum) vs `:1358` (plan adjustment)

Detailed in §4. Both part-A grammars end by pointing at the plan-adjustment handoff for a next-week
reshape; the handoff's own PRECEDENCE rule says `draftNextWeek` is the default and it is not. The handoff
rule is later and more specific so the net instruction is probably right, but three grammars disagreeing
in one prompt is the FEAT-198 shape. (A **fourth** points the same way — the day-item grammar,
`shellyChat.ts:1195`, *"For anything about NEXT week, use the plan-adjustment handoff below instead"* —
but that one is Part B's.)

---

**F13 · A chat-generated image reaches nothing but the chat thread.**
`useShellyChatFlows.ts:580–590`

The image is written as one assistant message field (`imageUrl`). No `artifacts` document, no
`stickerLibrary` entry, and **no `childId`** — the only child association is the thread's `chatContext`,
i.e. F11's name key. So a picture Shelly generates while planning cannot become evidence, carries no tags
(`engineStage` / `subjectBucket` / `domain`), will never appear in a portfolio or a monthly review book,
and cannot be recovered by child the way B14's artifact backfill recovers untagged artifacts. Whether it
*should* land in artifacts is a design question — but today the answer is that it lands nowhere
addressable, and that was probably not decided.

---

### P3 — wording, polish

---

**F14 · The sight-word card shows an untrimmed word the write will trim.**
`parseChatActions.ts:196` returns `word: obj.word` (validated on `.trim()`, returned raw);
`describeSightWord` renders `action.word.toLowerCase()` without trimming; `addSightWord` writes
`word.trim().toLowerCase()`. A payload of `" said "` renders as `"  said "` on the card. Cosmetic; the
stored value is correct.

**F15 · `editProfileField` writes the untrimmed value while the card shows the trimmed one.**
`ProfileEditPreview` computes `const after = action.value.trim()`; `performChatAction` writes
`action.value`. A value of `"Minecraft, Lego  "` displays clean and stores with trailing space. In the
whitespace-only case the card reads "After: (empty)" and the button says "Clear this field" while the
stored value is `"  "` — which reads as empty everywhere downstream (`child.motivators?.trim()`), so the
outcome matches; the record does not.

**F16 · The `<id from ACTIVITIES>` placeholder parses, and a family with no activities gets the wrong
refusal.** `formatChatActivities` returns `""` when there are no active configs, so the ACTIVITIES section
is absent and the model has no ids — but the three grammars still show `"activityConfigId":"<id from
ACTIVITIES>"`, which is a non-empty string and passes `nonEmptyString`. It reaches the resolver, fails to
match, and the parent reads *"That didn't match one of your activities…Try naming it as it appears in
Progress → Curriculum"* when the true reason is that she has no activities yet.

**F17 · The chat's image door sends `style: 'general'`, so all visual direction rides on the composed
prompt — and two of its paths compose none.** `useShellyChatFlows.ts:575`. **FEAT-193** identified `general`
as the prefix that contributes nothing and moved the Game Workshop onto a real `game-art` recipe. The chat
still sends `general`, but that does **not** mean its pictures lack a medium: the refinement path
(`handleImageIdeaSubmit` → `handleImageRefinementGenerate`) asks the parent preference questions — its own
seed example is literally `"What style?"` with `["Realistic photo", "Cartoon/illustrated", "Minecraft-style",
"Watercolor"]` — then folds the answers into a detailed prompt via `[BUILD_IMAGE_PROMPT]`, and a reference
image is described back including *"style, colors, composition"*. Those generations are well directed. The
gap is the paths that compose nothing: `handleJustGenerate` sends the raw idea unless a reference image is
attached, and `handleGenerateImageDirect` reached from a bare prompt sends it verbatim. There the server adds
no recipe and the parent supplied none, so the model is free-running. **The fix is not to swap `general` for
a fixed recipe** — that would fight a look the parent explicitly chose in the refinement flow. It is either a
default that applies only when the composed prompt carries no visual direction, or an accepted non-issue.
*Scope corrected after Codex round 1 flagged the original wording as overstating the affected case.*

**F18 · FEAT-195's alternatives are prose in the chat, not taps.** Detailed at Q-I3. The classifier and
copy are correctly shared; the affordance is not. Worth recording because FEAT-195's own notes count
`useShellyChatFlows` among its doors, which is true of the words and not of the card.

---

## 6 · Handed to 192b

Tripped over while tracing part A; each belongs to a part-B kind or a part-B concern. **Filed, not
followed.**

1. **F6 (mismatched-child card) applies to all twenty kinds**, not just the eleven. The stage-time gap is
   in `stagePendingActions`, which is shared. Part B should not re-file it, but should check whether any
   part-B kind reaches a card *and* a write on a mismatched id.
2. **F11 (`ChatContext` name binding) is likewise all twenty kinds.**
3. **F12's other half** — whether `draftNextWeek` and `proposePlanAdjustment` really are mutually
   exclusive in practice, and whether the same-turn dedupe (`draftWillBeOffered`) covers the case where
   the draft is offered but its generation then fails.
4. **`applyDayItemAction` marks a card "Done" on `outcome.status === 'duplicated'`** — the lane's
   deliberate half-failure where a row lands on the target day and the source removal fails, leaving it on
   both. The code argues this is honest; a parent reading "Done" over a duplicated row may disagree.
   `useShellyChatActions.ts:459`.
5. **`stagePlanAdjustment` overwrites an un-consumed prior brief**, per its own docblock. Two handoffs
   before one planner visit means the first is lost silently.
6. **The `'applying'` / re-entry guard is keyed on the action *object* identity**
   (`appliedOrInFlightRef: Set<ChatAction>`). Correct for the current UI, but it means two structurally
   identical actions in one turn are two distinct guard entries — handled ad hoc for `vetInVideo`
   (`acceptedYouTubeIds`) and not in general. Part B owns `vetInVideo` / `createConceptArc` / `planLab`,
   the three non-idempotent kinds.
7. **`SkillSnapshotPage` persists whole snapshots directly rather than through `writeSnapshotUpdate`** —
   a second write lane to `skillSnapshots`. Already tracked as **ARCH-12**; noted here because F2's fix
   would have to hold on both lanes.

---

## 7 · What this audit did NOT check

Stated plainly, because an audit that overstates its coverage is worse than a small one.

- **No live model calls, and no running app.** Every Q1 answer ("is this reachable?") is read off the
  prompt text and the parser, not observed. Whether the model *actually* emits a well-formed
  `markSkillProgress` for *"he finally got his 'th' sound"* — as opposed to prose, or the wrong kind — is
  unmeasured. The Shelly walk in this document traces what **would** happen to each sentence's action, not
  that the sentence produces one.
- **The per-family half of the system prompt was not measured.** §4's 41,635 characters is the static
  floor only; the context slices need Firestore. The handler already logs the real numbers, so this is
  recoverable from one production log rather than from more analysis.
- **Firestore merge semantics were not verified against an emulator.** F1 rests on reading
  `setDoc(payload, { merge: true })` against a payload that carries every field of the type. The type has
  nine fields and the seed sets nine; the conclusion follows from documented `merge` behaviour, not from
  an observed write.
- **The test suites were not read** (per the run's instruction), except where a behaviour was unclear from
  the source. Two claims were instead verified by **executing the pure reducer** in a throwaway probe (F2,
  F5); the probe was deleted and no test file was added or changed.
- **`firestore.rules` was not examined** beyond noting that the family-scoped owner rule means every
  capability gate discussed here is UX, not security — the family shares one account, so a child profile
  and a parent profile carry the same Firestore identity. F3 and F4 are therefore *product* gates, and
  fixing them in the client is the whole of the available fix.
- **The nine Part-B kinds, thread management, context-scope switching, and the follow-up / friction paths
  were not audited.** Where part-A tracing crossed them, §6 records what was seen and nothing was followed.
- **No behaviour, test, document or ledger row outside this audit's own was changed.**
