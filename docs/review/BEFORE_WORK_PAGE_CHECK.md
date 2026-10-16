# Before-work page check — implementation note

**Scope.** A parent holds up a page the child has **not done yet** and asks whether it suits him
today. One prospective door, reachable from Today with no planned workbook and no AI-written skip
guidance, plus the existing planned-row door converted to the same contract. Advice only: **no
learning or progress record changes.**

Owner approval 2026-10-16, with the condition that no learning or progress record changes. This note
records the decisions and the two things an independent review found wrong in the first candidate,
because both were wrong in *kind* and the fixes are the interesting part.

---

## 1. The contract

A prospective check:

- **changes no learning or progress record.** No `activityConfigs` create/advance, no `childSkillMaps`,
  no `skillSnapshots` or working levels, no `learnerModels`, no `hours`, no `xpLedger`/rewards, no
  `days` row — not even a `scanned` flag, and no checklist **identity preparation** (the old door
  prepared identities so it could write a row; with the row write gone, so is the preparation).
- **persists no record and no image of its own.** No `scans` document, no Storage object. §2.
- **does leave the operational rows every AI call leaves** — the AI usage row the handler writes
  after the model answers, and an error-log row on failure. The copy says so; see §5. **Rate limiting
  is not one of them:** `authGuard.checkRateLimit` runs a `count()` over the family's recent
  `aiUsage` documents for the task and throws when the window is full, so it reads that record and
  writes no row of its own.
- **claims nothing about the child from the page**, and never that prior lessons are complete.
- **answers "I can't tell"** when the evidence is incomplete — including when there is no recorded
  evidence about the child to judge fit against.
- **is parent-only**, gated at the entry and again at execution against live state.

Modules: `src/features/today/beforeWorkPageCheck.ts` (contract, copy, answer mapping),
`useBeforeWorkPageCheck.ts` (controller: identity, concurrency, recovery),
`src/core/hooks/useProspectivePageCheck.ts` (the one call),
`BeforeWorkPageCheckCard.tsx` / `BeforeWorkPageCheckDialog.tsx` (entry and sheet),
`functions/src/ai/prospectiveCheck.ts` (the shared intent predicate),
`functions/src/ai/tasks/scan.ts` (the dedicated prospective prompt).

---

## 2. Persistence: no record of its own

**Chosen: persist nothing** — no `scans` document and no Storage upload — rather than adding an
additive `purpose` field to `families/{id}/scans`.

Why: every reader of that collection treats a document in it as evidence.
`functions/src/ai/contextSlices.ts → loadRecentScansContext` reads the ten most recent scans for the
child **including `action: 'pending'`** and then tells the model, verbatim,
`'skip' = child has mastered this content, advance past it`. A prospective "looks easy for today"
would enter planner and quest calibration as a mastery claim. A `purpose` field would also have to be
honoured by `monthlyReviewData.ts`, Today's two reads and the Curriculum tab's history **forever**,
and because those reads are capped (`limit(10)` in the loader), cheap prospective rows could starve
the child's real scanned work out of the window that feeds the AI. Persisting nothing needs no schema,
no rules and no index change, and no reader can be wrong about a document that does not exist.

The cost, stated plainly: **there is no history of before-work checks.** No "what did I ask about last
week", no audit trail of the advice, no way to revisit a closed answer. If that is wanted later it
belongs in its own collection with its own rules, never in `scans`.

Readers inspected (production modules that touch the collection): `functions/src/ai/contextSlices.ts`,
`functions/src/ai/tasks/monthlyReviewData.ts`, `src/features/today/TodayPage.tsx`,
`src/features/progress/CurriculumTab.tsx`, `src/components/ScanAnalysisPanel.tsx`,
`src/core/hooks/useScan.ts` (the retrospective writer), `src/core/firebase/firestore.ts` (the helper).
One correction to the brief: the **Data Review export**
(`src/features/records/dataReviewExportLoader.ts`) does **not** read `scans` — its "scans" are paged
reads of `artifacts`, `days`, `hours`, `xpLedger` and others — so it is not a consumer of this
decision. `useScan`'s legacy write is unchanged and still carries **no** purpose field, so
absent-purpose keeps exactly its old meaning.

---

## 3. The intent is a TASK, and it fails closed (`pageCheck`)

Two independent findings, in order:

**(a) The write nobody could see.** The first candidate claimed "it cannot write, because its import
graph reaches no Firestore". That claim was **false in kind**: the call is a Cloud Function, and
`functions/src/ai/chat.ts` runs `ensureWorkbookActivityConfigsForChild` for **every child on every
task, before the handler is chosen** — a workbook `activityConfigs` create/update, i.e. a learning
record. Executing the real dispatcher showed it running once for a legacy scan **and** once for a
prospective one.

