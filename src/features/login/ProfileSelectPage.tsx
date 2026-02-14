import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { UserProfile } from '../../core/types/enums'
import { useProfile } from '../../core/profile/useProfile'

const profiles = [
  {
    id: UserProfile.Lincoln,
    label: 'Lincoln',
    description: 'Your personal dashboard',
    color: '#5A8C32',
    bgLight: '#d7e5c0',
    secondaryColor: '#8B6914',
    gameBadge: 'MINECRAFT MODE',
    badgeFont: '"Press Start 2P", monospace',
    avatarRadius: '4px',
  },
  {
    id: UserProfile.London,
    label: 'London',
    description: 'Your personal dashboard',
    color: '#E52521',
    bgLight: '#e3f2fd',
    secondaryColor: '#FBD000',
    gameBadge: 'SUPER MARIO MODE',
    badgeFont: '"Luckiest Guy", sans-serif',
    avatarRadius: '50%',
  },
  {
    id: UserProfile.Parents,
    label: 'Parents',
    description: 'Full access + editing',
    color: '#5c6bc0',
    bgLight: '#e8eaf6',
    secondaryColor: '#7e57c2',
    gameBadge: '',
    badgeFont: '"Inter", sans-serif',
    avatarRadius: '50%',
  },
] as const

export default function ProfileSelectPage() {
  const { selectProfile } = useProfile()

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f5f5f7 0%, #e8eaf6 100%)',
        px: 2,
      }}
    >
      <Typography
        variant="h4"
        sx={{ mb: 1, fontWeight: 700, color: '#333' }}
      >
        Who&apos;s here?
      </Typography>
      <Typography
        variant="body1"
        sx={{ mb: 4, color: 'text.secondary' }}
      >
        Select your profile to get started
      </Typography>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={3}
        sx={{ width: '100%', maxWidth: 720, justifyContent: 'center' }}
      >
        {profiles.map((p) => {
          const isMinecraft = p.id === UserProfile.Lincoln
          const isMario = p.id === UserProfile.London

          return (
            <Button
              key={p.id}
              onClick={() => selectProfile(p.id)}
              sx={{
                flex: 1,
                minHeight: 180,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                borderRadius: isMinecraft ? 0 : isMario ? '20px' : 3,
                border: isMinecraft
                  ? '4px solid #7F7F7F'
                  : isMario
                    ? `3px solid ${p.secondaryColor}`
                    : `2px solid ${p.color}30`,
                backgroundColor: p.bgLight,
                color: p.color,
                textTransform: 'none',
                transition: 'all 0.2s ease',
                position: 'relative',
                overflow: 'hidden',
                // Minecraft: subtle block grid overlay
                ...(isMinecraft
                  ? {
                      backgroundImage: `
                        linear-gradient(rgba(90,140,50,0.08) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(90,140,50,0.08) 1px, transparent 1px)
                      `,
                      backgroundSize: '16px 16px',
                      boxShadow: '4px 4px 0px rgba(0,0,0,0.25)',
                    }
                  : {}),
                // Mario: coin-gold border glow
                ...(isMario
                  ? {
                      background: `linear-gradient(180deg, #6BB5FF 0%, #87CEEB 60%, #90EE90 85%, #5A8C32 100%)`,
                      boxShadow: `0 4px 0 rgba(0,0,0,0.15), 0 8px 24px ${p.color}30`,
                    }
                  : {}),
                '&:hover': {
                  backgroundColor: isMinecraft ? '#c5d9a8' : `${p.color}18`,
                  borderColor: p.color,
                  transform: isMinecraft
                    ? 'translate(-2px, -2px)'
                    : isMario
                      ? 'translateY(-6px) scale(1.02)'
                      : 'translateY(-4px)',
                  boxShadow: isMinecraft
                    ? '6px 6px 0px rgba(0,0,0,0.3)'
                    : isMario
                      ? `0 8px 0 rgba(0,0,0,0.15), 0 12px 32px ${p.color}40`
                      : `0 8px 24px ${p.color}25`,
                },
              }}
            >
              {/* Game badge */}
              {p.gameBadge && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: isMinecraft ? 0 : 'auto',
                    left: isMario ? '50%' : 'auto',
                    transform: isMario ? 'translateX(-50%)' : 'none',
                    fontSize: isMinecraft ? '0.45rem' : '0.6rem',
                    fontFamily: p.badgeFont,
                    color: isMinecraft ? '#fff' : '#fff',
                    backgroundColor: isMinecraft ? '#5A8C32' : '#E52521',
                    px: 1,
                    py: 0.3,
                    borderRadius: isMinecraft ? 0 : '10px',
                    border: isMinecraft ? '2px solid rgba(0,0,0,0.2)' : 'none',
                    boxShadow: isMinecraft
                      ? '2px 2px 0px rgba(0,0,0,0.2)'
                      : '0 2px 4px rgba(0,0,0,0.2)',
                    letterSpacing: isMinecraft ? '0.05em' : '0.02em',
                  }}
                >
                  {p.gameBadge}
                </Box>
              )}

              {/* Avatar */}
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: p.avatarRadius,
                  backgroundColor: isMinecraft
                    ? '#8B6914'
                    : isMario
                      ? p.color
                      : `${p.color}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: isMinecraft ? '1.2rem' : '1.5rem',
                  fontWeight: 700,
                  fontFamily: isMinecraft
                    ? '"Press Start 2P", monospace'
                    : isMario
                      ? '"Luckiest Guy", sans-serif'
                      : 'inherit',
                  color: isMinecraft || isMario ? '#fff' : p.color,
                  border: isMinecraft
                    ? '3px solid rgba(0,0,0,0.3)'
                    : isMario
                      ? '3px solid #fff'
                      : 'none',
                  boxShadow: isMinecraft
                    ? '3px 3px 0px rgba(0,0,0,0.2)'
                    : isMario
                      ? '0 3px 0 rgba(0,0,0,0.2)'
                      : 'none',
                  mt: 1,
                }}
              >
                {p.label[0]}
              </Box>

              {/* Name */}
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: isMinecraft || isMario ? '#fff' : p.color,
                  fontFamily: isMinecraft
                    ? '"Press Start 2P", monospace'
                    : isMario
                      ? '"Luckiest Guy", sans-serif'
                      : 'inherit',
                  fontSize: isMinecraft ? '0.85rem' : 'inherit',
                  textShadow: isMinecraft
                    ? '2px 2px 0px rgba(0,0,0,0.3)'
                    : isMario
                      ? '2px 2px 0px rgba(0,0,0,0.25)'
                      : 'none',
                }}
              >
                {p.label}
              </Typography>

              {/* Description */}
              <Typography
                variant="caption"
                sx={{
                  color: isMinecraft || isMario
                    ? 'rgba(255,255,255,0.85)'
                    : 'text.secondary',
                  fontFamily: isMinecraft
                    ? '"Press Start 2P", monospace'
                    : isMario
                      ? '"Fredoka", sans-serif'
                      : 'inherit',
                  fontSize: isMinecraft ? '0.5rem' : 'inherit',
                }}
              >
                {p.description}
              </Typography>
            </Button>
          )
        })}
      </Stack>
    </Box>
  )
}
