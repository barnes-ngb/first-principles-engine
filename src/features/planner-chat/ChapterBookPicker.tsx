import { useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import type { SelectChangeEvent } from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { addDoc } from 'firebase/firestore'

import { ErrorState, LoadingState } from '../../components/states'
import { chapterBooksCollection } from '../../core/firebase/firestore'
import type {
  BookLookupResult,
  BookProgress,
  ChapterBook,
  ChapterBookChapter,
} from '../../core/types'

const NONE_VALUE = '__none__'
const ADD_VALUE = '__add__'

export interface ChapterBookPickerProps {
  chapterBooks: ChapterBook[]
  selectedBook: ChapterBook | null
  onSelectedBookChange: (book: ChapterBook | null) => void
  bookProgress: BookProgress | null
  onBookAdded?: (book: ChapterBook) => void
  /** 'wizard' embeds in setup form at full size; 'compact' is a slim single-row picker for review/active phases */
  variant?: 'wizard' | 'compact'
  /** True while the chapterBooks collection is loading. Disables the select and shows a loading placeholder. */
  loading?: boolean
  /** Set when the chapterBooks load failed. Falls back to a plain text input so Shelly can still type a title. */
  loadError?: boolean
  /**
   * Optional AI title lookup. When provided, a "Look it up" button appears beside
   * the Title field in the add-book form; on success the form is pre-filled (all
   * fields stay editable). Returns null/throws on failure — the form stays usable
   * for manual entry. When omitted, the button is hidden.
   */
  onLookup?: (title: string) => Promise<BookLookupResult | null>
}

export default function ChapterBookPicker({
  chapterBooks,
  selectedBook,
  onSelectedBookChange,
  bookProgress,
  onBookAdded,
  variant = 'wizard',
  loading = false,
  loadError = false,
  onLookup,
}: ChapterBookPickerProps) {
  const [addingOpen, setAddingOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [newChapters, setNewChapters] = useState('')
  const [newChapterTitles, setNewChapterTitles] = useState('')
  // Lookup ("Look it up") state
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  // Stashed lookup data not surfaced as editable fields — applied on save.
  const [lookupSummary, setLookupSummary] = useState<string | undefined>(undefined)
  const [lookupMovie, setLookupMovie] = useState<BookLookupResult['movie']>(undefined)
  const [lookupChapters, setLookupChapters] = useState<ChapterBookChapter[]>([])

  const currentValue = selectedBook ? selectedBook.id : NONE_VALUE

  const resetForm = () => {
    setNewTitle('')
    setNewAuthor('')
    setNewChapters('')
    setNewChapterTitles('')
    setSaveError(null)
    setLookupError(null)
    setLookupSummary(undefined)
    setLookupMovie(undefined)
    setLookupChapters([])
  }

  const handleLookup = async () => {
    if (!onLookup) return
    const title = newTitle.trim()
    if (!title) {
      setLookupError('Type a title first, then look it up.')
      return
    }
    setLookingUp(true)
    setLookupError(null)
    try {
      const result = await onLookup(title)
      if (!result || !result.title) {
        setLookupError("Couldn't find that book — type the details below.")
        return
      }
      // Pre-fill the editable fields (Shelly reviews + corrects before saving).
      setNewTitle(result.title)
      setNewAuthor(result.author ?? '')
      if (Number.isFinite(result.totalChapters) && result.totalChapters > 0) {
        setNewChapters(String(result.totalChapters))
      }
      const chapters = result.chapters ?? []
      if (chapters.length > 0) {
        const sorted = [...chapters].sort((a, b) => a.number - b.number)
        setNewChapterTitles(sorted.map((c) => c.title ?? '').join('\n'))
        setLookupChapters(sorted)
      } else {
        setLookupChapters([])
      }
      // Stash non-editable data for persistence on save.
      setLookupSummary(result.summary)
      setLookupMovie(result.movie)
    } catch (err) {
      console.error('Book lookup failed', err)
      setLookupError("Lookup didn't work — type the details below.")
    } finally {
      setLookingUp(false)
    }
  }

  const handleSelectChange = (e: SelectChangeEvent<string>) => {
    const value = e.target.value
    if (value === ADD_VALUE) {
      setAddingOpen(true)
      return
    }
    if (value === NONE_VALUE) {
      onSelectedBookChange(null)
      return
    }
    const match = chapterBooks.find((b) => b.id === value)
    if (match) onSelectedBookChange(match)
  }

  const handleSaveNewBook = async () => {
    const title = newTitle.trim()
    const author = newAuthor.trim()
    const totalChapters = parseInt(newChapters, 10)

    if (!title || !author || !Number.isFinite(totalChapters) || totalChapters < 1) {
      setSaveError('Title, author, and number of chapters are required.')
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      const titleLines = newChapterTitles
        .split('\n')
        .map((line) => line.trim())
      const chapters: ChapterBookChapter[] = Array.from({ length: totalChapters }, (_, i) => {
        const number = i + 1
        const looked = lookupChapters.find((c) => c.number === number)
        const chapterTitle = titleLines[i] || looked?.title
        const chapter: ChapterBookChapter = { number }
        if (chapterTitle) chapter.title = chapterTitle
        if (looked?.summary) chapter.summary = looked.summary
        return chapter
      })

      const bookData: ChapterBook = {
        id: '',
        title,
        author,
        totalChapters,
        chapters,
        createdAt: new Date().toISOString(),
        // Persist lookup-derived fields when present (Firestore rejects undefined).
        ...(lookupSummary ? { summary: lookupSummary } : {}),
        ...(lookupMovie
          ? { hasMovie: lookupMovie.exists, ...(lookupMovie.notes ? { movieNotes: lookupMovie.notes } : {}) }
          : {}),
      }

      const ref = await addDoc(chapterBooksCollection(), bookData)
      const created: ChapterBook = { ...bookData, id: ref.id }
      onBookAdded?.(created)
      onSelectedBookChange(created)
      setAddingOpen(false)
      resetForm()
    } catch (err) {
      console.error('Failed to add book', err)
      setSaveError('Could not save book. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelAdd = () => {
    setAddingOpen(false)
    resetForm()
  }

  const answeredCount = bookProgress?.questionPool.filter((q) => q.answered).length ?? 0

  // Loading: show disabled placeholder so Shelly knows the picker is coming.
  if (loading) {
    return (
      <FormControl
        fullWidth
        size="small"
        disabled
        sx={variant === 'compact' ? { maxWidth: 480 } : undefined}
      >
        <InputLabel shrink>Read-aloud book</InputLabel>
        <Select
          value=""
          displayEmpty
          notched
          label="Read-aloud book"
          renderValue={() => <LoadingState size={14} label="Loading chapter books..." />}
        >
          <MenuItem value="" />
        </Select>
      </FormControl>
    )
  }

  // Network/permission error: degrade to a plain text input so the input is still useful.
  if (loadError) {
    return (
      <Tooltip title="Couldn't load your chapter book library. Type a title to remember what you're reading.">
        <TextField
          size="small"
          label="Read-aloud book"
          placeholder="Book title"
          value={selectedBook?.title ?? ''}
          fullWidth
          sx={variant === 'compact' ? { maxWidth: 480 } : undefined}
          onChange={(e) => {
            const title = e.target.value.trim()
            if (!title) onSelectedBookChange(null)
            else onSelectedBookChange({ ...(selectedBook ?? { id: '', author: '', totalChapters: 0, chapters: [], createdAt: '' }), title })
          }}
        />
      </Tooltip>
    )
  }

  const isEmpty = chapterBooks.length === 0
  const selectControl = (
    <FormControl fullWidth size="small">
      <InputLabel id="chapter-book-picker-label">Read-aloud book</InputLabel>
      <Select
        labelId="chapter-book-picker-label"
        label="Read-aloud book"
        value={currentValue}
        onChange={handleSelectChange}
        displayEmpty
        renderValue={(value) => {
          if (value === NONE_VALUE) return <em>None — no read-aloud this week</em>
          const book = chapterBooks.find((b) => b.id === value)
          if (!book) return <em>Select a book from your library...</em>
          return `${book.title} — ${book.author}`
        }}
      >
        <MenuItem value={NONE_VALUE}>
          <em>None — no read-aloud this week</em>
        </MenuItem>
        {chapterBooks.map((book) => (
          <MenuItem key={book.id} value={book.id}>
            <ListItemText
              primary={`${book.title} — ${book.author}`}
              secondary={
                selectedBook?.id === book.id && bookProgress
                  ? `${answeredCount}/${bookProgress.totalChapters} chapters done`
                  : `${book.totalChapters} chapters`
              }
            />
          </MenuItem>
        ))}
        <MenuItem value={ADD_VALUE} sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 0.5 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'primary.main' }}>
            <AddIcon fontSize="small" />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Add a new book
            </Typography>
          </Stack>
        </MenuItem>
      </Select>
    </FormControl>
  )

  return (
    <Stack spacing={1.5} sx={variant === 'compact' ? { maxWidth: 480 } : undefined}>
      {variant === 'wizard' && (
        <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          Read-Aloud This Week
        </Typography>
      )}
      {isEmpty ? (
        <Tooltip title="No chapter books yet — add one with the menu below." placement="top">
          {selectControl}
        </Tooltip>
      ) : (
        selectControl
      )}

      {selectedBook && bookProgress && (
        <Chip
          label={`${answeredCount}/${bookProgress.totalChapters} chapters answered`}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ alignSelf: 'flex-start' }}
        />
      )}

      {addingOpen && (
        <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: 'grey.50' }}>
          <Typography variant="subtitle2" gutterBottom>
            Add a new book to your library
          </Typography>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <TextField
                size="small"
                label="Title"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Prince Caspian"
                fullWidth
              />
              {onLookup && (
                <Tooltip title="Use AI to fill in the author, chapter count, and summary from the title.">
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={handleLookup}
                      disabled={lookingUp || saving || !newTitle.trim()}
                      startIcon={lookingUp ? <CircularProgress size={14} /> : <SearchIcon fontSize="small" />}
                      sx={{ whiteSpace: 'nowrap', mt: 0.25 }}
                    >
                      {lookingUp ? 'Looking...' : 'Look it up'}
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Stack>
            {lookingUp && <LoadingState size={16} label="Looking up book details..." />}
            {lookupError && <ErrorState message={lookupError} />}
            <TextField
              size="small"
              label="Author"
              required
              value={newAuthor}
              onChange={(e) => setNewAuthor(e.target.value)}
              placeholder="e.g., C.S. Lewis"
              fullWidth
            />
            <TextField
              size="small"
              label="Number of chapters"
              required
              type="number"
              slotProps={{ htmlInput: { min: 1, max: 100 } }}
              value={newChapters}
              onChange={(e) => setNewChapters(e.target.value)}
              placeholder="e.g., 15"
              fullWidth
            />
            <TextField
              size="small"
              label="Chapter titles (optional, one per line)"
              value={newChapterTitles}
              onChange={(e) => setNewChapterTitles(e.target.value)}
              placeholder={'The Island\nThe Ancient Treasure House\n...'}
              multiline
              rows={3}
              fullWidth
              helperText="You can leave this blank — questions still generate for each chapter number."
            />
            {saveError && (
              <Typography variant="caption" color="error">
                {saveError}
              </Typography>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button size="small" onClick={handleCancelAdd} disabled={saving}>
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleSaveNewBook}
                disabled={saving}
                startIcon={saving ? <CircularProgress size={14} /> : null}
              >
                {saving ? 'Saving...' : 'Save book'}
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
    </Stack>
  )
}
