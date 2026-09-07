import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * **A deploy has to be visible on the next load (UX-264).**
 *
 * The owner deployed, opened the Weekly Review and read the **old** page —
 * *No Review Yet · Generate Now · "Week of Aug 30 – Sep 5"* — none of which had
 * existed since PR #1785. Nothing was wrong with the deploy. There is no service
 * worker in this app (`public/manifest.json` only, no `sw.js`), so the only
 * cache in play was the browser's, and `firebase.json` set a `Cache-Control` on
 * `/assets/**` and on **nothing else**. The shell therefore fell to Firebase
 * Hosting's default and could sit in a phone's cache for up to an hour, pointing
 * at old chunks that — being content-hashed and immutable — were all still there
 * and all still served happily. *Deployed* is what the server has; *live* is what
 * the phone loaded.
 *
 * ── Why the ORDER is the fix, and why it is pinned here ─────────────────────
 *
 * Two behaviours of Firebase Hosting's `headers` decide this, and **neither is
 * stated in the docs** (firebase-tools#9467 is the open docs bug; the published
 * "first rule wins" sentence is scoped to `redirects` and `rewrites` and does not
 * mention `headers` at all):
 *
 *   1. **All matching entries apply, and for the SAME header key the LAST-listed
 *      one wins.** Firebase's own serving implementation reduces every match into
 *      a list and `res.setHeader`s them in array order (`superstatic`,
 *      `src/middleware/headers.js`), and firebase-tools#8917 reports exactly this
 *      in production: a specific `/sw.js` no-cache rule was overridden by a
 *      later globstar-then-`.js` wildcard rule, and only won once it was moved
 *      *after* it.
 *   2. **`source` is matched against the ORIGINAL request path, before any
 *      rewrite.** (`Header.glob` in the Hosting REST API: *"the user-supplied
 *      glob to match against the request URL path"*; `superstatic` runs its
 *      `headers` middleware ahead of `rewrites`.) This is why the obvious fix —
 *      a `Cache-Control` on `/index.html` — does **not** work here: this is an
 *      SPA with a `**` → `/index.html` rewrite, so a phone opening or refreshing
 *      `/weekly-review` never requests a path equal to `/index.html`, and the
 *      header would miss the very load the owner made.
 *
 * So the broad `**` entry carries `no-cache` and must come **first**, and the
 * hashed-asset rule must come **last** to win back `immutable` for the one place
 * long caching is safe. Reversing them — or "tidying" the array — silently
 * un-caches every hashed asset on every load, which is a real cost on a phone
 * and produces no test failure anywhere else in this repo. Hence this file.
 *
 * The assertions are about ORDER and OVERLAP, not about the literal strings, so
 * changing the CSP or the max-age does not require touching this test.
 */

type HostingHeader = { key: string; value: string }
type HostingHeaderRule = { source: string; headers: HostingHeader[] }

const firebaseJson = JSON.parse(
  readFileSync(resolve(__dirname, '../../firebase.json'), 'utf-8'),
) as {
  hosting: Array<{ target: string; headers?: HostingHeaderRule[] }>
}

const appHosting = firebaseJson.hosting.find((h) => h.target === 'app')
const rules: HostingHeaderRule[] = appHosting?.headers ?? []

const cacheControlOf = (rule: HostingHeaderRule | undefined): string | undefined =>
  rule?.headers.find((h) => h.key === 'Cache-Control')?.value

const ruleFor = (source: string) => rules.find((r) => r.source === source)
const indexOfRule = (source: string) => rules.findIndex((r) => r.source === source)

describe('hosting cache headers (UX-264)', () => {
  it('gives the app shell a Cache-Control at all', () => {
    // The bug itself: with no Cache-Control on anything but /assets/**, the
    // shell fell to Hosting's default and a deploy stayed invisible for up to an
    // hour. Any explicit revalidating value satisfies this; the absence does not.
    const cacheControl = cacheControlOf(ruleFor('**'))
    expect(cacheControl).toBeDefined()
    expect(cacheControl).toMatch(/no-cache|no-store|max-age=0/)
  })

  it('matches the shell on a broad glob, not on /index.html', () => {
    // Headers match the pre-rewrite request path, so a rule keyed on
    // `/index.html` would not apply to a phone opening or refreshing
    // `/weekly-review` — the exact load the owner made. A rule that only ever
    // fires for someone entering at the site root is not the fix.
    expect(ruleFor('**')).toBeDefined()

    const shellOnlyRules = rules.filter(
      (r) => r.source === '/index.html' || r.source === '/',
    )
    for (const rule of shellOnlyRules) {
      expect(
        cacheControlOf(rule),
        `${rule.source} may carry Cache-Control, but it can never be the ONLY thing that does`,
      ).toBeDefined()
    }
  })

  it('still caches hashed assets immutably', () => {
    expect(cacheControlOf(ruleFor('/assets/**'))).toMatch(/immutable/)
  })

  it('lists the hashed-asset rule AFTER the broad one, because last-wins', () => {
    // The load-bearing assertion. Both rules match a request for
    // /assets/index-abc123.js and both set Cache-Control, so the one listed
    // later is the one that takes effect. Swap these and every hashed asset
    // silently becomes no-cache: correct, but slow, and nothing else here fails.
    const broad = indexOfRule('**')
    const assets = indexOfRule('/assets/**')

    expect(broad).toBeGreaterThanOrEqual(0)
    expect(assets).toBeGreaterThanOrEqual(0)
    expect(assets).toBeGreaterThan(broad)
  })

  it('keeps exactly one Cache-Control per rule', () => {
    // Two Cache-Control entries inside one rule is a coin toss over which is
    // sent, and reads as if both applied.
    for (const rule of rules) {
      const cacheControls = rule.headers.filter((h) => h.key === 'Cache-Control')
      expect(cacheControls.length, `${rule.source} sets ${cacheControls.length}`).toBeLessThanOrEqual(1)
    }
  })

  it('keeps the CSP on the broad rule, where every request still picks it up', () => {
    // The CSP moved with the `**` rule when it was reordered. It is a whole-site
    // header and must not have been narrowed on the way.
    const csp = ruleFor('**')?.headers.find(
      (h) => h.key === 'Content-Security-Policy',
    )
    expect(csp?.value).toContain('youtube-nocookie.com')
  })
})
