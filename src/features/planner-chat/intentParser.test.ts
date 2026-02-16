import { describe, expect, it } from 'vitest'
import { SubjectBucket } from '../../core/types/enums'
import { AdjustmentType } from './chatPlanner.logic'
import { describeAdjustment, isValidIntent, parseAdjustmentIntent } from './intentParser'

describe('parseAdjustmentIntent', () => {
  describe('lighten day', () => {
    it('parses "make Wed light"', () => {
      const result = parseAdjustmentIntent('Make Wed light')
      expect(result).toEqual({ type: AdjustmentType.LightenDay, day: 'Wednesday' })
    })

    it('parses "make Wednesday lighter"', () => {
      const result = parseAdjustmentIntent('make Wednesday lighter')
      expect(result).toEqual({ type: AdjustmentType.LightenDay, day: 'Wednesday' })
    })

    it('parses "make Monday easy"', () => {
      const result = parseAdjustmentIntent('make Monday easy')
      expect(result).toEqual({ type: AdjustmentType.LightenDay, day: 'Monday' })
    })

    it('parses "lighten Friday"', () => {
      const result = parseAdjustmentIntent('lighten Friday')
      expect(result).toEqual({ type: AdjustmentType.LightenDay, day: 'Friday' })
    })

    it('parses "make Thu short"', () => {
      const result = parseAdjustmentIntent('make Thu short')
      expect(result).toEqual({ type: AdjustmentType.LightenDay, day: 'Thursday' })
    })
  })

  describe('move subject', () => {
    it('parses "move math to Tue/Thu"', () => {
      const result = parseAdjustmentIntent('move math to Tue/Thu')
      expect(result).toEqual({
        type: AdjustmentType.MoveSubject,
        subject: SubjectBucket.Math,
        toDays: ['Tuesday', 'Thursday'],
      })
    })

    it('parses "move reading to Monday, Wednesday, Friday"', () => {
      const result = parseAdjustmentIntent('move reading to Monday, Wednesday, Friday')
      expect(result).toEqual({
        type: AdjustmentType.MoveSubject,
        subject: SubjectBucket.Reading,
        toDays: ['Monday', 'Wednesday', 'Friday'],
      })
    })

    it('parses "move science to Wed"', () => {
      const result = parseAdjustmentIntent('move science to Wed')
      expect(result).toEqual({
        type: AdjustmentType.MoveSubject,
        subject: SubjectBucket.Science,
        toDays: ['Wednesday'],
      })
    })
  })

  describe('reduce subject', () => {
    it('parses "reduce writing"', () => {
      const result = parseAdjustmentIntent('reduce writing')
      expect(result).toEqual({
        type: AdjustmentType.ReduceSubject,
        subject: SubjectBucket.LanguageArts,
        factor: 0.5,
      })
    })

    it('parses "less math"', () => {
      const result = parseAdjustmentIntent('less math')
      expect(result).toEqual({
        type: AdjustmentType.ReduceSubject,
        subject: SubjectBucket.Math,
        factor: 0.5,
      })
    })

    it('parses "cut reading"', () => {
      const result = parseAdjustmentIntent('cut reading')
      expect(result).toEqual({
        type: AdjustmentType.ReduceSubject,
        subject: SubjectBucket.Reading,
        factor: 0.5,
      })
    })
  })

  describe('cap subject time', () => {
    it('parses "cap math at 15 min"', () => {
      const result = parseAdjustmentIntent('cap math at 15 min')
      expect(result).toEqual({
        type: AdjustmentType.CapSubjectTime,
        subject: SubjectBucket.Math,
        maxMinutesPerDay: 15,
      })
    })

    it('parses "cap reading to 20 minutes"', () => {
      const result = parseAdjustmentIntent('cap reading to 20 minutes')
      expect(result).toEqual({
        type: AdjustmentType.CapSubjectTime,
        subject: SubjectBucket.Reading,
        maxMinutesPerDay: 20,
      })
    })
  })

  describe('no match', () => {
    it('returns null for unrecognized input', () => {
      expect(parseAdjustmentIntent('hello world')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(parseAdjustmentIntent('')).toBeNull()
    })

    it('returns null for partial matches', () => {
      expect(parseAdjustmentIntent('make it light')).toBeNull()
    })
  })
})

describe('describeAdjustment', () => {
  it('describes lighten day', () => {
    const text = describeAdjustment({ type: AdjustmentType.LightenDay, day: 'Wednesday' })
    expect(text).toContain('Wednesday')
    expect(text).toContain('Lightening')
  })

  it('describes move subject', () => {
    const text = describeAdjustment({
      type: AdjustmentType.MoveSubject,
      subject: SubjectBucket.Math,
      toDays: ['Tuesday', 'Thursday'],
    })
    expect(text).toContain('Math')
    expect(text).toContain('Tuesday')
  })

  it('describes reduce subject', () => {
    const text = describeAdjustment({
      type: AdjustmentType.ReduceSubject,
      subject: SubjectBucket.Reading,
      factor: 0.5,
    })
    expect(text).toContain('Reading')
    expect(text).toContain('50%')
  })

  it('describes cap subject time', () => {
    const text = describeAdjustment({
      type: AdjustmentType.CapSubjectTime,
      subject: SubjectBucket.Math,
      maxMinutesPerDay: 15,
    })
    expect(text).toContain('Math')
    expect(text).toContain('15')
  })
})

describe('isValidIntent', () => {
  it('validates lighten day', () => {
    expect(isValidIntent({ type: AdjustmentType.LightenDay, day: 'Monday' })).toBe(true)
  })

  it('validates move subject', () => {
    expect(isValidIntent({
      type: AdjustmentType.MoveSubject,
      subject: SubjectBucket.Math,
      toDays: ['Tuesday'],
    })).toBe(true)
  })

  it('rejects move subject with no days', () => {
    expect(isValidIntent({
      type: AdjustmentType.MoveSubject,
      subject: SubjectBucket.Math,
      toDays: [],
    })).toBe(false)
  })

  it('validates reduce subject', () => {
    expect(isValidIntent({
      type: AdjustmentType.ReduceSubject,
      subject: SubjectBucket.Reading,
      factor: 0.5,
    })).toBe(true)
  })

  it('rejects reduce with factor >= 1', () => {
    expect(isValidIntent({
      type: AdjustmentType.ReduceSubject,
      subject: SubjectBucket.Reading,
      factor: 1,
    })).toBe(false)
  })

  it('validates cap subject time', () => {
    expect(isValidIntent({
      type: AdjustmentType.CapSubjectTime,
      subject: SubjectBucket.Math,
      maxMinutesPerDay: 15,
    })).toBe(true)
  })
})
