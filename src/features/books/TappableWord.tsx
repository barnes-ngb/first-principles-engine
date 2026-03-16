import { useCallback } from 'react'

/** Tappable word — speaks the word on tap via Web Speech API. No colored background. */
export default function TappableWord({ word, onTap }: { word: string; onTap: () => void }) {
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
