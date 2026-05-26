# Monthly Review Book — Design

**Status:** Design proposal, not yet built
**Author:** Design chat (Claude + Nathan), March 2026
**Decisions locked:** fully auto-generated, one book per child per month, toggleable kid/parent view, calendar-month auto-generate on the 1st
**Builds on:** Book Builder (`src/features/books/`), Weekly Review (`functions/src/ai/evaluate.ts`), Disposition Profile, Capture Pipeline, Blocker Lifecycle (`conceptualBlocks`)

---

## 1. What this is

A book that lands on Shelly's screen on the 1st of each month, already drafted, summarizing the previous month for one child. She skims it, swaps a photo if she wants, adds a sentence if she has one, and publishes it. The kids see it as a celebration — flippable pages with their photos, their work, and a story-shaped narrative of what they did and worked through. The parents see the same book, toggled into "parent mode," with the same photos and pages but with the AI's analytical reading underneath — what resolved, what's still in flight, what the dispositions are doing, what to focus on next.

It is **not** a report card. It is the family sitting on the couch flipping through what the month held. The AI's job is to make the mundane feel meaningful and to surface the patterns Shelly might miss when she's tired.

---

## 2. Why this exists (formation, not performance)

The Charter is explicit: portfolio over grades, no shame, formation over performance, rest by design. Three problems this feature solves:

1. **The weekly review fires on Sunday at 7pm CT, but it's a transactional doc.** Shelly reads it, accepts pace adjustments, moves on. It doesn't accumulate into anything tangible the family experiences together. After 4 weeks it's still 4 separate reviews.

2. **Lincoln's blockers resolve invisibly.** When short-i/short-e confusion gets resolved, that's a *big* win — but right now it shows up as a status change on `conceptualBlocks`, not as a moment the family marks. He should *see* that he beat it.

3. **London's creative output deserves an anthology.** He makes books, sketches, stickers, voice recordings. They live in the Bookshelf and the Sticker Library. Nothing collects them into a "this is what April looked like for London" artifact.

The monthly book closes all three: it gives weekly reviews a place to land, it gives blocker resolutions a stage, and it gives kid creative output an anthology with parent reflection alongside it.

---

## 3. The toggleable view (the key design choice)

One book, one set of pages, one set of curated photos, two voices. The reader has a single toggle at the top: **Kid Mode** (default for kids, default for family couch reading) and **Parent Mode** (default when Shelly opens it from Progress).

Each page stores both voices. The photos and visual structure are shared. The text and emphasis differ.

**Example — same page, two modes:**

> **Kid Mode (cover page):** "April was the month you started reading chapter books on your own. Look how much you built."
>
> **Parent Mode (same page):** "April: Lincoln transitioned from supported decoding to independent chapter-book reading. Endurance up 40%, articulation steady, persistence the standout disposition. 3 blockers resolved, 1 still active (multi-digit subtraction with regrouping)."

The mode toggle is preserved across pages. The toggle is also why a single Sonnet generation pass can produce both voices — they share source data, only the rendering differs. This collapses what could have been "two artifacts per child per month" into one.

**Why not separate parent and kid books?** Tried it on paper. Two artifacts means double the editing burden on Shelly (she has fibromyalgia), double the photo curation, and forces an artificial separation between "celebration" and "reflection" that the Charter doesn't actually want. The Charter wants reflection in the celebration and celebration in the reflection. One book, two readings.

---

## 4. Book structure

Eleven sections, one of which is blank for Shelly. Fixed order. Section content is data-driven; section *order* never changes (predictability matters for monthly reuse).

| # | Section | Dominant Mode | Source Data |
|---|---|---|---|
| 1 | **Cover** | Kid | AI-picked theme word, hero photo (highest engagement signal), child name + month |
| 2 | **The Month in a Sentence** | Both equal | Aggregated from 4 weekly reviews + disposition profile |
| 3 | **What You Loved** | Kid dominant | Top photos by engagement signal (😊 emoji on linked Today items, completed quests, books read) |
| 4 | **What You Worked Through** | Mode-split | `conceptualBlocks` lifecycle — resolved + active. Kid sees story arc; parent sees dates and recommendations |
| 5 | **Your Books** | Kid dominant | `books` collection where `completedAt` falls in month + reading sessions logged |
| 6 | **Your Dad Lab** | Kid dominant | `dadLabReports` from the month, with predictions and explanations |
| 7 | **How You Showed Up** | Mode-split | Disposition profile (curiosity, persistence, articulation, self-awareness, ownership) |
| 8 | **Teaching/Being Taught** | Kid dominant | Lincoln: teach-back captures. London: sessions where Lincoln read to him |
| 9 | **Conundrums You Wrestled With** | Both equal | Weekly conundrums + kid responses |
| 10 | **By the Numbers** | Parent dominant | Stats card: hours by subject, books, quests, blockers resolved. Framed as celebration in kid mode ("you mined 87 diamonds") |
| 11 | **Looking Ahead** | Parent dominant | 2-3 recommendations from latest weekly review + active blockers. Kid mode says "next month..." with a friendly teaser |
| 12 | **Shelly's Note** | (Shelly only) | Blank page Shelly fills in before publishing — text, photo, or audio |
| 13 | **Back Cover** | Both | Family photo with Sunny, child name, month + year, "Barnes Family Homeschool" |

