import { describe, expect, it } from 'vitest'

import {
  resolveTimerOwner,
  timerOwnerDiffers,
  timerOwnerLine,
} from './creativeTimerOwner'

describe('resolveTimerOwner (UX-327)', () => {
  it('writes the hours row for the child the session was started for', () => {
    expect(resolveTimerOwner('lincoln', 'london')).toBe('lincoln')
  })

  it('is the same answer when the header never moved', () => {
    expect(resolveTimerOwner('lincoln', 'lincoln')).toBe('lincoln')
  })

  it('falls back to the live child when a timer carries no owner', () => {
    // An in-memory state from before this field existed, or a persisted record
    // written by an older build. That is exactly what shipped before, so this
    // path is unchanged rather than newly refused.
    expect(resolveTimerOwner(null, 'london')).toBe('london')
    expect(resolveTimerOwner(undefined, 'london')).toBe('london')
    expect(resolveTimerOwner('', 'london')).toBe('london')
  })
})

describe('timerOwnerDiffers', () => {
  it('is true only when both are known and they disagree', () => {
    expect(timerOwnerDiffers('lincoln', 'london')).toBe(true)
    expect(timerOwnerDiffers('lincoln', 'lincoln')).toBe(false)
  })

  it('says nothing when either side is unknown', () => {
    // A child still resolving is not a switch, and an owner-less timer has
    // nothing to contrast with.
    expect(timerOwnerDiffers(null, 'london')).toBe(false)
    expect(timerOwnerDiffers('lincoln', '')).toBe(false)
  })
})

describe('timerOwnerLine', () => {
  it('names the child the minutes are logged to, twice', () => {
    expect(timerOwnerLine('Lincoln')).toBe(
      "This time is Lincoln's — it will be logged to Lincoln.",
    )
  })

  it('still says where the time goes when it cannot name the child', () => {
    expect(timerOwnerLine(undefined)).toMatch(/logged to the child it was started for/)
    expect(timerOwnerLine(undefined)).not.toMatch(/undefined/)
  })
})
