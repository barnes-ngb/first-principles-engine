import { useEffect, useState } from 'react'
import Typography from '@mui/material/Typography'
import { doc, onSnapshot } from 'firebase/firestore'

import { bookProgressCollection, bookProgressDocId } from '../../core/firebase/firestore'
import type { BookProgress } from '../../core/types'
import { readAloudChapterLine } from '../planner-chat/readAloudCurriculum'

/**
 * *"Lincoln: chapter 7 of 58"* under a read-aloud's Curriculum row (FEAT-243).
 *
 * **Read, never stored.** Chapter progress has one home — the per-child
 * `bookProgress` document the chapter card writes — and this subscribes to it
 * read-only. It deliberately does NOT use `today/useBookProgress`, which runs
 * the FUNC-07 skip-model repair as an `updateDoc` on first load: a Curriculum
 * line must not write the chapter card's record.
 *
 * One child, because Curriculum renders the active child's tab and the boys can
 * be on different chapters. A missing document or a failed read says nothing —
 * a guessed chapter is worse than none.
 */
export default function ReadAloudChapterLine({
  familyId,
  childId,
  childName,
  chapterBookId,
}: {
  familyId: string | undefined
  childId: string | undefined
  childName: string | undefined
  chapterBookId: string
}) {
  const [state, setState] = useState<{ key: string; progress: BookProgress | null } | null>(null)
  const key = familyId && childId ? `${familyId}|${childId}|${chapterBookId}` : ''

  useEffect(() => {
    if (!familyId || !childId) return
    const ref = doc(bookProgressCollection(familyId), bookProgressDocId(childId, chapterBookId))
    const k = `${familyId}|${childId}|${chapterBookId}`
    return onSnapshot(
      ref,
      (snap) => setState({ key: k, progress: snap.exists() ? (snap.data() as BookProgress) : null }),
      () => setState({ key: k, progress: null }),
    )
  }, [familyId, childId, chapterBookId])

  // Keyed by the scope it describes, so another child's reading never stands
  // under this child's tab while the new snapshot is on its way.
  const line = state && state.key === key ? readAloudChapterLine(state.progress, childName) : null
  if (!line) return null
  return (
    <Typography variant="caption" color="text.secondary" component="div">
      {line}
    </Typography>
  )
}
