/**
 * Identity: what a Save belongs to, and what a callback may touch
 * (LOCAL-BUILD-001).
 *
 * Pure, and small on purpose — the three hardest bugs in this feature are all
 * identity bugs, so the identity lives in one file that a test can exhaust:
 *
 *   1. a Save that lands against whoever is active when it finishes rather than
 *      the child it was started for (`useCreativeTimer`'s defect — BIND);
 *   2. a retry that writes a SECOND version of the same bytes because it minted
 *      a new id (which is why the id is per ACTION, not per attempt);
 *   3. a late editor callback applied to the visit that replaced it, including
 *      the `A → B → A` case where comparing the child id alone cannot tell that
 *      anything happened.
 */

import {
  buildStudioSourceDigest,
  buildStudioSourceKeys,
  EDITOR_SCRATCH_FILES,
  serializeBuildStudioSource,
} from '../../core/types/buildStudio'

/**
 * The content signature of a project's source, for "is this still what is on
 * screen?".
 *
 * Two kinds of file are left out of the comparison, and **only** out of the
 * comparison — the stored archive keeps every byte:
 *
 *   • `_`-prefixed keys, excluded by the canonical archive itself. `_history`
 *     is MakeCode's undo journal and changes on every keystroke.
 *   • {@link EDITOR_SCRATCH_FILES}, the measured simulator scratch
 *     (`.simstate.json`), which a clean Save → Today adds or rewrites.
 *
 * Anything else that differs is a real code, configuration or asset
 * difference and reads as one.
 */
export function sourceSignature(files: Readonly<Record<string, string>>): string {
  const scratch = new Set(EDITOR_SCRATCH_FILES)
  const comparable: Record<string, string> = {}
  for (const key of buildStudioSourceKeys(files)) {
    if (scratch.has(key)) continue
    comparable[key] = files[key]
  }
  return buildStudioSourceDigest(serializeBuildStudioSource(comparable))
}

/** Everything a Save or an editor callback is bound to. */
export interface BuildStudioScope {
  familyId: string
  childId: string
  projectId: string
  /**
   * One mount of the editor. A fresh value every time the page opens the
   * editor — a new visit, a reopened version, a child change — which is what
   * makes `A → B → A` a DIFFERENT scope rather than the same one.
   */
  visitId: string
  /**
   * The stored version this visit opened, when it reopened one. `null` for a
   * fresh starter visit. Part of the identity because reopening version 2 after
   * version 5 must not let version 5's in-flight callback write here.
   */
  versionId: string | null
}

/**
 * The comparable form of a scope.
 *
 * A single string so a render can key on it and a handler can capture it, and
 * `\u0000`-separated so no field's content can impersonate a boundary.
 */
export function scopeToken(scope: BuildStudioScope): string {
  return [
    scope.familyId,
    scope.childId,
    scope.projectId,
    scope.visitId,
    scope.versionId ?? '',
  ].join('\u0000')
}

/** Are these the same scope? Every field, never a subset. */
export function sameScope(a: BuildStudioScope | null, b: BuildStudioScope | null): boolean {
  if (!a || !b) return false
  return scopeToken(a) === scopeToken(b)
}

/**
 * A path-safe id. 4–64 of `[A-Za-z0-9_-]`, which is what the writer's
 * `PATH_SAFE` admits — the same rule, satisfied by construction rather than by
 * hoping the two agree.
 */
function pathSafeId(prefix: string, now: number, random: number): string {
  const stamp = Math.floor(now).toString(36)
  const noise = Math.floor(random * 0x7fffffff)
    .toString(36)
    .padStart(6, '0')
    .slice(0, 8)
  return `${prefix}${stamp}-${noise}`
}

/**
 * The id for ONE Save action.
 *
 * Minted when the child taps Save and then **held**: the retry of that action
 * reuses it verbatim, which is what makes the writer's create-or-same-payload
 * transaction idempotent instead of merely careful. A new tap is a new action
 * and gets a new id.
 *
 * `now` and `random` are parameters so a test pins the value rather than
 * asserting a shape.
 */
