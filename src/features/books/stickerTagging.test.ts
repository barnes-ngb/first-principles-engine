import { describe, it, expect } from 'vitest'

import { suggestTagsFromPrompt, STICKER_TAGS_ORDERED } from './stickerTagging'

describe('STICKER_TAGS_ORDERED', () => {
  it('contains all expected tags', () => {
    expect(STICKER_TAGS_ORDERED).toEqual([
      'animal', 'minecraft', 'fantasy', 'nature', 'character',
      'object', 'vehicle', 'food', 'faith', 'other',
    ])
  })
})

describe('suggestTagsFromPrompt', () => {
  it('suggests "animal" for animal-related prompts', () => {
    expect(suggestTagsFromPrompt('A cute dog playing')).toContain('animal')
    expect(suggestTagsFromPrompt('a fluffy cat')).toContain('animal')
    expect(suggestTagsFromPrompt('bunny hopping')).toContain('animal')
    expect(suggestTagsFromPrompt('a mighty lion roaring')).toContain('animal')
    expect(suggestTagsFromPrompt('pretty bird on a branch')).toContain('animal')
    expect(suggestTagsFromPrompt('whale in the ocean')).toContain('animal')
  })

  it('suggests "minecraft" for Minecraft-related prompts', () => {
    expect(suggestTagsFromPrompt('A Minecraft creeper')).toContain('minecraft')
    expect(suggestTagsFromPrompt('diamond pickaxe')).toContain('minecraft')
    expect(suggestTagsFromPrompt('enderman in the nether')).toContain('minecraft')
    expect(suggestTagsFromPrompt('pixel art sword')).toContain('minecraft')
  })

  it('suggests "fantasy" for fantasy-related prompts', () => {
    expect(suggestTagsFromPrompt('A fierce dragon')).toContain('fantasy')
    expect(suggestTagsFromPrompt('fairy princess')).toContain('fantasy')
    expect(suggestTagsFromPrompt('wizard casting a spell')).toContain('fantasy')
    expect(suggestTagsFromPrompt('magic unicorn')).toContain('fantasy')
    expect(suggestTagsFromPrompt('enchanted potion')).toContain('fantasy')
  })

  it('suggests "nature" for nature-related prompts', () => {
    expect(suggestTagsFromPrompt('big tree in a forest')).toContain('nature')
    expect(suggestTagsFromPrompt('beautiful flower garden')).toContain('nature')
    expect(suggestTagsFromPrompt('mountain river at sunset')).toContain('nature')
    expect(suggestTagsFromPrompt('rainbow after rain')).toContain('nature')
    expect(suggestTagsFromPrompt('sun and moon')).toContain('nature')
    expect(suggestTagsFromPrompt('star in the sky')).toContain('nature')
    expect(suggestTagsFromPrompt('ocean waves')).toContain('nature')
  })

  it('suggests "vehicle" for vehicle-related prompts', () => {
    expect(suggestTagsFromPrompt('red race car')).toContain('vehicle')
    expect(suggestTagsFromPrompt('fire truck')).toContain('vehicle')
    expect(suggestTagsFromPrompt('train going fast')).toContain('vehicle')
    expect(suggestTagsFromPrompt('airplane in the sky')).toContain('vehicle')
    expect(suggestTagsFromPrompt('a rocket launching')).toContain('vehicle')
    expect(suggestTagsFromPrompt('school bus')).toContain('vehicle')
  })

  it('suggests "food" for food-related prompts', () => {
    expect(suggestTagsFromPrompt('birthday cake')).toContain('food')
    expect(suggestTagsFromPrompt('delicious pizza')).toContain('food')
    expect(suggestTagsFromPrompt('chocolate cookie')).toContain('food')
    expect(suggestTagsFromPrompt('red apple')).toContain('food')
    expect(suggestTagsFromPrompt('banana split ice cream')).toContain('food')
  })

  it('suggests "faith" for faith-related prompts', () => {
    expect(suggestTagsFromPrompt('Jesus loves me')).toContain('faith')
    expect(suggestTagsFromPrompt('prayer hands')).toContain('faith')
    expect(suggestTagsFromPrompt('a golden cross')).toContain('faith')
    expect(suggestTagsFromPrompt('bible and angel')).toContain('faith')
    expect(suggestTagsFromPrompt('god is good')).toContain('faith')
  })

  it('falls back to "object" when nothing matches', () => {
    const tags = suggestTagsFromPrompt('a round bouncy ball')
    expect(tags).toEqual(['object'])
  })

  it('falls back to "object" for empty prompt', () => {
    expect(suggestTagsFromPrompt('')).toEqual(['object'])
  })

  it('is case-insensitive', () => {
    expect(suggestTagsFromPrompt('BIG DOG')).toContain('animal')
    expect(suggestTagsFromPrompt('MINECRAFT CREEPER')).toContain('minecraft')
  })

  it('returns at most 3 tags', () => {
    const tags = suggestTagsFromPrompt(
      'a dog riding a rocket through a forest eating pizza with a dragon and god',
    )
    expect(tags.length).toBeLessThanOrEqual(3)
  })

  it('suggests multiple tags for mixed-theme prompts', () => {
    const tags = suggestTagsFromPrompt('a cat riding a dragon')
    expect(tags).toContain('animal')
    expect(tags).toContain('fantasy')
  })

  it('suggests minecraft + nature for "creeper in a forest"', () => {
    const tags = suggestTagsFromPrompt('a creeper hiding in the forest')
    expect(tags).toContain('minecraft')
    expect(tags).toContain('nature')
  })
})
