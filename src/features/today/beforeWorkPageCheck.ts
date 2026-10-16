/**
 * The before-work page check — the prospective question, and its contract.
 *
 * ── What this is ─────────────────────────────────────────────────────────────
 * A parent holds a page the child has **not done yet** and asks one question:
 * *is this page roughly right for him today, and if not, what would I change?*
 * That is a **prospective** question. The door it replaced asked it through the
 * retrospective pipeline, which reads a page as evidence of work and is allowed
 * to move the family's records for it (`activityConfigs` positions,
 * `childSkillMaps`, `skillSnapshots`, day rows, hours, rewards).
 *
 * ── The contract, stated once ────────────────────────────────────────────────
 * A prospective check:
 *  - **changes no learning or progress record.** No activity config
 *    create/advance, no skill map, no working level or snapshot, no learner
 *    model, no hours, no rewards, no day row — not even a `scanned` flag, and
 *    not the checklist identity preparation that a row write would have needed.
 *    That includes the SERVER side: `functions/src/ai/chat.ts` runs the workbook
 *    `activityConfigs` backfill for every child before dispatch, and this intent
 *    skips it (`functions/src/ai/prospectiveCheck.ts`).
 *  - **persists no record or image of its own.** No `scans` document, no Storage
 *    upload. See `docs/review/BEFORE_WORK_PAGE_CHECK.md` for why that was chosen
 *    over an additive `purpose` field: every existing reader of
 *    `families/{id}/scans` treats a document in that collection as evidence
 *    (`loadRecentScansContext` reads *pending* scans and equates a `skip`
 *    recommendation with mastery), and those reads are capped, so a prospective
 *    row would both leak and starve.
 *  - **does leave the operational rows every AI call leaves** — the rate-limit
 *    entry, the AI usage row, an error row on failure. The copy here says so;
 *    "nothing is recorded" would be a sentence the code contradicts.
 *  - **claims nothing about the child from the page.** A page the child has not
 *    touched is evidence about the *page*. It cannot show mastery, and it cannot
 *    show that the lessons before it are done.
 *  - **answers "I can't tell" when the evidence is incomplete** rather than
 *    guessing — a blank page, an unreadable photo, a page nobody can place, or
 *    no recorded evidence about the child to judge fit against.
 *
 * This module is pure: the copy a parent reads and the mapping from a reply to a
 * tentative answer. No I/O, no React. Staleness is the controller's job.
 */

import { ScanFailureKind } from '../../core/hooks/scanAnalysis'
import type { ScanResult, WorksheetScanResult } from '../../core/types'

/*
 * The intent is NOT a constant in this module any more.
 *
 * It was `checkPurpose: 'before-work-page-check'`, sent inside the message
 * payload. It is now the request's own task name — `TaskType.PageCheck`, read
 * by the dispatcher and by the task registry (`useProspectivePageCheck`,
 * `functions/src/ai/prospectiveCheck.ts`). A payload flag could not be seen by
 * the backfill that runs before any handler, and — because hosting deploys
 * before functions — an older dispatcher served such a request as an ordinary
 * retrospective scan instead of refusing it.
 */

/*
 * Staleness is NOT decided here.
 *
 * An earlier draft exported `BeforeWorkCheckOrigin` / `sameBeforeWorkOrigin`
 * for it, and an independent host test showed why a value compared after the
 * fact is the wrong shape for this problem: a native file picker delivers its
 * file from OUTSIDE React, long after the render that opened it, so by the time
 * two origins could be compared the stale callback has already run. The rule
 * now lives in `useBeforeWorkPageCheck` as a monotonic **selection token** held
 * in a ref and bound to the element that opened the picker. Those helpers are
 * gone rather than left as a second, weaker answer to the same question.
 */

/**
 * Where the check is in its one cycle.
 *
 * Lives here rather than beside the hook so the sheet can render a status
 * without importing the hook — and with it the AI client and Firebase — which
 * keeps the view testable on its own.
 */
