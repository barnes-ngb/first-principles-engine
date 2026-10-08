import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DownloadIcon from '@mui/icons-material/Download'
import SportsEsportsIcon from '@mui/icons-material/SportsEsports'

import type { Sticker } from '../../core/types'
import { CHECKERBOARD_BG } from './DrawingChoiceDialog'
import {
  ARCADE_ART_SIZES,
  convertToArcadeArt,
  type ArcadeArtImage,
  type ArcadeArtSize,
  type ArcadeArtSourcePixels,
} from './arcadeArt'
import {
  arcadeArtDownloadNote,
  arcadeArtFailureMessage,
  arcadeArtFileName,
  arcadeArtLoadFailureMessage,
  arcadeArtSessionKey,
  arcadeArtSource,
  ArcadeArtLoadFailure,
  ARCADE_ART_ACTUAL_HEADING,
  ARCADE_ART_ACTUAL_NOTE,
  ARCADE_ART_CLOSE_LABEL,
  ARCADE_ART_CONVERTING,
  ARCADE_ART_COPIED,
  ARCADE_ART_COPY_FAILED,
  ARCADE_ART_COPY_FALLBACK_LABEL,
  ARCADE_ART_COPY_LABEL,
  ARCADE_ART_DOWNLOAD_FAILED,
  ARCADE_ART_DOWNLOAD_LABEL,
  ARCADE_ART_INSTRUCTIONS,
  ARCADE_ART_INTRO,
  ARCADE_ART_LOADING,
  ARCADE_ART_NO_IMAGE,
  ARCADE_ART_PALETTE_NOTE,
  ARCADE_ART_PREVIEW_HEADING,
  ARCADE_ART_PREVIEW_UNAVAILABLE,
  ARCADE_ART_RETRY_LABEL,
  ARCADE_ART_SAVE_TEXT_LABEL,
  ARCADE_ART_SIZE_HINT,
  ARCADE_ART_SIZE_LABEL,
  ARCADE_ART_TITLE,
  type ArcadeArtSource,
} from './arcadeArtSession'
import {
  arcadeArtTextBlob,
  copyArcadeArtLiteral,
  downloadArcadeArtBlob,
  encodeArcadeArtPng,
  loadArcadeArtPixels,
  type ArcadeArtLoadResult,
} from './arcadeArtImage'

export interface ArcadeArtDialogProps {
  /**
   * The saved picture this session converts — the version that was actually
   * tapped in the big preview, never a group's representative or its original
   * standing in for one. `null` closes the dialog.
   */
  source: Sticker | null
  familyId: string
  /**
   * The host's actor/context identity: family, profile and the resolved child.
   * Any change REPLACES the session, so nothing in flight can then display or
   * export under an identity it did not start under.
   */
  contextKey: string
  /**
   * The host's open counter. Bumped on every open, which is what makes
   * close-and-reopen a NEW session even on the identical picture — otherwise
   * the second opening would inherit the first one's grid, error and receipt.
   */
  nonce: number
  onClose: () => void
}

/**
 * A saved sticker as MakeCode Arcade game art (FEAT-239).
 *
 * One local conversion of one saved picture: crop to what is drawn, pad to a
 * square without stretching, integrate down to a 16 × 16 or 32 × 32 grid of
 * Arcade's sixteen default colours, and offer the two things a person can
 * actually use — the image literal to paste over one in their game, and a PNG
 * at the sprite's own size.
 *
 * ## What it does not do
 *
 * **It writes nothing.** No sticker row, no sprite record, no schema, no
 * portfolio entry, no `hours`, no `xpLedger`, no skill snapshot. The saved
 * picture is read and left exactly as it was. **It spends nothing** — the
 * conversion is arithmetic, so no art quota is read and none is charged.
 *
 * ## The session, and why it is keyed
 *
 * The body is keyed on the host's context, the family, the picture's id, URL
 * and storage path, and the open counter (`arcadeArtSessionKey`). So a child /
 * profile / family switch, a row re-pointed at different bytes under the same
 * id, and a close-and-reopen each start a fresh session rather than inheriting
 * one — and every async completion is checked against `stillCurrent()` after
 * its await, so a load, an encode, a clipboard write or a download that lands
 * late can neither display nor export into a session that is gone.
 *
 * Dismissing (the button, Escape or the backdrop) goes through one path that
 * invalidates the session before it closes, so the host does not have to unmount
 * us for the guards to take effect.
 */
