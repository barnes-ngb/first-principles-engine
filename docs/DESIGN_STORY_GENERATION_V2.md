# Story Generation V2 — Design

**Status:** Design proposal, not yet built
**Author:** Design chat (Claude + Nathan), May 2026
**Decisions locked:** chat-based entry inside "+ New Book" dialog (Path A primary), two review surfaces (Generate Chat + Per-Page Review), Per-Page Review auto-opens for kid-generated books (Paths A/B) and is on-demand for Shelly-authored books (Path C), Story Guide wizard buried as fallback (not deleted), prompt quality fixes ship Phase 1 standalone
**Phases in this doc:** Phase 1 (prompt quality) and Phase 2 (Generate Chat + Per-Page Review + dialog rewire) in detail. Phase 3 (polish) sketched.
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

V2 is not one flow but **three**, all landing in the same destination — a real book in the editor with an optional review chat. The diagram above is the canonical Path A (kid single-prompt entry); Paths B and C share the same downstream surface but enter generation from different starting contexts. See §3.6 for the prose definitions of each path and §3.5 for the full inventory of which UI entry points map to which path.

The book exists after step 2 in every path. London (or Shelly) can stop there. Step 3 is for catching errors, not gating completion.

### 3.1 Primary entry — "+ New Book" dialog with chat-based Generate

V2's primary entry is NOT a dedicated page. The entry consolidates around the existing "+ New Book" dialog with four concrete changes:

- **The "+ New Book" button relocates to the TOP of the Bookshelf grid.** Today it sits at the bottom of the grid; for families with many books (Lincoln has 32) this requires scrolling. Moving it to the top makes generation the first thing visible.
- **The dialog opens by default to the "Generate a Book" tab.** Currently the "Blank Book" tab is the default; flipping this surfaces generation as the primary intent.
- **The "Use Story Guide (guided questions)" button stays at the top of the Generate tab but is restyled as a secondary/text button** — a buried fallback path for kids who prefer the structured questions. The wizard itself is unchanged (see §6.2).
- **The Generate tab body is rewritten as a CHAT surface, not a form.** The current "What's your story about? / Words to include / Illustration style chips / Pages slider" form fields are replaced with:
  - A scrolling chat thread showing alternating kid + AI turns
  - A composer at the bottom: text input + mic button + send button
  - An illustration-style icon strip immediately below the composer (Minecraft / Garden Battle / Storybook / Platformer / Comic / Realistic). Tappable to change style mid-conversation. Default derived from active child profile (London → Storybook; Lincoln → Minecraft).
  - Page count is derived from active child profile (London: 6, Lincoln: 10). Override is buried (Shelly path).

The "Tell a Story 🎮/✨" Bookshelf CTA is REMOVED in Phase 2. Its job is absorbed by the relocated "+ New Book" button being prominent at the top of the grid.

```
┌────────────────────────────────────────────────┐
│  ✕                Craft a New Book              │
│  ┌──────────────┐ ┌────────────────────────┐   │
│  │  Blank Book  │ │  Generate a Book  ✓    │   │
│  └──────────────┘ └────────────────────────┘   │
│                                                │
│  Use Story Guide (guided questions)  ← buried  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ You: a minecraft adventure with a cat    │  │
│  │      and a dragon                        │  │
│  │                                          │  │
│  │ AI:  Here's your story! (reading...)     │  │
│  │      Page 1: Marco the cat found a...    │  │
│  │      Page 2: He climbed a tall block...  │  │
│  │      ▶ Tap to hear it                    │  │
│  │                                          │  │
│  │ You: make the dragon a girl named        │  │
│  │      Sparkle                             │  │
│  │                                          │  │
│  │ AI:  Fixed! Here's page 3 now...         │  │
│  │      ▶ Tap to hear it                    │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  [ Type or tap mic 🎤 ]            [ Send ]    │
│                                                │
│  Style: 🟦Minecraft 🌸Garden 📖Storybook       │
│         🎮Platformer 💥Comic   📷Realistic     │
│                                                │
│  [    ✓  I like the whole story!    ]          │
└────────────────────────────────────────────────┘
```

**Note on grid-position gut-check.** Shelly may have a different preference for the "+ New Book" relocation. Bookshelf grids commonly grow downward with the add affordance at the end; pinning it to top as the first grid item is a deliberate departure. If Shelly pushes back on this after testing, an alternative is a separate top-bar button outside the grid rather than a grid item. Flagged in §9 question 7.

