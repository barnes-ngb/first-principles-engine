import { useEffect, useState } from 'react'
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../core/firebase/firestore'
import type { WordProgress, WordMasteryLevel } from '../../core/types'

export interface PatternSummary {
  pattern: string
  totalWords: number
  knownWords: number
  emergingWords: number
  strugglingWords: number
  notYetWords: number
  masteryPercent: number
}

const MASTERY_SORT_ORDER: Record<string, number> = {
  struggling: 0,
  'not-yet': 1,
  emerging: 2,
  known: 3,
}

export type WordFilter = 'all' | WordMasteryLevel

export function useWordWall(familyId: string, childId: string) {
  const [words, setWords] = useState<WordProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<WordFilter>('all')

  useEffect(() => {
    if (!familyId || !childId) {
      setWords([])
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const ref = collection(db, `families/${familyId}/children/${childId}/wordProgress`)
        const snap = await getDocs(ref)
        if (cancelled) return

        const loaded = snap.docs.map((d) => ({
          ...(d.data() as WordProgress),
          word: d.data().word ?? d.id,
        }))

        loaded.sort((a, b) => {
          const orderA = MASTERY_SORT_ORDER[a.masteryLevel] ?? 4
          const orderB = MASTERY_SORT_ORDER[b.masteryLevel] ?? 4
          return orderA - orderB
        })

        setWords(loaded)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [familyId, childId])

  const filteredWords = filter === 'all'
    ? words
    : words.filter((w) => w.masteryLevel === filter)

  const patterns: PatternSummary[] = (() => {
    const byPattern = new Map<string, WordProgress[]>()
    for (const w of words) {
      const key = w.pattern || 'Unknown'
      if (!byPattern.has(key)) byPattern.set(key, [])
      byPattern.get(key)!.push(w)
    }

    return [...byPattern.entries()]
      .map(([pattern, items]) => {
        const knownWords = items.filter((w) => w.masteryLevel === 'known').length
        return {
          pattern,
          totalWords: items.length,
          knownWords,
          emergingWords: items.filter((w) => w.masteryLevel === 'emerging').length,
          strugglingWords: items.filter((w) => w.masteryLevel === 'struggling').length,
          notYetWords: items.filter((w) => w.masteryLevel === 'not-yet').length,
          masteryPercent: items.length > 0 ? Math.round((knownWords / items.length) * 100) : 0,
        }
      })
      .sort((a, b) => a.masteryPercent - b.masteryPercent)
  })()

  const stats = {
    total: words.length,
    known: words.filter((w) => w.masteryLevel === 'known').length,
    emerging: words.filter((w) => w.masteryLevel === 'emerging').length,
    struggling: words.filter((w) => w.masteryLevel === 'struggling').length,
    notYet: words.filter((w) => w.masteryLevel === 'not-yet').length,
  }

  const strugglingWords = words
    .filter((w) => w.masteryLevel === 'struggling' || w.masteryLevel === 'not-yet')
    .map((w) => w.word)

  const markAsKnown = async (word: string) => {
    if (!familyId || !childId) return
    const wordDoc = words.find((w) => w.word === word)
    if (!wordDoc) return

    const docRef = doc(db, `families/${familyId}/children/${childId}/wordProgress`, word)
    await updateDoc(docRef, { masteryLevel: 'known' })

    setWords((prev) =>
      prev.map((w) =>
        w.word === word ? { ...w, masteryLevel: 'known' as const } : w,
      ),
    )
  }

  return {
    words: filteredWords,
    allWords: words,
    patterns,
    stats,
    loading,
    filter,
    setFilter,
    strugglingWords,
    markAsKnown,
  }
}
