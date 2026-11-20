/**
 * Build Studio hours credit — the fixed-credit admission policy (slice 3, increment 1).
 *
 * A pure, deterministic calculation: given ONE already-verified unit of work and the
 * receipts already committed for the same family and child, decide whether the unit is
 * credited and, if so, for how many minutes under which subject. It reads and writes no
 * records, has no clock, does no timezone conversion and fetches nothing.
 *
 * Fixed credit table:
 *
 *   | Verified work                                          | Minutes | Subject                      |
 *   | ------------------------------------------------------ | ------- | ---------------------------- |
 *   | Prediction + exact saved challenge version             | 15      | the authored challenge's     |
 *   | Changed free-building save                             | 15      | SubjectBucket.PracticalArts  |
 *   | Saved Block Muncher idea and proposed test             | 5       | SubjectBucket.LanguageArts   |
 *   | Saved verdict on the exact played Block Muncher build  | 10      | SubjectBucket.PracticalArts  |
 *
 * Rules, applied in this order (first failure wins):
 *
 *   0. `invalid-instant` / `invalid-receipt` — integrity checks, for every credit type. The
 *                             candidate instant must be finite (every acceptance carries it).
 *                             Every in-scope receipt on the candidate's school date must carry
 *                             committed minutes that are a positive safe integer; otherwise the
 *                             date's total cannot be trusted (a negative amount would reserve
 *                             negative capacity and let the cap be bypassed). Receipts on other
 *                             dates are not read for minutes, but still count for rules 1 and 3.
 *   1. `duplicate-source`   — the exact source was already credited, on ANY date. A saved
 *                             version (project + version ID) can be credited once across
 *                             challenge AND free building together. An idea is keyed by its
 *                             request ID; a verdict by request ID + played build ID.
 *   2. `challenge-already-credited-today` — one credit per project + challenge ID per school
 *                             date, whatever its revision or saved version.
 *   3. `invalid-instant` / `free-build-too-soon` — free-building credits must be at least
 *                             15 elapsed minutes apart from every other free-building receipt
 *                             in scope, before OR after, across midnight, in any array order.
 *                             A non-finite instant on a neighbouring receipt is rejected,
 *                             never skipped.
 *   4. `over-daily-cap`     — the whole unit must fit in 240 minutes for the school date.
 *                             No partial credit.
 *
 * WHAT THE CALLER STILL HAS TO PROVE (none of it is checked here):
 *
 *   • the proof itself: for a challenge, the prediction belongs to the exact saved version
 *     being credited. Play is optional and is NOT a requirement of this calculation; the
 *     existing challenge restrictions still require the prediction to come first if Play
 *     happened. The free-building save really changed the project, the Block Muncher request
 *     was persisted and the verdict is on the build that was actually played;
 *   • that family and child identity are the signed-in family's and the selected child's;
 *   • the school date and instant, captured once by the caller (this helper never reads a
 *     clock); the instant is epoch milliseconds;
 *   • that `receipts` is COMPLETE for the scope inside the same transaction as the write:
 *     every exact-source receipt on any date, every receipt on `schoolDate`, and every
 *     free-building receipt near the instant (at least 15 minutes either side, including
 *     across midnight). A receipt that is missing here is a credit that can be double-given;
 *   • that receipt `minutes` are the committed values;
 *   • unknown or malformed ids, dates and shapes (rejected at the integration boundary).
 *
 * Receipts from another family or child are ignored, so a mixed list cannot leak across scope.
 */
import { SubjectBucket } from '../../core/types/enums'
import type { BuildStudioChallengeSubject } from '../../core/types/buildStudio'

/** The most Build Studio may contribute for one child on one school date. */
export const BUILD_STUDIO_DAILY_CREDIT_CAP_MINUTES = 240

/** Free-building credits must be at least this many elapsed minutes apart. */
export const BUILD_STUDIO_FREE_BUILD_SPACING_MINUTES = 15

export const BUILD_STUDIO_CREDIT_MINUTES = {
  challenge: 15,
  freeBuild: 15,
  blockMuncherIdea: 5,
  blockMuncherVerdict: 10,
} as const

export type BuildStudioCreditSource =
  | {
      kind: 'challenge'
      challengeId: string
      challengeRevision: number
      subjectBucket: BuildStudioChallengeSubject
      projectId: string
      versionId: string
    }
  | { kind: 'freeBuild'; projectId: string; versionId: string }
  | { kind: 'blockMuncherIdea'; requestId: string }
  | { kind: 'blockMuncherVerdict'; requestId: string; playedBuildId: string }

export type BuildStudioCreditKind = BuildStudioCreditSource['kind']

/** One unit of verified work offered for credit. `atMs` is epoch milliseconds. */
export interface BuildStudioCreditCandidate {
  familyId: string
  childId: string
  schoolDate: string
  atMs: number
  source: BuildStudioCreditSource
}

