/**
 * Build Studio — the private store for one child's own Arcade game source
 * (LOCAL-BUILD-001).
 *
 * ── Why this is its own type, and its own collection ────────────────────────
 *
 * The two project-shaped things the repo already has are both the wrong shape
 * for this, and forcing it into either would be the kind of reuse that costs
 * more than it saves:
 *
 *   • `StoryGame` (`workshop.ts`) is a *narrative* — scenes, choices, recorded
 *     audio, generated art. Its documents are read by the Workshop's wizard,
 *     its gallery and its playtest view, and none of them can read a MakeCode
 *     project. A `sourceArchive` field on it would be a second, unrelated
 *     document shape sharing one collection and one set of readers.
 *   • `DadLabProject` / `ConceptArc` (`dadlab.ts`) is a *session record* — a
 *     beat, a stage, an observation. It has no source and no versions.
 *
 * What this needs is the thing neither has: an **immutable list of exact byte
 * snapshots**, each one re-openable. So it is a flat family-owned collection of
 * its own, `buildStudioVersions`, under the family document the existing owner
 * rules already cover (`firestore.rules` is untouched — see the collection
 * helper's docstring).
 *
 * ── The source is TEXT, not a map ──────────────────────────────────────────
 *
 * A MakeCode project is a map of file name → file text, and the file names are
 * `pxt.json`, `main.blocks`, `main.ts`, `assets.jres`. Those names contain a
 * `.`, and a `.` is the SEPARATOR in Firestore's **field-path** syntax — the
 * dotted strings that `updateDoc`, `setDoc(..., {mergeFields})`, field masks
 * and `orderBy` take. So while a stored map key may legitimately contain a dot
 * (the document would hold a key literally called `pxt.json`), every
 * field-scoped operation naming it as a dotted path would address
 * `pxt` → `json` instead, and would need `new FieldPath('pxt.json')` to mean
 * the file. That is a trap sitting under every future reader of this
 * collection, and it buys nothing: the archive is one opaque blob to this app.
 *
 * So the archive is serialized once, by this module's own canonical rule, and
 * stored as a single string. One field, one blob, and no field path anywhere
 * derived from somebody else's file names.
 *
 * ── Size is measured in BYTES ──────────────────────────────────────────────
 *
 * Firestore's 1 MiB limit is on the document's own serialized size, and a
 * string field costs its UTF-8 byte length. `String.length` is UTF-16 code
 * units, which is a different number for anything outside ASCII — two 185,000
 * character files of a three-byte character are ~1.1 MB of UTF-8 and would have
 * sailed through a character cap. Every limit here is therefore a byte limit,
 * measured with {@link utf8ByteLength}.
 */

import type { Timestamp } from 'firebase/firestore'

import { SubjectBucket } from './enums'

/** The map a MakeCode editor hands over and takes back: file name → text. */
export type BuildStudioSourceFiles = Readonly<Record<string, string>>

/**
 * A saved version: the exact source bytes of one explicit Save, and the
 * identity that makes the save idempotent.
 *
 * **Immutable.** A document is written once, inside a transaction that creates
 * it or finds the identical payload already there. Nothing updates one; a later
 * save is a new version. See `core/firebase/buildStudioVersionWrites.ts`.
 */
