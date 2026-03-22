import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { BoardSpaceType } from '../../core/types/workshop'

const SPACE_COLORS: Record<BoardSpaceType, string> = {
  normal: '#e3f2fd',
  challenge: '#fff3e0',
  bonus: '#e8f5e9',
  setback: '#fce4ec',
  special: '#f3e5f5',
}

const SPACE_EMOJI: Partial<Record<BoardSpaceType, string>> = {
  challenge: '?',
  bonus: '\u2B50',
  setback: '\u26A1',
  special: '\u2728',
}

interface BoardSpaceProps {
  index: number
  type: BoardSpaceType
  label?: string
  color?: string
  /** Player tokens on this space */
  players?: Array<{ name: string; color: string; avatarUrl?: string }>
  isFirst?: boolean
  isLast?: boolean
  isActive?: boolean
}

export default function BoardSpace({
  index,
  type,
  label,
  color,
  players = [],
  isFirst,
  isLast,
  isActive,
}: BoardSpaceProps) {
  const bgColor = color || SPACE_COLORS[type] || SPACE_COLORS.normal

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        bgcolor: bgColor,
        borderRadius: 1,
        border: isActive ? '3px solid' : '1px solid',
        borderColor: isActive ? 'primary.main' : 'divider',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.7rem',
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
    >
      {/* Space number */}
      <Typography
        variant="caption"
        sx={{
          position: 'absolute',
          top: 1,
          left: 3,
          fontSize: '0.55rem',
          color: 'text.secondary',
        }}
      >
        {index + 1}
      </Typography>

      {/* Space indicator */}
      {isFirst && <Typography sx={{ fontSize: '0.65rem', fontWeight: 700 }}>START</Typography>}
      {isLast && <Typography sx={{ fontSize: '0.65rem', fontWeight: 700 }}>FINISH</Typography>}
      {!isFirst && !isLast && SPACE_EMOJI[type] && (
        <Typography sx={{ fontSize: '1rem' }}>{SPACE_EMOJI[type]}</Typography>
      )}

      {/* Label */}
      {label && !isFirst && !isLast && (
        <Typography
          sx={{
            fontSize: '0.5rem',
            textAlign: 'center',
            lineHeight: 1.1,
            px: 0.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
          }}
        >
          {label}
        </Typography>
      )}

      {/* Player tokens */}
      {players.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 1,
            display: 'flex',
            gap: '2px',
          }}
        >
          {players.map((player) => (
            <Box
              key={player.name}
              sx={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                bgcolor: player.avatarUrl ? 'transparent' : player.color,
                border: '1px solid white',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.45rem',
                fontWeight: 700,
                color: 'white',
              }}
            >
              {player.avatarUrl ? (
                <img
                  src={player.avatarUrl}
                  alt={player.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                player.name.charAt(0)
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
