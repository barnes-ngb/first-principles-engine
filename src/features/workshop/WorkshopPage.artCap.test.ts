import { describe, expect, it } from 'vitest'

import pageSource from './WorkshopPage.tsx?raw'
import wizardSource from './WorkshopWizard.tsx?raw'
import gallerySource from './MyGamesGallery.tsx?raw'

/**
 * FEAT-184 (audit #6): every picture the Workshop makes is counted against the
 * weekly art budget and every batch is reserved whole before it is spent. The
 * page is a 1,600-line shell over a dozen live hooks, so the wiring is pinned
 * at the source: no generator receives the raw `generateImage`, and no batch
 * starts without `reserveArt`.
 */
describe('Workshop art — capped and counted (FEAT-184)', () => {
  const code = pageSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('every generator is handed the counting wrapper, never the raw generateImage', () => {
    expect(code).toMatch(/generateAllArt\(countedGenerateImage,/g)
    expect(code).toMatch(/generateAdventureArt\(\s*countedGenerateImage,/)
    expect(code).toMatch(/generateCardGameArt\(\s*countedGenerateImage,/)
    expect(code).toMatch(/await countedGenerateImage\(\{/)
    // The only remaining reference to the raw function is inside the wrapper.
    const rawCalls = code.match(/\bgenerateImage\(/g) ?? []
    expect(rawCalls).toHaveLength(1)
    expect(code).not.toMatch(/generateAllArt\(generateImage/)
    expect(code).not.toMatch(/generateAdventureArt\(\s*generateImage/)
    expect(code).not.toMatch(/generateCardGameArt\(\s*generateImage/)
  })

  it('every batch — board, adventure, cards, regenerate — is reserved whole before it starts', () => {
    expect(code).toMatch(/reserveArt\(\s*buildArtRequests\(inputs\)\.length \+ BOARD_TITLE_AFTER_WORDS/)
    expect(code).toMatch(/reserveArt\(buildAdventureArtRequests\(inputs, adventureTree\)\.length\)/)
    expect(code).toMatch(/reserveArt\(buildCardGameArtRequests\(inputs, cardGameData\)\.length\)/)
    expect(code).toMatch(/if \(!reserveArt\(regenerateArtCount\(game\)\)\) return/)
  })

  it('the cap is a warm notice, never an error, and the counter is the shared weekly one', () => {
    expect(code).toMatch(/setArtBudgetNotice\(ART_QUOTA_MESSAGE\)/)
    expect(code).toMatch(/useWorkshopArtQuota\(\)/)
    expect(code).toMatch(/recordWorkshopArtGeneration\(recordArtGeneration\)/)
  })

  it('says what the tap spends before the tap, on both paid doors', () => {
    expect(wizardSource).toMatch(/door="workshopGame"/)
    expect(wizardSource).toMatch(/surface="workshop"/)
    expect(gallerySource).toMatch(/door="workshopRegenerate"/)
    // At the cap the message replaces the hint on both.
    expect(wizardSource).toMatch(/artCapReached \? \(/)
    expect(gallerySource).toMatch(/artCapReached \? \(/)
  })

  it('the audience is capability, never a name', () => {
    expect(code).toMatch(/const artAudience = isChildProfile \? 'kid' : 'parent'/)
    expect(code).not.toMatch(/isLincoln/)
  })
})
