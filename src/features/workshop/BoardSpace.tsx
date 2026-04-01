import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { BoardSpaceType } from '../../core/types/workshop'
import type { AvatarProfile } from '../../core/types'
import AvatarThumbnail from '../avatar/AvatarThumbnail'

const SPACE_COLORS: Record<BoardSpaceType, string> = {
  normal: '#e3f2fd',
  challenge: '#fff3e0',
  bonus: '#e8f5e9',
  setback: '#fce4ec',
  special: '#f3e5f5',
}

const SPACE_EMOJI: Partial<Record<BoardSpaceType, string>> = {
  challenge: '?',
  bonus: '\u2B06',    // ⬆ upward arrow for bonus
  setback: '\u2B07',  // ⬇ downward arrow for setback
  special: '\u2728',  // ✨ sparkle for shortcut/teleport
}

/** Extract movement delta from space label for display (e.g. "+2", "-3") */
function parseMoveAmount(label?: string): string | null {
  if (!label) return null
  const lower = label.toLowerCase()
  const fwd = lower.match(/forward\s+(\d+)|move\s+ahead\s+(\d+)|\+(\d+)/)
  if (fwd) return `+${fwd[1] || fwd[2] || fwd[3]}`
  const back = lower.match(/back\s+(\d+)|move\s+back\s+(\d+)|-(\d+)|slip\s+back\s+(\d+)/)
  if (back) return `-${back[1] || back[2] || back[3] || back[4]}`
  const tele = lower.match(/(?:jump|shortcut|teleport)\s+(?:to\s+)?(?:space\s+)?(\d+)/)
  if (tele) return `\u2192${tele[1]}`
  return null
}

interface BoardSpaceProps {
  index: number
  type: BoardSpaceType
  label?: string
  color?: string
  /** Player tokens on this space */
  players?: Array<{ name: string; color: string; avatarUrl?: string; id?: string; isActivePlayer?: boolean }>
  /** Avatar profiles keyed by player ID */
  avatarProfiles?: Record<string, AvatarProfile>
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
  avatarProfiles,
  isFirst,
  isLast,
  isActive,
  isLanding,
  spaceAnimation,
  theme,
}: BoardSpaceProps) {
  const bgColor = color || SPACE_COLORS[type] || SPACE_COLORS.normal
  const moveAmount = parseMoveAmount(label)

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        bgcolor: bgColor,
        borderRadius: 1.5,
        border: isLast
          ? '3px solid #ffd700'
          : isActive
            ? '3px solid'
            : type === 'challenge'
              ? '2px solid #ff9800'
              : '1px solid',
        borderColor: isLast
          ? '#ffd700'
          : isActive
            ? 'primary.main'
            : type === 'challenge'
              ? '#ff9800'
              : 'divider',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.8rem',
        p: '4px',
        overflow: 'hidden',
        transition: 'border-color 0.2s',
        // Challenge spaces get a subtle glow
        ...(type === 'challenge'
          ? { boxShadow: '0 0 4px rgba(255,152,0,0.25)' }
          : {}),
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
          top: 2,
          left: 4,
          fontSize: '0.65rem',
          color: 'text.secondary',
          fontWeight: 500,
        }}
      >
        {index + 1}
      </Typography>

      {/* Space indicator */}
      {isFirst && <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>START</Typography>}
      {isLast && (
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontSize: '1.1rem' }}>{'\uD83C\uDFC6'}</Typography>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#b8860b' }}>FINISH</Typography>
        </Box>
      )}
      {!isFirst && !isLast && SPACE_EMOJI[type] && (
        <Typography sx={{ fontSize: type === 'challenge' ? '1.4rem' : '1.25rem' }}>{SPACE_EMOJI[type]}</Typography>
      )}

      {/* Movement amount badge for bonus/setback/special spaces */}
      {!isFirst && !isLast && moveAmount && (
        <Typography
          sx={{
            position: 'absolute',
            top: 2,
            right: 4,
            fontSize: '0.75rem',
            fontWeight: 800,
            color: moveAmount.startsWith('+') ? '#2e7d32' : moveAmount.startsWith('-') ? '#c62828' : '#6a1b9a',
            lineHeight: 1,
          }}
        >
          {moveAmount}
        </Typography>
      )}

      {/* Label */}
      {label && !isFirst && !isLast && (
        <Typography
          title={label}
          sx={{
            fontSize: '0.7rem',
            textAlign: 'center',
            lineHeight: 1.2,
            px: 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            maxWidth: '100%',
            wordBreak: 'break-word',
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
            bottom: 2,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              // Offset-stack when multiple players share a space
              '& > *:not(:first-of-type)': {
                ml: players.length > 2 ? '-7px' : '-5px',
              },
            }}
          >
            {players.map((player, pi) => {
              const profile = player.id ? avatarProfiles?.[player.id] : undefined
              const isActiveToken = player.isActivePlayer
              const tokenSize = isActiveToken ? 34 : 26

              return (
                <Box
                  key={player.name}
                  sx={{
                    width: tokenSize,
                    height: tokenSize,
                    borderRadius: profile ? '4px' : '50%',
                    bgcolor: !profile && !player.avatarUrl ? player.color : 'transparent',
                    border: isActiveToken ? '2px solid #ffd700' : '2px solid white',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.55rem',
                    fontWeight: 700,
                    color: 'white',
                    zIndex: isActiveToken ? 10 : pi,
                    boxShadow: isActiveToken
                      ? '0 0 6px 2px rgba(255,215,0,0.6)'
                      : '0 1px 3px rgba(0,0,0,0.35)',
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
                    // Active player pulse for non-3D tokens
                    ...(isActiveToken && !profile
                      ? {
                          animation: 'activePulse 2s ease-in-out infinite',
                          '@keyframes activePulse': {
                            '0%, 100%': { boxShadow: '0 0 4px 1px rgba(255,215,0,0.4)' },
                            '50%': { boxShadow: '0 0 8px 4px rgba(255,215,0,0.6)' },
                          },
                        }
                      : {}),
                    '@media (prefers-reduced-motion: reduce)': {
                      animation: 'none !important',
                    },
                  }}
                >
                  {profile ? (
                    <AvatarThumbnail
                      features={profile.characterFeatures}
                      ageGroup={profile.ageGroup ?? 'older'}
                      equippedPieces={profile.equippedPieces ?? []}
                      totalXp={profile.totalXp ?? 0}
                      faceGrid={profile.faceGrid}
                      size={tokenSize}
                      animated={false}
                      showArmor
                    />
                  ) : player.avatarUrl ? (
                    <img
                      src={player.avatarUrl}
                      alt={player.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    player.name.charAt(0)
                  )}
                </Box>
              )
            })}
          </Box>
          {/* Name labels */}
          {players.length <= 2 && (
            <Box sx={{ display: 'flex', gap: 0.25 }}>
              {players.map((player) => (
                <Typography
                  key={player.name}
                  variant="caption"
                  sx={{
                    fontSize: '0.5rem',
                    fontWeight: player.isActivePlayer ? 700 : 400,
                    lineHeight: 1,
                    color: 'text.secondary',
                    whiteSpace: 'nowrap',
                    maxWidth: 40,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {player.name}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
