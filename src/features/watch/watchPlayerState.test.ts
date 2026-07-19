import { describe, expect, it } from 'vitest'

import { WATCH_PLAYER_STATE, isEndedState, mapPlayerError } from './watchPlayerState'

describe('isEndedState (the end-stop trigger)', () => {
  it('is true ONLY for ENDED (0)', () => {
    expect(isEndedState(WATCH_PLAYER_STATE.ENDED)).toBe(true)
  })

  it('is false for every non-ended state — playback the app leaves alone', () => {
    expect(isEndedState(WATCH_PLAYER_STATE.UNSTARTED)).toBe(false)
    expect(isEndedState(WATCH_PLAYER_STATE.PLAYING)).toBe(false)
    expect(isEndedState(WATCH_PLAYER_STATE.PAUSED)).toBe(false)
    expect(isEndedState(WATCH_PLAYER_STATE.BUFFERING)).toBe(false)
    expect(isEndedState(WATCH_PLAYER_STATE.CUED)).toBe(false)
  })
})

describe('mapPlayerError', () => {
  it('always gives a non-blaming kid message', () => {
    for (const code of [2, 5, 100, 101, 150, 999]) {
      expect(mapPlayerError(code).kid).toMatch(/tell a grown-up/i)
    }
  })

  it('names the removed/private case (100) in the parent-visible detail', () => {
    expect(mapPlayerError(100).detail).toMatch(/removed or made private/i)
  })

  it('names embedding-disabled (101/150) in the detail', () => {
    expect(mapPlayerError(101).detail).toMatch(/embedded/i)
    expect(mapPlayerError(150).detail).toMatch(/embedded/i)
  })

  it('falls back to a coded detail for unknown codes (no silent failure)', () => {
    expect(mapPlayerError(42).detail).toContain('42')
  })
})
