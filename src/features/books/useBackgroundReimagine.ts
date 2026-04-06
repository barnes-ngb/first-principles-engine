import { useCallback, useEffect, useRef, useState } from 'react'
import { addDoc } from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import { stickerLibraryCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { useAI } from '../../core/ai/useAI'
import type { EnhanceSketchRequest } from '../../core/ai/useAI'

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
}

interface UseBackgroundReimagineOptions {
  familyId: string
  childId: string
  childName: string
  /** Called when user picks "Add to page" */
  onAddToPage: (pageId: string, imageId: string, url: string, storagePath: string) => void
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
  onAddToPage,
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

  // ── Auto-dismiss: save to gallery after 5 minutes ────────────────
  useEffect(() => {
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current)
      autoDismissRef.current = null
    }
    if (!job || job.status !== 'done') return

    autoDismissRef.current = setTimeout(() => {
      if (job.resultUrl) {
        void saveToGallery(job.resultUrl, job.resultStoragePath)
        setAutoDismissedMessage('Your reimagined drawing was saved to your sticker library')
      }
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
      })

      try {
        const style: EnhanceSketchRequest['style'] =
          intensity <= 25 ? 'storybook' : intensity >= 75 ? 'comic' : 'storybook'

        const result = await enhanceSketch({
          familyId,
          sketchStoragePath: storagePath,
          style,
          caption,
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
    [enhanceSketch, familyId],
  )

  // ── Actions on the result ────────────────────────────────────────

  const openChoiceDialog = useCallback(() => {
    setShowChoiceDialog(true)
  }, [])

  const dismissNotification = useCallback(() => {
    setJob(null)
    setShowChoiceDialog(false)
  }, [])

  const handleAddToPage = useCallback(() => {
    if (!job || job.status !== 'done' || !job.resultUrl) return
    onAddToPage(job.sourcePageId, job.sourceImageId, job.resultUrl, job.resultStoragePath ?? '')
    setJob(null)
    setShowChoiceDialog(false)
  }, [job, onAddToPage])

  const handleMakeSticker = useCallback(() => {
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

  const handleSaveToGallery = useCallback(async () => {
    await saveToGallery()
    setJob(null)
    setShowChoiceDialog(false)
  }, [saveToGallery])

  const handleDiscard = useCallback(async () => {
    // Delete the reimagined image from Storage
    if (job?.resultStoragePath) {
      try {
        await deleteObject(ref(storage, job.resultStoragePath))
      } catch {
        // Best effort
      }
    }
    setJob(null)
    setShowChoiceDialog(false)
  }, [job?.resultStoragePath])

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
    handleAddToPage,
    handleMakeSticker,
    handleSaveToGallery,
    handleDiscard,
    setAutoDismissedMessage,
  }
}
