import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

import type {
  ActivityConfig,
  BookProgress,
  ChapterBook,
  PhotoLabel,
  WorkbookConfig,
} from '../../core/types'
import type { ScanResult } from '../../core/types/planning'
import { ActivityFrequencyLabel } from '../../core/types/enums'
import type { ActivityFrequency } from '../../core/types/enums'
import PhotoLabelForm from './PhotoLabelForm'

type MasterySummary = {
  gotIt: string[]
  stillWorking: string[]
  needsFocus: string[]
}

interface PlannerSetupWizardProps {
  childName: string
  weekEnergy: 'full' | 'lighter' | 'mvd'
  onWeekEnergyChange: (v: 'full' | 'lighter' | 'mvd') => void
  hoursPerDay: number
  readAloudBook: string
  onReadAloudBookChange: (v: string) => void
  readAloudChapters: string
  onReadAloudChaptersChange: (v: string) => void
  chapterBooks: ChapterBook[]
  selectedBook: ChapterBook | null
  onSelectedBookChange: (book: ChapterBook | null) => void
  bookProgress: BookProgress | null
  weekNotes: string
  onWeekNotesChange: (v: string) => void
  masterySummary: MasterySummary | null
  formatSkillLabel: (tag: string) => string
  // Photo upload
  photoLabels: PhotoLabel[]
  onLabelsChange: (labels: PhotoLabel[]) => void
  onPhotoCapture: (file: File) => Promise<string | null>
  uploading: boolean
  workbookConfigs: WorkbookConfig[]
  onScanCapture: (file: File) => Promise<void>
  scanLoading: boolean
  scanResult: ScanResult | null
  scanError: string | null
  onScanClear: () => void
  onScanAccept: () => void
  // Activity configs
  activityConfigs?: ActivityConfig[]
  onViewActivities?: () => void
  // Actions
  onSubmitPhotos: () => void
  onSetupComplete: () => void
  generatingWeek: boolean
}

export default function PlannerSetupWizard({
  childName,
  weekEnergy,
  onWeekEnergyChange,
  hoursPerDay,
  readAloudBook,
  onReadAloudBookChange,
  readAloudChapters,
  onReadAloudChaptersChange,
  chapterBooks,
  selectedBook,
  onSelectedBookChange,
  bookProgress,
  weekNotes,
  onWeekNotesChange,
  masterySummary,
  formatSkillLabel,
  photoLabels,
  onLabelsChange,
  onPhotoCapture,
  uploading,
  workbookConfigs,
  onScanCapture,
  scanLoading,
  scanResult,
  scanError,
  onScanClear,
  onScanAccept,
  activityConfigs,
  onViewActivities,
  onSubmitPhotos,
  onSetupComplete,
  generatingWeek,
}: PlannerSetupWizardProps) {
  return (
    <Stack spacing={2.5} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
      <Typography variant="h6">Plan {childName}&apos;s Week</Typography>

      {/* Step 1: Energy selection */}
      <Box>
        <Typography variant="subtitle2" gutterBottom>How&apos;s this week looking?</Typography>
        <ToggleButtonGroup value={weekEnergy} exclusive onChange={(_, v) => { if (v) onWeekEnergyChange(v) }} size="small" fullWidth>
          <ToggleButton value="full">Full Week ({Math.round(hoursPerDay * 10) / 10}h/day)</ToggleButton>
          <ToggleButton value="lighter">Lighter Week</ToggleButton>
          <ToggleButton value="mvd">Tough Week (MVD)</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Step 1b: Read-aloud book picker */}
      <Stack spacing={1.5}>
        <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          Read-Aloud This Week
        </Typography>
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

      {/* Step 1c: Notes */}
      <TextField
        size="small"
        label="Anything different this week?"
        placeholder="Field trip Tuesday afternoon, doctor Thursday morning..."
        value={weekNotes}
        onChange={(e) => onWeekNotesChange(e.target.value)}
        fullWidth
        multiline
        rows={2}
      />

      {/* Activity configs summary */}
      {activityConfigs && activityConfigs.length > 0 && (
        <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {childName}&apos;s Activities
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {activityConfigs.filter((c) => !c.completed).length} active
              {activityConfigs.filter((c) => c.completed).length > 0 ? `, ${activityConfigs.filter((c) => c.completed).length} completed` : ''}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {activityConfigs
              .filter((c) => !c.completed)
              .slice(0, 8)
              .map((c) => `${c.name} (${ActivityFrequencyLabel[c.frequency as ActivityFrequency] ?? c.frequency})`)
              .join(' · ')}
            {activityConfigs.filter((c) => !c.completed).length > 8 ? ' · ...' : ''}
          </Typography>
          {onViewActivities && (
            <Button size="small" variant="text" onClick={onViewActivities} sx={{ mt: 0.5, p: 0, minWidth: 0, textTransform: 'none' }}>
              View/Edit Activities
            </Button>
          )}
        </Box>
      )}

      {/* Mastery context (read-only summary, not raw data) */}
      {masterySummary && (masterySummary.gotIt.length > 0 || masterySummary.needsFocus.length > 0 || masterySummary.stillWorking.length > 0) && (
        <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5, display: 'block' }}>
            Based on last 2 weeks
          </Typography>
          {masterySummary.gotIt.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              Got it: {masterySummary.gotIt.slice(0, 4).map(t => formatSkillLabel(t)).join(', ')}
            </Typography>
          )}
          {masterySummary.stillWorking.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              Still working: {masterySummary.stillWorking.slice(0, 4).map(t => formatSkillLabel(t)).join(', ')}
            </Typography>
          )}
          {masterySummary.needsFocus.length > 0 && (
            <Typography variant="body2" color="warning.main" fontWeight={500}>
              Needs focus: {masterySummary.needsFocus.slice(0, 4).map(t => formatSkillLabel(t)).join(', ')}
            </Typography>
          )}
        </Box>
      )}

      {/* Optional photo upload */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Upload workbook photos (optional)</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <PhotoLabelForm
            labels={photoLabels}
            onLabelsChange={onLabelsChange}
            onPhotoCapture={onPhotoCapture}
            uploading={uploading}
            workbookConfigs={workbookConfigs}
            onScanCapture={onScanCapture}
            scanLoading={scanLoading}
            scanResult={scanResult}
            scanError={scanError}
            onScanClear={onScanClear}
            onScanAccept={onScanAccept}
          />
        </AccordionDetails>
      </Accordion>

      {/* Generate button */}
      <Button
        variant="contained"
        size="large"
        onClick={photoLabels.length > 0 ? onSubmitPhotos : onSetupComplete}
        disabled={generatingWeek}
        fullWidth
        startIcon={generatingWeek ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
        sx={{ py: 1.5, fontWeight: 'bold', fontSize: '1rem' }}
      >
        {generatingWeek
          ? 'Generating your week...'
          : photoLabels.length > 0
            ? `Generate Plan (${photoLabels.length} photo${photoLabels.length > 1 ? 's' : ''})`
            : 'Generate This Week\u2019s Plan'}
      </Button>
    </Stack>
  )
}
