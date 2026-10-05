import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import SaveIcon from '@mui/icons-material/Save'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import type { DocumentReference } from 'firebase/firestore'

import { stickerLibraryCollection } from '../../core/firebase/firestore'
import { useAI } from '../../core/ai/useAI'
import type { Sticker } from '../../core/types'
import { ART_QUOTA_MESSAGE } from '../business/useArtQuota'
import { CHECKERBOARD_BG } from './DrawingChoiceDialog'
import { fancyStyleLabel } from './drawingStickerStyles'
import { recordStickerArtGeneration } from './useStickerArtQuota'
import {
  checkSavedStickerSourceRow,
  cloneSavedStickerEditSource,
  editedStickerPayload,
  savedStickerEditFailureMessage,
  savedStickerEditInstructionProblem,
  savedStickerEditRequest,
  savedStickerEditSessionKey,
  savedStickerEditSource,
  usableSavedStickerEdit,
  SAVED_STICKER_EDIT_CANCEL_LABEL,
  SAVED_STICKER_EDIT_CLOSE_LABEL,
  SAVED_STICKER_EDIT_COST_NOTE,
  SAVED_STICKER_EDIT_FIELD_HINT,
  SAVED_STICKER_EDIT_FIELD_LABEL,
  SAVED_STICKER_EDIT_GENERATE_LABEL,
  SAVED_STICKER_EDIT_INELIGIBLE,
  SAVED_STICKER_EDIT_LOOK_NOTE,
  SAVED_STICKER_EDIT_PENDING_GENERATE,
  SAVED_STICKER_EDIT_PENDING_SAVE,
  SAVED_STICKER_EDIT_PLACEHOLDER,
  SAVED_STICKER_EDIT_REDRAW_NOTE,
  SAVED_STICKER_EDIT_SAVE_LABEL,
  SAVED_STICKER_EDIT_SAVE_RETRY,
  SAVED_STICKER_EDIT_SAVED,
  SAVED_STICKER_EDIT_SOURCE_HEADING,
  SAVED_STICKER_EDIT_TITLE,
  SAVED_STICKER_EDIT_UNAVAILABLE,
  type SavedStickerEditPreview,
  type SavedStickerEditSource,
  type SavedStickerSourceCheck,
} from './savedStickerEditSession'

export interface SavedStickerEditDialogProps {
  /**
   * The saved version this session edits — the picture that was actually tapped,
   * not its group's representative. `null` closes the dialog.
   */
  source: Sticker | null
  familyId: string
  /**
   * The host's actor/context identity (family + profile + resolved child, even
   * when the library's own filter says "All"). Any change REPLACES the session:
   * nothing in flight may then display, save or refresh.
   */
  contextKey: string
  /** The actor has spent this week's art budget — no new generation, saving still allowed. */
  capReached?: boolean
  /** Count one paid generation against the week's counter. */
  recordGeneration?: () => Promise<void>
  onClose: () => void
  /** Refresh the library once, after a save that is still in its own context. */
  onSaved: () => void
}

/** Everything one session shows. One object, so there is one thing to reset. */
interface EditView {
  instruction: string
  /** The last usable result, kept until another one replaces it. */
  preview: SavedStickerEditPreview | null
  /** The instruction that preview was actually made for — never relabelled. */
  previewInstruction: string
  generating: boolean
  saving: boolean
  /** A save that came back. The session is finished; the library has the row. */
  saved: boolean
  error: string | null
}

const EMPTY_VIEW: EditView = {
  instruction: '',
  preview: null,
  previewInstruction: '',
  generating: false,
  saving: false,
  saved: false,
  error: null,
}

/**
 * Read the one source row and ask whether it is still the picture the session
 * opened on.
 *
 * A failed read is not an affirmative "it is gone", so it refuses with the
 * unavailable sentence rather than the deleted one.
 */
async function readSavedSource(
  familyId: string,
  source: SavedStickerEditSource,
): Promise<SavedStickerSourceCheck> {
  try {
    const snap = await getDoc(doc(stickerLibraryCollection(familyId), source.id))
    return checkSavedStickerSourceRow(snap.exists() ? snap.data() : undefined, source)
  } catch {
    return { ok: false, message: SAVED_STICKER_EDIT_UNAVAILABLE }
  }
}

/**
 * Edit a picture that is already saved (SAVED-STICKER-EDITOR-003).
 *
 * The other sticker doors make a NEW picture from a drawing — pick a look, and
 * the drawing is redrawn. This is the other verb: *this* picture, *this* look,
 * one short instruction, a preview, and a new version saved only when the person
 * says so. The source row is never overwritten.
 *
 * The session body is keyed on the host's context **and the whole source
 * snapshot** (`savedStickerEditSessionKey`), not on the document id: a row that
 * keeps its id and gets a different image, look, name, group or owner is a
 * different picture, and the preview on screen was made from the old one. Any
 * such replacement — a family change included, whatever the caller put in
 * `contextKey` — remounts the body, which is what makes the typed words, the
 * preview and the frozen save destination belong to exactly one session.
 *
 * Dismissing (the button, Escape or the backdrop) goes through one path that
 * invalidates the session before it closes, so a request already in flight can
 * still finish and be counted but can no longer display, save or refresh.
 */
