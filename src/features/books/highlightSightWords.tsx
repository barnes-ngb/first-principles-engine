import type { ReactNode } from 'react'
import type { SightWordProgress } from '../../core/types/domain'
import SightWordChip from './SightWordChip'

/** Parse page text and wrap sight words in interactive SightWordChip components. */
export function renderTextWithSightWords(
  text: string,
  sightWords: string[],
  onTapWord: (word: string, action: 'help' | 'known') => void,
  wordProgress?: Map<string, SightWordProgress>,
): ReactNode[] {
  if (!text || sightWords.length === 0) {
    return [text]
  }

  const sightWordSet = new Set(sightWords.map(w => w.toLowerCase()))

  // Split text into tokens preserving whitespace and punctuation
  const tokens = text.split(/(\s+)/)
  let keyIndex = 0

  return tokens.map((token) => {
    // Skip whitespace tokens
    if (/^\s+$/.test(token)) {
      return token
    }

    // Strip leading/trailing punctuation to check the word
    const match = token.match(/^([^a-zA-Z]*)([a-zA-Z]+)([^a-zA-Z]*)$/)
    if (!match) {
      return token
    }

    const [, prefix, word, suffix] = match
    const lowerWord = word.toLowerCase()

    if (sightWordSet.has(lowerWord)) {
      const progress = wordProgress?.get(lowerWord)
      const level = progress?.masteryLevel ?? 'new'
      const key = `sw-${keyIndex++}`

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

    return token
  })
}
