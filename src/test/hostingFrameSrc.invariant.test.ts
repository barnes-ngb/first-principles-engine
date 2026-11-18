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

/**
 * Every `<meta http-equiv="Content-Security-Policy">` in it, in document order.
 *
 * Read with the jsdom test environment's own `DOMParser` rather than a regex:
 * the policy contains `'self'`, and a pattern matching `["']` either side of an
 * attribute stops at that apostrophe inside a double-quoted value. The parser
 * is the thing a browser actually does.
 */
const metaPolicies = Array.from(
  new DOMParser()
    .parseFromString(INDEX_HTML, 'text/html')
    .querySelectorAll('meta[http-equiv]'),
).filter(
  (meta) => meta.getAttribute('http-equiv')?.toLowerCase() === 'content-security-policy',
)

/** One policy, with wrapping and runs of whitespace normalised away. */
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
  it('declares exactly ONE Content-Security-Policy meta', () => {
    // Zero is the failure that hid this: the served header alone is not what a
    // browser enforces. More than one is the same bug twice, since each is
    // enforced and the effective list is their intersection.
    expect(
      metaPolicies.length,
      metaPolicies.length === 0
        ? 'index.html declares no <meta http-equiv="Content-Security-Policy">; one must ' +
          'carry the authorised frame-src, because the browser enforces it alongside ' +
          'the served header and frames only what BOTH allow'
        : `index.html declares ${metaPolicies.length} CSP metas; a second list silently ` +
          'narrows the first',
    ).toBe(1)
  })

  it('carries the authorised header’s list, exactly', () => {
    // The whole repair: one list, written in two places, asserted to be one
    // list. The origins themselves are checked against ALLOWED above.
    const content = metaPolicies[0]?.getAttribute('content')
    expect(content, 'the CSP meta has no content attribute to read').toBeTruthy()
    expect(oneLine(content!)).toBe(oneLine(csp!))
  })
})
