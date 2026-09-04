import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PRESET_THEMES } from './books'

// ── FEAT-193 / UX-166: a theme's picture prefix is a hint, never a scene ────
//
// These were scene lists: "Exciting landscapes, treasure maps, hidden paths";
// "Lab equipment, nature exploration, experiments"; "Colorful coral reefs,
// friendly sea creatures, sparkling water". That is the exact shape FEAT-189
// removed from three illustration styles, and for the same reason: the server's
// `buildImagePrompt` appends the page's own scene AFTER this prefix, so a
// subject list here is a second, competing scene and a model handed two scenes
// splits the canvas.
//
// It was harmless only because FEAT-174 made a picked style win outright and no
// caller reaches the server map today (UX-165) — both properties of code one
// table over, not of this table. The hazard is now gone at the source.

/** Things you could point at in a finished picture. A look names none of them. */
const SCENE_NOUNS = [
  'treasure map',
  'hidden path',
  'landscapes',
  'lab equipment',
  'experiments',
  'coral reef',
  'sea creatures',
  'city skyline',
  'rockets',
  'astronauts',
  'planets',
  'enchanted forest',
  'mythical creature',
  'volcanic landscape',
  'decorations',
  'chefs',
  'ingredients',
  'dishes',
  'costumes',
  'vegetation',
  'dinosaurs',
  'celebrations',
]

describe('every preset theme names a look, not a scene', () => {
  it('covers all fifteen presets', () => {
    expect(PRESET_THEMES).toHaveLength(15)
  })

  it('names no scene furniture in any picture prefix', () => {
    for (const theme of PRESET_THEMES) {
      const named = SCENE_NOUNS.filter((noun) =>
        theme.imageStylePrefix.toLowerCase().includes(noun),
      )
      expect(
        named,
        `theme "${theme.id}" names ${named.join(', ')} — the page's own scene is appended after this`,
      ).toHaveLength(0)
    }
  })

  it('still says something about how a picture should look', () => {
    for (const theme of PRESET_THEMES) {
      expect(theme.imageStylePrefix, theme.id).toMatch(/look/i)
    }
  })

  it('keeps the copyright clause on minecraft', () => {
    const minecraft = PRESET_THEMES.find((t) => t.id === 'minecraft')
    expect(minecraft?.imageStylePrefix).toContain('No character names.')
  })

  it('leaves the story-side triple alone — a theme is still a world for a story', () => {
    // Only the *picture* half was a subject list. `storyWorldDescription` is
    // supposed to name a world, and the story prompt is where it belongs.
    const adventure = PRESET_THEMES.find((t) => t.id === 'adventure')
    expect(adventure?.storyWorldDescription).toContain('hidden treasures')
  })
})

describe('the server carries the same fifteen strings', () => {
  // FEAT-193 made the client's `PRESET_THEMES` and the server's
  // `PRESET_IMAGE_PREFIXES` agree, which removed the drift between those two
  // copies. Nothing structural enforces it — they are still two hand-kept tables
  // (UX-167, batch B) — so this reads the server file as text and holds the
  // claim the code comments on both sides make. It is a parity check, not a
  // consolidation: the app cannot import that module (it pulls in
  // `firebase-admin`), which is exactly why UX-167 is still open.
  const server = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      'functions',
      'src',
      'ai',
      'imageTasks',
      'generateImage.ts',
    ),
    'utf8',
  )
  const table = server.slice(
    server.indexOf('export const PRESET_IMAGE_PREFIXES'),
  )
  const map = table.slice(0, table.indexOf('\n};'))

  it('carries every preset id', () => {
    for (const theme of PRESET_THEMES) {
      expect(map, `server map has no entry for "${theme.id}"`).toContain(
        `${theme.id}:`,
      )
    }
  })

  it('carries each string verbatim', () => {
    for (const theme of PRESET_THEMES) {
      expect(
        map,
        `server text for "${theme.id}" differs from the client's`,
      ).toContain(theme.imageStylePrefix)
    }
  })
})