export const BeforeWorkCheckStatus = {
  /** No check open. */
  Idle: 'idle',
  /** A request is in flight. */
  Running: 'running',
  /** An answer (or an honest non-answer) is on screen. */
  Answered: 'answered',
} as const
export type BeforeWorkCheckStatus =
  (typeof BeforeWorkCheckStatus)[keyof typeof BeforeWorkCheckStatus]

/**
 * The tentative answer. Deliberately about the PAGE and about TODAY — never
 * about what the child knows.
 */
export const BeforeWorkSuitability = {
  /** The page looks like a fair fit for today. */
  Workable: 'workable',
  /** The page looks easy for him today. NOT a mastery claim. */
  Easy: 'easy',
  /** Doable with a change — fewer problems, read it aloud, split it. */
  NeedsTweak: 'needs-tweak',
  /** A stretch today; worth a different page or a lot of support. */
  Stretch: 'stretch',
  /** The photo does not support an answer. */
  Inconclusive: 'inconclusive',
} as const
export type BeforeWorkSuitability =
  (typeof BeforeWorkSuitability)[keyof typeof BeforeWorkSuitability]

/** The one-line label for each answer. Tentative by construction. */
export const SUITABILITY_LABEL: Record<BeforeWorkSuitability, string> = {
  [BeforeWorkSuitability.Workable]: 'Looks about right for today',
  [BeforeWorkSuitability.Easy]: 'Looks easy for today',
  [BeforeWorkSuitability.NeedsTweak]: 'Doable with a tweak',
  [BeforeWorkSuitability.Stretch]: 'Looks like a stretch today',
  [BeforeWorkSuitability.Inconclusive]: "Can't tell from this photo",
}

/**
 * What a parent reads under every answer, including an inconclusive one.
 *
 * The claim is deliberately **"no learning or progress records change"** and not
 * *"nothing is recorded"*. The call really does leave operational records
 * behind — the rate-limit entry the callable writes before dispatch, the AI
 * usage row the handler writes after, and an error-log row when something
 * fails — so a flat "nothing was recorded" would be a sentence the code
 * contradicts. What is true, and is the thing a parent is actually asking, is
 * that no record OF THE CHILD'S LEARNING moves.
 */
export const BEFORE_WORK_UNCERTAINTY =
  "This is a guess from one photo of a page he hasn't done yet — not a measure of what he knows. No learning or progress records change."

/**
 * What the app discloses BEFORE the camera or the file picker opens.
 *
 * Three lines, phone-width, each one a thing that actually happens:
 *
 *  1. where the photo goes and what is NOT kept — the app writes no `scans`
 *     document and no Storage object for this door, so the photo and the answer
 *     exist only in the request and on the screen;
 *  2. what IS kept — the operational rows every AI call leaves (rate limit, AI
 *     usage, and an error row when one fails). Deliberately not phrased as a
 *     quota being decremented: nothing in this repo meters a family allowance,
 *     so claiming one would be inventing a fact;
 *  3. what closing does and does not do. A request already sent cannot be
 *     recalled and no provider-side deletion is implemented, so neither is
 *     claimed.
 */
export const BEFORE_WORK_DISCLOSURE: readonly string[] = [
  'The photo is sent to the AI to read. The app saves neither the photo nor the answer.',
  'The call itself is logged like any other AI call — AI usage, and an error entry if it fails.',
  'Closing doesn’t cancel a request already sent. Either way, no learning or progress records change.',
]

/** Said once on the entry, before the buttons, in one phone-width sentence. */
export const BEFORE_WORK_ENTRY_BLURB =
  'Hold up a page he hasn’t done yet and ask whether it suits him today. Advice only — no learning or progress records change.'

/**
 * What a parent reads when the answer did not come back.
 *
 * `NotDelivered` is carefully worded: it is the app's own `{"error": …}`
 * envelope or a failed request, and **neither proves the photo never reached the
 * AI**. The first draft said "the photo didn't reach the AI", which is a claim
 * the client cannot make — a request can fail after the image was received.
 */
