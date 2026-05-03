import { describe, expect, it } from 'vitest'

import { DayBlockType, RoutineItemKey } from '../../core/types/enums'
import {
  getTemplateForChild,
  lincolnTemplate,
  londonTemplate,
} from './dailyPlanTemplates'

// ── getTemplateForChild ───────────────────────────────────────

describe('getTemplateForChild', () => {
  it('returns Lincoln template for "Lincoln"', () => {
    expect(getTemplateForChild('Lincoln')).toBe(lincolnTemplate)
  })

  it('returns London template for "London"', () => {
    expect(getTemplateForChild('London')).toBe(londonTemplate)
  })

  it('is case-insensitive', () => {
    expect(getTemplateForChild('lincoln')).toBe(lincolnTemplate)
    expect(getTemplateForChild('LONDON')).toBe(londonTemplate)
    expect(getTemplateForChild('LiNcOlN')).toBe(lincolnTemplate)
  })

  it('returns undefined for unknown child', () => {
    expect(getTemplateForChild('Alice')).toBeUndefined()
    expect(getTemplateForChild('')).toBeUndefined()
  })
})

// ── lincolnTemplate ───────────────────────────────────────────

describe('lincolnTemplate', () => {
  it('starts with Formation block', () => {
    expect(lincolnTemplate.dayBlocks[0]).toBe(DayBlockType.Formation)
  })

  it('includes core academic blocks', () => {
    expect(lincolnTemplate.dayBlocks).toContain(DayBlockType.Reading)
    expect(lincolnTemplate.dayBlocks).toContain(DayBlockType.Math)
    expect(lincolnTemplate.dayBlocks).toContain(DayBlockType.Speech)
  })

  it('includes Lincoln-specific routine items', () => {
    expect(lincolnTemplate.routineItems).toContain(RoutineItemKey.Handwriting)
    expect(lincolnTemplate.routineItems).toContain(RoutineItemKey.Spelling)
    expect(lincolnTemplate.routineItems).toContain(RoutineItemKey.MinecraftReading)
    expect(lincolnTemplate.routineItems).toContain(RoutineItemKey.ReadingEggs)
  })

  it('does not include ReadAloud (London-specific)', () => {
    expect(lincolnTemplate.routineItems).not.toContain(RoutineItemKey.ReadAloud)
  })

  it('has block instructions for all day blocks', () => {
    for (const block of lincolnTemplate.dayBlocks) {
      expect(lincolnTemplate.blockInstructions[block]).toBeDefined()
      expect(lincolnTemplate.blockInstructions[block]!.length).toBeGreaterThan(0)
    }
  })

  it('has a minimum viable day with at least 3 items', () => {
    expect(lincolnTemplate.minimumViableDay.length).toBeGreaterThanOrEqual(3)
  })
})

// ── londonTemplate ────────────────────────────────────────────

describe('londonTemplate', () => {
  it('starts with Formation block', () => {
    expect(londonTemplate.dayBlocks[0]).toBe(DayBlockType.Formation)
  })

  it('includes ReadAloud in routine items', () => {
    expect(londonTemplate.routineItems).toContain(RoutineItemKey.ReadAloud)
  })

  it('does not include Lincoln-specific items', () => {
    expect(londonTemplate.routineItems).not.toContain(RoutineItemKey.Handwriting)
    expect(londonTemplate.routineItems).not.toContain(RoutineItemKey.Spelling)
    expect(londonTemplate.routineItems).not.toContain(RoutineItemKey.MinecraftReading)
    expect(londonTemplate.routineItems).not.toContain(RoutineItemKey.ReadingEggs)
  })

  it('has fewer routine items than Lincoln (simpler routine)', () => {
    expect(londonTemplate.routineItems.length).toBeLessThan(
      lincolnTemplate.routineItems.length,
    )
  })

  it('does not include Project block (simpler day)', () => {
    expect(londonTemplate.dayBlocks).not.toContain(DayBlockType.Project)
  })

  it('has a minimum viable day', () => {
    expect(londonTemplate.minimumViableDay.length).toBeGreaterThanOrEqual(3)
  })
})
