import { describe, it, expect } from 'vitest'

import { inferBookTheme } from './bookThemeInference'

describe('inferBookTheme', () => {
  it('returns sight_words when words list is non-empty', () => {
    expect(inferBookTheme('A cool adventure', ['the', 'and'], '')).toBe('sight_words')
  })

  it('returns sight_words regardless of idea text when words are present', () => {
    expect(inferBookTheme('minecraft creeper cave', ['cat'], 'fantasy')).toBe('sight_words')
  })

  it('returns minecraft for minecraft-related keywords in idea', () => {
    expect(inferBookTheme('A creeper in the cave', [], '')).toBe('minecraft')
    expect(inferBookTheme('Mining for diamond ore', [], '')).toBe('minecraft')
    expect(inferBookTheme('An enderman adventure', [], '')).toBe('minecraft')
    expect(inferBookTheme('Building with a pickaxe', [], '')).toBe('minecraft')
    expect(inferBookTheme('Exploring the nether', [], '')).toBe('minecraft')
    expect(inferBookTheme('Crafting table fun', [], '')).toBe('minecraft')
  })

  it('returns minecraft for keywords in style', () => {
    expect(inferBookTheme('A fun story', [], 'minecraft world')).toBe('minecraft')
  })

  it('returns animals for animal keywords', () => {
    expect(inferBookTheme('A dog and a cat', [], '')).toBe('animals')
    expect(inferBookTheme('The brave lion', [], '')).toBe('animals')
    expect(inferBookTheme('A bunny hops', [], '')).toBe('animals')
    expect(inferBookTheme('The whale swims deep', [], '')).toBe('animals')
    expect(inferBookTheme('An elephant walks', [], '')).toBe('animals')
  })

  it('returns fantasy for fantasy keywords', () => {
    expect(inferBookTheme('A dragon tale', [], '')).toBe('fantasy')
    expect(inferBookTheme('The fairy garden', [], '')).toBe('fantasy')
    expect(inferBookTheme('A wizard spell', [], '')).toBe('fantasy')
    expect(inferBookTheme('Magic potion', [], '')).toBe('fantasy')
    expect(inferBookTheme('A unicorn dream', [], '')).toBe('fantasy')
    expect(inferBookTheme('The princess castle', [], '')).toBe('fantasy')
    expect(inferBookTheme('An enchanted forest', [], '')).toBe('fantasy')
  })

  it('returns adventure for adventure keywords', () => {
    expect(inferBookTheme('A quest for the treasure', [], '')).toBe('adventure')
    expect(inferBookTheme('The hero journey', [], '')).toBe('adventure')
    expect(inferBookTheme('Explore the island', [], '')).toBe('adventure')
    expect(inferBookTheme('A knight with a sword', [], '')).toBe('adventure')
    expect(inferBookTheme('A secret mission', [], '')).toBe('adventure')
  })

  it('returns family for family keywords', () => {
    expect(inferBookTheme('Mom and dad', [], '')).toBe('family')
    expect(inferBookTheme('My brother and sister', [], '')).toBe('family')
    expect(inferBookTheme('Visiting grandma', [], '')).toBe('family')
    expect(inferBookTheme('A family picnic', [], '')).toBe('family')
  })

  it('returns science for science keywords', () => {
    expect(inferBookTheme('A robot builds', [], '')).toBe('science')
    expect(inferBookTheme('Going to space', [], '')).toBe('science')
    expect(inferBookTheme('The planet Mars', [], '')).toBe('science')
    expect(inferBookTheme('A science experiment', [], '')).toBe('science')
    expect(inferBookTheme('In the lab', [], '')).toBe('science')
  })

  it('returns faith for faith keywords', () => {
    expect(inferBookTheme('God is good', [], '')).toBe('faith')
    expect(inferBookTheme('A prayer story', [], '')).toBe('faith')
    expect(inferBookTheme('Jesus loves me', [], '')).toBe('faith')
    expect(inferBookTheme('At church today', [], '')).toBe('faith')
    expect(inferBookTheme('Reading the bible', [], '')).toBe('faith')
  })

  it('returns other when no keywords match', () => {
    expect(inferBookTheme('A sunny day', [], '')).toBe('other')
    expect(inferBookTheme('Building blocks', [], '')).toBe('other')
    expect(inferBookTheme('', [], '')).toBe('other')
  })

  it('is case-insensitive', () => {
    expect(inferBookTheme('MINECRAFT Adventure', [], '')).toBe('minecraft')
    expect(inferBookTheme('A DRAGON flies', [], '')).toBe('fantasy')
    expect(inferBookTheme('SCIENCE lab', [], '')).toBe('science')
  })

  it('matches keywords combined from idea and style', () => {
    expect(inferBookTheme('A cool story', [], 'dragon theme')).toBe('fantasy')
    expect(inferBookTheme('The brave one', [], 'adventure style')).toBe('adventure')
  })

  it('prefers earlier categories in the priority chain', () => {
    // minecraft beats animals
    expect(inferBookTheme('A minecraft cat', [], '')).toBe('minecraft')
    // animals beats fantasy
    expect(inferBookTheme('A dragon cat', [], '')).toBe('animals')
    // fantasy beats adventure
    expect(inferBookTheme('A wizard on a quest', [], '')).toBe('fantasy')
  })

  it('sight_words takes absolute priority over all keyword matches', () => {
    expect(inferBookTheme('A minecraft dragon quest', ['the'], '')).toBe('sight_words')
  })
})
