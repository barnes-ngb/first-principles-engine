import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The app's `frame-src` is a NAMED list, and that is the whole invariant
 * (LOCAL-BUILD-001).
 *
 * Two third-party frames are embedded in this product and each was authorised
 * on its own: `youtube-nocookie.com` for a vetted watch item, and
 * `arcade.makecode.com` for the Build Studio's editor — which simply cannot
 * load under the previous header. Both are exact origins.
 *
 * What this exists to stop is the easy next step: a wildcard, a bare scheme, or
 * `*` "while we work out which host it is". A CSP that admits anything is a CSP
 * that admits the thing nobody thought of, and this file is where that gets
 * noticed rather than deployed.
 *
 * It is deliberately separate from `hostingCacheHeaders.invariant.test.ts`,
 * whose own header says changing the CSP does not require touching its cache
 * assertions. Nothing here reads a cache rule.
 *
 * ── Why the HEADER alone was not the policy ────────────────────────────────
 *
 * A browser enforces every CSP it is delivered, and a frame has to satisfy ALL
 * of them — the effective `frame-src` is the INTERSECTION, not the union. The
 * served header named `arcade.makecode.com`; `index.html` shipped a SECOND
 * policy as a `<meta http-equiv>` that still named only `'self'` and YouTube,
 * so the intersection blocked the editor and the Build Studio sat waiting for a
 * frame that could never load — a production timeout with a console CSP
 * violation and a header that looked correct. So the two lists are asserted to
 * be the same list, and a missing meta fails by name rather than by absence.
 */

type HostingHeader = { key: string; value: string }
type HostingHeaderRule = { source: string; headers: HostingHeader[] }

const config = JSON.parse(
  readFileSync(resolve(__dirname, '..', '..', 'firebase.json'), 'utf8'),
) as { hosting: Array<{ target: string; headers?: HostingHeaderRule[] }> }

const appHosting = config.hosting.find((h) => h.target === 'app')
const broadRule = appHosting?.headers?.find((r) => r.source === '**')
const csp = broadRule?.headers.find((h) => h.key === 'Content-Security-Policy')?.value

/** The exact origins this app is allowed to frame. */
const ALLOWED = [
  "'self'",
  'https://www.youtube-nocookie.com',
  'https://arcade.makecode.com',
]

/** The static document, which delivers a policy of its very own. */
const INDEX_HTML = readFileSync(resolve(__dirname, '..', '..', 'index.html'), 'utf8')

/** Every `<meta http-equiv="Content-Security-Policy">` in it, in document order. */
const metaPolicyTags = [
  ...INDEX_HTML.matchAll(
    /<meta\s[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi,
  ),
].map((match) => match[0])

const metaContent = (tag: string): string | undefined =>
  tag.match(/content=["']([^"']*)["']/i)?.[1]

/** One policy, as its source tokens — whitespace and wrapping normalised away. */
const sourcesOf = (policy: string): string[] =>
  policy.trim().replace(/^frame-src\s+/, '').split(/\s+/)

const oneLine = (policy: string): string => policy.trim().replace(/\s+/g, ' ')

describe('the app frame-src names exactly the origins we embed', () => {
  it('reads a real app hosting target and a real CSP (guards itself)', () => {
    expect(appHosting, 'no app hosting target').toBeTruthy()
    expect(csp, 'no Content-Security-Policy on the broad rule').toBeTruthy()
  })

  it('declares frame-src and nothing else in this header', () => {
    expect(csp!.trim().startsWith('frame-src ')).toBe(true)
    expect(csp).not.toContain(';')
  })

  it('lists exactly the authorised origins, in one place', () => {
    const sources = csp!.trim().replace(/^frame-src\s+/, '').split(/\s+/)
    expect(sources).toEqual(ALLOWED)
  })

  it('allows the MakeCode editor the Build Studio embeds', () => {
    // Without this the authorised feature cannot load at all.
    expect(csp).toContain('https://arcade.makecode.com')
  })

  it('keeps the watch surface’s own origin', () => {
    expect(csp).toContain('https://www.youtube-nocookie.com')
  })

  it('admits no wildcard, bare scheme or blanket source', () => {
    // Checked as SOURCE TOKENS, not substrings: `https://www.youtube-nocookie.com`
    // legitimately contains the characters of a bare `https:` scheme source.
    const sources = csp!.trim().replace(/^frame-src\s+/, '').split(/\s+/)
    for (const forbidden of [
      '*',
      'https:',
      'http:',
      'data:',
      'blob:',
      "'unsafe-inline'",
      "'unsafe-eval'",
      "'none'",
    ]) {
      expect(sources, `frame-src must not list ${forbidden}`).not.toContain(forbidden)
    }
    // And no wildcard anywhere inside a source, which `toContain` on the list
    // would miss (`https://*.example.com`).
    for (const source of sources) {
      expect(source, `wildcard in ${source}`).not.toContain('*')
    }
  })

  it('uses https for every remote origin — no http, no protocol-relative', () => {
    const remote = csp!
      .trim()
      .replace(/^frame-src\s+/, '')
      .split(/\s+/)
      .filter((s) => s !== "'self'")
    expect(remote.length).toBeGreaterThan(0)
    for (const origin of remote) {
      expect(origin.startsWith('https://'), origin).toBe(true)
      // An exact origin: scheme + host, with no path and no subdomain wildcard.
      expect(origin).toMatch(/^https:\/\/[a-z0-9.-]+$/)
    }
  })

  it('puts the CSP on the broad rule, where every request picks it up', () => {
    expect(broadRule?.source).toBe('**')
  })
})

describe('index.html delivers the SAME policy, because browsers intersect them', () => {
  it('declares a Content-Security-Policy meta at all', () => {
    expect(
      metaPolicyTags.length,
      'index.html declares no <meta http-equiv="Content-Security-Policy"> — if one is ' +
        'added later it must carry the authorised list, since the browser enforces it ' +
        'alongside the served header and frames only what BOTH allow',
    ).toBeGreaterThan(0)
  })

  it('declares exactly ONE, so there is one list to keep right', () => {
    expect(
      metaPolicyTags.length,
      `index.html declares ${metaPolicyTags.length} CSP metas; each one is enforced, so a ` +
        'second list silently narrows the first',
    ).toBe(1)
  })

  it('names exactly the authorised origins, in the same order as the header', () => {
    const content = metaContent(metaPolicyTags[0])
    expect(content, 'the CSP meta has no content attribute to read').toBeTruthy()
    expect(content!.trim().startsWith('frame-src ')).toBe(true)
    expect(sourcesOf(content!)).toEqual(ALLOWED)
  })

  it('is byte-for-byte the authorised header list', () => {
    // The whole repair: one list, written twice, asserted to be one list.
    expect(oneLine(metaContent(metaPolicyTags[0])!)).toBe(oneLine(csp!))
  })

  it('allows the MakeCode editor — the origin whose absence here timed out', () => {
    expect(
      metaContent(metaPolicyTags[0]) ?? '',
      'the meta must allow https://arcade.makecode.com; however permissive the served ' +
        'header is, the intersection of the two is what loads the editor',
    ).toContain('https://arcade.makecode.com')
  })

  it('still allows the watch surface’s own origin', () => {
    expect(metaContent(metaPolicyTags[0]) ?? '').toContain('https://www.youtube-nocookie.com')
  })
})
