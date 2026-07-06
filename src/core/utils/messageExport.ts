// ── Chat message export (FEAT-59) ────────────────────────────────────────
//
// Pure helpers for the "copy as Markdown" and "download as .md" per-message
// affordances shared by the two parent chats (Shelly portal + Foundations
// Review). Zero new infra: the download is a client-side Blob + anchor. The
// message markdown is the model's raw text — copied/downloaded verbatim, never
// the rendered-then-mangled DOM text.

export interface MessageExportMeta {
  /** Short chat identifier used in the filename, e.g. `shelly` / `foundations-review`. */
  chat: string
  /** ISO timestamp of the message (drives the filename date + header). */
  timestamp: string
  /** Optional child label for the header (e.g. `Lincoln`). */
  child?: string
  /** Optional source/context label for the header (e.g. `general` / `reading`). */
  source?: string
}

/** `YYYY-MM-DD` from an ISO timestamp (falls back to the raw string's date part). */
export function isoDate(timestamp: string): string {
  const d = new Date(timestamp)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return timestamp.slice(0, 10)
}

/** Kebab slug from the first words of the message (≤ 40 chars, safe for filenames). */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[`*_#>[\]()]/g, ' ') // drop markdown punctuation before slugging
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug || 'message'
}

/** Filename for a downloaded message: `{chat}-{date}-{slug}.md`. */
export function buildMessageFilename(text: string, meta: MessageExportMeta): string {
  return `${meta.chat}-${isoDate(meta.timestamp)}-${slugify(text)}.md`
}

/**
 * The `.md` file body: a one-line header (child / date / source) as a Markdown
 * blockquote, a blank line, then the message markdown verbatim.
 */
export function buildMessageMarkdownFile(text: string, meta: MessageExportMeta): string {
  const parts = [meta.child, isoDate(meta.timestamp), meta.source].filter(
    (p): p is string => Boolean(p && p.trim()),
  )
  const header = `> ${parts.join(' · ')}`
  return `${header}\n\n${text.trim()}\n`
}

/** Copy text to the clipboard. Returns true on success. Thin, side-effecting. */
export async function copyMarkdown(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  // Legacy fallback for insecure contexts / older browsers.
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** Trigger a client-side `.md` file download (Blob + anchor). Thin, side-effecting. */
export function downloadMarkdownFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
