/**
 * Name the failure when a paid picture doesn't come back, and say what can be
 * done about *that* failure (FEAT-195).
 *
 * ── What this replaces ───────────────────────────────────────────────────
 *
 * Four doors, four unrelated dead ends. The Book Editor's "Make a picture"
 * dialog had the good copy — two written suggestions plus two free exits (add a
 * drawing, import one) — but as static prose, so the parent had to retype it
 * themselves. `MakeStickerDialog` and `StickerPicker` had one line ("try
 * describing what it looks like instead of using a character name!") and no
 * retry. `SketchScanner` said "Couldn't use that picture. Please try again." for
 * every failure there is — a blocked prompt, a rate limit, a missing API key and
 * a dropped connection all read the same. Nothing anywhere was tappable.
 *
 * That is the FEAT-178 lesson (every help string in one module, derived from
 * what the server actually does) applied to failure instead of help.
 *
 * ── Why five kinds and not one "try again" ───────────────────────────────
 *
 * Different failures have different next steps, and offering the wrong one is
 * worse than offering none: a rate limit does not want a reworded prompt, and a
 * missing API key is not something a six-year-old did. So the kinds are the
 * handler's own branches, and only {@link ImageGenerationFailure.Blocked} — the
 * one a rewording can actually fix — gets alternatives. This is FEAT-169's trio
 * (`storyGenerationFailure.ts`) generalised to the picture doors; that module is
 * the shape mirrored here.
 *
 * ── Where the alternatives come from ─────────────────────────────────────
 *
 * The server's, never invented here. On a refusal `generateImage` /
 * `enhanceSketch` spend one cheap Haiku call for three rewordings of what the
 * person actually asked for and attach them to the `HttpsError` details
 * (`functions/src/ai/imageTasks/imageFailure.ts`). Where that call itself fails
 * — or the door has no words to reword, like an uncaptioned sketch — the list
 * arrives empty and {@link blockedTips} carries written suggestions instead —
 * per door, because advice you cannot follow on the door you are standing at is
 * the same dead end one step removed. The card is never empty because a helper
 * failed.
 *
 * Pure: nothing here calls a function, reads Firestore, spends a generation or
 * touches quota math. The classifier never throws — an error shape it has never
 * seen is {@link ImageGenerationFailure.NoImage}, which offers a plain retry.
 */
import type { ArtHelpAudience } from './artHelpContent'

export const ImageGenerationFailure = {
  /** The image model's safety filter refused. The only kind that gets alternatives. */
  Blocked: 'blocked',
  /** Rate limited upstream — nothing to reword, just wait. */
  Busy: 'busy',
  /** No API key, or the OpenAI org is unverified. A grown-up thing to fix. */
  NotConfigured: 'not-configured',
  /** The call came back with nothing usable, or failed in a way we can't name. */
  NoImage: 'no-image',
  /** It never reached the picture maker — the connection dropped. */
  Offline: 'offline',
} as const
export type ImageGenerationFailure =
  (typeof ImageGenerationFailure)[keyof typeof ImageGenerationFailure]

const KNOWN_KINDS = new Set<string>(Object.values(ImageGenerationFailure))

/**
 * The subset of a Firebase callable rejection this module reads. `useAI` hands
 * it through unchanged (`ImageCallFailure`) so the classifier sees the `code`
 * and the structured `details` the handler declared, not just a flattened
 * message string.
 */
export interface ImageErrorShape {
  /** e.g. `functions/invalid-argument`. */
  code?: string
  message?: string
  /** The handler's `ImageFailureDetails` payload, when this deploy sends one. */
  details?: unknown
}

/** The declared payload, as it survives the callable wire. */
interface DeclaredDetails {
  failure?: unknown
  alternatives?: unknown
}

function readDetails(err: ImageErrorShape | null | undefined): DeclaredDetails | null {
  const d = err?.details
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null
  return d as DeclaredDetails
}

