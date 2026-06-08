import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ReplayIcon from '@mui/icons-material/Replay'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

import type { BookLookupResult, BookProgress, ChapterBook, WorkbookConfig } from '../../core/types'
import ChapterBookPicker from './ChapterBookPicker'

interface PlannerCompactSetupProps {
  childName: string
  weekRangeLabel: string
  weekEnergy: 'full' | 'lighter' | 'mvd'
  onWeekEnergyChange: (v: 'full' | 'lighter' | 'mvd') => void
  hoursPerDay: number
  chapterBooks: ChapterBook[]
  selectedBook: ChapterBook | null
  onSelectedBookChange: (book: ChapterBook | null) => void
  onBookAdded?: (book: ChapterBook) => void
  onLookupBook?: (title: string) => Promise<BookLookupResult | null>
  bookProgress: BookProgress | null
  chapterBooksLoading?: boolean
  chapterBooksLoadError?: boolean
  workbookConfigs: WorkbookConfig[]
  excludedWorkbookIds: Set<string>
  onToggleWorkbook: (id: string) => void
  onAddWorkbook?: () => void
  weekNotes: string
  onWeekNotesChange: (v: string) => void
  onGenerate: () => void
  onRepeatLastWeek: () => void
  generatingWeek: boolean
  repeatingWeek: boolean
  canRepeatLastWeek: boolean
}

export default function PlannerCompactSetup({
  childName,
  weekRangeLabel,
  weekEnergy,
  onWeekEnergyChange,
  hoursPerDay,
  chapterBooks,
  selectedBook,
  onSelectedBookChange,
  onBookAdded,
  onLookupBook,
  bookProgress,
  chapterBooksLoading,
  chapterBooksLoadError,
  workbookConfigs,
  excludedWorkbookIds,
  onToggleWorkbook,
  onAddWorkbook,
  weekNotes,
  onWeekNotesChange,
  onGenerate,
  onRepeatLastWeek,
  generatingWeek,
  repeatingWeek,
  canRepeatLastWeek,
}: PlannerCompactSetupProps) {
  const busy = generatingWeek || repeatingWeek
  return (
    <Stack
      spacing={2.5}
      sx={{
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Box>
        <Typography variant="h6">Plan {childName}&apos;s Week</Typography>
        <Typography variant="caption" color="text.secondary">
          {weekRangeLabel}
        </Typography>
      </Box>

      <Box>
        <Typography variant="subtitle2" gutterBottom>How&apos;s the week looking?</Typography>
        <ToggleButtonGroup
          value={weekEnergy}
          exclusive
          onChange={(_, v) => { if (v) onWeekEnergyChange(v) }}
          size="small"
          fullWidth
        >
          <ToggleButton value="full">Normal ({Math.round(hoursPerDay * 10) / 10}h/day)</ToggleButton>
          <ToggleButton value="lighter">Lighter</ToggleButton>
          <ToggleButton value="mvd">Tough (MVD)</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <ChapterBookPicker
        chapterBooks={chapterBooks}
        selectedBook={selectedBook}
        onSelectedBookChange={onSelectedBookChange}
        onBookAdded={onBookAdded}
        onLookup={onLookupBook}
        bookProgress={bookProgress}
        variant="wizard"
        loading={chapterBooksLoading}
        loadError={chapterBooksLoadError}
      />

      <Box>
        <Typography variant="subtitle2" gutterBottom>This week&apos;s workbooks</Typography>
        {workbookConfigs.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No workbooks configured yet.
            {onAddWorkbook && (
              <>
                {' '}
                <Button size="small" variant="text" onClick={onAddWorkbook} sx={{ p: 0, minWidth: 0, textTransform: 'none' }}>
                  Add one
                </Button>
              </>
            )}
          </Typography>
        ) : (
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {workbookConfigs.map((wb) => {
              const id = wb.id ?? wb.name
              const excluded = excludedWorkbookIds.has(id)
              const positionLabel = wb.currentPosition != null
                ? ` ${wb.unitLabel ?? 'L'} ${wb.currentPosition + 1}`
                : ''
              return (
                <Chip
                  key={id}
                  label={`${wb.name}${positionLabel}`}
                  size="small"
                  onClick={() => onToggleWorkbook(id)}
                  color={excluded ? 'default' : 'primary'}
                  variant={excluded ? 'outlined' : 'filled'}
                  sx={excluded ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}
                />
              )
            })}
            {onAddWorkbook && (
              <Chip
                label="+ Add"
                size="small"
                variant="outlined"
                onClick={onAddWorkbook}
              />
            )}
          </Stack>
        )}
      </Box>

      <TextField
        size="small"
        label="Anything special this week?"
        placeholder="Field trip Tuesday, doctor Thursday..."
        value={weekNotes}
        onChange={(e) => onWeekNotesChange(e.target.value)}
        fullWidth
        multiline
        rows={2}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button
          variant="contained"
          size="large"
          onClick={onGenerate}
          disabled={busy}
          fullWidth
          startIcon={generatingWeek ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
          sx={{ py: 1.5, fontWeight: 'bold' }}
        >
          {generatingWeek ? 'Generating...' : 'Generate Plan'}
        </Button>
        <Button
          variant="outlined"
          size="large"
          onClick={onRepeatLastWeek}
          disabled={busy || !canRepeatLastWeek}
          fullWidth
          startIcon={repeatingWeek ? <CircularProgress size={16} /> : <ReplayIcon />}
          sx={{ py: 1.5, fontWeight: 'bold' }}
        >
          {repeatingWeek ? 'Cloning...' : 'Repeat Last Week'}
        </Button>
      </Stack>
    </Stack>
  )
}
