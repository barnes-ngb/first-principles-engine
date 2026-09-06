import { describe, it, expect } from 'vitest'
import { describePageContents } from '../deletePageSummary'

describe('describePageContents', () => {
  it('reports an empty page', () => {
    expect(describePageContents({ text: '', images: [] })).toBe('This page is empty.')
  })

  it('reports pictures only', () => {
    expect(
      describePageContents({ text: '', images: [{ id: 'a' }] as never[] }),
    ).toBe('It has 1 picture.')
  })

  it('pluralizes pictures', () => {
    expect(
      describePageContents({
        text: '',
        images: [{ id: 'a' }, { id: 'b' }] as never[],
      }),
    ).toBe('It has 2 pictures.')
  })

  it('reports words only', () => {
    expect(describePageContents({ text: 'Hello world', images: [] })).toBe('It has 2 words.')
  })

  it('reports singular word', () => {
    expect(describePageContents({ text: 'Hello', images: [] })).toBe('It has 1 word.')
  })

  it('reports both pictures and words', () => {
    expect(
      describePageContents({
        text: 'Once upon a time',
        images: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never[],
      }),
    ).toBe('It has 3 pictures and 4 words.')
  })

  it('handles null page', () => {
    expect(describePageContents(null)).toBe('This page is empty.')
  })

  it('handles undefined page', () => {
    expect(describePageContents(undefined)).toBe('This page is empty.')
  })

  it('handles undefined text', () => {
    expect(describePageContents({ text: undefined as unknown as string, images: [] })).toBe(
      'This page is empty.',
    )
  })

  it('handles undefined images', () => {
    expect(
      describePageContents({ text: 'Hello', images: undefined as unknown as never[] }),
    ).toBe('It has 1 word.')
  })

  it('ignores whitespace-only tokens', () => {
    expect(describePageContents({ text: '   ', images: [] })).toBe('This page is empty.')
  })

  it('counts words separated by various whitespace', () => {
    expect(describePageContents({ text: 'one\ttwo\nthree', images: [] })).toBe('It has 3 words.')
  })
})
