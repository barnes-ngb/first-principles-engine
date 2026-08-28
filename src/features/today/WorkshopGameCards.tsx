import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useNavigate } from 'react-router-dom'
import type { Child, StoryGame } from '../../core/types'
import { WorkshopStatus } from '../../core/types/workshop'
import { useWorkshopGames } from '../workshop/useWorkshopGames'

interface WorkshopGameCardsProps {
  familyId: string
  /** Current child ID for filtering "continue" cards to session players */
  childId?: string
  children: Child[]
}

/**
 * Renders up to 2 cards on the Today page:
 * 1. "New game ready!" — a game with status 'ready' and no playSessions
 * 2. "Continue game" — a game with activeSession.status === 'playing'
 *
 * Shown on both parent and kid Today views.
 */
export default function WorkshopGameCards({ familyId, childId, children }: WorkshopGameCardsProps) {
  const { games, loading } = useWorkshopGames(familyId)
  const navigate = useNavigate()

  if (loading || games.length === 0) return null

  // Find newest unplayed ready game (max 1)
  const newGame = games.find(
    (g) =>
      g.status === WorkshopStatus.Ready &&
      (g.playSessions?.length ?? 0) === 0 &&
      g.generatedGame,
  )

  // Find in-progress game (max 1) — only show if current user is a player in the session
  const inProgressGame = games.find((g) => {
    if (g.activeSession?.status !== 'playing') return false
    // Show to everyone if no childId filter (parent view)
    if (!childId) return true
    // For kid views, only show if they're a player
    return g.activeSession.players.some((p) => p.id === childId)
  })

  if (!newGame && !inProgressGame) return null

  /**
   * UX-27: the creator's name, or `null` when the child can't be resolved.
   * The old fallback printed "Someone" (and its lowercase twin "someone" four
   * lines down), so an unresolved id became a made-up person in a sentence
   * about the family's own kids. There is no placeholder now — the headline
   * drops the attribution clause and still reads as English.
   */
  const getCreatorName = (game: StoryGame): string | null => {
    const child = children.find((c) => c.id === game.childId)
    return child?.name ?? null
  }

  /** "1 card • 12 spaces • 15 min" — same one-line plural class as UX-46/71. */
  const plural = (n: number, noun: string): string =>
    `${n} ${noun}${n === 1 ? '' : 's'}`

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* New game card */}
      {newGame && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'info.light',
            bgcolor: 'info.50',
          }}
        >
          {newGame.generatedArt?.titleScreen ? (
            <Box
              component="img"
              src={newGame.generatedArt.titleScreen}
              alt={newGame.generatedGame?.title ?? ''}
              sx={{
                width: 56,
                height: 56,
                borderRadius: 1.5,
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : (
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 1.5,
                bgcolor: 'info.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '1.5rem',
              }}
            >
              🎮
            </Box>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              🎮{' '}
              {getCreatorName(newGame)
                ? `${getCreatorName(newGame)} made a new game!`
                : 'A new game is ready!'}
            </Typography>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {newGame.generatedGame?.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {plural(newGame.generatedGame?.challengeCards.length ?? 0, 'card')}
              {' \u2022 '}
              {plural(newGame.generatedGame?.board.totalSpaces ?? 0, 'space')}
              {' \u2022 '}
              {newGame.generatedGame?.metadata.estimatedMinutes} min
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            onClick={() => navigate('/workshop')}
            sx={{ flexShrink: 0 }}
          >
            Play!
          </Button>
        </Box>
      )}

      {/* Continue game card */}
      {inProgressGame && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'warning.light',
            bgcolor: 'warning.50',
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 1.5,
              bgcolor: 'warning.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: '1.5rem',
            }}
          >
            🎮
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              🎮 Continue {inProgressGame.generatedGame?.title}?
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {/* UX-27: no "someone" placeholder — with no resolved player the
                  line says what is true instead of naming a stranger. */}
              {inProgressGame.activeSession?.players[
                inProgressGame.activeSession.currentTurnIndex
              ]?.name
                ? `It's ${
                    inProgressGame.activeSession.players[
                      inProgressGame.activeSession.currentTurnIndex
                    ].name
                  }'s turn!`
                : 'Pick up where you left off!'}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            color="warning"
            onClick={() => navigate('/workshop')}
            sx={{ flexShrink: 0 }}
          >
            Continue
          </Button>
        </Box>
      )}
    </Box>
  )
}
