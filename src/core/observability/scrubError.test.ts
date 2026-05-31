import { describe, expect, it } from 'vitest'

import { ErrorSource, redactText, scrubError } from './scrubError'

describe('scrubError — privacy guard (ARCH-11)', () => {
  it('removes a child name AND content from message and stack', () => {
    // The most important test in the app: a real error carrying a minor's name
    // plus chat/eval/sight-word content must leave NONE of it behind.
    const message =
      "Failed to save London's note: \"I hate my brother\" while practicing sight word 'because'"
    const stack = [
      'Error: London said "I hate my brother"',
      '    at saveNote (https://app.example.com/assets/today-h4sh.js:42:13)',
      '    at onClick (https://app.example.com/assets/index-h4sh.js:7:1)',
    ].join('\n')

    const out = scrubError(
      {
        name: 'TypeError',
        message,
        stack,
        componentStack: '    in TodayPage (created by App)',
        route: '/today/London',
        source: ErrorSource.ReactErrorBoundary,
      },
      { sensitiveTerms: ['Lincoln', 'London'] },
    )

    const blob = JSON.stringify(out)
    expect(blob).not.toMatch(/london/i)
    expect(blob).not.toContain('I hate my brother')
    expect(blob).not.toContain('because')

    // …while the SHAPE of the failure survives.
    expect(out.name).toBe('TypeError')
    expect(out.source).toBe('react-error-boundary')
    expect(out.stack).toContain(':42:13') // line:col preserved
    expect(out.stack).not.toContain('https://') // origin stripped
    expect(out.stack).not.toContain('Error: ') // header line dropped
  })

  it('strips emails, URLs (incl. tokens) and long ids from messages', () => {
    const out = scrubError(
      {
        message:
          'Contact parent@example.com re https://app/x?token=secret id 1234567890',
        source: ErrorSource.WindowError,
      },
    )
    expect(out.message).not.toContain('parent@example.com')
    expect(out.message).not.toContain('secret')
    expect(out.message).not.toContain('1234567890')
    expect(out.message).toContain('[email]')
    expect(out.message).toContain('[url]')
  })

  it('drops the stack header line (it carries the message)', () => {
    const stack = 'Error: SECRET CONTENT HERE\n    at foo (app.js:1:1)'
    const out = scrubError({ message: 'x', stack, source: ErrorSource.WindowError })
    expect(out.stack).not.toContain('SECRET CONTENT HERE')
    expect(out.stack).toContain('foo')
  })

  it('coerces a non-identifier error name to a generic label', () => {
    const out = scrubError({
      name: "London's custom error",
      message: 'x',
      source: ErrorSource.WindowError,
    })
    expect(out.name).toBe('Error')
  })

  it('masks id-like route segments and drops the query string', () => {
    const out = scrubError({
      message: 'x',
      route: '/books/abcd1234efgh5678/edit?child=London',
      source: ErrorSource.WindowError,
    })
    expect(out.route).not.toContain('London')
    expect(out.route).toContain('/books/')
    expect(out.route).toContain(':id')
    expect(out.route).not.toContain('?')
  })

  it('never returns an empty message', () => {
    const out = scrubError({ message: '', source: ErrorSource.WindowError })
    expect(out.message).toBe('[empty]')
  })

  describe('redactText', () => {
    it('removes sensitive terms case-insensitively, including possessives', () => {
      const result = redactText("lincoln and LONDON's stuff", ['Lincoln', 'London'])
      expect(result).not.toMatch(/lincoln|london/i)
    })
  })
})
