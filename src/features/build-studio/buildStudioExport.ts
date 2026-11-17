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
 *     stored. It is the recovery bundle: paired with this app it restores
 *     perfectly, because it IS what the collection holds.
 *   • **`main.ts`** — the program as plain text, which can be pasted into the
 *     JavaScript side of stock `arcade.makecode.com` to rebuild the game by
 *     hand. That is a real external-editor route and it is deliberately not
 *     described as an import: this app cannot produce a `.mkcd`, which is
 *     MakeCode's own binary project file, and claiming otherwise would send a
 *     parent to a dialog that refuses the file.
 *
 * Pure except for {@link downloadTextFile}, which is the only part that touches
 * the DOM, so the naming, the contents and the honesty of the pair are testable
 * without a browser.
 */

import {
  parseBuildStudioSource,
  serializeBuildStudioSource,
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
 * parent opens it, starts a project and pastes the code in. Stated as the
 * fallback it is rather than as a feature.
 */
export const ARCADE_PLAIN_EDITOR_URL = 'https://arcade.makecode.com/'
