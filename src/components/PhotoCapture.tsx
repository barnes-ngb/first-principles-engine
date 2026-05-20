import { useCallback, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import FileUploadIcon from '@mui/icons-material/FileUpload'

interface PhotoCaptureProps {
  /** Called with the captured File when the user confirms the photo. */
  onCapture: (file: File) => void
  /** If true, show a spinner to indicate upload in progress. */
  uploading?: boolean
  /** If true, allow selecting multiple files at once. */
  multiple?: boolean
}

export default function PhotoCapture({ onCapture, uploading, multiple }: PhotoCaptureProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    if (multiple && files.length > 1) {
      // Multiple mode: compress and send all files directly without preview
      const { compressIfNeeded } = await import('../core/utils/compressImage')
      for (let i = 0; i < files.length; i++) {
        const compressed = await compressIfNeeded(files[i])
        const compressedFile = new File(
          [compressed],
          files[i].name.replace(/\.\w+$/, '.jpg'),
          { type: 'image/jpeg' }
        )
        onCapture(compressedFile)
      }
      if (uploadInputRef.current) uploadInputRef.current.value = ''
      return
    }

    // Single file: show preview
    const selected = files[0]
    setFile(selected)
    const objectUrl = URL.createObjectURL(selected)
    setPreview(objectUrl)
  }, [multiple, onCapture])

  const handleConfirm = useCallback(async () => {
    if (!file) return
    // Compress before uploading
    const { compressIfNeeded } = await import('../core/utils/compressImage')
    const compressed = await compressIfNeeded(file)
    const compressedFile = new File(
      [compressed],
      file.name.replace(/\.\w+$/, '.jpg'),
      { type: 'image/jpeg' }
    )
    onCapture(compressedFile)
    // Clean up preview
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setFile(null)
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (uploadInputRef.current) uploadInputRef.current.value = ''
  }, [file, onCapture, preview])

  const handleCancel = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setFile(null)
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (uploadInputRef.current) uploadInputRef.current.value = ''
  }, [preview])

  return (
    <Stack spacing={2}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      {!preview && (
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            startIcon={<PhotoCameraIcon />}
            onClick={() => cameraInputRef.current?.click()}
            sx={{ height: 56, flex: 1 }}
          >
            Take Photo
          </Button>
          <Button
            variant="outlined"
            startIcon={<FileUploadIcon />}
            onClick={() => uploadInputRef.current?.click()}
            sx={{ height: 56, flex: 1 }}
          >
            Upload Image
          </Button>
        </Stack>
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
