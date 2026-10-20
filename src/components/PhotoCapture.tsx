import { useCallback, useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
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
  /**
   * Called when this component's OWN pending draft changes — a shot or upload
   * accepted, a staged photo removed, a preview retaken. Optional: a host that
   * does not pass it behaves exactly as before.
   *
   * It fires SYNCHRONOUSLY, before the compression `await`, because the point of
   * it is to let a host know a newer draft exists before any of its own async
   * work can finish and decide the form is clear-able (capture draft
   * protection, G1/G2). Submission is deliberately NOT a draft change — `Use
   * Photo`, `Save N photos` and the per-file upload path go through `onCapture`
   * / `onCaptureBatch` alone.
   */
  onDraftChange?: () => void
  /**
   * **Direct staging (FIX-267, opt-in).** When provided, a selected photo is
   * compressed and handed STRAIGHT to the host, which holds the only tray.
   * This component then keeps no pending list and offers no commit button.
   *
   * It exists because two trays cannot both be the draft. With `onCaptureBatch`
   * the host had to wait for an *Attach* tap, so a photo visible on screen was
   * not in the host's draft: the main Save wrote without it, and switching
   * child left the selection sitting in this component for the new child to
   * attach. One tray removes both states rather than guarding them.
   *
   * Takes precedence over `onCaptureBatch` and `onCapture`; every existing
   * caller, passing neither, behaves exactly as before.
   */
  onStageFiles?: (files: File[]) => void
  /**
   * Photos that could not be processed (FIX-267, opt-in, direct staging only).
   *
   * Image compression can fail — a picture the browser cannot decode, a canvas
   * that refuses to produce a blob. The selection must not simply vanish while
   * the save button stays live with no explanation, so the names come back here
   * as well as being shown on this surface.
   */
  onStageError?: (names: string[]) => void
  /**
   * Whether a selection is still being processed (FIX-267, opt-in).
   *
   * Compression is asynchronous, so between the tap and the file reaching the
   * host there is a moment when the draft is incomplete. A host that saves on
   * its own button needs to know, or it writes the log without the photo that
   * is still arriving.
   */
  onBusyChange?: (busy: boolean) => void
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
  onDraftChange,
  onStageFiles,
  onStageError,
  onBusyChange,
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

  // Direct staging wins: the host holds the only tray, so this component holds
  // no pending list and shows no commit button.
  const direct = Boolean(onStageFiles)
  // Staging mode is active whenever a batch handler is supplied.
  const staging = !direct && Boolean(onCaptureBatch)

  /** A photo this component could not process, named so it cannot vanish. */
  const [failedNames, setFailedNames] = useState<string[]>([])

  // Report processing to the host while a compression is in flight, and once
  // more on unmount so a host can never be left believing this is still busy.
  useEffect(() => {
    if (!onBusyChange) return
    onBusyChange(pendingStaging > 0)
  }, [pendingStaging, onBusyChange])

  /**
   * Liveness, restored on setup.
   *
   * StrictMode runs setup → cleanup → setup, so a flag only the cleanup wrote
   * would stay false for the real mount. The latest `onBusyChange` is kept in a
   * ref for the cleanup, which cannot read props, and that ref is assigned in an
   * effect rather than during render (`react-hooks/refs`).
   */
  const liveRef = useRef(true)
  const busyReportRef = useRef(onBusyChange)
  useEffect(() => {
    busyReportRef.current = onBusyChange
  }, [onBusyChange])
  useEffect(() => {
    liveRef.current = true
    return () => {
      liveRef.current = false
      busyReportRef.current?.(false)
    }
  }, [])

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

    // A staged shot and a preview are both drafts this component holds alone,
    // so the host hears about them here — ahead of the compression below, which
    // a host's in-flight save could otherwise outlive.
    if (direct || staging || !(multiple && files.length > 1)) onDraftChange?.()

    if (direct) {
      // Compress and hand straight over. Nothing is kept here, so there is no
      // state to leak into another child's draft and nothing on screen that the
      // host's Save does not already hold.
      setPendingStaging((n) => n + 1)
      const chosen = Array.from(files)
      const additions: File[] = []
      const failed: string[] = []
      try {
        for (const picked of chosen) {
          try {
            additions.push(await compressToJpeg(picked))
          } catch (err) {
            // A picture that cannot be processed must not disappear in silence:
            // it is named on screen and the host is told, so the rest of the
            // draft is kept and the parent chooses what to do.
            console.error('[PhotoCapture] could not process a selected photo', err)
            failed.push(picked.name || 'that photo')
          }
        }
        // A cancelled instance stages nothing and reports nothing: its late
        // result belongs to a draft that is no longer on screen.
        if (!liveRef.current) return
        if (additions.length > 0) onStageFiles?.(additions)
        if (failed.length > 0) {
          setFailedNames((prev) => [...prev, ...failed])
          onStageError?.(failed)
        }
        if (cameraInputRef.current) cameraInputRef.current.value = ''
        if (uploadInputRef.current) uploadInputRef.current.value = ''
      } finally {
        // Busy is released on every path, including the one where nothing
        // could be processed at all.
        setPendingStaging((n) => n - 1)
      }
      return
    }

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
  }, [direct, staging, multiple, onCapture, onStageFiles, onStageError, onDraftChange])

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
    if (preview || file) onDraftChange?.()
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setFile(null)
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (uploadInputRef.current) uploadInputRef.current.value = ''
  }, [preview, file, onDraftChange])

  const removeStaged = useCallback((index: number) => {
    onDraftChange?.()
    setStaged((prev) => {
      const next = [...prev]
      const [removed] = next.splice(index, 1)
      if (removed) URL.revokeObjectURL(removed.url)
      return next
    })
  }, [onDraftChange])

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

      {direct ? (
        // Direct staging: two doors, nothing held. The host renders the tray,
        // the previews and the removes, so there is exactly one of each.
        <>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              startIcon={<PhotoCameraIcon />}
              onClick={() => cameraInputRef.current?.click()}
              disabled={pendingStaging > 0}
              sx={{ minHeight: 56, flex: 1, whiteSpace: 'normal' }}
            >
              Take Photo
            </Button>
            <Button
              variant="outlined"
              startIcon={<FileUploadIcon />}
              onClick={() => uploadInputRef.current?.click()}
              disabled={pendingStaging > 0}
              sx={{ minHeight: 56, flex: 1, whiteSpace: 'normal' }}
            >
              Upload Image{multiple ? 's' : ''}
            </Button>
          </Stack>
          {pendingStaging > 0 && (
            <Stack direction="row" spacing={1} alignItems="center" role="status">
              <CircularProgress size={18} />
              <Box component="span">Processing photo…</Box>
            </Stack>
          )}
          {failedNames.length > 0 && (
            <Alert
              severity="warning"
              role="alert"
              data-testid="photo-processing-error"
              sx={{ '& .MuiAlert-message': { minWidth: 0 } }}
            >
              <Box sx={{ overflowWrap: 'anywhere' }}>
                {failedNames.length === 1
                  ? `Couldn’t process ${failedNames[0]}, so it was not attached.`
                  : `Couldn’t process ${failedNames.length} photos, so they were not attached.`}
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                {/* The three deliberate choices: try the picture again, drop it,
                    or leave it and save the rest of the draft as it stands. */}
                <Button
                  variant="outlined"
                  color="inherit"
                  size="small"
                  onClick={() => {
                    setFailedNames([])
                    uploadInputRef.current?.click()
                  }}
                  sx={{ whiteSpace: 'normal' }}
                >
                  Choose again
                </Button>
                <Button
                  variant="outlined"
                  color="inherit"
                  size="small"
                  onClick={() => setFailedNames([])}
                  sx={{ whiteSpace: 'normal' }}
                >
                  Leave it out
                </Button>
              </Stack>
            </Alert>
          )}
        </>
      ) : staging ? (
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
