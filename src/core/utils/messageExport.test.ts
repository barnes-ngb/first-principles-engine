import { describe, expect, it } from 'vitest'
import {
  buildMessageFilename,
  buildMessageMarkdownFile,
  isoDate,
  slugify,
} from './messageExport'

describe('messageExport (FEAT-59)', () => {
  describe('slugify', () => {
    it('kebab-cases the first words and drops markdown punctuation', () => {
      expect(slugify('## Curriculum **gap** analysis for Lincoln')).toBe(
        'curriculum-gap-analysis-for-lincoln',
      )
    })
    it('caps length at 40 chars with no trailing dash', () => {
      const s = slugify('a'.repeat(60))
      expect(s.length).toBeLessThanOrEqual(40)
      expect(s.endsWith('-')).toBe(false)
    })
    it('falls back to "message" for empty/punctuation-only text', () => {
      expect(slugify('   ***   ')).toBe('message')
      expect(slugify('')).toBe('message')
    })
  })

  describe('isoDate', () => {
    it('extracts YYYY-MM-DD from an ISO timestamp', () => {
      expect(isoDate('2026-07-06T14:03:22.000Z')).toBe('2026-07-06')
    })
  })

  describe('buildMessageFilename', () => {
    it('is {chat}-{date}-{slug}.md', () => {
      expect(
        buildMessageFilename('Curriculum gap analysis', {
          chat: 'shelly',
          timestamp: '2026-07-06T14:03:22.000Z',
        }),
      ).toBe('shelly-2026-07-06-curriculum-gap-analysis.md')
    })
  })

  describe('buildMessageMarkdownFile', () => {
    it('prepends a one-line header (child · date · source) and keeps markdown verbatim', () => {
      const md = '# Heading\n\n- point one\n- point two'
      const out = buildMessageMarkdownFile(md, {
        chat: 'shelly',
        timestamp: '2026-07-06T14:03:22.000Z',
        child: 'Lincoln',
        source: 'general',
      })
      expect(out).toBe(`> Lincoln · 2026-07-06 · general\n\n${md}\n`)
    })

    it('omits missing header parts (no empty separators)', () => {
      const out = buildMessageMarkdownFile('hello', {
        chat: 'foundations-review',
        timestamp: '2026-07-06T00:00:00.000Z',
      })
      expect(out).toBe('> 2026-07-06\n\nhello\n')
    })
  })
})
