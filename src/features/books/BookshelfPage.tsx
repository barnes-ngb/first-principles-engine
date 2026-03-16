import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PrintIcon from '@mui/icons-material/Print'

import Page from '../../components/Page'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { Book } from '../../core/types/domain'
import { COVER_STYLES } from './bookTypes'
import { useBookshelf } from './useBook'
import { printBook } from './printBook'

export default function BookshelfPage() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childName = activeChild?.name ?? ''
  const childId = activeChild?.id ?? ''
  const isLincoln = childName.toLowerCase() === 'lincoln'

  const { books, loading, createBook, deleteBook } = useBookshelf(familyId, childId)

  const [showNewDialog, setShowNewDialog] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCoverStyle, setNewCoverStyle] = useState<Book['coverStyle']>(
    isLincoln ? 'minecraft' : 'storybook',
  )
  const [creating, setCreating] = useState(false)
  const [printingBookId, setPrintingBookId] = useState<string | null>(null)

  // Menu state
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [menuBookId, setMenuBookId] = useState<string | null>(null)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null)

  const handlePrintBook = useCallback(
    async (book: Book, e: React.MouseEvent) => {
      e.stopPropagation()
      if (!book.id) return
      setPrintingBookId(book.id)
      try {
        await printBook(book, childName)
      } finally {
        setPrintingBookId(null)
      }
    },
    [childName],
  )

  const handleCreateBook = useCallback(async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const bookId = await createBook(newTitle.trim(), newCoverStyle)
      setShowNewDialog(false)
      setNewTitle('')
      navigate(`/books/${bookId}`)
    } finally {
      setCreating(false)
    }
  }, [newTitle, newCoverStyle, createBook, navigate])

  const formatRelativeTime = (iso: string) => {
    try {
      const now = new Date()
      const date = new Date(iso)
      const diffMs = now.getTime() - date.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      if (diffDays === 0) return 'Edited today'
      if (diffDays === 1) return 'Edited yesterday'
      if (diffDays < 7) return `Edited ${diffDays} days ago`
      return `Edited ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    } catch {
      return ''
    }
  }

  const handleDeleteBook = useCallback(async () => {
    if (!deleteTarget?.id) return
    await deleteBook(deleteTarget.id)
    setDeleteTarget(null)
  }, [deleteTarget, deleteBook])

  // Sort: drafts first (most recently edited), then completed
  const sortedBooks = useMemo(() => {
    return [...books].sort((a, b) => {
      if (a.status === 'draft' && b.status !== 'draft') return -1
      if (a.status !== 'draft' && b.status === 'draft') return 1
      return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
    })
  }, [books])

  if (loading) {
    return (
      <Page>
        <Stack alignItems="center" py={4}>
          <CircularProgress />
        </Stack>
      </Page>
    )
  }

  return (
    <Page>
      <Typography
        variant="h4"
        component="h1"
        sx={{
          fontWeight: 700,
          ...(isLincoln
            ? { fontFamily: '"Press Start 2P", monospace', fontSize: '1rem' }
            : {}),
        }}
      >
        My Books
      </Typography>

      {books.length === 0 ? (
        /* Empty state */
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <MenuBookIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No books yet!
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {isLincoln
              ? 'Craft your first book — tell a story, add photos, make it epic!'
              : 'Make your first book — write a story and draw the pictures!'}
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<AddIcon />}
            onClick={() => setShowNewDialog(true)}
            sx={{ minHeight: 56, px: 4 }}
          >
            Make a new book
          </Button>
        </Box>
      ) : (
        /* Book grid */
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
            gap: 2,
          }}
        >
          {sortedBooks.map((book) => {
            const coverUrl = book.coverImageUrl
              ?? book.pages.find((p) => p.images.length > 0)?.images[0]?.url

            return (
              <Box
                key={book.id}
                onClick={() => navigate(book.status === 'complete' ? `/books/${book.id}/read` : `/books/${book.id}`)}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: book.isTogetherBook ? 'info.300' : 'divider',
                  bgcolor: isLincoln ? 'grey.900' : 'background.paper',
                  color: isLincoln ? 'grey.100' : 'text.primary',
                  cursor: 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  position: 'relative',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 3,
                  },
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 140,
                }}
              >
                {/* 3-dot menu */}
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuAnchor(e.currentTarget)
                    setMenuBookId(book.id ?? null)
                  }}
                  sx={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    zIndex: 1,
                    bgcolor: 'rgba(255,255,255,0.7)',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' },
                  }}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>

                {/* Cover thumbnail */}
                {coverUrl ? (
                  <Box
                    component="img"
                    src={coverUrl}
                    sx={{
                      width: '100%',
                      height: 80,
                      objectFit: 'cover',
                      borderRadius: 1,
                      mb: 1,
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: '100%',
                      height: 80,
                      borderRadius: 1,
                      mb: 1,
                      bgcolor: isLincoln ? 'grey.800' : 'grey.100',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MenuBookIcon
                      sx={{
                        fontSize: 32,
                        color: isLincoln ? 'grey.600' : 'grey.400',
                      }}
                    />
                  </Box>
                )}

                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    ...(isLincoln
                      ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.55rem' }
                      : {}),
                  }}
                >
                  {book.title}
                </Typography>

                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 'auto', pt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {book.pages.length} page{book.pages.length !== 1 ? 's' : ''}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    &middot;
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatRelativeTime(book.updatedAt)}
                  </Typography>
                  {book.isTogetherBook && (
                    <Chip
                      label="Together"
                      size="small"
                      sx={{ height: 20, fontSize: '0.65rem', bgcolor: 'info.100', color: 'info.800' }}
                    />
                  )}
                  {book.status === 'complete' ? (
                    <Chip
                      label="Finished"
                      size="small"
                      sx={{
                        ml: 'auto',
                        height: 20,
                        fontSize: '0.65rem',
                        bgcolor: 'success.100',
                        color: 'success.800',
                        fontWeight: 600,
                      }}
                    />
                  ) : (
                    <Chip
                      label="Draft"
                      size="small"
                      sx={{ ml: book.isTogetherBook ? 0 : 'auto', height: 20, fontSize: '0.65rem' }}
                    />
                  )}
                </Stack>
              </Box>
            )
          })}

          {/* New book card */}
          <Box
            onClick={() => setShowNewDialog(true)}
            sx={{
              p: 2,
              borderRadius: 2,
              border: '2px dashed',
              borderColor: 'divider',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 140,
              '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
            }}
          >
            <AddIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              New book
            </Typography>
          </Box>
        </Box>
      )}

      {/* Book context menu */}
      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => { setMenuAnchor(null); setMenuBookId(null) }}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem onClick={() => {
          setMenuAnchor(null)
          if (menuBookId) navigate(`/books/${menuBookId}/read`)
          setMenuBookId(null)
        }}>
          <ListItemIcon><AutoStoriesIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Read</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          setMenuAnchor(null)
          if (menuBookId) navigate(`/books/${menuBookId}`)
          setMenuBookId(null)
        }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={(e) => {
          setMenuAnchor(null)
          const target = sortedBooks.find((b) => b.id === menuBookId)
          if (target) void handlePrintBook(target, e as unknown as React.MouseEvent)
          setMenuBookId(null)
        }}>
          <ListItemIcon><PrintIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Print</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          setMenuAnchor(null)
          const target = sortedBooks.find((b) => b.id === menuBookId)
          if (target) setDeleteTarget(target)
          setMenuBookId(null)
        }}>
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete book?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;{deleteTarget?.title}&quot;? This can&apos;t be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => { void handleDeleteBook() }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* New book dialog */}
      <Dialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {isLincoln ? 'Craft a New Book' : 'Make a New Book'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <TextField
              label="Book title"
              placeholder={
                isLincoln ? 'The Creeper Story' : 'My Adventure Book'
              }
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateBook() }}
              fullWidth
              autoFocus
            />
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Cover style
              </Typography>
              <ToggleButtonGroup
                value={newCoverStyle}
                exclusive
                onChange={(_, val) => { if (val) setNewCoverStyle(val) }}
                sx={{ flexWrap: 'wrap' }}
              >
                {COVER_STYLES.map((style) => (
                  <ToggleButton
                    key={style.value}
                    value={style.value}
                    sx={{ textTransform: 'none', px: 2, minHeight: 48 }}
                  >
                    {style.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => { void handleCreateBook() }}
            disabled={!newTitle.trim() || creating}
          >
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Page>
  )
}
