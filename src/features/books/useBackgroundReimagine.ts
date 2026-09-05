import { useCallback, useEffect, useRef, useState } from 'react'
import { addDoc } from 'firebase/firestore'
import { artifactsCollection, stickerLibraryCollection } from '../../core/firebase/firestore'
import { useAI } from '../../core/ai/useAI'
import type { EnhanceSketchRequest } from '../../core/ai/useAI'
import type { Artifact } from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import { recordBookArtGeneration } from './useBookArtQuota'
import {
  classifyImageGenerationFailure,
  imageFailureAlternatives,
  type ImageGenerationFailure,
} from './imageGenerationFailure'

export interface ReimagineJob {
  id: string
  sourceImageUrl: string
  sourceImageId: string
  sourcePageId: string
  status: 'processing' | 'done' | 'failed'
  resultUrl?: string
  resultStoragePath?: string
  error?: string
  /**
   * Which failure it was (FEAT-195), so the page can show the shared card
   * instead of one auto-hiding sentence for a refused prompt, a rate limit, a
   * missing API key and a dropped connection alike. Absent on the client-side
   * timeout, which is our own stopwatch rather than a call that came back.
   */
  failure?: ImageGenerationFailure
  /** The server's rewordings of the caption, when it was a refusal. */
  alternatives?: string[]
  startedAt: number
  intensity: 'light' | 'medium' | 'full'
  /** True when the reimagine was rendered with a transparent background (sticker mode). */
  transparent: boolean
}

interface UseBackgroundReimagineOptions {
  familyId: string
  childId: string
  childName: string
  /** Book theme ID — influences reimagine style to match the book's visual identity. */
  bookTheme?: string
  /** Called when user picks "Replace background" — replaces the source image's URL */
  onReplaceBackground: (pageId: string, imageId: string, url: string, storagePath: string) => void
  /** Called to add a sticker to the current page */
  onAddSticker: (pageId: string, url: string, storagePath: string, label: string) => void
  /**
   * The actor has spent this week's art budget (FEAT-168). A reimagine is a paid
   * `enhanceSketch` call, so a kid gets the same light weekly cap the Stickers
   * page and the Kit Builder use. The page refuses ahead of the *sketch upload*
   * that precedes this — the guard here is the backstop, so no future caller can
   * reach the paid call around it. Defaults to uncapped.
   */
  capReached?: boolean
  /**
   * Count one paid transform against the day's counter (FEAT-168). Omitted by
   * uncapped callers; a no-op for a parent.
   */
  recordGeneration?: () => Promise<void>
}

/** Auto-dismiss timeout: save to gallery after 5 minutes of no interaction. */
const AUTO_DISMISS_MS = 5 * 60 * 1000
/** Client-side timeout: mark as failed after 3 minutes with no result. */
const CLIENT_TIMEOUT_MS = 3 * 60 * 1000

/**
 * The base style each slider band sends (FEAT-193 / UX-161a).
 *
 * Extracted verbatim from the hook so the captions in `reimagineCaptions.ts` can
 * be held to it by a test — a caption that names a look the band does not send
 * is the defect UX-161a was. The mapping itself is untouched: `light` and
 * `medium` both resolve to `storybook`, which is UX-161b's routing defect and is
 * deliberately left as it is.
 */
export function reimagineStyleFor(
  intensity: number,
): NonNullable<EnhanceSketchRequest['style']> {
  if (intensity >= 75) return 'comic'
  return 'storybook'
}

