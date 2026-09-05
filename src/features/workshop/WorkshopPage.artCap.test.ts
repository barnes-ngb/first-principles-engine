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

/**
 * FEAT-195: a picture that didn't come back is said out loud. Before this the
 * Workshop's four image doors reported a failure as a `console.warn` and
 * nothing on screen — the game was made without the picture and nobody was
 * told. Pinned at the source for the same reason the cap wiring above is: the
 * page is a 1,600-line shell over a dozen live hooks.
 */
describe('Workshop — a missing picture is reported (FEAT-195)', () => {
  const code = pageSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('the counting wrapper remembers WHY a picture failed', () => {
    expect(code).toMatch(/lastArtFailureRef\.current = classifyImageGenerationFailure\(/)
  })

  it('every batch surfaces its failures — board, adventure, cards, regenerate', () => {
    // Four batches, each reporting when it came back short.
    const surfaced = code.match(/setArtFailure\(lastArtFailureRef\.current \?\? 'no-image'\)/g) ?? []
    expect(surfaced.length).toBeGreaterThanOrEqual(4)
    expect(code).toMatch(/if \(artResult\.failures\.length > 0\)/)
    expect(code).toMatch(/if \(result\.failures\.length > 0\)/)
  })

  it('the title card — drawn AFTER the words, past the batch check — reports too', () => {
    // Codex P2 (PR #1768): this request lands after the batch's own failure
    // check, so without its own `else` the game silently lost its title art and
    // the retry card never opened.
    const titleAt = code.indexOf('A title card illustration')
    expect(titleAt).toBeGreaterThan(-1)
    const titleBlock = code.slice(titleAt, titleAt + 700)
    expect(titleBlock).toMatch(/\} else \{\s*setArtFailure\(/)
  })

  it('a new run clears the last failure, so a stale card never greets the next game', () => {
    expect(code).toMatch(/setArtFailure\(null\)/)
    expect(code).toMatch(/lastArtFailureRef\.current = null/)
  })

  it('offers no rewordings — a batch has no single prompt to reword', () => {
    // The card is given `onRetry` (Regenerate Art) but never `onUseAlternative`.
    expect(code).not.toMatch(/onUseAlternative/)
    expect(code).toMatch(/retryLabel: 'Regenerate Art'/)
  })

  it('offers Regenerate Art only for a board game — the generator it actually calls', () => {
    // Codex P2 (PR #1768): `handleRegenerateArt` calls `generateAllArt`
    // unconditionally, so pointing a card or adventure failure at it would spend
    // the week's budget on board backgrounds and leave the missing card faces or
    // scene art missing. The mis-dispatch predates this PR (ARCH-49); what this
    // run must not do is newly send people to it.
    expect(code).toMatch(/currentGame\?\.gameType === GameType\.Board\s*\?/)
  })
})