**(b) Release skew.** `deploy.yml` publishes hosting before functions, so a new client meets the
previous dispatcher for a window. Verified against the original base commit: a `scan` request
carrying `checkPurpose` is, to that dispatcher, an ordinary scan — backfill runs, the retrospective
prompt comes back, nobody is told. A payload flag cannot fail closed, because the thing that would
have to honour it does not exist yet.

**The fix is a distinct task name, end to end.**

| Layer | What it does |
| --- | --- |
| client | `TaskType.PageCheck` (`'pageCheck'`) — `useProspectivePageCheck` sends **no** purpose field at all |
| dispatcher | `isPageCheckTask(taskType)` in `functions/src/ai/prospectiveCheck.ts` excludes the task from the backfill, by name |
| registry | `CHAT_TASKS.pageCheck → handlePageCheck` (`functions/src/ai/tasks/pageCheck.ts`) |
| handler | reads no purpose field: arriving there IS the intent, so a missing or forged flag changes nothing. Always the prospective prompt |
| legacy | `handleScan` has **no** prospective branch any more — a `scan` carrying the old string gets ordinary retrospective behaviour, backfill included |
| old service | rejects the unknown task in the dispatcher's own validation — **before** the rate-limit check, the backfill and any handler, so literally nothing is written — and the real client shows the generic send-failure message, without falling back to scan |

There is deliberately **no fallback to `scan`**: a fallback would restore exactly the silent
retrospective behaviour the skew finding exposed. No deployment workflow change is needed.

The dedicated task reuses the scan read context (`buildContextForTask("scan", …)`, unchanged — so
still no `learnerModel`, and nothing claims one) and logs its AI usage under its own task name, which
`aiUsage.taskType` already treats as a free-form grouping string.

## 3b. BLOCKING 1 as first reported (superseded by §3)

The first candidate claimed "it cannot write, because its import graph reaches no Firestore". That
claim was **false in kind**: the call it makes is a Cloud Function, and `functions/src/ai/chat.ts`
runs `ensureWorkbookActivityConfigsForChild` for **every child on every task, before the handler is
chosen**. That backfill creates and updates workbook `activityConfigs` — a learning record. Executing
the real dispatcher showed it running once for a legacy scan and once for a prospective one. A
client-side import walk could never have seen it, and neither could a prompt assertion.

The first repair for it declared the intent in the payload and read that in two places. §3 replaces
that with the task name, which also closes the skew hole; the payload is no longer an intent channel
anywhere.

Other pre-dispatch side effects were inspected and left alone: the child profile and skill-snapshot
reads (reads), `checkRateLimit` (kept deliberately — and it is a **read**: a `count()` over recent
`aiUsage` rows, not a rate-limit record of its own; an earlier draft of this note and of the feature's
comments called it a write), and the context slice loaders (reads only).

The proof is executable: `functions/src/ai/chatProspectiveBypass.test.ts` runs the real callable with
narrow module stubs and asserts scan = 1 backfill call (including a scan carrying a forged intent
flag), `pageCheck` = 0 with the handler still dispatched and the rate limit still applied, and an
unknown task rejected with nothing written at all.

---

## 4. BLOCKING 2 — the native picker, and what "current" means (fixed)

A host test took the first controller apart the way a phone does: tap **Upload**, switch child in the
shell while the native picker is open, then choose a file. The picker is a modal **outside React**; its
`change` event fires on an input whose handler closed over the old render, so the check ran. The same
hole swallowed an A-B-A switch (comparing scopes passes, because the scope matches again), capability
revoked mid-flight, and a callback retained past unmount. Resetting state in an effect cannot fix any
of it — an effect runs after paint, which is after the file arrives.

A second round of host testing then found the same class of hole on a different trigger: open
**Upload**, **close the sheet**, and let the input — still mounted through MUI's exit transition —
deliver its file. One expected AI request became one hidden one, because only a *scope* change
retired the selection, and closing is not a scope change.

The repaired design has three synchronous rules and **two** tokens:

1. **Identity in a ref, advanced during render.** `family | child | date | capability`; any change
   bumps a **monotonic generation** in the same render and abandons whatever is in flight. Monotonic is
   what makes A-B-A safe — neither counter returns to a value a stale selection could match.
