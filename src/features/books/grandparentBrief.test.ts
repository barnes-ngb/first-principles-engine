import { describe, expect, it } from 'vitest'

import { buildGrandparentBriefHtml } from './grandparentBrief'

describe('buildGrandparentBriefHtml', () => {
  it('substitutes the child name throughout and titles the page', () => {
    const html = buildGrandparentBriefHtml('London')
    expect(html).toContain('Reading with London 📖')
    expect(html).toContain('<title>Reading with London — a guide for Mimi & Papa</title>')
    expect(html).toContain('again next week')
    // Core reassurances are present.
    expect(html).toContain('is real school')
    expect(html).toMatch(/Don't correct mid-read/i)
    expect(html).toMatch(/how many did you get right/i)
  })

  it('greets the Barnes grandparents by name (FEAT-98) — no generic grandparent label', () => {
    const html = buildGrandparentBriefHtml('London')
    expect(html).toContain('Hi Mimi & Papa!')
    expect(html).toMatch(/Mimi & Papa's weekly Story Call/)
    expect(html).not.toMatch(/Grandma|Grandpa/)
  })

  it('is a complete, self-contained print document', () => {
    const html = buildGrandparentBriefHtml('Lincoln')
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<style>')
    expect(html).not.toContain('<script')
  })

  it('escapes HTML-unsafe characters in the name', () => {
    const html = buildGrandparentBriefHtml('<b>Bad & "Name"</b>')
    expect(html).toContain('&lt;b&gt;Bad &amp; &quot;Name&quot;&lt;/b&gt;')
    expect(html).not.toContain('<b>Bad')
  })

  it('falls back to a warm generic when the name is empty', () => {
    const html = buildGrandparentBriefHtml('   ')
    expect(html).toContain('your grandchild')
  })
})
