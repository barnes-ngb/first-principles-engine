import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useNavigate } from 'react-router-dom'
import { kidPalette } from '../../app/tokens'

export interface HeroLauncherTile {
  id: 'mine' | 'workshop' | 'books'
  icon: string
  label: string
  to: string
  subtitle?: string
}

interface HeroLauncherTilesProps {
  isLincoln: boolean
  /** Set to true to hide the Knowledge Mine tile (default behavior for London). */
  hideMine?: boolean
}

const ALL_TILES: HeroLauncherTile[] = [
  { id: 'mine', icon: '⛏️', label: 'Knowledge Mine', to: '/quest' },
  { id: 'workshop', icon: '🎲', label: 'Workshop', to: '/workshop' },
  { id: 'books', icon: '📖', label: 'My Books', to: '/books' },
]

export default function HeroLauncherTiles({ isLincoln, hideMine = false }: HeroLauncherTilesProps) {
  const navigate = useNavigate()
  const tiles = ALL_TILES.filter((t) => !(hideMine && t.id === 'mine'))

  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'
  const borderColor = isLincoln ? 'rgba(126,252,32,0.22)' : 'rgba(232,160,191,0.28)'
  const bgGradient = isLincoln
    ? 'linear-gradient(160deg, rgba(14,20,28,0.95), rgba(20,28,40,0.95))'
    : 'linear-gradient(160deg, rgba(255,245,250,0.98), rgba(247,236,244,0.96))'
  const activeColor = isLincoln ? kidPalette.xpGreen : '#E8A0BF'
  const textColor = isLincoln ? 'rgba(255,255,255,0.9)' : 'rgba(32,16,24,0.82)'

  return (
    <Box sx={{ mx: 1, mt: 2, mb: 2 }}>
      <Typography
        sx={{
          fontFamily: titleFont,
          fontSize: isLincoln ? '11px' : '15px',
          fontWeight: 700,
          opacity: 0.75,
          textAlign: 'center',
          mb: 1.25,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Where to next?
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: `repeat(${tiles.length}, 1fr)` },
          gap: 1,
        }}
      >
        {tiles.map((tile) => (
          <Box
            key={tile.id}
            component="button"
            data-testid={`hero-launcher-${tile.id}`}
            onClick={() => navigate(tile.to)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.75,
              p: 1.5,
              minHeight: 96,
              borderRadius: isLincoln ? '8px' : '16px',
              border: `1.5px solid ${borderColor}`,
              background: bgGradient,
              color: textColor,
              cursor: 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                borderColor: activeColor,
                boxShadow: `0 6px 18px ${isLincoln ? 'rgba(126,252,32,0.18)' : 'rgba(232,160,191,0.25)'}`,
              },
              '&:active': { transform: 'scale(0.97)' },
            }}
          >
            <Typography sx={{ fontSize: '28px', lineHeight: 1 }} aria-hidden="true">
              {tile.icon}
            </Typography>
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '10px' : '14px',
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              {tile.label}
            </Typography>
            {tile.subtitle && (
              <Typography
                sx={{
                  fontFamily: titleFont,
                  fontSize: isLincoln ? '9px' : '12px',
                  opacity: 0.65,
                  textAlign: 'center',
                }}
              >
                {tile.subtitle}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
