# Watch Vehicle — curated video as a planned learning activity

**Status:** DESIGN · v0.1 · 2026-07-18 (doc only — no build assigned)
**Ledger anchor:** **FEAT-86** (design)
**Reuse base:** the planner activity-item system (`itemType` on `ChecklistItem`/`DraftPlanItem`), the
Dad Lab hours+artifact completion pattern (`src/features/dad-lab/*`), the already-shipped **Lesson
Video** finder (`LessonVideoDialog` + the `lessonVideo` AI task), and the `LAB_TYPE_SUBJECTS`
activity-kind→subject mapping (`src/features/dad-lab/labTypeSubjects.ts`).
**Companion docs:** `TODAY_TEACHING_HELP_DESIGN.md` (FEAT-40 — its §D3 already weighs curated-library
vs. open-AI video trust), `ENGINE_V2.md` (energy modes / weekly rhythm), `GDQ_KIT_BUILDER_DESIGN.md`
& `BARNES_BROS_CATALOG_DESIGN.md` (the design-first pattern this mirrors).

> Docs-only. This design proposes a shape; nothing here is final and no code is changed. The build
> plan (§9) is serialized into later, human-assigned runs. Two items are explicitly flagged for owner
> **confirmation** before any build (§10, C1/C2).

---

## 1. Problem statement — a new *vehicle*, not a new subject

The app runs daily school through a small set of **activity vehicles** — the ways a learning block is
*delivered*: a **workbook** page, a **quest** (Knowledge Mine), a **Dad Lab** session, a **Story
Guide** book, a **read-aloud**. Each plans through the normal machinery, captures time, and (usually)
leaves a portfolio artifact. What they share: the *how* differs, but the plumbing — plan → do →
log-time → capture-evidence → tag-a-subject — is common.

Non-curriculum topics the family cares about — **history**, and other watch-worthy subjects — have no
good vehicle today. You cannot workbook your way through the American Revolution at a 1st-grade reading
level; the right delivery is **a short, well-chosen video you watch together**. The owner's ask
(2026-07-17): support these as **curated video Shelly picks** — a **new activity vehicle**, *not* a new
subject. It plans like an activity, captures time + a portfolio artifact, and carries a **subject tag**
(History → `SocialStudies`, etc.). It slots into the existing planning + capture + hours machinery.

**The confusion this doc resolves.** "Watch a video" already half-exists as the **Lesson Video** helper
(`LessonVideoDialog`): an *ad-hoc* AI web-search that finds one video and hands the parent an
external link. That is a *just-in-time helper on any item*, not a *planned vehicle*, and — critically —
its result URL is **AI-generated, any-domain, unvalidated, opened in a raw new tab** (recon §1a.4).
The Watch Vehicle is the **first-class, curated, child-safe promotion** of that idea: a video Shelly
has **vetted and added to a list** becomes a **plannable checklist item** that plays **inside the app**
in a locked-down embed, logs its planned minutes, and leaves an artifact — never an open browse, never
a raw YouTube tab, never autoplay into "up next".

> **Design principle throughout.** Curated-only is both the pedagogy answer (Shelly chooses what's
> worth watching) *and* the child-safety answer (no open search = no rabbit hole). The app owns the
> **sequence**; YouTube is only ever a muted, chrome-stripped frame around one vetted video.

### 1a. What the recon found (grounding, 2026-07-18)

Four recon sweeps (planner/activity system · Dad Lab hours+artifacts · subject-tag system · embed/CSP)
ground every claim below. The load-bearing findings:

- **There is no "vehicle" abstraction to extend — a "kind" is a cluster of optional fields on a plan
  item.** Two parallel notions of activity-kind exist: the persistent **`ActivityType`** enum
  (`formation|workbook|routine|activity|app|evaluation`, `enums.ts:323-331`) on `ActivityConfig` catalog
  docs, and the per-item **`itemType`** string (`'routine'|'workbook'|'evaluation'|'activity'`,
  `planning.ts:359,542`) on `ChecklistItem`/`DraftPlanItem`, *refined by companion fields*
  (`evaluationMode`, `link`, `bookId`, `workbookConfigId`, `lessonCardId`). So a new vehicle = **a new
  `itemType` value + one payload field**, exactly how `evaluation` carries `link:'/quest'` and a
  read-aloud carries `bookId`. **This is additive; nothing existing changes shape.**
