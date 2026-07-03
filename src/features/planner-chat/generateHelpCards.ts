import { doc, setDoc } from 'firebase/firestore'

import { helpCardsCollection } from '../../core/firebase/firestore'
import { TaskType } from '../../core/ai/useAI'
import type { ChatRequest, ChatResponse } from '../../core/ai/useAI'
import type { DraftPlanItem, HelpCard, HelpCardBody } from '../../core/types'
import {
  helpCardDocId,
  normalizeHelpCardLabel,
  qualifiesForHelpCard,
} from '../../core/utils/helpCard'

/** The `chat` function from useAI, narrowed to what this module needs. */
type AiChat = (req: ChatRequest) => Promise<ChatResponse | null>

/** Parse + shallow-validate the Help Card body the CF returns (clean JSON). */
function parseHelpCardBody(message: string): HelpCardBody | null {
  try {
    const parsed = JSON.parse(message) as HelpCardBody
    if (!parsed?.playIt?.title || !Array.isArray(parsed.playIt.howTo)) return null
    if (!Array.isArray(parsed.sayThis) || parsed.sayThis.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Batch-generate Help Card bodies at plan lock-in (FEAT-43, D1: batch-at-lock-in
 * only — no regeneration, no staleness machinery). For the must-do Reading/Math
 * items in the accepted draft, generate one card per distinct activity (deduped
 * by help-card key) and write it to `families/{familyId}/helpCards`.
 *
 * Non-blocking by contract: every failure is swallowed per item so lock-in
 * always succeeds even if every card generation fails (the card slot just stays
 * absent). Runs in small sequential batches to respect AI rate limits.
 *
 * @returns the number of cards successfully written.
 */
export async function generateHelpCardsForPlan(opts: {
  familyId: string
  childId: string
  days: Array<{ items: DraftPlanItem[] }>
  aiChat: AiChat
  onProgress?: (done: number, total: number) => void
}): Promise<number> {
  const { familyId, childId, days, aiChat, onProgress } = opts
  if (!familyId || !childId) return 0

  // Collect qualifying accepted items, deduped by help-card key (one card per
  // distinct activity across the week — the body is day-agnostic).
  const seen = new Set<string>()
  const targets: DraftPlanItem[] = []
  for (const day of days) {
    for (const item of day.items) {
      if (!item.accepted || item.isAppBlock) continue
      const keyable = { label: item.title, subjectBucket: item.subjectBucket }
      if (!qualifiesForHelpCard({
        label: item.title,
        subjectBucket: item.subjectBucket,
        category: item.category,
        mvdEssential: item.mvdEssential,
      })) continue
      const id = helpCardDocId(childId, keyable)
      if (seen.has(id)) continue
      seen.add(id)
      targets.push(item)
    }
  }

  if (targets.length === 0) return 0

  let written = 0
  let done = 0
  const total = targets.length
  const batchSize = 3

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize)
    await Promise.allSettled(
      batch.map(async (item) => {
        try {
          const res = await aiChat({
            familyId,
            childId,
            taskType: TaskType.HelpCard,
            messages: [
              {
                role: 'user',
                content: JSON.stringify({
                  label: item.title,
                  subjectBucket: item.subjectBucket,
                  contentGuide: item.contentGuide,
                  skillTags: item.skillTags,
                }),
              },
            ],
          })
          if (!res?.message) return
          const body = parseHelpCardBody(res.message)
          if (!body) return

          const docId = helpCardDocId(childId, { label: item.title, subjectBucket: item.subjectBucket })
          const now = new Date().toISOString()
          const card: Omit<HelpCard, 'id' | 'video' | 'videoFetchedAt'> = {
            childId,
            itemLabel: normalizeHelpCardLabel(item.title),
            subjectBucket: item.subjectBucket,
            body,
            model: res.model,
            createdAt: now,
            updatedAt: now,
          }
          // merge: preserve any already-cached video from a prior lock-in.
          await setDoc(doc(helpCardsCollection(familyId), docId), card, { merge: true })
          written++
        } catch (err) {
          console.warn(`[HelpCards] Failed to generate card for "${item.title}":`, err)
        } finally {
          done++
          onProgress?.(done, total)
        }
      }),
    )
  }

  return written
}