export function useBackgroundReimagine({
  familyId,
  childId,
  childName,
  bookTheme,
  onReplaceBackground,
  onAddSticker,
  capReached = false,
  recordGeneration,
}: UseBackgroundReimagineOptions) {
  const [job, setJob] = useState<ReimagineJob | null>(null)
  const [showChoiceDialog, setShowChoiceDialog] = useState(false)
  const [autoDismissedMessage, setAutoDismissedMessage] = useState<string | null>(null)
  const { enhanceSketch, imageFailureRef } = useAI()
  /**
   * The last reimagine's arguments, so "Try again" and an alternative tap can
   * re-run it (FEAT-195). A ref, not state: it is read inside the retry
   * callback, never rendered.
   */
  const lastRequestRef = useRef<{
    imageId: string
    pageId: string
    storagePath: string
    imageUrl: string
    intensity: number
    caption?: string
    transparent?: boolean
  } | null>(null)
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Client-side timeout ──────────────────────────────────────────
  useEffect(() => {
    if (!job || job.status !== 'processing') return
    const timeout = setTimeout(() => {
      setJob((prev) =>
        prev?.status === 'processing'
          ? {
              ...prev,
              status: 'failed',
              error: 'Took too long — the AI service may be busy. Try again later.',
            }
          : prev,
      )
    }, CLIENT_TIMEOUT_MS)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status])

  // ── Auto-dismiss: close notification after 5 minutes ──────────────
  // (Image is already auto-saved to gallery on completion.)
  useEffect(() => {
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current)
      autoDismissRef.current = null
    }
    if (!job || job.status !== 'done') return

    autoDismissRef.current = setTimeout(() => {
      setAutoDismissedMessage('Your reimagined drawing was saved to your sticker library')
      setJob(null)
      setShowChoiceDialog(false)
    }, AUTO_DISMISS_MS)

    return () => {
      if (autoDismissRef.current) {
        clearTimeout(autoDismissRef.current)
        autoDismissRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status])

  // Clear auto-dismissed message after 6 seconds
  useEffect(() => {
    if (!autoDismissedMessage) return
    const t = setTimeout(() => setAutoDismissedMessage(null), 6000)
    return () => clearTimeout(t)
  }, [autoDismissedMessage])

  // ── Start a background reimagine ─────────────────────────────────
  const startReimagine = useCallback(
    async (
      imageId: string,
      pageId: string,
      storagePath: string,
      imageUrl: string,
      intensity: number,
      caption?: string,
      transparent?: boolean,
    ) => {
      // At the cap, refuse *before* spending — the paid call never goes out and
      // no job is started, so nothing spins (FEAT-168). The page shows the
      // nudge; nothing here is styled as an error.
      if (capReached) return

      lastRequestRef.current = {
        imageId,
        pageId,
        storagePath,
        imageUrl,
        intensity,
        caption,
        transparent,
      }
      const jobId = `reimagine_${Date.now()}`
      const intensityLabel: ReimagineJob['intensity'] =
        intensity <= 25 ? 'light' : intensity >= 75 ? 'full' : 'medium'

      setJob({
        id: jobId,
        sourceImageUrl: imageUrl,
        sourceImageId: imageId,
        sourcePageId: pageId,
        status: 'processing',
        startedAt: Date.now(),
        intensity: intensityLabel,
        transparent: transparent ?? false,
      })

      try {
        const style = reimagineStyleFor(intensity)

        const result = await enhanceSketch({
          familyId,
          sketchStoragePath: storagePath,
          style,
          caption,
          theme: bookTheme,
          transparent,
        })

        if (result?.url) {
          // A real image came back, so a real call was made: count it
          // (FEAT-168). Fire-and-forget by construction — the counter never
          // stands between the kid and art they already have.
          recordBookArtGeneration(recordGeneration)
          setJob((prev) =>
            prev?.id === jobId
              ? { ...prev, status: 'done', resultUrl: result.url, resultStoragePath: result.storagePath }
              : prev,
          )
        } else {
          // `useAI.enhanceSketch` swallows the rejection and returns null, so
          // this is where a refused or rate-limited call actually lands — it
          // used to become the single string "No image returned" (FEAT-195).
          const failure = classifyImageGenerationFailure(imageFailureRef.current)
          const alternatives = imageFailureAlternatives(imageFailureRef.current)
          setJob((prev) =>
            prev?.id === jobId
              ? { ...prev, status: 'failed', failure, alternatives }
              : prev,
          )
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Enhancement failed'
        setJob((prev) =>
          prev?.id === jobId ? { ...prev, status: 'failed', error: msg } : prev,
        )
      }
    },
    [enhanceSketch, familyId, bookTheme, capReached, recordGeneration, imageFailureRef],
  )

  // ── Actions on the result ────────────────────────────────────────

  const openChoiceDialog = useCallback(() => {
    setShowChoiceDialog(true)
  }, [])

  const dismissNotification = useCallback(() => {
    setJob(null)
    setShowChoiceDialog(false)
  }, [])

  const handleReplaceBackground = useCallback(() => {
    if (!job || job.status !== 'done' || !job.resultUrl) return
    onReplaceBackground(job.sourcePageId, job.sourceImageId, job.resultUrl, job.resultStoragePath ?? '')
    setJob(null)
    setShowChoiceDialog(false)
  }, [job, onReplaceBackground])

  const handleAddAsSticker = useCallback(() => {
    if (!job || job.status !== 'done' || !job.resultUrl) return
    onAddSticker(job.sourcePageId, job.resultUrl, job.resultStoragePath ?? '', `${childName}'s reimagined drawing`)
    setJob(null)
    setShowChoiceDialog(false)
  }, [job, onAddSticker, childName])

  const saveToGallery = useCallback(
    async (url?: string, storagePath?: string) => {
      const saveUrl = url ?? job?.resultUrl
      if (!saveUrl) return
      try {
        await addDoc(stickerLibraryCollection(familyId), {
          url: saveUrl,
          storagePath: storagePath ?? job?.resultStoragePath ?? '',
          label: `${childName}'s reimagined drawing`,
          category: 'custom',
          childId,
          createdAt: new Date().toISOString(),
          tags: ['object'],
          childProfile: childId.includes('london')
            ? 'london'
            : childId.includes('lincoln')
              ? 'lincoln'
              : 'both',
        })
      } catch {
        // Best effort — don't block the user
      }
    },
    [familyId, childId, childName, job?.resultUrl, job?.resultStoragePath],
  )

  // ── Persist the enhanced illustration as a portfolio artifact ─────
  // Mirrors the original-sketch artifact write in useBook.addSketchToPage
  // so the portfolio shows both the raw sketch and the enhanced version.
  const saveEnhancedArtifact = useCallback(
    async (url?: string, storagePath?: string) => {
      const saveUrl = url ?? job?.resultUrl
      if (!familyId || !childId || !saveUrl) return
      try {
        const artifact: Omit<Artifact, 'id'> = {
          childId,
          title: 'Enhanced illustration',
          type: EvidenceType.Photo,
          uri: saveUrl,
          storagePath: storagePath ?? job?.resultStoragePath ?? '',
          createdAt: new Date().toISOString(),
          content: 'AI-enhanced illustration created from a hand-drawn sketch',
          tags: {
            engineStage: EngineStage.Build,
            domain: 'art',
            subjectBucket: SubjectBucket.Art,
            location: 'Home',
          },
        }
        await addDoc(artifactsCollection(familyId), artifact)
      } catch {
        // Best effort — don't block the user
      }
    },
    [familyId, childId, job?.resultUrl, job?.resultStoragePath],
  )

  // ── Auto-save every reimagine result to gallery ──────────────────
  const autoSavedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!job || job.status !== 'done' || !job.resultUrl) return
    // Only auto-save once per job
    if (autoSavedRef.current === job.id) return
    autoSavedRef.current = job.id
    void saveToGallery(job.resultUrl, job.resultStoragePath)
    void saveEnhancedArtifact(job.resultUrl, job.resultStoragePath)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status, saveToGallery, saveEnhancedArtifact])

  const handleDiscard = useCallback(() => {
    // Don't delete from storage — auto-saved to gallery, so the reference remains valid.
    // "Discard" means "don't add to this page right now."
    setJob(null)
    setShowChoiceDialog(false)
  }, [])

  const dismissError = useCallback(() => {
    setJob(null)
  }, [])

  /**
   * Run the last reimagine again, optionally with different words (FEAT-195).
   * An alternative tap passes the reworded caption; a plain retry passes
   * nothing and repeats exactly what was asked. Goes through `startReimagine`,
   * so the cap guard and the counter are still the one place a paid call is
   * decided and counted — a refusal is never a way round the week's budget.
   */
  const retryReimagine = useCallback(
    (caption?: string) => {
      const last = lastRequestRef.current
      if (!last) return
      void startReimagine(
        last.imageId,
        last.pageId,
        last.storagePath,
        last.imageUrl,
        last.intensity,
        caption ?? last.caption,
        last.transparent,
      )
    },
    [startReimagine],
  )

  return {
    job,
    showChoiceDialog,
    autoDismissedMessage,
    startReimagine,
    openChoiceDialog,
    dismissNotification,
    dismissError,
    retryReimagine,
    handleReplaceBackground,
    handleAddAsSticker,
    handleDiscard,
    setAutoDismissedMessage,
  }
}