### 3.2 Generation phase — unchanged structurally, improved on prompt

The progressive-save pattern in `useBookGenerator.generateBook()` stays exactly as it is: write text-only pages to Firestore first (so the book exists fast), then loop through pages illustrating each one and updating per-page. This is good architecture and Phase 2's review step also benefits from it.

The change is purely inside `buildStoryPrompt` — see §4.

### 3.3 Book editor — same as today, plus a new "Read it to me" affordance

After generation completes, navigation goes to `/books/:id` (the existing book editor) exactly as today. The book is already saved, illustrations are filling in, the kid can flip through pages.

Auto-open behavior for the per-page review:

- For books generated by the kid via **Path A** (chat-based Generate), the per-page review opens AUTOMATICALLY after the kid says "I like the whole story" in the Generate Chat. The book editor sees the book with `reviewState` already in flight.
- For books generated by **Shelly** (or imported from Path C), the per-page review does NOT auto-open. The **"Read it to me 🎧"** button on the editor toolbar remains available for on-demand review.
- **Shelly can trigger the per-page review at any time, including on a book the kid has already approved (parent post-hoc review — §9 Q3).** The button surfaces on the parent profile view regardless of `reviewState.completedAt`.

### 3.4 Two review surfaces — Generate Chat then Per-Page Review

The review experience splits into two distinct surfaces, both detailed in §5:

- **§5.A — The Generate Chat** (NEW): a conversational draft + revise loop that operates on the whole story before any per-page work begins. Lives inside the "+ New Book" dialog. This is where most kid revision happens.
- **§5.B — The Per-Page Review**: page-by-page TTS read-aloud + voice/manual revision. Auto-opens after the kid approves the whole story in the Generate Chat; remains optional/on-demand for Shelly's flows and for parent post-hoc review.

### 3.5 Inventory of generation entry points and their V2 disposition

The current app has three distinct generation systems and six-plus contextual entry points scattered across the bookshelf, the sight word dashboard, the word wall, evaluation surfaces, and the quest summary. The original framing of "the wizard" as the single AI entry was incomplete. This table is the source of truth — when in doubt about where any "create a story" surface should land in V2, consult it before writing code.

| Current entry (file:line ref) | What it does today | V2 disposition |
|---|---|---|
| "Tell a Story 🎮/✨" button on Bookshelf (BookshelfPage.tsx:347, 966) → /books/story-guide → StoryGuidePage 5-question wizard → useBookGenerator | Kid-facing wizard, full text + DALL-E illustration | Bookshelf CTA REMOVED in Phase 2. /books/story-guide route kept for the buried-wizard fallback; the wizard remains accessible only from inside the "+ New Book" dialog (see §6.2). |
| "+ New Book" dialog "Generate" tab (BookshelfPage.tsx dialog) → useBookGenerator | Adult form: textarea + words + style picker + page count slider | Generate tab is the new primary entry. Form fields replaced with chat surface. Style chips become inline icon strip below composer. Dialog defaults to this tab (currently defaults to "Blank Book"). Dialog button relocates to top of Bookshelf grid. |
| "+ New Book" dialog "Use Story Guide (guided questions)" secondary button (BookshelfPage.tsx, top of Generate tab) | Routes to /books/story-guide wizard | RETAINED as buried fallback for kids who prefer the guided questions. Restyled as secondary/text button. Same wizard, same route. |
| "Create Targeted Story" button (EvaluationBookBanner.tsx:73, in Suggested for X card) → /books/create-story with prefillWords + source='evaluation' | Routes to CreateSightWordBook with weak words pre-filled; user still completes the multi-field form | CHANGES in Phase 2. Becomes truly one-tap: button generates immediately using pre-fetched weak words + child defaults, bypassing CreateSightWordBook entirely. Goes straight to book editor. Review chat available after. |
| "Create Sight Word Story" button on Bookshelf (BookshelfPage.tsx:402) → /books/create-story (no prefill) | Routes to CreateSightWordBook with empty state | KEPT in Phase 2. Remains the named entry to Shelly's manual builder for deliberate tutoring sessions. |
| "Create Sight Word Story" on Sight Word Dashboard (SightWordDashboard.tsx:119) → /books/create-story | Same as above | KEPT. |
| Sight Word Dashboard struggling-word chips (SightWordDashboard.tsx:65) → /books/create-story?words=... | Routes with URL params | CHANGES in Phase 2. Becomes one-tap targeted story (same behavior as "Create Targeted Story"). |
| EvaluationHistoryTab.tsx:207 — link from struggling-word patterns | Routes to CreateSightWordBook with prefillWords | CHANGES in Phase 2. One-tap targeted story. |
| QuestSummary.tsx:421 — link after a quest with struggling words | Routes to CreateSightWordBook with prefillWords | CHANGES in Phase 2. One-tap targeted story. |
| WordWall.tsx:71, 93 — two links from word progress | Routes to CreateSightWordBook with prefillWords | CHANGES in Phase 2. One-tap targeted story. |

