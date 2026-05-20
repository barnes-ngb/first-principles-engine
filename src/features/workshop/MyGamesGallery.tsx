import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Badge from '@mui/material/Badge'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import DeleteIcon from '@mui/icons-material/Delete'
import MicIcon from '@mui/icons-material/Mic'
import { deleteDoc, doc, getDocs, orderBy, query, where } from 'firebase/firestore'
import { ref, listAll, deleteObject } from 'firebase/storage'
import { db, storyGamesCollection, artifactsCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import type { Child, StoryGame } from '../../core/types'
import { GameType, PlaytestStatus, WorkshopStatus } from '../../core/types/workshop'

/** Check if a game is missing any expected art */
function hasMissingArt(game: StoryGame): boolean {
  const art = game.generatedArt
  if (!art) return true
  if (game.gameType === GameType.Cards) {
    return !art.titleScreen || !art.cardBack
  }
  if (!art.boardBackground || !art.titleScreen) return true
  if (!art.cardArt?.reading || !art.cardArt?.math || !art.cardArt?.story || !art.cardArt?.action)
    return true
  return false
}

function getStatusBadge(game: StoryGame): { label: string; color: 'success' | 'warning' | 'info' | 'default' } {
  if (game.activeSession?.status === 'playing' || game.activeAdventureSession?.status === 'playing' || game.activeCardGameSession?.status === 'playing') {
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

/** Check if game has unreviewed playtest sessions (for creator notification) */
function hasUnreviewedPlaytest(game: StoryGame): boolean {
  return (
    game.playtestSessions?.some((s) => s.status === PlaytestStatus.Complete) ?? false
  )
}

/** Get the latest complete (unreviewed) playtest tester name */
function getPlaytestTesterName(game: StoryGame): string | null {
  const session = game.playtestSessions?.find((s) => s.status === PlaytestStatus.Complete)
  return session?.testerName ?? null
}

/** Whether this user can delete a given game */
function canDelete(game: StoryGame, childId: string, isParent: boolean): boolean {
  // Parents can delete any game; kids can only delete their own
  return isParent || game.childId === childId
}

/** Whether this child can see the Playtest button for a given game */
function canPlaytest(game: StoryGame, childId: string, isParent: boolean): boolean {
  // Creator doesn't see Playtest on their own games
  if (game.childId === childId) return false
  // Parents can always playtest
  if (isParent) return true
  // Non-creator children can playtest (Lincoln on London's games)
  return true
}

interface MyGamesGalleryProps {
  familyId: string
  childId: string
  isParent?: boolean
  children: Child[]
  onSelectGame: (game: StoryGame) => void
  onPlaytestGame?: (game: StoryGame) => void
  onReviewPlaytest?: (game: StoryGame) => void
  onResumeDraft?: (game: StoryGame) => void
  onRegenerateArt?: (game: StoryGame) => Promise<void>
}

export default function MyGamesGallery({
  familyId,
  childId,
  isParent = false,
  children,
  onSelectGame,
  onPlaytestGame,
  onReviewPlaytest,
  onResumeDraft,
  onRegenerateArt,
}: MyGamesGalleryProps) {
  const [games, setGames] = useState<StoryGame[]>([])
  const [loading, setLoading] = useState(true)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [deleteTarget, setDeleteTarget] = useState<StoryGame | null>(null)
  const [childFilter, setChildFilter] = useState<string>('all')

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

  const handleDeleteGame = async (game: StoryGame) => {
    if (!game.id) return
    try {
      // Delete Storage files (art + audio) — non-blocking
      try {
        const storagePrefix = ref(storage, `families/${familyId}/storyGames/${game.id}`)
        const allFiles = await listAll(storagePrefix)
        for (const item of allFiles.items) {
          await deleteObject(item)
        }
        for (const prefix of allFiles.prefixes) {
          const subFiles = await listAll(prefix)
          for (const item of subFiles.items) {
            await deleteObject(item)
          }
        }
      } catch (err) {
        console.warn('[Workshop] Storage cleanup failed (non-blocking):', err)
      }

      // Delete associated artifacts
      try {
        const artifactQ = query(
          artifactsCollection(familyId),
          where('tags.gameId', '==', game.id),
        )
        const artifactSnap = await getDocs(artifactQ)
        for (const d of artifactSnap.docs) {
          await deleteDoc(d.ref)
        }
      } catch (err) {
        console.warn('[Workshop] Artifact cleanup failed (non-blocking):', err)
      }

      // Delete Firestore document
      await deleteDoc(doc(db, `families/${familyId}/storyGames/${game.id}`))
      setGames((prev) => prev.filter((g) => g.id !== game.id))
    } catch (err) {
      console.warn('Failed to delete game:', err)
    } finally {
      setDeleteTarget(null)
    }
  }

  if (loading) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
        Loading your games...
      </Typography>
    )
  }

  // Filter: kids see own games + others' finished games; parents see all
  const visibleGames = games.filter((game) => {
    if (!isParent && game.status === WorkshopStatus.Draft && game.childId !== childId) {
      return false
    }
    return true
  }).filter((game) => {
    if (typeFilter === 'all') return true
    if (typeFilter === 'board') return game.gameType === GameType.Board || (!game.gameType && !game.adventureTree && !game.cardGame)
    if (typeFilter === 'adventure') return game.gameType === GameType.Adventure
    if (typeFilter === 'cards') return game.gameType === GameType.Cards
    return true
  }).filter((game) => {
    if (childFilter === 'all') return true
    return game.childId === childFilter
  })

  // Group games by child for parent view
  const groupedByChild = isParent
    ? children.reduce<Record<string, { name: string; games: StoryGame[] }>>((acc, child) => {
        const childGames = visibleGames.filter((g) => g.childId === child.id)
        if (childGames.length > 0) {
          acc[child.id] = { name: child.name, games: childGames }
        }
        return acc
      }, {})
    : null

  if (games.length === 0) return null

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
        Family Games
      </Typography>

      {/* Filter tabs */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <ToggleButtonGroup
          value={typeFilter}
          exclusive
          onChange={(_, v) => { if (v !== null) setTypeFilter(v) }}
          size="small"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="board">{'\uD83C\uDFB2'} Board</ToggleButton>
          <ToggleButton value="adventure">{'\uD83D\uDCD6'} Adventure</ToggleButton>
          <ToggleButton value="cards">{'\uD83C\uDCC3'} Cards</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Child filter (parent view only) */}
      {isParent && children.length > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <ToggleButtonGroup
            value={childFilter}
            exclusive
            onChange={(_, v) => { if (v !== null) setChildFilter(v) }}
            size="small"
          >
            <ToggleButton value="all">All</ToggleButton>
            {children.map((c) => (
              <ToggleButton key={c.id} value={c.id}>{c.name}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}
      {/* Game list — grouped by child for parents, flat for kids */}
      {isParent && groupedByChild && childFilter === 'all' ? (
        Object.entries(groupedByChild).map(([cId, { name, games: childGames }]) => (
          <Box key={cId} sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
              {name}&apos;s Games ({childGames.length})
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {childGames.map((game) => renderGameCard(game))}
            </Box>
          </Box>
        ))
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {visibleGames.map((game) => renderGameCard(game))}
        </Box>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete game?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;{deleteTarget?.storyInputs.theme ?? 'this game'}&quot;? This can&apos;t be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => { if (deleteTarget) void handleDeleteGame(deleteTarget) }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )

  function renderGameCard(game: StoryGame) {
    const titleArt = game.generatedArt?.titleScreen
    const isRegenerating = regeneratingId === game.id
    const isDraft = game.status === WorkshopStatus.Draft
    const isCreator = game.childId === childId
    const creatorName = getCreatorName(game, children)
    const statusBadge = isDraft ? null : getStatusBadge(game)
    const isAdventure = game.gameType === GameType.Adventure
    const isCardGame = game.gameType === GameType.Cards
    const gameTypeIcon = isCardGame ? '\uD83C\uDCC3' : isAdventure ? '\uD83D\uDCD6' : '\uD83C\uDFB2'
    const gameTitle = isCardGame
      ? `${game.storyInputs.theme} Card Game`
      : isAdventure
        ? `${game.storyInputs.theme} Adventure`
        : (game.generatedGame?.title ?? game.storyInputs.theme)
    const hasGame = isCardGame ? !!game.cardGame : isAdventure ? !!game.adventureTree : !!game.generatedGame
    const totalSteps = 6

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
            alt={gameTitle}
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
              fontSize: isDraft ? '0.75rem' : '1.5rem',
              textAlign: 'center',
              p: 0.5,
            }}
          >
            {isDraft ? `Step ${(game.currentWizardStep ?? 0) + 1} of ${totalSteps}` : gameTypeIcon}
          </Box>
        )}

        {/* Game info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
            {isDraft
              ? `${game.storyInputs.theme || 'New Game'} (Draft)`
              : `${gameTypeIcon} ${gameTitle}`}
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
            {game.adventureTree && (
              <Chip
                label={`${game.adventureTree.totalNodes} scenes`}
                size="small"
                variant="outlined"
              />
            )}
            {game.cardGame && (
              <Chip
                label={`${game.cardGame.metadata.deckSize} cards \u2022 ${game.cardGame.mechanic}`}
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
            {game.version && game.version > 1 && (
              <Chip
                label={`v${game.version}`}
                size="small"
                color="secondary"
                variant="outlined"
              />
            )}
            {game.voiceRecordings && Object.keys(game.voiceRecordings).length > 0 && (
              <Chip
                icon={<MicIcon sx={{ fontSize: 14 }} />}
                label="Voice"
                size="small"
                color="secondary"
                variant="outlined"
              />
            )}
            {isDraft && (
              <Chip
                label={`Step ${(game.currentWizardStep ?? 0) + 1} of ${totalSteps}`}
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
                onClick={() => setDeleteTarget(game)}
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
                disabled={!hasGame}
              >
                {isCardGame ? 'Play Cards' : isAdventure ? 'Play Adventure' : 'Play'}
              </Button>
              {canPlaytest(game, childId, isParent) && onPlaytestGame && (
                <Button
                  variant="outlined"
                  size="small"
                  color="secondary"
                  onClick={() => onPlaytestGame(game)}
                  disabled={!hasGame}
                >
                  Playtest
                </Button>
              )}
              {isCreator && hasUnreviewedPlaytest(game) && onReviewPlaytest && (
                <Badge
                  badgeContent="!"
                  color="warning"
                  sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', minWidth: 16, height: 16 } }}
                >
                  <Button
                    variant="contained"
                    size="small"
                    color="warning"
                    onClick={() => onReviewPlaytest(game)}
                    sx={{ fontSize: '0.7rem' }}
                  >
                    {getPlaytestTesterName(game)} tested!
                  </Button>
                </Badge>
              )}
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
              {canDelete(game, childId, isParent) && (
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => setDeleteTarget(game)}
                  sx={{ alignSelf: 'center' }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </>
          )}
        </Box>
      </Box>
    )
  }
}
