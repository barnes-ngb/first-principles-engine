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
const EDITOR_PRIVATE_PREFIX = '_'

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
