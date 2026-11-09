import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
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
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import AddIcon from '@mui/icons-material/Add'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import BarChartIcon from '@mui/icons-material/BarChart'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import CallIcon from '@mui/icons-material/Call'
import Diversity1Icon from '@mui/icons-material/Diversity1'
import DownloadIcon from '@mui/icons-material/Download'
import StorefrontIcon from '@mui/icons-material/Storefront'

import CreativeTimer from '../../components/CreativeTimer'
import Page from '../../components/Page'
import LibraryReturnBanner from '../avatar/stonebridge/LibraryReturnBanner'
import { EmptyState, LoadingState } from '../../components/states'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import { SubjectBucket, UserProfile } from '../../core/types/enums'
import type { Book, BookTheme, StickerTag } from '../../core/types'
import { BOOK_THEMES, STICKER_TAG_LABELS } from '../../core/types'
import { COVER_STYLES } from './bookTypes'
import CatalogPromoteDialog from '../business/CatalogPromoteDialog'
import { useCatalogProducts } from '../business/useCatalogProducts'
import { bookToCatalogInitial, canPromoteBook, isSourceInCatalog } from '../business/catalogOnramps'
import { useBookshelf } from './useBook'
import { ShelfFrame, resolveShelfFrame } from './shelfRead'
import BookGenerateChat from './BookGenerateChat'
import { makeBookPdf } from './makeBookPdf'
import { buildGrandparentBriefHtml } from './grandparentBrief'
import PrintSettingsDialog from './PrintSettingsDialog'
import type { PrintSettings } from './PrintSettingsDialog'
import EvaluationBookBanner from './EvaluationBookBanner'
import { useEvaluationBookSuggestions } from './useEvaluationBookSuggestions'
import {
  MAKE_BOOK_DOOR_LABEL,
  MAKE_BOOK_DOOR_TITLE,
  MakeBookChoice,
  makeBookChoices,
} from './makeBookDoor'
import { draftOwnerLabel, planDraftResume, resolveDraftOwnership } from './draftOwnership'

type BookFilter = 'all' | 'creative' | 'generated' | 'sight-word'
type CreatorFilter = 'all' | 'parent' | 'kids'

/**
 * The shelf's own recovery block: one sentence and, where there is something to
 * re-ask, one control.
 *
 * Local on purpose. The shared `ErrorState`'s action is a `size="small"` button
 * inside an Alert, which measured 64 × 31px on a phone — under the 44px this
 * app holds every control to — and widening it there would change every
 * surface that uses it. So the Alert and its calm colours stay and only the
 * action is the shelf's own: a real 44px `<Button>`, allowed its own row rather
 * than squeezing the sentence beside it. One definition for both failures the
 * shelf can report, so they cannot drift apart.
 */
