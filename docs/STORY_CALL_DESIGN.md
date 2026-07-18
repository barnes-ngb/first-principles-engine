# Story Call — grandparent read-aloud call mode

**Status:** BUILT-v1 (2026-07-18) · **Ledger anchor:** FEAT-95 · **Band:** 2

A weekly video call where the kids read the books they made to their far-away
grandparents, the tablet screen shared over Google Meet. The app carries **no
video** — it *is* the content on the shared screen. This gives the charter's
**Share** stage a real audience: Lincoln gets speech practice with a purpose,
London shows off his stories.

## 1. Why this exists

The engine link is deliberately light and **mostly already existed** before this
build. `BookReaderPage` already writes an `EngineStage.Share` artifact on
completion and logs reading hours on unmount. Story Call adds **presentation +
audience**, not plumbing — no new Cloud Function, no schema change, no new
XP/diamond event, no learner-model or `skillSnapshots` write.

## 2. Owner decisions (settled)

- **Call mode is presentation-only.** It changes what the shared screen *looks
  like*; it never changes what gets written. Completion / hours / XP run unchanged.
- **Audience enriches existing writes.** The "Who did you read to?" answer is
  appended to the Share artifact and the hours note — never a new doc.
- **No evaluation on broadcast surfaces.** A screen shared with a grandparent
  shows questions to ask, never answers, scores, percentages, ✅/❌, or an
  answered-count. Charter: no grades, no shame.
- **No name-gating.** Nothing in Story Call keys off a child's name.

## 3. Scope (four pieces, all additive)

### 3.1 Story Call mode — `?call=1` on the existing reader
`BookReaderPage` reads a `?call=1` flag via `useSearchParams` — no new route, no
new page. In call mode: larger page text/art and a wider content column; the
print button, sight-word count chip, and Edit/utility chrome are hidden. Swipe
nav, dot indicators (now with accessible labels), and tappable-word TTS are
unchanged. Entry is a kid-reachable "Story Call" item on the bookshelf card menu
(finished books) → `/books/{id}/read?call=1`.

Because the reader lives inside `AppShell`, call mode also **escapes the shell**:
`AppShell` detects `?call=1` on a `/read` route and renders the reader full-bleed
— no sidebar, mobile header, drawer, or debug chrome on the shared screen — so
the broadcast surface really is only the book.

### 3.2 Ask-Me panel (call-mode back cover)
`AskMePanel` renders on the back cover **instead of** `ComprehensionQuestions`
when in call mode, over the **same** `useComprehensionQuestions` data. It
addresses the asker ("Your turn! Ask {child}…", big high-contrast type) and shows
**questions only** — never the `answer` field, no reveal, no answered-count, no
scores — ordered opinion → inference → recall. Questions auto-generate on
reaching the back cover (no tap-to-generate on a call). If generation is empty or
fails, three static fallbacks render so the panel is **never blank on a live
call**.

### 3.3 Audience stamp
A skippable "Who did you read to?" chip row (Grandma / Grandpa / Someone else)
sits beneath Ask-Me. One tap enriches the **existing** writes only: the Share
artifact `content` gains "Read aloud to {audience} on a video call" and the hours
`notes` gains "(Story Call — read to {audience})". Because completion normally
fires on reaching the back cover — *before* the chip tap — call mode **defers the
Share write until reader exit**, so it carries the **final** audience selection: a
grandparent can correct a mis-tapped chip and both records (artifact + hours)
agree (un-stamped if no chip was tapped). Non-call behavior is byte-identical;
content assembly is a pair of pure, unit-tested builders (`readingLog.logic.ts`).

### 3.4 Grandparent brief (printable one-pager)
`grandparentBrief.ts` (`buildGrandparentBriefHtml(childName)`) is a pure
`childName → HTML` builder opened via the `window.open`/`print()` pattern
(`printableKit.ts` precedent, no AI call). Warm, one page: this is real school;
don't correct mid-read (wait, or say the word and move on); never ask "how many
did you get right"; the last page gives you questions to ask; the win is that
{child} wants to read to you again next week. Entry is a parent-only "Grandparent
guide" action on the Books toolbar — not kid-visible.

## 4. What is NOT touched

No new Cloud Function, `firestore.rules` change, schema/type migration,
learner-model / `skillSnapshots` write, new XP/diamond event, or planner change.
No name-gating in new code. No evaluation UI on any call-mode surface. Generated
book text and questions are never "improved" beyond ordering/phrasing.

## 5. Files

- `src/app/AppShell.tsx` + `src/app/App.css` — call mode escapes the shell
  (full-bleed reader, no sidebar/header/debug chrome).
- `src/features/books/BookReaderPage.tsx` — `?call=1` flag, chrome hiding,
  enlargement, Ask-Me swap, audience chips, deferred-completion timing.
- `src/features/books/AskMePanel.tsx` + `askMePanel.logic.ts` — the back-cover
  broadcast panel + pure ordering/fallback helpers.
- `src/features/books/readingLog.logic.ts` — pure Share-artifact / hours-note
  builders (audience threading).
- `src/features/books/grandparentBrief.ts` — printable brief builder.
- `src/features/books/BookshelfPage.tsx` — card-menu Story Call entry + parent
  "Grandparent guide" toolbar action.
- Tests: `AskMePanel.test.tsx`, `readingLog.logic.test.ts`,
  `grandparentBrief.test.ts`, `__tests__/BookReaderPage.test.tsx`.

## 6. Broadcast surface at tablet width

In call mode at tablet width the reader is the whole screen: a large cover/art
column (up to 760px wide), oversized page text (~1.9rem), no Edit/Download/print
chrome, and dot indicators for nav. The back cover reads as a warm close — the
book's celebration line, then "Your turn! Ask {child}…" with 2–3 big questions,
then the "Who did you read to?" chips. Nothing on screen looks like a test.

## 7. Testing

- `AskMePanel` — renders questions, never answers, opinion→inference→recall
  order, fallback path, no score signals, neutral pronoun when name is empty.
- `readingLog.logic` — artifact/hours content with and without audience; non-call
  output byte-identical.
- `BookReaderPage` — call-mode chrome hiding vs unchanged default; back cover
  shows Ask-Me + audience chips and no comprehension check / scores; chip records
  the audience; default back cover keeps the comprehension check.
- `grandparentBrief` — name substitution, escaping, self-contained document.

## 8. Future (not built)

Per-audience streaks or a call log; a "read to {audience} N times" surface;
London-tuned call-mode typography once his reader is tuned (see
`docs/LONDON_BACKLOG.md`). None are needed for v1.

## 9. Principles held

Frictionless (one flag, one tap), small additive artifacts, narration-first,
charter alignment (no grades/shame on the shared screen), AI additive (falls back
to static prompts), Share stage gets a real audience.