- **The planner is teachable per-kind, and the plumbing is enumerable.** The AI plan prompt hard-codes
  per-kind FORMAT blocks (e.g. the evaluation block, `functions/src/ai/tasks/plan.ts:79-97`); the client
  parse **whitelists** which item fields survive (`chatPlanner.logic.ts:1263-1280` — an unknown field is
  *silently dropped*); lock-in stamps the surviving fields onto the `ChecklistItem` at one place
  (`PlannerChatPage.tsx:1902-1919`). A new vehicle touches exactly these three points plus a Today render.
  **HARD STOP (planner) cleared** — the hook is additive and its seams are known.
- **Hours can be logged without touching any compliance-counting internal.** The compliance boundary is
  crisp (recon, Dad Lab §2): *writing a row* (an `HoursEntry` in `hours`, or a `DayBlock.actualMinutes`
  on a completed checklist item, or an `HoursAdjustment`) is "log hours normally"; the **read-side math**
  — `collectHoursContributions` / `computeHoursSummary` (`records.logic.ts`), `complianceMapping.ts`,
  `stateCompliance.ts` — folds those rows autonomously and must **never** be modified. A completed
  checklist item already credits its minutes to its `subjectBucket` via `DayBlock.actualMinutes`
  aggregated in `weekRibbon.logic.ts`. **So a Watch Vehicle needs *no new hours code at all* to earn
  credit — it rides the existing item-completion path. HARD STOP (hours) cleared.**
- **The subject-tag axis already handles non-curriculum subjects, independent of the concept graph.**
  `SubjectBucket` has 10 values incl. `Science`/`SocialStudies` (History folds into `SocialStudies`,
  `complianceMapping.ts`); `subjectBucket` is **required** on artifacts (`common.ts:18-26`) and stamped on
  hours. It is **orthogonal** to `skillTags`, and the `tagConceptBridge` (reading+math only) has **no**
  Science/SocialStudies concept nodes — so a history video correctly carries `subjectBucket:'SocialStudies'`
  and **no `skillTags`**, and feeds the concept graph not at all. `LAB_TYPE_SUBJECTS`
  (`labTypeSubjects.ts:17-22`, `Record<LabType, SubjectBucket[]>`) is the exact pattern for a per-video
  subject default. Dad Lab already credits `Science` hours this way with no concept-graph involvement.
- **The embed itself is 100% net-new — and that is a feature, not a gap.** No iframe, no `<video>`, no
  YouTube player, **no CSP at all**, and **no URL/video-ID validation** exist anywhere in `src/` or
  `functions/` (recon, embed §1–5). Today's Lesson Video stores a **free-form, unvalidated `url`** and
  opens it in a raw tab. The Watch Vehicle deliberately does **not** reuse that field: it stores a
  **validated 11-char YouTube `videoId`** and builds a locked `youtube-nocookie.com/embed` URL itself
  (§4). Because there is no CSP to conflict with, adding a `frame-src` allowlist is clean net-new
  defense-in-depth. **Reusable:** the `hoursAdjustments` + `assertAttributed` `source:'video-watch'`
  logging idiom (`LessonVideoDialog.tsx:204-231`), the `rel="noopener noreferrer"` safe-link idiom, and
  the `{title,url,source,why,lengthNote}` `HelpCardVideo` shape (`planning.ts:627-635`) as a naming
  reference for how a chosen video is stored.

---

## 2. The three tensions (owner's framing) — resolved

The backlog note named three tensions the design must resolve. Recon lets us close all three.

