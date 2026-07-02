# Today Teaching Help — Design (consolidation-first)

> **Status:** DESIGN (doc only, no build assigned). Ledger: **FEAT-40**.
> **Owner decision baked in (2026-07-02):** this is a *consolidation/upgrade* design, not greenfield.
> Video is already shipped (FEAT-14→23) and a modal "Help Me Teach This" already exists — this doc
> proposes unifying and upgrading those into an **inline, auto-generated, sparse-data-grounded Help Card**
> attached to Today checklist items.
> **Propose, don't prescribe** — every consequential choice is an **Open Decision** with a recommendation.
> Nothing here is built; slices in §8 are for later human-assigned runs.

---

## 0. What already exists (recon, 2026-07-02)

This design does **not** start from zero. The Today checklist already carries two teaching-help affordances
per academic item, and the passive-signal substrate is already loaded for other AI tasks. The gap is
**shape**, not absence.

| Piece | Where | What it does today | Reached from |
|---|---|---|---|
| **Teach Helper** ("Help Me Teach This") | `src/features/planner/TeachHelperDialog.tsx` | Modal: warm-up/teach/practice/check **micro-script** (hardcoded generic template first), **Supports** + **Stop Rules** from the snapshot, a hardcoded **"Common Mistakes & What to Say"** block, **"Generate Specific Lesson"** button (→ `generateActivity` → saved `lessonCard`), and **"Print Minecraft Worksheet"**. | AutoAwesome ✨ icon on each item (`TodayChecklist.tsx:680–697` → `onTeachHelperOpen`) |
| **Lesson Video** | `src/features/today/LessonVideoDialog.tsx` + `functions/src/ai/tasks/lessonVideo.ts` | Modal: scoped AI video search (Sonnet + web search, `webSearch:{maxUses:2}`) returning a structured pick `{title,url,source,why,lengthNote,themeTieIn}`, "Find another" (exclude-aware), energy/style/length **refine chips** + free-form refine, and **in-dialog watch-time logging** to hours (`source:'video-watch'`). | OndemandVideo ▶ icon on each item (`TodayChecklist.tsx:666–679` → `handleFindVideo`) |
| **`generateActivity`** | `functions/src/ai/generate.ts` | The existing lesson-card generator. Loads child profile + **skill snapshot** (`prioritySkills`/`supports`/`stopRules`) + current-week theme. Output `{title,objective,materials,steps,successCriteria}`. **Model: Haiku.** Does **not** read passive signals via `contextSlices`. | Called by Teach Helper's "Generate Specific Lesson" |

**Passive signals already loadable** (`functions/src/ai/contextSlices.ts`, `TASK_CONTEXT`): `sightWords`,
`wordMastery` (Knowledge Mine word progress), `recentScans`, `recentHistoryByDomain`, `skillSnapshot`,
`childSkillMap`, plus day-log teach-back. The `quest`/`evaluate`/`chat` tasks already pull these; the
help generators do **not** yet.

**Checklist item metadata available to anchor help** (`ChecklistItem`): `subjectBucket` (or inferred from
label, `TodayChecklist.tsx:71–88`), `contentGuide` ("what to cover today"), optional `skillTags`,
`lessonCardId`, `block`, `skipGuidance`, `mastery`, `engagement`.

---

## 1. Problem statement

The evaluation pipeline works as data plumbing (findings → snapshot → map → planner → quest levels), but
for the parent-facing "help me teach this" moment it under-delivers in four owner-confirmed ways
(2026-07-02):

1. **Says what, not how.** The eval's terminal output for Shelly is
   `EvaluationRecommendation {priority, skill, action, duration, materials?, frequency}`
   (`src/core/types/evaluation.ts:245–252`) — it **terminates at `action: string`**, a directive, not
   help. And where help *does* exist (Teach Helper), the default view is a **generic hardcoded script**;
   the specific, snapshot-grounded content is gated behind a "Generate Specific Lesson" tap the parent
   rarely makes.
2. **Buried / fragmented.** Help is two separate **modals** behind two small icons (✨ and ▶). Nothing
   appears inline on the item Shelly already taps; she has to know the icons exist, open a dialog, and
   read. The Today checklist is where she lives — help isn't *in* it.
3. **Sparse data is the norm.** Shelly logs school intermittently; the system's picture is gap-filled.
   Yet `generateActivity` reads only the snapshot + week theme — it ignores the passive signals
   (quest findings, sight-word mastery, recent scans) that are the *only* reliable read on a low-log
   week. Any design that assumes complete logs is wrong.
4. **Attention reality.** Lincoln's attention is hard, especially with London in the room. Today's
   generated activities assume a one-on-one session; none carry a two-kid variant or a "Lincoln teaches
   London" framing.