export const BEFORE_WORK_FAILURE_MESSAGE: Record<ScanFailureKind, string> = {
  [ScanFailureKind.CutShort]:
    'The answer was cut off before it finished — that’s on us, not the page. No learning or progress records change. Try one page at a time.',
  [ScanFailureKind.Refused]:
    'The AI would not look at this picture. No learning or progress records change — try a different photo of the page.',
  [ScanFailureKind.NotDelivered]:
    'The request failed, so there’s no answer. It may or may not have reached the AI. No learning or progress records change — check your connection and try again.',
  [ScanFailureKind.Unreadable]:
    'The answer came back in a form the app couldn’t read. No learning or progress records change — try that page again.',
}

/** The compress / format / network failures around the call itself. */
export const BEFORE_WORK_SEND_FAILED =
  'Something went wrong sending this, so there’s no answer. It may or may not have reached the AI. No learning or progress records change — try again.'

/**
 * The release-skew sentence: the app is newer than the service behind it.
 *
 * `deploy.yml` publishes hosting before functions, so for a window this app can
 * ask for a check the deployed functions do not know. They refuse it by name in
 * the dispatcher's own validation, which runs before the rate-limit write,
 * before the workbook backfill and before any handler — so in this one case
 * literally nothing is written, not even an operational row. "Try again" would
 * be false advice, so this says what is true and what to do instead.
 */
export const BEFORE_WORK_CHECK_UNAVAILABLE =
  'This check isn’t available yet — the app is newer than the service behind it, so the page wasn’t looked at and nothing at all was written. Try again after the next app update; nothing here needs fixing.'

/** What a cancel truthfully achieves: the screen, not the server. */
export const BEFORE_WORK_CANCEL_NOTICE =
  'Stopped. We won’t show the answer. A request already sent can’t be called back and still shows in the AI usage log. No learning or progress records change.'

/**
 * A last-resort filter over model prose — **heuristic, and not a guarantee.**
 *
 * The real defences against an ability claim are upstream and structural: the
 * prospective prompt is its own prompt with its own small schema (no
 * `suggestedSnapshotUpdate`, no `masteredSkills`, no skill alignment), it asks
 * for two short hedged sentences, and the app caps what it renders. This regex
 * catches the obvious phrasings that still get through; it cannot catch a claim
 * worded in a way nobody anticipated, and it is not presented as if it could.
 * The uncertainty line under every answer is what actually carries the honest
 * limit, which is why it is unconditional rather than shown only on failure.
 */
const MASTERY_CLAIM = new RegExp(
  [
    'master(?:ed|y|s)\\b',
    '\\bhas (?:already )?(?:learned|mastered|completed|finished)\\b',
    '\\b(?:already )?knows (?:this|it|these|them|all)\\b',
    '\\bproficient\\b',
    '\\bfluent in\\b',
    '\\b(?:previous|prior|earlier|preceding) lessons? (?:are|were|have been) (?:complete|completed|done|finished)\\b',
    '\\bhas (?:clearly )?(?:got|grasped) (?:this|it)\\b',
    '\\bno longer needs\\b',
    '\\bis (?:at|beyond) (?:a )?(?:level|grade) \\d',
  ].join('|'),
  'i',
)

/** Split on sentence ends, keeping it dumb and predictable. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Model prose with any ability claim removed. `null` when nothing survives —
 * the panel then says it has no reason rather than showing a half sentence.
 *
 * Exported for the test that pins it; the two callers below are the only
 * production ones.
 */
export function withoutAbilityClaims(text: string | undefined | null): string | null {
  const raw = (text ?? '').trim()
  if (!raw) return null
  const kept = sentences(raw).filter((s) => !MASTERY_CLAIM.test(s))
  if (kept.length === 0) return null
  return kept.join(' ')
}

/** How long a model paragraph may be on a phone before it is cut. */
const PROSE_LIMIT = 320

