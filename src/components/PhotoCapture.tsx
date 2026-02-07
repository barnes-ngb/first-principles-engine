import { useCallback, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'

interface PhotoCaptureProps {
  /** Called with the captured File when the user confirms the photo. */
  onCapture: (file: File) => void
  /** If true, show a spinner to indicate upload in progress. */
  uploading?: boolean
}

export default function PhotoCapture({ onCapture, uploading }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (!selected) return
    setFile(selected)
    const objectUrl = URL.createObjectURL(selected)
    setPreview(objectUrl)
  }, [])

  const handleConfirm = useCallback(() => {
    if (!file) return
    onCapture(file)
    // Clean up preview
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [file, onCapture, preview])

  const handleCancel = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [preview])

  return (
    <Stack spacing={2}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      {!preview && (
        <Button
          variant="outlined"
          startIcon={<PhotoCameraIcon />}
          onClick={() => inputRef.current?.click()}
          sx={{ height: 56 }}
        >
          Take / Choose Photo
        </Button>
      )}
      {preview && (
        <>
          <Box
            component="img"
            src={preview}
            alt="Preview"
            sx={{
              width: '100%',
              maxHeight: 300,
              objectFit: 'contain',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
            }}
          />
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              onClick={handleConfirm}
              disabled={uploading}
              startIcon={uploading ? <CircularProgress size={18} /> : undefined}
            >
              {uploading ? 'Uploading...' : 'Use Photo'}
            </Button>
            <Button variant="outlined" onClick={handleCancel} disabled={uploading}>
              Retake
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  )
}