### 3.6 The three V2 generation paths

**Path A — Chat-based Generate** (inside the "+ New Book" dialog). Primary kid path. The dialog opens to the Generate tab as default; the surface is a chat thread, not a form. Kid types or speaks an idea ("a Minecraft adventure with a cat and a dragon"). AI generates a full draft (text + scene descriptions for each page via useBookGenerator). AI reads the whole draft back aloud via useTTS. Kid responds — voice OR text — with revisions, additions, or approval. AI revises using the full chat history as context (important for Lincoln, whose STT mishears him; reading back lets errors surface, manual text edit remains available as a fallback). No hard revision cap — the loop continues until the kid says "I like the whole story." At that point, Path A hands off to §5.B (per-page review). Style icons below the composer let the kid change illustration style mid-conversation. Page count is derived from active child profile (London 6, Lincoln 10) and not exposed in the default flow.

**Path B — One-tap targeted story** (NEW). Any contextual surface suggesting "make a story about these specific words" — Suggested for X card, Word Wall struggling-word chips, Quest summary post-quest links, EvaluationHistory links — triggers this path. No form. Pre-fetched weak words (already known to the caller, since these surfaces know which words are struggling) plus child theme defaults. Lands in the same Generate Chat surface with the weak words preloaded as context (the AI sees them and weaves them naturally); kid continues from there as if they'd started Path A.

**Path C — Shelly's manual builder** (retained, unchanged structurally).
Lives at /books/create-story → CreateSightWordBook. Chips for Dolch Pre-Primer, Dolch Primer, London's Starter Words, "Words needing work", sample story. Theme field, page count slider, text-only preview-and-edit step, then publish. For deliberate tutoring sessions where Shelly wants exact control. The text-only preview within this page already functions as a review surface; the post-publish review chat is still available as a TTS read-back layer if Shelly wants it.

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

## 5. The two review surfaces (Phase 2)

Review happens in two distinct surfaces with different jobs:

- **§5.A — Generate Chat:** a conversational whole-story drafting and revision loop. Operates on the whole story at once. Lives inside the "+ New Book" dialog. This is where most kid revision happens, before any per-page work.
- **§5.B — Per-Page Review:** page-by-page TTS read-aloud with voice or manual revision. Auto-opens after the kid approves the whole story in the Generate Chat. Remains available on-demand from the book editor toolbar for Shelly-authored books and parent post-hoc review.

### 5.A The Generate Chat (Path A primary surface)

The Generate Chat lives inside the "+ New Book" dialog's Generate tab. It is a multi-turn chat that produces a complete first draft and then iteratively refines it via natural conversation, all in one surface. Once the kid says "I like the whole story", the dialog closes, the book commits to the editor, and the Per-Page Review (§5.B) opens automatically for kid-generated books.

#### 5.A.1 The chat thread

Each turn alternates kid/AI:

- **Kid (turn 1):** types or speaks an idea ("a Minecraft adventure with a cat and a dragon").
- **AI:** generates a full draft via useBookGenerator and posts each page text into the chat thread as a sequence of AI messages. Then posts a closing message: "I read it to you?" with a TTS auto-play control.
- **Kid:** responds via voice or text. Possible intents:
  - "I like it!" → commits the book and transitions to §5.B
  - "Change [X]" → AI revises the affected pages, posts the diff or the updated pages into the thread
  - "Add a part where [Y]" → AI weaves it in, may extend pages
  - "Make it scarier / funnier / about [Z] instead" → AI rewrites affected pages
- **AI:** revises using FULL CHAT HISTORY plus the current story state as context. Repeats the read-back. Loops.

No hard revision cap — the loop continues until the kid approves. Empty/silent state after several minutes saves a draft (resumable behavior detailed in §5.A.4).

#### 5.A.2 Visual layout

