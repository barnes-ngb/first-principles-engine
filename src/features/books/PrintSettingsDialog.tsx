import { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

export interface PrintSettings {
  pageSize: 'letter' | 'half-letter' | 'a4' | 'booklet'
  background: 'white' | 'cream' | 'dark'
  sightWordStyle: 'highlighted' | 'bold' | 'plain'
}

const DEFAULT_SETTINGS: PrintSettings = {
  pageSize: 'letter',
  background: 'white',
  sightWordStyle: 'highlighted',
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
      <DialogTitle>Print Settings</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          {/* Page size */}
          <div>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Page size
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
                Letter (8.5x11)
              </ToggleButton>
              <ToggleButton value="half-letter" sx={{ textTransform: 'none' }}>
                Half letter
              </ToggleButton>
              <ToggleButton value="a4" sx={{ textTransform: 'none' }}>
                A4
              </ToggleButton>
              <ToggleButton value="booklet" sx={{ textTransform: 'none' }}>
                Booklet (fold & staple)
              </ToggleButton>
            </ToggleButtonGroup>
            {settings.pageSize === 'booklet' && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
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
                White
              </ToggleButton>
              <ToggleButton value="cream" sx={{ textTransform: 'none' }}>
                Cream
              </ToggleButton>
              <ToggleButton value="dark" sx={{ textTransform: 'none' }}>
                Dark (app theme)
              </ToggleButton>
            </ToggleButtonGroup>
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
          Print PDF
        </Button>
      </DialogActions>
    </Dialog>
  )
}
