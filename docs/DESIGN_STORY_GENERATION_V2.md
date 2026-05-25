# Story Generation V2 — Design

**Status:** Design proposal, not yet built
**Author:** Design chat (Claude + Nathan), May 2026
**Decisions locked:** single-prompt entry default, review-after-not-before, review is opt-in not a gate, Story Guide wizard retired in Phase 3, prompt quality fixes ship Phase 1 standalone
**Phases in this doc:** Phase 1 (prompt quality) and Phase 2 (review chat) in detail. Phase 3 (retire Story Guide) sketched.
**Builds on:** Book Builder (`src/features/books/`), AI Chat infrastructure (`functions/src/ai/chat.ts`, `tasks/generateStory.ts`), `useTTS`, `useSpeechRecognition`, `useBookGenerator` progressive-save pattern
**Out of scope:** Image generation (working, untouched), book editor (working, untouched), manual page-by-page creation (preserved), sticker generation, scene generation in editor

---

## 1. What this is

London (6) wants to say *"make a story about a puppy who finds a rainbow"* and have a beautiful book to flip through ninety seconds later. Today he gets the Story Guide wizard — five questions, an optional AI-shaping prompt, a brief preview, and then a wait. By question three he's gone.

V2 collapses entry to a single prompt — voice or text — and moves all refinement to **after** the draft exists. The kid (or Shelly) sees a real book on the screen first. If something sounds wrong, a conversational review reads each page aloud and lets them say *"change this"* in plain language. If nothing sounds wrong, they skip the review and the book is done.

Two things change underneath: the **prompt itself** gets craft-of-writing guardrails so the first draft is closer to right, and a new **revision task** lets the AI rewrite one page at a time when the listener flags it. Everything else — image generation, the book editor, manual blank-book creation, print — stays put.

---

## 2. Why this exists

Nathan's complaints map to three concrete failures in the current system:

1. **The Story Guide wizard interrupts creative momentum.** Five questions before any visible output means a 6-year-old loses interest. The single-prompt "Generate" tab buried in the New Book dialog already works better, but it's hidden behind a tab and surrounded by a style picker and a page-count slider that London never wants to touch.

2. **The first draft has avoidable errors.** Typos, run-on sentences, awkward dialogue, stilted phrasing. The current prompt has zero guardrails for correctness and uses a hardcoded binary calibration (age ≤ 7 → "use CVC words"). Lincoln (10) gets infantilized output because his actual reading level isn't consulted.

3. **There is no review step.** Once the AI emits JSON, pages save directly to Firestore and the only fix path is the book editor — tedious manual edits, page by page, for someone with fibromyalgia.

The Charter principles in play: voice-first for London (the review chat does this naturally — listening is voice-first reading), school creates product (these books are inventory; quality matters), formation over performance (the review chat treats imperfection as collaborative, not as failure).

---

## 3. The flow (V2)

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Single-prompt   │    │   Book editor    │    │  Optional review │
│  entry screen    │ ─► │   opens with     │ ─► │  chat (TTS read- │
│                  │    │   text + images  │    │  back per page)  │
│  ┌────────────┐  │    │                  │    │                  │
│  │ Big input  │  │    │  Book is already │    │  "Sounds good" → │
│  │ Mic button │  │    │  saved and       │    │   next page      │
│  └────────────┘  │    │  flippable.      │    │                  │
│  [Make my book!] │    │                  │    │  "Change this" → │
└──────────────────┘    │  "Read it to me" │    │   AI revises +   │
                        │  button visible. │    │   re-reads       │
                        └──────────────────┘    └──────────────────┘
