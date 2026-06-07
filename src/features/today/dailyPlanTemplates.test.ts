import { describe, expect, it } from 'vitest'

import { DayBlockType } from '../../core/types/enums'
import {
  getTemplateForChild,
  lincolnTemplate,
  londonTemplate,
} from './dailyPlanTemplates'
import type { DailyPlanTemplate } from './dailyPlanTemplates'

// ─── getTemplateForChild ────────────────────────────────────────────────────

describe('getTemplateForChild', () => {
  it('returns Lincoln template for "Lincoln"', () => {
    expect(getTemplateForChild('Lincoln')).toBe(lincolnTemplate)
  })

  it('returns London template for "London"', () => {
    expect(getTemplateForChild('London')).toBe(londonTemplate)
  })

  it('is case-insensitive', () => {
    expect(getTemplateForChild('LINCOLN')).toBe(lincolnTemplate)
    expect(getTemplateForChild('london')).toBe(londonTemplate)
    expect(getTemplateForChild('LinCoLn')).toBe(lincolnTemplate)
  })

  it('returns undefined for unknown child', () => {
    expect(getTemplateForChild('Unknown')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(getTemplateForChild('')).toBeUndefined()
  })
})

// ─── Template data integrity ────────────────────────────────────────────────

function assertValidTemplate(template: DailyPlanTemplate, name: string) {
  describe(`${name} template`, () => {
    it('has a non-empty label', () => {
      expect(template.label).toBeTruthy()
    })

    it('has at least one day block', () => {
      expect(template.dayBlocks.length).toBeGreaterThan(0)
    })

    it('has at least one routine item', () => {
      expect(template.routineItems.length).toBeGreaterThan(0)
    })

    it('has at least one minimum viable day item', () => {
      expect(template.minimumViableDay.length).toBeGreaterThan(0)
    })

    it('starts with Formation block', () => {
      expect(template.dayBlocks[0]).toBe(DayBlockType.Formation)
    })

    it('includes Reading and Math blocks', () => {
      expect(template.dayBlocks).toContain(DayBlockType.Reading)
      expect(template.dayBlocks).toContain(DayBlockType.Math)
    })

    it('has instructions for every block type in dayBlocks', () => {
      for (const block of template.dayBlocks) {
        expect(
          template.blockInstructions[block],
          `missing instructions for ${block}`,
        ).toBeDefined()
        expect(template.blockInstructions[block]!.length).toBeGreaterThan(0)
      }
    })

    it('has no duplicate day blocks', () => {
      const unique = new Set(template.dayBlocks)
      expect(unique.size).toBe(template.dayBlocks.length)
    })

    it('has no duplicate routine items', () => {
      const unique = new Set(template.routineItems)
      expect(unique.size).toBe(template.routineItems.length)
    })
  })
}

assertValidTemplate(lincolnTemplate, 'Lincoln')
assertValidTemplate(londonTemplate, 'London')

// ─── Child-specific structural checks ───────────────────────────────────────

describe('Lincoln template specifics', () => {
  it('includes Project block (London does not)', () => {
    expect(lincolnTemplate.dayBlocks).toContain(DayBlockType.Project)
    expect(londonTemplate.dayBlocks).not.toContain(DayBlockType.Project)
  })

  it('has more routine items than London (richer routine)', () => {
    expect(lincolnTemplate.routineItems.length).toBeGreaterThan(
      londonTemplate.routineItems.length,
    )
  })
})
