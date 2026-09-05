import { useCallback, useState } from 'react'
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
import Alert from '@mui/material/Alert'
import { addDoc, doc, setDoc } from 'firebase/firestore'

import { stickerLibraryCollection } from '../../core/firebase/firestore'
import { useAI } from '../../core/ai/useAI'
import type { Sticker, StickerTag } from '../../core/types'
import { STICKER_TAG_LABELS } from '../../core/types'
import { StickerCategory } from '../../core/types/enums'
import { ART_QUOTA_MESSAGE } from '../business/useArtQuota'
import type { ArtHelpAudience } from './artHelpContent'
import { GenerateHint } from './ArtHelpSheet'
import { CHECKERBOARD_BG } from './DrawingChoiceDialog'
import { STICKER_TAGS_ORDERED, suggestTagsFromPrompt } from './stickerTagging'
import { recordStickerArtGeneration } from './useStickerArtQuota'
import ImageRetryCard from './ImageRetryCard'
import {
  classifyImageGenerationFailure,
  imageFailureAlternatives,
  ImageRetryDoor,
  type ImageGenerationFailure,
} from './imageGenerationFailure'
import { drawnAsLine } from './revisedPromptLine'

interface MakeStickerDialogProps {
  open: boolean
  onClose: () => void
  familyId: string
  /** Pre-selects the "For" target on the tagging step. */
  childProfile?: 'lincoln' | 'london'
  /** Fired after a sticker is generated/saved to the library. */
  onSaved?: (sticker: Sticker) => void
  /**
   * The actor has spent this week's art budget (FEAT-165). Generating is a paid
   * call, so a kid gets the same light weekly cap the Kit Builder uses — a warm
   * nudge in place of the Create button, never an error and never a lock. The
   * default keeps uncapped callers (the parent-only Settings render) unchanged.
   */
  capReached?: boolean
  /**
   * Count one paid generation against the day's counter (FEAT-165). Omitted by
   * uncapped callers; a no-op for a parent.
   */
  recordGeneration?: () => Promise<void>
  /**
   * Whose words the one-line hint under "Create!" is written in (FEAT-178).
   * Resolved by the host from `useActiveChild().isChildProfile` — capability,
   * never a name. Defaults to the fuller parent wording, which is what the
   * uncapped parent-only callers want.
   */
  audience?: ArtHelpAudience
}

/**
 * Standalone "Make a Sticker" flow: describe → generate → preview → tag →
 * save to the sticker library. Unlike {@link StickerPicker}, this does not
 * require an open book — it reuses the same image-generation backend and the
 * same `stickerLibrary` write, then reports the saved sticker via `onSaved`.
 */
