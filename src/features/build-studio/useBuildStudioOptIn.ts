// ── The per-child Build Studio opt-in: one read, one writer (LOCAL-BUILD-001) ─
//
// The read is a plain subscribe to one settings document. The write is a
// parent's explicit confirmation, and it is the ONLY thing that opens the door
// (`buildStudioAccess.ts`).
//
// Keyed by the subscription's own identity, the pattern `useChatPlannerDefaults`
// uses: a child change reads as LOADING immediately rather than carrying the
// previous child's answer for a frame. That matters more here than it does
// there — a stale `enabled: true` carried across a change would be a surface
// opening for a sibling nobody authorised, which is the exact thing the access
// rule refuses when it compares `optIn.childId` to the child being asked about.

import { useCallback, useEffect, useState } from 'react'
import { onSnapshot, setDoc } from 'firebase/firestore'

import { buildStudioOptInDoc } from '../../core/firebase/firestore'
import type { BuildStudioOptIn } from '../../core/types/buildStudio'
import { OptInStatus, type BuildStudioOptInRead } from './buildStudioAccess'

const UNSETTLED: BuildStudioOptInRead = {
  status: OptInStatus.Loading,
  enabled: false,
  childId: null,
}

/**
 * Subscribe to one child's Build Studio opt-in.
 *
 * Returns `Loading` until this child's own read answers, `Failed` when the read
 * errored — never `enabled: false`, because a failed read is not a closed door
 * and the two must not be the same sentence on screen — and `Ready` otherwise.
 *
 * A missing document is a legitimate `Ready` with `enabled: false`: nobody has
 * opted this child in. An existing document whose `childId` field does not
 * match the path it was read from is reported as **not enabled**, since the
 * field is the document's own claim about whose permission it is and a
 * disagreement is not something to resolve in the child's favour.
 */
export function useBuildStudioOptIn(
  familyId: string | null | undefined,
  childId: string | null | undefined,
): BuildStudioOptInRead {
  const key = `${familyId ?? ''}\u0000${childId ?? ''}`
  const [read, setRead] = useState<{ key: string; value: BuildStudioOptInRead }>({
    key: '',
    value: UNSETTLED,
  })

  useEffect(() => {
    if (!familyId || !childId) return
    const unsubscribe = onSnapshot(
      buildStudioOptInDoc(familyId, childId),
      (snap) => {
        const data = snap.exists() ? (snap.data() as Partial<BuildStudioOptIn>) : null
        const ownedByThisChild = !data || data.childId === childId
        setRead({
          key,
          value: {
            status: OptInStatus.Ready,
            enabled: ownedByThisChild && data?.enabled === true,
            childId,
          },
        })
      },
      (err) => {
        console.warn('[buildStudio] opt-in subscribe failed:', err)
        setRead({
          key,
          value: { status: OptInStatus.Failed, enabled: false, childId },
        })
      },
    )
    return unsubscribe
  }, [familyId, childId, key])

  // A read belonging to another identity is not this one's answer.
  return read.key === key ? read.value : UNSETTLED
}

/**
 * Write one child's opt-in. A parent's confirmed act, and nothing else calls it.
 *
 * `setDoc` with `merge: false` on purpose: the document holds three fields and
 * all three are being decided, so a merge would leave a stale `updatedAt`
 * beside a new `enabled`. It writes `childId` as well as the flag, which is
 * what the read above checks the path against.
 */
export async function setBuildStudioOptIn(args: {
  familyId: string
  childId: string
  enabled: boolean
  updatedAt?: string
}): Promise<void> {
  const { familyId, childId, enabled } = args
  if (!familyId) throw new Error('No family is signed in.')
  if (!childId || /[/\s]/.test(childId)) throw new Error('No child was selected.')
  const record: BuildStudioOptIn = {
    childId,
    enabled,
    updatedAt: args.updatedAt ?? new Date().toISOString(),
  }
  await setDoc(buildStudioOptInDoc(familyId, childId), record)
}

/**
 * The hook a parent control uses: the current value, plus a confirmed setter
 * that reports its own failure instead of leaving a toggle looking saved.
 */
export function useBuildStudioOptInControl(
  familyId: string | null | undefined,
  childId: string | null | undefined,
) {
  const read = useBuildStudioOptIn(familyId, childId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = useCallback(
    async (enabled: boolean) => {
      if (!familyId || !childId) return
      setError(null)
      setSaving(true)
      try {
        await setBuildStudioOptIn({ familyId, childId, enabled })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setSaving(false)
      }
    },
    [familyId, childId],
  )

  return { read, saving, error, confirm }
}