/** The last segment of a callable code — `functions/invalid-argument` → `invalid-argument`. */
function bareCode(code: string | undefined): string {
  if (!code) return ''
  const slash = code.lastIndexOf('/')
  return (slash === -1 ? code : code.slice(slash + 1)).toLowerCase()
}

function isBlockedText(message: string): boolean {
  return /blocked|safety|content.?policy|content_policy/.test(message)
}

/**
 * Classify why a paid picture didn't come back.
 *
 * Reads three things in order of trust: the kind the handler *declared*, the
 * callable's error `code`, then the message text. The declared kind is first
 * because a string match on "blocked" is a rule two files away from the branch
 * that decided it — a reworded error message must never silently turn a refused
 * prompt into a generic retry.
 *
 * Never throws. `null`, `undefined`, a plain `Error`, a shape from an older
 * deploy — all land on {@link ImageGenerationFailure.NoImage}, which offers a
 * plain retry and claims nothing it doesn't know.
 */
export function classifyImageGenerationFailure(
  err: ImageErrorShape | Error | null | undefined,
): ImageGenerationFailure {
  const shape = (err ?? undefined) as ImageErrorShape | undefined

  // 1. What the handler said it was.
  const declared = readDetails(shape)?.failure
  if (typeof declared === 'string' && KNOWN_KINDS.has(declared)) {
    return declared as ImageGenerationFailure
  }

  const message = (shape?.message ?? '').toLowerCase()

  // 2. The callable's own code.
  switch (bareCode(shape?.code)) {
    case 'resource-exhausted':
      return ImageGenerationFailure.Busy
    case 'failed-precondition':
      return ImageGenerationFailure.NotConfigured
    case 'unavailable':
    case 'deadline-exceeded':
    case 'cancelled':
      return ImageGenerationFailure.Offline
    case 'invalid-argument':
      // The only invalid-argument a person can act on is the safety refusal;
      // the rest are our own validation bugs, which read as "no picture".
      return isBlockedText(message)
        ? ImageGenerationFailure.Blocked
        : ImageGenerationFailure.NoImage
  }

  // 3. The message text — an older deploy, or an error that never had a code.
  if (isBlockedText(message)) return ImageGenerationFailure.Blocked
  if (/rate.?limit|too many requests|\b429\b|is busy/.test(message)) {
    return ImageGenerationFailure.Busy
  }
  if (/api key|not configured|verification|organization/.test(message)) {
    return ImageGenerationFailure.NotConfigured
  }
  if (/network|offline|failed to fetch|internet|connection/.test(message)) {
    return ImageGenerationFailure.Offline
  }
  return ImageGenerationFailure.NoImage
}

/**
 * The alternatives the server sent for a refused prompt, cleaned. Empty for
 * every other kind, for an older deploy, and when the suggester itself failed —
 * the card then falls back to {@link blockedTips}.
 */
export function imageFailureAlternatives(
  err: ImageErrorShape | Error | null | undefined,
): string[] {
  const raw = readDetails((err ?? undefined) as ImageErrorShape | undefined)?.alternatives
  if (!Array.isArray(raw)) return []
  return raw
    .filter((a): a is string => typeof a === 'string')
    .map((a) => a.trim())
    .filter((a) => a.length > 0)
    .slice(0, 3)
}

/**
 * What KIND of picture a door makes — and therefore what advice it can honestly
 * give when the suggester came back with nothing (Codex P2, PR #1768).
 *
 * The first cut lifted the Book Editor's two suggestions and showed them
 * everywhere, which made them wrong in two different ways: a sticker door told
 * the person to "describe the world" when what they want is one thing on its
 * own, and a door with no prompt field at all — a sketch redraw, a new version,
 * Kit Builder, the Workshop batch — told them to reword something they cannot
 * reach. Advice you cannot follow is the dead end this run is closing, one step
 * removed. So the tips are named per door, the way `storyGenerationFailure.ts`
 * names its surfaces.
 */