```
┌────────────────────────────────────────────────┐
│  ✕                Craft a New Book              │
│  ┌──────────────┐ ┌────────────────────────┐   │
│  │  Blank Book  │ │  Generate a Book  ✓    │   │
│  └──────────────┘ └────────────────────────┘   │
│                                                │
│  Use Story Guide (guided questions)  ← buried  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ You: a minecraft adventure with a cat    │  │
│  │      and a dragon                        │  │
│  │                                          │  │
│  │ AI:  Here's your story! (reading...)     │  │
│  │      Page 1: Marco the cat found a...    │  │
│  │      Page 2: He climbed a tall block...  │  │
│  │      ▶ Tap to hear it                    │  │
│  │                                          │  │
│  │ You: make the dragon a girl named        │  │
│  │      Sparkle                             │  │
│  │                                          │  │
│  │ AI:  Fixed! Here's page 3 now...         │  │
│  │      ▶ Tap to hear it                    │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  [ Type or tap mic 🎤 ]            [ Send ]    │
│                                                │
│  Style: 🟦Minecraft 🌸Garden 📖Storybook       │
│         🎮Platformer 💥Comic   📷Realistic     │
│                                                │
│  [    ✓  I like the whole story!    ]          │
└────────────────────────────────────────────────┘
```

#### 5.A.3 The whole-story revision task

A new chat task: `reviseStory` (distinct from the per-page `revisePage` task in §5.B.3). Sonnet 4.6. Request payload:

```ts
{
  chatHistory: Array<{ role: "kid" | "ai"; content: string }>
  currentStory: {
    title: string
    pages: Array<{ pageNumber, text, sceneDescription, wordsOnPage }>
  }
  childCalibration: {
    childAge, childName, illustrationStyle, pageCount
  }
  newFeedback: string  // the kid's latest message, transcribed
}
```

System prompt instructions:

- Use the full chat history to understand the kid's evolving vision.
- Apply the latest feedback to whichever pages it touches; leave unrelated pages alone.
- Keep character names and tone consistent across pages.
- If the feedback meaningfully changes the visual scene for any page, mark that page's `regenerateImage: true`.
- Return the full updated story (all pages) so the diff against the current state is unambiguous. Also return a brief `humanResponse` ("Okay, I made the dragon into Sparkle — listen!") that gets posted as the AI's next chat turn before the read-back.
- If the kid's message is conversational, not a revision request ("haha that's cool", "what's a dragon?"), respond conversationally in `humanResponse` and leave `currentStory` unchanged (`storyUpdated: false`).

Output JSON:

```json
{
  "humanResponse": "Okay, I fixed it!",
  "storyUpdated": true,
  "updatedStory": { "title": "...", "pages": [] },
  "pagesNeedingImageRegen": [3, 5]
}
```

#### 5.A.4 Resumability

Draft books are saved progressively (same pattern as useBookGenerator today). If the kid closes the dialog mid-conversation, the book sits in Firestore with `reviewState.generateChatState: "in-progress"` and the chat history persisted. Re-opening the book offers "Continue making your story" instead of opening the editor. Closing without ever generating (no AI turn yet) discards the draft.

Voice transcription read-back applies to the kid's messages too: when the kid speaks, the transcript appears alongside a "Did I hear you right?" affordance before the message is sent to the AI. This addresses Lincoln's STT mishearing issue raised in §9 Q2.

### 5.B The Per-Page Review

The per-page review opens automatically after the kid approves the whole story in the Generate Chat (Path A), and is available on-demand from the book editor's "Read it to me 🎧" button for any book. The kid (or Shelly) can leave at any time and the book stays as it was last saved — there's no concept of "exit without saving" because every revision is committed to Firestore immediately, same pattern as the editor.

#### 5.B.1 The page

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

#### 5.B.2 The state machine per page

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

#### 5.B.3 The revision task

This is the surgical-revision task used during per-page review. The whole-story revision task used during the Generate Chat is documented in §5.A.3.

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

#### 5.B.4 Voice input for feedback

Uses `useSpeechRecognition` exactly like the entry screen. Two-step:

1. Kid taps "Change this 🎤" → recording starts (visual indicator: pulsing mic).
2. Kid speaks ("make the dragon a girl named Sparkle"), then taps "Done" or stops talking for ~2 seconds.
3. Transcript appears. The kid sees what was heard: *"You said: 'make the dragon a girl named Sparkle.' Is that right?"* with **[Yes, fix it]** and **[Try again]** buttons.
4. On confirm, the AI revision runs.