2. **A selection is bound to the picker session it was opened under**, and a session is retired by
   the sheet's whole lifecycle: scope change, **close, cancel, retry and each reopen**. The sheet
   captures `selectionToken` at the tap that opens the camera or picker and hands it back with the
   file; `start(file, context, token)` refuses anything that is not the live session, and refuses a
   *retained callback* too (each closure carries the token it was built under). It re-checks mounted
   and capability off refs, never off the closure. The inputs also use the token as their React
   `key`, so a retirement **detaches the element** the open picker is sitting on.
   - `scopeToken` (identity only) is what a host compares its "sheet is open" state against, and
     `selectionToken` (scope + session) is what binds a selection. The split is load-bearing: keying
     the sheet to the selection token would make *Check another page* close the sheet it is retrying
     in, and keying the selection to the scope token is the hole described above.
3. **What is rendered is stamped.** Controller state carries the token it was produced under and is
   only exposed while that token is live, so a stale answer cannot flash for a frame on its way out.
   `TodayPage` applies the same rule to the sheet: its open state is the **scope it was opened
   under**, not a boolean, so the sheet closes in the same render as the switch — and an A-B-A cannot
   re-open it, because the scope counter has moved on.

Duplicate submission is still blocked by a single `activeRequest` latch (synchronous, so two taps in
one tick cannot both pass).

## 4b. RECOVERY — the latch, and a preview that throws (fixed)

`URL.createObjectURL` is not implemented in every browser or test environment. In the first candidate
it was called outside the recovery path, so a throw on the way in **latched the door shut forever** —
run count stayed at zero for every later attempt. Now: the preview is made in its own `try` and is
treated as cosmetic (the answer still arrives, with no thumbnail), and the latch is released in a
`finally` **by its owner only**. A late failure from an abandoned request releases nothing and
publishes nothing, so it cannot disturb the request that now owns the door.

Cancel claims only what it does: *"A request already sent can't be called back and still shows in the
AI usage log."* No provider-side cancellation or deletion is implemented, so none is claimed.

---

## 5. Copy

The first candidate said *"nothing was recorded"* and *"not a record of anything"*, which the code
contradicts: AI usage and error reporting are real (rate limiting itself only reads usage). Every such
sentence is now **"No learning or progress records change."**

The disclosure is three phone-width lines, shown above the two buttons:

1. the photo is sent to the AI to read; the app saves neither the photo nor the answer;
2. the call itself is logged like any other AI call — AI usage, and an error entry if it fails;
3. closing doesn't cancel a request already sent; either way, no learning or progress records change.

Deliberately **not** claimed: that a usage quota is decremented (nothing in this repo meters a family
allowance), that anything is deleted, or — on a failure — that the photo never reached the AI. A
failed request may have failed after the image was received, so the failure copy says "it may or may
not have reached the AI".

The old service rejects an unknown task before rate limiting, backfill or any handler. However, the real shared useAI.chat catches that rejection and returns null; this currently reaches generic send-failure copy. The specialized unsupported-task wording is tested with a throwing mock and is not established as reachable in the production client. Safe rejection and no fallback are independently verified.

Also removed: the first candidate's blanket assertion that every other scan door is "retrospective".
This run inspected the doors it changed; it does not certify the others.

---

## 6. The prospective prompt (rewritten)

The first version appended a "before-work" section to the retrospective scan prompt. That prompt also
instructs the model on **certificates** (`suggestedSnapshotUpdate.masteredSkills`,
`recommendedStartLevel`) and on **cover pages** (*"use this to set up workbook tracking"*) — so it
forbade mastery claims in one paragraph and asked for a `masteredSkills` array in another.

`buildProspectiveCheckPrompt` is now a separate prompt with its own small schema: `pageType`
(kept, so the shared reply reader can still tell an analysis from a refusal), `readable`, `subject`,
`specificTopic`, `estimatedDifficulty`, `recommendation`, `recommendationReason`, `teacherNotes`,
`limits`, and a display-only `curriculumDetected`. No certificate shape, no cover-page setup, no
`skillsTargeted`/`alignsWithSnapshot`, no snapshot suggestion. It states that the photo is evidence
about the **page** and not the student, forbids inferring prior completion, says that nothing it
returns changes a record, redefines `skip` as *looks below where the recorded evidence says they are
working* (explicitly "NOT a mastery claim"), and **requires** `"unclear"` plus an explanation in
`limits` when the supplied context carries no recorded level/skill/history evidence for the child.
`buildScanSystemPrompt` is untouched and takes no purpose. There is no branch inside either builder
and no handler chooses between them: `handleScan` builds one, `handlePageCheck` builds the other, and
the dispatcher decides which handler runs. (The prospective builder lives next to the retrospective
one in `tasks/scan.ts` so the two can be read — and tested — against each other; it is called only
from `tasks/pageCheck.ts`.)

