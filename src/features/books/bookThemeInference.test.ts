import { describe, it, expect } from 'vitest'

import { inferBookTheme } from './bookThemeInference'

describe('inferBookTheme', () => {
  // ── sight_words short-circuit ──────────────────────────────────

  it('returns sight_words when words array is non-empty', () => {
    expect(inferBookTheme('a normal story', ['the', 'is'], '')).toBe('sight_words')
  })

  it('returns sight_words even when storyIdea contains minecraft keywords', () => {
    expect(inferBookTheme('a minecraft adventure', ['cat'], 'comic')).toBe('sight_words')
  })

  it('returns sight_words even when storyIdea contains faith keywords', () => {
    expect(inferBookTheme('a story about prayer', ['big'], '')).toBe('sight_words')
  })

  // ── minecraft ──────────────────────────────────────────────────

  it('detects minecraft from storyIdea', () => {
    expect(inferBookTheme('build in minecraft', [], '')).toBe('minecraft')
  })

  it('detects minecraft from style', () => {
    expect(inferBookTheme('a fun story', [], 'creeper style')).toBe('minecraft')
  })

  it('detects nether keyword', () => {
    expect(inferBookTheme('journey to the nether', [], '')).toBe('minecraft')
  })

  it('detects enderman keyword', () => {
    expect(inferBookTheme('an enderman appears', [], '')).toBe('minecraft')
  })

  it('detects pickaxe keyword', () => {
    expect(inferBookTheme('found a pickaxe', [], '')).toBe('minecraft')
  })

  it('detects diamond keyword as minecraft (not other)', () => {
    expect(inferBookTheme('a diamond sword', [], '')).toBe('minecraft')
  })

  it('detects crafting keyword', () => {
    expect(inferBookTheme('crafting a table', [], '')).toBe('minecraft')
  })

  // ── animals ────────────────────────────────────────────────────

  it('detects animals from storyIdea', () => {
    expect(inferBookTheme('a story about a bunny', [], '')).toBe('animals')
  })

  it('detects animals from style', () => {
    expect(inferBookTheme('a fun story', [], 'with a horse')).toBe('animals')
  })

  it('detects dog keyword', () => {
    expect(inferBookTheme('my dog ran away', [], '')).toBe('animals')
  })

  it('detects whale keyword', () => {
    expect(inferBookTheme('the whale swam deep', [], '')).toBe('animals')
  })

  it('detects elephant keyword', () => {
    expect(inferBookTheme('an elephant in the zoo', [], '')).toBe('animals')
  })

  // ── fantasy ────────────────────────────────────────────────────

  it('detects fantasy from storyIdea', () => {
    expect(inferBookTheme('a dragon in the sky', [], '')).toBe('fantasy')
  })

  it('detects fantasy from style', () => {
    expect(inferBookTheme('a tale', [], 'magic kingdom')).toBe('fantasy')
  })

  it('detects unicorn keyword', () => {
    expect(inferBookTheme('the unicorn galloped', [], '')).toBe('fantasy')
  })

  it('detects potion keyword', () => {
    expect(inferBookTheme('brewing a potion', [], '')).toBe('fantasy')
  })

  // ── adventure ──────────────────────────────────────────────────

  it('detects adventure from storyIdea', () => {
    expect(inferBookTheme('a great adventure awaits', [], '')).toBe('adventure')
  })

  it('detects adventure from style', () => {
    expect(inferBookTheme('a tale', [], 'quest for glory')).toBe('adventure')
  })

  it('detects hero keyword', () => {
    expect(inferBookTheme('the hero saved the day', [], '')).toBe('adventure')
  })

  it('detects treasure keyword', () => {
    expect(inferBookTheme('hunting for treasure', [], '')).toBe('adventure')
  })

  it('detects knight keyword', () => {
    expect(inferBookTheme('a brave knight', [], '')).toBe('adventure')
  })

  // ── family ─────────────────────────────────────────────────────

  it('detects family from storyIdea', () => {
    expect(inferBookTheme('our family picnic', [], '')).toBe('family')
  })

  it('detects family from style', () => {
    expect(inferBookTheme('a fun day', [], 'with grandma')).toBe('family')
  })

  it('detects mom keyword', () => {
    expect(inferBookTheme('mom baked a cake', [], '')).toBe('family')
  })

  it('detects brother keyword', () => {
    expect(inferBookTheme('my brother and I', [], '')).toBe('family')
  })

  // ── science ────────────────────────────────────────────────────

  it('detects science from storyIdea', () => {
    expect(inferBookTheme('a science experiment', [], '')).toBe('science')
  })

  it('detects science from style', () => {
    expect(inferBookTheme('a cool story', [], 'robot theme')).toBe('science')
  })

  it('detects space keyword', () => {
    expect(inferBookTheme('flying through space', [], '')).toBe('science')
  })

  it('detects planet keyword', () => {
    expect(inferBookTheme('a distant planet', [], '')).toBe('science')
  })

  // ── faith ──────────────────────────────────────────────────────

  it('detects faith from storyIdea', () => {
    expect(inferBookTheme('a story about faith', [], '')).toBe('faith')
  })

  it('detects faith from style', () => {
    expect(inferBookTheme('a good story', [], 'church picnic')).toBe('faith')
  })

  it('detects prayer keyword', () => {
    expect(inferBookTheme('a prayer before dinner', [], '')).toBe('faith')
  })

  it('detects bible keyword', () => {
    expect(inferBookTheme('reading the bible together', [], '')).toBe('faith')
  })

  // ── other (fallback) ──────────────────────────────────────────

  it('returns other for unrecognised text', () => {
    expect(inferBookTheme('a trip to the store', [], '')).toBe('other')
  })

  it('returns other for empty storyIdea and style', () => {
    expect(inferBookTheme('', [], '')).toBe('other')
  })

  it('returns other when words array is empty and no keywords match', () => {
    expect(inferBookTheme('homework time', [], 'pencil sketches')).toBe('other')
  })

  // ── case insensitivity ─────────────────────────────────────────

  it('matches keywords case-insensitively in storyIdea', () => {
    expect(inferBookTheme('A MINECRAFT World', [], '')).toBe('minecraft')
  })

  it('matches keywords case-insensitively in style', () => {
    expect(inferBookTheme('a tale', [], 'DRAGON style')).toBe('fantasy')
  })

  it('matches mixed-case keywords', () => {
    expect(inferBookTheme('The Fairy Queen', [], '')).toBe('fantasy')
  })

  // ── priority ordering ──────────────────────────────────────────

  it('minecraft wins over animals when both match (cave + bear)', () => {
    expect(inferBookTheme('a cave with a bear inside', [], '')).toBe('minecraft')
  })

  it('minecraft wins when keyword is in storyIdea and animal keyword is in style', () => {
    expect(inferBookTheme('explore the nether', [], 'with a dog')).toBe('minecraft')
  })

  it('animals wins over fantasy when both match (dragon not present)', () => {
    expect(inferBookTheme('a cat in a castle', [], '')).toBe('animals')
  })

  // ── substring matching (includes) ─────────────────────────────

  it('lab triggers science even as part of a word (elaborate)', () => {
    expect(inferBookTheme('an elaborate plan', [], '')).toBe('science')
  })

  it('cat triggers animals even as part of a word (catapult)', () => {
    expect(inferBookTheme('a catapult siege', [], '')).toBe('animals')
  })

  it('dog triggers animals even embedded (underdog)', () => {
    expect(inferBookTheme('the underdog story', [], '')).toBe('animals')
  })

  // ── combined storyIdea + style ─────────────────────────────────

  it('matches keyword split across storyIdea and style (keyword only in style)', () => {
    expect(inferBookTheme('a great tale', [], 'experiment gone wrong')).toBe('science')
  })
})