A few notes on specific pages:

- **What You Worked Through** is the section that earns the toggle. Kid mode: *"Remember when reading words like 'pen' and 'pin' got mixed up? You figured it out on April 12 with mom — and now you don't even have to think about it."* Parent mode: *"short i / short e confusion (ADDRESS_NOW → RESOLVED Apr 12, guided eval session id `ev_xxx`). Resolution method: guided contrast practice. Strategy worked: yes. Carry-over to spontaneous reading: confirmed in Apr 19 quest session."* Same blocker, different reading. The kid sees adventure. The parent sees a resolved item with evidence.

- **Conundrums** revisits the weekly questions ("Was it right for the squirrel to take the food?"). Lincoln and London answered these on the Today page during the month. The book replays the questions and what they said. Parent mode adds a one-line note on character development signal. Kid mode just shows the question + their answer + a photo of the moment if there is one.

- **Shelly's Note** stays blank if Shelly skips it. That's fine. It's a slot, not a requirement.

---

## 5. Content sources — what feeds what

All sources read-only. The book is a synthesis artifact; it doesn't write back to source collections.

| Source Collection | Used For | Curation |
|---|---|---|
| `weeklyReviews` (×4) | Month-in-a-sentence, Looking Ahead, growth narrative tone | Auto-aggregated |
| `dayLogs` (~20-25 docs) | Engagement signal for photo curation, hours stats, energy pattern | Auto-aggregated |
| `conceptualBlocks` on `skillSnapshots` | What You Worked Through | Auto, all resolved this month + currently active |
| `dispositionProfile` (latest) | How You Showed Up, theme word | Auto, latest snapshot |
| `books` where `completedAt ∈ month` | Your Books | Auto, all |
| `scans` + `artifacts` photos from month | Photo pool for all visual pages | AI-curated to ~20-30 best, ~6-10 placed |
| `dadLabReports` from month | Your Dad Lab | Auto, all |
| `weekPlans.conundrum` + kid responses | Conundrums | Auto, all 4 conundrums |
| Teach-back captures (`dayLogs.teachBackDone`, audio refs) | Teaching/Being Taught | Auto, all |
| `hoursAdjustments`, hours computation | By the Numbers | Computed |
| `xpLedger` | By the Numbers (diamonds, XP), avatar tier | Aggregated |

Nothing requires Shelly to tag, mark, or curate during the month. The book builds itself from what's already being captured. That's the whole point — Shelly doesn't have to do anything extra during the month for the book to exist.

### Photo curation

The single hardest auto-generated decision. ~50-200 photos may exist from a typical month (capture pipeline runs scans + artifacts for every photo). The book uses ~6-10. Bridging that gap matters.

**Two-pass approach:**

