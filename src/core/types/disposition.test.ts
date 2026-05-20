import { describe, expect, it } from 'vitest'
import { effectiveDispositionText } from './disposition'
import type { DispositionEntry, DispositionNarrativeOverride } from './disposition'

describe('effectiveDispositionText', () => {
  const entry: DispositionEntry = {
    level: 'growing',
    narrative: 'AI generated narrative about curiosity.',
    trend: 'up',
  }

  it('returns AI narrative when no override exists', () => {
    expect(effectiveDispositionText(entry)).toBe('AI generated narrative about curiosity.')
    expect(effectiveDispositionText(entry, undefined)).toBe('AI generated narrative about curiosity.')
  })

  it('returns override text when override exists', () => {
    const override: DispositionNarrativeOverride = {
      text: 'Shelly corrected narrative.',
      overriddenBy: 'parent',
      overriddenAt: '2026-04-14T12:00:00Z',
    }
    expect(effectiveDispositionText(entry, override)).toBe('Shelly corrected narrative.')
  })

  it('returns override text even when note is present', () => {
    const override: DispositionNarrativeOverride = {
      text: 'Updated narrative with note.',
      overriddenBy: 'parent',
      overriddenAt: '2026-04-14T12:00:00Z',
      note: 'AI missed the speech progress',
    }
    expect(effectiveDispositionText(entry, override)).toBe('Updated narrative with note.')
  })
})
