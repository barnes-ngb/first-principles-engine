import Box from '@mui/material/Box'
import type { GeneratedGame } from '../../core/types'
import type { BoardSpaceType } from '../../core/types/workshop'
import BoardSpace from './BoardSpace'

const COLUMNS = 5

interface PlayerToken {
  name: string
  color: string
  position: number
  avatarUrl?: string
}

interface GameBoardProps {
  game: GeneratedGame
  players?: PlayerToken[]
  activeSpaceIndex?: number
  /** DALL-E generated board background URL */
  boardBackground?: string
  /** Index of space that just had a token land on it */
  landingSpaceIndex?: number | null
  /** Special animation for a space */
  spaceAnimation?: { index: number; type: 'bonus' | 'setback' | 'shortcut' } | null
  /** Game theme for themed space animations */
  theme?: string
}

export default function GameBoard({
  game,
  players = [],
  activeSpaceIndex,
  boardBackground,
  landingSpaceIndex,
  spaceAnimation,
  theme,
}: GameBoardProps) {
  const spaces = game.board.spaces
  const totalSpaces = spaces.length

  // Adaptive layout: use fewer columns for shorter boards
  const columns = totalSpaces <= 15 ? COLUMNS : COLUMNS

  // Build a snaking grid: row 0 left→right, row 1 right→left, etc.
  const rows: typeof spaces[] = []
  for (let i = 0; i < spaces.length; i += columns) {
    const row = spaces.slice(i, i + columns)
    const rowIndex = Math.floor(i / columns)
    // Even rows: left→right, odd rows: right→left
    rows.push(rowIndex % 2 === 0 ? row : [...row].reverse())
  }

  // Space minimum size scales with board length for readability
  const minSpaceSize = totalSpaces <= 15 ? 100 : totalSpaces <= 25 ? 90 : 80

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        mx: 'auto',
        borderRadius: 2,
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
        // Scrollable on mobile for larger boards
        maxHeight: { xs: '70vh', sm: 'none' },
        ...(boardBackground
          ? {
              backgroundImage: `url(${boardBackground})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              p: '6px',
            }
          : {}),
      }}
    >
      {/* Semi-transparent overlay so spaces remain readable */}
      {boardBackground && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: 'rgba(255,255,255,0.35)',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      )}
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          minWidth: { xs: columns * minSpaceSize, sm: columns * minSpaceSize, md: 'auto' },
          maxWidth: { md: 800 },
          mx: 'auto',
        }}
      >
        {rows.map((row, rowIndex) => (
          <Box
            key={rowIndex}
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, minmax(${minSpaceSize}px, 1fr))`,
              gap: '5px',
              mb: '5px',
            }}
          >
            {row.map((space) => {
              const playersOnSpace = players.filter((p) => p.position === space.index)
              return (
                <BoardSpace
                  key={space.index}
                  index={space.index}
                  type={space.type as BoardSpaceType}
                  label={space.label}
                  color={space.color}
                  players={playersOnSpace}
                  isFirst={space.index === 0}
                  isLast={space.index === spaces.length - 1}
                  isActive={activeSpaceIndex === space.index}
                  isLanding={landingSpaceIndex === space.index}
                  spaceAnimation={spaceAnimation?.index === space.index ? spaceAnimation.type : null}
                  theme={theme}
                />
              )
            })}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
