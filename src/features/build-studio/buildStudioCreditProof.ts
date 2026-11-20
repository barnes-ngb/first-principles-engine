/**
 * Build Studio hours credit — deterministic source proof, ids, school dates and
 * the admission-bucket shape (LOCAL-VISION-007, slice 3, writer stage 1).
 *
 * PURE. No Firestore, no clock, no locale. Given the exact stored bytes of one
 * saved version (and, for free building, the exact baseline it is compared
 * with) this decides whether the version is provably creditable work, and for
 * which {@link BuildStudioCreditSource}. The admission policy itself
 * (`buildStudioHoursCredit.ts`) is NOT re-implemented here: the writer feeds it
 * the receipts this module parses.
 *
 * What a version must be, in order (first failure wins):
 *
 *   1. `bad-scope`          — the document id, its own childId/projectId/versionId
 *                             and the caller's tuple all agree, and the project is
 *                             the Apple Dash starter's.
 *   2. `not-eligible`       — it carries a real server `acceptedAt`. An older
 *                             version, a retry of an older version, a cached or
 *                             still-pending write has none and is reference only.
 *   3. `malformed-source`   — the stored archive is the canonical archive it
 *                             claims to be (parses, canonical re-serialisation is
 *                             identical, byte size, file count, digest, required
 *                             files, per-file and total caps).
 *   4. A challenge attempt, when the version has ANY `challengeAttempt` field:
 *        `malformed-attempt`   — it does not normalise, or is scoped elsewhere;
 *        `challenge-unverified`— unknown challenge, a revision/subject that is not
 *                             the authored one, or no verified prediction option.
 *      A version that tried a challenge and cannot prove it is NEVER downgraded to
 *      free building. Play is optional and is not asked for.
 *   5. Otherwise free building: `baseline-unreadable` when the baseline is
 *      malformed or belongs elsewhere, `unchanged` when the exact canonical bytes
 *      (minus `_`-private keys and {@link EDITOR_SCRATCH_FILES}) equal the baseline.
 */
import type { SubjectBucket } from '../../core/types/enums'
import {
  BUILD_STUDIO_CHALLENGE_SUBJECTS,
  BUILD_STUDIO_MAX_ARCHIVE_BYTES,
  BUILD_STUDIO_MAX_FILES,
  BUILD_STUDIO_MAX_FILE_BYTES,
  buildStudioSourceDigest,
  buildStudioSourceKeys,
  buildStudioVersionDocId,
  EDITOR_SCRATCH_FILES,
  normalizeChallengeAttempt,
  parseBuildStudioSource,
  serializeBuildStudioSource,
  utf8ByteLength,
  type BuildStudioChallengeSubject,
  type BuildStudioSourceFiles,
} from '../../core/types/buildStudio'
import { challengeById } from './buildStudioChallenges'
import {
  admitBuildStudioCredit,
  BUILD_STUDIO_DAILY_CREDIT_CAP_MINUTES,
  creditForSource,
  type BuildStudioCreditDecision,
  type BuildStudioCreditReceipt,
  type BuildStudioCreditSource,
} from './buildStudioHoursCredit'
import { BUILD_STUDIO_PROJECT_ID, starterSourceFiles } from './buildStudioStarter'

// ── Ids ─────────────────────────────────────────────────────────────────────

/**
 * Every id that becomes part of a Firestore path. Narrower than the version
 * writer's own rule on purpose: NO `.`, which is the separator the credit ids
 * use, so two different tuples can never build the same id.
 */
const PATH_ID = /^[A-Za-z0-9_-]{1,64}$/
const SCHOOL_DATE = /^\d{4}-\d{2}-\d{2}$/

export const isCreditPathId = (value: unknown): value is string =>
  typeof value === 'string' && PATH_ID.test(value)

