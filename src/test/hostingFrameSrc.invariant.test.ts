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