function ShelfNotice({
  message,
  onRetry,
}: {
  message: string
  /** Omitted when there is genuinely nothing to ask again. */
  onRetry?: () => void
}) {
  return (
    <Alert
      severity="error"
      // The shared Alert's own calm colours and `role="alert"`, with the layout
      // this surface needs: the sentence at 14px, and an action that is allowed
      // its own row on a narrow phone rather than being squeezed beside it.
      sx={{
        alignItems: 'center',
        flexWrap: 'wrap',
        rowGap: 1,
        '& .MuiAlert-message': { fontSize: '14px', lineHeight: 1.45 },
        '& .MuiAlert-action': { pt: 0, ml: 'auto' },
      }}
      action={
        onRetry ? (
          <Button
            color="inherit"
            variant="outlined"
            onClick={onRetry}
            sx={{
              minHeight: 44,
              minWidth: 44,
              px: 2,
              fontSize: '14px',
              fontWeight: 700,
              textTransform: 'none',
            }}
          >
            Try again
          </Button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  )
}

export default function BookshelfPage() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  /**
   * The child, and the state of the read that resolves them — all from the one
   * call this page already makes. No second identity reader, no new flag, and
   * `retryLoad` is the children-load owner's own door rather than a re-read of
   * this page's making (the `StonebridgePage` precedent).
   */
  const {
    activeChild,
    children: allChildren,
    setActiveChildId,
    isChildProfile,
    isLoading: childrenLoading,
    loadFailed: childrenLoadFailed,
    retryLoad: retryChildrenRead,
  } = useActiveChild()
  const childName = activeChild?.name ?? ''
  const childId = activeChild?.id ?? ''
  const isLincoln = childName.toLowerCase() === 'lincoln'

  const { profile } = useProfile()
  const isParent = profile === UserProfile.Parents

  const {
    books,
    phase: shelfPhase,
    retry: retryShelfRead,
    createBook,
    deleteBook,
  } = useBookshelf(familyId, childId, isParent, {
    // A CHILD's shelf may only be read for a child who is actually known; the
    // parent's family query is not scoped to the selection and is unaffected.
    loading: childrenLoading,
    failed: childrenLoadFailed,
  })
  const shelfFrame = resolveShelfFrame(shelfPhase)
  const shelfSettled = shelfFrame === ShelfFrame.Settled
  /**
   * Has this shelf ever had a settled answer?
   *
   * The creative timer is a WRITE surface for compliance `hours`, so it is not
   * on a shelf that has never loaded: a cold pending or failed read must not
   * offer a session to start. Once there has been an answer it stays mounted
   * for the life of this page — a warm re-read, a refusal or a *Try again* must
   * not remount it, because a remount is a running session turned back into a
   * resume prompt and a lifetime that restarts. So this never returns to false,
   * it sits in a slot of its own that nothing is inserted before, and whose
   * minutes a session belongs to stays the timer's own `ownerChildId` BIND.
   */
  const [shelfSettledOnce, setShelfSettledOnce] = useState(false)
  if (!shelfSettledOnce && shelfSettled) setShelfSettledOnce(true)
  const [childFilter, setChildFilter] = useState<string>('all')
  const { suggestions: evalSuggestions } = useEvaluationBookSuggestions(
    isParent ? familyId : '',
    isParent ? childId : '',
  )

  const [bookFilter, setBookFilter] = useState<BookFilter>('all')
  const [creatorFilter, setCreatorFilter] = useState<CreatorFilter>('all')
  const [themeFilter, setThemeFilter] = useState<BookTheme | 'all'>('all')
  const [stickerTagFilter, setStickerTagFilter] = useState<StickerTag | 'all'>('all')
  const [showNewDialog, setShowNewDialog] = useState(false)
  /**
   * Which door the person picked, or `null` while the choice itself is on
   * screen (FEAT-187 / UX-102). This replaced a `dialogTab` that defaulted
   * straight into the AI chat: two tabs and a buried "Use Story Guide" link
   * were three generators with no map. Now the sheet asks once.
   */
  const [dialogChoice, setDialogChoice] = useState<MakeBookChoice | null>(null)
  const [resumeBookId, setResumeBookId] = useState<string | undefined>(undefined)

  // Blank book state
  const [newTitle, setNewTitle] = useState('')
  const [newCoverStyle, setNewCoverStyle] = useState<Book['coverStyle']>(
    isLincoln ? 'minecraft' : 'storybook',
  )
  const [creating, setCreating] = useState(false)

  // Menu state
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [menuBookId, setMenuBookId] = useState<string | null>(null)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null)

  // Custom theme dialog

  // Print state
  const [showPrintSettings, setShowPrintSettings] = useState(false)
  const [printTarget, setPrintTarget] = useState<Book | null>(null)
  const [printSkipNotice, setPrintSkipNotice] = useState<string | null>(null)

  // Catalog on-ramp (FEAT-82): promote a finished book into a CatalogProduct.
  // Parent-only (§6). Read-only of the book — the dialog writes via its own
  // useCatalogProducts.createProduct; `products` here is only for the dedup label.
  const { products: catalogProducts } = useCatalogProducts()
  const [promoteBook, setPromoteBook] = useState<Book | null>(null)

  const handlePrintBook = useCallback(
    async (settings: PrintSettings) => {
      if (!printTarget?.id) return
      setShowPrintSettings(false)
      const notice = await makeBookPdf(printTarget, {
        childName,
        isLincoln,
        sightWords: printTarget.sightWords,
        settings,
      })
      if (notice) setPrintSkipNotice(notice)
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

  const handleCloseNewDialog = useCallback(() => {
    setShowNewDialog(false)
    setDialogChoice(null)
    setNewTitle('')
    setResumeBookId(undefined)
  }, [])

  const handleOpenNewDialog = useCallback(() => {
    setResumeBookId(undefined)
    setDialogChoice(null)
    setShowNewDialog(true)
  }, [])

  /**
   * Resuming a half-made draft skips the door: the question "which way do you
   * want to make this?" was already answered when the draft was started.
   *
   * A draft belongs to the child it was started for, and a parent shelf lists
   * every child's (UX-108). So before the chat mounts — and it reads the
   * active child on mount — the header is switched to the draft's own child
   * when it is someone else's. `planDraftResume` owns that decision, including
   * the two cases with no honest switch; the card does not offer the tap at
   * all in those, and this guard makes the write impossible rather than
   * merely unreached.
   */
  const handleResumeDraft = useCallback(
    (book: Book) => {
      if (!book.id) return
      const plan = planDraftResume(
        resolveDraftOwnership(book, childId, allChildren),
        { isChildProfile },
      )
      if (!plan.canResume) return
      // Order matters: `setActiveChildIdShared` writes the shared store
      // synchronously, so the switch is in effect for the render that mounts
      // the chat — never a frame of the chat reading the previous child.
      if (plan.switchToChildId) setActiveChildId(plan.switchToChildId)
      setResumeBookId(book.id)
      setDialogChoice(MakeBookChoice.WithShelly)
      setShowNewDialog(true)
    },
    [childId, allChildren, isChildProfile, setActiveChildId],
  )

  // Parent-only: open the printable grandparent brief (FEAT-95 §4). Pure read → print,
  // same window.open pattern as the catalog sheet / printable kit. Not kid-visible.
  const handleGrandparentGuide = useCallback(() => {
    const html = buildGrandparentBriefHtml(childName)
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
      win.focus()
      win.print()
    }
  }, [childName])

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

  /**
   * The row the open menu belongs to, as the CURRENT settled answer sees it.
   *
   * Read synchronously from this render rather than from the state the menu was
   * opened against, because the menu outlives the row: a shelf whose audience
   * has been replaced — a parent handing the phone to a child — left *Read* and
   * *Edit* on screen over a book the new reader may not open, and they
   * navigated. So the menu is a door only while its row is part of the answer
   * the shelf is showing, and the actions ask this rather than the id they were
   * opened with. A parent's selected child does not change the answer, so their
   * family menu is untouched by the chip (UX-108's custody is unchanged: this
   * gates the READ doors only, and the delete/print/catalog items keep their
   * own existing lookups and dialogs).
   */
  const menuBook = shelfSettled ? (books.find((b) => b.id === menuBookId) ?? null) : null

  return (
    <Page>
      {/* The timer's own slot, first and always here, so the component that is
          mounted into it is never moved or replaced by a read frame. It is
          empty until this shelf has answered once (see `shelfSettledOnce`). */}
      {shelfSettledOnce ? (
        <CreativeTimer
          key="shelf-creative-timer"
          defaultSubject={SubjectBucket.Art}
          defaultDescription="Book creation"
        />
      ) : null}
      {/* The one way back to Stonebridge, and only for a child who came from
          there (FEAT — Library return). Above the title because it is a way
          *out* of this page: a back control a child has to scroll to find is a
          back control they do not find. It renders nothing at all on an
          ordinary visit, and it is not a second source of truth for anything —
          the flow it reads is temporary in-memory state created by the village
          itself. See `avatar/stonebridge/libraryReturnFlow`. */}
      <LibraryReturnBanner />
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

      {/* Evaluation-based book suggestions (parent view only) */}
      {isParent && evalSuggestions.length > 0 && (
        <EvaluationBookBanner suggestions={evalSuggestions} childName={childName} />
      )}

      {/* Filter tabs + parent actions.

          The ROW stays in every frame — Stickers and the parent's three doors
          are ways to useful work, and a child whose shelf will not load must
          still be able to reach them. The counts inside it do not: a tab
          reading "All (0)" over a read that has not landed or has failed is a
          number the page does not have. */}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        {shelfSettled && (
          <ToggleButtonGroup
            value={bookFilter}
            exclusive
            onChange={(_, val) => {
              if (val) setBookFilter(val)
            }}
            size="small"
            // Four counted tabs are wider than a phone, and a group that cannot
            // wrap is measured as one unbreakable box — which is a document
            // wider than the viewport before a single card is drawn. The tabs,
            // their order, their counts and their meaning are unchanged; only
            // the row they sit on is allowed to become two.
            sx={{ flexWrap: 'wrap', maxWidth: '100%' }}
          >
            <ToggleButton value="all" sx={{ textTransform: 'none', minHeight: 36 }}>
              All ({books.length})
            </ToggleButton>
            <ToggleButton value="creative" sx={{ textTransform: 'none', minHeight: 36 }}>
              Made by hand ({books.filter((b) => b.bookType !== 'sight-word' && b.bookType !== 'generated').length})
            </ToggleButton>
            <ToggleButton value="generated" sx={{ textTransform: 'none', minHeight: 36 }}>
              Written by AI ({books.filter((b) => b.bookType === 'generated').length})
            </ToggleButton>
            <ToggleButton value="sight-word" sx={{ textTransform: 'none', minHeight: 36 }}>
              Sight-word books ({books.filter((b) => b.bookType === 'sight-word').length})
            </ToggleButton>
          </ToggleButtonGroup>
        )}
        <Box sx={{ flex: 1 }} />
        {/* Stickers entry — visible to kids and parents (FEAT-33 slice 1) */}
        <Button
          size="small"
          variant="outlined"
          startIcon={<AutoAwesomeIcon />}
          onClick={() => navigate('/stickers')}
          sx={{ minHeight: 36, textTransform: 'none' }}
        >
          Stickers
        </Button>
        {isParent && (
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AutoFixHighIcon />}
              onClick={() => navigate('/books/create-story')}
              sx={{ minHeight: 36, textTransform: 'none' }}
            >
              Make a sight word book
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
            <Button
              size="small"
              variant="outlined"
              startIcon={<Diversity1Icon />}
              onClick={handleGrandparentGuide}
              sx={{ minHeight: 36, textTransform: 'none' }}
            >
              Grandparent guide
            </Button>
          </>
        )}
      </Stack>

      {/* Creator filter (parent view: all / mom's books / kids' books).
          Count-bearing, so it waits for an answer like the tabs above. */}
      {isParent && shelfSettled && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ mb: 1 }}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
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
            label={`Parents' books (${books.filter((b) => (b.createdBy ?? 'parent') === 'parent').length})`}
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

      {/* Child filter (parent view only) — also count-bearing. It filters the
          parent's family-wide answer and is not what that query asks for, so a
          change here neither re-reads nor reloads anything. */}
      {isParent && shelfSettled && allChildren.length > 1 && (
        <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
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

      {/* ── The shelf itself, in whichever answer the read has given ──────
          Waiting and Failed are the read's own frames and claim nothing else:
          a refused read is never drawn as an empty shelf, and its one door
          asks the SAME query again — it navigates nowhere and chooses no
          child. Everything above and below this slot is untouched by the
          read, which is why the way back, the doors, the dialogs and the
          timer survive a frame change. */}
      {!shelfSettled ? (
        shelfFrame === ShelfFrame.Failed ? (
          <ShelfNotice message="Couldn’t load your books." onRetry={retryShelfRead} />
        ) : shelfFrame === ShelfFrame.IdentityUnknown ? (
          /* The children read failed, so WHOSE shelf this is is unknown. Its
             own read owns the recovery — this offers that read's existing
             retry and nothing of its own, and says the true thing rather than
             showing an empty shelf or a spinner that cannot end. */
          <ShelfNotice
            message="Couldn’t check whose books these are."
            onRetry={retryChildrenRead}
          />
        ) : (
          <LoadingState fullHeight />
        )
      ) : books.length === 0 ? (
        /* Empty state */
        <EmptyState
          icon={<MenuBookIcon />}
          title="No books yet!"
          description={
            isLincoln
              ? 'Craft your first book — tell a story, add photos, make it epic!'
              : 'Make your first book — write a story and draw the pictures!'
          }
          action={
            <Button
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              onClick={handleOpenNewDialog}
              sx={{ minHeight: 56, px: 4 }}
            >
              {MAKE_BOOK_DOOR_LABEL}
            </Button>
          }
        />
      ) : (
        /* Book grid */
        <Box
          sx={{
            display: 'grid',
            /**
             * Phone: tracks that cannot be pushed wider than the shelf.
             *
             * `1fr` is `minmax(auto, 1fr)`, so each track was at least as wide
             * as its widest card wanted to be — a long chip label ("Continue
             * making this story →") or a long title made the grid, and with it
             * the document, wider than the viewport, and the second card's
             * options button sat off the right edge. `auto-fill` with a 140px
             * floor is the same two columns at 390px, drops to one column on a
             * genuinely narrow phone instead of overflowing, and never asks for
             * more width than there is. Tablet and desktop keep their fixed 2
             * and 3 columns, now with a 0 minimum so a card's content can never
             * widen the track there either.
             */
            gridTemplateColumns: {
              xs: 'repeat(auto-fill, minmax(140px, 1fr))',
              sm: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
            },
            gap: 2,
          }}
        >
          {/* The "Make a book" tile — first position (Story Gen V2 PR-A), and
              since FEAT-187 the ONE door: it opens the choice, not a default
              generator. */}
          <Box
            data-testid="new-book-tile"
            onClick={handleOpenNewDialog}
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
              // A grid item's own `min-width: auto` is content-based, so without
              // this the tile could still widen its track.
              minWidth: 0,
              '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
            }}
          >
            <AddIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              {MAKE_BOOK_DOOR_LABEL}
            </Typography>
          </Box>

          {sortedBooks.map((book) => {
            const coverUrl =
              book.coverImageUrl ?? book.pages.find((p) => p.images.length > 0)?.images[0]?.url
            const by = book.createdBy ?? 'parent'
            // `createdBy: 'parent'` is Mom OR Dad (see `Book.createdBy`), and a
            // legacy book with no `createdBy` resolves to it too — so the chip
            // says "a parent", the same phrase the Watch Library settled on
            // (UX-02), never a name the data model does not hold (UX-103).
            const creatorLabel = by === 'parent'
              ? 'By a parent'
              : `By ${allChildren.find((c) => c.id === by)?.name ?? 'Kid'}`
            const isInProgressDraft = book.reviewState?.generateChatState === 'in-progress'
            // Whose draft this is, and what a tap does about it (UX-108).
            // Resolved through `children`, never a name literal.
            const draftOwnership = resolveDraftOwnership(book, childId, allChildren)
            const draftPlan = planDraftResume(draftOwnership, { isChildProfile })
            const ownerLabel = isInProgressDraft ? draftOwnerLabel(draftOwnership) : null
            const draftBlockedLine = isInProgressDraft ? draftPlan.blockedLine : null
            // Per-Page Review started but not finished (or skipped) yet.
            const isReviewInProgress =
              !isInProgressDraft &&
              !book.reviewState?.completedAt &&
              (book.reviewState?.reviewedPages?.length ?? 0) > 0
            const isResumable = isInProgressDraft || isReviewInProgress

            return (
              <Box
                key={book.id}
                onClick={() => {
                  if (isInProgressDraft) {
                    // A draft with no honest resume opens nothing — the card
                    // carries the line saying why.
                    if (draftPlan.canResume) handleResumeDraft(book)
                    return
                  }
                  if (isReviewInProgress && book.id) {
                    navigate(`/books/${book.id}/review`)
                    return
                  }
                  navigate(
                    book.status === 'complete' ? `/books/${book.id}/read` : `/books/${book.id}`,
                  )
                }}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: isResumable ? '2px dashed' : '1px solid',
                  borderColor: isResumable
                    ? 'warning.main'
                    : book.isTogetherBook
                      ? 'info.300'
                      : 'divider',
                  bgcolor: isLincoln ? 'grey.900' : '#fff8f0',
                  color: isLincoln ? 'grey.100' : '#3d3d3d',
                  // A blocked draft is not a door — it should not invite the tap.
                  cursor: draftBlockedLine ? 'default' : 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  position: 'relative',
                  '&:hover': draftBlockedLine
                    ? undefined
                    : {
                        transform: 'translateY(-2px)',
                        boxShadow: 3,
                      },
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 140,
                  maxWidth: 200,
                  width: '100%',
                  // Same reason as the make-a-book tile: the card takes the
                  // width of its track rather than setting it.
                  minWidth: 0,
                }}
              >
                {/* The card's one action door.
                    It was a 30 × 30px icon with no accessible name, so a
                    screen reader heard "button" once per card with nothing to
                    tell them apart and a finger had nothing to land on. Now it
                    says which book it belongs to, it is the 44px this app holds
                    every control to, and its focus ring is visible on the cover
                    it sits over. `stopPropagation` is unchanged: the tap opens
                    the menu and never the card underneath, changes no
                    selection and writes nothing. */}
                <IconButton
                  size="small"
                  aria-label={`Options for ${book.title}`}
                  aria-haspopup="true"
                  aria-expanded={!!menuAnchor && menuBookId === (book.id ?? null)}
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
                    width: 44,
                    height: 44,
                    bgcolor: 'rgba(255,255,255,0.7)',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' },
                    '&:focus-visible': {
                      outline: '3px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: 1,
                      bgcolor: 'rgba(255,255,255,0.95)',
                    },
                  }}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>

                {/* Cover thumbnail */}
                {coverUrl ? (
                  <Box
                    component="img"
                    src={coverUrl}
                    // Shelf cover thumbnail — a chip, not the page. Cover-fit
                    // always; `PageImage.fit` is a page rule (FEAT-177).
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
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    // On a phone the title is given two lines and allowed to
                    // break anywhere, so a long title — including one long
                    // unbroken word — stays readable instead of being cut to a
                    // few letters or pushing the card wide. Tablet and desktop
                    // keep the existing single ellipsised line.
                    display: { xs: '-webkit-box', sm: 'block' },
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 2,
                    whiteSpace: { xs: 'normal', sm: 'nowrap' },
                    overflowWrap: 'anywhere',
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
                  sx={{
                    mt: 'auto',
                    pt: 1,
                    minWidth: 0,
                    // One rule for every label on this row — author, draft
                    // owner, word count, AI, Finished, the long "Continue
                    // making this story →". A Chip's label already ellipsises;
                    // what it lacked was a ceiling, so each one asked for its
                    // full text and the widest of them set the card's width.
                    '& .MuiChip-root': { maxWidth: '100%' },
                  }}
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
                  {/* Whose draft this is (UX-108). "By a parent" says who typed
                      it; this says who it is FOR — the child the chat will
                      read, size and write for when it reopens. */}
                  {ownerLabel && (
                    <Chip
                      data-testid={`draft-owner-${book.id}`}
                      label={ownerLabel}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        bgcolor: 'info.100',
                        color: 'info.800',
                        fontWeight: 600,
                      }}
                    />
                  )}
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
                  {(book.source === 'ai-generated' || book.bookType === 'generated') && (
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
                  ) : isInProgressDraft && draftBlockedLine ? (
                    // No honest resume for this draft (UX-108): say why, once,
                    // instead of offering a tap that would write for the wrong
                    // child.
                    <Typography
                      data-testid={`draft-blocked-${book.id}`}
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        ml: 'auto',
                        textAlign: 'right',
                        minWidth: 0,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {draftBlockedLine}
                    </Typography>
                  ) : isInProgressDraft ? (
                    <Chip
                      label="Continue making this story →"
                      size="small"
                      sx={{
                        ml: 'auto',
                        height: 22,
                        fontSize: '0.65rem',
                        bgcolor: 'warning.100',
                        color: 'warning.900',
                        fontWeight: 700,
                      }}
                    />
                  ) : isReviewInProgress ? (
                    <Chip
                      label={'Finish "Read it to me" →'}
                      size="small"
                      sx={{
                        ml: 'auto',
                        height: 22,
                        fontSize: '0.65rem',
                        bgcolor: 'warning.100',
                        color: 'warning.900',
                        fontWeight: 700,
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
        </Box>
      )}

      {/* Book context menu. Open only while its row is part of the answer the
          shelf is currently showing — see `menuBook`. */}
      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor && !!menuBook}
        onClose={() => {
          setMenuAnchor(null)
          setMenuBookId(null)
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            if (menuBook?.id) navigate(`/books/${menuBook.id}/read`)
            setMenuBookId(null)
          }}
        >
          <ListItemIcon>
            <AutoStoriesIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Read</ListItemText>
        </MenuItem>
        {/* Story Call (FEAT-95) — screen-shared read-aloud to a grandparent. Finished
            books only; kid-reachable by design (this is a kid surface). */}
        {menuBook?.status === 'complete' && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null)
              if (menuBook?.id) navigate(`/books/${menuBook.id}/read?call=1`)
              setMenuBookId(null)
            }}
          >
            <ListItemIcon>
              <CallIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Story Call</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            if (menuBook?.id) navigate(`/books/${menuBook.id}`)
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
          <ListItemText>Make a PDF</ListItemText>
        </MenuItem>
        {/* Add to catalog (FEAT-82) — parent-only, finished books only (§6). */}
        {(() => {
          // Its own existing lookup and dialog, unchanged — renamed only so it
          // does not shadow the read-door gate above.
          const catalogCandidate = sortedBooks.find((b) => b.id === menuBookId)
          if (!catalogCandidate || !canPromoteBook(catalogCandidate, isParent)) return null
          const inCatalog = isSourceInCatalog(catalogProducts, {
            kind: 'book',
            id: catalogCandidate.id ?? '',
          })
          return (
            <MenuItem
              disabled={inCatalog}
              onClick={() => {
                setMenuAnchor(null)
                setPromoteBook(catalogCandidate)
                setMenuBookId(null)
              }}
            >
              <ListItemIcon>
                <StorefrontIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{inCatalog ? 'In catalog' : 'Add to catalog'}</ListItemText>
            </MenuItem>
          )
        })()}
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

      {/* Promote-to-catalog dialog (FEAT-82) — read-only of the book; writes
          only a CatalogProduct via useCatalogProducts.createProduct. */}
      <CatalogPromoteDialog
        initial={promoteBook ? bookToCatalogInitial(promoteBook, allChildren) : null}
        onClose={() => setPromoteBook(null)}
      />

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

      {/* Print: skipped-image notice */}
      <Snackbar
        open={!!printSkipNotice}
        autoHideDuration={8000}
        onClose={() => setPrintSkipNotice(null)}
      >
        <Alert severity="warning" onClose={() => setPrintSkipNotice(null)} sx={{ width: '100%' }}>
          {printSkipNotice}
        </Alert>
      </Snackbar>

      {/* The one "Make a book" door (FEAT-187 / UX-102): a choice step, then
          whichever way the person picked. */}
      <Dialog open={showNewDialog} onClose={handleCloseNewDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{MAKE_BOOK_DOOR_TITLE}</DialogTitle>
        <DialogContent>
          {/* The choice: one verb each, one line saying what happens next. The
              wording is audience-gated on capability (FEAT-178), never a name;
              the kid copy is held to the shared readability bar in
              `makeBookDoor.test.ts`. */}
          {dialogChoice === null && (
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              {makeBookChoices(isParent ? 'parent' : 'kid').map((choice) => (
                <Box
                  key={choice.id}
                  component="button"
                  type="button"
                  data-testid={`make-book-choice-${choice.id}`}
                  onClick={() => setDialogChoice(choice.id)}
                  sx={{
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                    p: 2,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'transparent',
                    cursor: 'pointer',
                    minHeight: 72,
                    width: '100%',
                    '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
                  }}
                >
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {choice.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {choice.next}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}

          {/* Write it myself — a blank book, straight into the editor. */}
          {dialogChoice === MakeBookChoice.Myself && (
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

          {/* Make one with Shelly — the Generate chat (FEAT-169 → 176), the one
              AI path. The Story Guide link that used to sit above it retired
              with the wizard (FEAT-187): it was a competing generator, not a
              sub-mode of this one. */}
          {dialogChoice === MakeBookChoice.WithShelly && (
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <BookGenerateChat
                resumeBookId={resumeBookId}
                onCommit={(bookId) => {
                  handleCloseNewDialog()
                  // Kid-generated books auto-open the Per-Page Review
                  // (design §9 Q1); Shelly lands in the editor and uses the
                  // on-demand "Read it to me 🎧" button instead.
                  navigate(isParent ? `/books/${bookId}` : `/books/${bookId}/review`)
                }}
                onAbandon={handleCloseNewDialog}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {dialogChoice === MakeBookChoice.Myself ? (
            <>
              {/* A way back to the other choice — the door is a question, and a
                  question you cannot re-answer is a trap. */}
              <Button onClick={() => setDialogChoice(null)} sx={{ mr: 'auto' }}>
                ← Back
              </Button>
              <Button onClick={handleCloseNewDialog}>Cancel</Button>
              <Button
                variant="contained"
                onClick={() => {
                  void handleCreateBook()
                }}
                disabled={!newTitle.trim() || creating}
              >
                {creating ? 'Making…' : 'Make it'}
              </Button>
            </>
          ) : null}
        </DialogActions>
      </Dialog>
    </Page>
  )
}
