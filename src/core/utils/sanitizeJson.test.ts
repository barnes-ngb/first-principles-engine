import { describe, expect, it } from 'vitest'
import { sanitizeAndParseJson } from './sanitizeJson'

describe('sanitizeAndParseJson', () => {
  it('parses valid JSON as-is', () => {
    const result = sanitizeAndParseJson<{ a: number }>('{"a": 1}')
    expect(result).toEqual({ a: 1 })
  })

  it('strips markdown json fences', () => {
    const result = sanitizeAndParseJson<{ a: number }>('```json\n{"a": 1}\n```')
    expect(result).toEqual({ a: 1 })
  })

  it('strips bare markdown fences', () => {
    const result = sanitizeAndParseJson<{ a: number }>('```\n{"a": 1}\n```')
    expect(result).toEqual({ a: 1 })
  })

  it('removes trailing commas in arrays', () => {
    const result = sanitizeAndParseJson<{ items: string[] }>(
      '{"items": ["a", "b", "c",]}',
    )
    expect(result).toEqual({ items: ['a', 'b', 'c'] })
  })

  it('removes trailing commas in objects', () => {
    const result = sanitizeAndParseJson<{ a: number; b: number }>(
      '{"a": 1, "b": 2,}',
    )
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('removes trailing commas with whitespace before bracket', () => {
    const input = `{
  "steps": [
    "Step one",
    "Step two",
  ]
}`
    const result = sanitizeAndParseJson<{ steps: string[] }>(input)
    expect(result.steps).toEqual(['Step one', 'Step two'])
  })

  it('handles nested trailing commas', () => {
    const input = `{
  "title": "Test",
  "materials": ["item1", "item2",],
  "steps": ["step1",],
}`
    const result = sanitizeAndParseJson<{
      title: string
      materials: string[]
      steps: string[]
    }>(input)
    expect(result.title).toBe('Test')
    expect(result.materials).toEqual(['item1', 'item2'])
    expect(result.steps).toEqual(['step1'])
  })

  it('escapes literal newlines inside string values', () => {
    const input = '{"text": "line one\nline two"}'
    const result = sanitizeAndParseJson<{ text: string }>(input)
    expect(result.text).toBe('line one\nline two')
  })

  it('preserves already-escaped newlines', () => {
    const input = '{"text": "line one\\nline two"}'
    const result = sanitizeAndParseJson<{ text: string }>(input)
    expect(result.text).toBe('line one\nline two')
  })

  it('handles the realistic LLM output scenario', () => {
    // Simulates a typical LLM response with trailing commas and markdown fences
    const input = `\`\`\`json
{
  "title": "CVC Word Builders",
  "objective": "Blend and read 5 CVC words using letter tiles.",
  "materials": [
    "Letter tiles",
    "Whiteboard",
    "Marker",
  ],
  "steps": [
    "Lay out vowel tiles in a row.",
    "Add consonants to build CVC words.",
    "Read each word aloud.",
  ],
  "successCriteria": [
    "Reads 4 out of 5 CVC words correctly",
    "Can segment sounds before blending",
  ],
}
\`\`\``
    const result = sanitizeAndParseJson<{
      title: string
      steps: string[]
    }>(input)
    expect(result.title).toBe('CVC Word Builders')
    expect(result.steps).toHaveLength(3)
  })

  it('throws on completely invalid content', () => {
    expect(() => sanitizeAndParseJson('not json at all')).toThrow()
  })

  // ── Interior quotes (FEAT-146) ──────────────────────────────
  //
  // Mirror of the server suite in `functions/src/ai/sanitizeJson.test.ts` — the
  // two sanitizer copies are a deliberate duplication, so they get the same
  // cases and must stay in step.
  describe('interior quotes', () => {
    it('escapes an interior quote so a later raw newline still parses', () => {
      const input = `{
  "caption": "He said "done!" and grinned",
  "body": "First line
second line"
}`
      const result = sanitizeAndParseJson<{ caption: string; body: string }>(
        input,
      )
      expect(result.caption).toBe('He said "done!" and grinned')
      expect(result.body).toBe('First line\nsecond line')
    })

    it('escapes an interior quote inside an array item', () => {
      const result = sanitizeAndParseJson<{ highlights: string[] }>(
        '{"highlights": ["You read "Papa Hut" twice", "You built a world"]}',
      )
      expect(result.highlights).toEqual([
        'You read "Papa Hut" twice',
        'You built a world',
      ])
    })

    it('recovers the whole document from one stray quote near the top', () => {
      const input = `{
  "theme": "The "Big" Month",
  "sections": {
    "cover": { "headline": "Stories You Built", "body": "" },
    "monthInSentence": { "body": "You read a lot
and you built a lot"
    }
  }
}`
      const result = sanitizeAndParseJson<{
        theme: string
        sections: Record<string, { body?: string; headline?: string }>
      }>(input)
      expect(result.theme).toBe('The "Big" Month')
      expect(result.sections.monthInSentence.body).toBe(
        'You read a lot\nand you built a lot',
      )
    })
  })

  // Characterization: the repair must NOT fire on text that is already valid.
  describe('valid JSON is untouched by the interior-quote repair', () => {
    it('leaves already-escaped quotes alone', () => {
      const result = sanitizeAndParseJson<{ quote: string }>(
        '{"quote": "She said \\"hello\\" softly"}',
      )
      expect(result.quote).toBe('She said "hello" softly')
    })

    it('handles quotes immediately before commas and closers', () => {
      const result = sanitizeAndParseJson<{ a: string; b: string[] }>(
        '{"a": "one", "b": ["two", "three"]}',
      )
      expect(result).toEqual({ a: 'one', b: ['two', 'three'] })
    })

    it('handles empty strings', () => {
      const result = sanitizeAndParseJson<{ a: string; b: string }>(
        '{"a": "", "b": ""}',
      )
      expect(result).toEqual({ a: '', b: '' })
    })

    it('handles nested objects with whitespace between tokens', () => {
      const input = `{
  "outer": {
    "inner": {
      "deep": "value"
    },
    "list": [
      "a",
      "b"
    ]
  }
}`
      const result = sanitizeAndParseJson<{
        outer: { inner: { deep: string }; list: string[] }
      }>(input)
      expect(result.outer.inner.deep).toBe('value')
      expect(result.outer.list).toEqual(['a', 'b'])
    })

    it('keeps a string that ends in an escaped quote', () => {
      const result = sanitizeAndParseJson<{ a: string; b: number }>(
        '{"a": "ends with a quote \\"", "b": 1}',
      )
      expect(result.a).toBe('ends with a quote "')
      expect(result.b).toBe(1)
    })
  })
})