function clamp(text: string | null): string | null {
  if (text == null) return null
  if (text.length <= PROSE_LIMIT) return text
  return `${text.slice(0, PROSE_LIMIT - 1).trimEnd()}…`
}

/** What the result panel renders. Nothing else is shown. */
export interface BeforeWorkCheckSummary {
  /** False when the photo did not support an answer. */
  conclusive: boolean
  suitability: BeforeWorkSuitability
  suitabilityLabel: string
  /** "Math — two-digit addition with regrouping", or null when unknown. */
  subjectLine: string | null
  /** The workbook/lesson the page names, when it names one. Display only. */
  pageLine: string | null
  /** Why, in the model's words, ability claims removed. */
  reason: string | null
  /** The practical change to make. Model's words, ability claims removed. */
  adaptation: string | null
  /**
   * What the model itself said it could not tell (`limits`, a field only the
   * prospective schema has). Shown beside the app's own uncertainty line, so
   * the parent gets the specific gap as well as the general caveat. `null` when
   * the reply had none.
   */
  limits: string | null
  /** Always present, whatever the answer. */
  uncertainty: string
  /** Set when there is no answer at all: the failure sentence to show. */
  failureMessage?: string
}

const INCONCLUSIVE_BASE = {
  conclusive: false as const,
  suitability: BeforeWorkSuitability.Inconclusive,
  suitabilityLabel: SUITABILITY_LABEL[BeforeWorkSuitability.Inconclusive],
  uncertainty: BEFORE_WORK_UNCERTAINTY,
}

/** The answer for "there is no analysis" — a failure, or a refusal to guess. */
export function inconclusiveBeforeWorkSummary(
  failureMessage?: string,
  reason?: string | null,
): BeforeWorkCheckSummary {
  return {
    ...INCONCLUSIVE_BASE,
    subjectLine: null,
    pageLine: null,
    reason: reason ?? null,
    adaptation: null,
    limits: null,
    ...(failureMessage ? { failureMessage } : {}),
  }
}

const RECOMMENDATIONS = new Set(['do', 'skip', 'quick-review', 'modify'])
const DIFFICULTIES = new Set(['easy', 'appropriate', 'challenging', 'too-hard'])

/** A blank-ish model string: empty, whitespace, or a literal unknown. */
function isBlank(value: string | undefined | null): boolean {
  const text = (value ?? '').trim().toLowerCase()
  return (
    text.length === 0 ||
    text === 'unknown' ||
    text === 'n/a' ||
    text === 'none' ||
    text === 'null' ||
    text === 'other'
  )
}

/**
 * Map the analysis onto the tentative answer.
 *
 * The two inputs are the model's own `recommendation` and `estimatedDifficulty`,
 * and the harder of the two wins — a page the model called `do` while calling it
 * `too-hard` is a stretch, not a fit. `skip` maps to **"looks easy for today"**
 * and never to anything about mastery: the retrospective door reads `skip` as
 * *he is past this, advance the workbook*, and that reading is the single most
 * important thing this surface does not do.
 */
function suitabilityFor(
  recommendation: string,
  difficulty: string,
): BeforeWorkSuitability {
  if (difficulty === 'too-hard') return BeforeWorkSuitability.Stretch
  if (recommendation === 'modify') return BeforeWorkSuitability.NeedsTweak
  if (difficulty === 'challenging') return BeforeWorkSuitability.NeedsTweak
  if (recommendation === 'skip' || recommendation === 'quick-review' || difficulty === 'easy') {
    return BeforeWorkSuitability.Easy
  }
  return BeforeWorkSuitability.Workable
}

function subjectLineFor(result: WorksheetScanResult): string | null {
  const subject = isBlank(result.subject) ? null : result.subject.trim()
  const topic = isBlank(result.specificTopic) ? null : result.specificTopic.trim()
  if (subject && topic) return `${subject} — ${topic}`
  return topic ?? subject
}