export default function SavedStickerEditDialog({
  source,
  familyId,
  contextKey,
  capReached = false,
  recordGeneration,
  onClose,
  onSaved,
}: SavedStickerEditDialogProps) {
  const editSource = savedStickerEditSource(source)
  const sessionKey = editSource
    ? `${contextKey}::${savedStickerEditSessionKey(familyId, editSource)}`
    : 'none'

  // The mounted session's own invalidator, so Escape and the backdrop invalidate
  // exactly as the Cancel button does rather than relying on the host to unmount.
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
      <DialogTitle>{SAVED_STICKER_EDIT_TITLE}</DialogTitle>
      {editSource ? (
        <SavedStickerEditSession
          key={sessionKey}
          source={editSource}
          familyId={familyId}
          capReached={capReached}
          recordGeneration={recordGeneration}
          registerInvalidate={registerInvalidate}
          onDismiss={handleDismiss}
          onSaved={onSaved}
        />
      ) : (
        <>
          <DialogContent>
            {/* A sticker the host handed over that this door may not open on:
                refused in words rather than silently. */}
            {source && (
              <Typography variant="body2">{SAVED_STICKER_EDIT_INELIGIBLE}</Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} sx={{ minHeight: 44 }}>
              {SAVED_STICKER_EDIT_CLOSE_LABEL}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}

interface SavedStickerEditSessionProps {
  source: SavedStickerEditSource
  familyId: string
  capReached: boolean
  recordGeneration?: () => Promise<void>
  /** Hand the host's dialog this session's invalidator while it is mounted. */
  registerInvalidate: (fn: (() => void) | null) => void
  onDismiss: () => void
  onSaved: () => void
}

/**
 * One session on one saved picture.
 *
 * ## The four rails
 *
 * **Source.** The snapshot is CLONED and pinned on mount, and every read — the
 * request, both preflights, the saved row — uses the pinned copy rather than the
 * live prop. So a row that changes under the session can never half-enter a
 * handler: the session is replaced (see the key above), and until it is, the
 * work in flight is still about the picture it started on.
 *
 * **Session.** An in-flight call finds `stillCurrent()` false the moment the
 * body is unmounted or the session is dismissed — checked after the preflight
 * read *and* after the paid call, so nothing is spent for, displayed in or
 * written from a session that is gone.
 *
 * **Accounting.** A usable success counts exactly once, against the recorder
 * captured at *that* Generate (a week rollover re-binds it, so it is read per
 * call and never pinned) and before any stale-session refusal — the call
 * happened whoever is looking now. A rejected or malformed result counts
 * nothing, and counting stays fire-and-forget.
 *
 * **Save identity.** One destination per usable preview, allocated once and
 * frozen with its payload, so a retry after an ambiguous acknowledgement writes
 * the same row to the same place and can never leave two.
 *
 * Its own `useAI` instance, deliberately: `imageFailureRef` is mutable and
 * shared per hook, so this door must not read another generation's failure.
 */
function SavedStickerEditSession({
  source,
  familyId,
  capReached,
  recordGeneration,
  registerInvalidate,
  onDismiss,
  onSaved,
}: SavedStickerEditSessionProps) {
  const { enhanceSketch, imageFailureRef } = useAI()
  const [view, setView] = useState<EditView>(EMPTY_VIEW)
  // The source this session is about, pinned for its whole life.
  const [pinnedSource] = useState(() => cloneSavedStickerEditSource(source))
  const [pinnedFamilyId] = useState(familyId)

  const aliveRef = useRef(true)
  const dismissedRef = useRef(false)
  // Is this session still the live one: mounted, and not dismissed?
  const stillCurrent = useCallback(
    () => aliveRef.current && !dismissedRef.current,
    [],
  )
  // A layout cleanup, so being unmounted lands in the commit that removes the
  // body rather than in a later flush — the window this guards is one microtask.
  useLayoutEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])
  // Dismissing invalidates here and now, whether or not the host unmounts us.
  useLayoutEffect(() => {
    const invalidate = () => { dismissedRef.current = true }
    registerInvalidate(invalidate)
    return () => registerInvalidate(null)
  }, [registerInvalidate])

  // Synchronous latches. The disabled buttons are the courtesy; these are the
  // rule — two taps in one tick must not become two calls or two writes.
  const generatingRef = useRef(false)
  const savingRef = useRef(false)
  // The frozen save destination + row, and whether a write actually went out.
  const saveRefRef = useRef<DocumentReference<Sticker> | null>(null)
  const savePayloadRef = useRef<Omit<Sticker, 'id'> | null>(null)
  const saveSubmittedRef = useRef(false)

  const handleGenerate = useCallback(async () => {
    // At the door, not only after the awaits: a dismissed session that the host
    // has not unmounted must start nothing new.
    if (!stillCurrent()) return
    if (generatingRef.current || savingRef.current) return
    if (capReached || view.saved) return
    // Every word the person typed or pasted is still here; an instruction this
    // door cannot send verbatim is refused with the reason, never trimmed to fit.
    const problem = savedStickerEditInstructionProblem(view.instruction)
    if (problem) {
      setView((v) => ({ ...v, error: problem }))
      return
    }
    const request = savedStickerEditRequest({
      familyId: pinnedFamilyId,
      source: pinnedSource,
      instruction: view.instruction,
    })
    if (!request) {
      setView((v) => ({ ...v, error: SAVED_STICKER_EDIT_UNAVAILABLE }))
      return
    }
    const askedFor = request.savedStickerEdit?.instruction ?? ''
    // The recorder as it is at THIS Generate, kept through a late completion.
    const recorder = recordGeneration
    generatingRef.current = true
    setView((v) => ({ ...v, generating: true, error: null }))
    try {
      const check = await readSavedSource(pinnedFamilyId, pinnedSource)
      // After the preflight await, before anything is spent.
      if (!stillCurrent()) return
      if (!check.ok) {
        setView((v) => ({ ...v, error: check.message }))
        return
      }
      // `enhanceSketch` returns null on failure and leaves the details in the
      // ref; a thrown call lands in the catch below. Both are handled.
      const usable = usableSavedStickerEdit(await enhanceSketch(request))
      // The paid call happened: count it once, here, before any stale-session
      // refusal — including a dismiss or a switch.
      if (usable) recordStickerArtGeneration(recorder)
      if (!stillCurrent()) return
      if (!usable) {
        // The previous preview stays exactly as it was, still labelled with the
        // instruction it was made for.
        setView((v) => ({
          ...v,
          error: savedStickerEditFailureMessage(imageFailureRef.current),
        }))
        return
      }
      setView((v) => ({
        ...v,
        preview: usable,
        previewInstruction: askedFor,
        error: null,
      }))
      // A new preview is a new destination; the old one may not be written to.
      saveRefRef.current = null
      savePayloadRef.current = null
      saveSubmittedRef.current = false
    } catch {
      if (!stillCurrent()) return
      // Static: an error body on this path can quote what it was given.
      setView((v) => ({ ...v, error: SAVED_STICKER_EDIT_UNAVAILABLE }))
    } finally {
      generatingRef.current = false
      if (stillCurrent()) setView((v) => ({ ...v, generating: false }))
    }
  }, [
    capReached,
    enhanceSketch,
    imageFailureRef,
    pinnedFamilyId,
    pinnedSource,
    recordGeneration,
    stillCurrent,
    view.instruction,
    view.saved,
  ])

  const handleSave = useCallback(async () => {
    // At the door, and before the write below. The retry of an already-submitted
    // save takes no preflight await, so the after-await guards never see it —
    // and a dismissed session may not write, however it is tapped.
    if (!stillCurrent()) return
    if (savingRef.current || generatingRef.current) return
    if (!view.preview || view.saved) return
    const preview = view.preview
    savingRef.current = true
    setView((v) => ({ ...v, saving: true, error: null }))
    try {
      // The source check belongs to the FIRST save. Once a write has actually
      // gone out, a retry resends the frozen row to the frozen destination: the
      // acknowledgement may simply have been lost, and refusing then would claim
      // nothing was saved when something may well have been.
      if (!saveSubmittedRef.current) {
        const check = await readSavedSource(pinnedFamilyId, pinnedSource)
        if (!stillCurrent()) return
        if (!check.ok) {
          setView((v) => ({ ...v, error: check.message }))
          return
        }
      }
      // Last check before anything is written, on both paths.
      if (!stillCurrent()) return
      if (!saveRefRef.current || !savePayloadRef.current) {
        // Pinned to this session's family: a switch mid-write may hide the
        // result, but it never redirects it.
        saveRefRef.current = doc(stickerLibraryCollection(pinnedFamilyId))
        savePayloadRef.current = editedStickerPayload({
          source: pinnedSource,
          result: preview,
          createdAt: new Date().toISOString(),
        })
      }
      saveSubmittedRef.current = true
      // `setDoc` on the one allocated ref — never `addDoc`, so a retry lands on
      // the row the first attempt addressed. The source row is untouched.
      await setDoc(saveRefRef.current, savePayloadRef.current as Sticker)
      if (!stillCurrent()) return
      setView((v) => ({ ...v, saved: true, error: null }))
      // One refresh, and only of the context this session belongs to.
      onSaved()
    } catch {
      if (!stillCurrent()) return
      setView((v) => ({ ...v, error: SAVED_STICKER_EDIT_SAVE_RETRY }))
    } finally {
      savingRef.current = false
      if (stillCurrent()) setView((v) => ({ ...v, saving: false }))
    }
  }, [
    onSaved,
    pinnedFamilyId,
    pinnedSource,
    stillCurrent,
    view.preview,
    view.saved,
  ])

  const busy = view.generating || view.saving

  return (
    <>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          {/* The exact saved picture, and the new one beside it on anything
              wider than a phone. */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems="center"
            justifyContent="center"
          >
            <Box sx={{ width: '100%', maxWidth: 240 }}>
              <Typography variant="caption" color="text.secondary" display="block">
                {SAVED_STICKER_EDIT_SOURCE_HEADING}
              </Typography>
              <Box
                component="img"
                src={pinnedSource.url}
                alt={pinnedSource.label}
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
            {view.preview && (
              <Box sx={{ width: '100%', maxWidth: 240 }}>
                <Typography variant="caption" color="text.secondary" display="block">
                  {/* The truthful relationship: this picture is the one that
                      completed instruction, not whatever is typed now. */}
                  New picture for &ldquo;{view.previewInstruction}&rdquo;
                </Typography>
                <Box
                  component="img"
                  src={view.preview.url}
                  alt={`New ${pinnedSource.label}`}
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
            )}
          </Stack>

          <Stack direction="row" spacing={0.75} justifyContent="center" flexWrap="wrap" useFlexGap>
            <Chip size="small" label={pinnedSource.label} variant="outlined" />
            <Chip size="small" label={fancyStyleLabel(pinnedSource.lookId)} variant="outlined" />
          </Stack>

          <Typography variant="body2" color="text.secondary">
            {SAVED_STICKER_EDIT_LOOK_NOTE}
          </Typography>

          <TextField
            label={SAVED_STICKER_EDIT_FIELD_LABEL}
            placeholder={SAVED_STICKER_EDIT_PLACEHOLDER}
            value={view.instruction}
            onChange={(e) => setView((v) => ({ ...v, instruction: e.target.value }))}
            // No length cap on the input: truncating a pasted sentence would
            // change what was asked for. The typed words also survive a failure
            // and every retry; only an explicit dismiss or a replaced session
            // clears them.
            disabled={busy || view.saved}
            fullWidth
            helperText={SAVED_STICKER_EDIT_FIELD_HINT}
          />

          {capReached ? (
            /* The warm nudge, not a lock — and saving a preview that is already
               made stays available below. */
            <Typography variant="body2" color="text.secondary">
              {ART_QUOTA_MESSAGE}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {SAVED_STICKER_EDIT_COST_NOTE}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {SAVED_STICKER_EDIT_REDRAW_NOTE}
          </Typography>

          {/* What closing will not undo, said while it is still true. */}
          {view.generating && (
            <Typography variant="caption" color="text.secondary">
              {SAVED_STICKER_EDIT_PENDING_GENERATE}
            </Typography>
          )}
          {view.saving && (
            <Typography variant="caption" color="text.secondary">
              {SAVED_STICKER_EDIT_PENDING_SAVE}
            </Typography>
          )}

          {view.error && (
            <Typography variant="body2" color="error">
              {view.error}
            </Typography>
          )}
          {view.saved && (
            <Typography variant="body2" color="success.main">
              {SAVED_STICKER_EDIT_SAVED}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        {/* Always available — a pending request is exactly when someone wants
            out, and the lines above say what leaving does and does not do. */}
        <Button onClick={onDismiss} sx={{ minHeight: 44 }}>
          {busy ? SAVED_STICKER_EDIT_CANCEL_LABEL : SAVED_STICKER_EDIT_CLOSE_LABEL}
        </Button>
        {/* No generation at the cap — refuse before the spend. */}
        {!capReached && (
          <Button
            variant={view.preview ? 'outlined' : 'contained'}
            startIcon={
              view.generating
                ? <CircularProgress size={16} color="inherit" />
                : <AutoFixHighIcon />
            }
            onClick={() => { void handleGenerate() }}
            disabled={busy || view.saved || !view.instruction.trim()}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            {view.generating ? 'Making…' : SAVED_STICKER_EDIT_GENERATE_LABEL}
          </Button>
        )}
        <Button
          variant="contained"
          startIcon={
            view.saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />
          }
          onClick={() => { void handleSave() }}
          disabled={busy || view.saved || !view.preview}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          {view.saving ? 'Saving…' : SAVED_STICKER_EDIT_SAVE_LABEL}
        </Button>
      </DialogActions>
    </>
  )
}