export interface BuildStudioVersion {
  /** The document id — `{childId}__{projectId}__{versionId}`. */
  id: string
  /** The child this version belongs to. Never the live active child. */
  childId: string
  /** The project (one per starter copy; the starter's own id for this slice). */
  projectId: string
  /**
   * This save's identity. ONE deterministic value per Save action, reused
   * verbatim by that action's retry — which is what makes a retry whose first
   * attempt landed resolve to the same document instead of a second version.
   */
  versionId: string
  /** What the child (or the page's default) calls this version. */
  label: string
  /** ISO stamp of the save, pinned by the caller so a test can fix it. */
  createdAt: string
  /**
   * The canonical serialization of the project's source files
   * ({@link serializeBuildStudioSource}). Stored as text on purpose — see the
   * module docstring.
   */
  sourceArchive: string
  /**
   * The archive's real UTF-8 **byte** length, so a reader can size a version
   * without parsing it — and so the number means the same thing as the limit it
   * was checked against. Never `sourceArchive.length`, which counts UTF-16 code
   * units and under-reports every multibyte character.
   */
  byteSize: number
  /** How many files the archive holds. */
  fileCount: number
  /** A short display digest of the archive — see `buildStudioSourceDigest`. */
  sourceDigest: string
  /**
   * The editor this came out of, as the editor itself reported it. Recorded
   * because the handshake is version-sensitive: a version saved under a
   * different `targetVersion` is still restorable, and a reader deserves to
   * know which editor wrote it rather than being told the current one did.
   */
  editorTarget?: string
  editorTargetVersion?: string
  /** The authored goal this save was made under, when one was in play. */
  goalId?: string
  /**
   * Which visit produced this save. Diagnostic only — it is what lets a late
   * duplicate be recognised as a duplicate rather than guessed at.
   */
  visitId?: string
  /**
   * The structured Build Challenge attempt frozen with THIS explicit Save, when
   * the child had one going (LOCAL-VISION-007). Optional and additive: a version
   * saved before challenges existed has none — even when it carries the legacy
   * `goalId` — and nothing may infer one. Scoped to this exact child, project
   * and version by {@link normalizeChallengeAttempt}.
   */
  challengeAttempt?: BuildStudioChallengeAttempt
  /**
   * Firestore SERVER acceptance time of this exact save (LOCAL-VISION-007, slice 3).
   *
   * Written only by a NEW save that asked to be eligible for parent-reviewed
   * hours, as `serverTimestamp()` inside the create transaction. It is the one
   * immutable instant a credit's school date is derived from — never the
   * client's `createdAt`, never a retry's time. Absent on every older version and
   * on every save that did not ask; nothing backfills it, and a retry of an old
   * version never adds it. A version without it is reference/baseline only.
   */
  acceptedAt?: Timestamp
}

/**
 * Typed provenance on a Build Studio credit's `hours` row (LOCAL-VISION-007,
 * slice 3). Additive and optional on `HoursEntry`; the counting path never
 * reads it. It names the exact saved version the credit was admitted for, so
 * the parent can open that version from Records.
 */
/**
 * The `source` stamped on every Build Studio credit `hours` row. ONE value shared
 * by the writer, the Records page and the CSV export (which emits it verbatim), so
 * the three can never drift apart. Already-written rows carry exactly this string.
 */
export const BUILD_STUDIO_CREDIT_HOURS_SOURCE = 'build-studio-credit'

/** The human label for {@link BUILD_STUDIO_CREDIT_HOURS_SOURCE} on Records. */
export const BUILD_STUDIO_CREDIT_SOURCE_LABEL = 'Build Studio'

export interface BuildStudioCreditProvenance {
  schema: 1
  /** The immutable consumed-source receipt this row belongs to. */
  receiptId: string
  kind: 'challenge' | 'freeBuild'
  projectId: string
  versionId: string
  /** `buildStudioVersionDocId(childId, projectId, versionId)`. */
  versionDocId: string
  /** Present for `kind: 'challenge'` only. */
  challengeId?: string
  challengeRevision?: number
  /** The fixed minutes ADMITTED. A later correction lowers the row, never this. */
  admittedMinutes: number
  /** The server acceptance instant of the version, epoch ms. */
  workAtMs: number
  /** The zone the school date was resolved in, frozen at confirmation. */
  timeZone: string
}

// ── The Build Challenge attempt ─────────────────────────────────────────────

/** The only subjects a Build Challenge may carry: existing `SubjectBucket` values. */
export const BUILD_STUDIO_CHALLENGE_SUBJECTS = [
  SubjectBucket.Math,
  SubjectBucket.Science,
  SubjectBucket.SocialStudies,
  SubjectBucket.LanguageArts,
  SubjectBucket.PracticalArts,
] as const
export type BuildStudioChallengeSubject = (typeof BUILD_STUDIO_CHALLENGE_SUBJECTS)[number]

/** What the child said about his own guess, after pressing Play. */
export const BUILD_STUDIO_CHALLENGE_OUTCOMES = ['matched', 'different', 'unsure'] as const
export type BuildStudioChallengeOutcome = (typeof BUILD_STUDIO_CHALLENGE_OUTCOMES)[number]

/**
 * One challenge attempt as it is stored on a version (LOCAL-VISION-007).
 *
 * Three facts with three different provenances, kept apart on purpose:
 *
 *   • `prediction` — an option the child tapped BEFORE any Play request;
 *   • `playRequest` — the child pressed Play. It records a tap, nothing more:
 *     the bridge cannot establish which source ran, so this never says that the
 *     saved source was the one played;
 *   • `reportedOutcome` — what the CHILD said he saw. Self-report, not an
 *     observation, and not an assessment of anything.
 *
 * Nothing here is a score, a mastery claim or a reward.
 */