function pageLineFor(result: WorksheetScanResult): string | null {
  const detected = result.curriculumDetected
  if (!detected) return null
  const name = isBlank(detected.name) ? null : detected.name!.trim()
  const lesson =
    detected.lessonNumber != null
      ? `Lesson ${detected.lessonNumber}`
      : detected.pageNumber != null
        ? `Page ${detected.pageNumber}`
        : null
  if (name && lesson) return `${name} — ${lesson}`
  return name ?? lesson
}

/**
 * Build what the panel shows from what came back.
 *
 * Every incomplete case lands on inconclusive rather than on a confident
 * sentence built out of defaults: no analysis at all, a certificate (which is a
 * record of past work and answers a different question), a page the model could
 * not place (`pageType: 'other'`), a blank or unreadable page (no subject AND no
 * topic), and a reply whose recommendation or difficulty is not one of the
 * values the prompt asks for.
 */
export function summarizeBeforeWorkCheck(
  results: ScanResult | null | undefined,
  failure?: { kind?: ScanFailureKind; message?: string },
): BeforeWorkCheckSummary {
  if (!results) {
    const message = failure?.kind
      ? BEFORE_WORK_FAILURE_MESSAGE[failure.kind]
      : (failure?.message ?? BEFORE_WORK_SEND_FAILED)
    return inconclusiveBeforeWorkSummary(message)
  }

  if (results.pageType === 'certificate') {
    return inconclusiveBeforeWorkSummary(
      undefined,
      'That looks like a certificate or progress report, not a page to work on. This check only reads a page he hasn’t done yet.',
    )
  }

  const worksheet = results as WorksheetScanResult
  const subjectLine = subjectLineFor(worksheet)
  const reason = clamp(withoutAbilityClaims(worksheet.recommendationReason))
  const adaptation = clamp(withoutAbilityClaims(worksheet.teacherNotes))
  const limits = clamp(withoutAbilityClaims(prospectiveLimits(results)))
  // `readable: false` is the prospective schema's own "I could not read this",
  // and it is believed over anything else the reply managed to fill in.
  const readable = (results as { readable?: unknown }).readable !== false

  // "Nobody can say what this page is" — blank, unreadable, unplaceable.
  if (!readable || worksheet.pageType === 'other' || !subjectLine) {
    return {
      ...INCONCLUSIVE_BASE,
      subjectLine: readable ? subjectLine : null,
      pageLine: readable ? pageLineFor(worksheet) : null,
      reason:
        reason ??
        'The photo doesn’t show enough of a page to say anything useful — it may be blank, cut off, or not a work page.',
      adaptation,
      limits,
    }
  }

  const recommendation = (worksheet.recommendation ?? '').trim()
  const difficulty = (worksheet.estimatedDifficulty ?? '').trim()
  // `unclear` is a value only the prospective schema offers, and it is the
  // answer the prompt asks for when there is no recorded evidence about the
  // child to judge fit against. It lands here, with everything else the app
  // cannot read: an explicit "I can't say" and a confused reply get the same
  // honest screen.
  if (!RECOMMENDATIONS.has(recommendation) || !DIFFICULTIES.has(difficulty)) {
    return {
      ...INCONCLUSIVE_BASE,
      subjectLine,
      pageLine: pageLineFor(worksheet),
      reason:
        reason ??
        'The answer came back without a usable verdict, so there’s nothing to go on here.',
      adaptation,
      limits,
    }
  }

  const suitability = suitabilityFor(recommendation, difficulty)
  return {
    conclusive: true,
    suitability,
    suitabilityLabel: SUITABILITY_LABEL[suitability],
    subjectLine,
    pageLine: pageLineFor(worksheet),
    reason,
    adaptation,
    limits,
    uncertainty: BEFORE_WORK_UNCERTAINTY,
  }
}

/** The prospective schema's own `limits` string, when the reply carried one. */
function prospectiveLimits(results: ScanResult): string | undefined {
  const value = (results as { limits?: unknown }).limits
  return typeof value === 'string' ? value : undefined
}
