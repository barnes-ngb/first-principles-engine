import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import CloseIcon from '@mui/icons-material/Close'

interface PhotoCaptureProps {
  /**
   * Called with a single captured File (single-photo preview flow, and per-file
   * `multiple` flow). Optional when staging multiple photos via `onCaptureBatch`.
   */
  onCapture?: (file: File) => void
  /**
   * Staging mode. When provided, repeated camera shots and multi-select uploads
   * accumulate into a pending list (thumbnails + remove) and a single Save commits
   * them all at once as ONE batch. Takes precedence over `onCapture`.
   */
  onCaptureBatch?: (files: File[]) => void
  /** If true, show a spinner to indicate upload in progress. */
  uploading?: boolean
  /** If true, allow selecting multiple files at once. */
  multiple?: boolean
}

interface StagedPhoto {
  file: File
  url: string
}

/** Compress an image file and normalize it to a `.jpg` File. */
async function compressToJpeg(file: File): Promise<File> {
  const { compressIfNeeded } = await import('../core/utils/compressImage')
  const compressed = await compressIfNeeded(file)
  return new File([compressed], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
}

export default function PhotoCapture({
  onCapture,
  onCaptureBatch,
  uploading,
  multiple,
}: PhotoCaptureProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [staged, setStaged] = useState<StagedPhoto[]>([])
  // Count of in-flight compressions. A camera shot / upload is compressed
  // asynchronously before it lands in `staged`, so Save must wait for these to
  // settle — otherwise a Save tapped mid-compression commits the stale set,
  // unmounts this component, and the late shot's setStaged is silently lost.
  const [pendingStaging, setPendingStaging] = useState(0)

  // Staging mode is active whenever a batch handler is supplied.
  const staging = Boolean(onCaptureBatch)

  // Keep a ref to the staged list so the unmount cleanup revokes the latest URLs.
  const stagedRef = useRef<StagedPhoto[]>([])
  useEffect(() => {
    stagedRef.current = staged
  }, [staged])
  useEffect(() => {
    return () => {
      stagedRef.current.forEach((p) => URL.revokeObjectURL(p.url))
    }
  }, [])

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    if (staging) {
      // Compress and stage every selected file; camera shots and multi-select
      // uploads both accumulate into the pending list. Guarded by a pending
      // counter so Save stays disabled until every shot has landed in `staged`.
      setPendingStaging((n) => n + 1)
      try {
        const additions: StagedPhoto[] = []
        for (let i = 0; i < files.length; i++) {
          const compressedFile = await compressToJpeg(files[i])
          additions.push({ file: compressedFile, url: URL.createObjectURL(compressedFile) })
        }
        setStaged((prev) => [...prev, ...additions])
        if (cameraInputRef.current) cameraInputRef.current.value = ''
        if (uploadInputRef.current) uploadInputRef.current.value = ''
      } finally {
        setPendingStaging((n) => n - 1)
      }
      return
    }

    if (multiple && files.length > 1) {
      // Per-file mode: compress and emit each file directly without preview.
      for (let i = 0; i < files.length; i++) {
        const compressedFile = await compressToJpeg(files[i])
        onCapture?.(compressedFile)
      }
      if (uploadInputRef.current) uploadInputRef.current.value = ''
      return
    }

    // Single file: show preview.
    const selected = files[0]
    setFile(selected)
    const objectUrl = URL.createObjectURL(selected)
    setPreview(objectUrl)
  }, [staging, multiple, onCapture])

  const handleConfirm = useCallback(async () => {
    if (!file) return
    const compressedFile = await compressToJpeg(file)
    onCapture?.(compressedFile)
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

  const removeStaged = useCallback((index: number) => {
    setStaged((prev) => {
      const next = [...prev]
      const [removed] = next.splice(index, 1)
      if (removed) URL.revokeObjectURL(removed.url)
      return next
    })
  }, [])

  const handleSaveStaged = useCallback(() => {
    // Don't commit while a compression is still landing in `staged` — the late
    // shot would be dropped (Save button is also disabled in this state).
    if (staged.length === 0 || pendingStaging > 0) return
    onCaptureBatch?.(staged.map((p) => p.file))
    staged.forEach((p) => URL.revokeObjectURL(p.url))
    setStaged([])
  }, [staged, onCaptureBatch, pendingStaging])

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

      {staging ? (
        <>
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
              Upload Image{multiple ? 's' : ''}
            </Button>
          </Stack>

          {staged.length > 0 && (
            <>
              <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
                {staged.map((p, i) => (
                  <Box key={p.url} sx={{ position: 'relative' }}>
                    <Box
                      component="img"
                      src={p.url}
                      alt={`Staged photo ${i + 1}`}
                      sx={{
                        width: 84,
                        height: 84,
                        objectFit: 'cover',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    />
                    <IconButton
                      size="small"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => removeStaged(i)}
                      disabled={uploading || pendingStaging > 0}
                      sx={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        bgcolor: 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                        '&:hover': { bgcolor: 'background.paper' },
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
              <Button
                variant="contained"
                onClick={handleSaveStaged}
                disabled={uploading || pendingStaging > 0}
                startIcon={uploading || pendingStaging > 0 ? <CircularProgress size={18} /> : undefined}
              >
                {uploading
                  ? 'Uploading...'
                  : pendingStaging > 0
                  ? 'Processing...'
                  : `Save ${staged.length} photo${staged.length > 1 ? 's' : ''}`}
              </Button>
            </>
          )}
        </>
      ) : (
        <>
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
        </>
      )}
    </Stack>
  )
}
