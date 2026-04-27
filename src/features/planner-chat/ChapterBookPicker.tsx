import { useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
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
import Typography from '@mui/material/Typography'
import { addDoc } from 'firebase/firestore'

import { chapterBooksCollection } from '../../core/firebase/firestore'
import type { BookProgress, ChapterBook, ChapterBookChapter } from '../../core/types'

const NONE_VALUE = '__none__'
const ADD_VALUE = '__add__'

export interface ChapterBookPickerProps {
  chapterBooks: ChapterBook[]
  selectedBook: ChapterBook | null
  onSelectedBookChange: (book: ChapterBook | null) => void
  bookProgress: BookProgress | null
  onBookAdded?: (book: ChapterBook) => void
  /** 'wizard' embeds in setup form; 'card' is standalone with its own header */
  variant?: 'wizard' | 'card'
}

export default function ChapterBookPicker({
  chapterBooks,
  selectedBook,
  onSelectedBookChange,
  bookProgress,
  onBookAdded,
  variant = 'wizard',
}: ChapterBookPickerProps) {
  const [addingOpen, setAddingOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [newChapters, setNewChapters] = useState('')
  const [newChapterTitles, setNewChapterTitles] = useState('')

  const currentValue = selectedBook ? selectedBook.id : NONE_VALUE

  const resetForm = () => {
    setNewTitle('')
    setNewAuthor('')
    setNewChapters('')
    setNewChapterTitles('')
    setSaveError(null)
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
        const t = titleLines[i]
        return t ? { number: i + 1, title: t } : { number: i + 1 }
      })

      const bookData: ChapterBook = {
        id: '',
        title,
        author,
        totalChapters,
        chapters,
        createdAt: new Date().toISOString(),
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

  return (
    <Stack spacing={1.5}>
      {variant === 'wizard' && (
        <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          Read-Aloud This Week
        </Typography>
      )}
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
            <TextField
              size="small"
              label="Title"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g., Prince Caspian"
              fullWidth
            />
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
