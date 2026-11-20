import { describe, it, expect } from 'vitest'

import { inferBookTheme } from './bookThemeInference'

describe('inferBookTheme', () => {
  // ── sight_words takes priority ──────────────────────────────────

  it('returns sight_words when words list is non-empty, regardless of idea', () => {
    expect(inferBookTheme('A minecraft dragon adventure', ['the', 'and'], '')).toBe('sight_words')
  })

  it('returns sight_words even with empty idea when words are present', () => {
    expect(inferBookTheme('', ['cat'], '')).toBe('sight_words')
  })

  // ── minecraft ───────────────────────────────────────────────────

  it('detects minecraft theme from idea', () => {
    expect(inferBookTheme('Steve explores the Nether', [], '')).toBe('minecraft')
  })

  it('detects minecraft from creeper keyword', () => {
    expect(inferBookTheme('A creeper chased him', [], '')).toBe('minecraft')
  })

  it('detects minecraft from style text', () => {
    expect(inferBookTheme('A story about blocks', [], 'minecraft world')).toBe('minecraft')
  })

  it('is case-insensitive for minecraft keywords', () => {
    expect(inferBookTheme('He found a DIAMOND pickaxe', [], '')).toBe('minecraft')
  })

  // ── animals ─────────────────────────────────────────────────────

  it('detects animals theme', () => {
    expect(inferBookTheme('The dog and the cat played', [], '')).toBe('animals')
  })

  it('detects animals from elephant', () => {
    expect(inferBookTheme('An elephant on a walk', [], '')).toBe('animals')
  })

  // ── fantasy ─────────────────────────────────────────────────────

  it('detects fantasy theme', () => {
    expect(inferBookTheme('The wizard cast a spell', [], '')).toBe('fantasy')
  })

  it('detects fantasy from unicorn', () => {
    expect(inferBookTheme('A unicorn in the meadow', [], '')).toBe('fantasy')
  })

  it('detects fantasy from magic in style', () => {
    expect(inferBookTheme('A story about a girl', [], 'magic and enchanted')).toBe('fantasy')
  })

  // ── adventure ───────────────────────────────────────────────────

  it('detects adventure theme', () => {
    expect(inferBookTheme('A quest for treasure', [], '')).toBe('adventure')
  })

  it('detects adventure from knight', () => {
    expect(inferBookTheme('The knight drew his sword', [], '')).toBe('adventure')
  })

  // ── family ──────────────────────────────────────────────────────

  it('detects family theme', () => {
    expect(inferBookTheme('Mom and Dad went to the park', [], '')).toBe('family')
  })

  it('detects family from grandma', () => {
    expect(inferBookTheme("Grandma's house", [], '')).toBe('family')
  })

  // ── science ─────────────────────────────────────────────────────

  it('detects science theme', () => {
    expect(inferBookTheme('A robot in the lab', [], '')).toBe('science')
  })

  it('detects science from space', () => {
    expect(inferBookTheme('Outer space and planets', [], '')).toBe('science')
  })

  // ── faith ───────────────────────────────────────────────────────

  it('detects faith theme', () => {
    expect(inferBookTheme('A prayer before bedtime', [], '')).toBe('faith')
  })

  it('detects faith from bible', () => {
    expect(inferBookTheme('A story from the Bible', [], '')).toBe('faith')
  })

  // ── other (fallback) ───────────────────────────────────────────

  it('returns other when no keywords match', () => {
    expect(inferBookTheme('A beautiful sunrise over the hills', [], '')).toBe('other')
  })

  it('returns other for empty inputs with no words', () => {
    expect(inferBookTheme('', [], '')).toBe('other')
  })

  // ── priority order: minecraft > animals > fantasy > adventure ──

  it('minecraft wins over animals when both present', () => {
    expect(inferBookTheme('A cat in minecraft', [], '')).toBe('minecraft')
  })

  it('animals wins over fantasy when both present', () => {
    expect(inferBookTheme('A magical cat', [], '')).toBe('animals')
  })

  // ── style text is checked too ──────────────────────────────────

  it('picks up theme from style parameter alone', () => {
    expect(inferBookTheme('A simple story', [], 'dragon fantasy')).toBe('fantasy')
  })

  it('combines idea and style for matching', () => {
    expect(inferBookTheme('In the', [], 'church')).toBe('faith')
  })
})