export default function ArcadeArtDialog({
  source,
  familyId,
  contextKey,
  nonce,
  onClose,
}: ArcadeArtDialogProps) {
  const artSource = arcadeArtSource(source)
  const sessionKey = artSource
    ? arcadeArtSessionKey({ contextKey, familyId, source: artSource, nonce })
    : 'none'

  const invalidateRef = useRef<(() => void) | null>(null)
  const registerInvalidate = useCallback((fn: (() => void) | null) => {
    invalidateRef.current = fn
  }, [])
  const handleDismiss = useCallback(() => {
    invalidateRef.current?.()
    onClose()
  }, [onClose])

  return (
    <Dialog open={!!source} onClose={handleDismiss} maxWidth="sm" fullWidth>
      <DialogTitle>{ARCADE_ART_TITLE}</DialogTitle>
      {artSource ? (
        <ArcadeArtSession
          key={sessionKey}
          source={artSource}
          registerInvalidate={registerInvalidate}
          onDismiss={handleDismiss}
        />
      ) : (
        <>
          <DialogContent>
            {source && <Typography variant="body2">{ARCADE_ART_NO_IMAGE}</Typography>}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} sx={{ minHeight: 44 }}>
              {ARCADE_ART_CLOSE_LABEL}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}

/** The converted sprite, its PNG and its preview — replaced as one value. */
interface ArcadeArtOutput {
  /** Carries its own `size`, so no label can describe a different grid. */
  image: ArcadeArtImage
  /** The native-size PNG. `null` until it is encoded, or if encoding failed. */
  blob: Blob | null
  previewUrl: string | null
}

/** Everything one session shows. One object, so there is one thing to reset. */
interface ArcadeArtView {
  size: ArcadeArtSize
  loading: boolean
  /** The picture could not be READ. Retryable, because nothing was wrong with it. */
  loadError: string | null
  /** The picture was read and cannot be converted. Retrying changes nothing. */
  convertError: string | null
  output: ArcadeArtOutput | null
  /** Converting / encoding for the selected size. */
  working: boolean
  /** A copy or a download that did not happen. The sprite is still on screen. */
  actionError: string | null
  copied: boolean
  /** The clipboard refused, so the literal is on screen to take by hand. */
  manualCopy: boolean
}

const INITIAL_VIEW: ArcadeArtView = {
  size: ARCADE_ART_SIZES[0],
  loading: true,
  loadError: null,
  convertError: null,
  output: null,
  working: false,
  actionError: null,
  copied: false,
  manualCopy: false,
}

interface ArcadeArtSessionProps {
  source: ArcadeArtSource
  registerInvalidate: (fn: (() => void) | null) => void
  onDismiss: () => void
}

/**
 * One session on one saved picture.
 *
 * ## The rails
 *
 * **Source.** The snapshot is pinned on mount and every read uses the pinned
 * copy, so a row that changes under the session cannot half-enter a handler:
 * the session is replaced (see the key on the parent), and until it is, the work
 * in flight is still about the picture it started on.
 *
 * **Session.** `stillCurrent()` is false the moment the body unmounts or the
 * session is dismissed, and it is asked after every await — so no late load,
 * encode, copy or download reaches the screen or the disk.
 *
 * **Size.** A size change clears the previous output BEFORE the new conversion
 * starts, and the output object carries the size the grid was made at. The
 * download's file name, its note and its bytes all read `output.image.size`, so
 * a file called `32x32` can never contain the 16 × 16 result.
 *
 * **Receipts.** `copied` is set only after the clipboard promise FULFILS;
 * anything else shows the selectable text instead. A failed download says
 * nothing was saved, because nothing was.
 */
function ArcadeArtSession({
  source,
  registerInvalidate,
  onDismiss,
}: ArcadeArtSessionProps) {
  const [pinnedSource] = useState(() => ({ ...source }))
  const [view, setView] = useState<ArcadeArtView>(INITIAL_VIEW)
  /** The decoded source pixels. Set once per load; the conversion key. */
  const [pixels, setPixels] = useState<ArcadeArtSourcePixels | null>(null)
  /** Bumped by "Try again" — the only thing that re-reads the picture. */
  const [loadAttempt, setLoadAttempt] = useState(0)

  const aliveRef = useRef(true)
  const dismissedRef = useRef(false)
  const stillCurrent = useCallback(
    () => aliveRef.current && !dismissedRef.current,
    [],
  )
  /**
   * Retiring the session aborts its in-flight network read as well as marking
   * it stale — a dropped result still holds a socket and a growing buffer.
   */
  const retireRef = useRef<AbortController | null>(null)
  if (!retireRef.current) retireRef.current = new AbortController()
  const retire = useCallback(() => {
    dismissedRef.current = true
    retireRef.current?.abort()
  }, [])
  // A layout cleanup, so being unmounted lands in the commit that removes the
  // body rather than in a later flush. The controller is renewed on SETUP, not
  // only created once: under StrictMode the mount effect runs
  // setup → cleanup → setup, and reusing the aborted one would leave every load
  // in development reporting a cancellation.
  useLayoutEffect(() => {
    aliveRef.current = true
    dismissedRef.current = false
    retireRef.current = new AbortController()
    return () => {
      aliveRef.current = false
      retireRef.current?.abort()
    }
  }, [])
  // Dismissing invalidates here and now, whether or not the host unmounts us.
  useLayoutEffect(() => {
    registerInvalidate(retire)
    return () => registerInvalidate(null)
  }, [registerInvalidate, retire])

  /**
   * The live preview object URL. Held in a ref as well as in state so it can be
   * released without reading state in a cleanup — an unrevoked blob URL lives
   * as long as the document.
   */
  const previewUrlRef = useRef<string | null>(null)
  const releasePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [])
  useLayoutEffect(() => releasePreview, [releasePreview])

  /** Which conversion owns the output. A later one makes an earlier one stale. */
  const convertTokenRef = useRef(0)
  /** Synchronous latches: two taps in one tick must not become two writes. */
  const copyingRef = useRef(false)
  const downloadingRef = useRef(false)

  // ── Read the picture, once per session (and once per Try again) ───────────
  useEffect(() => {
    let abandoned = false
    setView((v) => ({ ...v, loading: true, loadError: null, convertError: null }))
    void (async () => {
      let result: ArcadeArtLoadResult
      try {
        result = await loadArcadeArtPixels(pinnedSource, {
          isCurrent: () => !abandoned && stillCurrent(),
          signal: retireRef.current?.signal,
        })
      } catch {
        // The loader normalises its own failures, so this is the second belt on
        // the one outcome that must not happen: an unexpected rejection here
        // would leave `loading` true for ever — no error, no Try again, just a
        // spinner. Caught rather than trusted.
        result = { ok: false, reason: ArcadeArtLoadFailure.Unexpected }
      }
      if (abandoned || !stillCurrent()) return
      if (!result.ok) {
        // A cancelled load is a session that is gone: it reports nothing.
        if (result.reason === ArcadeArtLoadFailure.Cancelled) return
        setPixels(null)
        setView((v) => ({
          ...v,
          loading: false,
          loadError: arcadeArtLoadFailureMessage(result.reason),
        }))
        return
      }
      setPixels(result.pixels)
      setView((v) => ({ ...v, loading: false }))
    })()
    return () => {
      abandoned = true
    }
  }, [pinnedSource, stillCurrent, loadAttempt])

  // ── Convert for the selected size, then encode its PNG ───────────────────
  useEffect(() => {
    if (!pixels) return
    const token = convertTokenRef.current + 1
    convertTokenRef.current = token
    const size = view.size
    // The previous output belonged to the previous size. It goes before the new
    // one is made, so there is no moment at which a "32 × 32" control is
    // pointing at the 16 × 16 result.
    releasePreview()
    setView((v) => ({
      ...v,
      output: null,
      convertError: null,
      actionError: null,
      copied: false,
      manualCopy: false,
      working: true,
    }))

    const result = convertToArcadeArt(pixels, size)
    if (!result.ok) {
      setView((v) => ({
        ...v,
        working: false,
        convertError: arcadeArtFailureMessage(result.reason),
      }))
      return
    }
    const image = result.image
    setView((v) => ({ ...v, output: { image, blob: null, previewUrl: null } }))

    void (async () => {
      try {
        const blob = await encodeArcadeArtPng(image.indices, image.size)
        if (convertTokenRef.current !== token || !stillCurrent()) return
        const previewUrl = URL.createObjectURL(blob)
        previewUrlRef.current = previewUrl
        setView((v) => ({ ...v, output: { image, blob, previewUrl }, working: false }))
      } catch {
        if (convertTokenRef.current !== token || !stillCurrent()) return
        // The grid and its literal are fine; only the picture is missing.
        setView((v) => ({ ...v, working: false }))
      }
    })()
    // `view.size` is the only part of `view` this effect READS; the rest it
    // writes, through the updater form, so it is not a dependency.
  }, [pixels, view.size, releasePreview, stillCurrent])

  /**
   * Retire the current output, synchronously.
   *
   * Bumping the token here rather than only in the conversion effect is what
   * makes a size change take effect at the TAP: an effect runs after the commit,
   * so a clipboard or encode promise resolving in between would still have found
   * its token current and reported against a grid nobody is looking at.
   */
  const handleSize = useCallback(
    (next: ArcadeArtSize) => {
      setView((v) => {
        if (v.size === next) return v
        convertTokenRef.current += 1
        releasePreview()
        return {
          ...v,
          size: next,
          output: null,
          convertError: null,
          actionError: null,
          copied: false,
          manualCopy: false,
          // Only busy if there is actually something to convert. With no
          // pixels — a failed read — the conversion effect returns at once, so
          // a `true` here would never be cleared and would leave *Try again*
          // disabled for the rest of the session.
          working: !!pixels,
        }
      })
    },
    [pixels, releasePreview],
  )

  const handleCopy = useCallback(async () => {
    if (!stillCurrent() || copyingRef.current) return
    const image = view.output?.image
    if (!image) return
    // The conversion this copy is ABOUT, captured before the await.
    const token = convertTokenRef.current
    copyingRef.current = true
    try {
      const copied = await copyArcadeArtLiteral(image.literal)
      if (!stillCurrent()) return
      // A size change while the clipboard promise was pending means the text
      // that landed is the OLD grid's. The clipboard really does hold it, so
      // neither a "Copied" receipt nor a failure notice would be true under the
      // new size — the receipt is dropped and the new size's Copy is right there.
      if (convertTokenRef.current !== token) return
      // Only a fulfilled write earns the receipt; anything else shows the text.
      setView((v) => ({
        ...v,
        copied,
        manualCopy: !copied,
        actionError: copied ? null : ARCADE_ART_COPY_FAILED,
      }))
    } finally {
      copyingRef.current = false
    }
  }, [stillCurrent, view.output])

  const handleDownloadPng = useCallback(() => {
    if (!stillCurrent() || downloadingRef.current) return
    const output = view.output
    if (!output?.blob) {
      setView((v) => ({ ...v, actionError: ARCADE_ART_DOWNLOAD_FAILED }))
      return
    }
    downloadingRef.current = true
    try {
      // The file name's size and the bytes come from the SAME output object.
      downloadArcadeArtBlob(
        output.blob,
        arcadeArtFileName(pinnedSource.label, output.image.size, 'png'),
      )
      setView((v) => ({ ...v, actionError: null }))
    } catch {
      setView((v) => ({ ...v, actionError: ARCADE_ART_DOWNLOAD_FAILED }))
    } finally {
      downloadingRef.current = false
    }
  }, [pinnedSource.label, stillCurrent, view.output])

  const handleSaveText = useCallback(() => {
    if (!stillCurrent()) return
    const image = view.output?.image
    if (!image) return
    try {
      downloadArcadeArtBlob(
        arcadeArtTextBlob(image.literal),
        arcadeArtFileName(pinnedSource.label, image.size, 'txt'),
      )
      setView((v) => ({ ...v, actionError: null }))
    } catch {
      setView((v) => ({ ...v, actionError: ARCADE_ART_DOWNLOAD_FAILED }))
    }
  }, [pinnedSource.label, stillCurrent, view.output])

  const output = view.output
  const image = output?.image ?? null
  const busy = view.loading || view.working

  return (
    <>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {ARCADE_ART_INTRO}
          </Typography>

          {/* The exact saved picture this session is about. */}
          <Box sx={{ alignSelf: 'center', width: '100%', maxWidth: 160 }}>
            <Box
              component="img"
              src={pinnedSource.url}
              alt={pinnedSource.label || 'Saved picture'}
              sx={{
                width: '100%',
                aspectRatio: '1',
                objectFit: 'contain',
                display: 'block',
                borderRadius: 2,
                background: CHECKERBOARD_BG,
              }}
            />
          </Box>

          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              id="arcade-art-size-label"
              sx={{ display: 'block', mb: 0.5 }}
            >
              {ARCADE_ART_SIZE_LABEL}
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={view.size}
              aria-labelledby="arcade-art-size-label"
              onChange={(_event, next) => {
                if (next === 16 || next === 32) handleSize(next)
              }}
              disabled={busy}
            >
              {ARCADE_ART_SIZES.map((size) => (
                <ToggleButton
                  key={size}
                  value={size}
                  sx={{ minHeight: 44, textTransform: 'none' }}
                >
                  {size} &times; {size}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.5 }}
            >
              {ARCADE_ART_SIZE_HINT}
            </Typography>
          </Box>

          {busy && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                {view.loading ? ARCADE_ART_LOADING : ARCADE_ART_CONVERTING}
              </Typography>
            </Stack>
          )}

          {view.loadError && (
            <Stack spacing={0.75} alignItems="flex-start">
              <Typography variant="body2" color="error">
                {view.loadError}
              </Typography>
              <Button
                variant="outlined"
                onClick={() => setLoadAttempt((n) => n + 1)}
                disabled={busy}
                sx={{ minHeight: 44, textTransform: 'none' }}
              >
                {ARCADE_ART_RETRY_LABEL}
              </Button>
            </Stack>
          )}

          {/* A conversion that refused. No Try again: the same picture at the
              same size refuses the same way, and the sentence says what to
              change instead. */}
          {view.convertError && (
            <Typography variant="body2" color="error">
              {view.convertError}
            </Typography>
          )}

          {image && (
            <>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                alignItems={{ xs: 'center', sm: 'flex-start' }}
                justifyContent="center"
              >
                <Box sx={{ width: '100%', maxWidth: 288 }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {ARCADE_ART_PREVIEW_HEADING}
                  </Typography>
                  <Box
                    sx={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: 2,
                      background: CHECKERBOARD_BG,
                      overflow: 'hidden',
                    }}
                  >
                    {output?.previewUrl && (
                      <Box
                        component="img"
                        src={output.previewUrl}
                        alt={`${pinnedSource.label || 'Picture'} as ${image.size} by ${image.size} game art`}
                        sx={{
                          width: '100%',
                          height: '100%',
                          display: 'block',
                          // The whole point: show the cells, not a blur.
                          imageRendering: 'pixelated',
                        }}
                      />
                    )}
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {ARCADE_ART_ACTUAL_HEADING}
                  </Typography>
                  <Box
                    sx={{
                      width: image.size,
                      height: image.size,
                      borderRadius: 0.5,
                      background: CHECKERBOARD_BG,
                      overflow: 'hidden',
                    }}
                  >
                    {output?.previewUrl && (
                      <Box
                        component="img"
                        src={output.previewUrl}
                        // The same picture one line up; naming it twice would
                        // read as two sprites to a screen reader.
                        alt=""
                        aria-hidden
                        sx={{
                          width: '100%',
                          height: '100%',
                          display: 'block',
                          imageRendering: 'pixelated',
                        }}
                      />
                    )}
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.5, maxWidth: 200 }}
                  >
                    {ARCADE_ART_ACTUAL_NOTE}
                  </Typography>
                </Box>
              </Stack>

              {!output?.previewUrl && !view.working && (
                <Typography variant="body2" color="text.secondary">
                  {ARCADE_ART_PREVIEW_UNAVAILABLE}
                </Typography>
              )}

              <Typography variant="caption" color="text.secondary">
                {arcadeArtDownloadNote(image.size)}
              </Typography>

              {/* How to actually use it — a replacement, not a blind paste. */}
              <Box>
                <Box component="ol" sx={{ pl: 3, m: 0 }}>
                  {ARCADE_ART_INSTRUCTIONS.map((step) => (
                    <Box component="li" key={step} sx={{ mb: 0.25 }}>
                      <Typography variant="body2" color="text.secondary">
                        {step}
                      </Typography>
                    </Box>
                  ))}
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  {ARCADE_ART_PALETTE_NOTE}
                </Typography>
              </Box>

              {view.copied && (
                <Typography variant="body2" color="success.main">
                  {ARCADE_ART_COPIED}
                </Typography>
              )}
              {view.actionError && (
                <Typography variant="body2" color="error">
                  {view.actionError}
                </Typography>
              )}

              {/* The clipboard refused: every character, selectable, plus a
                  file. Never shown beside a "Copied" receipt. */}
              {view.manualCopy && (
                <Stack spacing={0.75} alignItems="flex-start">
                  <TextField
                    label={ARCADE_ART_COPY_FALLBACK_LABEL}
                    value={image.literal}
                    multiline
                    minRows={4}
                    fullWidth
                    slotProps={{ htmlInput: { readOnly: true, spellCheck: false } }}
                    sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 12 } }}
                  />
                  <Button
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={handleSaveText}
                    sx={{ minHeight: 44, textTransform: 'none' }}
                  >
                    {ARCADE_ART_SAVE_TEXT_LABEL}
                  </Button>
                </Stack>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        <Button onClick={onDismiss} sx={{ minHeight: 44 }}>
          {ARCADE_ART_CLOSE_LABEL}
        </Button>
        <Button
          variant="outlined"
          startIcon={<ContentCopyIcon />}
          onClick={() => {
            void handleCopy()
          }}
          disabled={busy || !image}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          {ARCADE_ART_COPY_LABEL}
        </Button>
        <Button
          variant="contained"
          startIcon={<SportsEsportsIcon />}
          endIcon={<DownloadIcon />}
          onClick={handleDownloadPng}
          disabled={busy || !output?.blob}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          {ARCADE_ART_DOWNLOAD_LABEL}
        </Button>
      </DialogActions>
    </>
  )
}