export const newVersionId = (now: number, random: number): string =>
  pathSafeId('v', now, random)

/** The id for one mount of the editor. */
export const newVisitId = (now: number, random: number): string =>
  pathSafeId('s', now, random)

/** A fresh frame / request id for the bridge. Same alphabet, same reason. */
export const newBridgeId = (now: number, random: number): string =>
  pathSafeId('f', now, random)

/**
 * The id for ONE confirmed note.
 *
 * Minted when the child taps *Save my words*, held for that tap's retry. It is
 * what stops a second, different note being reported as already saved — see
 * `buildStudioNoteWrites`.
 */
export const newNoteActionId = (now: number, random: number): string =>
  pathSafeId('n', now, random)

/**
 * Everything a reflection is about, frozen when the words are accepted.
 *
 * The defect this type exists to prevent: `VoiceInput`'s callback recorded only
 * text, and the eventual Save read whatever `lastSaved` happened to hold — so
 * words accepted about V1, with V2 saved in between, were filed against V2. The
 * target is captured at accepted-draft creation and the write is refused unless
 * the live scope still matches it.
 */
export interface BuildStudioNoteTarget {
  familyId: string
  childId: string
  projectId: string
  /** The acknowledged version the words are about. */
  versionId: string
  /** That version's stored document id. */
  versionDocId: string
  /** The visit the words were given in. */
  visitId: string
  /** ONE id per confirmed tap, minted with the draft and reused by its retry. */
  noteActionId: string
  /** How much authored help had been OFFERED when he spoke. Frozen with it. */
  help: 'none-offered' | 'hints-offered' | 'unknown'
  hintsOffered?: number
}

/** Do these two targets name the same acknowledged save, in the same visit? */
export function sameNoteTarget(
  a: BuildStudioNoteTarget | null,
  b: BuildStudioNoteTarget | null,
): boolean {
  if (!a || !b) return false
  return (
    a.familyId === b.familyId &&
    a.childId === b.childId &&
    a.projectId === b.projectId &&
    a.versionId === b.versionId &&
    a.versionDocId === b.versionDocId &&
    a.visitId === b.visitId
  )
}

/**
 * The key a `VoiceInput` instance is mounted under.
 *
 * Changing it REMOUNTS the component, which is how a recorder that was started
 * about one version is retired rather than carried into the next. Built from
 * the target, so there is no state in which the mic belongs to one save and the
 * draft to another.
 */
export const noteTargetKey = (target: BuildStudioNoteTarget | null): string =>
  target
    ? [
        target.familyId,
        target.childId,
        target.projectId,
        target.versionId,
        target.visitId,
      ].join('\u0000')
    : 'no-target'

/**
 * The exact payload one Save action will keep retrying.
 *
 * Held by the page so that a retry preserves **the bytes and the identity**
 * rather than re-reading the editor — re-reading would produce a different
 * snapshot, which is a different version, which is not a retry.
 */
export interface PendingSave {
  scope: BuildStudioScope
  versionId: string
  label: string
  createdAt: string
  files: Readonly<Record<string, string>>
  editorTarget?: string
  editorTargetVersion?: string
  goalId?: string
  /** How many times this exact payload has been sent. The auto-retry is one. */
  attempts: number
  /**
   * The SIGNATURE of the source in this payload — a digest of the canonical
   * archive, which excludes the editor's own `_history` bookkeeping.
   *
   * It replaces a counter, which was wrong in the one case that matters most.
   * A counter was read before the capture and incremented by every
   * `workspacesave` the capture itself provoked, so an ordinary clean Save
   * acknowledged as "you have made more changes since then" and falsely held
   * the next navigation. A signature compares CONTENT: the capture's own
   * events, a duplicate callback and a startup callback all carry the same
   * bytes and read clean, while a real edit reads dirty.
   */
  capturedSignature: string
}
