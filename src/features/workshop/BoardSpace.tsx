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
  /** Whether this space just had a token land on it */
  isLanding?: boolean
  /** Special animation type for this space */
  spaceAnimation?: 'bonus' | 'setback' | 'shortcut' | null
  /** Theme name for themed space animations */
  theme?: string
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
  isLanding,
  spaceAnimation,
  theme,
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
        // Landing pulse animation
        ...(isLanding
          ? {
              animation: 'spaceLandPulse 0.5s ease-out',
              '@keyframes spaceLandPulse': {
                '0%': { boxShadow: '0 0 0 0 rgba(25,118,210,0.5)' },
                '50%': { boxShadow: '0 0 8px 4px rgba(25,118,210,0.3)' },
                '100%': { boxShadow: '0 0 0 0 rgba(25,118,210,0)' },
              },
            }
          : {}),
        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none !important',
        },
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

      {/* Special space animation overlays */}
      {spaceAnimation === 'bonus' && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            animation: 'bonusFlash 0.6s ease-out',
            '@keyframes bonusFlash': {
              '0%': { bgcolor: 'rgba(76,175,80,0.4)' },
              '100%': { bgcolor: 'transparent' },
            },
            '&::after': {
              content: '"\\2B50"',
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '1.5rem',
              animation: 'bonusStar 0.8s ease-out forwards',
              '@keyframes bonusStar': {
                '0%': { opacity: 1, transform: 'translate(-50%, -50%) scale(0.5)' },
                '50%': { opacity: 1, transform: 'translate(-50%, -50%) scale(1.5)' },
                '100%': { opacity: 0, transform: 'translate(-50%, -50%) scale(2) translateY(-10px)' },
              },
            },
          }}
        />
      )}

      {spaceAnimation === 'setback' && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            animation: 'setbackFlash 0.5s ease-out',
            '@keyframes setbackFlash': {
              '0%, 20%, 40%': { bgcolor: 'rgba(244,67,54,0.2)' },
              '10%, 30%': { bgcolor: 'transparent' },
              '100%': { bgcolor: 'transparent' },
            },
          }}
        />
      )}

      {spaceAnimation === 'shortcut' && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            animation: 'shortcutGlow 0.8s ease-out',
            '@keyframes shortcutGlow': {
              '0%': { bgcolor: 'rgba(156,39,176,0.4)', boxShadow: '0 0 15px rgba(156,39,176,0.5) inset' },
              '100%': { bgcolor: 'transparent', boxShadow: 'none' },
            },
          }}
        />
      )}

      {/* Theme-based special space animation */}
      {type === 'special' && isLanding && theme && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'themeEffect 1s ease-out forwards',
            '@keyframes themeEffect': {
              '0%': { opacity: 1, transform: 'scale(0.5)' },
              '50%': { opacity: 1, transform: 'scale(1.2)' },
              '100%': { opacity: 0, transform: 'scale(1.5)' },
            },
            '&::after': {
              content: theme.toLowerCase().includes('dragon') || theme.toLowerCase().includes('fire')
                ? '"\\1F525"'   // 🔥
                : theme.toLowerCase().includes('space') || theme.toLowerCase().includes('star')
                  ? '"\\2B50"'  // ⭐
                  : theme.toLowerCase().includes('ocean') || theme.toLowerCase().includes('water')
                    ? '"\\1F30A"' // 🌊
                    : theme.toLowerCase().includes('jungle') || theme.toLowerCase().includes('forest')
                      ? '"\\1F33F"' // 🌿
                      : '"\\2728"',  // ✨ default
              fontSize: '2rem',
            },
          }}
        />
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
                // Bounce animation when landing
                ...(isLanding
                  ? {
                      animation: 'tokenBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      '@keyframes tokenBounce': {
                        '0%': { transform: 'scale(0.7) translateY(3px)' },
                        '50%': { transform: 'scale(1.3) translateY(-2px)' },
                        '100%': { transform: 'scale(1) translateY(0)' },
                      },
                    }
                  : {}),
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
