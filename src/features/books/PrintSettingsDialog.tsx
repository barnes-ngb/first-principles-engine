import { useState } from 'react'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

export interface PrintSettings {
  pageSize: 'letter' | 'half-letter' | 'a4' | 'booklet' | 'mini-5x7' | 'square-6'
  background: 'white' | 'cream' | 'dark'
  sightWordStyle: 'highlighted' | 'bold' | 'plain'
  quality: 'standard' | 'product'
  trimMarks: boolean
  includeCover: boolean
  includePageNumbers: boolean
  includeAuthor: boolean
  includeBackCover: boolean
}

const DEFAULT_SETTINGS: PrintSettings = {
  pageSize: 'half-letter',
  background: 'white',
  sightWordStyle: 'highlighted',
  quality: 'standard',
  trimMarks: false,
  includeCover: true,
  includePageNumbers: true,
  includeAuthor: true,
  includeBackCover: false,
}

interface PrintSettingsDialogProps {
  open: boolean
  onClose: () => void
  onPrint: (settings: PrintSettings) => void
  hasSightWords: boolean
}

export default function PrintSettingsDialog({
  open,
  onClose,
  onPrint,
  hasSightWords,
}: PrintSettingsDialogProps) {
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_SETTINGS)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Print Book</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          {/* Format / page size */}
          <div>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Format
            </Typography>
            <ToggleButtonGroup
              value={settings.pageSize}
              exclusive
              onChange={(_, val) => {
                if (val) setSettings((s) => ({ ...s, pageSize: val }))
              }}
              size="small"
              sx={{ flexWrap: 'wrap' }}
            >
              <ToggleButton value="letter" sx={{ textTransform: 'none' }}>
                Full page (8.5x11)
              </ToggleButton>
              <ToggleButton value="half-letter" sx={{ textTransform: 'none' }}>
                Mini-book (5.5x8.5)
              </ToggleButton>
              <ToggleButton value="booklet" sx={{ textTransform: 'none' }}>
                Booklet (fold & staple)
              </ToggleButton>
              <ToggleButton value="a4" sx={{ textTransform: 'none' }}>
                A4
              </ToggleButton>
              <ToggleButton value="mini-5x7" sx={{ textTransform: 'none' }}>
                Mini 5x7
              </ToggleButton>
              <ToggleButton value="square-6" sx={{ textTransform: 'none' }}>
                Square 6x6
              </ToggleButton>
            </ToggleButtonGroup>
            {settings.pageSize === 'half-letter' && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Print double-sided on letter paper, fold in half, staple for a mini book!
              </Typography>
            )}
            {settings.pageSize === 'booklet' && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Prints 2 pages per sheet. Fold each sheet in half, stack, and staple the edge to
                make a mini book!
              </Typography>
            )}
          </div>

          {/* Background */}
          <div>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Background
            </Typography>
            <ToggleButtonGroup
              value={settings.background}
              exclusive
              onChange={(_, val) => {
                if (val) setSettings((s) => ({ ...s, background: val }))
              }}
              size="small"
              sx={{ flexWrap: 'wrap' }}
            >
              <ToggleButton value="white" sx={{ textTransform: 'none' }}>
                White (saves ink)
              </ToggleButton>
              <ToggleButton value="cream" sx={{ textTransform: 'none' }}>
                Light cream
              </ToggleButton>
              <ToggleButton value="dark" sx={{ textTransform: 'none' }}>
                Original (app colors)
              </ToggleButton>
            </ToggleButtonGroup>
          </div>

          {/* Include options */}
          <div>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Include
            </Typography>
            <Stack>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.includeCover}
                    onChange={(_, checked) => setSettings((s) => ({ ...s, includeCover: checked }))}
                    size="small"
                  />
                }
                label="Cover page with title"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.includePageNumbers}
                    onChange={(_, checked) => setSettings((s) => ({ ...s, includePageNumbers: checked }))}
                    size="small"
                  />
                }
                label="Page numbers"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.includeAuthor}
                    onChange={(_, checked) => setSettings((s) => ({ ...s, includeAuthor: checked }))}
                    size="small"
                  />
                }
                label={`"by [child name]" on cover`}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.includeBackCover}
                    onChange={(_, checked) => setSettings((s) => ({ ...s, includeBackCover: checked }))}
                    size="small"
                  />
                }
                label="Back cover"
              />
            </Stack>
          </div>

          {/* Product Ready */}
          <div>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Quality
            </Typography>
            <Stack spacing={1}>
              <ToggleButtonGroup
                value={settings.quality}
                exclusive
                onChange={(_, val) => {
                  if (val) setSettings((s) => ({ ...s, quality: val }))
                }}
                size="small"
                sx={{ flexWrap: 'wrap' }}
              >
                <ToggleButton value="standard" sx={{ textTransform: 'none' }}>
                  Standard
                </ToggleButton>
                <ToggleButton value="product" sx={{ textTransform: 'none' }}>
                  High quality (300 DPI)
                </ToggleButton>
              </ToggleButtonGroup>
              <ToggleButtonGroup
                value={settings.trimMarks ? 'on' : 'off'}
                exclusive
                onChange={(_, val) => {
                  if (val) setSettings((s) => ({ ...s, trimMarks: val === 'on' }))
                }}
                size="small"
                sx={{ flexWrap: 'wrap' }}
              >
                <ToggleButton value="off" sx={{ textTransform: 'none' }}>
                  No trim marks
                </ToggleButton>
                <ToggleButton value="on" sx={{ textTransform: 'none' }}>
                  Trim marks (for cutting)
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            {settings.trimMarks && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Adds corner crop marks and 6mm bleed for commercial printing/cutting.
              </Typography>
            )}
          </div>

          {/* Sight words */}
          {hasSightWords && (
            <div>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Sight words
              </Typography>
              <ToggleButtonGroup
                value={settings.sightWordStyle}
                exclusive
                onChange={(_, val) => {
                  if (val) setSettings((s) => ({ ...s, sightWordStyle: val }))
                }}
                size="small"
                sx={{ flexWrap: 'wrap' }}
              >
                <ToggleButton value="highlighted" sx={{ textTransform: 'none' }}>
                  Highlighted
                </ToggleButton>
                <ToggleButton value="bold" sx={{ textTransform: 'none' }}>
                  Bold only
                </ToggleButton>
                <ToggleButton value="plain" sx={{ textTransform: 'none' }}>
                  Plain
                </ToggleButton>
              </ToggleButtonGroup>
            </div>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onPrint(settings)}>
          Download PDF
        </Button>
      </DialogActions>
    </Dialog>
  )
}
