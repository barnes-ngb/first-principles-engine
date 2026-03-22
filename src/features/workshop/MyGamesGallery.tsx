import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { getDocs, orderBy, query, where } from 'firebase/firestore'
import { storyGamesCollection } from '../../core/firebase/firestore'
import type { StoryGame } from '../../core/types'

interface MyGamesGalleryProps {
  familyId: string
  childId: string
  onSelectGame: (game: StoryGame) => void
}

export default function MyGamesGallery({ familyId, childId, onSelectGame }: MyGamesGalleryProps) {
  const [games, setGames] = useState<StoryGame[]>([])
  const [loading, setLoading] = useState(true)

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
        {games.map((game) => (
          <Box
            key={game.id}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {game.generatedGame?.title ?? game.storyInputs.theme}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                <Chip
                  label={game.storyInputs.theme}
                  size="small"
                  variant="outlined"
                />
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
            <Button
              variant="outlined"
              size="small"
              onClick={() => onSelectGame(game)}
              disabled={!game.generatedGame}
            >
              Play
            </Button>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
