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
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver'
import BarChartIcon from '@mui/icons-material/BarChart'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import DownloadIcon from '@mui/icons-material/Download'

import CreativeTimer from '../../components/CreativeTimer'
import Page from '../../components/Page'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import { SubjectBucket, UserProfile } from '../../core/types/enums'
import type { Book, BookTheme, StickerTag } from '../../core/types'
import { BOOK_THEMES, STICKER_TAG_LABELS } from '../../core/types'
import { COVER_STYLES, GENERATION_STYLES } from './bookTypes'
import { useBookshelf } from './useBook'
import { useBookGenerator } from './useBookGenerator'
import { printBook } from './printBook'
import PrintSettingsDialog from './PrintSettingsDialog'
import type { PrintSettings } from './PrintSettingsDialog'
import GenerationProgress from './GenerationProgress'
import EvaluationBookBanner from './EvaluationBookBanner'
import { useEvaluationBookSuggestions } from './useEvaluationBookSuggestions'
import CreateThemeDialog from './CreateThemeDialog'

type BookFilter = 'all' | 'creative' | 'generated' | 'sight-word'
type CreatorFilter = 'all' | 'parent' | 'kids'

export default function BookshelfPage() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild, children: allChildren } = useActiveChild()
  const childName = activeChild?.name ?? ''
  const childId = activeChild?.id ?? ''
  const isLincoln = childName.toLowerCase() === 'lincoln'

  const { profile } = useProfile()
  const isParent = profile === UserProfile.Parents

  const { books, loading, createBook, deleteBook } = useBookshelf(familyId, childId, isParent)
  const [childFilter, setChildFilter] = useState<string>('all')
  const { generateBook, progress, generating, resetProgress } = useBookGenerator()
  const { suggestions: evalSuggestions } = useEvaluationBookSuggestions(
    isParent ? familyId : '',
    isParent ? childId : '',
  )

  const [bookFilter, setBookFilter] = useState<BookFilter>('all')
  const [creatorFilter, setCreatorFilter] = useState<CreatorFilter>('all')
  const [themeFilter, setThemeFilter] = useState<BookTheme | 'all'>('all')
  const [stickerTagFilter, setStickerTagFilter] = useState<StickerTag | 'all'>('all')
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [dialogTab, setDialogTab] = useState(0) // 0 = Blank, 1 = Generate

  // Blank book state
  const [newTitle, setNewTitle] = useState('')
  const [newCoverStyle, setNewCoverStyle] = useState<Book['coverStyle']>(
    isLincoln ? 'minecraft' : 'storybook',
  )
  const [creating, setCreating] = useState(false)

  // Generate book state
  const [genStoryIdea, setGenStoryIdea] = useState('')
  const [genWords, setGenWords] = useState('')
  const [genStyle, setGenStyle] = useState(isLincoln ? 'minecraft' : 'storybook')
  const [genPageCount, setGenPageCount] = useState(isLincoln ? 10 : 6)

  // Menu state
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [menuBookId, setMenuBookId] = useState<string | null>(null)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null)

  // Custom theme dialog
  const [showCreateTheme, setShowCreateTheme] = useState(false)

  // Print state
  const [showPrintSettings, setShowPrintSettings] = useState(false)
  const [printTarget, setPrintTarget] = useState<Book | null>(null)

  const handlePrintBook = useCallback(
    async (settings: PrintSettings) => {
      if (!printTarget?.id) return
      setShowPrintSettings(false)
      await printBook(printTarget, {
        childName,
        isLincoln,
        sightWords: printTarget.sightWords,
        settings,
      })
      setPrintTarget(null)
    },
    [printTarget, childName, isLincoln],
  )

  const handleCreateBook = useCallback(async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const attribution = isParent && childId
        ? { createdBy: 'parent' as const, createdFor: childId }
        : childId
          ? { createdBy: childId, createdFor: childId }
          : undefined
      const bookId = await createBook(
        newTitle.trim(),
        newCoverStyle,
        undefined,
        undefined,
        attribution,
      )
      setShowNewDialog(false)
      setNewTitle('')
      navigate(`/books/${bookId}`)
    } finally {
      setCreating(false)
    }
  }, [newTitle, newCoverStyle, createBook, navigate, isParent, childId])

  const handleGenerateBook = useCallback(async () => {
    if (!genStoryIdea.trim() && !genWords.trim()) return
    setShowNewDialog(false)

    const words = genWords
      .split(/[,\n]+/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean)

    const attribution = isParent && childId
      ? { createdBy: 'parent' as const, createdFor: childId }
      : childId
        ? { createdBy: childId, createdFor: childId }
        : undefined
    const bookId = await generateBook(
      familyId,
      childId,
      genStoryIdea.trim(),
      words,
      genStyle,
      genPageCount,
      undefined,
      attribution,
    )

    if (bookId) {
      // Brief delay so user sees "done" state
      setTimeout(() => {
        resetProgress()
        navigate(`/books/${bookId}`)
      }, 1500)
    }
  }, [
    genStoryIdea,
    genWords,
    genStyle,
    genPageCount,
    familyId,
    childId,
    generateBook,
    resetProgress,
    navigate,
    isParent,
  ])

  const handleCloseNewDialog = useCallback(() => {
    setShowNewDialog(false)
    setDialogTab(0)
    setNewTitle('')
    setGenStoryIdea('')
    setGenWords('')
    setGenPageCount(isLincoln ? 10 : 6)
  }, [isLincoln])

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

  // Themes that have at least one book, ordered by child preference
  const availableThemes = useMemo(() => {
    const themesInBooks = new Set(books.map((b) => b.theme).filter(Boolean) as BookTheme[])
    const preferredFirst = isLincoln
      ? ['minecraft', 'adventure'] as BookTheme[]
      : ['animals', 'fantasy'] as BookTheme[]
    const ordered = [
      ...preferredFirst.filter((t) => themesInBooks.has(t)),
      ...BOOK_THEMES.filter((t) => themesInBooks.has(t.id) && !preferredFirst.includes(t.id)).map((t) => t.id),
    ]
    return ordered
  }, [books, isLincoln])

  // Sticker tags across all books (for filter chips)
  const availableStickerTags = useMemo(() => {
    const tags = new Set<StickerTag>()
    for (const book of books) {
      for (const page of book.pages ?? []) {
        for (const img of page.images ?? []) {
          if (img.type === 'sticker' && img.tags) {
            for (const tag of img.tags) {
              tags.add(tag as StickerTag)
            }
          }
        }
      }
    }
    return Array.from(tags).sort()
  }, [books])

  // Sort: drafts first (most recently edited), then completed
  const sortedBooks = useMemo(() => {
    let filtered = books
    if (bookFilter === 'creative') {
      filtered = books.filter((b) => b.bookType !== 'sight-word' && b.bookType !== 'generated')
    } else if (bookFilter === 'generated') {
      filtered = books.filter((b) => b.bookType === 'generated')
    } else if (bookFilter === 'sight-word') {
      filtered = books.filter((b) => b.bookType === 'sight-word')
    }
    if (creatorFilter === 'parent') {
      // Absent createdBy → treated as 'parent' (legacy)
      filtered = filtered.filter((b) => (b.createdBy ?? 'parent') === 'parent')
    } else if (creatorFilter === 'kids') {
      filtered = filtered.filter((b) => {
        const by = b.createdBy ?? 'parent'
        return by !== 'parent'
      })
    }
    if (themeFilter !== 'all') {
      filtered = filtered.filter((b) => b.theme === themeFilter)
    }
    if (childFilter === 'together') {
      filtered = filtered.filter((b) => b.isTogetherBook)
    } else if (childFilter !== 'all') {
      filtered = filtered.filter((b) => b.childId === childFilter || (b.contributorIds ?? []).includes(childFilter))
    }
    if (stickerTagFilter !== 'all') {
      filtered = filtered.filter((b) =>
        (b.pages ?? []).some((page) =>
          (page.images ?? []).some((img) =>
            img.type === 'sticker' && (img.tags ?? []).includes(stickerTagFilter)
          )
        )
      )
    }
    return [...filtered].sort((a, b) => {
      if (a.status === 'draft' && b.status !== 'draft') return -1
      if (a.status !== 'draft' && b.status === 'draft') return 1
      return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
    })
  }, [books, bookFilter, creatorFilter, themeFilter, childFilter, stickerTagFilter])

  if (loading) {
    return (
      <Page>
        <Stack alignItems="center" py={4}>
          <CircularProgress />
        </Stack>
      </Page>
    )
  }

  // Show generation progress overlay when generating
  if (progress && progress.phase !== 'done') {
    return (
      <Page>
        <GenerationProgress progress={progress} isLincoln={isLincoln} />
        {progress.phase === 'error' && (
          <Stack alignItems="center" sx={{ mt: 2 }}>
            <Button variant="outlined" onClick={resetProgress}>
              Back to Bookshelf
            </Button>
          </Stack>
        )}
      </Page>
    )
  }

  return (
    <Page>
      <CreativeTimer
        defaultSubject={SubjectBucket.Art}
        defaultDescription="Book creation"
      />
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

      {/* Tell a Story — primary CTA (kids) / secondary for parents */}
      <Button
        variant={isParent ? 'outlined' : 'contained'}
        size="large"
        startIcon={<RecordVoiceOverIcon />}
        onClick={() => navigate('/books/story-guide')}
        sx={{
          minHeight: isParent ? 44 : 56,
          textTransform: 'none',
          fontWeight: 700,
          ...(isParent
            ? {}
            : {
                fontSize: '1.05rem',
                bgcolor: isLincoln ? '#4caf50' : '#f06292',
                '&:hover': { bgcolor: isLincoln ? '#388e3c' : '#e91e8c' },
              }),
        }}
      >
        {isLincoln ? 'Tell a Story 🎮' : 'Tell a Story ✨'}
      </Button>

      {/* Evaluation-based book suggestions (parent view only) */}
      {isParent && evalSuggestions.length > 0 && (
        <EvaluationBookBanner suggestions={evalSuggestions} childName={childName} />
      )}

      {/* Filter tabs + parent actions */}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <ToggleButtonGroup
          value={bookFilter}
          exclusive
          onChange={(_, val) => {
            if (val) setBookFilter(val)
          }}
          size="small"
        >
          <ToggleButton value="all" sx={{ textTransform: 'none', minHeight: 36 }}>
            All ({books.length})
          </ToggleButton>
          <ToggleButton value="creative" sx={{ textTransform: 'none', minHeight: 36 }}>
            My Stories ({books.filter((b) => b.bookType !== 'sight-word' && b.bookType !== 'generated').length})
          </ToggleButton>
          <ToggleButton value="generated" sx={{ textTransform: 'none', minHeight: 36 }}>
            Generated ({books.filter((b) => b.bookType === 'generated').length})
          </ToggleButton>
          <ToggleButton value="sight-word" sx={{ textTransform: 'none', minHeight: 36 }}>
            Sight Words ({books.filter((b) => b.bookType === 'sight-word').length})
          </ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        {isParent && (
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AutoFixHighIcon />}
              onClick={() => navigate('/books/create-story')}
              sx={{ minHeight: 36, textTransform: 'none' }}
            >
              Create Sight Word Story
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<BarChartIcon />}
              onClick={() => navigate('/books/sight-words')}
              sx={{ minHeight: 36, textTransform: 'none' }}
            >
              Sight Word Progress
            </Button>
          </>
        )}
      </Stack>

      {/* Creator filter (parent view: all / mom's books / kids' books) */}
      {isParent && (
        <Stack direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', mr: 0.5 }}>
            Made by:
          </Typography>
          <Chip
            label={`All (${books.length})`}
            size="small"
            onClick={() => setCreatorFilter('all')}
            color={creatorFilter === 'all' ? 'primary' : 'default'}
            variant={creatorFilter === 'all' ? 'filled' : 'outlined'}
          />
          <Chip
            label={`Mom's Books (${books.filter((b) => (b.createdBy ?? 'parent') === 'parent').length})`}
            size="small"
            onClick={() => setCreatorFilter('parent')}
            color={creatorFilter === 'parent' ? 'primary' : 'default'}
            variant={creatorFilter === 'parent' ? 'filled' : 'outlined'}
          />
          <Chip
            label={`Kids (${books.filter((b) => (b.createdBy ?? 'parent') !== 'parent').length})`}
            size="small"
            onClick={() => setCreatorFilter('kids')}
            color={creatorFilter === 'kids' ? 'primary' : 'default'}
            variant={creatorFilter === 'kids' ? 'filled' : 'outlined'}
          />
        </Stack>
      )}

      {/* Child filter (parent view only) */}
      {isParent && allChildren.length > 1 && (
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <Chip
            label="All"
            onClick={() => setChildFilter('all')}
            color={childFilter === 'all' ? 'primary' : 'default'}
            variant={childFilter === 'all' ? 'filled' : 'outlined'}
          />
          {allChildren.map((child) => (
            <Chip
              key={child.id}
              label={`${child.name} (${books.filter((b) => b.childId === child.id).length})`}
              onClick={() => setChildFilter(child.id)}
              color={childFilter === child.id ? 'primary' : 'default'}
              variant={childFilter === child.id ? 'filled' : 'outlined'}
            />
          ))}
          <Chip
            label={`Together (${books.filter((b) => b.isTogetherBook).length})`}
            onClick={() => setChildFilter('together')}
            color={childFilter === 'together' ? 'primary' : 'default'}
            variant={childFilter === 'together' ? 'filled' : 'outlined'}
          />
        </Stack>
      )}

      {/* Theme filter chips — only show when there are themed books */}
      {availableThemes.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            gap: 0.75,
            overflowX: 'auto',
            pb: 0.5,
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          <Chip
            label="All Themes"
            size="small"
            variant={themeFilter === 'all' ? 'filled' : 'outlined'}
            onClick={() => setThemeFilter('all')}
          />
          {availableThemes.map((themeId) => {
            const meta = BOOK_THEMES.find((t) => t.id === themeId)
            if (!meta) return null
            return (
              <Chip
                key={themeId}
                label={`${meta.emoji} ${meta.label}`}
                size="small"
                variant={themeFilter === themeId ? 'filled' : 'outlined'}
                onClick={() => setThemeFilter(themeId)}
              />
            )
          })}
          {isParent && (
            <Chip
              label="+ New Theme"
              size="small"
              variant="outlined"
              color="primary"
              onClick={() => setShowCreateTheme(true)}
            />
          )}
        </Box>
      )}

      {/* Sticker tag filter chips */}
      {availableStickerTags.length > 0 && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', mr: 0.5 }}>
            Stickers:
          </Typography>
          <Chip
            label="Any"
            size="small"
            onClick={() => setStickerTagFilter('all')}
            color={stickerTagFilter === 'all' ? 'primary' : 'default'}
            variant={stickerTagFilter === 'all' ? 'filled' : 'outlined'}
          />
          {availableStickerTags.map((tag) => (
            <Chip
              key={tag}
              label={STICKER_TAG_LABELS[tag] ?? tag}
              size="small"
              onClick={() => setStickerTagFilter(tag)}
              color={stickerTagFilter === tag ? 'primary' : 'default'}
              variant={stickerTagFilter === tag ? 'filled' : 'outlined'}
            />
          ))}
        </Stack>
      )}

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
            const coverUrl =
              book.coverImageUrl ?? book.pages.find((p) => p.images.length > 0)?.images[0]?.url
            const by = book.createdBy ?? 'parent'
            const creatorLabel = by === 'parent'
              ? 'By Mom'
              : `By ${allChildren.find((c) => c.id === by)?.name ?? 'Kid'}`

            return (
              <Box
                key={book.id}
                onClick={() =>
                  navigate(
                    book.status === 'complete' ? `/books/${book.id}/read` : `/books/${book.id}`,
                  )
                }
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: book.isTogetherBook ? 'info.300' : 'divider',
                  bgcolor: isLincoln ? 'grey.900' : '#fff8f0',
                  color: isLincoln ? 'grey.100' : '#3d3d3d',
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
                  maxWidth: 200,
                  width: '100%',
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
                      aspectRatio: '2/3',
                      objectFit: 'cover',
                      objectPosition: 'center top',
                      borderRadius: 1,
                      mb: 1,
                      display: 'block',
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: '100%',
                      aspectRatio: '2/3',
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

                <Stack
                  direction="row"
                  spacing={0.5}
                  alignItems="center"
                  sx={{ mt: 'auto', pt: 1 }}
                  flexWrap="wrap"
                  useFlexGap
                >
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
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        bgcolor: 'info.100',
                        color: 'info.800',
                      }}
                    />
                  )}
                  <Chip
                    label={creatorLabel}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      bgcolor: by === 'parent' ? 'warning.100' : 'success.100',
                      color: by === 'parent' ? 'warning.800' : 'success.800',
                      fontWeight: 600,
                    }}
                  />
                  {(book.sightWords?.length ?? 0) > 0 && (
                    <Chip
                      label={`${book.sightWords!.length} words`}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        bgcolor: 'primary.100',
                        color: 'primary.800',
                        fontWeight: 600,
                      }}
                    />
                  )}
                  {book.bookType === 'generated' && (
                    <Chip
                      label="AI"
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        bgcolor: 'secondary.100',
                        color: 'secondary.800',
                        fontWeight: 600,
                      }}
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
                      sx={{
                        ml:
                          book.isTogetherBook || book.bookType === 'sight-word'
                            ? 0
                            : 'auto',
                        height: 20,
                        fontSize: '0.65rem',
                      }}
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
        onClose={() => {
          setMenuAnchor(null)
          setMenuBookId(null)
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            if (menuBookId) navigate(`/books/${menuBookId}/read`)
            setMenuBookId(null)
          }}
        >
          <ListItemIcon>
            <AutoStoriesIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Read</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            if (menuBookId) navigate(`/books/${menuBookId}`)
            setMenuBookId(null)
          }}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            const target = sortedBooks.find((b) => b.id === menuBookId)
            if (target) {
              setPrintTarget(target)
              setShowPrintSettings(true)
            }
            setMenuBookId(null)
          }}
        >
          <ListItemIcon>
            <DownloadIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Download PDF</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            const target = sortedBooks.find((b) => b.id === menuBookId)
            if (target) setDeleteTarget(target)
            setMenuBookId(null)
          }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete book?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;{deleteTarget?.title}&quot;? This can&apos;t be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              void handleDeleteBook()
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Print settings dialog */}
      <PrintSettingsDialog
        open={showPrintSettings}
        onClose={() => { setShowPrintSettings(false); setPrintTarget(null) }}
        onPrint={(s) => { void handlePrintBook(s) }}
        hasSightWords={(printTarget?.sightWords?.length ?? 0) > 0}
      />

      {/* New book dialog — two tabs: Blank Book / Generate a Book */}
      <Dialog open={showNewDialog} onClose={handleCloseNewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{isLincoln ? 'Craft a New Book' : 'Make a New Book'}</DialogTitle>
        <DialogContent>
          <Tabs
            value={dialogTab}
            onChange={(_, v) => setDialogTab(v)}
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label="Blank Book" sx={{ textTransform: 'none' }} />
            <Tab label="Generate a Book" sx={{ textTransform: 'none' }} />
          </Tabs>

          {/* Tab 0: Blank Book (existing flow) */}
          {dialogTab === 0 && (
            <Stack spacing={3} sx={{ pt: 1 }}>
              <TextField
                label="Book title"
                placeholder={isLincoln ? 'The Creeper Story' : 'My Adventure Book'}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreateBook()
                }}
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
                  onChange={(_, val) => {
                    if (val) setNewCoverStyle(val)
                  }}
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
          )}

          {/* Tab 1: Generate a Book */}
          {dialogTab === 1 && (
            <Stack spacing={3} sx={{ pt: 1 }}>
              {/* Story Guide shortcut */}
              <Button
                variant="outlined"
                startIcon={<RecordVoiceOverIcon />}
                onClick={() => {
                  handleCloseNewDialog()
                  navigate('/books/story-guide')
                }}
                sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
              >
                Use Story Guide (guided questions)
              </Button>
              <TextField
                label="What's your story about?"
                placeholder={
                  isLincoln
                    ? 'A Minecraft adventure with a cat and a dragon...'
                    : 'A princess who finds a magic garden with talking animals...'
                }
                value={genStoryIdea}
                onChange={(e) => setGenStoryIdea(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                maxRows={4}
                autoFocus
              />
              <TextField
                label="Words to include (optional)"
                placeholder={
                  isLincoln
                    ? 'the, is, was, cat, dog, run, water, where...'
                    : 'cat, dog, big, little, happy, love, my, the...'
                }
                helperText="These words will appear in the story and be highlighted when reading"
                value={genWords}
                onChange={(e) => setGenWords(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                maxRows={3}
              />
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Illustration style
                </Typography>
                <ToggleButtonGroup
                  value={genStyle}
                  exclusive
                  onChange={(_, val) => {
                    if (val) setGenStyle(val)
                  }}
                  sx={{ flexWrap: 'wrap' }}
                >
                  {GENERATION_STYLES.map((style) => (
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
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Pages: {genPageCount}
                </Typography>
                <Slider
                  value={genPageCount}
                  onChange={(_, v) => setGenPageCount(v as number)}
                  min={5}
                  max={15}
                  step={1}
                  marks
                  valueLabelDisplay="auto"
                />
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseNewDialog}>Cancel</Button>
          {dialogTab === 0 ? (
            <Button
              variant="contained"
              onClick={() => {
                void handleCreateBook()
              }}
              disabled={!newTitle.trim() || creating}
            >
              {creating ? 'Creating...' : 'Create'}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={() => {
                void handleGenerateBook()
              }}
              disabled={(!genStoryIdea.trim() && !genWords.trim()) || generating}
            >
              {generating ? 'Generating...' : 'Generate!'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Create custom theme dialog */}
      <CreateThemeDialog
        open={showCreateTheme}
        onClose={() => setShowCreateTheme(false)}
        familyId={familyId}
        childId={childId}
        onCreated={(themeId) => {
          // Select the new custom theme as the filter
          setThemeFilter(themeId)
        }}
      />
    </Page>
  )
}