export interface BuildStudioChallengeAttempt {
  /** Scope: must equal the version it is stored on, on all three. */
  childId: string
  projectId: string
  versionId: string
  /** One id per attempt, so a later save of the same attempt is recognisable. */
  attemptId: string
  /** The authored challenge, by its stable id and revision. */
  challengeId: string
  challengeRevision: number
  /**
   * The authored subject of this challenge, copied from the catalog at freeze
   * time. One of {@link BUILD_STUDIO_CHALLENGE_SUBJECTS}. It is a label for
   * future source-linked hours; nothing here writes hours or a learner record.
   */
  subjectBucket: BuildStudioChallengeSubject
  prediction?: { optionId: string; at: string }
  playRequest?: { at: string }
  reportedOutcome?: { result: BuildStudioChallengeOutcome; at: string }
}

const CHALLENGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CHALLENGE_PATH_ID = /^[A-Za-z0-9_-]{4,64}$/
const CHALLENGE_OPTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const hasOnly = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** An ISO-looking stamp that also parses. Returns its time, or `null`. */
function stampTime(value: unknown): number | null {
  if (typeof value !== 'string' || value.length > 40) return null
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

/**
 * Validate a challenge attempt and return it in ONE canonical shape, or `null`.
 *
 * Strict by design: unknown keys are refused, ids are narrow, and the order of
 * events is enforced (a prediction is before the Play request, the reported
 * outcome after it, and an outcome needs both). A retry compares the canonical
 * shapes, so the same attempt always serialises the same way.
 */
export function normalizeChallengeAttempt(value: unknown): BuildStudioChallengeAttempt | null {
  if (!isRecord(value)) return null
  if (
    !hasOnly(value, [
      'childId',
      'projectId',
      'versionId',
      'attemptId',
      'challengeId',
      'challengeRevision',
      'subjectBucket',
      'prediction',
      'playRequest',
      'reportedOutcome',
    ])
  ) {
    return null
  }
  const { childId, projectId, versionId, attemptId, challengeId, challengeRevision } = value
  if (typeof childId !== 'string' || !childId || /[/\s]/.test(childId)) return null
  if (typeof projectId !== 'string' || !CHALLENGE_PATH_ID.test(projectId)) return null
  if (typeof versionId !== 'string' || !CHALLENGE_PATH_ID.test(versionId)) return null
  if (typeof attemptId !== 'string' || !CHALLENGE_PATH_ID.test(attemptId)) return null
  if (typeof challengeId !== 'string' || challengeId.length > 48 || !CHALLENGE_ID.test(challengeId)) {
    return null
  }
  if (
    typeof challengeRevision !== 'number' ||
    !Number.isInteger(challengeRevision) ||
    challengeRevision < 1 ||
    challengeRevision > 999
  ) {
    return null
  }
  const { subjectBucket } = value
  if (
    typeof subjectBucket !== 'string' ||
    !(BUILD_STUDIO_CHALLENGE_SUBJECTS as readonly string[]).includes(subjectBucket)
  ) {
    return null
  }

  const out: BuildStudioChallengeAttempt = {
    childId,
    projectId,
    versionId,
    attemptId,
    challengeId,
    challengeRevision,
    subjectBucket: subjectBucket as BuildStudioChallengeSubject,
  }

  let predictedAt: number | null = null
  if (value.prediction !== undefined) {
    const p = value.prediction
    if (!isRecord(p) || !hasOnly(p, ['optionId', 'at'])) return null
    predictedAt = stampTime(p.at)
    if (
      typeof p.optionId !== 'string' ||
      p.optionId.length > 24 ||
      !CHALLENGE_OPTION_ID.test(p.optionId) ||
      predictedAt === null
    ) {
      return null
    }
    out.prediction = { optionId: p.optionId, at: p.at as string }
  }

  let playedAt: number | null = null
  if (value.playRequest !== undefined) {
    const p = value.playRequest
    if (!isRecord(p) || !hasOnly(p, ['at'])) return null
    playedAt = stampTime(p.at)
    if (playedAt === null) return null
    out.playRequest = { at: p.at as string }
  }
  // A prediction is only a prediction if it came first.
  if (predictedAt !== null && playedAt !== null && predictedAt > playedAt) return null

  if (value.reportedOutcome !== undefined) {
    const o = value.reportedOutcome
    if (!isRecord(o) || !hasOnly(o, ['result', 'at'])) return null
    const reportedAt = stampTime(o.at)
    if (
      reportedAt === null ||
      typeof o.result !== 'string' ||
      !(BUILD_STUDIO_CHALLENGE_OUTCOMES as readonly string[]).includes(o.result)
    ) {
      return null
    }
    // "Matched" is relative to a guess, after a Play request.
    if (predictedAt === null || playedAt === null || reportedAt < playedAt) return null
    out.reportedOutcome = { result: o.result as BuildStudioChallengeOutcome, at: o.at as string }
  }

  // An attempt with nothing recorded is not an attempt.
  if (!out.prediction && !out.playRequest) return null
  return out
}

/**
 * The comparable form of an attempt, or `''` for none. An invalid stored value
 * is `'!invalid'`, so it can never compare equal to anything that was sent.
 */
export function challengeAttemptKey(value: unknown): string {
  if (value === undefined || value === null) return ''
  const normalized = normalizeChallengeAttempt(value)
  return normalized ? JSON.stringify(normalized) : '!invalid'
}

/**
 * The per-child opt-in document, at
 * `families/{familyId}/settings/buildStudio_{childId}`.
 *
 * A settings document rather than a field on the child, for the reason the
 * planner's own per-child defaults live there: this is a **surface**
 * permission, not part of who the child is. Nothing about a name, an age, a
 * grade or a calibration may decide it — see `buildStudioAccess.ts`.
 */
export interface BuildStudioOptIn {
  /** The child this document authorises. Checked against the path's own id. */
  childId: string
  /** The only thing that opens the door. Absent or false means closed. */
  enabled: boolean
  /** ISO stamp of the parent's confirmation. */
  updatedAt: string
}

/** The settings document id for one child's opt-in. */
export const buildStudioOptInDocId = (childId: string): string =>
  `buildStudio_${childId}`

/** The document id for one saved version. */
export const buildStudioVersionDocId = (
  childId: string,
  projectId: string,
  versionId: string,
): string => `${childId}__${projectId}__${versionId}`

// ── Serialization ───────────────────────────────────────────────────────────

/**
 * Keys the editor owns and this app does not store.
 *
 * `_history` is MakeCode's own undo/version journal. It is not configuration,
 * text, Blocks or assets — the four things a source snapshot owes — it is not
 * listed in `pxt.json`'s `files`, and it grows without bound as a child edits,
 * which would eventually push an honest save past the size cap and refuse work
 * that is perfectly fine. Excluding it is a stated trade: a restored version
 * opens with the same program, the same blocks and the same assets, and an
 * empty undo stack.
 */
export const EDITOR_PRIVATE_PREFIX = '_'

/**
 * Files the editor writes for ITSELF, which are not the program.
 *
 * These are excluded from the "has the source changed?" COMPARISON only. The
 * stored archive keeps every byte the editor handed over — a version is the
 * record of a moment, and trimming it would make a reopened version differ
 * from what was saved.
 *
 * `.simstate.json` is the measured one: a clean Save → Today in stock 4.1.28
 * adds or updates exactly this file, 55 bytes, holding `S/#run` and `S/#scope`.
 * It is the simulator's scratch state, it changes every time the game runs, and
 * counting it as an edit made every ordinary departure report unsaved work.
 *
 * Deliberately a NAMED list, not a pattern: anything else that differs is a
 * real code, configuration or asset difference and must read as one.
 */
export const EDITOR_SCRATCH_FILES: readonly string[] = ['.simstate.json']

/**
 * The archive's byte ceiling.
 *
 * Firestore's hard limit is 1 MiB (1,048,576 bytes) for the whole document,
 * which also carries the path, the field names and every other field. 700,000
 * bytes leaves roughly a third of the budget as margin, which is ample for a
 * record whose other fields are a label, two ids and three stamps.
 *
 * **Bytes, not characters.** 185,000 characters of a three-byte character is
 * 555,000 bytes; two such files passed the old 600,000-CHARACTER cap and would
 * have been refused by Firestore at ~1.1 MB after the write was already in
 * flight.
 */
export const BUILD_STUDIO_MAX_ARCHIVE_BYTES = 700_000

/** The most files one project may carry. */
export const BUILD_STUDIO_MAX_FILES = 24

/** The largest single file, in UTF-8 bytes. */
export const BUILD_STUDIO_MAX_FILE_BYTES = 400_000

/**
 * The UTF-8 byte length of a string — what Firestore actually charges.
 *
 * `TextEncoder` where it exists (every browser this app runs in, and Node), and
 * an explicit code-point fold otherwise, so the number is never silently the
 * UTF-16 one. Lone surrogates are counted as the 3-byte replacement character,
 * which is exactly what an encoder does with them.
 */
export function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length
  }
  let bytes = 0
  for (let i = 0; i < value.length; i += 1) {
    const code = value.codePointAt(i) as number
    if (code <= 0x7f) bytes += 1
    else if (code <= 0x7ff) bytes += 2
    else if (code <= 0xffff) bytes += 3
    else {
      bytes += 4
      // A surrogate pair is one code point and two code units.
      i += 1
    }
  }
  return bytes
}

