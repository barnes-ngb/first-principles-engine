import { useCallback } from 'react'
import type { ReactNode } from 'react'
import type { SightWordProgress } from '../../core/types/domain'
import SightWordChip from './SightWordChip'

/** Tappable word — speaks the word on tap via Web Speech API. No colored background. */
function TappableWord({ word, onTap }: { word: string; onTap: () => void }) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const utterance = new SpeechSynthesisUtterance(word)
    utterance.rate = 0.85
    speechSynthesis.speak(utterance)
    onTap()
  }, [word, onTap])

  return (
    <span
      onClick={handleClick}
      style={{
        cursor: 'pointer',
        borderRadius: 2,
        transition: 'background 0.15s',
      }}
      onMouseDown={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.15)' }}
      onMouseUp={(e) => { (e.target as HTMLElement).style.background = '' }}
      onTouchStart={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.15)' }}
      onTouchEnd={(e) => { (e.target as HTMLElement).style.background = '' }}
    >
      {word}
    </span>
  )
}

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
