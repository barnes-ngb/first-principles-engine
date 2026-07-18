import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PUBLIC_CATALOG_CLEAN_URL } from './catalogSitePublish'

/**
 * FEAT-85 Part 1 — the clean `/shop` address is a thin static redirect, served
 * BEFORE the SPA catch-all. These are config/asset assertions (no runtime), so
 * the invariant that makes the address work is guarded against a regression:
 *
 *  1. The redirect page ships in the app bundle at `public/shop/index.html`
 *     (Vite copies `public/**` verbatim into `dist`, so it deploys with hosting).
 *  2. Firebase Hosting serves static files ahead of rewrites, so `/shop` →
 *     `dist/shop/index.html` resolves BEFORE the `** → /index.html` SPA rewrite.
 *     We assert the SPA catch-all is present (so the app still routes) and that
 *     no rewrite `source` shadows `/shop`.
 *  3. The clean-address constant points at that `/shop` path.
 */

// Vitest runs from the repo root, so resolve assets/config against cwd.
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

describe('FEAT-85 clean /shop redirect', () => {
  it('ships the static redirect page in public/shop', () => {
    const html = read('public/shop/index.html')
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    // A JS redirect (location.replace) drives the hop for JS clients.
    expect(html).toContain('location.replace')
    // Self-contained — no external bundle refs (same posture as the catalog page).
    expect(html).not.toContain('src="http')
    // Single-family target constant the owner sets from the "live" panel.
    expect(html).toContain('CATALOG_URL')
  })

  it('keeps the SPA catch-all rewrite and lets /shop win as a static file', () => {
    const firebase = JSON.parse(read('firebase.json')) as {
      hosting: { public: string; rewrites: { source: string; destination: string }[] }
    }
    const { hosting } = firebase
    // Static assets are served from `dist`, where public/shop/index.html lands.
    expect(hosting.public).toBe('dist')
    // The SPA catch-all is still present (the app keeps routing).
    const catchAll = hosting.rewrites.find((r) => r.source === '**')
    expect(catchAll?.destination).toBe('/index.html')
    // Nothing rewrites `/shop` explicitly — the static file takes precedence, so
    // no rewrite may shadow it. (Firebase serves static files before rewrites.)
    expect(hosting.rewrites.some((r) => r.source.includes('/shop'))).toBe(false)
  })

  it('the clean-address constant points at the /shop redirect path', () => {
    expect(PUBLIC_CATALOG_CLEAN_URL.endsWith('/shop')).toBe(true)
  })
})