| # | Tension | Resolution |
|---|---|---|
| **T1** | **Time truth** — real watched-seconds vs. planned duration. | **Resolved by owner decision #1: planned duration.** "Watched a 12-min video" logs 12 min — no play/pause timer. A **planned** watch item is a checklist item, so its minutes ride `DayBlock.actualMinutes` (which the completion path auto-fills from `estimatedMinutes` — `TodayChecklist.tsx:465-483`); planned = actual, by design. **Future upgrade (named, not built):** the IFrame Player API can report real elapsed seconds if planned-duration proves loose (§10 D5). |
| **T2** | **No-autoplay — "next doesn't play unless planned"** (the heart of the idea). | **Resolved by keeping the *sequence* in the app, never in YouTube.** Each vetted video is its **own** checklist item; the app never hands YouTube a playlist and never autoplays the next thing. The embed is `youtube-nocookie.com/embed/{videoId}?autoplay=0&rel=0&modestbranding=1`, driven by the **IFrame Player API** so the app can detect `ENDED` and `stopVideo()` + cover the player with an app overlay at end (a bare iframe cannot — §4/D2); no "up next", no end-screen handoff. **Flagged for owner confirmation (C1)** since this is the literal heart of the ask. |
| **T3** | **Child safety (hold firm).** | **Resolved by curated-only (decision #2) + the nocookie/rel=0 embed + a net-new CSP `frame-src` allowlist.** Only Shelly-vetted videos are ever watchable (no open search/browse), the domain is `youtube-nocookie.com` (no tracking cookie until play), `rel=0`+`modestbranding` strips YouTube chrome and cross-channel suggestions, comments never render (embed has none), and a hosting-level CSP restricts framing to `https://www.youtube-nocookie.com` so nothing else can ever be embedded. |

### Owner decisions already locked (carried in verbatim)

1. **Time = planned duration**, not real watched-seconds. (T1.)
2. **Curated-only.** Shelly vets each video and adds it to a list. No open search/browse. (This is also
   the child-safety answer — T3.)
3. **Design doc first** (this document) before any build.

---

## 3. The data model (proposed, not final)

Two additive shapes: a **curated video** (the list Shelly vets into) and the **plan-item hook** (how a
day references one). Nothing existing changes.

### 3a. The curated video library

```ts
// src/core/types/planning.ts (or a new watch.ts) — additive; no existing type changes

/**
 * One Shelly-vetted, child-safe video, added to the curated library. The ONLY thing watchable.
 * A library entry — parent-curated, not AI-authored. Business/curriculum-agnostic.
 */
export interface WatchVideo {
  id: string
  /** Validated 11-char YouTube id ([A-Za-z0-9_-]{11}) — NEVER a free-form url (§4). */
  youtubeId: string
  /** Kid-facing title, parent-authored (not the raw YouTube title). */
  title: string
  /** Planned watch length in minutes — the time that logs on completion (decision #1). */
  plannedMinutes: number
  /** Coarse compliance subject — History → 'SocialStudies', nature → 'Science', etc. */
  subjectBucket: SubjectBucket
  /** Who this is for; 'both' allowed like other family-shared configs. */
  childId: string | 'both'
  /** Optional one-line "why we're watching" (parent framing, surfaced on the item). */
  why?: string
  /** Provenance: who vetted it in, and when. Curated-only audit trail. */
  addedBy: string          // parent identifier
  vettedAt: string         // ISO
  /** Optional: the candidate this was promoted from, if the lessonVideo finder suggested it. */
  suggestedFromUrl?: string
  createdAt: string        // ISO
  updatedAt: string        // ISO
}
```

**Collection (proposed, §10 D1):** a new additive `families/{familyId}/watchLibrary/{autoId}` collection
(auto-ID — a family curates many videos), mirroring the `businessLog`/`kitRosters` converter pattern in
`firestore.ts` (`stripUndefined` on write, `id` after the spread on read). Filtered `where('childId','in',
[childId,'both'])` like `useActivityConfigs`. Alt considered and set aside: overloading `ActivityConfig`
with a new `ActivityType:'watch'` — rejected for v1 because `ActivityConfig` carries heavy
workbook/curriculum fields a video never uses; a dedicated lightweight library is the honest shape (and
"a list Shelly adds to" *is* a library, not a routine config).

### 3b. The plan-item hook

Mirrors `bookId` exactly (a read-aloud item points at a `Book`; a watch item points at a `WatchVideo`):

```ts
// additive to ChecklistItem (planning.ts:297-388) and DraftPlanItem (planning.ts:511-562)
itemType?: 'routine' | 'workbook' | 'evaluation' | 'activity' | 'watch'   // + 'watch'
watchVideoId?: string   // → a WatchVideo in the family's watchLibrary (present iff itemType==='watch')
```

**Why a reference id, not the video inline:** the same discipline as `bookId`/`workbookConfigId` — the
day plan references the durable catalog entry by id; the player resolves the `WatchVideo` at render. This
keeps the plan item thin, lets a video be re-planned across days, and means the curated `youtubeId`
lives in exactly one vetted place (never re-typed into a plan).

**Notes on the shape**

- **Additive.** New type, new collection, one new `itemType` union value + one optional field. No
  invariant (`hours` math, `xpLedger`, `skillSnapshots`, charter, `firestore.rules`) is touched.
- **Validated id, never a URL.** `youtubeId` is validated on vet-in (§4); the free-form `url` field the
  Lesson Video finder uses is **deliberately not reused** (it is any-domain and unvalidated).
- **`plannedMinutes` is the time truth** (decision #1). It flows to the checklist item's
  `estimatedMinutes` at plan time and to `DayBlock.actualMinutes` on completion.
- **`subjectBucket` required; `skillTags` absent by design.** A watch item is non-curriculum — it earns
  subject-tagged hours and an artifact, and touches the reading/math concept graph not at all (§6/§7).

---

## 4. The player surface — child-safe embed, app-owned sequence (net-new)

This is the one genuinely new build surface. Everything about it is safety-first.

- **Embed, don't link.** A `<iframe>` (the first in the codebase) pointed at
  `https://www.youtube-nocookie.com/embed/{youtubeId}?autoplay=0&rel=0&modestbranding=1&fs=1&playsinline=1`.
  - `youtube-nocookie.com` — no tracking cookie set until the kid presses play.
  - `autoplay=0` — nothing plays until the kid presses play (T2).
  - `rel=0&modestbranding=1` — strips YouTube branding and limits any related-video suggestions to the
    same channel (never a cross-channel rabbit hole). **Caveat (see the end-stop below):** `rel=0` does
    **not** remove YouTube's end screen — at video end a bare iframe still shows same-channel suggestions.
    Suppressing that handoff is what the app-owned end-stop is for, and it is why v1 uses the Player API,
    not a bare iframe (D2).
  - No comments render in an embed; no search box; no channel browse.
- **The app owns the sequence — and enforces the end-stop via the IFrame Player API (T2/C1).** Each
  planned video is its own checklist item; the app never passes YouTube a playlist and never auto-loads a
  next video. The **safety-critical** part — *the frame stops at end, no end-screen handoff* — is **not**
  something a plain cross-origin `<iframe>` can do: it cannot observe the player's state or call
  `stopVideo`. So v1 embeds via the **YouTube IFrame Player API** (`onStateChange` → `ENDED` →
  `stopVideo()`), and at `ENDED` the app drops an **opaque overlay** over the player (a "▸ Watch again /
  ✓ Mark done" card) so YouTube's end screen and its suggestions never become tappable. "What's next" is a
  *planned checklist item the parent/kid advances*, not a YouTube suggestion. This is the literal, and
  actually-enforceable, implementation of "next doesn't play unless planned." (D2 records why the plain
  iframe is insufficient for this guarantee.)
- **Validation at vet-in.** A parent adds a video by pasting a YouTube URL *or* id; a small pure
  `extractYouTubeId(input) → id | null` (net-new; validates `[A-Za-z0-9_-]{11}`, handles
  `watch?v=`/`youtu.be/`/`/embed/` forms) gates the write. **A URL that doesn't yield a valid id is
  rejected** — the library never stores an unvalidated string. (This is the validation the existing
  Lesson Video `url` field never had.)
- **Defense-in-depth CSP (net-new).** Because there is *no* CSP today, add a `frame-src`
  allowlist restricting framing to `https://www.youtube-nocookie.com` (hosting header in `firebase.json`
  and/or an `index.html` meta) so the app can *never* embed anything else, even if a bug tried to. This
  touches hosting config only — **not** `firestore.rules` (an invariant) — and is a propose-and-confirm
  change flagged in the build plan (§9 slice 2).
- **Reused safety idioms:** `rel="noopener noreferrer"` on any fallback "open on YouTube" affordance;
  the `hoursAdjustments` `source:'video-watch'` idiom is available for the *ad-hoc* (non-planned) case
  (§5).

> **A note on the Lesson Video finder.** The existing `lessonVideo` AI task (web-search → one video) is
> **not** deleted or bypassed — it becomes a **candidate suggester** feeding the curated flow: the AI
> can *propose* a video, but nothing is watchable until a parent **vets it into `watchLibrary`** (which
> extracts + validates the `youtubeId`, discarding the any-domain url). This bridges the shipped finder
> to the curated-only safety model instead of forking a second video path.

---

## 5. Capture — hours + a portfolio artifact (reuse, don't reinvent)

A watch item completes like any other planned checklist item, and optionally leaves an artifact.

- **Hours (no new code path).** A planned watch item is a `ChecklistItem`; marking it done auto-fills its
  `DayBlock.actualMinutes` from `estimatedMinutes` (`= plannedMinutes`, decision #1), which the existing
  `weekRibbon.logic.ts` aggregation credits to the item's `subjectBucket`. **This is the same path a
  workbook or routine item already uses — no `hours`-collection write, no compliance-math touch.** (The
  Dad Lab `syncComplianceHours` row-write and the Lesson Video `hoursAdjustments` write are *alternatives*
  for the **non-planned** ad-hoc case; a *planned* watch item rides `DayBlock.actualMinutes` — cleaner,
  and self-evidently compliance-safe because it is literally the item-completion path. §10 D3.)
- **Portfolio artifact (optional, propose→confirm).** Echoing the Dad Lab three-beat and the owner's
  "watched {title}, optional 'what we saw' note": on completion, offer an **optional** note/audio artifact
  via the shared 3-step artifact path (`addDoc(artifactsCollection) → uploadArtifactFile → updateDoc({uri})`;
  for a video with no photo, store `content`/`notes` and **skip the upload step**). Tags:
  `{ engineStage, domain:'watch-vehicle', subjectBucket, location:'Home' }` (all required tags present),
  `content: "Watched {title}"` + the optional "what we saw" reflection. **Dictation counts (ETHOS-04)** —
  the note can be spoken. This is the same additive, **propose → confirm → write** parent action any
  capture uses; **never an auto-write** to a child's record.
- **XP/diamonds (optional, §10 D6).** If a watch session should reward like a Dad Lab, reuse
  `addXpEvent`/`addDiamondEvent` with a dedup key (`watch-${dayId}-${videoId}`). Lean **no XP in v1**
  (watching is lower-effort than a lab); revisit.

---

## 6. Where the subject tag fits — history/science without a concept node

- The vehicle serves **any** subject via `WatchVideo.subjectBucket` — History → `SocialStudies`,
  nature → `Science`, an art documentary → `Art`, etc. A small `WATCH_SUBJECT_DEFAULT` is unnecessary
  (unlike `LAB_TYPE_SUBJECTS`, a video's subject is set explicitly at vet-in), but the *pattern* is the
  same axis Dad Lab uses.
- **No concept-graph coupling.** `subjectBucket` and `skillTags` are orthogonal; the reading/math concept
  graph (`tagConceptBridge`) has no Science/SocialStudies nodes. A history video therefore carries a
  subject bucket, **no `skillTags`**, and never enters the re-test/frontier machinery. This is correct and
  consistent — it's exactly how Dad Lab credits `Science` today.
- **Compliance credit is automatic and untouched.** The subject-tagged minutes flow through the same
  `DayBlock` → `weekRibbon` → `computeHoursSummary` read path as everything else. MO's core subjects
  include Social Studies and Science, so history/science watch-time counts as real school with zero new
  compliance code.

---

## 7. Learning-loop linkage — honest scope (confirm)

- **A watch item IS real school** — subject-tagged hours + an optional portfolio artifact, exactly as
  §5/§6 describe. That much is first-class.
- **It should NOT auto-write the learner model.** The learner-model writers are **calibrated evidence
  paths** (guided eval / quest / workbook position — FEAT-54/63/76), source-confidence-gated. **Watching a
  video is not a calibrated assessment** — auto-moving a concept state off "we watched a history video"
  would violate that discipline (and there are no Social-Studies concept nodes to move anyway). The loop's
  credit here is the **artifact → Weekly-Review evidence** path (like Story Guide books and Kit Builder
  rosters — the exact precedent in `GDQ_KIT_BUILDER_DESIGN.md` §5a), **not** a concept-state write.
- **Flagged for owner confirmation (C2)** — the backlog note explicitly asked to confirm the learner-model
  linkage is "an artifact, NOT an auto concept-state write." This design confirms that reading and asks the
  owner to ratify it.

---

## 8. What this must NEVER do

- **Never allow open search or browse.** Curated-only (decision #2). The kid only ever sees videos Shelly
  vetted into `watchLibrary`. No search box, no channel browse, no "find more like this" for the kid.
- **Never hand YouTube the sequence.** No playlists, no `autoplay=1`, no autoplay-next. The **app** owns
  what plays next; a planned video ends and the frame stops (T2). "Up next" is a planned checklist item,
  never a YouTube suggestion.
- **Never store an unvalidated URL.** The library stores a **validated `youtubeId`** only; a paste that
  doesn't yield a valid id is rejected. The any-domain `lessonVideo` `url` field is not reused.
- **Never embed anything but `youtube-nocookie.com`.** The CSP `frame-src` allowlist enforces this at the
  hosting layer.
- **Never touch compliance-counting internals.** Logging happens by *writing a row / completing an item*;
  `collectHoursContributions`, `computeHoursSummary`, `complianceMapping.ts`, `stateCompliance.ts` are
  read-side and stay byte-for-byte unchanged. (HARD STOP.)
- **Never auto-write a child's record.** The optional artifact + any reflection are propose → confirm →
  write. No silent writes; no auto learner-model concept-state write (§7).
- **Never gate on a child's name.** `isLincoln`/`ageGroup` are cosmetic only. The vehicle opens for any
  child a video is curated for (Lincoln-first wiring; London's minimal variant per the London-minimal
  policy — logged in `LONDON_BACKLOG.md` if tuned separately, not built speculatively).
- **Never break the existing Lesson Video helper.** It stays as-is (and optionally becomes a candidate
  suggester, §4); this vehicle is a new sibling, not a rewrite of it.

---

## 9. Build plan (later, human-assigned runs)

Serialized slices — each a reviewable PR, smallest-testable-thing first. **Gated on owner confirmation of
C1 + C2 (§10) before slice 1.**

1. **`WatchVideo` type + `watchLibrary` collection + a parent vet-in form + `extractYouTubeId`.** Land the
   data model and the curation surface *before* the player: the `WatchVideo` type, the
   `watchLibraryCollection` helper + converter (mirroring `businessLog`), `useWatchLibrary(childId)`, the
   pure `extractYouTubeId` validator (+ tests), and a plain parent form to vet a video in (paste
   URL/id → title → plannedMinutes → subject → save). Smallest thing that stores a curated video, testable
   standalone. No plan hook, no player yet.
2. **The child-safe player surface + CSP.** The `youtube-nocookie` embed component (autoplay=0/rel=0)
   driven by the **IFrame Player API** — the app-owned "video ends → `stopVideo()` + end-overlay" end-stop
   (D2: the Player API is **required** here; a bare iframe cannot enforce it) — and the net-new `frame-src`
   CSP allowlist
   (`firebase.json` hosting header + `index.html` meta — **propose-and-confirm**, hosting config only, not
   `firestore.rules`). Rendered from the library (watch a curated video outside a plan first, to de-risk the
   embed).
3. **Planner hook — `itemType:'watch'` end to end.** Add `'watch'` + `watchVideoId` to the `ChecklistItem`
   / `DraftPlanItem` unions; a per-kind FORMAT block in `plan.ts` (modeled on the evaluation block) so
   Shelly can schedule "Watch: {title} — {subject}"; extend the `parseAIResponse` field whitelist
   (`chatPlanner.logic.ts`) so `itemType:'watch'`/`watchVideoId` survive; add the lock-in passthrough
   (`PlannerChatPage.tsx`); render the watch row + open-player action on Today (`TodayChecklist` +
   `KidChecklist`). Completion rides `DayBlock.actualMinutes` (planned=actual) — no hours-math touch.
4. **Optional capture artifact.** The propose→confirm "what we saw" note/audio artifact on completion
   (§5), LA/subject-tagged, dictation-counts, `domain:'watch-vehicle'`. Reuses the ARTIFACTS 3-step path.
5. **(Optional) Lesson Video finder → vet-in bridge.** Let the shipped `lessonVideo` AI candidate feed the
   §1 vet-in form (extract+validate the id, discard the url), so an AI suggestion can be curated in one tap
   — never watchable until vetted.

Slice 1 de-risks the data model; slice 2 is the embed/safety-heavy one; slice 3 is the planner
integration; 4 and 5 are independent add-ons.

---

## 10. Open decisions & confirmations

| # | Decision | Options / lean |
|---|---|---|
| **C1** | **Confirm the no-autoplay behavior (T2 — the heart of the ask).** | The planned **sequence lives in the app**; a planned video ends and the frame stops — the app never autoplays the next video and never hands YouTube a playlist. **Confirm this is the intended "next doesn't play unless planned."** (Owner asked to confirm.) |
| **C2** | **Confirm the learner-model linkage (§7).** | A watch session logs an **artifact** (Weekly-Review evidence path), **not** an auto concept-state write — watching is not a calibrated assessment (and there are no Social-Studies concept nodes). **Confirm** (matches the Kit Builder §5a precedent). |
| **D1** | **Library collection location.** | New `families/{familyId}/watchLibrary/{autoId}` auto-ID collection — **leaning this** (mirrors `businessLog`/`kitRosters`; a video is a small distinct shape). Alt: a new `ActivityType:'watch'` `ActivityConfig` (rejected for v1 — heavy workbook fields a video never uses). |
| **D2** | **Plain iframe vs. YouTube IFrame Player API** *(resolved — Player API required for v1).* | A plain cross-origin `<iframe>` gets `autoplay=0`/`rel=0`/nocookie, but it **cannot observe `ENDED` or call `stopVideo`** — so it **cannot deliver the C1 end-stop** (at video end a bare iframe shows YouTube's end screen + same-channel suggestions, tappable). Because the end-stop is **safety-critical** (the heart of the ask), v1 **must** use the **IFrame Player API** (`onStateChange`→`ENDED`→`stopVideo()` + an app overlay covering the player), not a bare iframe. (This also gives real-elapsed timing for free if D5 is ever wanted.) The bare-iframe option is retained only as a documented non-option — kept to record *why* it's insufficient. *(Codex review, 2026-07-18 — corrected the earlier "lean plain iframe" which would have shipped the no-autoplay guarantee incomplete.)* |
| **D3** | **Hours path for a planned watch item.** | `DayBlock.actualMinutes` via normal checklist completion (planned=actual) — **leaning this** (no new code, self-evidently compliance-safe). Alt: an explicit `hours` row (`source:'watch-vehicle'`) like Dad Lab, or `hoursAdjustments` (`source:'video-watch'`) like the ad-hoc Lesson Video — kept for the **non-planned** case only. |
| **D4** | **Who authors the kid-facing title & why.** | Parent authors both at vet-in (curated voice) vs. default to the YouTube title (less typing, less control). **Lean parent-authored title, optional `why`** — curated-only means Shelly's words, not YouTube's. |
| **D5** | **Real watched-time as a future upgrade.** | Keep planned-duration (decision #1) vs. add IFrame-Player real-elapsed seconds. **Lean planned-duration**; revisit only if it "feels loose" (owner's words). Named, not built. |
| **D6** | **XP/diamonds on a watch completion.** | None in v1 (watching is lower-effort than a lab) vs. a small dedup'd reward like Dad Lab. **Lean none in v1.** |
| **D7** | **Curated-video scope: per-child vs. family-shared.** | `childId | 'both'` filter like `useActivityConfigs` (a video can be for one kid or shared) — **leaning this**. |

---

## Appendix — recon citations (2026-07-18)

- **Activity-kind / planner:** `src/core/types/enums.ts:323-331` (`ActivityType`); `src/core/types/planning.ts`
  (`ChecklistItem` 297-388, `DraftPlanItem` 511-562, `DayLog` 233-272, `DayBlock` 274-295, `itemType` union
  359/542, `HelpCardVideo` 627-635); `functions/src/ai/tasks/plan.ts:79-97` (evaluation FORMAT block —
  the per-kind prompt template); `src/features/planner-chat/chatPlanner.logic.ts:1263-1280` (parse field
  whitelist); `src/features/planner-chat/PlannerChatPage.tsx:1902-1919` (lock-in → `ChecklistItem` map);
  `src/core/hooks/useActivityConfigs.ts` (catalog subscribe pattern to mirror for `useWatchLibrary`).
- **Hours + artifacts + compliance boundary:** `src/features/dad-lab/useDadLabReports.ts:47-84`
  (`syncComplianceHours` — the row-write template) & `:86-168` (completion side-effects); `src/features/
  records/records.logic.ts:80-85` (`assertAttributed`), `:219-330` (`collectHoursContributions` /
  `computeHoursSummary` — **read-side math, do not touch**); `src/core/utils/complianceMapping.ts`,
  `src/core/compliance/stateCompliance.ts` (**do not touch**); `src/features/today/TodayChecklist.tsx:459-491`
  (checklist completion → `DayBlock.actualMinutes`); `src/features/today/useUnifiedCapture.ts:328-360`
  (ARTIFACTS 3-step path — the artifact template); `src/core/firebase/firestore.ts` (`hoursCollection`,
  `artifactsCollection`, converter pattern); `src/core/types/common.ts:18-57` (`Artifact`/`ArtifactTags` —
  `subjectBucket` required, no `skillTags`).
- **Subject tags:** `src/core/types/enums.ts:1-27` (`SubjectBucket` 10 values + labels);
  `src/features/dad-lab/labTypeSubjects.ts:17-32` (`LAB_TYPE_SUBJECTS` — activity-kind→subject pattern);
  `src/core/types/skillTags.ts` (skill catalog — reading/writing/math/regulation only);
  `src/core/foundations/tagConceptBridge.ts` (skillTag→concept, **reading+math only**, no
  Science/SocialStudies nodes); `src/core/utils/complianceMapping.ts` (History→`SocialStudies` inference).
- **Embed / video / CSP (all net-new):** `functions/src/ai/tasks/lessonVideo.ts` (AI finder — free-form,
  any-domain, unvalidated `url`); `src/features/today/LessonVideoDialog.tsx:204-277` (external link + the
  `hoursAdjustments` `source:'video-watch'` idiom); `firebase.json` hosting `headers` (`:36-47` — **no CSP**),
  `index.html` (no CSP meta), `vite.config.ts` (no headers) — a `frame-src` allowlist is net-new, nothing to
  conflict with; **no `<iframe>` / `<video>` / player / URL-validation anywhere in `src/` or `functions/`**;
  `docs/TODAY_TEACHING_HELP_DESIGN.md` §D3 (prior art weighing curated-library vs. open-AI video trust).
