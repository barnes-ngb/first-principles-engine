import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDoc, doc, getDoc, setDoc } from 'firebase/firestore'

import { useAI } from '../../core/ai/useAI'
import type { TaskType } from '../../core/ai/useAI'
import { booksCollection } from '../../core/firebase/firestore'
import type { Book, BookPage, BookTheme, ChatTurn } from '../../core/types'
import type { SubjectBucket } from '../../core/types/enums'
import { generatePageId } from './bookTypes'
import { inferBookTheme } from './bookThemeInference'
import { normalizeCustomStoryTheme } from './customStoryTheme'
import { clampTargetPageCount } from './storyPageTargets'
import {
  DEFAULT_LEVEL_STRETCH,
  normalizeLevelStretch,
} from './storyLevelStretch'
import type { LevelStretch } from './storyLevelStretch'
import {
  classifyStoryGenerationFailure,
  storyGenerationFailureMessage,
  STORY_REVISE_SURFACE,
} from './storyGenerationFailure'
import {
  StoryWordSource,
  practiceWordsUsedIn,
  resolveStoryWords,
  selectStoryPracticeWords,
  storyDraftMessage,
  storyDraftSpokenMessage,
} from './storyPracticeWords'
import { useBookIllustrator } from './useBookIllustrator'
import { useSightWordProgress } from './useSightWordProgress'
import type { IllustrationProgress as IllustratorProgress } from './useBookIllustrator'

// ── Types ────────────────────────────────────────────────────────

export interface GeneratedStoryPage {
  pageNumber: number
  text: string
  sceneDescription: string
  wordsOnPage?: string[]
}

export interface GeneratedStory {
  title: string
  pages: GeneratedStoryPage[]
}

interface ReviseStoryResult {
  humanResponse: string
  storyUpdated: boolean
  updatedStory?: GeneratedStory
  pagesNeedingImageRegen?: number[]
  qualityNotes?: string
}

export interface UseBookGenerateChatOptions {
  familyId: string
  /**
   * The active child — the profile the app is on. Every read and write
   * follows it, as on every other surface (FEAT-173, owner decision
   * 2026-09-02): the practice words come from this child's
   * `sightWordProgress`, the server writes for this child's age, interests
   * and word mastery, and the draft book lands on this child's shelf. There is
   * no per-story child picker and nothing infers a child from the prose.
   */
  childId: string
  childName: string
  childAge: number
  /**
   * Initial target page count for a fresh draft (FEAT-97). The hook then owns
   * the live value as state — it's hydrated from the saved `generationConfig`
   * when resuming a draft, and driven by the length selector via `setPageCount`.
   */
  initialPageCount: number
  defaultIllustrationStyle: string
  /** Parent attribution to apply when a draft is committed. */
  attribution?: { createdBy: 'parent' | string; createdFor: string }
  /** When set, the hook loads the existing draft from Firestore and continues it. */
  resumeBookId?: string
}

export type ClarificationPhase = 'clarifying' | 'ready'

export type IllustrationProgress = IllustratorProgress

export interface UseBookGenerateChat {
  chatHistory: ChatTurn[]
  currentStory: GeneratedStory | null
  illustrationStyle: string
  isLoading: boolean
  error: string | null
  bookId: string | null

  clarificationPhase: ClarificationPhase
  pendingIdea: string
  pendingRefinement: string | null
  canStartStory: boolean

  /** Live target page count (FEAT-97) — hydrated from a resumed draft. */
  pageCount: number
  setPageCount: (pages: number) => void

  /**
   * The per-story "one step up" (FEAT-191), 0-2. Sent to `generateStory` as
   * `levelStretch` and recorded on the draft's own `generationConfig`, so a
   * resumed draft and every revise of the finished book stay at the level the
   * book was written at. Never writes a level anywhere.
   */
  levelStretch: LevelStretch
  setLevelStretch: (stretch: LevelStretch) => void

  /**
   * The parent's one-off "what should this story feel like?" note for this book
   * (FEAT-194). `''` = none. Sent to `generateStory` as `customTheme` and
   * recorded on the draft's own `generationConfig`, so a resumed draft restores
   * it. Story-side only — it never reaches an image prompt.
   */
  customTheme: string
  setCustomTheme: (note: string) => void

  /**
   * The sight words this flow will send to `generateStory` as the structured
   * `words` list. **A list the parent typed into the idea wins** (FEAT-172,
   * `parseRequestedWords`); otherwise the child's own practice words
   * (`practicing` / `new` in `sightWordProgress`, capped — FEAT-169); `[]` when
   * neither exists. `sightWordProgress` stays read-only here — this surface
   * never writes a child's word record; since FEAT-188 it does record the
   * words that landed on the pages as `book.sightWords`, which is a property
   * of the book, not of the child. The UI shows the list, and which source it
   * is, before the tap so a silent miss is impossible.
   */
  storyWords: string[]
  /** Which of the two sources `storyWords` came from (FEAT-172). */
  storyWordSource: StoryWordSource
  /**
   * True while the story still depends on the child's sight-word list and
   * that list has not settled (loaded, or failed and fell open to `[]`). While
   * true, `canStartStory` is false and `confirmStartStory` is a no-op, so a
   * fast tap can never send `words: []` for a child who does have practice
   * words and record that on the draft (Codex P1 on PR #1724). Never sticks: a
   * rejected read still settles it. Always false once the parent has typed a
   * list — that story does not read the practice list at all (FEAT-172).
   */
  storyWordsLoading: boolean

  illustrationProgress: IllustrationProgress

  sendKidMessage: (text: string) => Promise<void>
  setIllustrationStyle: (style: string) => void
  commitAndClose: () => Promise<string | null>
  abandonDraft: () => Promise<void>

  confirmStartStory: () => Promise<void>
  confirmAddRefinement: () => Promise<void>
  confirmChangeRefinement: () => Promise<void>
}

