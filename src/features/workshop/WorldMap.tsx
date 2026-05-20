import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { StoryGame } from '../../core/types'
import type { GameType } from '../../core/types/workshop'

interface WorldMapProps {
  games: StoryGame[]
  childName?: string
  onSelectGame: (game: StoryGame) => void
}

// ── Theme → icon mapping ─────────────────────────────────────────

const THEME_ICONS: Record<string, string> = {
  dragons: '\u{1F3D4}\uFE0F',   // 🏔️ mountain with cave
  space: '\u{1F31F}',            // 🌟 star/planet
  ocean: '\u{1F3DD}\uFE0F',     // 🏝️ island
  jungle: '\u{1F334}',           // 🌴 palm tree
  castle: '\u{1F3F0}',           // 🏰 castle
  robots: '\u{1F3ED}',           // 🏭 factory
  animals: '\u{1F332}',          // 🌲 forest
}

const TYPE_ICONS: Record<string, string> = {
  board: '\u26F0\uFE0F',         // ⛰️ terrain feature
  adventure: '\u{1F5FC}',        // 🗼 tower/structure
  cards: '\u{1F3DF}\uFE0F',     // 🏟️ gathering place
}

const GAME_TYPE_BADGES: Record<string, string> = {
  board: '\u{1F3B2}',     // 🎲
  adventure: '\u{1F4D6}', // 📖
  cards: '\u{1F0CF}',     // 🃏
}

// ── Deterministic positions ──────────────────────────────────────

const MAP_POSITIONS = [
  { x: 50, y: 42 },   // center
  { x: 25, y: 28 },   // top-left
  { x: 75, y: 28 },   // top-right
  { x: 22, y: 62 },   // bottom-left
  { x: 78, y: 62 },   // bottom-right
  { x: 50, y: 18 },   // top-center
  { x: 50, y: 72 },   // bottom-center
  { x: 15, y: 45 },   // far left
  { x: 85, y: 45 },   // far right
  { x: 38, y: 52 },   // center-left
  { x: 62, y: 52 },   // center-right
  { x: 30, y: 78 },   // far bottom-left
]

// ── Helpers ──────────────────────────────────────────────────────

function getIconForGame(game: StoryGame): string {
  const theme = (game.storyInputs.theme ?? '').toLowerCase()
  for (const [key, icon] of Object.entries(THEME_ICONS)) {
    if (theme.includes(key)) return icon
  }
  const gameType = game.gameType ?? ''
  return TYPE_ICONS[gameType] ?? '\u{1F5FA}\uFE0F' // 🗺️ fallback
}

function getGrowthMessage(count: number): string {
  if (count < 5) return 'Your world is growing! Create more games to discover new places.'
  if (count < 8) return 'An amazing world of adventures! What will you create next?'
  if (count < 12) return 'So many places to explore! Your world is becoming legendary.'
  return "You've built an entire universe of games! You're a true Story Keeper."
}

// ── Component ────────────────────────────────────────────────────

export default function WorldMap({ games, childName, onSelectGame }: WorldMapProps) {
  const locations = useMemo(() => {
    // Sort by createdAt for deterministic ordering
    const sorted = [...games].sort(
      (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
    )
    return sorted.map((game, i) => ({
      game,
      icon: getIconForGame(game),
      position: MAP_POSITIONS[i % MAP_POSITIONS.length],
    }))
  }, [games])

  // Only show map with 3+ games
  if (games.length < 3) return null

  const newestGameId = games.reduce(
    (newest, g) =>
      (g.createdAt ?? '') > (newest.createdAt ?? '') ? g : newest,
    games[0],
  ).id

  const title = childName ? `${childName}'s World` : 'Your World'

  return (
    <Box sx={{ my: 3 }}>
      {/* Parchment map container */}
      <Box
        sx={{
          p: 2,
          pt: 1,
          borderRadius: 3,
          bgcolor: '#f5e6c8',
          border: '2px solid #c4a97d',
          position: 'relative',
          minHeight: 280,
          overflow: 'hidden',
          backgroundImage:
            'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.3) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(0,0,0,0.03) 0%, transparent 50%)',
        }}
      >
        {/* Title */}
        <Typography
          sx={{
            fontFamily: 'serif',
            fontWeight: 700,
            fontSize: '1.1rem',
            color: '#5d4037',
            textAlign: 'center',
            mb: 0.5,
          }}
        >
          {title}
        </Typography>

        {/* Compass rose decoration */}
        <Typography
          sx={{
            position: 'absolute',
            top: 8,
            right: 12,
            fontSize: '1.5rem',
            opacity: 0.4,
          }}
        >
          {'\u{1F9ED}'}
        </Typography>

        {/* Map area */}
        <Box sx={{ position: 'relative', minHeight: 240 }}>
          {/* Dotted path lines */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          >
            {locations.slice(1).map((loc, i) => {
              const prev = locations[i]
              return (
                <line
                  key={i}
                  x1={`${prev.position.x}%`}
                  y1={`${prev.position.y}%`}
                  x2={`${loc.position.x}%`}
                  y2={`${loc.position.y}%`}
                  stroke="#c4a97d"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  opacity="0.6"
                />
              )
            })}
          </svg>

          {/* Location markers */}
          {locations.map(({ game, icon, position }) => {
            const gameType = (game.gameType ?? '') as GameType
            const badge = GAME_TYPE_BADGES[gameType]
            const isNewest = game.id === newestGameId
            return (
              <Box
                key={game.id ?? game.createdAt}
                onClick={() => onSelectGame(game)}
                sx={{
                  position: 'absolute',
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  zIndex: 1,
                  transition: 'transform 0.2s ease',
                  '&:hover': {
                    transform: 'translate(-50%, -50%) scale(1.2)',
                  },
                  '&:active': {
                    transform: 'translate(-50%, -50%) scale(0.95)',
                  },
                  ...(isNewest && {
                    animation:
                      'newLocationPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    '@keyframes newLocationPop': {
                      '0%': {
                        opacity: 0,
                        transform: 'translate(-50%, -50%) scale(0)',
                      },
                      '100%': {
                        opacity: 1,
                        transform: 'translate(-50%, -50%) scale(1)',
                      },
                    },
                  }),
                }}
              >
                <Typography
                  component="span"
                  sx={{ fontSize: '1.8rem', lineHeight: 1, mb: 0.25, display: 'block' }}
                >
                  {icon}
                  {badge && (
                    <span style={{ fontSize: '0.6rem', marginLeft: 1 }}>
                      {badge}
                    </span>
                  )}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    fontWeight: 600,
                    color: '#5d4037',
                    maxWidth: 85,
                    lineHeight: 1.1,
                    fontSize: '0.6rem',
                    fontFamily: 'serif',
                  }}
                >
                  {game.generatedGame?.title ??
                    game.storyInputs.theme ??
                    'Unknown Land'}
                </Typography>
              </Box>
            )
          })}
        </Box>
      </Box>

      {/* Growth message */}
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          textAlign: 'center',
          color: '#8d6e63',
          fontStyle: 'italic',
          mt: 1.5,
          fontFamily: 'serif',
        }}
      >
        {getGrowthMessage(games.length)}
      </Typography>
    </Box>
  )
}