/** A real calendar date `YYYY-MM-DD` (rejects `2026-02-31`). */
export function isSchoolDate(value: unknown): value is string {
  if (typeof value !== 'string' || !SCHOOL_DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** The consumed-source receipt id for one exact version. */
export const creditReceiptId = (childId: string, projectId: string, versionId: string): string =>
  `${childId}.${projectId}.${versionId}`

/** The admission bucket id for one child and one local day. */
export const creditDayId = (childId: string, schoolDate: string): string => `${childId}.${schoolDate}`

/** The deterministic `hours` document id for one receipt. */
export const creditHoursId = (childId: string, projectId: string, versionId: string): string =>
  `bsc.${childId}.${projectId}.${versionId}`

// ── Dates ───────────────────────────────────────────────────────────────────

/**
 * The `YYYY-MM-DD` calendar date of an instant in `timeZone`. `null` when the
 * instant or the zone cannot be read. Never reads the runtime's own zone.
 */
export function schoolDateInZone(ms: number, timeZone: string): string | null {
  if (!Number.isFinite(ms)) return null
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(ms))
    const get = (type: string) => parts.find((p) => p.type === type)?.value
    const y = get('year')
    const m = get('month')
    const d = get('day')
    if (!y || !m || !d) return null
    const out = `${y.padStart(4, '0')}-${m}-${d}`
    return isSchoolDate(out) ? out : null
  } catch {
    return null
  }
}

/** `date` moved by `days` calendar days. */
export function shiftSchoolDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * The neighbouring day buckets read with the credit day: two either side.
 *
 * Why two: spacing and exact-source checks compare ABSOLUTE instants, so a free
 * build 10 minutes away may be filed under another date than this one. If the
 * family's zone was changed between the two confirmations, the same instant has
 * different local dates in the two zones, and zones in use differ by up to 26
 * hours, i.e. up to two calendar dates. ±2 therefore always covers a receipt
 * within the 15-minute spacing window, whichever zone dated it. Only the bucket
 * for THIS date counts toward the cap.
 */
export const NEIGHBOUR_DAYS = [-2, -1, 0, 1, 2] as const

// ── Server time ─────────────────────────────────────────────────────────────

/** The epoch ms of a Firestore `Timestamp`-like value, or `null` (sentinel, null, junk). */
export function serverMillis(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) return null
  const toMillis = (value as { toMillis?: unknown }).toMillis
  if (typeof toMillis !== 'function') return null
  const ms = (toMillis as () => unknown).call(value)
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : null
}

// ── The stored version, as the proof sees it ────────────────────────────────