Client-side, `unclear`, `readable: false`, a certificate, an unplaceable page and a reply with no
usable verdict all land on the same inconclusive screen, and the model's own `limits` line is shown
beside the app's unconditional uncertainty line.

**Honest limit:** the sentence-level `withoutAbilityClaims` filter is a **heuristic**, not a guarantee.
It catches the obvious phrasings; it cannot catch an ability claim worded in a way nobody anticipated.
The real defences are structural — a dedicated prompt with no record-changing fields, short hedged
fields, and a caveat under every answer. The code says so where the filter is defined.

The `scan` task's context slices are unchanged (`charter`, `childProfile`, `recentEval`,
`recentHistoryByDomain`, `skillSnapshot`, `activityConfigs`) and the `pageCheck` task reuses that same
read set rather than inventing one. There is **no `learnerModel`** in it and nothing promises one.

---

## 7. What changed on the existing planned door

`TodayChecklist`'s row button (shown on a workbook row whose guidance says *check lesson* — the same
`UX-403` visibility rule as before) used to read "Scan lesson to check if you should skip", open the
camera on the row and hand the file to `handlePreCompletionScan`, which called an untargeted
`syncScanToConfig` (fuzzy cover-text match; could **create or advance** a workbook), wrote
`childSkillMaps` from `alignsWithSnapshot`, stamped `scanned: true` on the day row (preparing row
identities to do it), persisted a `scans` document, and offered *Add to plan* / *Skip* / *Update
position* / *Accept skip* — `handleAcceptSkip` advancing `currentPosition` by +1 and writing
`skipped: true`.

It now reads **"Check this page before he starts"** and opens the prospective sheet. None of those
writes happens on this route.

**What is left behind (named, so it is not mistaken for an oversight):** the retrospective result
panel (`ScanResultsPanel`) and its Today handlers (`handleScanAddToPlan`, `handleScanSkip`,
`handleScanUpdatePosition`, `handleSkipToNext`, `handleAcceptSkip`) still exist and are still wired,
but nothing publishes a `preCompletionTarget` any more, so the panel no longer renders and those
actions are unreachable from Today. They were left because they are legacy retrospective behaviour
with its own tests, and removing them means changing the `TodayChecklist` prop contract that eight
unrelated test files pass. `onPreCompletionScan`, `onPreparePreCompletionScan` and `preparingScanRows`
are retained in that prop type as `@deprecated` and are no longer read.

**Recommended follow-up for root:** delete the unreachable panel, its five handlers and the three
deprecated props in one dedicated run, updating the eight test files that pass them.

---

## 8. Tests (proposed — executed by root, not claimed here)

