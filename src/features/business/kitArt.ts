// ── Kit art pipeline — pure helpers (FEAT-88) ─────────────────────
//
// The last "make it graphic" piece of the GDQ Kit Builder (FEAT-80): a roster's
// characters (hero, defenders, invaders) become transparent-background sticker
// art, and the kit's catalog product (FEAT-81) gets a real image. This module
// holds the pure, side-effect-free logic — the image-prompt builder, the stable
// character-key scheme, the additive art merge, and the roster-art → product-
// image projection. All I/O (the `generateImage` call, `updateRoster` /
// `updateProduct`) lives in the surfaces that import these.
//
// Load-bearing invariants (owner-aligned):
//   1. The kid's words drive the prompt — name + descriptor go in VERBATIM
//      (only defensive whitespace-collapse + a length cap), never "improved".
//   2. The catalog only ever REFERENCES existing art (`CatalogImageRef`) — this
//      module maps stored roster art to image refs, it never generates.
//   3. Character keys are STABLE ids (`defender:${id}`), not indices, so art
//      survives a reorder / mid-list edit.

import type { CatalogImageRef, KitRoster } from '../../core/types/business'

// ── Stable character keys ─────────────────────────────────────────

/** The hero's art key (one hero per roster). */
export const HERO_ART_KEY = 'hero'
/** Art key for a defender, by its stable id. */
export const defenderArtKey = (id: string): string => `defender:${id}`
/** Art key for an invader, by its stable id. */
export const invaderArtKey = (id: string): string => `invader:${id}`

// ── Prompt builder ────────────────────────────────────────────────

/**
 * Per-field cap on kid free-text folded into an image prompt. Defensive only —
 * a runaway field can't blow the prompt budget or the copyright-rewrite step.
 */
export const MAX_PROMPT_FIELD = 200

/**
 * Style scaffolding appended AFTER the kid's words. `book-sticker` (the style
 * the surface passes to `generateImage`) already forces a single character,
 * clean outline, no text, and a transparent PNG server-side; this reinforces a
 * full-body die-cut sticker and adds the GDQ / plants-vs-zombies garden energy.
 * `book-illustration-garden-warfare` was rejected as the style: it is a *scene*
 * style (opaque background, "environment only, no specific characters") — the
 * wrong tool for a single transparent character. We keep its energy here, in
 * words, over the transparent `book-sticker` path.
 */
export const KIT_STICKER_SCAFFOLD =
  'single full-body character, plants-vs-zombies garden-defense cartoon style, ' +
  'bold clean outline, bright flat colors, die-cut sticker, transparent background, ' +
  'kid-friendly, no text'

/**
 * Defensive tidy of a kid free-text field before it enters a prompt: collapse
 * whitespace runs (incl. newlines/tabs) to single spaces, trim, and cap length.
 * Deliberately does NOT touch spelling, capitalization, or word choice — the
 * kid's words stay verbatim; this is length/whitespace hygiene only.
 */
export function sanitizeKidText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_PROMPT_FIELD)
}

/**
 * Build the image prompt for one character from the kid's stored name +
 * descriptor (a defender's power, an invader's menace, or the hero's look+move).
 * The kid's words come FIRST and verbatim; the style scaffold is appended, never
 * blended into their words. Falls back to the scaffold alone if both are empty.
 */
export function buildKitCharacterPrompt(character: { name: string; descriptor: string }): string {
  const name = sanitizeKidText(character.name)
  const descriptor = sanitizeKidText(character.descriptor)
  const lead = [name, descriptor].filter((s) => s !== '').join(', ')
  return lead !== '' ? `${lead}. ${KIT_STICKER_SCAFFOLD}.` : `${KIT_STICKER_SCAFFOLD}.`
}

// ── Character enumeration ─────────────────────────────────────────

/** A roster character reduced to what the art pipeline needs. */
export interface KitCharacter {
  /** Stable art key (`hero` | `defender:${id}` | `invader:${id}`). */
  key: string
  /** Human label for the row / image alt, e.g. "Hero", "Defender 1". */
  label: string
  /** The kid's verbatim name. */
  name: string
  /** The kid's verbatim descriptor (hero look+move / power / menace). */
  descriptor: string
}

/** The hero's visual descriptor — look + special move, verbatim, in that order. */
export function heroDescriptor(roster: Pick<KitRoster, 'heroLook' | 'heroMove'>): string {
  return [roster.heroLook, roster.heroMove].map((s) => s.trim()).filter((s) => s !== '').join(', ')
}

/**
 * Enumerate a roster's characters in canonical order — hero, then defenders (in
 * roster order), then invaders. A character is only included if it has a name
 * OR a descriptor (an entirely-empty row is nothing to draw).
 */
export function rosterCharacters(roster: KitRoster): KitCharacter[] {
  const out: KitCharacter[] = []
  const hero = heroDescriptor(roster)
  if (roster.heroName.trim() !== '' || hero !== '') {
    out.push({ key: HERO_ART_KEY, label: 'Hero', name: roster.heroName, descriptor: hero })
  }
  roster.defenders.forEach((d, i) => {
    if (d.name.trim() !== '' || d.power.trim() !== '') {
      out.push({ key: defenderArtKey(d.id), label: `Defender ${i + 1}`, name: d.name, descriptor: d.power })
    }
  })
  roster.invaders.forEach((inv, i) => {
    if (inv.name.trim() !== '' || inv.menace.trim() !== '') {
      out.push({ key: invaderArtKey(inv.id), label: `Invader ${i + 1}`, name: inv.name, descriptor: inv.menace })
    }
  })
  return out
}

/**
 * Characters that have real content but no generated art yet — the set a
 * "Generate all remaining" convenience button would cover (each an explicit,
 * paid image call, so the surface confirms the count before firing).
 */
export function charactersNeedingArt(roster: KitRoster): KitCharacter[] {
  const art = roster.art ?? {}
  return rosterCharacters(roster).filter((c) => !art[c.key]?.url)
}

// ── Product-image projection ──────────────────────────────────────
//
// (The additive per-key art WRITE is `useKitRosters.setRosterArt`, an atomic
// `art.<key>` field-path update — no client-side read/merge, so concurrent
// per-character generations never clobber each other.)

/**
 * Project a roster's stored art onto ordered catalog image refs — hero first
 * (so it lands at `images[0]`), then defenders, then invaders, each labelled
 * from the character's verbatim name. Only characters that actually have art are
 * included; a roster with no art yields `[]`. Pure — references existing Storage
 * URLs, never generates or copies.
 */
export function artToProductImages(roster: KitRoster): CatalogImageRef[] {
  const art = roster.art ?? {}
  const out: CatalogImageRef[] = []
  const push = (key: string, alt: string) => {
    const ref = art[key]
    if (ref?.url) out.push({ url: ref.url, alt })
  }
  push(HERO_ART_KEY, roster.heroName.trim() || 'Hero')
  roster.defenders.forEach((d, i) => push(defenderArtKey(d.id), d.name.trim() || `Defender ${i + 1}`))
  roster.invaders.forEach((inv, i) => push(invaderArtKey(inv.id), inv.name.trim() || `Invader ${i + 1}`))
  return out
}

/** Whether a roster has any generated art at all (drives the product-image affordance). */
export function hasAnyArt(roster: KitRoster): boolean {
  const art = roster.art ?? {}
  return Object.values(art).some((ref) => Boolean(ref?.url))
}