// ── Helpers ──────────────────────────────────────────────────────

function cleanJson(raw: string): string {
  return raw.replace(/```json|```/g, '').trim()
}

function parseGeneratedStory(raw: string): GeneratedStory | null {
  try {
    const parsed = JSON.parse(cleanJson(raw)) as GeneratedStory
    if (!parsed.title || !Array.isArray(parsed.pages)) return null
    return parsed
  } catch {
    return null
  }
}

function parseReviseResult(raw: string): ReviseStoryResult | null {
  try {
    const parsed = JSON.parse(cleanJson(raw)) as ReviseStoryResult
    if (typeof parsed.humanResponse !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function storyToPages(story: GeneratedStory): BookPage[] {
  const now = new Date().toISOString()
  return story.pages.map((p, i) => ({
    id: generatePageId(),
    pageNumber: i + 1,
    text: p.text,
    images: [],
    layout: 'text-only' as const,
    sightWordsOnPage: p.wordsOnPage ?? [],
    createdAt: now,
    updatedAt: now,
  }))
}

const CHAINING_WORDS = new Set([
  'and',
  'or',
  'with',
  'plus',
  'also',
  'but',
  'then',
])

/**
 * Dumb heuristic to combine the kid's prior idea with a refinement they
 * tapped "+ Add it" for. Trims trailing punctuation off the first part,
 * inserts "and" unless the refinement already starts with a chaining word.
 */
/**
 * A bare answer to the yes/no question the chat just asked (UX-110).
 *
 * "Want me to start the story?" is a question, the composer is live under it,
 * and a kid who types "yes" got *"Should I ADD that to your story, or CHANGE
 * the idea to that?"* — and "+ Add it" then produced the idea "a dragon who
 * finds a cave and yes". Answering the question was treated as a new idea.
 *
 * Deliberately narrow: only a bare affirmative or negative, punctuation and
 * case aside. "yes, and a dragon" is a real refinement and must stay one, so
 * anything with more than the word itself falls through untouched.
 */
export const AFFIRMATIVE_REPLIES: ReadonlySet<string> = new Set([
  'y', 'ya', 'yah', 'yeah', 'yep', 'yes', 'yup',
  'ok', 'okay', 'sure', 'go', 'start', 'please',
])

export const NEGATIVE_REPLIES: ReadonlySet<string> = new Set([
  'n', 'no', 'nope', 'nah', 'not yet', 'wait',
])

export type ClarificationReply = 'affirmative' | 'negative' | 'idea'

export function classifyClarificationReply(text: string): ClarificationReply {
  const bare = text
    .trim()
    .toLowerCase()
    .replace(/[.!?,\s]+$/u, '')
    .replace(/\s{2,}/gu, ' ')
  if (AFFIRMATIVE_REPLIES.has(bare)) return 'affirmative'
  if (NEGATIVE_REPLIES.has(bare)) return 'negative'
  return 'idea'
}

/** What the chat says when the answer was "no" — no idea change, one nudge. */
export const DECLINED_START_NUDGE =
  "Okay \u2014 we won't start yet. Tell me what to change about the idea, or tap \"\u2713 Yes, start my story!\" when you're ready."

export function joinIdeas(a: string, b: string): string {
  const left = a.replace(/[.!?,\s]+$/u, '').trim()
  const right = b.replace(/^\s+/u, '')
  if (!left) return right
  if (!right) return left
  const firstWord = right.split(/\s+/, 1)[0]?.toLowerCase() ?? ''
  const stripped = firstWord.replace(/[^a-z]/gu, '')
  const naturallyChains = CHAINING_WORDS.has(stripped)
  const joined = naturallyChains ? `${left} ${right}` : `${left} and ${right}`
  return joined.replace(/\s{2,}/gu, ' ')
}

function echoMessage(idea: string): string {
  return `Here's what I heard: "${idea}". Want me to start the story?`
}

function echoUpdatedMessage(idea: string): string {
  return `Here's what I heard now: "${idea}". Want me to start the story?`
}

const ADD_OR_CHANGE_FIRST =
  'Should I ADD that to your story, or CHANGE the idea to that?'

const ADD_OR_CHANGE_OVERWRITE =
  "Got it — that's what you want to add now. Should I ADD this to your story, or CHANGE the idea to this?"

// ── Hook ─────────────────────────────────────────────────────────

export function useBookGenerateChat(
  opts: UseBookGenerateChatOptions,
): UseBookGenerateChat {
  const {
    familyId,
    childId,
    childName,
    childAge,
    initialPageCount,
    defaultIllustrationStyle,
    attribution,
    resumeBookId,
  } = opts

  const { chat } = useAI()
  const { illustrate } = useBookIllustrator()
  // The child's real list, read-only (FEAT-169). `progressMap` is the hook's
  // stable state — `allProgress` is a fresh array per render. Keyed on the
  // active child, like every other read on this surface.
  const { progressMap, loading: practiceWordsLoading } = useSightWordProgress(
    familyId,
    childId,
  )
  const practiceWords = useMemo(
    () => selectStoryPracticeWords(progressMap.values()),
    [progressMap],
  )

  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([])
  /**
   * `confirmStartStory` is defined below `sendKidMessage` and depends on state
   * that message handler also touches, so a bare "yes" reaches it through a ref
   * rather than by reordering two large callbacks around each other (UX-110).
   */
  const confirmStartStoryRef = useRef<(() => Promise<void>) | null>(null)
  const [currentStory, setCurrentStory] = useState<GeneratedStory | null>(null)
  const [illustrationStyle, setIllustrationStyle] = useState<string>(
    defaultIllustrationStyle,
  )
  const [bookId, setBookId] = useState<string | null>(resumeBookId ?? null)
  const [pageCount, setPageCount] = useState<number>(initialPageCount)
  // FEAT-191 — a fresh draft is always at the child's own level; a stretch is
  // only ever an explicit parent tap, and a resumed draft restores the one it
  // was generated with (below).
  const [levelStretch, setLevelStretchState] = useState<LevelStretch>(DEFAULT_LEVEL_STRETCH)
  /**
   * The parent's one-off "what should this story feel like?" note for this
   * book (FEAT-194). `''` = none, which is every draft before it existed.
   *
   * It lives here rather than only in the Book Editor's Finish dialog because
   * this is the surface that WRITES a story: a note set after the story exists
   * can shape nothing, and the whole point of retiring the saved-theme library
   * was that a parent's typed words reached no model.
   */
  const [customTheme, setCustomThemeState] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [clarificationPhase, setClarificationPhase] =
    useState<ClarificationPhase>('clarifying')
  const [pendingIdea, setPendingIdea] = useState<string>('')
  const [pendingRefinement, setPendingRefinement] = useState<string | null>(null)

  /**
   * The word list a RESUMED draft was generated against, read back from its
   * own `generationConfig.words` (Codex P2 on PR #1755).
   *
   * The practice fallback is a live read of `sightWordProgress`, and it moves:
   * the map starts empty while it loads, and a word mastered since the draft
   * was started drops out of `practicing`/`new` altogether. `commitAndClose`
   * does not wait on that read the way `confirmStartStory` does, so deriving
   * the published list from the *current* practice words could omit the very
   * words the story was written around — or fold in words that were never
   * sent — and overwrite the recorded `generationConfig.words` with them.
   *
   * So a resumed draft's fallback is the list it recorded, not today's. A
   * stored `[]` is honoured as "no list was in play for this draft", which is
   * exactly what it means. A list the parent TYPED is unaffected either way:
   * `resolveStoryWords` reads it straight out of the idea text, so it wins
   * over both and follows every later edit (FEAT-172).
   */
  /**
   * The stretch the parent has picked RIGHT NOW (FEAT-191).
   *
   * A ref beside the state because two different writers need the live value at
   * a moment React state cannot give it to them:
   *   - every persist below builds its `generationConfig` from the ref, so an
   *     in-flight write can never carry a value the parent has already changed;
   *   - the post-create flush (`flushLevelStretch`) compares against it.
   * Kept in step by `setLevelStretch` and by the resume hydration.
   */
  const levelStretchRef = useRef<LevelStretch>(DEFAULT_LEVEL_STRETCH)

  /** The same ref treatment, for the same two reasons (FEAT-194). */
  const customThemeRef = useRef<string>('')

  /** One narrow `merge` write of the field, never anything else on the book. */
  const writeLevelStretch = useCallback(
    async (id: string, value: LevelStretch): Promise<void> => {
      try {
        await setDoc(
          doc(booksCollection(familyId), id),
          { generationConfig: { levelStretch: value } },
          { merge: true },
        )
      } catch (err) {
        console.warn('Failed to persist the story reading level:', err)
      }
    },
    [familyId],
  )

  /**
   * Close the gap between what a just-created draft WROTE and what the parent
   * has picked since (Codex P2, round 2 on PR #1763).
   *
   * The clarification branch of `sendKidMessage` renders the echo turn and then
   * awaits `addDoc` **without** setting `isLoading`, so the picker stays live
   * for the whole round-trip while `bookId` is still `null`. A tap in that
   * window used to hit the `!bookId` early return and be dropped, while the
   * create — whose document object was built before the tap — wrote the older
   * value and only then installed the id.
   *
   * So every create calls this the moment it has an id, with the value it
   * actually wrote. A tap during the window moved the ref, the two differ, and
   * one small write settles it. Nothing moved → no write.
   */
  const flushLevelStretch = useCallback(
    (id: string, written: LevelStretch): void => {
      if (levelStretchRef.current === written) return
      void writeLevelStretch(id, levelStretchRef.current)
    },
    [writeLevelStretch],
  )

  /**
   * Picking a stretch WRITES it when a draft already exists (Codex P2, round 1
   * on PR #1763).
   *
   * Every other write of this field is a side effect of a message or a
   * confirmation. A tap on the control is neither. So a parent who sends the
   * first message (creating the draft at the child's own level), THEN picks
   * "One step up", and then dismisses the enclosing dialog by its backdrop or
   * the Escape key — neither of which runs any handler here — used to leave the
   * choice in React state only. Resuming that draft hydrated the stored 0 and
   * the book was silently generated at the wrong level: the one failure this
   * whole feature exists to prevent, arrived at from the other direction.
   *
   * Before a draft exists there is nothing to write to; the ref above is what
   * carries the value into the create, and `flushLevelStretch` covers the
   * window where the create is already in flight.
   */
  const setLevelStretch = useCallback(
    (next: LevelStretch) => {
      const value = normalizeLevelStretch(next)
      levelStretchRef.current = value
      setLevelStretchState(value)
      if (bookId) void writeLevelStretch(bookId, value)
    },
    [bookId, writeLevelStretch],
  )

  /**
   * One narrow `merge` write of the note, never anything else on the book
   * (FEAT-194) — the twin of `writeLevelStretch`, for the same reason: a control
   * a parent taps has to persist on its own, not only as a side effect of the
   * next message.
   *
   * `''` rather than a removal for "no note": the app runs Firestore with
   * `ignoreUndefinedProperties`, so `undefined` on a merge write would leave a
   * cleared note stored.
   */
  const writeCustomTheme = useCallback(
    async (id: string, value: string): Promise<void> => {
      try {
        await setDoc(
          doc(booksCollection(familyId), id),
          { generationConfig: { customTheme: normalizeCustomStoryTheme(value) } },
          { merge: true },
        )
      } catch (err) {
        console.warn('Failed to persist the story feel note:', err)
      }
    },
    [familyId],
  )

  /** The create-in-flight window, exactly as `flushLevelStretch` covers it. */
  const flushCustomTheme = useCallback(
    (id: string, written: string): void => {
      if (customThemeRef.current === written) return
      void writeCustomTheme(id, customThemeRef.current)
    },
    [writeCustomTheme],
  )

  const setCustomTheme = useCallback(
    (next: string) => {
      const value = normalizeCustomStoryTheme(next)
      customThemeRef.current = value
      setCustomThemeState(value)
      if (bookId) void writeCustomTheme(bookId, value)
    },
    [bookId, writeCustomTheme],
  )

  const [resumedStoryWords, setResumedStoryWords] = useState<string[] | null>(null)
  const fallbackWords = resumedStoryWords ?? practiceWords

  // The one decision (FEAT-172): a list typed into the idea wins; the practice
  // list only when the parent named none. Derived, never stored, so it follows
  // every edit to the idea (Add / Change) and every child switch.
  const { source: storyWordSource, words: storyWords } = useMemo(
    () => resolveStoryWords(pendingIdea, fallbackWords),
    [pendingIdea, fallbackWords],
  )
  // A typed list does not read the practice list, so it never waits on it —
  // and neither does a resumed draft that carries its own recorded list.
  const storyWordsLoading =
    practiceWordsLoading &&
    storyWordSource !== StoryWordSource.Requested &&
    resumedStoryWords === null

  const [illustrationProgress, setIllustrationProgress] =
    useState<IllustrationProgress>({
      phase: 'idle',
      currentPage: 0,
      totalPages: 0,
      failedPages: [],
      capReached: false,
      unillustratedPages: [],
    })

  // Track whether we've initialized from a resume so we don't keep refetching.
  const initializedRef = useRef(false)

  // Hydrate from Firestore when resuming an existing draft.
  useEffect(() => {
    if (!resumeBookId || initializedRef.current) return
    initializedRef.current = true
    let cancelled = false
    void (async () => {
      try {
        const snap = await getDoc(doc(booksCollection(familyId), resumeBookId))
        if (!snap.exists() || cancelled) return
        const data = snap.data() as Book
        const state = data.reviewState
        // Restore the saved target page count so a resumed draft generates at the
        // length the user picked, not the reset default (FEAT-97).
        if (typeof data.generationConfig?.pageCount === 'number') {
          setPageCount(clampTargetPageCount(data.generationConfig.pageCount))
        }
        // The list this draft was actually generated against — see
        // `resumedStoryWords`. Set in the same pass that reconstructs
        // `currentStory` below, and `commitAndClose` needs a story, so a
        // publish can never outrun it.
        if (Array.isArray(data.generationConfig?.words)) {
          setResumedStoryWords(data.generationConfig.words.map(String))
        }
        // The stretch this draft was generated with (FEAT-191). Restored for the
        // same reason `pageCount` is: resuming must continue the book that
        // exists, not re-derive one at today's defaults. An absent field is 0 —
        // every draft made before this run.
        if (data.generationConfig?.levelStretch !== undefined) {
          // The raw setter, deliberately: hydrating is reading, and the
          // persisting `setLevelStretch` below would echo the value straight
          // back to the document it just came from.
          const hydrated = normalizeLevelStretch(data.generationConfig.levelStretch)
          levelStretchRef.current = hydrated
          setLevelStretchState(hydrated)
        }
        // The note this draft was started with (FEAT-194). Same reasoning, and
        // the raw setter for the same reason: hydrating is reading.
        if (data.generationConfig?.customTheme !== undefined) {
          const note = normalizeCustomStoryTheme(data.generationConfig.customTheme)
          customThemeRef.current = note
          setCustomThemeState(note)
        }
        if (state?.chatHistory) setChatHistory(state.chatHistory)
        if (state?.illustrationStyle) setIllustrationStyle(state.illustrationStyle)
        if (state?.clarificationPhase) setClarificationPhase(state.clarificationPhase)
        if (typeof state?.pendingIdea === 'string') setPendingIdea(state.pendingIdea)
        if (state?.pendingRefinement !== undefined) {
          setPendingRefinement(state.pendingRefinement ?? null)
        }
        // Reconstruct currentStory from persisted pages.
        if (Array.isArray(data.pages) && data.pages.length > 0) {
          setCurrentStory({
            title: data.title ?? '',
            pages: data.pages.map((p) => ({
              pageNumber: p.pageNumber,
              text: p.text ?? '',
              sceneDescription: p.images?.[0]?.prompt ?? '',
              wordsOnPage: p.sightWordsOnPage,
            })),
          })
          // If we have a story but no explicit phase, we're in "ready" land.
          if (!state?.clarificationPhase) setClarificationPhase('ready')
        }
      } catch (err) {
        console.warn('Failed to resume book draft:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [familyId, resumeBookId])

  // ── Persistence ──────────────────────────────────────────────

  const persistStory = useCallback(
    async (
      story: GeneratedStory,
      nextHistory: ChatTurn[],
      style: string,
      generateChatState: 'in-progress' | 'completed',
      phase: ClarificationPhase,
      idea: string,
      refinement: string | null,
    ): Promise<string | null> => {
      const now = new Date().toISOString()
      const pages = storyToPages(story)
      // Recorded from the idea being persisted, not the render's closure —
      // the first-message write runs before `pendingIdea` has re-rendered.
      const wordsForIdea = resolveStoryWords(idea, fallbackWords).words

      // UX-123, the standing decision, settled by the owner 2026-09-04
      // (FEAT-188): **a chat book is a practice book when a list was in play.**
      // `book.sightWords` is what flips the reader into sight-word mode — the
      // "Words to Watch For" page, the tappable chips, the per-word
      // `sightWordProgress` writes, the print dialog's highlighting section.
      // FEAT-169 left it unset on chat books pending this decision, so a
      // parent who asked for Lincoln's words got a plain reader while the same
      // ask through "Make a sight word book" got the practice one.
      //
      // Two rails on the set:
      //   - Only at **publish** ("I like the whole story!"). A half-made draft
      //     is not a practice book yet, and this is the same write the book
      //     already makes — never a second one.
      //   - Only the words that **actually landed on the pages**
      //     (`practiceWordsUsedIn`, the same check the draft turn reports
      //     from), never the requested list and never the model's own claim.
      //     A story that missed every word is not a practice book for words it
      //     does not contain, so an empty result leaves the field unset and
      //     the book reads plain — exactly as it did before this run.
      // No list in play (`StoryWordSource.None` → `wordsForIdea` empty) is
      // unchanged: unset.
      const landedWords =
        generateChatState === 'completed' && wordsForIdea.length > 0
          ? [...new Set(practiceWordsUsedIn(pages, wordsForIdea))]
          : []
      // Spread, not a key set to `undefined`: Firestore rejects that, and an
      // absent field is what "not a practice book" means on every other book.
      const isPracticeBook = landedWords.length > 0
      const sightWordField = isPracticeBook ? { sightWords: landedWords } : {}

      // Codex P1 on PR #1755 — real, and the reason the honesty rail has to
      // reach the PAGES too. `storyToPages` copies the model's own
      // `wordsOnPage` claim into `page.sightWordsOnPage` verbatim, and setting
      // `sightWords` above is exactly what turns on `BookReaderPage`'s effect
      // that calls `recordInteraction(word, 'seen')` for every entry in it. So
      // flipping practice mode on a page carrying an invented word would
      // create a `sightWordProgress` record for a word that is not in the book
      // — a write into the child's own record, from a claim nothing checked.
      //
      // So the moment the book becomes a practice book, every page's word list
      // is recomputed the same way its `sightWords` was: the landed words that
      // this page's text actually holds. Chips, the per-page count and the
      // reader's writes then all key off one verified set. A book that is not
      // a practice book keeps its pages byte-for-byte — the field is inert
      // there (`isSightWordBook` gates every reader of it), and rewriting it
      // would be widening the change past the defect.
      const persistedPages = isPracticeBook
        ? pages.map((p) => ({
            ...p,
            sightWordsOnPage: practiceWordsUsedIn([p], landedWords),
          }))
        : pages

      if (bookId) {
        const ref = doc(booksCollection(familyId), bookId)
        try {
          const snap = await getDoc(ref)
          if (snap.exists()) {
            const current = snap.data() as Book
            const mergedPages: BookPage[] = persistedPages.map((p, i) => {
              const prior = current.pages?.[i]
              if (!prior) return p
              return {
                ...prior,
                text: p.text,
                sightWordsOnPage: p.sightWordsOnPage,
                updatedAt: now,
              }
            })
            await setDoc(ref, {
              ...current,
              title: story.title,
              pages: mergedPages,
              coverStyle: style as Book['coverStyle'],
              updatedAt: now,
              ...sightWordField,
              generationConfig: {
                ...(current.generationConfig ?? {}),
                storyIdea: idea,
                words: wordsForIdea,
                style,
                pageCount,
                // The ref, not the closure: a tap during this in-flight write
                // must not be overwritten by the value it started with.
                levelStretch: levelStretchRef.current,
                // The one-off note this book is written with (FEAT-194), off the
                // ref for the same reason.
                customTheme: customThemeRef.current,
              },
              reviewState: {
                ...(current.reviewState ?? {}),
                generateChatState,
                chatHistory: nextHistory,
                illustrationStyle: style,
                clarificationPhase: phase,
                pendingIdea: idea,
                pendingRefinement: refinement,
              },
            })
            return bookId
          }
        } catch (err) {
          console.warn('Failed to update draft book:', err)
        }
      }

      const newBook: Omit<Book, 'id'> = {
        childId: attribution?.createdFor ?? childId,
        title: story.title,
        coverStyle: style as Book['coverStyle'],
        pages: persistedPages,
        ...sightWordField,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        subjectBuckets: ['LanguageArts' as SubjectBucket],
        bookType: 'generated',
        source: 'ai-generated',
        theme: inferBookTheme('', [], style) as BookTheme,
        createdBy: attribution?.createdBy ?? childId,
        createdFor: attribution?.createdFor ?? childId,
        generationConfig: {
          storyIdea: idea,
          // The words this flow sends to generateStory (FEAT-169/172) —
          // recorded so the book says what was asked for. `theme` above stays
          // `[]`-based on purpose: `inferBookTheme` with words returns
          // `sight_words` and would drop the picked illustration style's theme.
          words: wordsForIdea,
          style,
          pageCount,
          // The level this book was written at (FEAT-191) — recorded on the
          // book so a resumed draft restores it and every later revise is
          // levelled against the book, not against today's default. Read off
          // the ref so it is the parent's latest pick, not the render's.
          levelStretch: levelStretchRef.current,
          // The one-off note this book is written with (FEAT-194) — recorded on
          // the book for the same reasons, and read off its own ref.
          customTheme: customThemeRef.current,
        },
        reviewState: {
          generateChatState,
          chatHistory: nextHistory,
          illustrationStyle: style,
          clarificationPhase: phase,
          pendingIdea: idea,
          pendingRefinement: refinement,
        },
      }
      const writtenStretch = levelStretchRef.current
      const writtenNote = customThemeRef.current
      try {
        const ref = await addDoc(booksCollection(familyId), newBook as Book)
        setBookId(ref.id)
        // The picker stayed live for this whole round-trip — settle any tap
        // that landed during it (Codex P2, round 2).
        flushLevelStretch(ref.id, writtenStretch)
        flushCustomTheme(ref.id, writtenNote)
        return ref.id
      } catch (err) {
        console.error('Failed to create draft book:', err)
        return null
      }
    },
    [familyId, childId, bookId, attribution, pageCount, flushLevelStretch, flushCustomTheme, fallbackWords],
  )

  /**
   * Persist clarification-phase state to Firestore before any story exists.
   * Once a story exists we go through persistStory instead.
   */
  const persistClarification = useCallback(
    async (
      nextHistory: ChatTurn[],
      style: string,
      phase: ClarificationPhase,
      idea: string,
      refinement: string | null,
    ): Promise<void> => {
      const now = new Date().toISOString()
      // See persistStory: the idea's own word list is written on every
      // persist (FEAT-172), never only on create.
      const wordsForIdea = resolveStoryWords(idea, fallbackWords).words
      if (bookId) {
        const ref = doc(booksCollection(familyId), bookId)
        try {
          const snap = await getDoc(ref)
          if (snap.exists()) {
            const current = snap.data() as Book
            await setDoc(ref, {
              ...current,
              updatedAt: now,
              generationConfig: {
                ...(current.generationConfig ?? {}),
                storyIdea: idea,
                words: wordsForIdea,
                style,
                pageCount,
                // The ref, not the closure: a tap during this in-flight write
                // must not be overwritten by the value it started with.
                levelStretch: levelStretchRef.current,
                // The one-off note this book is written with (FEAT-194), off the
                // ref for the same reason.
                customTheme: customThemeRef.current,
              },
              reviewState: {
                ...(current.reviewState ?? {}),
                generateChatState: 'in-progress',
                chatHistory: nextHistory,
                illustrationStyle: style,
                clarificationPhase: phase,
                pendingIdea: idea,
                pendingRefinement: refinement,
              },
            })
          }
        } catch (err) {
          console.warn('Failed to update draft clarification state:', err)
        }
        return
      }

      const newBook: Omit<Book, 'id'> = {
        childId: attribution?.createdFor ?? childId,
        title: '',
        pages: [],
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        subjectBuckets: ['LanguageArts' as SubjectBucket],
        bookType: 'generated',
        source: 'ai-generated',
        theme: inferBookTheme('', [], style) as BookTheme,
        createdBy: attribution?.createdBy ?? childId,
        createdFor: attribution?.createdFor ?? childId,
        generationConfig: {
          storyIdea: idea,
          // The words this flow sends to generateStory (FEAT-169/172) —
          // recorded so the book says what was asked for. `theme` above stays
          // `[]`-based on purpose: `inferBookTheme` with words returns
          // `sight_words` and would drop the picked illustration style's theme.
          words: wordsForIdea,
          style,
          pageCount,
          // The level this book was written at (FEAT-191) — recorded on the
          // book so a resumed draft restores it and every later revise is
          // levelled against the book, not against today's default. Read off
          // the ref so it is the parent's latest pick, not the render's.
          levelStretch: levelStretchRef.current,
          // The one-off note this book is written with (FEAT-194) — recorded on
          // the book for the same reasons, and read off its own ref.
          customTheme: customThemeRef.current,
        },
        reviewState: {
          generateChatState: 'in-progress',
          chatHistory: nextHistory,
          illustrationStyle: style,
          clarificationPhase: phase,
          pendingIdea: idea,
          pendingRefinement: refinement,
        },
      }
      const writtenStretch = levelStretchRef.current
      const writtenNote = customThemeRef.current
      try {
        const ref = await addDoc(booksCollection(familyId), newBook as Book)
        setBookId(ref.id)
        // See `flushLevelStretch` — this is the create the round-2 finding is
        // actually about: the clarification branch never sets `isLoading`.
        flushLevelStretch(ref.id, writtenStretch)
        flushCustomTheme(ref.id, writtenNote)
      } catch (err) {
        console.error('Failed to create draft clarification book:', err)
      }
    },
    [familyId, childId, bookId, attribution, pageCount, flushLevelStretch, flushCustomTheme, fallbackWords],
  )

  // ── Send a kid message ───────────────────────────────────────

  const sendKidMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const ts = Date.now()
      const kidTurn: ChatTurn = { role: 'kid', content: trimmed, ts }

      // ── Post-story revision branch ──
      if (clarificationPhase === 'ready') {
        const historyWithKid: ChatTurn[] = [...chatHistory, kidTurn]
        setChatHistory(historyWithKid)
        setIsLoading(true)
        setError(null)
        try {
          const result = await chat({
            familyId,
            childId,
            taskType: 'reviseStory' as TaskType,
            messages: [
              {
                role: 'user',
                content: JSON.stringify({
                  // The book, not the level (FEAT-191): the server reads the
                  // stretch off this book's own `generationConfig`, so a revise
                  // cannot assert a level and cannot silently drop the one the
                  // book was written at. `null` on a draft whose create failed.
                  bookId,
                  chatHistory: historyWithKid.map((t) => ({
                    role: t.role,
                    content: t.content,
                  })),
                  currentStory,
                  childCalibration: {
                    childAge,
                    childName,
                    illustrationStyle,
                    // Revisions inherit the book's actual length (FEAT-97) — the
                    // revise prompt locks "do not add or remove pages", so the
                    // book's real page count is the source of truth, not the
                    // (now user-adjustable) generation target.
                    pageCount: currentStory?.pages.length ?? pageCount,
                  },
                  newFeedback: trimmed,
                }),
              },
            ],
          })
          // The same three failure shapes the first draft has, named the same
          // way (UX-112) — the revise loop kept the pre-FEAT-169 "I had trouble
          // with that" for both, which told a parent nothing about which of the
          // two happened or what to do next.
          const parsed = result?.message ? parseReviseResult(result.message) : null
          if (!parsed) {
            setError(
              storyGenerationFailureMessage(
                classifyStoryGenerationFailure(result, parsed) ?? 'unreadable',
                STORY_REVISE_SURFACE,
              ),
            )
            return
          }
          const aiTurn: ChatTurn = {
            role: 'ai',
            content: parsed.humanResponse,
            ts: Date.now(),
            kind: 'revision',
          }
          const nextHistory: ChatTurn[] = [...historyWithKid, aiTurn]
          const nextStory =
            parsed.storyUpdated && parsed.updatedStory
              ? parsed.updatedStory
              : currentStory
          setChatHistory(nextHistory)
          if (parsed.storyUpdated && parsed.updatedStory) {
            setCurrentStory(parsed.updatedStory)
          }
          if (nextStory) {
            await persistStory(
              nextStory,
              nextHistory,
              illustrationStyle,
              'in-progress',
              'ready',
              pendingIdea,
              null,
            )
          }
        } finally {
          setIsLoading(false)
        }
        return
      }

      // ── Clarification branch — no AI call ──
      setError(null)

      if (chatHistory.length === 0) {
        // First message ever → echo turn.
        const aiTurn: ChatTurn = {
          role: 'ai',
          content: echoMessage(trimmed),
          ts: Date.now(),
          kind: 'echo',
        }
        const nextHistory: ChatTurn[] = [...chatHistory, kidTurn, aiTurn]
        setChatHistory(nextHistory)
        setPendingIdea(trimmed)
        setPendingRefinement(null)
        await persistClarification(
          nextHistory,
          illustrationStyle,
          'clarifying',
          trimmed,
          null,
        )
        return
      }

      if (pendingRefinement === null) {
        // The Yes button is on screen and the chat just asked a yes/no
        // question, so a bare answer to it is an ANSWER, not a new idea
        // (UX-110). "yes" used to become part of the story idea.
        const reply = classifyClarificationReply(trimmed)
        if (reply === 'affirmative' && pendingIdea) {
          await confirmStartStoryRef.current?.()
          return
        }
        if (reply === 'negative' && pendingIdea) {
          const nudgeTurn: ChatTurn = {
            role: 'ai',
            content: DECLINED_START_NUDGE,
            ts: Date.now(),
            kind: 'echo',
          }
          const nudged: ChatTurn[] = [...chatHistory, kidTurn, nudgeTurn]
          setChatHistory(nudged)
          await persistClarification(
            nudged,
            illustrationStyle,
            'clarifying',
            pendingIdea,
            null,
          )
          return
        }

        // Kid sent a follow-up during clarification → Add/Change prompt.
        const aiTurn: ChatTurn = {
          role: 'ai',
          content: ADD_OR_CHANGE_FIRST,
          ts: Date.now(),
          kind: 'add-or-change',
        }
        const nextHistory: ChatTurn[] = [...chatHistory, kidTurn, aiTurn]
        setChatHistory(nextHistory)
        setPendingRefinement(trimmed)
        await persistClarification(
          nextHistory,
          illustrationStyle,
          'clarifying',
          pendingIdea,
          trimmed,
        )
        return
      }

      // Kid sent yet another message while Add-or-Change was pending —
      // overwrite the pending refinement and ask again.
      const aiTurn: ChatTurn = {
        role: 'ai',
        content: ADD_OR_CHANGE_OVERWRITE,
        ts: Date.now(),
        kind: 'add-or-change',
      }
      const nextHistory: ChatTurn[] = [...chatHistory, kidTurn, aiTurn]
      setChatHistory(nextHistory)
      setPendingRefinement(trimmed)
      await persistClarification(
        nextHistory,
        illustrationStyle,
        'clarifying',
        pendingIdea,
        trimmed,
      )
    },
    [
      bookId,
      chat,
      chatHistory,
      currentStory,
      clarificationPhase,
      familyId,
      childId,
      childName,
      childAge,
      illustrationStyle,
      pageCount,
      pendingIdea,
      pendingRefinement,
      persistClarification,
      persistStory,
    ],
  )

  // ── Confirm start story (kid taps "Yes, start my story!") ────

  const confirmStartStory = useCallback(async () => {
    if (clarificationPhase !== 'clarifying') return
    if (pendingRefinement !== null) return
    if (!pendingIdea) return
    // Wait for the list to settle so the call carries the child's real words
    // (or a settled, honest `[]`) — never a not-yet-loaded one. A typed list
    // (FEAT-172) never waits: it does not read the practice list.
    if (storyWordsLoading) return

    setIsLoading(true)
    setError(null)
    const priorPhase = clarificationPhase
    setClarificationPhase('ready')
    try {
      const result = await chat({
        familyId,
        childId,
        taskType: 'generateStory' as TaskType,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              storyIdea: pendingIdea,
              // The structured list the server threads into the prompt's
              // "weave 3-5 of these in" instruction (FEAT-169): the words the
              // parent typed into the idea when there are any (FEAT-172), else
              // the child's practice words.
              words: storyWords,
              pageCount,
              // FEAT-191 — the parent's per-story "one step up". The server
              // raises the level the story is WRITTEN at and the level it is
              // CHECKED at together, so a book asked for one rung higher is not
              // then flagged word by word for being exactly that. 0 (the
              // default) is byte-for-byte the pre-FEAT-191 request. Off the
              // ref, so a tap in the same tick as the confirm still counts.
              levelStretch: levelStretchRef.current,
              // Deliberately `[]`: with words, inferBookTheme returns
              // `sight_words` and the picked style's theme guidance is lost.
              theme: inferBookTheme(pendingIdea, [], illustrationStyle),
              // The parent's one-off note (FEAT-194). Spread conditionally so a
              // book without one sends a payload byte-identical to before this
              // run. The server prefers it over `theme` above — that id is
              // INFERRED from the idea, and a note is what a parent actually
              // said — and threads it into the STORY prompt only; it can never
              // reach an image prompt (see `customStoryTheme.ts`).
              ...(customThemeRef.current ? { customTheme: customThemeRef.current } : {}),
            }),
          },
        ],
      })
      const story = result?.message ? parseGeneratedStory(result.message) : null
      // A failure that names itself (FEAT-169): no reply, cut short by the
      // output budget, or unreadable — each with its own next step.
      const failure = classifyStoryGenerationFailure(result, story)
      if (failure || !story) {
        setError(storyGenerationFailureMessage(failure ?? 'unreadable'))
        setClarificationPhase(priorPhase)
        return
      }
      const aiTurn: ChatTurn = {
        role: 'ai',
        // Reports which words actually landed on a page, checked against the
        // text — never the model's own claim (FEAT-169) — and names which
        // source they were (FEAT-172). FEAT-176 adds the honest line: what the
        // server measured as above this child's reading level, if anything.
        content: storyDraftMessage(
          story.title,
          storyWords,
          story.pages,
          storyWordSource,
          result?.readability,
          childName,
        ),
        // The same line minus the honest clause — what the chat's TTS is
        // allowed to say (UX-109). The clause names words above the child's
        // level and is for the parent's eyes only, so it has one delivery:
        // the screen.
        spokenContent: storyDraftSpokenMessage(
          story.title,
          storyWords,
          story.pages,
          storyWordSource,
          childName,
        ),
        ts: Date.now(),
        kind: 'story-draft',
      }
      const nextHistory: ChatTurn[] = [...chatHistory, aiTurn]
      setCurrentStory(story)
      setChatHistory(nextHistory)
      await persistStory(
        story,
        nextHistory,
        illustrationStyle,
        'in-progress',
        'ready',
        pendingIdea,
        null,
      )
    } finally {
      setIsLoading(false)
    }
  }, [
    chat,
    chatHistory,
    childName,
    clarificationPhase,
    familyId,
    childId,
    illustrationStyle,
    pageCount,
    pendingIdea,
    pendingRefinement,
    persistStory,
    storyWords,
    storyWordSource,
    storyWordsLoading,
  ])

  // The bare-"yes" branch in `sendKidMessage` above reaches the tap through
  // this ref, so both stay one implementation (UX-110).
  confirmStartStoryRef.current = confirmStartStory

  // ── Confirm add refinement ───────────────────────────────────

  const confirmAddRefinement = useCallback(async () => {
    if (pendingRefinement === null) return
    const joined = joinIdeas(pendingIdea, pendingRefinement)
    const aiTurn: ChatTurn = {
      role: 'ai',
      content: echoUpdatedMessage(joined),
      ts: Date.now(),
      kind: 'echo',
    }
    const nextHistory: ChatTurn[] = [...chatHistory, aiTurn]
    setPendingIdea(joined)
    setPendingRefinement(null)
    setChatHistory(nextHistory)
    await persistClarification(
      nextHistory,
      illustrationStyle,
      'clarifying',
      joined,
      null,
    )
  }, [
    chatHistory,
    illustrationStyle,
    pendingIdea,
    pendingRefinement,
    persistClarification,
  ])

  // ── Confirm change refinement ────────────────────────────────

  const confirmChangeRefinement = useCallback(async () => {
    if (pendingRefinement === null) return
    const next = pendingRefinement
    const aiTurn: ChatTurn = {
      role: 'ai',
      content: echoUpdatedMessage(next),
      ts: Date.now(),
      kind: 'echo',
    }
    const nextHistory: ChatTurn[] = [...chatHistory, aiTurn]
    setPendingIdea(next)
    setPendingRefinement(null)
    setChatHistory(nextHistory)
    await persistClarification(
      nextHistory,
      illustrationStyle,
      'clarifying',
      next,
      null,
    )
  }, [
    chatHistory,
    illustrationStyle,
    pendingRefinement,
    persistClarification,
  ])

  // ── Commit + abandon ─────────────────────────────────────────

  const commitAndClose = useCallback(async (): Promise<string | null> => {
    if (!currentStory) return null
    const finalId = await persistStory(
      currentStory,
      chatHistory,
      illustrationStyle,
      'completed',
      'ready',
      pendingIdea,
      null,
    )
    const resolvedId = finalId ?? bookId
    if (!resolvedId) return null

    const themeId = inferBookTheme(pendingIdea, [], illustrationStyle)

    await illustrate({
      bookId: resolvedId,
      pages: currentStory.pages.map((p) => ({
        pageNumber: p.pageNumber,
        sceneDescription: p.sceneDescription ?? '',
      })),
      style: illustrationStyle,
      bookTheme: themeId,
      familyId,
      onProgress: setIllustrationProgress,
    })

    return resolvedId
  }, [
    currentStory,
    chatHistory,
    illustrationStyle,
    persistStory,
    bookId,
    pendingIdea,
    familyId,
    illustrate,
  ])

  const abandonDraft = useCallback(async (): Promise<void> => {
    // Allowed any time before an AI story-draft turn exists — the kid can
    // bail out of clarification freely. Once a story-draft exists, the draft
    // persists for resumption (no-op here).
    if (currentStory !== null) return
    setChatHistory([])
    setPendingIdea('')
    setPendingRefinement(null)
    setClarificationPhase('clarifying')
    setError(null)
  }, [currentStory])

  const canStartStory =
    clarificationPhase === 'clarifying' &&
    pendingRefinement === null &&
    pendingIdea.trim().length > 0 &&
    !storyWordsLoading

  return {
    chatHistory,
    currentStory,
    illustrationStyle,
    isLoading,
    error,
    bookId,
    clarificationPhase,
    pendingIdea,
    pendingRefinement,
    canStartStory,
    pageCount,
    setPageCount,
    levelStretch,
    setLevelStretch,
    customTheme,
    setCustomTheme,
    storyWords,
    storyWordSource,
    storyWordsLoading,
    illustrationProgress,
    sendKidMessage,
    setIllustrationStyle,
    commitAndClose,
    abandonDraft,
    confirmStartStory,
    confirmAddRefinement,
    confirmChangeRefinement,
  }
}
