/**
 * Every sentence a Dad Lab upload can end in (FIX-269 / UX-461).
 *
 * Owner, 2026-10-23: *"Seemed like the upload is failing or going forever on
 * Dad's lab."* Asked to narrow it down, he said it was the parent lab report,
 * and that it spun and never finished. Two causes: there was no deadline, and
 * every handler was `try … finally` with no `catch`, so a failure cleared the
 * spinner, attached nothing and said nothing. All the copy for both lives here,
 * in one place, so the parent form and the kid view cannot drift apart.
 *
 * Two audiences, chosen by capability (the kid view is the child profile's
 * surface), never by a name. The kid lines meet the shared readability bar
 * (`src/test/kidReadability.ts`) and are tested against it.
 *
 * Also here: `classifyLabUploadFailure`, which decides which sentence a
 * failure gets, and `labUploadFailureNote`, the report sent to the error sink.
 * The sink note carries the failure's SHAPE only. No child name, lab title,
 * file name or bytes ever reach it.
 */
import { BoundedUploadError, BoundedUploadStop } from '../../core/firebase/upload'
import { sizeToken } from '../../core/hooks/scanFailureNote'

export const LabUploadAudience = {
  Parent: 'parent',
  Kid: 'kid',
} as const
export type LabUploadAudience = (typeof LabUploadAudience)[keyof typeof LabUploadAudience]

export const LabUploadMedium = {
  Photo: 'photo',
  Recording: 'recording',
} as const
export type LabUploadMedium = (typeof LabUploadMedium)[keyof typeof LabUploadMedium]

/** How an upload ended without a file. */
export const LabUploadFailure = {
  /** The deadline passed. Usually a slow connection, so it is not called a failure. */
  Timeout: 'timeout',
  /** A person tapped Cancel. */
  Cancelled: 'cancelled',
  /** Anything else: a refusal, a network error, a write that was rejected. */
  Failed: 'failed',
} as const
export type LabUploadFailure = (typeof LabUploadFailure)[keyof typeof LabUploadFailure]

/**
 * What a parent is told is uploading: the medium, plus the boy it belongs to
 * (the per-child section) or the beat it was captured on (Predict / Try /
 * What we saw). The kid view needs neither, because a kid only ever uploads
 * his own work.
 */
export interface LabUploadSubject {
  medium: LabUploadMedium
  /** The child's display name, for a per-child capture. */
  owner?: string
  /** The beat's title, for a three-beat capture. */
  beat?: string
}

export const LAB_UPLOAD_RETRY_LABEL = 'Try again'
export const LAB_UPLOAD_CANCEL_LABEL = 'Cancel upload'
export const LAB_UPLOAD_DISMISS_LABEL = 'Dismiss'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "Lincoln's photo", "the recording for Predict", "the photo". */
export function parentSubjectPhrase({ medium, owner, beat }: LabUploadSubject): string {
  if (owner) return `${owner}'s ${medium}`
  if (beat) return `the ${medium} for ${beat}`
  return `the ${medium}`
}

const KID_MEDIUM_WORD: Record<LabUploadMedium, string> = {
  [LabUploadMedium.Photo]: 'picture',
  [LabUploadMedium.Recording]: 'voice',
}

/** The line shown while an upload is in the air. */
export function labUploadInFlightLine(
  audience: LabUploadAudience,
  subject: LabUploadSubject,
): string {
  if (audience === LabUploadAudience.Kid) {
    return `Sending your ${KID_MEDIUM_WORD[subject.medium]}.`
  }
  return `Uploading ${parentSubjectPhrase(subject)}…`
}

/**
 * The line an ended upload leaves on screen. Every parent line says that
 * nothing was saved. With the file uploaded before the record, that is true:
 * a failed upload writes no artifact.
 */
export function labUploadFailureLine(
  audience: LabUploadAudience,
  subject: LabUploadSubject,
  failure: LabUploadFailure,
): string {
  if (audience === LabUploadAudience.Kid) {
    const thing = KID_MEDIUM_WORD[subject.medium]
    return failure === LabUploadFailure.Timeout
      ? `Your ${thing} took too long.`
      : `Your ${thing} did not send.`
  }
  const what = capitalize(parentSubjectPhrase(subject))
  switch (failure) {
    case LabUploadFailure.Timeout:
      return `${what} ran out of time on a slow connection. Nothing was saved. Try again when the signal is better.`
    case LabUploadFailure.Cancelled:
      return `${what} was cancelled. Nothing was saved.`
    case LabUploadFailure.Failed:
      return `${what} didn't upload. Nothing was saved.`
  }
}

/** Decide which sentence an error gets. Unknown shapes are `Failed`, never a crash. */
export function classifyLabUploadFailure(err: unknown): LabUploadFailure {
  if (err instanceof BoundedUploadError) {
    return err.code === BoundedUploadStop.Deadline
      ? LabUploadFailure.Timeout
      : LabUploadFailure.Cancelled
  }
  const code = errorCode(err)
  if (code === BoundedUploadStop.Deadline) return LabUploadFailure.Timeout
  if (code === BoundedUploadStop.Cancelled || code === 'storage/canceled') {
    return LabUploadFailure.Cancelled
  }
  return LabUploadFailure.Failed
}

/**
 * The error's own code (`storage/unauthorized`, `unavailable`, `upload/deadline`),
 * kept only when it is code-shaped. Anything else becomes `unknown`, because
 * an error's message is not guaranteed to be free of names.
 */
export function errorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code
    if (typeof code === 'string' && /^[a-z][a-z0-9/_-]{0,63}$/i.test(code)) return code
  }
  return 'unknown'
}

/** Which handler started the upload. A fixed set, so it can never carry a name. */
export const LabUploadHandler = {
  ParentChildPhoto: 'parent-child-photo',
  ParentChildRecording: 'parent-child-recording',
  ParentBeat: 'parent-beat',
  KidPhoto: 'kid-photo',
  KidRecording: 'kid-recording',
} as const
export type LabUploadHandler = (typeof LabUploadHandler)[keyof typeof LabUploadHandler]

export interface LabUploadFailureShape {
  handler: LabUploadHandler
  failure: LabUploadFailure
  /** The file's declared media type, e.g. `image/jpeg`. */
  type: string
  sizeBytes: number
  elapsedMs: number
  code: string
}

/** Elapsed time as whole seconds. No four-digit run, so `redactText` leaves it alone. */
function elapsedToken(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown'
  const s = Math.round(ms / 1000)
  return s > 999 ? '999+s' : `${s}s`
}

/**
 * The sink note. It records the shape and nothing else, and it passes
 * `redactText` unchanged. The size token comes from the scan note's own
 * `sizeToken` and is not a second copy of it.
 */
export function labUploadFailureNote(shape: LabUploadFailureShape): string {
  const type = /^[a-z]+\/[a-z0-9.+-]+$/i.test(shape.type) ? shape.type : 'unknown'
  return [
    `dad-lab upload ${shape.failure}`,
    `handler=${shape.handler}`,
    `type=${type}`,
    `size=${sizeToken(shape.sizeBytes)}`,
    `elapsed=${elapsedToken(shape.elapsedMs)}`,
    `code=${shape.code}`,
  ].join(' ')
}
