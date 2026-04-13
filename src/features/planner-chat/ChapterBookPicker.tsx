import Autocomplete from '@mui/material/Autocomplete'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import type { BookProgress, ChapterBook } from '../../core/types'

export interface ChapterBookPickerProps {
  chapterBooks: ChapterBook[]
  selectedBook: ChapterBook | null
  onSelectedBookChange: (book: ChapterBook | null) => void
  bookProgress: BookProgress | null
  readAloudBook: string
  onReadAloudBookChange: (v: string) => void
  readAloudChapters: string
  onReadAloudChaptersChange: (v: string) => void
  /** 'wizard' embeds in setup form; 'card' is standalone with its own header */
  variant?: 'wizard' | 'card'
}

export default function ChapterBookPicker({
  chapterBooks,
  selectedBook,
  onSelectedBookChange,
  bookProgress,
  readAloudBook,
  onReadAloudBookChange,
  readAloudChapters,
  onReadAloudChaptersChange,
  variant = 'wizard',
}: ChapterBookPickerProps) {
  return (
    <Stack spacing={1.5}>
      {variant === 'wizard' && (
        <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          Read-Aloud This Week
        </Typography>
      )}
      <Autocomplete
        freeSolo
        size="small"
        options={chapterBooks}
        value={selectedBook ?? (readAloudBook || null)}
        getOptionLabel={(option) => {
          if (typeof option === 'string') return option
          return `${option.title} \u2014 ${option.author}`
        }}
        isOptionEqualToValue={(option, value) => {
          if (typeof option === 'string' || typeof value === 'string') return option === value
          return option.id === value.id
        }}
        renderOption={(props, option) => (
          <li {...props} key={option.id}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {option.title} &mdash; {option.author}
              </Typography>
              {bookProgress && selectedBook?.id === option.id && (
                <Chip
                  label={`${bookProgress.questionPool.filter((q) => q.answered).length}/${bookProgress.totalChapters} chapters`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
            </Stack>
          </li>
        )}
        onChange={(_, value) => {
          if (value === null) {
            onSelectedBookChange(null)
          } else if (typeof value === 'string') {
            onSelectedBookChange(null)
            onReadAloudBookChange(value)
          } else {
            onSelectedBookChange(value)
          }
        }}
        onInputChange={(_, value, reason) => {
          if (reason === 'input' && !selectedBook) {
            onReadAloudBookChange(value)
          }
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Book"
            placeholder="Search library or type a title..."
          />
        )}
        fullWidth
      />
      {selectedBook && bookProgress && (
        <Chip
          label={`${bookProgress.questionPool.filter((q) => q.answered).length}/${bookProgress.totalChapters} chapters answered`}
          size="small"
          color="primary"
          variant="outlined"
        />
      )}
      {!selectedBook && (
        <TextField
          size="small"
          label="Chapters this week"
          placeholder="e.g., Ch 5-8"
          value={readAloudChapters}
          onChange={(e) => onReadAloudChaptersChange(e.target.value)}
          fullWidth
          helperText="The AI will generate a discussion question for each chapter"
        />
      )}
    </Stack>
  )
}
