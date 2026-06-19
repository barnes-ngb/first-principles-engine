import { useCallback, useEffect, useRef, useState } from 'react'
import { addDoc } from 'firebase/firestore'
import { artifactsCollection, stickerLibraryCollection } from '../../core/firebase/firestore'
import { useAI } from '../../core/ai/useAI'
import type { EnhanceSketchRequest } from '../../core/ai/useAI'
import type { Artifact } from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'

export interface ReimagineJob {
  id: string
  sourceImageUrl: string
  sourceImageId: string
  sourcePageId: string
  status: 'processing' | 'done' | 'failed'
  resultUrl?: string
  resultStoragePath?: string
  error?: string
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
}

/** Auto-dismiss timeout: save to gallery after 5 minutes of no interaction. */
const AUTO_DISMISS_MS = 5 * 60 * 1000
/** Client-side timeout: mark as failed after 3 minutes with no result. */
const CLIENT_TIMEOUT_MS = 3 * 60 * 1000

export function useBackgroundReimagine({
  familyId,
  childId,
  childName,
  bookTheme,
  onReplaceBackground,
  onAddSticker,
}: UseBackgroundReimagineOptions) {
  const [job, setJob] = useState<ReimagineJob | null>(null)
  const [showChoiceDialog, setShowChoiceDialog] = useState(false)
  const [autoDismissedMessage, setAutoDismissedMessage] = useState<string | null>(null)
  const { enhanceSketch } = useAI()
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
        const style: EnhanceSketchRequest['style'] =
          intensity <= 25 ? 'storybook' : intensity >= 75 ? 'comic' : 'storybook'

        const result = await enhanceSketch({
          familyId,
          sketchStoragePath: storagePath,
          style,
          caption,
          theme: bookTheme,
          transparent,
        })

        if (result?.url) {
          setJob((prev) =>
            prev?.id === jobId
              ? { ...prev, status: 'done', resultUrl: result.url, resultStoragePath: result.storagePath }
              : prev,
          )
        } else {
          setJob((prev) =>
            prev?.id === jobId
              ? { ...prev, status: 'failed', error: 'No image returned' }
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
    [enhanceSketch, familyId, bookTheme],
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

  const handleSaveToGallery = useCallback(async () => {
    // Already auto-saved, just dismiss
    setJob(null)
    setShowChoiceDialog(false)
  }, [])

  const handleDiscard = useCallback(() => {
    // Don't delete from storage — auto-saved to gallery, so the reference remains valid.
    // "Discard" means "don't add to this page right now."
    setJob(null)
    setShowChoiceDialog(false)
  }, [])

  const dismissError = useCallback(() => {
    setJob(null)
  }, [])

  return {
    job,
    showChoiceDialog,
    autoDismissedMessage,
    startReimagine,
    openChoiceDialog,
    dismissNotification,
    dismissError,
    handleReplaceBackground,
    handleAddAsSticker,
    handleSaveToGallery,
    handleDiscard,
    setAutoDismissedMessage,
  }
}