export default function MakeStickerDialog({
  open,
  onClose,
  familyId,
  childProfile,
  onSaved,
  capReached = false,
  recordGeneration,
  audience = 'parent',
}: MakeStickerDialogProps) {
  const [prompt, setPrompt] = useState('')
  const [generationPreview, setGenerationPreview] = useState<{
    url: string
    storagePath: string
    /** What the picture maker was actually asked to draw, when it differs (FEAT-195). */
    revisedPrompt?: string
    /** The words that produced THIS picture — an alternative tap replaces `prompt`. */
    askedFor: string
  } | null>(null)
  /**
   * Why the last picture didn't come back (FEAT-195). Replaces a boolean that
   * said only "something failed" and a message-sniffing Alert underneath it that
   * said something different — a refusal, a rate limit and a dropped connection
   * now read as three different things with three different next steps.
   */
  const [failure, setFailure] = useState<ImageGenerationFailure | null>(null)
  const [alternatives, setAlternatives] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  /**
   * What a failed write says (UX-93). Both writes in this flow used to fail
   * silently — one as an unhandled rejection, one as an empty `catch` followed
   * by a close — so a kid could watch a sticker "save" and never have it.
   */
  const [saveError, setSaveError] = useState<string | null>(null)

  // Post-generation tagging state
  const [pendingSticker, setPendingSticker] = useState<Sticker | null>(null)
  const [pendingTags, setPendingTags] = useState<StickerTag[]>([])
  const [pendingProfile, setPendingProfile] = useState<'lincoln' | 'london' | 'both'>('both')

  const { generateImage, loading: generating, imageFailureRef } = useAI()

  const resetAll = useCallback(() => {
    setPrompt('')
    setGenerationPreview(null)
    setFailure(null)
    setAlternatives([])
    setPendingSticker(null)
    setPendingTags([])
    setPendingProfile('both')
    setSaveError(null)
  }, [])

  const handleClose = useCallback(() => {
    if (generating || saving) return
    resetAll()
    onClose()
  }, [generating, saving, resetAll, onClose])

  /**
   * Generate from `words`. An alternative tap passes the reworded text and it
   * becomes the description in the box, so what the kid sees and what was sent
   * stay the same thing (FEAT-195). Tapping one is a NEW paid call and is
   * counted below exactly like typing the words by hand.
   */
  const handleGenerate = useCallback(async (words?: string) => {
    const asked = (words ?? prompt).trim()
    // At the cap, refuse *before* spending — the paid call never goes out
    // (FEAT-165). The nudge below says so; nothing here is styled as an error.
    // An alternative tap goes through this same guard, so a refusal cannot
    // become a way round the week's budget.
    if (!asked || capReached) return
    if (words !== undefined) setPrompt(words)
    setFailure(null)
    setAlternatives([])
    const result = await generateImage({
      familyId,
      prompt: asked,
      style: 'book-sticker',
      size: '1024x1024',
    })
    if (!result) {
      // Nothing came back — don't charge the kid's weekly budget for it. The
      // classifier reads `imageFailureRef`, the raw rejection, not a message
      // string; see `imageGenerationFailure.ts`.
      setFailure(classifyImageGenerationFailure(imageFailureRef.current))
      setAlternatives(imageFailureAlternatives(imageFailureRef.current))
      return
    }
    setGenerationPreview({
      url: result.url,
      storagePath: result.storagePath,
      revisedPrompt: result.revisedPrompt,
      askedFor: asked,
    })
    // A real image arrived, so a real call was made: count it. "Try Again"
    // counts too — each retry is another paid call (FEAT-94's rule).
    //
    // Never awaited (FEAT-167). Nothing follows it today, and `generating` is
    // `useAI`'s own flag, so this door was the mild one — but leaving the
    // `await` here means the next line added below it silently reintroduces the
    // wedge the other two doors had. The counter is fire-and-forget everywhere.
    recordStickerArtGeneration(recordGeneration)
  }, [prompt, capReached, familyId, generateImage, recordGeneration, imageFailureRef])

  const handleTryAgain = useCallback(() => {
    setGenerationPreview(null)
    setFailure(null)
    setAlternatives([])
    // Keep the prompt pre-filled so they can tweak it.
  }, [])

  const handleUseGenerated = useCallback(async () => {
    if (!generationPreview) return
    const suggestedTags = suggestTagsFromPrompt(prompt)
    const autoProfile: 'lincoln' | 'london' | 'both' = childProfile ?? 'both'

    const newSticker: Omit<Sticker, 'id'> = {
      url: generationPreview.url,
      storagePath: generationPreview.storagePath,
      label: prompt.trim(),
      category: StickerCategory.Custom,
      childId: null,
      prompt: prompt.trim(),
      createdAt: new Date().toISOString(),
      tags: suggestedTags,
      childProfile: autoProfile,
    }
    setSaving(true)
    setSaveError(null)
    try {
      const docRef = await addDoc(stickerLibraryCollection(familyId), newSticker as Sticker)
      const saved = { ...newSticker, id: docRef.id } as Sticker
      setGenerationPreview(null)
      // Move to the quick tagging step.
      setPendingSticker(saved)
      setPendingTags(suggestedTags)
      setPendingProfile(autoProfile)
      onSaved?.(saved)
    } catch {
      // The write that puts the sticker in the library failed (UX-93). This
      // used to be `try … finally` with no `catch`: an unhandled rejection, a
      // dialog that said nothing, and a sticker the kid believed was saved.
      // The preview is still on screen, so "Use it" is still the way forward.
      setSaveError(
        "That sticker didn't reach your library \u2014 the save didn't go through. Your picture is still here. Tap \"Use it\" to try again.",
      )
    } finally {
      setSaving(false)
    }
  }, [generationPreview, prompt, childProfile, familyId, onSaved])

  const handleConfirmTagging = useCallback(async () => {
    if (!pendingSticker?.id) {
      handleClose()
      return
    }
    const updated: Sticker = { ...pendingSticker, tags: pendingTags, childProfile: pendingProfile }
    setSaving(true)
    setSaveError(null)
    try {
      await setDoc(doc(stickerLibraryCollection(familyId), pendingSticker.id), updated)
      onSaved?.(updated)
    } catch {
      // The tag write failed (UX-93). This used to be `catch {}` followed by a
      // close: the dialog vanished and the tags the kid picked were silently
      // not there. The sticker itself IS saved — with the suggested tags — so
      // the honest thing is to say exactly that and stay open for another tap.
      setSaveError(
        "Your tags didn't save \u2014 the sticker is in your library with the tags we guessed. Tap \"Done\" to try again, or close this and it stays as it is.",
      )
      return
    } finally {
      setSaving(false)
    }
    resetAll()
    onClose()
  }, [pendingSticker, pendingTags, pendingProfile, familyId, onSaved, resetAll, onClose, handleClose])

  if (!open) return null

  // ── Post-generation tagging screen ────────────────────────────
  if (pendingSticker) {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        {/* The sticker is ALREADY in the library by the time this screen opens
            (UX-92) — "Use This" wrote it. This step only adds tags, so it says
            so and its button is "Done", not a second save the kid might think
            is the one that counts. */}
        <DialogTitle>Tag your sticker</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {saveError && <Alert severity="warning">{saveError}</Alert>}
            <Box sx={{ textAlign: 'center' }}>
              <Box
                component="img"
                src={pendingSticker.url}
                alt={pendingSticker.label}
                sx={{
                  width: 120, height: 120, objectFit: 'contain', borderRadius: 2,
                  background: CHECKERBOARD_BG,
                }}
              />
            </Box>

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
                    variant={pendingTags.includes(tag) ? 'filled' : 'outlined'}
                    onClick={() =>
                      setPendingTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                      )
                    }
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
                    variant={pendingProfile === p ? 'filled' : 'outlined'}
                    onClick={() => setPendingProfile(p)}
                  />
                ))}
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => { void handleConfirmTagging() }}
            disabled={saving}
          >
            {saving ? 'Saving\u2026' : 'Done'}
          </Button>
        </DialogActions>
      </Dialog>
    )
  }

  // ── Generate / preview screen ─────────────────────────────────
  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Make a Sticker</DialogTitle>
      <DialogContent>
        {generationPreview ? (
          <Stack spacing={2} alignItems="center" sx={{ pt: 1 }}>
            <Box
              component="img"
              src={generationPreview.url}
              alt="Generated sticker"
              sx={{
                width: 160, height: 160, objectFit: 'contain', borderRadius: 2,
                border: '1px solid', borderColor: 'divider',
                background: CHECKERBOARD_BG,
              }}
            />
            {/* What the picture maker was actually asked to draw, when the
                copyright rewrite changed it (FEAT-195). Quiet, parent-only, and
                silent when the ask went through unchanged. */}
            {drawnAsLine(generationPreview.askedFor, generationPreview.revisedPrompt, audience) && (
              <Typography variant="caption" color="text.secondary" textAlign="center">
                {drawnAsLine(generationPreview.askedFor, generationPreview.revisedPrompt, audience)}
              </Typography>
            )}
            {/* The library write failed and said so (UX-93) — the picture is
                still on screen, so "Use it" is still the way forward. */}
            {saveError && <Alert severity="warning">{saveError}</Alert>}
            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" onClick={handleTryAgain} disabled={saving}>
                Try Again
              </Button>
              <Button
                variant="contained"
                onClick={() => { void handleUseGenerated() }}
                disabled={saving}
              >
                {saving ? 'Saving\u2026' : 'Use it'}
              </Button>
            </Stack>
          </Stack>
        ) : failure ? (
          /* One card for every way a picture can fail to arrive (FEAT-195).
             Replaces a single line that said the same thing for a refusal, a
             rate limit and a dropped connection, and had nothing to tap. At the
             cap `handleGenerate` still refuses before spending, so an
             alternative tap can never get round the week's budget. */
          <ImageRetryCard
            failure={failure}
            audience={audience}
            door={ImageRetryDoor.Sticker}
            alternatives={alternatives}
            onUseAlternative={(text) => { void handleGenerate(text) }}
            onRetry={handleTryAgain}
            retryLabel="Try Again"
          />
        ) : capReached ? (
          /* Weekly cap reached (FEAT-165): a warm nudge, never an error styling
             — the same copy and posture as the Kit Builder's cap. The prompt
             field and Create button are simply not offered. */
          <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
            {ART_QUOTA_MESSAGE}
          </Typography>
        ) : (
          <>
            <TextField
              label="Describe your sticker"
              placeholder="A cute dragon..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleGenerate() }}
              fullWidth
              autoFocus
              sx={{ mt: 1 }}
              disabled={generating}
            />
            {/* What this tap makes and what it spends (FEAT-178). Sits directly
                above the "Create!" button in the actions row. At the cap this
                whole branch is replaced by ART_QUOTA_MESSAGE, so the hint and
                the nudge are never both on screen. */}
            {!generating && <GenerateHint door="makeSticker" audience={audience} />}
            {generating && (
              <Stack alignItems="center" spacing={1} sx={{ mt: 2 }}>
                <CircularProgress size={24} />
                <Typography variant="body2" color="text.secondary">
                  Creating your sticker...
                </Typography>
              </Stack>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {!generationPreview && !failure && (
          <>
            <Button onClick={handleClose} disabled={generating}>
              {capReached ? 'Close' : 'Cancel'}
            </Button>
            {/* No Create button at the cap — refusing before the spend, not
                after it (FEAT-165). */}
            {!capReached && (
              <Button
                variant="contained"
                onClick={() => { void handleGenerate() }}
                disabled={!prompt.trim() || generating}
              >
                Make it
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