1. **Score pass (Haiku, fast and cheap)** — score every photo from the month by signal:
   - Engagement emoji on linked Today item: 😊 = +3, 😐 = +1, 😫 = 0, ❌ = -2
   - Scan analysis "good evidence" flag: +2
   - Book completion artifact: auto-include
   - Sketch-to-story artifact: auto-include
   - Dad Lab artifact with explanation present: +2
   - Subject diversity penalty (don't pick all reading): −1 per same-subject photo above the third
   - Recency spread penalty (prefer photos across the month, not all from one week): −1 if same week as already-selected photo
   - Blockers-resolved photo (any scan tied to a now-resolved skill): +2

2. **Placement pass (Sonnet)** — given top ~30 ranked photos, place ~6-10 in the appropriate pages. Page assignment is rule-based per section (e.g., Dad Lab page only takes Dad Lab artifacts; Books page only takes book completions). Hero photo for cover is the top-scored photo that isn't a workbook scan.

Rest of the ~30 photos go into a "More Photos" tray that Shelly can swap into any photo slot from the editor.

---

## 6. AI's role per section

Single Sonnet generation pass per child per month. The prompt receives all aggregated source data plus the photo curation result, and produces both kid and parent voices for every section in one JSON output.

**Token budget estimate:** ~8-12k input (compressed weekly reviews + disposition + blockers + book metadata + photo refs with captions + day log summaries), ~4-6k output (both voices for ~11 sections). ~$0.10-0.15 per child per month. Two children, twelve months = ~$3/year. Trivial.

**Prompt structure:**

```
[CHARTER_PREAMBLE]

You are writing a monthly review book for {child.name} ({child.age}) for {month}.

VOICE GUIDANCE:
- Kid mode: 2nd person ("you"), present-tense story arc, concrete, celebratory.
  Avoid abstract praise ("you worked so hard"). Prefer specific moments
  ("on April 12 you read 'pin' and 'pen' without mixing them up").
  Lincoln voice: Minecraft-natural where it fits, not forced.
  London voice: storybook-natural, gentle, imaginative.
- Parent mode: 3rd person, analytical but warm, evidence-based, names dates and
  source data, surfaces patterns Shelly might miss. Never grades, never ranks.
  Frame growth as observation, not measurement.

[All source data, sectioned]

For each of the 11 content sections, produce both kidMode and parentMode content.
Output JSON matching MonthlyReviewSchema (see types).
```

The AI never writes for the "Shelly's Note" section — that's reserved.

**What the AI is explicitly *not* asked to do:**

- Compare children to each other (never)
- Compare this month to last month in a measurement way ("up 12%") — only in disposition-shift language ("more curious about how things work than in March")
- Grade or score anything
- Recommend specific products, curricula, or activities the family doesn't already use
- Use the word "behind" or "ahead" or "should be" — Charter explicit

---

## 7. Generation flow

**Trigger:** Scheduled Cloud Function `generateMonthlyReview` fires on the 1st of each month at 8:00 AM CT. (Tucked into morning so it's ready before Shelly opens the app, but after midnight rollover so all March 31 data is committed.)

**Manual trigger:** `generateMonthlyReviewNow(childId, month)` callable function, same as `generateWeeklyReviewNow`. Surfaces a "Generate Now" button in the Progress tab for testing and re-generation if Shelly wants to redo.

**Pipeline per child:**

```
1. Aggregate data (parallel reads):
   - 4 weekly reviews where weekStart ∈ month
   - Day logs for month
   - conceptualBlocks (current state + resolutions during month)
   - Latest disposition profile
   - Books completed in month
   - Dad Lab reports in month
   - Scans + artifacts in month
   - Week plans (for conundrums) + responses
   - Teach-back captures
   - Hours computation for month
   - xpLedger entries

2. Photo curation pass (Haiku) → scored photo list

3. Content generation pass (Sonnet) → full book JSON with both voices

4. Write monthlyReviews/{childId}_{YYYY-MM} with status: 'draft'
   - Mark heroPhotoRef
   - Persist sourceRefs (weeklyReviewIds, dispositionProfileId, blockerSnapshotAt)
   - Persist stats

5. Notify (Shelly only at this stage):
   - Today page shows "April's Monthly Book is ready to review"
   - Push notification (Phase 2)
```

**Shelly's flow (target: under 5 minutes):**

- Notification card → opens reader in Parent Mode
- Skim each page
- Swap photo (tap → "More Photos" tray → pick alternate) — optional
- Add a sentence to Shelly's Note — optional
- Tap "Publish" → status becomes `published`, kid notification fires

**Kid's flow:**

- Today page card: "Your April book is ready!" (only after parent publishes)
- Tap → reader opens in Kid Mode, full-screen
- Swipe through pages
- Tap a photo to expand
- Tap a recording (audio captions on book pages, optional) to play
- "All done" returns to Today

**Republish:** If Shelly edits after publish, the kid sees a small "updated" dot the next time they open it. No re-notification.

---

## 8. Editing experience

This is where Book Builder reuse pays off. Most of the editor is already built. What's different is that pages aren't blank — they arrive pre-populated and structured. The editor is a *swap-and-edit* experience, not a build-from-scratch one.

**Reused from Book Builder:**

- Page navigation (swipeable + page strip)
- Text editing (tap text → inline edit)
- Photo positioning (drag to reposition within slot)
- "Replace photo" → opens curated alternates tray
- Sticker picker (decorative only on monthly book — not data-bearing)
- Audio playback per page (where audio captions exist)
- Print to PDF (same `printBook.ts` approach, letter size)

**New for Monthly Book:**

- **Mode toggle at top of every editor view** — Shelly edits one mode at a time. Switching mode shows that mode's content. Pages where one mode dominates show that mode's content first and the other mode collapsed.
- **Section locks** — Shelly can't add or remove sections. Section *order* is fixed. She can clear a section if she wants ("don't include Dad Lab this month" — defaults to skipped, not removed from book structure).
- **"More Photos" tray** — opens a strip of the ~20-30 photos the AI scored but didn't place. Tap to swap into the current photo slot.
- **Regenerate this section** button per section — if Shelly hates what the AI wrote for a section, one tap re-runs Sonnet for just that section. Cheaper than full regen.
- **Status bar** — shows "Draft" until publish.

**What's deliberately not in the editor:**

- No font picker (consistent typography per child — Lincoln's books use one family, London's another, set once)
- No page reorder
- No "add a new page"
- No theme switcher within a month's book (the AI picked the theme, that's the theme)

This is intentional. The book builder is a creative tool. The monthly book is a synthesis tool with light personalization. Different jobs.

---

## 9. Data model

```typescript
// src/core/types/monthlyReview.ts

export interface MonthlyReview {
  id: string;                 // `{childId}_{YYYY-MM}`
  familyId: string;
  childId: string;
  month: string;              // `YYYY-MM`
  status: 'generating' | 'draft' | 'published';

  generatedAt: Timestamp;
  publishedAt?: Timestamp;
  lastEditedAt?: Timestamp;

  theme: string;              // AI-picked month theme word/phrase
  heroPhotoRef: PhotoRef;

  pages: MonthlyReviewPage[];
  curatedPhotos: PhotoRef[];  // ~20-30 ranked
  unplacedPhotos: PhotoRef[]; // remainder for "More Photos" tray

  stats: MonthStats;
  sourceRefs: SourceRefs;

  shellyNote?: ShellyNote;
}

export interface MonthlyReviewPage {
  id: string;
  sectionType: SectionType;
  order: number;

  kidMode: PageContent;
  parentMode: PageContent;

  // Shared visual elements
  photoRefs: PhotoRef[];
  stickers?: Sticker[];

  hidden?: boolean;           // Shelly can hide a section (defaults false)
}

export interface PageContent {
  headline?: string;
  body?: string;
  highlights?: string[];      // bullet-emphasis lines
  captions?: Record<string, string>; // photoRef.id → caption
  audioRef?: string;          // optional audio caption
}

export type SectionType =
  | 'cover' | 'monthInSentence' | 'whatYouLoved' | 'workedThrough'
  | 'books' | 'dadLab' | 'howYouShowedUp' | 'teaching'
  | 'conundrums' | 'byTheNumbers' | 'lookingAhead' | 'shellyNote' | 'backCover';

export interface MonthStats {
  daysWithActivity: number;
  totalHours: number;
  hoursBySubject: Record<string, number>;
  booksCompleted: number;
  booksRead: number;
  quests: number;
  blockersResolved: number;
  blockersActive: number;
  teachBackCount: number;
  dadLabCount: number;
  totalDiamonds: number;      // from xpLedger
}

export interface SourceRefs {
  weeklyReviewIds: string[];
  dispositionProfileSnapshotAt: Timestamp;
  blockerSnapshotAt: Timestamp;
}

export interface PhotoRef {
  id: string;
  storagePath: string;
  source: 'scan' | 'artifact';
  sourceDocId: string;
  capturedAt: Timestamp;
  score?: number;             // from curation pass
  subjectTag?: string;
}

export interface ShellyNote {
  text?: string;
  audioUrl?: string;
  photoUrl?: string;
  updatedAt: Timestamp;
}
```

**Firestore path:** `families/{familyId}/monthlyReviews/{reviewId}`

**Why a new collection (not extending `books`):**

- Different lifecycle: monthly reviews are generated, edited briefly, published, then mostly read-only. Books are draft-edit-finish with no auto-generation.
- Different schema: monthly reviews have `stats`, `sourceRefs`, two modes per page. Books have `pages` with arbitrary content.
- Different reads: monthly reviews are listed by month on Progress. Books are listed by child on Bookshelf.
- Different permissions later: monthly reviews might eventually be shareable to grandparents. Books are kid creative output.

Conflating them would muddy both.

**Indexes:** `(familyId, childId, month DESC)` and `(familyId, status, month DESC)`. Both will need composite indexes added to `firestore.indexes.json`.

---

## 10. Where it lives in the app

**Parent navigation:**

- Progress page → new tab "Monthly Books" (alongside Learning Profile, Skill Snapshot, etc.)
- The tab lists every month's book per child, with status chips (Draft / Published)
- Each book opens in the Reader; tap "Edit" in Reader to switch to editor mode

**Kid navigation:**

- "My Books" remains London's creative bookshelf
- New page: "Books About Me" — Kid-mode reader for published monthly books, listed reverse-chronologically
- Today page integration: when a new monthly book gets published, the kid's Today page shows a celebration card for 3 days: "Your April book is here! 📖"

Naming: in the app, "Monthly Book" for kids, "Monthly Review" for parents. Same artifact, mode-appropriate label.

---

## 11. Printing

Charter principle #6: print the stack. Monthly books are exactly the kind of thing that wants to live on paper.

**Format:** Letter-size (8.5x11), portrait, full-page. Generated via existing `jsPDF` + `printBook.ts` approach.

**Choices in print dialog:**

- Mode: Print Kid Mode / Print Parent Mode / Print Both (kid pages followed by parent pages — Phase 2)
- Cover style: photo-dominant or text-dominant
- Background: white (ink-saving, default) or themed

**Use case:** Shelly prints both kids' April books on May 5, three-hole punches them, and adds them to the family binder. End-of-year she has 24 booklets (12 months × 2 kids). That's the artifact.

Half-letter mini-book format from Book Builder is *not* offered for monthly books — these are keepsakes, full size matters.

---

## 12. Phased build

**Phase 1 — MVP (one Claude Code prompt, ~3-5 days of build):**

Goal: Shelly can see an auto-generated April book for Lincoln, skim it, and publish it. Kid can read it.

Scope:
- Cloud Function `generateMonthlyReview` (scheduled + manual trigger)
- New chat task `monthlyReview` registered in `CHAT_TASKS`
- Data model: `monthlyReviews` collection, types, indexes
- Aggregation logic (read 4 weekly reviews + day logs + blockers + disposition + books + photos)
- Photo curation pass (Haiku scoring)
- Content generation pass (Sonnet, both modes)
- Parent UI: Progress page → "Monthly Books" tab with list + reader
- Reader supports mode toggle (kid/parent)
- 5 sections only: Cover, Month in a Sentence, What You Loved, What You Worked Through, By the Numbers
- Publish button
- Kid navigation: "Books About Me" page with reader

Deferred from Phase 1:
- Editor (Shelly can only view + publish, no edits yet)
- Photo swap UI
- Shelly's Note
- Print to PDF
- Other 6 sections
- Notifications

**Phase 2 — Editor parity (~3 days):**

- Full editor with section-by-section editing
- "More Photos" tray for photo swap
- Shelly's Note section (text + photo + audio)
- Regenerate section button
- Print to PDF (Kid Mode default)
- Remaining sections: Your Books, Your Dad Lab, How You Showed Up, Teaching, Conundrums, Looking Ahead

**Phase 3 — Polish (~2 days):**

- Notifications (Today card on publish; in-app push optional)
- Kid mode reader styling per child (Lincoln Minecraft chrome, London storybook chrome)
- Print mode picker (Kid / Parent / Both)
- Print Both mode

**Phase 4 — Year artifact (deferred, separate feature):**

- Annual Review Book — aggregates 12 monthly books into a year-end artifact for each child
- "Year in Review" generation on August 1 (academic year boundary for MO compliance)
- Print to physical photo-book-style PDF for binder or service like Shutterfly

---

## 13. Open questions for build time

These don't block the design but should be answered when Phase 1 starts:

1. **Engagement emoji weighting** — proposed scores (😊 = +3, 😐 = +1, 😫 = 0, ❌ = -2) are a guess. Worth A/B'ing once a few real months run.

2. **What happens to a sparse month?** If a child only had 5 days of activity in a month (vacation, illness), most sections will be thin. Proposal: detect under 8 days of activity, generate a single-page "Quiet Month" book with a soft note instead of forcing 11 thin sections. Charter alignment: rest by design.

3. **Theme word source** — should the AI extract the theme word from the dispositions, the weekly review themes, or a fresh synthesis? Proposal: synthesis from all three, prefer specific over abstract ("Reading Out Loud" over "Growth").

4. **Per-child styling defaults** — Lincoln's book: Minecraft-themed chrome (page borders, blocky type for headlines). London's: storybook-themed (rounded type, soft borders, Fredoka font). This is a Phase 3 concern but worth documenting now.

5. **Privacy on share** — eventually grandparents will want copies. Phase 1 ignores this. Phase 4 or later: shareable read-only link that locks to Kid Mode (no parent analytics).

6. **Edit-after-publish behavior** — currently proposes "small updated dot in kid view." Alternative: lock the book on publish, require Shelly to explicitly unpublish to edit. Lean toward staying editable forever (kid view just shows latest).

---

## 14. Charter alignment check

| Charter Principle | How this honors it |
|---|---|
| Faith first | Conundrums section + scripture in week focus carry through |
| No shame | Bad months are still books. "Quiet Month" branch protects against measurement-style framing |
| Portfolio over grades | Every page is evidence, not score. By the Numbers framed as celebration |
| Rest by design | Auto-generated. Shelly's job is to skim and publish, not author |
| Lincoln teaches London | Dedicated section for teach-back captures |
| Print the stack | Letter-size print is first-class, not an afterthought |
| Engagement > completion | Photo curation literally indexed on engagement signal |
| Diamonds, not scores | xpLedger feeds By the Numbers; no percentages |
| Disposition over content mastery | How You Showed Up is a full section; framing of every page leans on disposition |
| Kid-initiated logging | Lincoln's logs (teach-back, extra activity) surface in his book — his own work shapes the artifact |
| School creates product | Monthly book IS a product the kids and parents own |

---

## 15. What this is not

To keep scope honest:

- **Not a yearbook platform.** No shareable web links to grandparents (Phase 4+).
- **Not a scrapbook editor.** Limited layout choices, fixed section order.
- **Not a school report.** No teacher-facing format, no compliance export. Records page handles compliance.
- **Not a separate book builder.** Reuses Book Builder primitives but is its own feature with its own data model.
- **Not London's creative space.** "My Books" remains his bookshelf. This is the family's anthology of *what the month was.*

---

## Appendix A — Sample AI output (one section, both modes)

For illustration. Actual generation produces all 11 sections in one pass.

**Section: What You Worked Through (Lincoln, April 2026)**

```json
{
  "sectionType": "workedThrough",
  "order": 4,
  "kidMode": {
    "headline": "What You Figured Out",
    "body": "Remember when 'pin' and 'pen' kept getting mixed up? You worked on that for three weeks. On April 12 something clicked — Mom asked you to read them in a sentence and you got it. Not even close. And then on April 19 in your reading quest you got six in a row without even thinking. That's a thing you used to find hard and now you don't.",
    "highlights": [
      "Short i and short e — you've got it",
      "First time reading a chapter book by yourself: April 23"
    ],
    "captions": {
      "photo_abc123": "April 12 — the morning it clicked"
    }
  },
  "parentMode": {
    "headline": "Blocker Lifecycle — April",
    "body": "One conceptual block resolved this month (short i/e confusion, ADDRESS_NOW since March 14, RESOLVED April 12 via guided contrast practice with parent support, evidence: ev_abc123). Carry-over to spontaneous reading confirmed in interactive session on April 19 (6/6 correct, no hesitation). One block remains active (multi-digit subtraction with regrouping, ADDRESS_NOW since April 3 — see Plan Week recommendations).",
    "highlights": [
      "Resolved: short i/e confusion (4 weeks in lifecycle)",
      "Active: multi-digit subtraction with regrouping",
      "Recommended carry-over practice: independent reading 15 min/day, already in next week's plan"
    ],
    "captions": {
      "photo_abc123": "April 12 evaluation session — short i/e contrast"
    }
  },
  "photoRefs": ["photo_abc123", "photo_def456"]
}
```

Same page, same photos, two readings. That's the whole shape of the feature.

---

## Refinement Notes

### v1.2 — May 25, 2026 — Per-mode photo policy

The "same photos, two readings" shape above was right for text but wrong for
photos. Real-use feedback from Lincoln's April 2026 book surfaced that kid
mode was picking up workbook scans on its celebration pages — a 10-year-old
flipping through "his book about him" should not be looking at worksheet
captures next to his Lego builds.

Photos are now per-mode. `MonthlyReviewPage.photoRefs` accepts either a flat
`PhotoRef[]` (legacy reviews) or a `{ kid: PhotoRef[]; parent: PhotoRef[] }`
shape. The renderer reads through `getModePhotos(page, mode)` so both shapes
keep rendering — old draft reviews don't break, new reviews use the per-mode
shape.

Placement policy:

- **Kid mode** is celebration-only. Workbook scans are excluded everywhere
  in kid mode — even on the "Worked Through" page. If kid mode for a section
  has no eligible photos, the section renders text-only in kid view.
- **Parent mode** keeps workbook scans on `workedThrough` (evidence page)
  and only there. Other parent-mode sections stay creative-work-first so the
  parent view doesn't lead with worksheets either.
- **Cover hero** is selected via `pickHeroPhoto` (already workbook-aware) and
  the same hero is used for both modes.

Caps were raised so kid mode aggressively includes creative artifacts: kid
`whatYouLoved` is 8 (was 6), kid `workedThrough` is 4 (was 3). Parent caps
hold at 6 / 4 — the parent view stays analytical, not photo-dense. The kid
caps act as safety upper bounds, not targets; the curator includes all
eligible artifacts up to the cap.

Text content (kid vs parent voice) is still the same per-mode pattern from
the original design. Only photo placement diverges by mode.

### v1.2 — May 25, 2026 — Parent-mode tone correction

After regenerating Lincoln's April book under the previous PR's "be
analytical" instruction, parent mode read like a quarterly business review
("ambient rather than acute", "the thinness of engagement feedback",
"developmental shift worth naming"). Charter-aligned voice is analytical
AND warm, never clinical. The system prompt now lists explicit anti-patterns
and includes the rewrite test: would Shelly read this and feel like the AI
saw her son, or would she feel like she's reading a curriculum vendor's
PDF? Length was not reduced — only the voice quality.

### v1.3 — May 25, 2026 — Positive curation filter, dedup, empty-section UX

Three findings from Lincoln's March 2026 book surfaced after the v1.2 PR
shipped: an incidental car-steering-wheel photo (captured during early app
testing) ended up as the cover hero and again in "What You Loved"; the same
photo was placed in multiple sections; and photo-less sections rendered with
~60% empty white space below the body text.

**Kid-mode positive-signal filter.** Scoring stays negative-only (penalties
only). On top of scoring, kid-mode placement now requires at least one
positive signal from `hasPositiveKidModeSignal`:

- Engagement on the linked Today item is `engaged` (😊) or `okay` (😐)
- Photo is a book / sketch / Dad Lab artifact
- Photo is a scan whose AI analysis recognized curriculum content
  (tracked in `classifiedScanIds`)
- Photo is resolved-blocker evidence

A photo that fails this filter is excluded from kid-mode placement entirely
— cover, whatYouLoved, and workedThrough. Parent mode is unchanged; it still
sees workbook scans on the evidence page and treats all non-workbook photos
as eligible.

**Classified vs. unclassified scans.** A scan whose `results.subject` (or
similar analysis field) is set is now treated as classified — `isWorkbookScan`
is false and the photo can show up in kid-mode placement. An unclassified
scan remains a workbook capture and is excluded from kid-mode everywhere.

**Cross-section deduplication.** A photo placed in cover is no longer placed
again in `whatYouLoved` or `workedThrough` *within the same mode*. Tracking
is per-mode (`kidPlacedIds`, `parentPlacedIds`), so a kid hero may still
show up as parent-mode evidence on `workedThrough` and vice versa. Cover
runs first (highest precedence), then `whatYouLoved`, then `workedThrough`.
Resolved-blocker evidence is reserved for `workedThrough` — it's excluded
from `whatYouLoved` so the dedup pass doesn't consume it before the
evidence page has a chance to claim it.

**Cover hero strict allowlist.** The cover hero is now selected by
`pickHeroForMode` against a strict allowlist: book artifact, sketch
artifact, Dad Lab artifact, or classified scan. An "incidental" photo
(no creative tag, no classification) never lands on the cover; the layout
falls back to the gradient theme-word treatment from PR A.

**Empty-section rendering.** The Standard layout vertically centers its
content when there are no photos so body text doesn't float in empty
space. In parent mode, photo-less sections additionally render a soft
info-styled notice — *"No photos for this section — consider adding one
or regenerating."* — so Shelly can fix it before publishing. Kid mode
shows nothing — the section reads as a clean text page rather than
flagging a "missing" photo.

### v1.4 — May 25, 2026 — Artifact-default curation + "More from this month" gallery

Real-world testing after the v1.3 PR shipped surfaced the next failure mode:
Lincoln's April 2026 kid book had 0–1 photos per section even though the
month included multiple completed books, Dad Lab activities, and family
artifacts. Root cause: the v1.3 `hasPositiveKidModeSignal` filter required
engagement signal (😊/😐 emojis on Today items), creative-artifact tags,
or classified scans for kid-mode inclusion. In real use, engagement tagging
is not happening reliably — Shelly captures end-of-day or end-of-week, not
in-the-moment — so the positive-filter chain starves and the kid book
renders nearly photo-less.

**Policy shift: artifact-default placement.** Every photo from the
`artifacts` collection that is not a workbook scan now qualifies for
kid-mode placement, regardless of whether engagement was tagged. A photo
of a finished book, a sketch, a Dad Lab experiment, a family activity, or
Lincoln teaching London all belong in the kid book by default. The
`hasPositiveKidModeSignal` helper is **kept** but downgraded from a
gating filter to a ranking heuristic — engaged photos still sort higher
through existing score-based ordering. `assignPhotosToSections` now uses
the broader kid-mode pool (`!isWorkbookScan`) for cover / whatYouLoved /
workedThrough placement.

**Workbook scans still excluded from kid mode.** The v1.2 rule is
unchanged — `isWorkbookScan` photos never appear in kid sections, and
parent mode still surfaces them on `workedThrough` as evidence.

**New `moreFromMonth` overflow section.** Anything kid-eligible that
doesn't land in cover / whatYouLoved / workedThrough flows into a new
gallery section at the end of the kid book (after `byTheNumbers`, before
`backCover`). Cap is 20 photos. Layout is a CSS grid (≥140px columns)
with soft per-photo captions; no AI text — headline is the fixed
*"More from this month"* and the body line is *"Look at everything you
made."* The section is only added to the `pages` array when overflow
exists; when the kid book has ≤12 artifacts the section is omitted
entirely. In parent mode the renderer filters this page out so it never
appears in the parent reader.

**Cover hero allowlist widened (but still strict).** The v1.3 strict
cover allowlist (book / sketch / Dad Lab artifact OR classified scan)
now includes any non-workbook artifact via `allArtifactIds`. Workbook
scans are still excluded — `isWorkbookScan` remains the gate. The
allowlist *rule* didn't change; the *artifact pool* did.

**Data flow.** `loadPhotosForMonth` now populates `allArtifactIds`
(`Set<docId>`) covering every artifact whose type is not `Worksheet`.
`buildCurationContext` forwards it to the curation pass. `MAX_PHOTOS_PER_SECTION`
gains a `moreFromMonth: { kid: 20, parent: 0 }` entry. `SectionType`
gains a `MoreFromMonth: 'moreFromMonth'` const. Section order array in
the composer adds `moreFromMonth` after `byTheNumbers`.

**Renderer.** `MonthlyReviewPage` dispatches a new `MoreFromMonthLayout`
(grid of `MonthlyPhoto` cards, soft captions, swipe `stopPropagation`
matching the StandardLayout photo-row fix). `MonthlyReviewReader.tsx`
adds `MoreFromMonth` to `MVP_SECTION_TYPES` and filters it out when
`mode === 'parent'`.

**What did NOT change.** The system prompt is untouched (voice is
working in both modes). The 5 AI-driven sections still get AI text —
moreFromMonth is purely a photo gallery. Parent mode behavior is
unchanged. No editor work (deferred to PR E-2: "More Photos" tray +
per-photo remove).

### v1.5 — May 26, 2026 — Pre-Lincoln polish

Three small targeted changes before showing Lincoln's April book to him
(the kid it was designed for) and Shelly (who needs a heads-up that a
draft is ready) for the first time.

**Cover hero is now artifact-only.** Scans — even classified ones — no
longer qualify as cover heroes. The cover is reserved for celebration
(a photo of a finished book, a sketch, a Dad Lab moment, a family
activity); scans document evidence and belong on `workedThrough`. The
classified-scan branch was removed from `COVER_HERO_ALLOWED` in
`monthlyReviewCuration.ts`. When no artifact qualifies, `pickHeroForMode`
still returns `undefined`, `composeMonthlyReview` writes
`heroPhotoRef: null`, and `CoverLayout` renders the existing gradient +
theme word fallback unchanged.

**moreFromMonth gallery threshold lowered.** Two related changes so the
gallery actually triggers for a typical month:

- `MAX_PHOTOS_PER_SECTION.whatYouLoved.kid` lowered from 8 to 6. The
  upstream cap was absorbing nearly all kid-eligible photos, leaving
  nothing for overflow.
- New `MIN_OVERFLOW_TO_SHOW_GALLERY = 2` in `composeMonthlyReview`. The
  gallery page is only added when overflow is ≥ 2 photos — a 1-photo
  grid reads as lonely.

**DraftReadyCard on parent Today.** New
`src/features/monthly-review/DraftReadyCard.tsx` subscribes to monthly
reviews via `useMonthlyReviews`, finds the most recent `status='draft'`
review across any active child, and renders a soft card on the parent
Today page: "{Month Year} book ready for {child name}" + "A draft is
waiting for you to skim and publish." + an "Open" button that navigates
to `/progress/monthly-books/{reviewId}`. Auto-dismisses on publish — the
subscription filter handles it; no explicit dismiss state. If multiple
children have drafts, only the most recent is shown (Shelly can find the
rest from the reader → Monthly Books tab). Rendered in `TodayPage.tsx`
between Week Focus and Chapter Question Pool, wrapped in
`SectionErrorBoundary`.

**What did NOT change.** Prompt untouched. Schema untouched. No push
notifications or external delivery — the card is purely an in-app
heads-up.

### v1.6 — May 26, 2026 — Real-use bug fixes from Lincoln's first sitting

Three discrete fixes surfaced when Nathan sat with Lincoln and walked
through his April book for the first time. None are new features —
strictly fixes to bring the existing artifact to working state.

**Minutes-stored, hours-displayed.** The Stats page's "Hours by subject"
table displayed minutes with an `h` suffix (Language Arts at 154 minutes
read as "154.0h" — about 60× off). The AI prose narrates correctly in
minutes; only the table display was wrong. Convention going forward:
`MonthStats.hoursBySubject` stays in minutes — that's the native unit
from per-item `actualMinutes` accumulation and the `hours` collection's
`minutes` field. Converting at write time would lose integer precision
and force a back-migration on every existing review document. Display
layer is the right place. `MonthStats.totalHours` is the exception — it
was already stored in hours (`Math.round((totalMinutes / 60) * 10) / 10`)
and the top-of-page tile renders it correctly; no change needed there.
New `formatSubjectMinutes` helper in
`src/features/monthly-review/formatSubjectMinutes.ts` shows minutes
under 60 ("5m") and hours above with a whole-vs-decimal split ("3h",
"2.6h"). The helper lives in its own file so `MonthlyReviewPage.tsx`
stays component-only (Fast Refresh).

**Dad Lab loader counts contributions, not lifecycle.** April's "The
Bridge Test" never reached `stats.dadLabCount` because
`loadDadLabReportsInMonth` filtered by `status == "complete"`, but
families don't always advance a session past 'active' once the kid did
the work. The status filter was the wrong gate; the
`childReports[childId]` presence check (already in the loader) is the
real participation signal. Filter removed. The existing
`(status ASC, date ASC)` composite index on `dadLabReports` is no
longer required by this query but stays in `firestore.indexes.json` for
other callers — Firestore serves the new date-range-only query from its
default single-field index.

**Voice-note schema slot, no UI.** Lincoln's strongest positive signal
during the sitting was on the "More from this month" gallery: he
started talking about his work, photo by photo. Voice capture per page
is clearly the next natural addition — Lincoln has speech challenges,
and the gallery format invites narration without forcing reading.
We're not building the recording UI in this PR, but we are reserving
the schema slot so the future PR doesn't require a migration. New
`VoiceNote` type in `src/core/types/monthlyReview.ts` (id, audioUrl,
durationMs, recordedBy, recordedAt, optional transcription) and a new
optional field on `MonthlyReviewPage`:

```ts
voiceNotes?: {
  kid?: VoiceNote[]
  parent?: VoiceNote[]
}
```

When PR H lands, it will reuse the existing `useAudioRecorder` hook,
add long-press tap-to-record on the gallery, surface a "Lincoln has
notes on this page" badge in parent mode, and start surfacing voice
material in the next month's prose synthesis.

**What was deliberately not touched.** The system prompt, curation
rules, cover-hero policy, section list, and page composer all stay
unchanged. The AI prose already narrates hours correctly (it works
from raw minutes in `data.hours.minutesBySubject`); only the display
suffix was wrong. Old draft documents render under the same fix
because the unit conversion is purely at the renderer.

---

*Last updated: May 26, 2026*