export const ImageRetryDoor = {
  /** A whole page picture or a chat image, from free text — the Book Editor's case. */
  Scene: 'scene',
  /** One thing on its own, from free text — the two sticker makers. */
  Sticker: 'sticker',
  /**
   * A picture made from a drawing the person already has, with no prompt field
   * to reword: Make it fancy, Add version, Make more versions, Kit Builder art,
   * the Workshop's batch. What they CAN change is the style, or the drawing.
   */
  Redraw: 'redraw',
  /**
   * A redraw that DOES carry words — a sticker door with a FEAT-197 "+ My own
   * look" note on it. The same door as {@link ImageRetryDoor.Redraw} in every
   * other respect, but its one free-text field is exactly what the safety filter
   * refused, so here the wording advice is followable and the server's
   * rewordings are rewordings of the note. Splitting it out rather than
   * loosening `Redraw` keeps that door's promise intact: with no note there is
   * still nothing on screen to reword.
   */
  RedrawNote: 'redraw-note',
} as const
export type ImageRetryDoor = (typeof ImageRetryDoor)[keyof typeof ImageRetryDoor]

/**
 * The written suggestions shown when the server sent no alternatives. They are
 * advice, not prompts, so they are shown as text and never as a tappable card —
 * a tap that pasted "Try a different style" into the description box would be a
 * worse dead end than the one this run is closing.
 *
 * Every line names something the reader can actually do **on that door**.
 */
const TIPS: Readonly<
  Record<ImageRetryDoor, Record<ArtHelpAudience, string[]>>
> = {
  // The Book Editor's own two, verbatim — this is the door they were written for.
  [ImageRetryDoor.Scene]: {
    parent: [
      'Describe the world instead of characters — "a colorful world with brick castles" works great.',
      'Try a different style (Storybook or Comic Book work best).',
    ],
    kid: ['Say what it looks like.', 'Try a new style.'],
  },
  // A sticker is one thing on its own. Telling someone to describe a world here
  // would be advice against what the door makes.
  [ImageRetryDoor.Sticker]: {
    parent: [
      'Say what it looks like instead of naming it — "a small round yellow creature with pointy ears" works.',
      'Ask for one thing on its own, not a whole scene.',
    ],
    kid: ['Say what it looks like.', 'Ask for one thing.'],
  },
  // No prompt field on this door, so neither tip may be about wording.
  [ImageRetryDoor.Redraw]: {
    parent: [
      'Try a different style — some looks are stricter than others.',
      'Try another drawing, or crop it closer to just the character.',
    ],
    kid: ['Try a new style.', 'Try a new drawing.'],
  },
  // The same door with a note typed on it (FEAT-197): here there ARE words, and
  // they are what got refused, so the first tip is about them.
  [ImageRetryDoor.RedrawNote]: {
    parent: [
      'Say what the change looks like instead of naming it — "a sparkly blue ice dress" works where a name from a film gets blocked.',
      'Try a smaller change, or clear it and use the style on its own.',
    ],
    kid: ['Say what it looks like.', 'Try a smaller change.'],
  },
}

/** The written suggestions for one door, in one audience's words. */
export function blockedTips(
  door: ImageRetryDoor,
  audience: ArtHelpAudience,
): string[] {
  return TIPS[door][audience]
}

/**
 * What each failure says, in the house shape: what failed, that nothing was
 * spent, and the next step that fits *this* failure.
 *
 * Two audiences on capability (`useActiveChild().isChildProfile`), never a name.
 * The kid lines are held to the shared bar in `src/test/kidReadability.ts` —
 * at most eight words, nothing over two syllables by the vowel-group proxy, and
 * a full stop — which is why each is one short sentence rather than the
 * parent's three.
 */
const FAILURE_MESSAGES: Readonly<
  Record<ImageGenerationFailure, Record<ArtHelpAudience, string>>
