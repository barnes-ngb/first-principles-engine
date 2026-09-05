// ── Read-only activity-config subscribe for the Shelly portal (FEAT-135) ──
//
// The chat needs the family's live activity configs for two reasons: to resolve
// a proposed `setActivityMinutes` id to a REAL config before a confirm card is
// offered, and to render that card by NAME with a true old → new diff.
//
// Deliberately NOT `useActivityConfigs`: that hook runs the migration +
// default-seeding side effects (`migrateToActivityConfigs` /
// `ensureDefaultActivityConfigs`) and exposes a full writer surface. Opening a
// chat tab should not migrate anything or create configs, and the portal's only
// activity write goes through the narrow `updateActivityConfigMinutes` helper.
// So this is a plain read: subscribe, sort, hand back.
//
// **A second reader since FEAT-199:** Kid Today's quick-log row
// (`today/KidExtraLogger` → `today/quickLogChips`) needs the same live configs
// for the same reason — a KID opening Today must not seed or migrate anything —
// so it imports this rather than growing a third copy of the subscribe. The
// name still says "chat" because that is where it was written and a rename
// touches more files than it is worth; read it as *the read-only one*.

import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'

import { activityConfigsCollection } from '../../core/firebase/firestore'
import type { ActivityConfig } from '../../core/types'

const EMPTY: ActivityConfig[] = []

/**
 * Cache key identifying one (family, child) subscription.
 *
 * The separator is a NUL, the one character a Firestore id can never contain,
 * so ids that would collide under naive concatenation — `('ab', 'c')` vs
 * `('a', 'bc')` — stay distinct. That matters because the key is what keeps a
 * previous child's configs out of the resolution gate.
 *
 * The NUL MUST be written as the `\u0000` escape, never as a raw NUL byte: a
 * raw byte makes git classify this file as binary, so it renders as "Binary
 * file not shown" in review and `git diff` / `git blame` stop working on it.
 * The escape form is byte-identical at runtime and leaves the file plain text.
 */
export function chatActivityConfigsCacheKey(familyId: string, childId: string): string {
  return `${familyId}\u0000${childId}`
}

/**
 * Subscribe to the activity configs visible to one child — the child's own plus
 * shared (`'both'`) ones.
 *
 * **Completed configs are included** (FEAT-143). They used to be filtered out
 * here, which made a proposal against a finished program refuse as "that didn't
 * match one of your activities" — false, and unhelpful, about an activity the
 * parent can see in Curriculum's Completed list. The resolvers now refuse a
 * completed config explicitly and BY NAME (`resolveActivityConfig` for
 * `setActivityMinutes`, `resolveCurriculumAction` for the curriculum kinds), so
 * every prior refusal still refuses — with the true reason.
 *
 * Returns `[]` while loading, when either id is missing, or on error: an empty
 * list simply means no activity proposal can resolve, which fails closed rather
 * than offering a card the app can't back with a real config.
 */
export function useChatActivityConfigs(familyId: string, childId: string): ActivityConfig[] {
  // Keyed by the subscription's identity so a child/family switch reads as
  // empty immediately, without a synchronous setState in the effect. Configs
  // from the previous child must never be visible to the resolution gate.
  const key = chatActivityConfigsCacheKey(familyId, childId)
  const [loaded, setLoaded] = useState<{ key: string; configs: ActivityConfig[] }>({
    key: '',
    configs: EMPTY,
  })

  useEffect(() => {
    if (!familyId || !childId) return

    const q = query(
      activityConfigsCollection(familyId),
      where('childId', 'in', [childId, 'both']),
    )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setLoaded({
          key,
          configs: snap.docs
            .map((d) => ({ ...(d.data() as ActivityConfig), id: d.id }))
            .sort((a, b) => a.sortOrder - b.sortOrder),
        })
      },
      (err) => {
        console.warn('[shellyChat] activity config subscribe failed:', err)
        setLoaded({ key, configs: EMPTY })
      },
    )

    return unsubscribe
  }, [familyId, childId, key])

  return loaded.key === key ? loaded.configs : EMPTY
}
