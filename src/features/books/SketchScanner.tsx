import { useState, useCallback, useRef } from 'react'
import { addDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import UploadIcon from '@mui/icons-material/Upload'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { stickerLibraryCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { useAI } from '../../core/ai/useAI'
import CropIcon from '@mui/icons-material/Crop'
import {
  cleanSketchBackground,
  DEFAULT_BORDER_INSET_FRACTION,
  WHOLE_IMAGE_BORDER_INSET_FRACTION,
} from './cleanSketch'
import SketchCropStage from './SketchCropStage'
import { cropImageToRegion, type CropFraction } from './cropImage'
import { CHECKERBOARD_BG } from './DrawingChoiceDialog'
import { STICKER_TAGS_ORDERED, suggestTagsFromPrompt } from './stickerTagging'
import { useStickerLabel } from './useStickerLabel'
import {
  FANCY_STYLE_OPTIONS,
  DEFAULT_FANCY_STYLE_ID,
  resolveFancyEnhanceParams,
} from './drawingStickerStyles'
import { ART_QUOTA_MESSAGE } from '../business/useArtQuota'
import { recordStickerArtGeneration } from './useStickerArtQuota'
import { StickerCategory } from '../../core/types/enums'
import type { Sticker, StickerTag } from '../../core/types'
import { STICKER_TAG_LABELS } from '../../core/types'

interface SketchScannerProps {
  open: boolean
  onClose: () => void
  familyId: string
  /** Pre-selects the "For" target on the tagging step. */
  childProfile?: 'lincoln' | 'london'
  /** Used for the default sticker label. */
  childName?: string
  /** Fired after each sticker (raw cleaned or fancy) is saved to the library. */
  onSaved?: () => void
  /**
   * The actor has spent today's art budget (FEAT-166). "Make it fancy" is the
   * fourth paid door on the Stickers page and the most-tapped one — this flow's
   * whole invitation is "try another style", and every tap is a real
   * `enhanceSketch` call. At the cap the style controls swap for the same warm
   * nudge the other three doors show. Defaults to uncapped, so any other mount
   * of this dialog (and every parent path) is unchanged.
   */
  capReached?: boolean
  /** Count one paid transform against the day's counter (FEAT-166). */
  recordGeneration?: () => Promise<void>
}

type Stage = 'capture' | 'crop' | 'cleaning' | 'preview'

/** Default crop box — slightly inset to nudge trimming paper edges, but the
 *  whole image is one tap away ("Use whole image"). */
const DEFAULT_CROP: CropFraction = { x: 0.06, y: 0.06, width: 0.88, height: 0.88 }
type PreviewTab = 'original' | 'cleaned' | 'fancy'
type SaveVersion = 'cleaned' | 'fancy'

/** Upload a file to Firebase Storage and return { url, storagePath }. */
async function uploadToStorage(familyId: string, file: File, subfolder: string) {
  const ts = Date.now()
  const path = `families/${familyId}/${subfolder}/${ts}_${file.name}`
  const storageRef = ref(storage, path)
  const snap = await uploadBytes(storageRef, file)
  const url = await getDownloadURL(snap.ref)
  return { url, storagePath: path }
}

/**
 * Drawing → sticker studio (FEAT-33 slice 2). Standalone — no open book/page.
 * A kid captures or uploads a drawing → it's cleaned to a transparent sticker →
 * optionally a style picker transforms it into a polished version → the raw
 * cleaned sticker and/or the fancy one can be saved to the library (the two
 * product lines per drawing). Tagging is shared with the rest of the sticker
 * UIs via `stickerTagging.ts`.
 */
export default function SketchScanner({
  open,
  onClose,
  familyId,
  childProfile,
  childName,
  onSaved,
  capReached = false,
  recordGeneration,
}: SketchScannerProps) {
  // The active child can resolve *after* this dialog mounts with its page, so
  // the default label follows `childName` until the kid types their own — a
  // plain useState initializer froze it at "My drawing" (FEAT-160).
  const { label, setLabel, resetLabel, defaultLabel } = useStickerLabel(childName)

  const [stage, setStage] = useState<Stage>('capture')
  const [previewTab, setPreviewTab] = useState<PreviewTab>('cleaned')

  // Original + cleaned versions
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [originalStoragePath, setOriginalStoragePath] = useState<string | null>(null)
  const [cleanedFile, setCleanedFile] = useState<File | null>(null)
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null)

  // Manual crop (between capture and cleaning) — fractions of the captured image.
  const [cropFraction, setCropFraction] = useState<CropFraction>(DEFAULT_CROP)

  // Fancy (theme-transformed) version
  const [styleId, setStyleId] = useState<string>(DEFAULT_FANCY_STYLE_ID)
  const [fancyUrl, setFancyUrl] = useState<string | null>(null)
  const [fancyStoragePath, setFancyStoragePath] = useState<string | null>(null)
  const [enhancing, setEnhancing] = useState(false)
  const [enhanceError, setEnhanceError] = useState<string | null>(null)

  // Shared tagging (applies to whichever version is saved)
  const [tags, setTags] = useState<StickerTag[]>([])
  const [profile, setProfile] = useState<'lincoln' | 'london' | 'both'>(childProfile ?? 'both')

  // Save state
  const [savingVersion, setSavingVersion] = useState<SaveVersion | null>(null)
  const [savedVersions, setSavedVersions] = useState<Set<SaveVersion>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  // Group key shared by every version saved from one drawing (the cleaned
  // original + any fancy versions). Minted when a new drawing is captured.
  const sourceDrawingIdRef = useRef<string | null>(null)
  const { enhanceSketch } = useAI()

  const reset = useCallback(() => {
    setStage('capture')
    setPreviewTab('cleaned')
    setOriginalFile(null)
    setOriginalUrl(null)
    setOriginalStoragePath(null)
    setCleanedFile(null)
    setCleanedUrl(null)
    setCropFraction(DEFAULT_CROP)
    setStyleId(DEFAULT_FANCY_STYLE_ID)
    setFancyUrl(null)
    setFancyStoragePath(null)
    setEnhancing(false)
    setEnhanceError(null)
    resetLabel()
    setTags([])
    setProfile(childProfile ?? 'both')
    setSavingVersion(null)
    setSavedVersions(new Set())
    setError(null)
    sourceDrawingIdRef.current = null
  }, [resetLabel, childProfile])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      // Allow re-selecting the same file later.
      e.target.value = ''
      if (!file) return

      setError(null)
      setOriginalFile(file)
      setOriginalUrl(URL.createObjectURL(file))
      // Mint a fresh group key for this drawing — the cleaned original and any
      // fancy versions saved from it all share it (FEAT-33 slice 3).
      sourceDrawingIdRef.current = crypto.randomUUID()
      // Pick a region first (skippable), then make it transparent.
      setCropFraction(DEFAULT_CROP)
      setStage('crop')
    },
    [],
  )

  // Transparent cleanup → preview. Shared by both crop paths (cropped + whole).
  // `fromCrop` says whether the parent already trimmed the surround: if they did,
  // the file *is* the chosen region and a small inset is enough; on "use whole
  // image" the outermost pixels are most likely table or carpet, so the
  // background ring is pulled further in (FEAT-159).
  const runClean = useCallback(
    async (file: File, fromCrop: boolean) => {
      setStage('cleaning')
      setError(null)
      try {
        const cleaned = await cleanSketchBackground(file, {
          borderInsetFraction: fromCrop
            ? DEFAULT_BORDER_INSET_FRACTION
            : WHOLE_IMAGE_BORDER_INSET_FRACTION,
        })
        setCleanedFile(cleaned)
        setCleanedUrl(URL.createObjectURL(cleaned))
        // Seed tags from the default label so saving is one tap if they don't edit.
        setTags(suggestTagsFromPrompt(defaultLabel))
        setStage('preview')
        setPreviewTab('cleaned')
      } catch {
        setError('Failed to process image. Please try again.')
        setStage('capture')
      }
    },
    [defaultLabel],
  )

  // "Use whole image" — keeps today's behavior (clean the full capture).
  const handleUseWholeImage = useCallback(() => {
    if (originalFile) void runClean(originalFile, false)
  }, [originalFile, runClean])

  // "Use this" — crop to the selected box, then clean. The cropped image
  // becomes the working original so the Original tab and "Make it fancy"
  // transform both operate on the chosen region.
  const handleConfirmCrop = useCallback(async () => {
    if (!originalFile) return
    try {
      const cropped = await cropImageToRegion(originalFile, cropFraction)
      setOriginalFile(cropped)
      setOriginalUrl(URL.createObjectURL(cropped))
      // Force a re-upload of the cropped original if a fancy transform is requested.
      setOriginalStoragePath(null)
      await runClean(cropped, true)
    } catch {
      setError('Failed to crop image. Please try again.')
    }
  }, [originalFile, cropFraction, runClean])

  // Upload original to storage (lazy — only when the transform is first requested).
  const ensureOriginalUploaded = useCallback(async (): Promise<string | null> => {
    if (originalStoragePath) return originalStoragePath
    if (!originalFile) return null
    try {
      const { storagePath } = await uploadToStorage(familyId, originalFile, 'sketches')
      setOriginalStoragePath(storagePath)
      return storagePath
    } catch {
      return null
    }
  }, [originalFile, originalStoragePath, familyId])

  const handleMakeFancy = useCallback(async () => {
    // At the cap the paid call never goes out (FEAT-166) — and neither does the
    // Storage upload behind it: the guard sits ahead of `ensureOriginalUploaded`
    // so a capped tap costs nothing at all. The style controls already show the
    // nudge instead of a button; this holds the rule for real.
    if (enhancing || capReached) return
    setEnhancing(true)
    setEnhanceError(null)
    setPreviewTab('fancy')

    try {
      const storagePath = await ensureOriginalUploaded()
      if (!storagePath) {
        setEnhanceError('Failed to upload drawing. Please try again.')
        return
      }

      const result = await enhanceSketch({
        familyId,
        sketchStoragePath: storagePath,
        ...resolveFancyEnhanceParams(styleId),
      })

      if (result?.url) {
        setFancyUrl(result.url)
        setFancyStoragePath(result.storagePath)
        // A real image came back: count the paid call (FEAT-166). A redo with
        // another style counts again — each is another real call.
        //
        // Deliberately NOT awaited (Codex P2, PR #1717). The wrapper swallows a
        // rejection, but nothing can bound a promise that never *settles* — and
        // a Firestore write resolves only on server ack, so offline it stays
        // pending indefinitely rather than failing. Awaited, that left
        // `enhancing` true forever (the `finally` never ran): the spinner sat on
        // top of an image the kid had already paid for, and the Save button
        // never came back. Failing open has to mean the art does not wait on the
        // counter at all, not merely that a *thrown* counter is ignored.
        //
        // FEAT-167 moved that discipline into the wrapper itself — it returns
        // `void` now, so the `void` operator here would be meaningless.
        recordStickerArtGeneration(recordGeneration)
        // A fresh transform replaces any previously-saved fancy version.
        setSavedVersions((prev) => {
          if (!prev.has('fancy')) return prev
          const next = new Set(prev)
          next.delete('fancy')
          return next
        })
      } else {
        setEnhanceError('Transform returned no image. Please try again.')
      }
    } catch (err) {
      setEnhanceError(err instanceof Error ? err.message : 'Transform failed')
    } finally {
      setEnhancing(false)
    }
  }, [
    enhancing,
    capReached,
    ensureOriginalUploaded,
    enhanceSketch,
    familyId,
    styleId,
    recordGeneration,
  ])

  const saveSticker = useCallback(
    async (version: SaveVersion) => {
      const url = version === 'cleaned' ? cleanedUrl : fancyUrl
      if (savingVersion || savedVersions.has(version)) return

      setSavingVersion(version)
      setError(null)
      try {
        let saveUrl = url
        let savePath: string

        if (version === 'cleaned') {
          if (!cleanedFile) return
          const uploaded = await uploadToStorage(familyId, cleanedFile, 'stickers')
          saveUrl = uploaded.url
          savePath = uploaded.storagePath
        } else {
          if (!fancyUrl || !fancyStoragePath) return
          savePath = fancyStoragePath
        }

        if (!saveUrl) return

        const newSticker: Omit<Sticker, 'id'> = {
          url: saveUrl,
          storagePath: savePath,
          label: label.trim() || defaultLabel,
          category: StickerCategory.Custom,
          childId: null,
          createdAt: new Date().toISOString(),
          tags: tags.length ? tags : ['object'],
          childProfile: profile,
          // Link this version to its source drawing (FEAT-33 slice 3). The
          // cleaned version is the original group anchor; the fancy version
          // records which theme/style it is.
          ...(sourceDrawingIdRef.current
            ? { sourceDrawingId: sourceDrawingIdRef.current }
            : {}),
          ...(version === 'cleaned' ? { isOriginal: true } : { theme: styleId }),
        }
        await addDoc(stickerLibraryCollection(familyId), newSticker as Sticker)
        setSavedVersions((prev) => new Set(prev).add(version))
        onSaved?.()
      } catch {
        setError('Failed to save sticker. Please try again.')
      } finally {
        setSavingVersion(null)
      }
    },
    [
      cleanedUrl,
      fancyUrl,
      fancyStoragePath,
      cleanedFile,
      savingVersion,
      savedVersions,
      familyId,
      label,
      defaultLabel,
      tags,
      profile,
      styleId,
      onSaved,
    ],
  )

  const toggleTag = useCallback((tag: StickerTag) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }, [])

  const showTransparencyBg = previewTab === 'cleaned' || previewTab === 'fancy'
  const anySaved = savedVersions.size > 0

  // The contextual save target for the footer (Original is reference-only).
  const saveTarget: SaveVersion | null =
    previewTab === 'cleaned' ? 'cleaned' : previewTab === 'fancy' ? 'fancy' : null
  const saveTargetReady =
    saveTarget === 'cleaned' ? !!cleanedFile : saveTarget === 'fancy' ? !!fancyUrl : false

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>From a Drawing</DialogTitle>

      <DialogContent>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {/* Capture stage */}
        {stage === 'capture' && (
          <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
            <Button
              variant="outlined"
              size="large"
              startIcon={<CameraAltIcon />}
              onClick={() => cameraInputRef.current?.click()}
              sx={{ py: 2, px: 4, fontSize: '1.1rem', minWidth: 260 }}
            >
              Take Photo of Drawing
            </Button>
            <Button
              variant="text"
              startIcon={<UploadIcon />}
              onClick={() => fileInputRef.current?.click()}
              sx={{ textTransform: 'none' }}
            >
              Upload a picture
            </Button>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Photograph or upload a drawing to turn it into a sticker
            </Typography>
          </Stack>
        )}

        {/* Crop stage — pick the region before the transparent cleanup */}
        {stage === 'crop' && originalUrl && (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 1 }}>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Drag the box to pick what becomes the sticker — or use the whole picture.
            </Typography>
            <SketchCropStage
              imageUrl={originalUrl}
              value={cropFraction}
              onChange={setCropFraction}
            />
          </Stack>
        )}

        {/* Cleaning stage */}
        {stage === 'cleaning' && (
          <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
            <CircularProgress />
            <Typography>Removing the background...</Typography>
          </Stack>
        )}

        {/* Preview stage */}
        {stage === 'preview' && (
          <Stack spacing={2}>
            {/* Tab selector: Original | Cleaned | Fancy */}
            <Tabs
              value={previewTab}
              onChange={(_, v: PreviewTab) => setPreviewTab(v)}
              variant="fullWidth"
              sx={{ minHeight: 36 }}
            >
              <Tab label="Original" value="original" sx={{ minHeight: 36, py: 0.5 }} />
              <Tab
                label={savedVersions.has('cleaned') ? 'Cleaned ✓' : 'Cleaned'}
                value="cleaned"
                sx={{ minHeight: 36, py: 0.5 }}
              />
              <Tab
                label={savedVersions.has('fancy') ? 'Fancy ✓' : 'Fancy'}
                value="fancy"
                icon={<AutoAwesomeIcon sx={{ fontSize: 16 }} />}
                iconPosition="start"
                sx={{ minHeight: 36, py: 0.5 }}
              />
            </Tabs>

            {/* Image preview */}
            <Box
              sx={{
                width: '100%',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
                minHeight: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...(showTransparencyBg && { background: CHECKERBOARD_BG }),
              }}
            >
              {previewTab === 'original' && originalUrl && (
                <Box
                  component="img"
                  src={originalUrl}
                  alt="Original drawing"
                  sx={{ width: '100%', display: 'block' }}
                />
              )}

              {previewTab === 'cleaned' && cleanedUrl && (
                <Box
                  component="img"
                  src={cleanedUrl}
                  alt="Cleaned drawing"
                  sx={{ width: '100%', display: 'block' }}
                />
              )}

              {previewTab === 'fancy' && (
                <>
                  {enhancing && (
                    <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
                      <CircularProgress size={32} />
                      <Typography variant="body2" color="text.secondary">
                        Making it fancy...
                      </Typography>
                    </Stack>
                  )}
                  {!enhancing && fancyUrl && (
                    <Box
                      component="img"
                      src={fancyUrl}
                      alt="Fancy version"
                      sx={{ width: '100%', display: 'block' }}
                    />
                  )}
                  {!enhancing && !fancyUrl && (
                    <Stack alignItems="center" spacing={1.5} sx={{ py: 3, px: 2, width: '100%' }}>
                      {capReached ? (
                        /* Daily cap reached (FEAT-166): the same warm nudge the
                           other three sticker doors show — no style picker, no
                           button, no error styling, no lock. The cleaned sticker
                           they already made stays saveable. */
                        <Typography variant="body2" color="text.secondary" textAlign="center">
                          {ART_QUOTA_MESSAGE}
                        </Typography>
                      ) : (
                        <>
                          <Typography variant="body2" color="text.secondary" textAlign="center">
                            Pick a style, then make a polished version of the drawing.
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'center' }}>
                            {FANCY_STYLE_OPTIONS.map((option) => (
                              <Chip
                                key={option.id}
                                label={`${option.emoji} ${option.label}`}
                                size="small"
                                variant={styleId === option.id ? 'filled' : 'outlined'}
                                color={styleId === option.id ? 'primary' : 'default'}
                                onClick={() => setStyleId(option.id)}
                              />
                            ))}
                          </Box>
                          <Button
                            variant="contained"
                            startIcon={<AutoAwesomeIcon />}
                            onClick={() => void handleMakeFancy()}
                            sx={{ minHeight: 44, textTransform: 'none' }}
                          >
                            Make it fancy
                          </Button>
                        </>
                      )}
                      {enhanceError && (
                        <Typography variant="body2" color="error" textAlign="center">
                          {enhanceError}
                        </Typography>
                      )}
                    </Stack>
                  )}
                </>
              )}
            </Box>

            {/* Re-style controls once a fancy version exists */}
            {previewTab === 'fancy' && fancyUrl && !enhancing && (
              <Stack spacing={1}>
                {capReached ? (
                  /* "Try another style" is the same paid call as the first one,
                     so the cap closes this door too (FEAT-166). The fancy
                     version already made stays visible and saveable. */
                  <Typography variant="body2" color="text.secondary">
                    {ART_QUOTA_MESSAGE}
                  </Typography>
                ) : (
                  <>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                      {FANCY_STYLE_OPTIONS.map((option) => (
                        <Chip
                          key={option.id}
                          label={`${option.emoji} ${option.label}`}
                          size="small"
                          variant={styleId === option.id ? 'filled' : 'outlined'}
                          color={styleId === option.id ? 'primary' : 'default'}
                          onClick={() => setStyleId(option.id)}
                        />
                      ))}
                    </Box>
                    <Button
                      size="small"
                      startIcon={<AutoAwesomeIcon />}
                      onClick={() => void handleMakeFancy()}
                      sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
                    >
                      Redo with this style
                    </Button>
                  </>
                )}
                {enhanceError && (
                  <Typography variant="body2" color="error">
                    {enhanceError}
                  </Typography>
                )}
              </Stack>
            )}

            {/* Shared tagging */}
            <TextField
              label="Sticker label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              fullWidth
              size="small"
            />

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Tags (tap to select):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {STICKER_TAGS_ORDERED.map((tag) => (
                  <Chip
                    key={tag}
                    label={STICKER_TAG_LABELS[tag]}
                    size="small"
                    variant={tags.includes(tag) ? 'filled' : 'outlined'}
                    onClick={() => toggleTag(tag)}
                  />
                ))}
              </Box>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                For:
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {(['lincoln', 'london', 'both'] as const).map((p) => (
                  <Chip
                    key={p}
                    label={p === 'both' ? 'Both' : p.charAt(0).toUpperCase() + p.slice(1)}
                    size="small"
                    variant={profile === p ? 'filled' : 'outlined'}
                    onClick={() => setProfile(p)}
                  />
                ))}
              </Box>
            </Box>

            {anySaved && (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <CheckCircleIcon color="success" sx={{ fontSize: 18 }} />
                <Typography variant="body2" color="success.main">
                  Saved to your sticker library — you can save the other version too.
                </Typography>
              </Stack>
            )}
          </Stack>
        )}

        {error && (
          <Typography color="error" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {stage === 'capture' && <Button onClick={handleClose}>Cancel</Button>}

        {stage === 'crop' && (
          <>
            <Button onClick={reset}>Retake</Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={handleUseWholeImage} sx={{ textTransform: 'none' }}>
              Use whole image
            </Button>
            <Button
              variant="contained"
              startIcon={<CropIcon />}
              onClick={() => void handleConfirmCrop()}
              sx={{ minHeight: 44, textTransform: 'none' }}
            >
              Use this
            </Button>
          </>
        )}

        {stage === 'preview' && (
          <>
            <Button onClick={reset} disabled={savingVersion !== null}>
              Retake
            </Button>
            <Box sx={{ flex: 1 }} />
            {anySaved && (
              <Button variant="outlined" onClick={handleClose} disabled={savingVersion !== null}>
                Done
              </Button>
            )}
            {saveTarget && (
              <Button
                variant="contained"
                onClick={() => void saveSticker(saveTarget)}
                disabled={
                  savingVersion !== null ||
                  !saveTargetReady ||
                  !label.trim() ||
                  savedVersions.has(saveTarget)
                }
                sx={{ minHeight: 44 }}
              >
                {savingVersion === saveTarget ? (
                  <CircularProgress size={22} color="inherit" />
                ) : savedVersions.has(saveTarget) ? (
                  'Saved ✓'
                ) : saveTarget === 'fancy' ? (
                  'Save Fancy'
                ) : (
                  'Save Cleaned'
                )}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
