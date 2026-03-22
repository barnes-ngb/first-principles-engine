import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import DeleteIcon from '@mui/icons-material/Delete'
import { deleteDoc, doc, getDocs, orderBy, query } from 'firebase/firestore'
import { db, storyGamesCollection } from '../../core/firebase/firestore'
import type { Child, StoryGame } from '../../core/types'
import { WorkshopStatus } from '../../core/types/workshop'

/** Check if a game is missing any expected art */
function hasMissingArt(game: StoryGame): boolean {
  const art = game.generatedArt
  if (!art) return true
  if (!art.boardBackground || !art.titleScreen) return true
  if (!art.cardArt?.reading || !art.cardArt?.math || !art.cardArt?.story || !art.cardArt?.action)
    return true
  return false
}

function getStatusBadge(game: StoryGame): { label: string; color: 'success' | 'warning' | 'info' | 'default' } {
  if (game.activeSession?.status === 'playing') {
    return { label: 'In Progress', color: 'warning' }
  }
  const playCount = game.playSessions?.length ?? 0
  if (playCount === 0) {
    return { label: 'New!', color: 'info' }
  }
  return { label: `Played ${playCount}x`, color: 'success' }
}

function getCreatorName(game: StoryGame, children: Child[]): string {
  const child = children.find((c) => c.id === game.childId)
  return child?.name ?? 'Unknown'
}

interface MyGamesGalleryProps {
  familyId: string
  childId: string
  children: Child[]
  onSelectGame: (game: StoryGame) => void
  onResumeDraft?: (game: StoryGame) => void
  onRegenerateArt?: (game: StoryGame) => Promise<void>
}

export default function MyGamesGallery({
  familyId,
  childId,
  children,
  onSelectGame,
  onResumeDraft,
  onRegenerateArt,
}: MyGamesGalleryProps) {
  const [games, setGames] = useState<StoryGame[]>([])
  const [loading, setLoading] = useState(true)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadGames() {
      try {
        // Fetch ALL family games (not filtered by childId) ordered by updatedAt
        const q = query(
          storyGamesCollection(familyId),
          orderBy('updatedAt', 'desc'),
        )
        const snapshot = await getDocs(q)
        if (!cancelled) {
          const loaded = snapshot.docs.map((d) => ({
            ...(d.data() as StoryGame),
            id: d.id,
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
  }, [familyId])

  const handleRegenerate = async (game: StoryGame) => {
    if (!onRegenerateArt || !game.id) return
    setRegeneratingId(game.id)
    try {
      await onRegenerateArt(game)
    } finally {
      setRegeneratingId(null)
    }
  }

  const handleDeleteDraft = async (game: StoryGame) => {
    if (!game.id) return
    try {
      await deleteDoc(doc(db, `families/${familyId}/storyGames/${game.id}`))
      setGames((prev) => prev.filter((g) => g.id !== game.id))
    } catch (err) {
      console.warn('Failed to delete draft:', err)
    }
  }

  if (loading) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
        Loading your games...
      </Typography>
    )
  }

  // Filter: drafts only visible to creator, ready/played visible to all
  const visibleGames = games.filter((game) => {
    if (game.status === WorkshopStatus.Draft) {
      return game.childId === childId
    }
    return true
  })

  if (visibleGames.length === 0) return null

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
        Family Games
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {visibleGames.map((game) => {
          const titleArt = game.generatedArt?.titleScreen
          const isRegenerating = regeneratingId === game.id
          const isDraft = game.status === WorkshopStatus.Draft
          const isCreator = game.childId === childId
          const creatorName = getCreatorName(game, children)
          const statusBadge = isDraft ? null : getStatusBadge(game)

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
                borderColor: isDraft ? 'warning.light' : 'divider',
                bgcolor: isDraft ? 'warning.50' : 'background.paper',
                overflow: 'hidden',
                opacity: isDraft ? 0.85 : 1,
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
                    bgcolor: isDraft ? 'warning.light' : 'primary.light',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: isDraft ? 'warning.contrastText' : 'primary.contrastText',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    textAlign: 'center',
                    p: 0.5,
                  }}
                >
                  {isDraft ? `Step ${(game.currentWizardStep ?? 0) + 1} of 5` : (game.generatedGame?.title ?? game.storyInputs.theme)}
                </Box>
              )}

              {/* Game info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                  {isDraft
                    ? `${game.storyInputs.theme || 'New Game'} (Draft)`
                    : (game.generatedGame?.title ?? game.storyInputs.theme)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  By {creatorName}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                  {!isDraft && (
                    <Chip label={game.storyInputs.theme} size="small" variant="outlined" />
                  )}
                  {game.generatedGame && (
                    <Chip
                      label={`${game.generatedGame.challengeCards.length} cards`}
                      size="small"
                      variant="outlined"
                    />
                  )}
                  {statusBadge && (
                    <Chip
                      label={statusBadge.label}
                      size="small"
                      color={statusBadge.color}
                      variant="outlined"
                    />
                  )}
                  {isDraft && (
                    <Chip
                      label={`Step ${(game.currentWizardStep ?? 0) + 1} of 5`}
                      size="small"
                      color="warning"
                      variant="outlined"
                    />
                  )}
                </Box>
              </Box>

              {/* Actions */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flexShrink: 0 }}>
                {isDraft ? (
                  <>
                    <Button
                      variant="outlined"
                      size="small"
                      color="warning"
                      onClick={() => onResumeDraft?.(game)}
                    >
                      Continue Creating
                    </Button>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteDraft(game)}
                      sx={{ alignSelf: 'center' }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onSelectGame(game)}
                      disabled={!game.generatedGame}
                    >
                      Play
                    </Button>
                    {isCreator && hasMissingArt(game) && onRegenerateArt && (
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
                  </>
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
