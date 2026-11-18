/**
 * The recovery route: get the bytes out, whatever else has failed
 * (LOCAL-BUILD-001).
 *
 * ── Why this exists at all ────────────────────────────────────────────────
 *
 * Two things in this feature can fail in a way that would otherwise lose work a
 * child just did: the editor handshake (internal, version-sensitive actions
 * against somebody else's editor) and the durable write (a phone, a flaky
 * connection, a Firestore refusal). The slice's rule is that neither may end in
 * a dead end, so every failure on either side offers the same two downloads,
 * and they are honest about what they are:
 *
 *   • **the archive** — the exact canonical bytes an app save would have
 *     stored. It is the recovery bundle, and {@link readRecoveryArchive} is the
 *     route back IN, so the recovery this offers is real rather than advertised.
 *   • **`main.ts`** — the program as plain text, which can be pasted into the
 *     JavaScript side of stock `arcade.makecode.com` to rebuild the game by
 *     hand. A real external-editor route, and deliberately not described as an
 *     import.
 *
 * ── Three file kinds, and they are not interchangeable ──────────────────
 *
 * This matters because getting it wrong sends a person to a dialog that refuses
 * their file:
 *
 *   • a **JSON archive** (`…-source.json`) is THIS app's format. Stock MakeCode
 *     cannot open it; this app can, through {@link readRecoveryArchive}.
 *   • a **`.ts` text file** is code to paste, not a project to import.
 *   • a **MakeCode project PNG** is stock MakeCode's own import format. The one
 *     this feature ships is the prepared STARTER
 *     (`STARTER_PROJECT_PNG_URL`) and nothing else. It is never offered as
 *     recovery of edited work — substituting the starter for a failed save
 *     would replace what a child made with what he started from.
 *
 * Pure except for {@link downloadTextFile}, which is the only part that touches
 * the DOM.
 */

import {
  BUILD_STUDIO_MAX_ARCHIVE_BYTES,
  parseBuildStudioSource,
  serializeBuildStudioSource,
  utf8ByteLength,
  type BuildStudioSourceFiles,
} from '../../core/types/buildStudio'

export interface BuildStudioDownload {
  filename: string
  mime: string
  text: string
  /** What this file IS, said plainly on the button that offers it. */
  description: string
}

/** Slug a label into something safe for a file name. */
export function exportSlug(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'game'
}

/**
 * The two downloads for one set of source files.
 *
 * Takes the FILES, not a stored version, so the same pair is available when the
 * durable write is the thing that failed and there is no stored version yet.
 */
export function buildStudioDownloads(
  files: BuildStudioSourceFiles,
  label: string,
): BuildStudioDownload[] {
  const slug = exportSlug(label)
  const out: BuildStudioDownload[] = [
    {
      filename: `${slug}-source.json`,
      mime: 'application/json',
      text: serializeBuildStudioSource(files),
      description: 'All the game files, exactly as this app would save them',
    },
  ]
  const mainTs = files['main.ts']
  if (typeof mainTs === 'string' && mainTs.trim() !== '') {
    out.push({
      filename: `${slug}-main.ts`,
      mime: 'text/plain',
      text: mainTs,
      description:
        'Just the code, to paste into the JavaScript side of arcade.makecode.com',
    })
  }
  return out
}

/** The same pair for a stored version, read back from its archive. */
export function buildStudioDownloadsForArchive(
  archive: string,
  label: string,
): BuildStudioDownload[] {
  return buildStudioDownloads(parseBuildStudioSource(archive), label)
}

/**
 * Hand a file to the browser.
 *
 * The one DOM-touching function here. Revokes its own object URL on the next
 * frame rather than immediately — Safari has historically cancelled the
 * download when the URL went away in the same tick.
 */
export function downloadTextFile(download: BuildStudioDownload): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return
  }
  const blob = new Blob([download.text], { type: download.mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = download.filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Where to go when this app's editor will not come up at all.
 *
 * The plain editor, with no controller flag and nothing of ours in the URL — a
 * parent opens it and imports the starter project file, or starts a project and
 * pastes the code in. Stated as the fallback it is rather than as a feature.
 */
export const ARCADE_PLAIN_EDITOR_URL = 'https://arcade.makecode.com/'

/** The most bytes this will read back from a recovery file. */
export const RECOVERY_MAX_BYTES = BUILD_STUDIO_MAX_ARCHIVE_BYTES

export class RecoveryRefused extends Error {}

/**
 * Read one of THIS app's exported archives back into a file map.
 *
 * What makes the download a recovery rather than a souvenir. Bounded and
 * checked exactly as a save is, because a file off a disk is untrusted input:
 * a size ceiling before parsing, the same `parseBuildStudioSource` shape rule,
 * and the same required manifest. It returns the files and nothing else — the
 * caller decides what to do with them, and the caller is an explicit action.
 *
 * It deliberately does NOT accept a MakeCode project PNG: that is stock
 * MakeCode's format, this app cannot read it, and pretending otherwise would
 * refuse a parent's file with a confusing message.
 */
export function readRecoveryArchive(text: string): BuildStudioSourceFiles {
  if (utf8ByteLength(text) > RECOVERY_MAX_BYTES) {
    throw new RecoveryRefused('That file is too big to open here.')
  }
  let files: BuildStudioSourceFiles
  try {
    files = parseBuildStudioSource(text)
  } catch {
    throw new RecoveryRefused(
      'That is not a game file this app saved. Pick the file ending in -source.json.',
    )
  }
  if (typeof files['pxt.json'] !== 'string' || typeof files['main.ts'] !== 'string') {
    throw new RecoveryRefused(
      'That game file is missing part of the project, so it was not opened.',
    )
  }
  return files
}
