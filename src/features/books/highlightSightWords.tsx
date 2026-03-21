import type { ReactNode } from 'react'
import type { SightWordProgress } from '../../core/types'
import SightWordChip from './SightWordChip'
import TappableWord from './TappableWord'

/**
 * Parse page text and wrap ALL words in tappable components.
 * Sight words get colored highlighting. All other words are tappable for TTS.
 */
export function renderInteractiveText(
  text: string,
  sightWords: string[],
  onTapWord: (word: string, action: 'help' | 'known') => void,
  wordProgress?: Map<string, SightWordProgress>,
): ReactNode[] {
  if (!text) return [text]

  const sightWordSet = new Set(sightWords.map(w => w.toLowerCase()))
  const tokens = text.split(/(\s+)/)
  let keyIndex = 0

  return tokens.map((token) => {
    if (/^\s+$/.test(token)) return token

    const match = token.match(/^([^a-zA-Z]*)([a-zA-Z]+)([^a-zA-Z]*)$/)
    if (!match) return token

    const [, prefix, word, suffix] = match
    const lowerWord = word.toLowerCase()
    const isSightWord = sightWordSet.has(lowerWord)
    const key = `tw-${keyIndex++}`

    if (isSightWord) {
      const progress = wordProgress?.get(lowerWord)
      const level = progress?.masteryLevel ?? 'new'
      return (
        <span key={key}>
          {prefix}
          <SightWordChip
            word={word}
            masteryLevel={level}
            onTapHelp={() => onTapWord(lowerWord, 'help')}
            onTapKnown={() => onTapWord(lowerWord, 'known')}
          />
          {suffix}
        </span>
      )
    }

    // Regular word — tappable for TTS only, no colored background
    return (
      <span key={key}>
        {prefix}
        <TappableWord word={word} onTap={() => onTapWord(lowerWord, 'help')} />
        {suffix}
      </span>
    )
  })
}

/** @deprecated Use renderInteractiveText instead */
export const renderTextWithSightWords = renderInteractiveText
