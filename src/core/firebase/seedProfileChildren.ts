/**
 * **A profile child is seeded under a deterministic id, create-only, in one
 * transaction** — `UX-394`, the `UX-231` rail applied to `children`.
 *
 * The `UX-383` restore survey loops `childrenCollection` and prints one row per
 * document. It printed far more than two, named Lincoln and London, and
 * `useChildren` already knew why:
 *
 * > *"Concurrent mounts in earlier sessions could race auto-create and produce
 * > duplicate Lincoln/London docs. Keep the oldest doc per name so the
 * > canonical ID stays stable."*
 *
 * `dedupeChildrenByName` hides the symptom **on read**. The write kept the
 * shape that produces it, and it is the shape `UX-231` diagnosed on
 * `activityConfigs`: a check-then-act from an effect (read the collection, see
 * a name missing, `addDoc`), with no deterministic id and no transaction. Two
 * mounts, two tabs or two devices with a cold cache all read "missing" before
 * either writes, and each appends its own document. **A check-then-act from a
 * hook mounted on every page is a race with as many runners as there are
 * mounts.**
 *
 * The fix is the same one, and for the same reason: an id derived from the
 * profile means a second runner **addresses the same document** instead of
 * appending one, which holds across tabs and devices where an in-process guard
 * cannot reach.
 *
 * **The two canonical documents do not move.** `skillSnapshots`,
 * `learnerModels`, `xpLedger`, every `childId` field on every artifact, day and
 * hours row — all of them key on the ids those documents already have, which
 * are random and were minted years ago. Nothing here renames, copies or
 * migrates them. This module only ever writes a child that is **missing**, and
 * a family whose Lincoln and London already exist never reaches it. What
 * changes is the *second* runner's behaviour when one genuinely is missing: it
 * now collides harmlessly instead of creating a ghost.
 *
 * **Create, never overwrite** (the `UX-231` lesson): the existence check and
 * the write are one transaction, so a slow runner that read "missing" before a
 * faster one committed writes nothing rather than restoring a blank identity
 * over a `birthdate` the parent has since corrected in Settings. A runner that
 * finds the document already there returns **its** data, so both callers agree
 * on one child rather than one of them believing in a document it did not get.
 *
 * It writes `children` and nothing else.
 */

import { doc, runTransaction } from 'firebase/firestore'

import { db, childrenCollection } from './firestore'
import { nameKey } from '../utils/nameKey'
import type { Child } from '../types'

/** One canonical profile child, as `useChildren.PROFILE_CHILDREN` declares it. */
export interface ProfileChildSeed {
  /** The `UserProfile` value this child is the record for. */
  profile: string
  name: string
  birthdate: string
  grade: string
}

/**
 * The document id for a seeded profile child — the `UX-231` rail.
 *
 * Keyed on the **profile**, not the name: the profile is a `UserProfile`
 * constant that cannot be retyped, while the name is a field a parent may one
 * day edit, and an id that moves when a name is corrected is not an id. Run
 * through the shared `nameKey` so the value can never carry a character
 * Firestore refuses in a document id.
 *
 * The `seed-` prefix is load-bearing in exactly the way `artQuota`'s `wk-`
 * segment and `seedConfigDocId`'s own prefix are: it keeps these ids in a
 * namespace of their own, so a seeded document can never collide with one
 * Firestore auto-generated for a child a parent added by hand.
 */
export function seedChildDocId(profile: string): string {
  return `seed-${nameKey(profile)}`
}

/** The document body written for a brand-new profile child. */
export function seedChildData(seed: ProfileChildSeed, now: string): Child {
  // Brand-new doc: seed real identity (birthdate/grade) alongside name. This is
  // doc creation, not a record edit — existing docs are backfilled by the parent
  // via the Settings identity editor (propose → confirm).
  return {
    id: '',
    name: seed.name,
    birthdate: seed.birthdate,
    grade: seed.grade,
    createdAt: now,
  }
}

/**
 * In-flight seeds, keyed by family + the profiles being seeded.
 *
 * `useChildren` is reached from `useActiveChild`, which is read by 71 source
 * files, so on a first load several callers arrive within a frame of each
 * other. This is the **saver**, not the rail — a second tab has its own module
 * instance and is caught by {@link seedChildDocId}.
 */
const inFlightSeeds = new Map<string, Promise<Child[]>>()

/** Visible for tests: forget any in-flight seed so each case starts clean. */
export function __resetProfileChildSeedState(): void {
  inFlightSeeds.clear()
}

/**
 * Create the profile children a family does not have, and return them.
 *
 * Every returned child carries the id of the document that actually exists —
 * the one this call created, or the one a concurrent runner created first.
 * Returns `[]` for an empty `missing` list without touching Firestore.
 */
export function seedProfileChildren(
  familyId: string,
  missing: readonly ProfileChildSeed[],
  now: string = new Date().toISOString(),
): Promise<Child[]> {
  if (!familyId || missing.length === 0) return Promise.resolve([])

  const key = `${familyId}:${missing.map((m) => m.profile).sort().join(',')}`
  const existing = inFlightSeeds.get(key)
  if (existing) return existing

  const run = runSeed(familyId, missing, now).finally(() => {
    inFlightSeeds.delete(key)
  })
  inFlightSeeds.set(key, run)
  return run
}

async function runSeed(
  familyId: string,
  missing: readonly ProfileChildSeed[],
  now: string,
): Promise<Child[]> {
  return runTransaction(db, async (tx) => {
    const refs = missing.map((m) =>
      doc(childrenCollection(familyId), seedChildDocId(m.profile)),
    )
    // Every read before any write — a Firestore transaction requires it.
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)))

    return snaps.map((snap, i) => {
      if (snap.exists()) {
        // Someone won the race. Their document is the child; this call does not
        // write over it, and reports it rather than a document it did not make.
        return { ...(snap.data() as Child), id: refs[i].id }
      }
      const data = seedChildData(missing[i], now)
      tx.set(refs[i], data)
      return { ...data, id: refs[i].id }
    })
  })
}