| File | What it pins |
| --- | --- |
| `functions/src/ai/chatProspectiveBypass.test.ts` | **executes the real callable**: scan = 1 backfill (plain, forged-flag, malformed), `pageCheck` = 0 with the handler dispatched and the rate limit applied, other task = 1, and an **unknown task rejected with nothing written at all** — the release-skew control, including the exact message the client keys its "unavailable" copy off |
| `functions/src/ai/tasks/pageCheck.test.ts` | the **registry** routes `pageCheck → handlePageCheck` and leaves `scan → handleScan`; the handler uses the prospective prompt with a missing, forged, hostile or non-string purpose; reuses the scan read context; logs usage as `pageCheck`; refuses an imageless payload without calling the model; and `handleScan` still gets the retrospective prompt **even when the payload carries the old intent string** |
| `functions/src/ai/tasks/scan.prospective.test.ts` | the dedicated prompt's rules; that it inherits **none** of `suggestedSnapshotUpdate` / `masteredSkills` / certificate / cover-setup / `skillsTargeted` / `contentNote`; "unclear" required with no recorded evidence; legacy prompt unchanged |
| `src/features/today/beforeWorkPageCheckHost.test.ts` | the client↔server **task boundary**: `TaskType.PageCheck`, the client runner's constant and the server's `PAGE_CHECK_TASK` are one string, it is not the scan task, and the dispatcher predicate says yes to exactly that string and to no payload |
| `src/features/today/useBeforeWorkPageCheck.test.tsx` | the gate off live refs: selection after a child switch, A-B-A, capability revoked, retained-past-unmount, date and family changes; **session retirement on close / cancel / retry / reopen, each with a positive control that a fresh selection still works**; the scope token surviving all three so a retry cannot close the sheet; duplicate tap dropped; preview-throw recovery; rejected runner releases the latch (not awaited — that hang was a fixture bug); late failure and late answer dropped; unsupported-task copy; no stale answer for a frame |
| `src/features/today/beforeWorkPageCheckFlow.test.tsx` | **behavioural**, real card + sheet + controller + real file inputs: empty-plan entry answers; a file chosen after a child switch is not sent (and after A-B-A); **a file chosen after the sheet was CLOSED is not sent** (the MUI-exit case, delivered into both the captured and the still-mounted input); retry stays usable and checks the next page; the next fresh selection works; no answer flash across children; duplicate picks ask once; preview-throw recovery; honest failure screen with no forbidden action; the unavailable screen; kid profile sees no door. Fixtures wait for the MUI transition (`findByRole`, `waitFor`) and scope text queries to the dialog |
| `src/features/today/BeforeWorkPageCheckUi.test.tsx` | the user-facing card and sheet: disclosure above the buttons, three lines, operational rows admitted; file handed back with its opening token; input retired on token change; Stop's honest copy; the answer's contents and `limits`; **only** Close + retry, with distinct accessible names (the header icon is "Close the page check") |
| `src/features/today/beforeWorkPageCheck.test.ts` | the answer mapping: far-ahead → stretch, `skip` → *looks easy* never mastery, blank/unknown/certificate/odd-verdict/`unclear`/`readable: false` → inconclusive, failure copy claims only what is true, `limits` carried and filtered, disclosure shape |
| `src/core/hooks/useProspectivePageCheck.test.tsx` | the call asks for the **`pageCheck` task** and sends no intent flag; a service that refuses the task by name is reported as `unsupported` while an ordinary failure is not; analyses returned for far-ahead and blank pages; unreadable / cut-short / refusal / error-envelope mapped; thrown and missing responses are send failures; the log carries the picture's shape, never its name; Firestore and Storage mocked to **throw** |
| `src/features/today/beforeWorkPageCheckWiring.source.test.ts` | the narrow static half only: the entry hangs off the day (no plan conditions), the gate is in both places, the sheet is keyed to the **scope** token while the selection token is threaded to the inputs and back, opening retires the session, closing goes through the controller, the old pair is gone, the client sends its own task with no intent flag, the legacy scan handler has no prospective branch, and the legacy retrospective write is unchanged. Explicitly **not** a no-writes proof |
| `TodayChecklist.rowKind.test.tsx`, `preCompletionScanIdentity.test.ts` (edited) | the row door's new label/handler with the same workbook-only visibility; the identity rule kept, the forbidden-write cases gone with the writes |

Removed from the first candidate: the AST forbidden-identifier scan of `TodayPage`, the import-graph
"cannot write" claim, and the whole-repo `scans` census. The first two asserted the wrong thing; the
third was brittle (it matched any file containing `/scans`) and asserted properties of other modules.

## 9. Release note (for whoever deploys this)

Nothing in `deploy.yml` needs changing, but the ordering matters and is now safe rather than
silent: hosting goes out first, so until functions are deployed the entry exists and every check
fails closed with *"This check isn't available yet …"*, writing nothing at all. After functions
deploy, it works. The reverse order (functions first) is also fine — the new task simply sits unused.

## 10. Unresolved / for root

- The unreachable retrospective panel and its five handlers (§7) want a dedicated removal run.
- No before-work history exists by design (§2). If the owner wants one, it is a new collection and a
  rules change — out of scope here.
- `withoutAbilityClaims` is heuristic (§6) — stated as a limit, not a guarantee: it catches the
  phrasings it was written for and no claim is made that every ability claim is removed.
- **The `unsupported` / "check isn't available yet" copy is not proven reachable through the shipped
  client** (§5). `useAI.chat` catches a callable rejection and returns `null`, so the release-skew
  refusal reports as the generic send failure. Making it reachable means changing `useAI`'s error
  surface, which is deliberately out of scope here; the branch, its classification and its copy are
  kept and tested against a throwing client, and the comments in
  `useProspectivePageCheck.ts` / `beforeWorkPageCheck.ts` say exactly this.
- **The time-and-evidence census moved because of this run.** TodayPage no longer names a time collection directly, so its registry row is removed. Its indirect completed-work writes through existing helpers remain. The organizer ran the committed census generator and refreshed the complete printed block: 915 source files, 60 surfaces/rows and zero classification problems.
- Windows-only typecheck noise (`ActiveChildLine` / `WeekBySubject` case collisions) is pre-existing
  baseline and unrelated to this run.

## Organizer verification note — October 16
Claude owns implementation; this documentation correction reconciles its account with independent source execution. Source comments that describe a separate rate-limit record or guarantee specialized unavailable wording are not controlling evidence. Full acceptance, source revision and executed checks are recorded in the local run handoff; no release or family validation is implied.