The read-back confirmation is critical for London — speech recognition mishears, and a 6-year-old won't catch it on his own. The text appears alongside a TTS playback of the transcript so he can hear it spoken back.

#### 5.B.5 Resumability

Per-page review can be resumed mid-flow regardless of whether the book originated from Path A (kid-generated, auto-opened review) or Path B/C (Shelly triggered on-demand). Two scenarios to handle:

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

#### 5.B.6 What the review chat is NOT

It is not a generative chat. The kid can't say "add another character" or "make it longer" — that would let a 6-year-old turn a 6-page book into a 14-page book with one sentence, which is friction in the wrong direction. The review chat operates strictly within the existing page count. Adding pages, removing pages, or major structural change happens in the editor (where Shelly can do it deliberately), not the review chat.

It is also not mandatory. The book is complete after generation. The review chat is the polish step that catches what TTS exposes by reading the story aloud — typos sound wrong, awkward phrasing stumbles when spoken, inconsistent names jar. Letting the kid listen and react is the natural surface for those errors.

---

## 6. What happens to existing generation surfaces

Phase 2 is broader than retiring the wizard. Per the inventory in §3.5, the work spans all three generation paths and the six-plus entry points that feed them. This section captures the disposition for each, with one important non-change: CreateSightWordBook (Path C) is retained without structural change — only its post-publish flow gains the review chat affordance. The six-plus entry points to /books/create-story split in V2 by intent: contextual suggestion entries (those that already have weak words / prefillWords in context) become Path B and bypass the form; the explicit "Create Sight Word Story" button entries remain wired to Path C so Shelly's deliberate tutoring workflow doesn't regress.

### 6.1 Phase 1 — no change to Story Guide

Phase 1 ships prompt improvements only. The Story Guide wizard keeps working exactly as it does today. The `/books/story-guide` route still goes to the 5-question wizard. The wizard benefits from the prompt improvements automatically because it routes through the same `generateBook` → `generateStory` task.

### 6.2 Phase 2 — Story Guide wizard buried, not removed

Original plan was to delete the wizard entirely in Phase 2. New direction: keep it as a buried fallback. Some kids may prefer the guided questions; even though Lincoln doesn't, removing the path entirely closes the option.

In Phase 2:

- The Bookshelf "Tell a Story 🎮/✨" CTA is removed.
- The `/books/story-guide` route is retained.
- The wizard is accessible only via a secondary/text button at the top of the "+ New Book" dialog's Generate tab ("Use Story Guide (guided questions)").
- No code in `useStoryGuide`, `StoryGuideQuestion`, or `StoryGuidePage` is removed. They keep working as today, just from a less prominent entry.

The phasing is:

- **Phase 1:** Prompt improvements (server-side only)
- **Phase 2:** Generate Chat + Per-Page Review + "+ New Book" dialog rewire (wizard kept as buried fallback)
- **Phase 3 (sketched):** Polish — TTS voice picker, save-as-template for story prompts, sharing/printing review-approved books.

### 6.3 What gets deleted in Phase 2

Less than originally planned. Specifically:

- The "Tell a Story 🎮/✨" button on `BookshelfPage.tsx` (lines 347 and 966 — both kid-themed renderings).
- The current "Generate a Book" form-based tab body in BookshelfPage dialog (replaced with the new Generate Chat surface — see §5.A).
- The "AI shaping" optional step inside `StoryGuidePage` (lines 87-93) — this nudge-for-more-detail step is redundant once the Generate Chat exists. The wizard's 5 questions remain; only the post-questions shaping step is removed.

What stays:

- `useStoryGuide`, `StoryGuideQuestion`, `StoryGuidePage` — the wizard itself. Accessed only from the buried button in the dialog.
- The `/books/story-guide` route.
- The CTA name "Tell a Story" is repurposed as the secondary button label inside the dialog ("Use Story Guide (guided questions)").
- All sight-word loading logic (`useSightWordProgress.getWeakWords`) — moves into the Generate Chat's preflight context.

### 6.4 What about the AI-shaping step?

It goes away entirely. Its job was to nudge the kid for one more detail before generation. With review-after-generation, that nudge is replaced by *seeing the actual book* and saying "make this part different." That's a strictly better signal — concrete, not hypothetical.

### 6.5 Existing books with copyright issues

