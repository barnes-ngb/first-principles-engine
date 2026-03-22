import Box from '@mui/material/Box'
import type { GeneratedGame } from '../../core/types'
import type { BoardSpaceType } from '../../core/types/workshop'
import BoardSpace from './BoardSpace'

const COLUMNS = 6

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
}

export default function GameBoard({ game, players = [], activeSpaceIndex }: GameBoardProps) {
  const spaces = game.board.spaces

  // Build a snaking grid: row 0 left→right, row 1 right→left, etc.
  const rows: typeof spaces[] = []
  for (let i = 0; i < spaces.length; i += COLUMNS) {
    const row = spaces.slice(i, i + COLUMNS)
    const rowIndex = Math.floor(i / COLUMNS)
    // Even rows: left→right, odd rows: right→left
    rows.push(rowIndex % 2 === 0 ? row : [...row].reverse())
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 400, mx: 'auto' }}>
      {rows.map((row, rowIndex) => (
        <Box
          key={rowIndex}
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
            gap: '3px',
            mb: '3px',
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
              />
            )
          })}
        </Box>
      ))}
    </Box>
  )
}
