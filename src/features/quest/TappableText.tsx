import { useCallback } from 'react'
import Box from '@mui/material/Box'

// ── Minecraft color palette (matches ReadingQuest) ────────────
const MC = {
  white: '#FFFFFF',
} as const

interface TappableTextProps {
  /** The text to render with tappable words */
  text: string
  /** Called with the clean word text when a word is tapped */
  onTapWord: (word: string) => void
  /** Base text color (default: white) */
  color?: string
  /** Font size (default: inherit) */
  fontSize?: string
  /** Font family (default: inherit) */
  fontFamily?: string
  /** Line height (default: 1.8) */
  lineHeight?: number
  /** Additional sx props for the container */
  sx?: Record<string, unknown>
}

/**
 * Renders text with each word individually tappable for TTS.
 * Tapping a word calls onTapWord with the cleaned word text.
 * Visual affordance: subtle background highlight on tap/hover.
 */
export default function TappableText({
  text,
  onTapWord,
  color = MC.white,
  fontSize = 'inherit',
  fontFamily = 'inherit',
  lineHeight = 1.8,
  sx,
}: TappableTextProps) {
  // Split into words and whitespace, preserving structure
  const tokens = text.split(/(\s+)/)

  return (
    <Box
      component="span"
      sx={{
        color,
        fontSize,
        fontFamily,
        lineHeight,
        ...sx,
      }}
    >
      {tokens.map((token, i) => {
        // Whitespace tokens pass through (preserve newlines)
        if (/^\s+$/.test(token)) {
          // Convert \n to <br /> for passage formatting
          if (token.includes('\n')) {
            const parts: React.ReactNode[] = []
            const lines = token.split('\n')
            lines.forEach((line, li) => {
              if (li > 0) parts.push(<br key={`br-${i}-${li}`} />)
              if (line) parts.push(line)
            })
            return <span key={i}>{parts}</span>
          }
          return <span key={i}>{token}</span>
        }

        // Word token — make tappable
        return (
          <TappableWord
            key={i}
            token={token}
            onTap={onTapWord}
          />
        )
      })}
    </Box>
  )
}

// ── Individual tappable word ──────────────────────────────────

function TappableWord({
  token,
  onTap,
}: {
  token: string
  onTap: (word: string) => void
}) {
  // Strip punctuation for TTS but display the full token
  const cleanWord = token.replace(/[.,!?"';:()[\]—–-]/g, '')

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (cleanWord) onTap(cleanWord)
    },
    [cleanWord, onTap],
  )

  return (
    <Box
      component="span"
      onClick={handleClick}
      sx={{
        cursor: 'pointer',
        borderRadius: '2px',
        transition: 'background 0.15s',
        '&:hover': {
          background: 'rgba(255,255,255,0.1)',
        },
        '&:active': {
          background: 'rgba(255,255,255,0.2)',
        },
      }}
    >
      {token}
    </Box>
  )
}