/**
 * Which of a project's files belong in a stored version.
 *
 * `pxt.json`'s own `files` list is the project's declaration of what it is made
 * of, so it is preferred. When it cannot be read — a hand-edited manifest, a
 * future shape — every non-private key is kept instead, because dropping a file
 * we failed to parse a list for would silently store an incomplete program.
 */
export function buildStudioSourceKeys(files: BuildStudioSourceFiles): string[] {
  const present = Object.keys(files).filter(
    (name) => !name.startsWith(EDITOR_PRIVATE_PREFIX),
  )
  let declared: string[] | null = null
  try {
    const manifest = JSON.parse(files['pxt.json'] ?? '') as { files?: unknown }
    if (
      Array.isArray(manifest.files) &&
      manifest.files.every((f) => typeof f === 'string')
    ) {
      declared = manifest.files as string[]
    }
  } catch {
    declared = null
  }
  if (!declared) return present.sort()
  // The manifest itself is a file of the project and is not in its own list.
  const wanted = new Set<string>(['pxt.json', ...declared])
  // Anything the manifest names but the editor did not send is simply absent;
  // anything the editor sent that the manifest does not name is kept too, since
  // an asset file the manifest forgot is still part of the program.
  for (const name of present) wanted.add(name)
  return [...wanted].filter((name) => typeof files[name] === 'string').sort()
}

