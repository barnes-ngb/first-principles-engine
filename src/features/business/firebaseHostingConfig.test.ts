import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * FEAT-86 — dedicated short catalog site (`barnesbro.web.app`) via a two-target
 * Firebase Hosting config. These are config characterization assertions (no
 * runtime): the whole point of the run is to add the `shop` target WITHOUT
 * changing ANY behavior of the main app deploy, so we pin both.
 *
 *  1. `firebase.json` hosting is a two-entry array (`app` + `shop`).
 *  2. The `app` entry's behavior-bearing fields (public / ignore / rewrites /
 *     headers) are byte-identical to the pre-FEAT-86 single-site config — only
 *     the site identity moved from `site: "first-principles-engine"` to
 *     `target: "app"` (mapped back to that site in `.firebaserc`).
 *  3. The `shop` entry serves `shop-site` with clean URLs.
 *  4. `.firebaserc` maps `app → first-principles-engine` and `shop → barnesbro`.
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

// The main app's behavior-bearing hosting config, frozen from the pre-FEAT-86
// single-site block. If a future change alters any of these, the app deploy is
// no longer byte-equivalent and this snapshot must be updated deliberately.
const PREVIOUS_APP_CONFIG = {
  public: 'dist',
  ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
  rewrites: [{ source: '**', destination: '/index.html' }],
  headers: [
    {
      source: '/assets/**',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
  ],
}

interface HostingEntry {
  target?: string
  site?: string
  public: string
  ignore?: string[]
  rewrites?: { source: string; destination: string }[]
  headers?: unknown[]
  cleanUrls?: boolean
}

describe('FEAT-86 two-target hosting config', () => {
  const firebase = JSON.parse(read('firebase.json')) as { hosting: HostingEntry[] }

  it('firebase.json parses with a two-target hosting array', () => {
    expect(Array.isArray(firebase.hosting)).toBe(true)
    const targets = firebase.hosting.map((h) => h.target)
    expect(targets).toContain('app')
    expect(targets).toContain('shop')
  })

  it('the app entry deep-equals the previous main-site config (behavior unchanged)', () => {
    const app = firebase.hosting.find((h) => h.target === 'app')
    expect(app).toBeDefined()
    // Every behavior-bearing field is preserved exactly.
    expect(app!.public).toEqual(PREVIOUS_APP_CONFIG.public)
    expect(app!.ignore).toEqual(PREVIOUS_APP_CONFIG.ignore)
    expect(app!.rewrites).toEqual(PREVIOUS_APP_CONFIG.rewrites)
    expect(app!.headers).toEqual(PREVIOUS_APP_CONFIG.headers)
    // Identity moved to the target; no stray `site` key remains on the entry.
    expect(app!.site).toBeUndefined()
  })

  it('the shop entry serves shop-site with clean URLs', () => {
    const shop = firebase.hosting.find((h) => h.target === 'shop')
    expect(shop).toBeDefined()
    expect(shop!.public).toBe('shop-site')
    expect(shop!.cleanUrls).toBe(true)
  })

  it('.firebaserc maps app → first-principles-engine and shop → barnesbro', () => {
    const rc = JSON.parse(read('.firebaserc')) as {
      targets?: Record<string, { hosting?: Record<string, string[]> }>
    }
    const hosting = rc.targets?.['barneshome-3dfbb']?.hosting
    expect(hosting?.app).toEqual(['first-principles-engine'])
    expect(hosting?.shop).toEqual(['barnesbro'])
  })

  it('shop-site/index.html redirects to the baked catalog URL', () => {
    const html = read('shop-site/index.html')
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    // A JS redirect (location.replace) drives the hop for JS clients.
    expect(html).toContain('location.replace')
    // The owner-pasted, stable published catalog URL is baked in.
    expect(html).toContain('public%2Fcatalog%2F')
    expect(html).toContain('firebasestorage.googleapis.com')
    // Self-contained — no external bundle refs.
    expect(html).not.toContain('src="http')
  })
})