A book titled "Link's Brave Mine..." (the Zelda-derived character that prompted the Phase 1 prompt fix) exists in production inventory predating the substitution rule. Per product decision: no cleanup. Phase 1 prevents recurrence at generation time; existing legacy books are out of scope for this design. If Shelly wants to rename the legacy book manually in the book editor, the editor already supports that.

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
| `useStoryGenerator` | Retained for Path C — Shelly's manual builder | Not touched. The text-only generator that powers CreateSightWordBook's preview-and-edit step continues to serve Path C unchanged. |
| `useStoryGuide` (`src/features/books/useStoryGuide.ts`) | RETAINED — wizard is buried fallback in "+ New Book" dialog. No code changes. | See §6.2. |
| `StoryGuideQuestion` (`src/features/books/StoryGuideQuestion.tsx`) | RETAINED, no changes. | Reached via the buried secondary button only. |
| Existing "+ New Book" dialog (BookshelfPage.tsx) | Generate tab body REWRITTEN as chat surface. Blank Book tab unchanged. Dialog default tab changes from Blank to Generate. Dialog button relocates to top of Bookshelf grid. | See §3.1 and §5.A. |
| Bookshelf grid layout (BookshelfPage.tsx render section) | "+ New Book" tile relocates from end of grid to first position. | Layout shift — see §3.1 note about Shelly gut-check. |

What's new in code:

- `functions/src/ai/tasks/revisePage.ts` — new task handler (per-page surgical revision).
- `functions/src/ai/tasks/reviseStory.ts` — new whole-story revision task driven by chat history (distinct from revisePage).
- `revisePage` and `reviseStory` added to `TaskType` const + `modelForTask` → Sonnet.
- `revisePage` / `reviseStory` added to `contextSlices.ts` → `["childProfile", "sightWords", "wordMastery"]` (same as `generateStory`).
- `src/features/books/BookGenerateChat.tsx` — the new chat surface inside "+ New Book" dialog (renders the chat thread, composer, style icon strip, and "I like it" commit affordance).
- `src/features/books/useBookGenerateChat.ts` — new hook orchestrating the Generate Chat (turn management, persistence, calls to `generateStory` and `reviseStory`).
- `src/features/books/BookReviewChat.tsx` — new component for the Per-Page Review (§5.B).
- `src/features/books/useBookReview.ts` — new hook driving the per-page state machine.
- Per-Page Review opens automatically after kid approves story in Generate Chat; or on-demand from book editor toolbar. May still live at `/books/:id/review` or render as a dialog overlay — implementation detail.
- `Book` type gets a `reviewState` optional field (including a new `generateChatState: "in-progress" | "complete"` for Path A resumability).

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

### Phase 2 — Generate Chat + Per-Page Review + dialog rewire (~3-5 days)