> = {
  [ImageGenerationFailure.Blocked]: {
    parent:
      "The picture maker wouldn't draw that one. Nothing was spent, and your words are still here.",
    kid: 'The picture maker said no to that.',
  },
  [ImageGenerationFailure.Busy]: {
    parent:
      'The picture maker is busy right now. Nothing was spent. Wait a moment and try again — there is nothing to reword.',
    kid: 'The picture maker is busy right now.',
  },
  [ImageGenerationFailure.NotConfigured]: {
    parent:
      "The picture maker isn't set up right now — that's a grown-up thing to fix, not anything you did. Nothing was spent.",
    kid: 'Ask Dad to check the picture maker.',
  },
  [ImageGenerationFailure.NoImage]: {
    parent:
      'No picture came back. Nothing was spent. Try again — a second try usually works.',
    kid: 'No picture came back this time.',
  },
  [ImageGenerationFailure.Offline]: {
    parent:
      "That didn't reach the picture maker — the connection dropped on the way. Nothing was spent. Check your connection and try again.",
    kid: 'Check the wifi and try again.',
  },
}

export function imageFailureMessage(
  kind: ImageGenerationFailure,
  audience: ArtHelpAudience,
): string {
  return FAILURE_MESSAGES[kind][audience]
}

/**
 * Only a refusal can be answered with different words. Everything else is a
 * plain retry, and offering a reworded prompt for a rate limit would be a
 * guess dressed as help.
 */
export function offersAlternatives(kind: ImageGenerationFailure): boolean {
  return kind === ImageGenerationFailure.Blocked
}

/** The heading over the tappable choices. Honest: they are guesses, not fixes. */
export const ALTERNATIVES_HEADING: Readonly<Record<ArtHelpAudience, string>> = {
  parent: 'Try one of these',
  kid: 'Try one of these.',
}

/**
 * What a tap costs, said before it is spent. A tapped alternative is a NEW
 * generation and counts as one against the week, exactly like typing the words
 * by hand would.
 */
export const ALTERNATIVE_COST_NOTE: Readonly<Record<ArtHelpAudience, string>> = {
  parent: "Tapping one makes a new picture, and that counts as one against this week's pictures.",
  kid: 'Each one counts as one picture.',
}

/** The heading over the free ways out — a drawing of their own, or a photo. */
export const FREE_EXITS_HEADING: Readonly<Record<ArtHelpAudience, string>> = {
  parent: 'Or add your own picture — these are free:',
  kid: 'Or add your own picture.',
}

/**
 * How the chat tells someone to use one of the alternatives (Codex P2, PR
 * #1768).
 *
 * It used to read "just ask me for it", which does not work: typing a picture
 * request into the composer reaches the text `chat` callable, and Shelly's own
 * system prompt answers image requests by saying to tap the image button. So
 * the line named an action that produces another conversational turn and no
 * picture. It names the control instead — the same control the system prompt
 * already points at.
 */
export const CHAT_ALTERNATIVES_LEAD =
  'Tap the image button and use one of these:'

/**
 * The whole reply for a surface that can only render TEXT — the Shelly chat's
 * image door, whose failures are persisted Firestore messages and so cannot
 * hold a component (Codex P2, PR #1768).
 *
 * The rule it exists to hold: **a refusal always ends with something to do.**
 * The suggester coming back empty is an expected path (it failed, or this is an
 * older deploy), and leaving the reply at "wouldn't draw that one" would be a
 * worse dead end than the line it replaced — so the written tips stand in there
 * exactly as they do on the component doors. Every other kind gets its sentence
 * alone, because for those there is nothing to suggest.
 *
 * Pure. Returns one string with newlines; the caller writes it as the message.
 */
export function imageFailureChatMessage(
  kind: ImageGenerationFailure,
  alternatives: string[],
  audience: ArtHelpAudience,
  door: ImageRetryDoor = ImageRetryDoor.Scene,
): string {
  const head = imageFailureMessage(kind, audience)
  if (!offersAlternatives(kind)) return head
  const lines =
    alternatives.length > 0
      ? [CHAT_ALTERNATIVES_LEAD, ...alternatives.map((a) => `\u2022 ${a}`)]
      : ['Try one of these:', ...blockedTips(door, audience).map((t) => `\u2022 ${t}`)]
  return [head, '', ...lines].join('\n')
}