**The un-built gap, precisely:** today's help is *modal + manual + generic-template-first + single-signal
(snapshot only) + one-on-one-assuming*. The target is *inline + auto-generated + evidence-grounded across
passive signals + two-kid-aware + MVD-degrading*, on the items Shelly already taps, with **zero new
behavior required of her.**

---

## 2. Design principles (non-negotiable)

- **Zero new Shelly behavior.** Help auto-generates and appears on items she already taps — no new page,
  no button she must remember, no icon-hunting. (Precedent: the engagement-tagging shortfall — a curation
  layer starves when it assumes in-the-moment logging. The current ✨/▶ modals are a milder version of the
  same trap: they demand she *go get* the help.)
- **Sparse-data tolerant.** Help generation reads **passive signals first** (working levels, quest
  findings, sight-word mastery, most-recent scan); manual logs enrich but are **never required**. The
  system never surfaces "you haven't logged X" framing — gaps are normal, not failure (no-shame rule).
- **Two-kid room by default.** Every activity suggestion carries either a **with-London variant** or a
  **"Lincoln teaches London"** framing (the Feynman/teach-back mechanic, already charter canon). One-on-one
  is *the variant*, not the default.
- **MVD-compatible.** On a low-energy day the help degrades to a **≤5-minute** version — it does not
  disappear. (Both Normal and MVD count as real school.)
- **Charter voice.** `CHARTER_PREAMBLE` on the generation prompt (as `generateActivity` and `lessonVideo`
  already do). Parent-facing surface, but it shapes child-facing activity language.
- **Additive, never destructive.** The Help Card is a **read + suggest** surface. It writes nothing to a
  child's record on its own; any write (e.g. logging watch time, already in the video dialog) stays on the
  existing confirmed-write paths. No compliance/`hours`/`xpLedger`/`skillSnapshot` math changes here.

---

## 3. The Help Card (proposed shape)

Per academic checklist item, an **inline expandable card** (not a modal) that consolidates the ✨ Teach
Helper and ▶ Lesson Video into one affordance. Collapsed by default to keep Today under the 60-second bar;
one tap expands. Sections:

- **Play it** — one game version of the skill (2–10 min), materials Shelly already has, **two-kid variant
  included** (either "London plays too" or "Lincoln teaches London"). This is the upgraded, evidence-
  grounded successor to `generateActivity`'s `steps/materials`.
- **Say this** — a 3–5 line **micro-script**: how to introduce it, what to say when Lincoln stalls
  (drawn from snapshot `supports` + `stopRules`, which the generator already loads), and **what mastery
  looks like today** (grounded in the working level / recent finding, not a generic rubric).
- **Watch this** — one aligned video. This is the **already-shipped `lessonVideo` pick**, surfaced inline
  instead of behind the ▶ modal. Keeps "Find another" + refine + the existing watch-time logger. See §5.
- **Skip signal** — when to stop. **Existing** stop rules surfaced (`snapshot.stopRules`), not new ones.

**Explicitly not in the card:** any auto-write to the child's record, any grade/score, any "you're behind"
framing. The card is help, not assessment.

**Degradation:** in MVD mode (`planType === 'mvd'`) the card renders only **Say this (≤5-min variant)** +
**Skip signal**, with "Play it" collapsed to a one-liner and "Watch this" available on demand.

---

## 4. Generation & caching strategy — Open Decision

The video pick is *already* lazy (searched on dialog open). The new cost is the **Play it + Say this**
generation. Options:

- **A. Batch at plan lock-in.** Generate for all week items when the planner locks the week.
  *Pro:* zero morning latency; one predictable cost spike. *Con:* stale by Friday if working levels move
  (quest/eval can shift a level mid-week); pays for items that get skipped/deferred.
- **B. Lazy at first Today open per day.** Generate a day's cards the first time Shelly opens Today.
  *Pro:* always fresh against current levels; only pays for days actually opened. *Con:* first-open
  morning latency; N calls per active day.
- **C. Hybrid (recommended).** Batch the **must-do** items at lock-in for instant first paint, then
  **regenerate on the events that change a working level** (quest completion, eval finding, scan advance)
  and lazily fill any un-generated item on first expand. Freshness where it matters, no full-week waste.

**Cost / model note.** Existing per-call context: `generateActivity` is **Haiku**; `lessonVideo` is
**Sonnet + web search**. The Help Card's game+script is richer than the current lesson card (it must fuse
passive signals, produce a genuinely playable game, *and* author a two-kid variant + a today-specific
mastery line). **Open sub-decision:** keep Haiku (cheapest, matches current lesson-card tier) vs. **Sonnet
with Haiku fallback** (better game/script quality; the video half already pays Sonnet). Recommendation:
**Sonnet for the card body, reuse the existing Sonnet `lessonVideo` call for the video** — the card is a
low-frequency, high-value surface (a few must-do items/day), so quality outweighs the token delta. Log to
`aiUsage` exactly as `generateActivity`/`lessonVideo` already do (`taskType` per call), so cost stays
visible and cappable.