/** A stored version document: its id and its data, untrusted. */
export interface StoredVersionDoc {
  id: string
  data: Record<string, unknown> | undefined
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The parsed files of a stored archive, or `null` when it is not a valid, canonical one. */
export function validatedArchiveFiles(data: Record<string, unknown>): BuildStudioSourceFiles | null {
  const archive = data.sourceArchive
  if (typeof archive !== 'string') return null
  const bytes = utf8ByteLength(archive)
  if (bytes > BUILD_STUDIO_MAX_ARCHIVE_BYTES || data.byteSize !== bytes) return null
  let files: BuildStudioSourceFiles
  try {
    files = parseBuildStudioSource(archive)
  } catch {
    return null
  }
  const keys = buildStudioSourceKeys(files)
  if (keys.length === 0 || keys.length > BUILD_STUDIO_MAX_FILES) return null
  if (data.fileCount !== keys.length) return null
  for (const required of ['pxt.json', 'main.ts']) {
    if (typeof files[required] !== 'string' || files[required].trim() === '') return null
  }
  for (const key of keys) {
    if (utf8ByteLength(files[key]) > BUILD_STUDIO_MAX_FILE_BYTES) return null
  }
  if (serializeBuildStudioSource(files) !== archive) return null
  if (data.sourceDigest !== buildStudioSourceDigest(archive)) return null
  return files
}

/**
 * The exact canonical bytes two sources are compared by: the archive's own
 * canonical serialisation with {@link EDITOR_SCRATCH_FILES} removed. `_`-private
 * editor keys are already outside the canonical archive. Exact string equality,
 * not a digest.
 */
export function comparableSource(files: BuildStudioSourceFiles): string {
  const scratch = new Set(EDITOR_SCRATCH_FILES)
  const comparable: Record<string, string> = {}
  for (const key of buildStudioSourceKeys(files)) {
    if (!scratch.has(key)) comparable[key] = files[key]
  }
  return serializeBuildStudioSource(comparable)
}

// ── Ordering: which version immediately precedes the source ─────────────────

interface OrderKey {
  ms: number
  id: string
}

/**
 * Where a version sits in time. A version with a server `acceptedAt` is ordered
 * by it. A version WITHOUT one is a legacy row and is ordered by its client
 * `createdAt` — which makes it usable as an old baseline only; it can never be
 * credited (rule 2). A present-but-unreadable `acceptedAt` (a pending sentinel)
 * is unorderable, not "legacy". Ties fall to the stable doc id.
 */
function orderKey(doc: StoredVersionDoc): OrderKey | null {
  const data = doc.data
  if (!data) return null
  if (data.acceptedAt !== undefined) {
    const ms = serverMillis(data.acceptedAt)
    return ms === null ? null : { ms, id: doc.id }
  }
  if (typeof data.createdAt !== 'string') return null
  const ms = Date.parse(data.createdAt)
  return Number.isFinite(ms) ? { ms, id: doc.id } : null
}

const before = (a: OrderKey, b: OrderKey): boolean => a.ms < b.ms || (a.ms === b.ms && a.id < b.id)

export type PredecessorChoice =
  | { ok: true; docId: string | null }
  | { ok: false; reason: 'unordered' }

/**
 * The immediately preceding durable version of the same child and project, as of
 * the source's acceptance. `docId: null` means none: compare with the starter.
 *
 * A LATER version never participates (it is not "before"). A sibling of this
 * project that cannot be ordered fails the whole choice: guessing around it
 * could pick an earlier baseline and manufacture a change.
 */
export function choosePredecessor(
  source: StoredVersionDoc,
  childId: string,
  projectId: string,
  siblings: readonly StoredVersionDoc[],
): PredecessorChoice {
  const sourceKey = orderKey(source)
  if (!sourceKey) return { ok: false, reason: 'unordered' }
  let best: OrderKey | null = null
  for (const sibling of siblings) {
    if (sibling.id === source.id) continue
    if (sibling.data?.childId !== childId) continue // another child's row is never read
    if (sibling.data?.projectId !== projectId) continue
    const key = orderKey(sibling)
    if (!key) return { ok: false, reason: 'unordered' }
    if (before(key, sourceKey) && (best === null || before(best, key))) best = key
  }
  return { ok: true, docId: best ? best.id : null }
}

// ── The proof ───────────────────────────────────────────────────────────────

export type CreditProofRejection =
  | 'bad-scope'
  | 'not-eligible'
  | 'malformed-source'
  | 'malformed-attempt'
  | 'challenge-unverified'
  | 'baseline-unreadable'
  | 'unchanged'

/** The one baseline a free-building save is compared with. */
export type CreditBaseline =
  | { kind: 'starter' }
  | { kind: 'version'; doc: StoredVersionDoc }

/** True when the version carries ANY challenge field, so it must prove a challenge. */
export const claimsChallenge = (data: Record<string, unknown> | undefined): boolean =>
  data !== undefined && data.challengeAttempt !== undefined

export type VersionCreditSource = Extract<BuildStudioCreditSource, { kind: 'challenge' | 'freeBuild' }>

export interface BuildStudioCreditProof {
  source: VersionCreditSource
  /** The version's server acceptance instant, epoch ms. */
  workMs: number
  sourceDigest: string
  /** `null` for a challenge (no baseline asked). */
  baselineDigest: string | null
  /** The baseline version's doc id, `null` for the starter or a challenge. */
  predecessorDocId: string | null
}

export type CreditProofResult =
  | { ok: true; proof: BuildStudioCreditProof }
  | { ok: false; reason: CreditProofRejection }

export interface ProveArgs {
  childId: string
  projectId: string
  versionId: string
  version: StoredVersionDoc
  /** Required (and only read) for a version that claims no challenge. */
  baseline: CreditBaseline | null
}

export function proveBuildStudioCredit(args: ProveArgs): CreditProofResult {
  const { childId, projectId, versionId, version } = args
  const data = version.data

  // 1. Scope.
  if (!isCreditPathId(childId) || !isCreditPathId(projectId) || !isCreditPathId(versionId)) {
    return { ok: false, reason: 'bad-scope' }
  }
  if (projectId !== BUILD_STUDIO_PROJECT_ID) return { ok: false, reason: 'bad-scope' }
  if (!data || version.id !== buildStudioVersionDocId(childId, projectId, versionId)) {
    return { ok: false, reason: 'bad-scope' }
  }
  if (data.childId !== childId || data.projectId !== projectId || data.versionId !== versionId) {
    return { ok: false, reason: 'bad-scope' }
  }

  // 2. The server instant.
  const workMs = serverMillis(data.acceptedAt)
  if (workMs === null) return { ok: false, reason: 'not-eligible' }

  // 3. The archive.
  const files = validatedArchiveFiles(data)
  if (!files) return { ok: false, reason: 'malformed-source' }
  const sourceDigest = data.sourceDigest as string

  // 4. A challenge attempt must prove itself, or the version earns nothing.
  if (claimsChallenge(data)) {
    const attempt = normalizeChallengeAttempt(data.challengeAttempt)
    if (
      !attempt ||
      attempt.childId !== childId ||
      attempt.projectId !== projectId ||
      attempt.versionId !== versionId
    ) {
      return { ok: false, reason: 'malformed-attempt' }
    }
    const challenge = challengeById(attempt.challengeId)
    if (
      !challenge ||
      attempt.challengeRevision !== challenge.revision ||
      attempt.subjectBucket !== challenge.subjectBucket ||
      !(BUILD_STUDIO_CHALLENGE_SUBJECTS as readonly string[]).includes(challenge.subjectBucket) ||
      !attempt.prediction ||
      !challenge.prediction.options.some((o) => o.id === attempt.prediction?.optionId)
    ) {
      return { ok: false, reason: 'challenge-unverified' }
    }
    return {
      ok: true,
      proof: {
        source: {
          kind: 'challenge',
          challengeId: challenge.id,
          challengeRevision: challenge.revision,
          subjectBucket: challenge.subjectBucket,
          projectId,
          versionId,
        },
        workMs,
        sourceDigest,
        baselineDigest: null,
        predecessorDocId: null,
      },
    }
  }

  // 5. Free building: exact canonical bytes against the exact baseline.
  const baseline = args.baseline
  if (!baseline) return { ok: false, reason: 'baseline-unreadable' }
  let baselineFiles: BuildStudioSourceFiles | null
  let predecessorDocId: string | null = null
  if (baseline.kind === 'starter') {
    baselineFiles = starterSourceFiles()
  } else {
    const b = baseline.doc.data
    if (
      !b ||
      baseline.doc.id === version.id ||
      b.childId !== childId ||
      b.projectId !== projectId ||
      typeof b.versionId !== 'string' ||
      baseline.doc.id !== buildStudioVersionDocId(childId, projectId, b.versionId)
    ) {
      return { ok: false, reason: 'baseline-unreadable' }
    }
    baselineFiles = validatedArchiveFiles(b)
    predecessorDocId = baseline.doc.id
  }
  if (!baselineFiles) return { ok: false, reason: 'baseline-unreadable' }

  const baselineBytes = comparableSource(baselineFiles)
  if (comparableSource(files) === baselineBytes) return { ok: false, reason: 'unchanged' }

  return {
    ok: true,
    proof: {
      source: { kind: 'freeBuild', projectId, versionId },
      workMs,
      sourceDigest,
      baselineDigest: buildStudioSourceDigest(baselineBytes),
      predecessorDocId,
    },
  }
}

// ── The proposal a parent reviews ───────────────────────────────────────────

/**
 * Everything the parent is shown and confirms. Re-derived from the server inside
 * the write transaction and compared field-for-field; any difference is a stale
 * preview, never a write.
 */
export interface BuildStudioCreditProposal {
  familyId: string
  childId: string
  projectId: string
  versionId: string
  versionDocId: string
  source: VersionCreditSource
  workMs: number
  /** The family zone resolved when the preview was made. */
  timeZone: string
  /** `workMs` in `timeZone`. */
  schoolDate: string
  minutes: number
  subjectBucket: SubjectBucket
  predecessorDocId: string | null
  sourceDigest: string
  baselineDigest: string | null
}

export function buildCreditProposal(args: {
  familyId: string
  childId: string
  timeZone: string
  versionDocId: string
  proof: BuildStudioCreditProof
}): BuildStudioCreditProposal | null {
  const { proof } = args
  const schoolDate = schoolDateInZone(proof.workMs, args.timeZone)
  if (!schoolDate) return null
  const { minutes, subjectBucket } = creditForSource(proof.source)
  return {
    familyId: args.familyId,
    childId: args.childId,
    projectId: proof.source.projectId,
    versionId: proof.source.versionId,
    versionDocId: args.versionDocId,
    source: proof.source,
    workMs: proof.workMs,
    timeZone: args.timeZone,
    schoolDate,
    minutes,
    subjectBucket,
    predecessorDocId: proof.predecessorDocId,
    sourceDigest: proof.sourceDigest,
    baselineDigest: proof.baselineDigest,
  }
}

/** Two proposals are the same preview iff their keys are equal. */
export const proposalKey = (p: BuildStudioCreditProposal): string =>
  JSON.stringify([
    p.familyId,
    p.childId,
    p.projectId,
    p.versionId,
    p.versionDocId,
    p.source,
    p.workMs,
    p.timeZone,
    p.schoolDate,
    p.minutes,
    p.subjectBucket,
    p.predecessorDocId,
    p.sourceDigest,
    p.baselineDigest,
  ])

// ── The admission bucket ────────────────────────────────────────────────────

/** One admitted unit, as stored in a day bucket. Append-only; minutes are the ORIGINAL fixed units. */
export interface CreditDayEntry {
  receiptId: string
  source: BuildStudioCreditSource
  atMs: number
  minutes: number
}

/** A day bucket never holds more than this many units (240 min / 5 min = 48). */
export const MAX_DAY_ENTRIES = 48

function parseSource(raw: unknown): BuildStudioCreditSource | null {
  if (!isRecord(raw)) return null
  const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200
  switch (raw.kind) {
    case 'challenge':
      if (
        !str(raw.challengeId) ||
        typeof raw.challengeRevision !== 'number' ||
        !Number.isSafeInteger(raw.challengeRevision) ||
        !(BUILD_STUDIO_CHALLENGE_SUBJECTS as readonly string[]).includes(raw.subjectBucket as string) ||
        !str(raw.projectId) ||
        !str(raw.versionId)
      ) {
        return null
      }
      return {
        kind: 'challenge',
        challengeId: raw.challengeId,
        challengeRevision: raw.challengeRevision,
        subjectBucket: raw.subjectBucket as BuildStudioChallengeSubject,
        projectId: raw.projectId,
        versionId: raw.versionId,
      }
    case 'freeBuild':
      return str(raw.projectId) && str(raw.versionId)
        ? { kind: 'freeBuild', projectId: raw.projectId, versionId: raw.versionId }
        : null
    case 'blockMuncherIdea':
      return str(raw.requestId) ? { kind: 'blockMuncherIdea', requestId: raw.requestId } : null
    case 'blockMuncherVerdict':
      return str(raw.requestId) && str(raw.playedBuildId)
        ? { kind: 'blockMuncherVerdict', requestId: raw.requestId, playedBuildId: raw.playedBuildId }
        : null
    default:
      return null
  }
}

/**
 * Parse a stored day bucket. `{ entries: [] }` for a bucket that does not exist;
 * `null` (fail closed) for anything malformed.
 *
 * The bucket is the IMMUTABLE record of ORIGINAL fixed credit, separate from the
 * editable `hours` rows (a parent's later correction never reaches it, so no
 * corrected visible amount may ever be read into this budget). So an entry is
 * valid only when:
 *
 *   • its `minutes` EQUAL `creditForSource(source).minutes` — a positive safe
 *     integer that differs from the fixed amount is corruption, not credit;
 *   • its `receiptId` is unique within the bucket (a repeat would double-count or
 *     hide a unit), and for a saved-version source (challenge or free build) it is
 *     exactly `creditReceiptId(childId, source.projectId, source.versionId)` with
 *     path-safe ids, so a receipt cannot name another child's or another
 *     version's unit;
 *   • the bucket's own total does not already exceed the daily cap;
 *   • child, date, source and instant are the exact shapes, and the entry count
 *     is within what a bucket can ever hold.
 */
export function parseCreditDay(
  exists: boolean,
  data: unknown,
  childId: string,
  schoolDate: string,
): { entries: CreditDayEntry[] } | null {
  if (!exists) return { entries: [] }
  if (!isRecord(data) || data.childId !== childId || data.schoolDate !== schoolDate) return null
  if (!Array.isArray(data.entries) || data.entries.length > MAX_DAY_ENTRIES) return null
  const entries: CreditDayEntry[] = []
  const seenReceipts = new Set<string>()
  let total = 0
  for (const raw of data.entries) {
    if (!isRecord(raw)) return null
    const source = parseSource(raw.source)
    if (
      !source ||
      typeof raw.receiptId !== 'string' ||
      raw.receiptId.length === 0 ||
      raw.receiptId.length > 200 ||
      typeof raw.atMs !== 'number' ||
      !Number.isFinite(raw.atMs) ||
      typeof raw.minutes !== 'number' ||
      !Number.isSafeInteger(raw.minutes) ||
      raw.minutes <= 0 ||
      raw.minutes !== creditForSource(source).minutes ||
      seenReceipts.has(raw.receiptId)
    ) {
      return null
    }
    if (source.kind === 'challenge' || source.kind === 'freeBuild') {
      if (
        !isCreditPathId(source.projectId) ||
        !isCreditPathId(source.versionId) ||
        raw.receiptId !== creditReceiptId(childId, source.projectId, source.versionId)
      ) {
        return null
      }
    }
    seenReceipts.add(raw.receiptId)
    total += raw.minutes
    entries.push({ receiptId: raw.receiptId, source, atMs: raw.atMs, minutes: raw.minutes })
  }
  if (total > BUILD_STUDIO_DAILY_CREDIT_CAP_MINUTES) return null
  return { entries }
}

export type AdmissionOutcome =
  | { ok: true; decision: BuildStudioCreditDecision }
  | { ok: false; reason: 'malformed-budget' }

/**
 * Run the fixed-credit policy over the day buckets read for a proposal.
 *
 * `buckets` maps each date in `proposal.schoolDate ± NEIGHBOUR_DAYS` to its raw
 * snapshot. A missing key is treated as unread and fails closed. Every bucket is
 * parsed strictly, including neighbours (their instants feed the spacing rule).
 */
export function decideAdmission(
  proposal: BuildStudioCreditProposal,
  buckets: ReadonlyMap<string, { exists: boolean; data: unknown }>,
): AdmissionOutcome {
  const receipts: BuildStudioCreditReceipt[] = []
  const seenReceipts = new Set<string>()
  for (const offset of NEIGHBOUR_DAYS) {
    const date = shiftSchoolDate(proposal.schoolDate, offset)
    const snap = buckets.get(date)
    if (!snap) return { ok: false, reason: 'malformed-budget' }
    const parsed = parseCreditDay(snap.exists, snap.data, proposal.childId, date)
    if (!parsed) return { ok: false, reason: 'malformed-budget' }
    for (const e of parsed.entries) {
      // One receipt is one unit on ONE date; the same id in two buckets is corruption.
      if (seenReceipts.has(e.receiptId)) return { ok: false, reason: 'malformed-budget' }
      seenReceipts.add(e.receiptId)
      receipts.push({
        familyId: proposal.familyId,
        childId: proposal.childId,
        schoolDate: date,
        atMs: e.atMs,
        minutes: e.minutes,
        source: e.source,
      })
    }
  }
  return {
    ok: true,
    decision: admitBuildStudioCredit(
      {
        familyId: proposal.familyId,
        childId: proposal.childId,
        schoolDate: proposal.schoolDate,
        atMs: proposal.workMs,
        source: proposal.source,
      },
      receipts,
    ),
  }
}