/**
 * The one serialization of a project's source.
 *
 * Deterministic: keys sorted, two-space JSON. Determinism is the whole point —
 * the writer's "is this the same payload?" check is an exact string comparison
 * against the stored archive, so the same files must always produce the same
 * characters or a retry would look like a conflicting second save.
 */
export function serializeBuildStudioSource(files: BuildStudioSourceFiles): string {
  const keys = buildStudioSourceKeys(files)
  const out: Record<string, string> = {}
  for (const key of keys) out[key] = files[key]
  return JSON.stringify(out, keys, 2)
}

/** Read an archive back. Throws on anything that is not a file map. */
export function parseBuildStudioSource(archive: string): BuildStudioSourceFiles {
  const parsed = JSON.parse(archive) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('That saved version could not be read as project files.')
  }
  const entries = Object.entries(parsed as Record<string, unknown>)
  if (entries.length === 0) {
    throw new Error('That saved version holds no files.')
  }
  for (const [name, value] of entries) {
    if (typeof value !== 'string') {
      throw new Error(`That saved version's "${name}" is not text.`)
    }
  }
  return Object.fromEntries(entries) as BuildStudioSourceFiles
}

/**
 * A short digest of an archive, for display and for a human comparison of two
 * versions.
 *
 * **Not a security primitive and not the identity check.** The writer compares
 * the archive STRING exactly; this is a 64-bit FNV-1a over the same characters,
 * rendered as hex, so a person (or a test) can say "these two are the same
 * bytes" without printing 600 KB. It is pure, synchronous and needs no
 * dependency and no `crypto.subtle`, which jsdom does not reliably provide.
 */
export function buildStudioSourceDigest(archive: string): string {
  // FNV-1a, 64-bit, in BigInt so the arithmetic is exact rather than drifting
  // through float64 the way a 32-bit shift-based port does.
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  let hash = 0xcbf29ce484222325n
  for (let i = 0; i < archive.length; i += 1) {
    // The code UNIT, not the code point: the comparison is over the exact
    // characters stored, and a surrogate pair hashing as two units is fine as
    // long as it always does.
    hash = ((hash ^ BigInt(archive.charCodeAt(i))) * prime) & mask
  }
  return `${archive.length.toString(16)}-${hash.toString(16).padStart(16, '0')}`
}