```

The book exists after step 2. London can stop there. Step 3 is for catching errors, not gating completion.

### 3.1 Single-prompt entry — the new "Tell a Story" screen

Replaces the 5-question wizard. Route stays `/books/story-guide` (so the Bookshelf CTA doesn't move) but the page is rewritten. One hero input, one mic button, one big button at the bottom.

```
┌─────────────────────────────────────────────┐
│  ← Bookshelf                                │
│                                             │
│        What's your story about?             │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │                                     │   │
│   │  a dragon who can't fly             │   │
│   │                                     │   │
│   └─────────────────────────────────────┘   │
│                                             │
│              [   🎤  Tap to talk  ]         │
│                                             │
│                                             │
│      [   ✨  Make my book!   ]              │
│                                             │
│      ⚙️  Change style or length             │
└─────────────────────────────────────────────┘
```

Behavioral specifics:

- **Voice input** uses the shared `useSpeechRecognition` hook (not the local re-implementation Story Guide currently has). Tap-and-talk; interim transcript shows as it arrives; transcript drops into the textarea on stop so the kid can see what was heard before generating. No required typing.
- **Style and page count are derived from the active child profile** — no picker in the default flow. London → storybook style, 6 pages. Lincoln → minecraft style, 10 pages. (Override link is below the fold for parents who want it.)
- **TTS auto-reads the prompt label** ("What's your story about?") on page load using `useTTS` so London can hear what to do.
- **Empty prompt is allowed.** Tapping "Make my book!" with no input generates with the existing fallback ("A fun story with animals and a happy ending" for London, "A fun adventure — surprise me!" for Lincoln). London can mash the button and still get a book.
- **No AI shaping step.** The optional follow-up question Story Guide does today gets removed — that's friction that doesn't earn its place when the kid hasn't seen any output yet.

### 3.2 Generation phase — unchanged structurally, improved on prompt

The progressive-save pattern in `useBookGenerator.generateBook()` stays exactly as it is: write text-only pages to Firestore first (so the book exists fast), then loop through pages illustrating each one and updating per-page. This is good architecture and Phase 2's review step also benefits from it.

The change is purely inside `buildStoryPrompt` — see §4.

### 3.3 Book editor — same as today, plus a new "Read it to me" affordance

After generation completes, navigation goes to `/books/:id` (the existing book editor) exactly as today. The book is already saved, illustrations are filling in, the kid can flip through pages.

One new element on the editor toolbar (for kid mode only, when the book was AI-generated and not yet been reviewed): a **"Read it to me 🎧"** button. Tapping it opens the review chat (§5). If the kid never taps it, the book is just done — no nag, no badge, no required step.

### 3.4 Review chat — opt-in, page-by-page, voice-driven

Detailed in §5.

---

## 4. Prompt improvements (Phase 1)

This is the smallest change with the biggest impact, and it ships standalone. No client changes. `buildStoryPrompt` in `functions/src/ai/chat.ts` gets rewritten.

### 4.1 Per-child calibration — replace the binary `isYounger` switch

Today:
```ts
const isYounger = (childAge ?? 10) <= 7
// → "Use very simple words. CVC words are great." for everyone else.
```

This is why Lincoln's stories feel infantilized. Replace with a calibration block driven by actual data:

| Input | Source | Used to set |
|---|---|---|
| `childAge` | child profile | sentence length, theme defaults |
| Sight word mastery summary | `wordMastery` context slice (already loaded, currently unused in prompt) | which words are "safe" vs "stretch" |
| Skill snapshot reading level (if available) | extend `generateStory` context slice to include `skillSnapshot.reading` | hard cap on vocabulary complexity |
| Child interests | child profile | story content seeds |

**London (age 6):**
- 1-2 short sentences per page (5-9 words each)
- Vocabulary: kindergarten level; can use 1-2 "stretch" words per story if they're in the safe-words set
- Natural dialogue tags ("said the bunny") not formal ("the rabbit exclaimed")
- Concrete nouns over abstract; sensory language welcome (soft, bright, warm)
- 6 pages

**Lincoln (age 10):**
- 2-4 sentences per page (8-14 words each)
- Vocabulary: 1st-2nd grade decoding level reading-wise, but **content** at age 10 — heroes who solve problems, real stakes, no toddler scenarios
- Action vocabulary welcome (build, craft, explore, defeat)
- Minecraft-style world (cubes, mining, crafting) where the theme is set to minecraft, but original characters per copyright rule
- 10 pages

The age-based fallback (when no skill snapshot data exists) stays, but with the corrected Lincoln calibration. The hardcoded "CVC words are great" line is deleted — it doesn't belong in a 10-year-old's prompt at all.

### 4.2 Sight word integration — drop the "MUST use every word" rule

Today:
```
WORDS TO INCLUDE (use every word at least once, common words multiple times):
{words.join(", ")}
...
- You MUST use every word from the word list at least once in the story.
```

Replace with a softer, mastery-aware injection:

```
SIGHT WORDS THE READER IS PRACTICING:
{practicing-tier words, max 5}

