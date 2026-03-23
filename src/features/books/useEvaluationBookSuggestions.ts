import { useEffect, useMemo, useState } from 'react'
import { getDocs, orderBy, query, where, limit } from 'firebase/firestore'

import {
  evaluationSessionsCollection,
  sightWordProgressCollection,
  skillSnapshotsCollection,
} from '../../core/firebase/firestore'
import type { SightWordProgress } from '../../core/types'

// ── Types ──────────────────────────────────────────────────────

export interface BookSuggestion {
  /** Unique key for dedup */
  id: string
  /** Explanation shown to the parent */
  reason: string
  /** Words to prefill when creating a sight word book */
  words: string[]
  /** Suggested theme for the book */
  theme?: string
  /** Source of the suggestion */
  source: 'evaluation' | 'sight-word-progress' | 'skill-snapshot'
}

interface EvalFinding {
  skill: string
  status: string
  evidence?: string
  notes?: string
}

interface EvalSessionData {
  childId: string
  domain: string
  status: string
  findings?: EvalFinding[]
  recommendations?: Array<{ action: string; details?: string }>
  evaluatedAt?: string
}

// ── Hook ───────────────────────────────────────────────────────

/**
 * Loads evaluation data and sight word progress to generate
 * book creation suggestions. Returns up to 3 actionable suggestions.
 */
export function useEvaluationBookSuggestions(familyId: string, childId: string) {
  const [suggestions, setSuggestions] = useState<BookSuggestion[]>([])
  const [loading, setLoading] = useState(!!familyId && !!childId)

  useEffect(() => {
    if (!familyId || !childId) return
    let cancelled = false

    const load = async () => {
      const results: BookSuggestion[] = []

      // ── 1. Check recent Reading evaluations for weak skills ──
      try {
        const evalSnap = await getDocs(
          query(
            evaluationSessionsCollection(familyId),
            where('childId', '==', childId),
            where('domain', '==', 'Reading'),
            where('status', '==', 'complete'),
            orderBy('evaluatedAt', 'desc'),
            limit(1),
          ),
        )

        if (!cancelled && !evalSnap.empty) {
          const session = evalSnap.docs[0].data() as EvalSessionData
          const findings = session.findings ?? []

          // Extract struggling/emerging reading skills
          const weakFindings = findings.filter(
            (f) =>
              f.status === 'emerging' ||
              f.status === 'not-yet' ||
              f.status === 'struggling',
          )

          // Look for sight-word-related findings
          const sightWordFindings = weakFindings.filter(
            (f) =>
              f.skill.includes('sight') ||
              f.skill.includes('sightWord') ||
              f.skill.includes('reading.sightWords'),
          )

          if (sightWordFindings.length > 0) {
            results.push({
              id: 'eval-sight-words',
              reason: `Recent evaluation found sight word skills need practice. Generate a book targeting these patterns.`,
              words: [], // Will be filled from sight word progress below
              theme: 'Minecraft adventure',
              source: 'evaluation',
            })
          }

          // Look for phonics/decoding findings → suggest phonics-focused book
          const phonicsFindings = weakFindings.filter(
            (f) =>
              f.skill.includes('phonics') ||
              f.skill.includes('cvc') ||
              f.skill.includes('blend') ||
              f.skill.includes('decoding'),
          )

          if (phonicsFindings.length > 0) {
            const skillLabels = phonicsFindings
              .map((f) => f.skill.split('.').pop())
              .join(', ')
            results.push({
              id: 'eval-phonics',
              reason: `Evaluation identified ${skillLabels} as emerging. A story with simple CVC words can reinforce these patterns.`,
              words: [],
              theme: 'Minecraft adventure with simple words',
              source: 'evaluation',
            })
          }
        }
      } catch (err) {
        console.warn('Failed to load evaluation sessions for book suggestions:', err)
      }

      // ── 2. Check sight word progress for words needing work ──
      try {
        const swSnap = await getDocs(
          query(sightWordProgressCollection(familyId)),
        )

        if (!cancelled) {
          const weakWords: string[] = []
          for (const d of swSnap.docs) {
            if (!d.id.startsWith(`${childId}_`)) continue
            const progress = d.data() as SightWordProgress
            if (
              progress.masteryLevel === 'new' ||
              progress.masteryLevel === 'practicing'
            ) {
              weakWords.push(progress.word)
            }
          }

          if (weakWords.length >= 3) {
            // If we already have an eval suggestion, enrich it with weak words
            const evalSuggestion = results.find((r) => r.id === 'eval-sight-words')
            if (evalSuggestion) {
              evalSuggestion.words = weakWords.slice(0, 15)
            } else {
              results.push({
                id: 'progress-weak-words',
                reason: `${weakWords.length} sight words still need practice. Generate a story using these words.`,
                words: weakWords.slice(0, 15),
                theme: 'Minecraft adventure',
                source: 'sight-word-progress',
              })
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load sight word progress for book suggestions:', err)
      }

      // ── 3. Check skill snapshot for reading priority skills ──
      try {
        const snapDoc = await getDocs(
          query(
            skillSnapshotsCollection(familyId),
            where('childId', '==', childId),
            limit(1),
          ),
        )

        if (!cancelled && !snapDoc.empty) {
          const snapshot = snapDoc.docs[0].data() as {
            prioritySkills?: Array<{ tag: string; label: string; level: string }>
          }
          const readingSkills = (snapshot.prioritySkills ?? []).filter(
            (s) =>
              s.tag.startsWith('reading.') &&
              (s.level === 'emerging' || s.level === 'developing'),
          )

          if (readingSkills.length > 0 && !results.some((r) => r.source === 'evaluation')) {
            results.push({
              id: 'snapshot-reading',
              reason: `${readingSkills.map((s) => s.label).join(' and ')} ${readingSkills.length === 1 ? 'is' : 'are'} at ${readingSkills[0].level} level. A targeted reading book can help build fluency.`,
              words: [],
              theme: 'Minecraft adventure',
              source: 'skill-snapshot',
            })
          }
        }
      } catch (err) {
        console.warn('Failed to load skill snapshot for book suggestions:', err)
      }

      if (!cancelled) {
        setSuggestions(results.slice(0, 3))
        setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [familyId, childId])

  return { suggestions, loading }
}

/**
 * Returns mastered words from sight word progress that the planner
 * should skip/deprioritize. Used by contextSlices to enhance planner context.
 */
export function useMasteredWordsForPlanner(
  allProgress: SightWordProgress[],
): { masteredWords: string[]; focusWords: string[] } {
  return useMemo(() => {
    const mastered = allProgress
      .filter((p) => p.masteryLevel === 'mastered' || p.shellyConfirmed)
      .map((p) => p.word)
    const focus = allProgress
      .filter((p) => p.masteryLevel === 'new' || p.masteryLevel === 'practicing')
      .map((p) => p.word)
    return { masteredWords: mastered, focusWords: focus }
  }, [allProgress])
}