---

## 5. Video strategy — Open Decision (revised: it already ships)

**Correction to the original brief's premise.** Video is **not** "none / planned since March." It is a
shipped, five-FEAT-row feature (FEAT-14 → FEAT-23): the `lessonVideo` Cloud Function (Sonnet + web search),
the `LessonVideoDialog` (structured pick, find-another, refine chips, watch-time logging), and the ▶ entry
point on Today. The current approach is effectively a **smart variant of Option C**: AI-picks a real video
via live web search, scoped to the child's age + lesson objective + soft interests, with charter framing —
it is *not* a raw constructed search link, and it *is* better than a static curated stub for coverage.

So the video Open Decision is no longer "how do we get video?" but **"how much do we trust the AI pick on a
kid-adjacent surface, and do we add curation on top?"**:

- **A. Curated library.** Nathan maintains a `skillTag → video` mapping (a Firestore collection + a small
  Settings admin surface). Highest trust, manual upkeep, sparse coverage until populated.
- **B. Curated channels + AI pick.** An allowlist of trusted channels; the `lessonVideo` search is
  restricted to them. Needs a YouTube Data API key (the CF-secret pattern is already proven with
  `GITHUB_PAT` in `fileFeatureRequests`). Raises trust while keeping coverage.
- **C. Keep today's open AI web-search pick** (status quo). Zero curation infra, broadest coverage, lowest
  per-pick trust. **Content-safety tradeoff (flag explicitly):** the pick is a live external link a parent
  opens; today it relies on the prompt's "reputable, kid-safe sources" instruction + Shelly's eyes, with
  **no allowlist enforcement**.

**Recommendation — phased C → A-on-top (do not rip out C):**
1. **Now/Slice 1:** surface the existing C pick inline in the Help Card (no backend change).
2. **Then:** add an optional **curated override** (A) — when a `skillTag → video` entry exists, the card
   shows the vetted video and *labels it "picked by Nathan"*; otherwise it falls back to the AI pick.
   This buys rising trust on the highest-frequency skills without waiting to curate everything.
3. **B is a later lever** if allowlist enforcement (not just labeling) becomes necessary.

**Invariant for every option:** videos render as **links/thumbnails for Shelly**, never as an autoplay
surface for kids. (The current dialog already does this — "Open / cast" link, parent-only.)

---

## 6. Sparse-data behavior (the §2 principle made concrete)

**What the generator reads when logs are thin** (backbone, always available regardless of logging):

- **Working levels** (`skillSnapshots.workingLevels.{phonics,comprehension,math,writing,sentence}`) — the
  conservative per-domain level, moved by quests, not by manual logging.
- **Quest findings** (`evaluationSessions[].findings` / `wordProgress` / `sightWordProgress`) — what
  Lincoln actually got right/wrong in the Knowledge Mine.
- **Sight-word mastery** (`sightWordProgress`) — per-word state.
- **Most-recent scan** (`scans` / `recentScans` slice) — where he is in the workbook.
- **Snapshot** `supports` / `stopRules` / `prioritySkills` — for the "Say this" + "Skip signal" halves.

**Opportunistic (used only if present, never required):** day-log `engagement`, `mastery` chips,
`gradeResult` notes, teach-back captures. Their **absence is never surfaced.**

**Worked example — "Lincoln, phonics item, no parent logs in 9 days":**

