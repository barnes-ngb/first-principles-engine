import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import MicIcon from '@mui/icons-material/Mic'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import StarIcon from '@mui/icons-material/Star'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'

import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SaveIndicator from '../../components/SaveIndicator'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import type { BookPage } from '../../core/types/domain'
import PageEditor from './PageEditor'
import { useBook } from './useBook'

export default function BookEditorPage() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childName = activeChild?.name ?? ''
  const isLincoln = childName.toLowerCase() === 'lincoln'

  const {
    book,
    loading,
    saveState,
    updatePage,
    addPage,
    deletePage,
    updateBookMeta,
    addImageToPage,
    removeImageFromPage,
  } = useBook(familyId, bookId)

  const [activePageIndex, setActivePageIndex] = useState(0)
  const [showPhotoCapture, setShowPhotoCapture] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)

  const activePage = useMemo(
    () => book?.pages[activePageIndex] ?? null,
    [book, activePageIndex],
  )

  const handlePageUpdate = useCallback(
    (changes: Partial<BookPage>) => {
      if (!activePage) return
      updatePage(activePage.id, changes)
    },
    [activePage, updatePage],
  )

  const handleAddPage = useCallback(() => {
    addPage()
    if (book) setActivePageIndex(book.pages.length)
  }, [addPage, book])

  const handleDeletePage = useCallback(() => {
    if (!activePage || !book || book.pages.length <= 1) return
    deletePage(activePage.id)
    setActivePageIndex((prev) => Math.max(0, prev - 1))
  }, [activePage, book, deletePage])

  const handlePhotoCapture = useCallback(
    async (file: File) => {
      if (!activePage) return
      await addImageToPage(activePage.id, file)
      setShowPhotoCapture(false)
    },
    [activePage, addImageToPage],
  )

  const handleRemoveImage = useCallback(
    (imageId: string) => {
      if (!activePage) return
      removeImageFromPage(activePage.id, imageId)
    },
    [activePage, removeImageFromPage],
  )

  const handleAddImageFile = useCallback(
    (file: File) => {
      if (!activePage) return
      void addImageToPage(activePage.id, file)
    },
    [activePage, addImageToPage],
  )

  if (loading) {
    return (
      <Page>
        <Typography color="text.secondary">Loading book...</Typography>
      </Page>
    )
  }

  if (!book) {
    return (
      <Page>
        <Typography color="text.secondary">Book not found.</Typography>
        <Button onClick={() => navigate('/books')} startIcon={<ArrowBackIcon />}>
          Back to My Books
        </Button>
      </Page>
    )
  }

  return (
    <Page>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1}>
        <IconButton onClick={() => navigate('/books')} sx={{ minWidth: 48, minHeight: 48 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <TextField
              value={book.title}
              onChange={(e) => updateBookMeta({ title: e.target.value })}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') setEditingTitle(false) }}
              autoFocus
              size="small"
              fullWidth
              sx={{
                '& .MuiInputBase-input': {
                  fontWeight: 700,
                  fontSize: '1.2rem',
                  ...(isLincoln
                    ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.75rem' }
                    : {}),
                },
              }}
            />
          ) : (
            <Typography
              variant="h5"
              onClick={() => setEditingTitle(true)}
              sx={{
                fontWeight: 700,
                cursor: 'pointer',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                '&:hover': { color: 'primary.main' },
                ...(isLincoln
                  ? { fontFamily: '"Press Start 2P", monospace', fontSize: '0.85rem' }
                  : {}),
              }}
            >
              {book.title}
            </Typography>
          )}
        </Box>
        <SaveIndicator state={saveState} />
      </Stack>

      {/* Page editor area */}
      {activePage && (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            p: { xs: 2, md: 3 },
            bgcolor: isLincoln ? 'rgba(0,0,0,0.02)' : 'background.paper',
          }}
        >
          <PageEditor
            page={activePage}
            onUpdate={handlePageUpdate}
            onAddImage={handleAddImageFile}
            onRemoveImage={handleRemoveImage}
            childName={childName}
          />
        </Box>
      )}

      {/* Photo capture dialog */}
      {showPhotoCapture && (
        <Box sx={{ mt: 1 }}>
          <PhotoCapture onCapture={(file) => { void handlePhotoCapture(file) }} />
          <Button
            size="small"
            onClick={() => setShowPhotoCapture(false)}
            sx={{ mt: 1 }}
          >
            Cancel
          </Button>
        </Box>
      )}

      {/* Page strip */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          overflowX: 'auto',
          py: 1,
          px: 0.5,
          '&::-webkit-scrollbar': { height: 4 },
        }}
      >
        {book.pages.map((page, index) => (
          <Box
            key={page.id}
            onClick={() => setActivePageIndex(index)}
            sx={{
              minWidth: 72,
              height: 72,
              borderRadius: 1,
              border: '2px solid',
              borderColor: index === activePageIndex ? 'primary.main' : 'divider',
              bgcolor: index === activePageIndex
                ? 'primary.50'
                : page.images.length > 0
                  ? 'grey.100'
                  : 'background.paper',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              position: 'relative',
              overflow: 'hidden',
              '&:hover': { borderColor: 'primary.light' },
            }}
          >
            {page.images[0] ? (
              <Box
                component="img"
                src={page.images[0].url}
                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  fontSize: '0.65rem',
                  textAlign: 'center',
                  px: 0.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {page.text ? page.text.slice(0, 20) : `Page ${page.pageNumber}`}
              </Typography>
            )}
            <Typography
              variant="caption"
              sx={{
                position: 'absolute',
                bottom: 1,
                right: 4,
                fontSize: '0.6rem',
                color: 'text.disabled',
              }}
            >
              {page.pageNumber}
            </Typography>
          </Box>
        ))}

        {/* Add page button */}
        <Box
          onClick={handleAddPage}
          sx={{
            minWidth: 72,
            height: 72,
            borderRadius: 1,
            border: '2px dashed',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
          }}
        >
          <AddIcon color="action" />
        </Box>
      </Box>

      {/* Action buttons */}
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button
          variant="outlined"
          startIcon={<PhotoCameraIcon />}
          onClick={() => setShowPhotoCapture(true)}
          sx={{ minHeight: 48 }}
        >
          Photo
        </Button>
        <Tooltip title="Coming soon">
          <span>
            <Button
              variant="outlined"
              startIcon={<MicIcon />}
              disabled
              sx={{ minHeight: 48 }}
            >
              Speak
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Coming soon">
          <span>
            <Button
              variant="outlined"
              startIcon={<AutoAwesomeIcon />}
              disabled
              sx={{ minHeight: 48 }}
            >
              AI Scene
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Coming soon">
          <span>
            <Button
              variant="outlined"
              startIcon={<StarIcon />}
              disabled
              sx={{ minHeight: 48 }}
            >
              Sticker
            </Button>
          </span>
        </Tooltip>

        {/* Delete page (only if > 1 page) */}
        {book.pages.length > 1 && (
          <Button
            variant="text"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={handleDeletePage}
            sx={{ minHeight: 48, ml: 'auto' }}
          >
            Delete page
          </Button>
        )}
      </Stack>
    </Page>
  )
}
