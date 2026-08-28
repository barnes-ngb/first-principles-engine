import { useCallback, useState } from 'react'

/** "Lincoln's drawing" when we know whose it is, else the neutral fallback. */
export function defaultStickerLabel(childName?: string): string {
  return childName ? `${childName}'s drawing` : 'My drawing'
}

export interface StickerLabelState {
  /** The label to show and save. */
  label: string
  /** Record a typed label — from here on the default no longer overwrites it. */
  setLabel: (next: string) => void
  /** Back to the default for the current child (a new capture). */
  resetLabel: () => void
  /** The current default, for tag seeding and placeholder copy. */
  defaultLabel: string
}

/**
 * Seed a new sticker's label from the active child — and *keep* seeding it until
 * the kid types their own name for it (FEAT-160).
 *
 * The bug this exists to kill: the capture dialog mounts with its page, which is
 * before `useActiveChild` has resolved, so a plain `useState(defaultLabel)`
 * captures `childName === ''` and the drawing is saved as "My drawing" even with
 * Lincoln showing in the header — exactly what Nathan reported. The name arriving
 * a tick later must still land, so the default is *derived* rather than seeded
 * once, and only an actual edit pins it.
 */
export function useStickerLabel(childName?: string): StickerLabelState {
  const defaultLabel = defaultStickerLabel(childName)
  // Only what the kid *typed* is state. The default is derived every render, so
  // a child that resolves late simply shows up — no effect, no re-seeding pass,
  // and nothing that can clobber a typed name.
  const [typed, setTyped] = useState<string | null>(null)

  const setLabel = useCallback((next: string) => setTyped(next), [])
  const resetLabel = useCallback(() => setTyped(null), [])

  return { label: typed ?? defaultLabel, setLabel, resetLabel, defaultLabel }
}
