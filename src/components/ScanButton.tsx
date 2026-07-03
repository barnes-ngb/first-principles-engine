import { useCallback, useRef } from 'react'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary'

interface ScanButtonProps {
  /** Called with a single selected image file (single-photo surfaces). */
  onCapture?: (file: File) => void
  /**
   * Multiple mode only. Called with every selected file so the caller can
   * append them to a staging list. The gallery can select N at once; the
   * camera still returns one shot at a time (each call appends one).
   */
  onCaptureFiles?: (files: File[]) => void
  /** Show spinner while scanning. */
  loading?: boolean
  /** Render as a small icon button (for inline use in checklists). */
  variant?: 'icon' | 'button'
  /**
   * Opt-in multi-capture (Curriculum tab). The gallery input accepts multiple
   * files; the camera stays one-at-a-time. Requires `onCaptureFiles`. The other
   * scan surfaces omit this and keep the single `onCapture` behavior unchanged.
   */
  multiple?: boolean
}

export default function ScanButton({
  onCapture,
  onCaptureFiles,
  loading,
  variant = 'button',
  multiple = false,
}: ScanButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      if (list && list.length > 0) {
        if (multiple && onCaptureFiles) {
          onCaptureFiles(Array.from(list))
        } else {
          onCapture?.(list[0])
        }
      }
      // Reset so the same file can be re-selected
      e.target.value = ''
    },
    [multiple, onCapture, onCaptureFiles],
  )

  return (
    <>
      {/* Gallery input (no capture attribute). Accepts multiple in multi mode. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      {/* Camera input (capture attribute forces camera) */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      {variant === 'icon' ? (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation()
            cameraRef.current?.click()
          }}
          disabled={loading}
          sx={{ p: 0.5 }}
          aria-label="Scan workbook page"
        >
          {loading ? <CircularProgress size={18} /> : <PhotoCameraIcon fontSize="small" />}
        </IconButton>
      ) : (
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={loading ? <CircularProgress size={18} /> : <PhotoCameraIcon />}
            onClick={() => cameraRef.current?.click()}
            disabled={loading}
            sx={{ height: 48 }}
          >
            {loading ? 'Scanning...' : multiple ? 'Add Page' : 'Take Photo'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<PhotoLibraryIcon />}
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            sx={{ height: 48 }}
          >
            {multiple ? 'Add Pages' : 'From Photos'}
          </Button>
        </Stack>
      )}
    </>
  )
}