/** A previously committed credit, as supplied by the caller. */
export interface BuildStudioCreditReceipt {
  familyId: string
  childId: string
  schoolDate: string
  atMs: number
  minutes: number
  source: BuildStudioCreditSource
}

export type BuildStudioCreditRejection =
  | 'duplicate-source'
  | 'challenge-already-credited-today'
  | 'invalid-instant'
  | 'invalid-receipt'
  | 'free-build-too-soon'
  | 'over-daily-cap'

export type BuildStudioCreditDecision =
  | {
      admitted: true
      minutes: number
      subjectBucket: SubjectBucket
      /** Minutes already committed for the date, plus this unit. */
      totalMinutesAfter: number
    }
  | { admitted: false; reason: BuildStudioCreditRejection }

/** The fixed minutes and subject for a source. */
export function creditForSource(source: BuildStudioCreditSource): {
  minutes: number
  subjectBucket: SubjectBucket
} {
  switch (source.kind) {
    case 'challenge':
      return { minutes: BUILD_STUDIO_CREDIT_MINUTES.challenge, subjectBucket: source.subjectBucket }
    case 'freeBuild':
      return { minutes: BUILD_STUDIO_CREDIT_MINUTES.freeBuild, subjectBucket: SubjectBucket.PracticalArts }
    case 'blockMuncherIdea':
      return { minutes: BUILD_STUDIO_CREDIT_MINUTES.blockMuncherIdea, subjectBucket: SubjectBucket.LanguageArts }
    case 'blockMuncherVerdict':
      return { minutes: BUILD_STUDIO_CREDIT_MINUTES.blockMuncherVerdict, subjectBucket: SubjectBucket.PracticalArts }
  }
}

/**
 * The exact-source identity. Challenge and free building share the saved-version key, so a
 * version cannot be credited through both. JSON keeps ids containing any character distinct.
 */
function exactSourceKey(source: BuildStudioCreditSource): string {
  switch (source.kind) {
    case 'challenge':
    case 'freeBuild':
      return JSON.stringify(['version', source.projectId, source.versionId])
    case 'blockMuncherIdea':
      return JSON.stringify(['idea', source.requestId])
    case 'blockMuncherVerdict':
      return JSON.stringify(['verdict', source.requestId, source.playedBuildId])
  }
}

/**
 * Decide whether `candidate` is credited, given the committed `receipts` for its scope.
 * Pure: the same inputs always give the same decision; nothing is read or written.
 */
export function admitBuildStudioCredit(
  candidate: BuildStudioCreditCandidate,
  receipts: readonly BuildStudioCreditReceipt[],
): BuildStudioCreditDecision {
  const { source, schoolDate, atMs } = candidate
  const scoped = receipts.filter(
    (r) => r.familyId === candidate.familyId && r.childId === candidate.childId,
  )

  // 0. Integrity: every acceptance carries the instant; same-day totals must be trustworthy.
  if (!Number.isFinite(atMs)) return { admitted: false, reason: 'invalid-instant' }
  const sameDay = scoped.filter((r) => r.schoolDate === schoolDate)
  if (sameDay.some((r) => !Number.isSafeInteger(r.minutes) || r.minutes <= 0)) {
    return { admitted: false, reason: 'invalid-receipt' }
  }

  // 1. Exact source, any date, before any cap check.
  const key = exactSourceKey(source)
  if (scoped.some((r) => exactSourceKey(r.source) === key)) {
    return { admitted: false, reason: 'duplicate-source' }
  }

  // 2. One credit per project + challenge ID per school date.
  if (source.kind === 'challenge') {
    const sameChallengeToday = scoped.some(
      (r) =>
        r.schoolDate === schoolDate &&
        r.source.kind === 'challenge' &&
        r.source.projectId === source.projectId &&
        r.source.challengeId === source.challengeId,
    )
    if (sameChallengeToday) return { admitted: false, reason: 'challenge-already-credited-today' }
  }

  // 3. Free-building spacing, by absolute elapsed time (date-independent, order-independent).
  if (source.kind === 'freeBuild') {
    const spacingMs = BUILD_STUDIO_FREE_BUILD_SPACING_MINUTES * 60_000
    for (const r of scoped) {
      if (r.source.kind !== 'freeBuild') continue
      if (!Number.isFinite(r.atMs)) return { admitted: false, reason: 'invalid-instant' }
      if (Math.abs(atMs - r.atMs) < spacingMs) return { admitted: false, reason: 'free-build-too-soon' }
    }
  }

  // 4. The whole unit must fit the date's budget. Written so an unsafe total fails closed.
  const { minutes, subjectBucket } = creditForSource(source)
  const committed = sameDay.reduce((sum, r) => sum + r.minutes, 0)
  const totalMinutesAfter = committed + minutes
  if (!(totalMinutesAfter <= BUILD_STUDIO_DAILY_CREDIT_CAP_MINUTES)) {
    return { admitted: false, reason: 'over-daily-cap' }
  }

  return { admitted: true, minutes, subjectBucket, totalMinutesAfter }
}