These are words {childName} is still working on. Try to weave 3-5 of them into
the story where they fit naturally — for example, in dialogue, as everyday
words a character would say, or in a refrain that repeats. Do NOT force every
word in. If a word doesn't fit, leave it out. Natural language matters more
than coverage.

Words {childName} has already mastered (use freely, no need to highlight):
{mastered-tier words, full set up to 30}
```

Pulling the practicing tier from `wordMastery` (filter `masteryLevel === "practicing" || === "new"`) is already supported in the data layer — `loadSightWordSummary` in `chat.ts:1872` does this work. We just wire its output into `buildStoryPrompt` and reframe the prompt.

The `wordsOnPage` array in the output JSON stays — that's used by `SightWordChip` rendering in the reader. Just becomes accurate-to-what-was-used instead of contortionist coverage.

### 4.3 Craft-of-writing guardrails — what the current prompt is missing

Add a new section to the prompt:

```
WRITING QUALITY:
- Read each page aloud in your head before writing it. If a sentence sounds
  awkward or stumbly when spoken, rewrite it.
- Use natural dialogue. Characters should talk like real people, not like
  textbook examples. Contractions are fine. "I can't fly!" not "I cannot fly!"
- Consistent character names. If the dragon is named Ember on page 1, she's
  Ember on every page. No nickname drift.
- Each page should advance the story. A page where nothing changes is filler.
- Avoid run-on sentences. Two short sentences are almost always better than
  one long one for this reader.
- No typos. No misspellings. No subject-verb disagreements.
- The ending should answer the beginning. If the dragon couldn't fly in
  page 1, the resolution involves flight (literal or metaphorical) somehow.
