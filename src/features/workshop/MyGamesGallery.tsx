import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { getDocs, orderBy, query, where } from 'firebase/firestore'
import { storyGamesCollection } from '../../core/firebase/firestore'
import type { StoryGame } from '../../core/types'

/** Check if a game is missing any expected art */
function hasMissingArt(game: StoryGame): boolean {
  const art = game.generatedArt
  if (!art) return true
  if (!art.boardBackground || !art.titleScreen) return true
  if (!art.cardArt?.reading || !art.cardArt?.math || !art.cardArt?.story || !art.cardArt?.action)
    return true
  return false
}

interface MyGamesGalleryProps {
  familyId: string
  childId: string
  onSelectGame: (game: StoryGame) => void
  onRegenerateArt?: (game: StoryGame) => Promise<void>
}

export default function MyGamesGallery({
  familyId,
  childId,
  onSelectGame,
  onRegenerateArt,
}: MyGamesGalleryProps) {
  const [games, setGames] = useState<StoryGame[]>([])
  const [loading, setLoading] = useState(true)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadGames() {
      try {
        const q = query(
          storyGamesCollection(familyId),
          where('childId', '==', childId),
          orderBy('createdAt', 'desc'),
        )
        const snapshot = await getDocs(q)
        if (!cancelled) {
          const loaded = snapshot.docs.map((doc) => ({
            ...(doc.data() as StoryGame),
            id: doc.id,
          }))
          setGames(loaded)
        }
      } catch (err) {
        console.warn('Failed to load games:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadGames()
    return () => {
      cancelled = true
    }
  }, [familyId, childId])

  const handleRegenerate = async (game: StoryGame) => {
    if (!onRegenerateArt || !game.id) return
    setRegeneratingId(game.id)
    try {
      await onRegenerateArt(game)
    } finally {
      setRegeneratingId(null)
    }
  }

  if (loading) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
        Loading your games...
      </Typography>
    )
  }

  if (games.length === 0) return null

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
        My Games
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {games.map((game) => {
          const titleArt = game.generatedArt?.titleScreen
          const isRegenerating = regeneratingId === game.id

          return (
            <Box
              key={game.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                overflow: 'hidden',
              }}
            >
              {/* Thumbnail */}
              {titleArt ? (
                <Box
                  component="img"
                  src={titleArt}
                  alt={game.generatedGame?.title ?? game.storyInputs.theme}
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: 1.5,
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: 1.5,
                    bgcolor: 'primary.light',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: 'primary.contrastText',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    textAlign: 'center',
                    p: 0.5,
                  }}
                >
                  {game.generatedGame?.title ?? game.storyInputs.theme}
                </Box>
              )}

              {/* Game info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                  {game.generatedGame?.title ?? game.storyInputs.theme}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip label={game.storyInputs.theme} size="small" variant="outlined" />
                  {game.generatedGame && (
                    <Chip
                      label={`${game.generatedGame.challengeCards.length} cards`}
                      size="small"
                      variant="outlined"
                    />
                  )}
                  {(game.playSessions?.length ?? 0) > 0 && (
                    <Chip
                      label={`Played ${game.playSessions!.length}x`}
                      size="small"
                      color="success"
                      variant="outlined"
                    />
                  )}
                </Box>
              </Box>

              {/* Actions */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flexShrink: 0 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => onSelectGame(game)}
                  disabled={!game.generatedGame}
                >
                  Play
                </Button>
                {hasMissingArt(game) && onRegenerateArt && (
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => handleRegenerate(game)}
                    disabled={isRegenerating}
                    sx={{ fontSize: '0.7rem' }}
                  >
                    {isRegenerating ? 'Generating...' : 'Regenerate Art'}
                  </Button>
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
