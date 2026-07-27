import { describe, expect, it } from 'vitest'

import {
  buildWatchEmbedUrl,
  currentOrigin,
  WATCH_EMBED_HOST,
  WATCH_IFRAME_ALLOW,
  WATCH_IFRAME_SANDBOX,
} from './watchEmbedUrl'

describe('buildWatchEmbedUrl', () => {
  it('always uses the nocookie host (no tracking cookie until play)', () => {
    expect(WATCH_EMBED_HOST).toBe('https://www.youtube-nocookie.com')
    expect(buildWatchEmbedUrl('dQw4w9WgXcQ')).toContain('https://www.youtube-nocookie.com/embed/')
    // Never the plain youtube.com watch/embed host.
    expect(buildWatchEmbedUrl('dQw4w9WgXcQ')).not.toContain('//www.youtube.com')
  })

  it('carries the locked child-safe params', () => {
    const p = new URL(buildWatchEmbedUrl('abc123')).searchParams
    expect(p.get('enablejsapi')).toBe('1')
    expect(p.get('autoplay')).toBe('0')
    expect(p.get('rel')).toBe('0')
    expect(p.get('iv_load_policy')).toBe('3')
    expect(p.get('playsinline')).toBe('1')
    expect(p.get('fs')).toBe('0')
    // Kept ON deliberately — pause/scrub matter more to a 6-year-old than hiding
    // a logo the sandbox already neutralises.
    expect(p.get('controls')).toBe('1')
    // Keyboard control stays for accessibility.
    expect(p.get('disablekb')).toBe('0')
  })

  it('embeds exactly the requested video id', () => {
    expect(new URL(buildWatchEmbedUrl('dQw4w9WgXcQ')).pathname).toBe('/embed/dQw4w9WgXcQ')
  })

  it('never emits a playlist or a next-video handoff', () => {
    const url = buildWatchEmbedUrl('abc123')
    expect(url).not.toContain('playlist')
    expect(url).not.toContain('list=')
    expect(url).not.toContain('loop=1')
  })

  it('sets origin when known and omits it rather than guessing when not', () => {
    expect(new URL(buildWatchEmbedUrl('abc123', 'https://app.example')).searchParams.get('origin')).toBe(
      'https://app.example',
    )
    expect(new URL(buildWatchEmbedUrl('abc123', null)).searchParams.has('origin')).toBe(false)
    expect(new URL(buildWatchEmbedUrl('abc123')).searchParams.has('origin')).toBe(false)
  })

  it('escapes an id rather than letting it inject extra params', () => {
    const url = new URL(buildWatchEmbedUrl('abc&rel=1'))
    expect(url.pathname).toBe('/embed/abc%26rel%3D1')
    expect(url.searchParams.get('rel')).toBe('0')
  })

  it('currentOrigin reflects the page in a browser-like environment', () => {
    expect(currentOrigin()).toBe(window.location.origin)
  })
})

describe('iframe hardening attributes', () => {
  const tokens = WATCH_IFRAME_SANDBOX.split(/\s+/).filter(Boolean)

  it('grants only what the player needs to run', () => {
    expect(tokens).toEqual(['allow-scripts', 'allow-same-origin'])
  })

  it('withholds every token that would open a way out', () => {
    for (const escape of [
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-top-navigation',
      'allow-top-navigation-by-user-activation',
      'allow-downloads',
      'allow-modals',
      'allow-forms',
    ]) {
      expect(tokens).not.toContain(escape)
    }
  })

  it('delegates only encrypted-media — never the share sheet or fullscreen', () => {
    expect(WATCH_IFRAME_ALLOW).toBe('encrypted-media')
    expect(WATCH_IFRAME_ALLOW).not.toContain('web-share')
    expect(WATCH_IFRAME_ALLOW).not.toContain('fullscreen')
  })
})