Scope:
- New `reviseStory` task with system prompt per §5.A.3.
- New `revisePage` task with system prompt per §5.B.3.
- New `BookGenerateChat.tsx` surface driven by `useBookGenerateChat` hook (Generate Chat — §5.A).
- New `BookReviewChat.tsx` surface driven by `useBookReview` hook (Per-Page Review state machine per §5.B.2).
- Rewire "+ New Book" dialog: default tab flipped to Generate; Generate tab body replaced with the chat surface; "Use Story Guide (guided questions)" secondary button preserved at top.
- Relocate "+ New Book" tile to first position in Bookshelf grid.
- Remove "Tell a Story 🎮/✨" Bookshelf CTA (lines 347 and 966 of `BookshelfPage.tsx`).
- Book editor toolbar gets the "Read it to me 🎧" button (visible on parent profile regardless of `reviewState.completedAt`; visible on kid profile for AI-generated books not yet reviewed).
- Auto-open Per-Page Review after kid commits in Generate Chat (Path A and Path B); do NOT auto-open for Path C (Shelly's manual builder).
- `Book` type extended with `reviewState` (including `generateChatState`).
- Remove the AI-shaping step inside `StoryGuidePage` (lines 87-93). Keep the wizard's 5 questions and the rest of the page intact.
- Tests: Generate Chat turn loop + persistence + resumability, per-page state machine transitions, abandon/resume, image-regen-on-scene-change, voice transcript read-back confirmation, "Skip the rest" path.

Acceptance:
- "+ New Book" button appears as the first item in the Bookshelf grid (currently last).
- "+ New Book" dialog opens to the "Generate a Book" tab by default.
- "Generate a Book" tab body is a chat surface; no form fields.
- The composer accepts both text and voice input. Voice transcript is shown with a "Did I hear you right?" confirmation before send.
- Illustration style icons appear inline below the composer; tapping one updates the style for the current and any future generations in this chat.
- "Tell a Story 🎮/✨" Bookshelf CTA is removed.
- "Use Story Guide (guided questions)" button is present at the top of the Generate tab as a buried fallback; clicking it navigates to the existing wizard at `/books/story-guide`.
- The Generate Chat persists draft state in Firestore; closing and re-opening the book offers "Continue making your story".
- After the kid says "I like the whole story" (button or voice), the dialog closes, the book commits to the editor, AND the Per-Page Review opens automatically.
- The Per-Page Review reads each page aloud via `useTTS`, accepts voice or text feedback, revises via the `revisePage` task, and commits page state back to Firestore on every approval.
- Books authored by Shelly (Path C, CreateSightWordBook) do NOT auto-open the Per-Page Review; the "Read it to me" button is available on the editor toolbar for on-demand review.
- Shelly can trigger the Per-Page Review on any book at any time, including one the kid has already approved (parent post-hoc).
- "Create Targeted Story" button (EvaluationBookBanner) generates immediately with no intermediate form; the Generate Chat opens with weak words pre-loaded as context.
- WordWall struggling-word chips behave identically to "Create Targeted Story".
- QuestSummary post-quest "make a story about this" link behaves identically.
- "Create Sight Word Story" button still opens CreateSightWordBook (no regression for Shelly's deliberate tutoring use case).
- No code in `useStoryGuide`, `StoryGuideQuestion`, `StoryGuidePage`, `CreateSightWordBook`, or `useStoryGenerator` is modified except as required to update entry points or add `reviewState` surfacing.

Risk: medium. New tasks, new state machine, new chat surface. Mitigations: the progressive-save pattern from `useBookGenerator` handles the persistence cleanly, and `useTTS`/`useSpeechRecognition` are battle-tested from Workshop.

### Phase 3 — Polish (sketched only, not committed)

Candidates:
- Per-child TTS voice picker (Lincoln might want a different voice than the default Samantha).
- "Save this prompt as a template" — Shelly can save reusable starts ("a story about Lincoln teaching London something").
- Print/share button on review-approved books surfacing differently than unreviewed ones (review approval = "ready to print").
- Optional Shelly approval step before kid books print as physical inventory.

These ship as small standalone PRs after Phase 2 stabilizes.

---

## 9. Open questions and decisions still to make

### Answered (May 2026, with Nathan)

1. **Auto-open review chat?** YES for Path A (kid-generated via Generate Chat) — the Per-Page Review opens automatically once the kid approves the story. NO for Path C (Shelly's manual builder) — the "Read it to me" button surfaces on the editor toolbar for on-demand use. Path B inherits Path A behavior.

2. **Revision attempt cap?** NO hard cap. The iterative loop is the design. Voice transcript read-back + manual text edit are both available as fallbacks for Lincoln's STT mishearing.

3. **Shelly post-hoc review?** YES. The "Read it to me" button surfaces in the parent profile view regardless of the book's `reviewState.completedAt`, including on books the kid has already approved.

4. **Voice selection?** Samantha (default) for now. Voice picker moves to Phase 3.

5. **Revision based on full chat history?** YES. The `reviseStory` task receives the full chat history and uses it to revise. This is what enables natural multi-turn refinement ("make him nicer"... "also smarter"... "wait, can you bring the cat back?").

6. **Path B auto-open?** YES (inherits Path A).

### Still open

7. **"+ New Book" button relocation.** Bookshelf grids commonly grow downward with the add affordance at the end. Pinning to top is a deliberate departure. Worth a quick gut-check with Shelly during testing: would she prefer the "+ New Book" tile pinned as the first grid item (current proposal) or as a separate top-bar button outside the grid?

8. **Style icon design.** The current dialog has text chips ("Minecraft", "Garden Battle", etc.). The new direction calls for icons. Are these (a) text labels with prefix emoji (cheap), (b) small image thumbnails showing a sample illustration of each style (better, requires assets), or (c) a separate icon button row with text-on-hover (compact)? Phase 2 implementation detail; defer to whoever builds the component.

9. **"I like the whole story" button or voice trigger?** Always both, but the button label might want personalization (kid vs Shelly). Defer to Phase 2 implementation.

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