```

This is what good fiction editing direction looks like. Sonnet 4.6 is fully capable of this kind of work when asked for it; the current prompt simply doesn't ask.

### 4.4 Story structure — replace "beginning, middle, end" with actual beats

Today: `Each page should be a story beat — beginning, middle, happy ending.`

For a 6-page story, that's three pages of "middle" with no guidance. Replace with concrete page-beat mapping:

For **6 pages** (London):
```
PAGE BEATS:
1. Meet the hero. Show what they want or are missing.
2. The problem arrives (something the hero notices or that happens to them).
3. The hero tries something. It doesn't work, or makes things harder.
4. A helper appears, or the hero realizes something new.
5. The hero solves the problem, using what they learned.
6. The happy ending. Show how the hero (or their world) has changed.
```

For **10 pages** (Lincoln):
```
PAGE BEATS:
1. Meet the hero in their world. Show what their normal looks like.
2. Set up what they want or what's missing.
3. The challenge arrives — a quest, a danger, a discovery.
4. The hero takes the first step. Show stakes.
5. A setback. Something the hero didn't expect.
6. The hero learns something or finds an ally.
7. The hero faces the main obstacle. Tension peaks.
8. The hero overcomes — using their wits, courage, or new knowledge.
9. The resolution. What changed in the world.
10. A satisfying close. The hero is changed, the world is changed.
```

These are templates, not cages. The AI can deviate when the story demands it, but it has a structural floor that prevents the "sequence of disconnected events" problem.

### 4.5 Output format — keep JSON, add a self-check

The output JSON contract is unchanged (so `useBookGenerator` parsing stays). Add one new optional field for instrumentation:

```json
{
  "title": "...",
  "pages": [ ... ],
  "qualityNotes": "Brief note on choices made — used sight words 'we', 'go', 'see' naturally. Avoided 'play' since it didn't fit. Dragon named Ember throughout."
}
```

The note isn't shown to users. It goes into the AI usage logs and helps us debug bad output without re-running generations.

### 4.6 Model + token budget

Stay on `claude-sonnet-4-6`. Raise `maxTokens` from 4096 to 6144 — the new prompt is longer, and the qualityNotes addition uses tokens. 6144 is still well within margins for both London (6 pages) and Lincoln (10 pages).

Add `temperature: 0.7` (Sonnet default is 1.0). Slight reduction nudges toward less awkward phrasing without making output formulaic.

---

## 5. Review chat (Phase 2)

The review chat is a separate page (`/books/:id/review`) opened from the book editor's "Read it to me 🎧" button. It is opt-in. The kid (or Shelly) can leave at any time and the book stays as it was last saved — there's no concept of "exit without saving" because every revision is committed to Firestore immediately, same pattern as the editor.

### 5.1 The page

```
┌──────────────────────────────────────────────────┐
│  ← Back to my book                  Page 2 of 6  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │                                            │  │
│  │     [page illustration full width]         │  │
│  │                                            │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Ember flapped her tiny wings as hard as         │
│  she could. But she stayed on the ground.        │
│       ▲                                          │
│       │ ← word currently being read highlights   │
│                                                  │
│  [    ⏸  Pause   ]   [    🔁  Read again   ]    │
│                                                  │
│  ─────────────────────────────────────────────   │
│                                                  │
│  How does this page sound?                       │
│                                                  │
│  [  ✓ Sounds good!  ]    [  🎤  Change this  ]  │
│                                                  │
│  [        ⏭  Skip the rest, I'm done  →      ]  │
└──────────────────────────────────────────────────┘
```

### 5.2 The state machine per page

```
                  ┌─────────────────────┐
                  │  PLAYING (TTS auto- │
                  │  reads on entry)    │
                  └──────────┬──────────┘
                             │ TTS ends
                             ▼
                  ┌─────────────────────┐
                  │  AWAITING_FEEDBACK  │
                  └──────────┬──────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       [Sounds good!]  [Change this 🎤]  [Skip ⏭]
              │              │              │
              │              ▼              │
              │       ┌────────────┐        │
              │       │ RECORDING  │        │
              │       └─────┬──────┘        │
              │             │ stop          │
              │             ▼               │
              │       ┌────────────┐        │
              │       │ REVISING   │        │
              │       │ (AI call)  │        │
              │       └─────┬──────┘        │
              │             │ done          │
              │             ▼               │
              │       ┌────────────┐        │
              │       │ PLAYING    │ ◄──────┘
              │       │ (revised)  │
              │       └─────┬──────┘
              │             │ TTS ends
              │             ▼
              │       (loop back to AWAITING_FEEDBACK)
              ▼
       ┌─────────────┐
       │  NEXT PAGE  │   ← advances; if last page, COMMIT
       └─────────────┘
```

### 5.3 The revision task

A new chat task: `revisePage`. Sonnet 4.6. The request payload:

```ts
{
  bookId: string
  pageNumber: number
  currentText: string          // what's on the page now
  currentSceneDescription: string
  feedback: string             // what the listener said (transcribed)
  fullStoryContext: {          // so revisions stay consistent with the rest
    title: string
    allPages: Array<{ pageNumber: number; text: string }>
    characterNames: string[]   // extracted from current text
  }
  childCalibration: {          // same calibration as generateStory
    childAge: number
    sentenceTarget: string
    vocabularyLevel: string
  }
}
```

The system prompt:

```
You are revising one page of a children's book based on listener feedback.

The full story is provided so your revision stays consistent with characters,
tone, and pacing on other pages.

LISTENER FEEDBACK: "{feedback}"

YOUR TASK:
- Apply the feedback to PAGE {pageNumber} only.
- Keep other pages untouched.
- Keep character names consistent with the rest of the story.
- Keep the page's role in the story (its beat) — if it was the climax, the
  revised page should still feel like the climax.
- If the feedback is about a typo, grammar, or phrasing, fix it and don't
  rewrite the whole page.
- If the feedback is "I don't like this page" or similar, write a fresh
  version that fits the surrounding pages.
- If the feedback is unclear, make your best interpretation and note it
  in qualityNotes.

DECIDE: does the scene need a new illustration?
- "yes" if the feedback meaningfully changes the visual scene (new character,
  different location, the dragon becomes a knight, etc.)
- "no" if it's only a text fix (typo, phrasing, dialogue rewrite that doesn't
  change what's in the picture)

OUTPUT JSON:
{
  "newText": "...",
  "newSceneDescription": "...",
  "wordsOnPage": [...],
  "regenerateImage": "yes" | "no",
  "qualityNotes": "..."
}
```

Notes on this:

- **Full story context is included** so the AI doesn't lose track of who Ember is when revising page 4. Token cost is small — the whole story is at most ~600 tokens.
- **`regenerateImage` is a model decision, not a UI decision.** The AI sees both the old scene description and the new one; it's positioned to know whether the visual changed. The client respects this signal — calls `generateImage()` only when it's "yes".
- **Image regen for a flagged page uses the existing `generateImage` flow.** No changes to image generation per the locked decision.
- **Word coverage is updated** so `SightWordChip` rendering stays accurate.

### 5.4 Voice input for feedback

Uses `useSpeechRecognition` exactly like the entry screen. Two-step:

1. Kid taps "Change this 🎤" → recording starts (visual indicator: pulsing mic).
2. Kid speaks ("make the dragon a girl named Sparkle"), then taps "Done" or stops talking for ~2 seconds.
3. Transcript appears. The kid sees what was heard: *"You said: 'make the dragon a girl named Sparkle.' Is that right?"* with **[Yes, fix it]** and **[Try again]** buttons.
4. On confirm, the AI revision runs.

The read-back confirmation is critical for London — speech recognition mishears, and a 6-year-old won't catch it on his own. The text appears alongside a TTS playback of the transcript so he can hear it spoken back.

### 5.5 Resumability

Two scenarios to handle:

- **Kid abandons mid-review** (closes the app, taps Bookshelf, etc.) — the book is already in Firestore; any revisions made so far are persisted. Re-opening "Read it to me" resumes at the first un-reviewed page. A small `reviewState` field on the book doc tracks which pages have been heard + approved.
- **Kid taps "Skip the rest"** — the remaining pages stay as they were. `reviewState` records completion. The "Read it to me" button no longer appears on the book toolbar.

The book's `reviewState` shape:

```ts
{
  reviewedPages: number[]      // pages the kid said "sounds good" on
  revisedPages: number[]       // pages that went through a revision
  completedAt?: string         // ISO timestamp when fully reviewed or skipped
}
```

### 5.6 What the review chat is NOT

It is not a generative chat. The kid can't say "add another character" or "make it longer" — that would let a 6-year-old turn a 6-page book into a 14-page book with one sentence, which is friction in the wrong direction. The review chat operates strictly within the existing page count. Adding pages, removing pages, or major structural change happens in the editor (where Shelly can do it deliberately), not the review chat.

It is also not mandatory. The book is complete after generation. The review chat is the polish step that catches what TTS exposes by reading the story aloud — typos sound wrong, awkward phrasing stumbles when spoken, inconsistent names jar. Letting the kid listen and react is the natural surface for those errors.

---

## 6. What happens to Story Guide

### 6.1 Phase 1 — no change to Story Guide

Phase 1 ships prompt improvements only. The Story Guide wizard keeps working exactly as it does today. The `/books/story-guide` route still goes to the 5-question wizard. The wizard benefits from the prompt improvements automatically because it routes through the same `generateBook` → `generateStory` task.

### 6.2 Phase 2 — Story Guide still functional but de-emphasized

When the review chat ships, the Bookshelf CTA stays labeled "Tell a Story" and still routes to `/books/story-guide`. But the wizard page is rewritten to be the new single-prompt entry described in §3.1. The 5-question flow is removed in this same change.

Why merge wizard removal into Phase 2 instead of a clean Phase 3: the wizard exists *because* there was no review step. Its purpose was to get enough information up front for a good single-shot generation. Once we have a review step, that purpose evaporates. Removing both pieces in the same release is cleaner than carrying the wizard through one more cycle.

This means Phase 3 in the original prompt collapses into Phase 2. The new phasing is:

- **Phase 1:** Prompt improvements (server-side only)
- **Phase 2:** Review chat + replace Story Guide wizard with single-prompt entry
- **Phase 3 (sketched):** Polish — TTS voice picker, save-as-template for story prompts, sharing/printing review-approved books.

### 6.3 What gets deleted in Phase 2

- `src/features/books/useStoryGuide.ts` — the hook with `LINCOLN_QUESTIONS` and `LONDON_QUESTIONS`. Replaced by a much smaller hook for the single-prompt page.
- `src/features/books/StoryGuideQuestion.tsx` — the per-question UI component.
- The 5-question section of `StoryGuidePage.tsx` — wizard step states (`questions`, `questions-done`, `ai-shaping`).
- The AI shaping chat call (Story Guide line 87-93). The `chat` task remains used elsewhere; only this specific call is removed.
- Test file `src/features/books/__tests__/storyGuide.test.ts` — replaced with tests for the new entry hook.

What stays:
- The route name `/books/story-guide` (just renders different content).
- The CTA name "Tell a Story 🎮/✨" on the Bookshelf.
- The sight word loading (`getWeakWords` from `useSightWordProgress`) — moves into the new entry hook.

### 6.4 What about the AI-shaping step?

It goes away entirely. Its job was to nudge the kid for one more detail before generation. With review-after-generation, that nudge is replaced by *seeing the actual book* and saying "make this part different." That's a strictly better signal — concrete, not hypothetical.

---

## 7. What can be reused from existing code

| Existing | Used in V2 | Notes |
|---|---|---|
| `useTTS` (`src/core/hooks/useTTS.ts`) | Single-prompt entry, review chat | Full reuse. Story Guide's local `speakText` is deleted. |
| `useSpeechRecognition` (`src/core/hooks/useSpeechRecognition.ts`) | Single-prompt entry, review chat feedback | Full reuse. Story Guide's local Web Speech API code is deleted. |
| `useAudioRecorder` | Available as a fallback | Not directly used — `useSpeechRecognition` handles all voice input. Listed for completeness. |
| `useBookGenerator.generateBook()` | Phase 1 (unchanged), Phase 2 (unchanged structure) | The progressive save → illustrate loop is exactly what we want. |
| `useAI.chat()` | New `revisePage` task | Existing call infrastructure. Just add the new TaskType. |
| `useAI.generateImage()` | Review chat image regen | Existing. Called when `regenerateImage === "yes"`. |
| Book editor (`BookEditorPage.tsx`) | Unchanged | One new button added to the toolbar for AI-generated books not yet reviewed. |
| `GenerationProgress.tsx` | Unchanged | Same progress UI during the initial generation. |
| `useSightWordProgress.getWeakWords()` | Single-prompt entry | Word injection moves out of Story Guide into the entry hook. |
| `loadSightWordSummary` (`chat.ts`) | Wired into `buildStoryPrompt` | Already loads mastery tiers; just needs to be referenced in the prompt. |
| `inferBookTheme` | Unchanged | Theme inference from story idea text still runs. |

What's new in code:

- `functions/src/ai/tasks/revisePage.ts` — new task handler.
- `revisePage` added to `TaskType` const + `modelForTask` → Sonnet.
- `revisePage` added to `contextSlices.ts` → `["childProfile", "sightWords", "wordMastery"]` (same as `generateStory`).
- `src/features/books/BookReviewChat.tsx` — new component, full-screen page.
- `src/features/books/useBookReview.ts` — new hook driving the state machine.
- `src/features/books/SinglePromptEntry.tsx` — replaces wizard.
- Route `/books/:id/review` added.
- `Book` type gets a `reviewState` optional field.

---

## 8. Phased build

### Phase 1 — Prompt quality (server-only, ~1 day of work)

Scope:
- Rewrite `buildStoryPrompt` per §4.
- Wire `loadSightWordSummary` output into the prompt.
- Add `skillSnapshot` to `generateStory`'s context slices and use reading level when available.
- Bump `maxTokens` to 6144, set `temperature` to 0.7.
- Update or add unit tests covering: vocabulary calibration for both kids, sight word weaving with the new "weave 3-5 naturally" rule, copyright character substitution still working, JSON output shape (existing parser must continue to work unchanged).
- No client changes.

Acceptance:
- A Lincoln story no longer uses "CVC words" phrasing for content. Sentences are 8-14 words. Characters have stakes.
- A London story uses no more than 5 practicing-tier sight words, weaves them in dialogue or repetition, and never feels stuffed.
- Character names stay consistent across pages.
- A blind read-aloud test with Shelly produces zero typos and < 1 awkward sentence per 6-page London book.

Risk: low. Server-only change, no schema migration, parser unchanged.

### Phase 2 — Review chat + single-prompt entry (~3-5 days)

Scope:
- New `revisePage` task with system prompt per §5.3.
- New `BookReviewChat.tsx` page driven by `useBookReview` hook (state machine per §5.2).
- Single-prompt entry page replacing the wizard (per §3.1) — same route.
- Book editor toolbar gets the "Read it to me 🎧" button (only visible for AI-generated books with no `reviewState.completedAt`).
- `Book` type extended with `reviewState`.
- Tests: state machine transitions, abandon/resume, image-regen-on-scene-change, voice transcript read-back confirmation, "Skip the rest" path.
- Delete: `useStoryGuide`, `StoryGuideQuestion`, wizard sections of `StoryGuidePage`, `storyGuide.test.ts`.

Acceptance:
- London can finish a book without ever opening the review chat (the chat is genuinely optional).
- The "Read it to me" button reads each page aloud, accepts "Sounds good" / "Change this" / "Skip" by voice OR tap.
- Voice feedback is read back before being acted on.
- A revision call on page 4 doesn't break pages 1-3 or 5-6 — character names stay stable.
- Image regen fires only when scene description meaningfully changes (verifiable in logs).
- Closing the app mid-review and returning later resumes correctly.

Risk: medium. New task, new state machine, new page. Mitigations: the progressive-save pattern from `useBookGenerator` handles the persistence cleanly, and `useTTS`/`useSpeechRecognition` are battle-tested from Workshop.

### Phase 3 — Polish (sketched only, not committed)

Candidates:
- Per-child TTS voice picker (Lincoln might want a different voice than the default Samantha).
- "Save this prompt as a template" — Shelly can save reusable starts ("a story about Lincoln teaching London something").
- Print/share button on review-approved books surfacing differently than unreviewed ones (review approval = "ready to print").
- Optional Shelly approval step before kid books print as physical inventory.

These ship as small standalone PRs after Phase 2 stabilizes.

---

## 9. Open questions and decisions still to make

These don't block Phase 1 but will need answers before Phase 2 lands:

1. **Should "Read it to me" auto-open after generation, or wait for an explicit tap?** Current proposal: explicit tap only. Auto-open contradicts "review is opt-in, not a gate." But Shelly might want it auto-open for her own workflow — needs a quick test.
2. **What happens if the AI's revision is also bad?** Current proposal: the kid loops back to AWAITING_FEEDBACK on the same page and can say "Change this" again. We cap at ~3 revision attempts per page; after 3, suggest opening the book editor manually. Need to validate the cap with Shelly.
3. **Can Shelly trigger the review chat on a book the kid already approved?** Useful when she catches an error post-hoc. Current proposal: yes, parent profile sees the button even after `reviewState.completedAt` is set; kid profile doesn't. Confirms with parent-vs-kid render guard already in book editor.
4. **Voice selection for TTS** — Samantha is currently default. For Lincoln's gaming context, a deeper / different voice might fit better. Defer to Phase 3 unless feedback says otherwise.
5. **The "Make my book!" button while no input is given** — generates with the fallback prompt. Does this need a separate "Surprise me!" button to signal that's a valid path, or is the empty-and-tap behavior discoverable enough? Lean: keep one button, document the empty-tap behavior in the parent help.

---

## 10. Documentation updates required

When Phase 1 ships:
- `docs/SYSTEM_PROMPTS.md` — replace the `generateStory` section's "Input/Output" block with the new prompt structure (per-child calibration, soft sight-word rule, story beats, quality guardrails).
- `docs/MASTER_OUTLINE.md` — add a changelog entry to the table for Phase 1.

When Phase 2 ships:
- `docs/MASTER_OUTLINE.md` — update navigation/route list (new `/books/:id/review`), add changelog entry, update the "What's Built" section under My Books to reflect the new flow.
- `docs/SYSTEM_PROMPTS.md` — add the new `revisePage` task and update the `chat` task isolation notes (Story Guide's `chat` call goes away).
- `docs/DOCUMENT_INDEX.md` — add an entry pointing to this design doc and a back-pointer from this doc to the implementation PRs.

Cross-references this doc lives alongside:
- `docs/DESIGN_MONTHLY_REVIEW_BOOK.md` — sibling design doc for the parent-facing monthly book. Same Book Builder substrate, different generation path.
- `docs/barnes-story-game-workshop-design.md` — sibling for the Workshop flow which also uses `useTTS` and `useSpeechRecognition`. Reuse patterns confirmed there.
- `CLAUDE.md` — repo coding conventions; the new task and components follow these (no enums, `import type`, Firestore id-after-spread, etc.).
