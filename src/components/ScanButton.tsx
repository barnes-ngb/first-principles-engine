import { useCallback, useRef } from 'react'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import CircularProgress from '@mui/material/CircularProgress'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'

interface ScanButtonProps {
  /** Called with the selected image file. */
  onCapture: (file: File) => void
  /** Show spinner while scanning. */
  loading?: boolean
  /** Render as a small icon button (for inline use in checklists). */
  variant?: 'icon' | 'button'
}

export default function ScanButton({ onCapture, loading, variant = 'button' }: ScanButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onCapture(file)
      // Reset so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = ''
    },
    [onCapture],
  )

  const triggerInput = useCallback(() => {
    inputRef.current?.click()
  }, [])

  return (
    <>
      <input
        ref={inputRef}
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
            triggerInput()
          }}
          disabled={loading}
          sx={{ p: 0.5 }}
          aria-label="Scan workbook page"
        >
          {loading ? <CircularProgress size={18} /> : <PhotoCameraIcon fontSize="small" />}
        </IconButton>
      ) : (
        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={18} /> : <PhotoCameraIcon />}
          onClick={triggerInput}
          disabled={loading}
          sx={{ height: 48 }}
        >
          {loading ? 'Scanning...' : 'Scan Page'}
        </Button>
      )}
    </>
  )
}