- *What the card still confidently contains:* Phonics working level (say L4) is current from his last
  quest, so **Play it** targets L4 decodable words (e.g. short-vowel CVC blends he's mid-mastery on per
  `wordProgress`); **Say this** pulls his real supports ("segment with sound boxes"; "let him build the
  word with tiles before reading it") and the today-mastery line is level-specific ("today = reads 3 of 4
  short-i words without segmenting aloud"); **Skip signal** is his real stop rule ("if he mis-reads 2 in a
  row, drop to review words and end on a win"); **Watch this** is scoped to the L4 phonics objective.
- *What it hedges / omits:* it does **not** claim "since yesterday's lesson…" or reference any session
  that wasn't logged; it does **not** say "you skipped phonics for 9 days"; the two-kid variant defaults
  to "Lincoln teaches London the sound" (needs no fresh data). The card reads as confident help built on
  the durable signals, silent about the gap.

---

## 7. Relationship to existing surfaces

- **Teach Helper / lesson cards → the Help Card is their successor.** Recommendation: the Help Card
  **subsumes** `TeachHelperDialog` (its micro-script, supports, stop rules, and generate path all move
  into the inline card) and **supersedes** the generic-template-first UX. *Migration note:* keep
  `generateActivity` + the `lessonCards` collection as the generation/persistence layer under the hood
  (the card body is a richer prompt over the same plumbing); retire the **modal shell** and the hardcoded
  generic template once the inline card ships. The "Print worksheet" affordance is orthogonal — carry it
  forward as a card action, don't block on it.
- **Lesson Video → folded in, not replaced.** The `lessonVideo` task + watch-time logging are reused
  verbatim as the card's **Watch this** section. The standalone ▶ modal can retire once the card carries
  it. No backend change required for Slice 1.
- **Eval recommendations → named follow-up (out of scope here).** Propose that each
  `EvaluationRecommendation` gains a `helpCardSeed` linkage so the eval terminates in *help*, not just a
  directive — the recommendation's `skill`/`action`/`materials` pre-seed the card's Play it/Say this. **But
  keep this doc's build scope to the Today surface;** the eval-side type change + its consumers
  (`EvaluateChatPage`, planner slices) are a separate ledger item to draft after the Today card exists.
- **Shelly chat → out of scope here.** Note only that the chat can later *reference* a card ("open the
  Help Card for today's phonics") — no coupling designed now.

---

## 8. Build plan (for later runs — do not build now)

Serialized, each independently revertable. First slice is the smallest thing Shelly can *feel*.

1. **Slice 1 — Inline Help Card on must-do phonics/math items, video reused, batch-at-lock-in.**
   Render the card inline (collapsed → expand) on `mvdEssential` phonics/math items only. **Play it + Say
   this** generated at plan lock-in (Option A for this slice — simplest), grounded in snapshot + working
   levels + sight-word mastery (passive signals). **Watch this** = the existing `lessonVideo` pick surfaced
   inline (Option C, no backend change). Two-kid variant + MVD ≤5-min variant included in the prompt from
   day one. No eval-side change. *Feel:* Shelly taps a must-do item and sees a playable game + a 3-line
   script + a video, without opening a modal.
2. **Slice 2 — Sparse-data grounding + regeneration on level-change (Hybrid, Option C from §4).**
   Move card generation onto the `contextSlices` passive-signal loaders (quest findings, recent scan) and
   regenerate a card when a quest/eval/scan changes its domain's working level. Adds the §6 worked-example
   confidence. Extend the card to all academic items, not just must-do.
3. **Slice 3 — Curated video override (Option A-on-top from §5).**
   Add the `skillTag → video` collection + a small Settings admin surface; card prefers the vetted video
   (labeled "picked by Nathan") and falls back to the AI pick. Raises trust on high-frequency skills.
4. **Slice 4 (named follow-up, separate ledger item) — `helpCardSeed` on `EvaluationRecommendation`.**
   Close the loop from §7 so the eval terminates in help. Out of this doc's Today scope; draft after
   Slice 1–2 land.

---

## 9. Open decisions summary table

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | Generation & caching (§4) | A batch at lock-in · B lazy at first open · C hybrid (batch must-do + regen on level-change) | **C hybrid** |
| **D2** | Model tier for the card body (§4) | Haiku (status quo lesson-card tier) · Sonnet + Haiku fallback | **Sonnet body + reuse Sonnet `lessonVideo`**; card is low-freq/high-value |
| **D3** | Video trust/curation (§5) | A curated library · B curated channels + AI pick (needs YouTube API key) · C keep open AI web-search pick | **Phased C → A-on-top** (surface existing pick now; add labeled curated override next; B later if enforcement needed) |
| **D4** | Help Card vs. existing modals (§7) | Subsume Teach Helper + fold in Lesson Video · Coexist (add card alongside modals) · Replace all at once | **Subsume Teach Helper; fold in Lesson Video; retire modals after the inline card ships** |
| **D5** | Two-kid default framing (§2/§3) | "London plays too" variant · "Lincoln teaches London" (teach-back) · both, AI picks per skill | **Both — AI picks per skill;** teach-back preferred where the skill supports it |
| **D6** | Eval `helpCardSeed` linkage (§7) | In this doc's scope · Named follow-up ledger item · Don't do it | **Named follow-up** (keep this doc scoped to Today) |
| **D7** | Card default state on Today (§3) | Expanded · Collapsed (one tap to expand) · Auto-expand must-do only | **Collapsed** (protect the 60-second bar); revisit if Shelly wants must-do auto-expanded |

---

*Grounded against code at `origin/main` (2026-07-02): `functions/src/ai/generate.ts`,
`functions/src/ai/tasks/lessonVideo.ts`, `functions/src/ai/contextSlices.ts`,
`src/features/today/TodayChecklist.tsx`, `src/features/today/LessonVideoDialog.tsx`,
`src/features/planner/TeachHelperDialog.tsx`, `src/features/planner-chat/LessonCardPreview.tsx`,
`src/core/types/evaluation.ts`.*
