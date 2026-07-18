import type { KitRoster } from '../../core/types/business'
import { escapeHtml } from './catalogSheet'
import { defenderArtKey, HERO_ART_KEY, heroDescriptor, invaderArtKey } from './kitArt'

/**
 * Printable GDQ kit (FEAT-90, design GDQ_KIT_BUILDER_DESIGN.md §5): a pure builder
 * that renders a whole {@link KitRoster} into print-ready pages — the physical
 * product a customer buys and an ordering family receives. Seven sections, each
 * print-paginated: cover, a ~6-page story booklet, a sticker sheet, a defense
 * map, five clue cards, a Garden Defender badge, and a parent setup card.
 *
 * **Deterministic templates, the kid's words verbatim.** Every line is assembled
 * from the roster's stored text (vault name, hero + move, defenders + powers,
 * invaders + menace, win condition) — his spelling, his names, unpolished. There
 * is **NO AI generation** here (no cost, no voice-drift) and **no writes anywhere**
 * — this is a pure read → HTML string the surface opens and prints, exactly the
 * `window.open` + `print()` pattern the catalog sheet (`catalogSheet.ts`) and the
 * MO compliance report (`records.logic.ts`) already use.
 *
 * **Art optional everywhere.** Generated character art (FEAT-88 `roster.art` refs)
 * renders where present; a tasteful "draw {name} here!" frame stands in where it's
 * absent — a blank frame is a *feature* of a kids' kit, not a gap.
 *
 * **Paper:** letter-size sequential pages for v1. Booklet imposition (a 5.5×8.5
 * half-fold with two booklet pages per sheet side) needs page-ordering the
 * `window.open` HTML path can't express cheaply — that lives only in the heavier
 * jsPDF `printBook.ts`. Sequential pages print + fold fine for the proving run.
 */

// ── Length caps (layout hygiene, NOT correction) ──────────────────────
//
// The kid's words are stored verbatim and rendered verbatim; these caps only
// stop a runaway paste from breaking a page's layout. Spelling, capitalization,
// and word choice are never touched — a capped field just gets a trailing "…".

/** Cap for a short name (vault, hero, character names). */
export const NAME_CAP = 80
/** Cap for a descriptor (power / menace / look / move). */
export const DESC_CAP = 160
/** Cap for the win condition — the booklet climax gets more room. */
export const WIN_CAP = 400

/** Trim + graceful length-cap. Adds an ellipsis only when it actually clips. */
export function clip(text: string, max: number): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t
}

/** Escape + cap in one step — every kid field goes through this before HTML. */
function field(text: string, max: number): string {
  return escapeHtml(clip(text, max))
}

// ── Art vs draw-it-yourself frame ─────────────────────────────────────

/** The download URL of a character's generated art, or '' when none exists. */
function artUrl(roster: KitRoster, key: string): string {
  return roster.art?.[key]?.url ?? ''
}

/**
 * Render a character's art thumbnail when present, else a "draw {name} here!"
 * frame — the blank frame is a deliberate kit feature, not a gap. `label` sizes
 * the frame class so the sticker sheet, booklet, and badge can size differently.
 */
function artOrFrame(roster: KitRoster, key: string, name: string, size: 'sm' | 'lg' = 'sm'): string {
  const url = artUrl(roster, key)
  const alt = name.trim() || 'character'
  if (url) {
    return `<img class="art ${size}" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />`
  }
  const who = field(name, NAME_CAP) || 'this character'
  return `<div class="frame ${size}" role="img" aria-label="Draw ${who} here">draw ${who} here!</div>`
}

// ── Cast helpers (safe on an empty / partial roster) ──────────────────

/** Defenders that have real content (a name or a power). */
export function namedDefenders(roster: KitRoster): KitRoster['defenders'] {
  return roster.defenders.filter((d) => d.name.trim() !== '' || d.power.trim() !== '')
}

/** Invaders that have real content (a name or a menace). */
export function namedInvaders(roster: KitRoster): KitRoster['invaders'] {
  return roster.invaders.filter((inv) => inv.name.trim() !== '' || inv.menace.trim() !== '')
}

/** The vault's display name, capped — falls back to a warm generic when unnamed. */
function vaultLabel(roster: KitRoster): string {
  return field(roster.vaultName, NAME_CAP) || 'the Seed Vault'
}

/** The hero's display name, capped — falls back to a warm generic when unnamed. */
function heroLabel(roster: KitRoster): string {
  return field(roster.heroName, NAME_CAP) || 'the Hero'
}

// ── Section 1 · Cover ─────────────────────────────────────────────────

/**
 * The cover: the vault name huge, the hero's art (or a draw-frame), and
 * "A Garden Defense Quest by {child}". `childName` is the author credit — passed
 * in because the roster stores only `childId`.
 */
export function buildCoverSection(roster: KitRoster, childName: string): string {
  const by = field(childName, NAME_CAP)
  const credit = by ? `A Garden Defense Quest by ${by}` : 'A Garden Defense Quest'
  return `<section class="page kit-cover">
    <div class="cover-inner">
      <div class="cover-kicker">Garden Defense Quest</div>
      <h1 class="cover-title">${vaultLabel(roster)}</h1>
      <div class="cover-hero">${artOrFrame(roster, HERO_ART_KEY, roster.heroName, 'lg')}</div>
      <div class="cover-credit">${escapeHtml(credit)}</div>
    </div>
  </section>`
}

// ── Section 2 · Story booklet (~6 pages) ──────────────────────────────

/** One booklet page: a beat label, a big line, and an optional art column. */
function bookletPage(beat: string, heading: string, body: string, artHtml = ''): string {
  const artCol = artHtml ? `<div class="beat-art">${artHtml}</div>` : ''
  return `<section class="page booklet-page">
    <div class="beat">
      <div class="beat-label">${escapeHtml(beat)}</div>
      <h2 class="beat-heading">${heading}</h2>
      <div class="beat-body">${body}</div>
      ${artCol}
    </div>
  </section>`
}

/**
 * The story booklet — a deterministic template spine from the roster: the vault
 * & hero intro → the invaders appear → the defenders rise → the battle → the win
 * (the roster's `winCondition` verbatim as the climax). Big type, one beat per
 * page, character art beside its beat. The kid's words are never rewritten — the
 * template only supplies the connective framing around them.
 */
export function buildBookletSection(roster: KitRoster): string {
  const vault = vaultLabel(roster)
  const hero = heroLabel(roster)
  const defenders = namedDefenders(roster)
  const invaders = namedInvaders(roster)

  // Beat 1 — the vault.
  const p1 = bookletPage(
    'Page 1',
    'The Treasure',
    `<p>Deep in the garden is a secret worth protecting: <strong>${vault}</strong>.</p>`,
  )

  // Beat 2 — the hero.
  const look = field(roster.heroLook, DESC_CAP)
  const move = field(roster.heroMove, DESC_CAP)
  const heroLines = [
    `<p><strong>${hero}</strong> guards ${vault}.</p>`,
    look ? `<p>${hero} looks like ${look}.</p>` : '',
    move ? `<p>Special move: <strong>${move}</strong>!</p>` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const p2 = bookletPage('Page 2', 'The Hero', heroLines, artOrFrame(roster, HERO_ART_KEY, roster.heroName, 'sm'))

  // Beat 3 — the invaders appear (each name + menace, one line).
  const invaderList =
    invaders.length > 0
      ? `<ul class="cast">${invaders
          .map((inv) => {
            const name = field(inv.name, NAME_CAP) || 'A bad guy'
            const menace = field(inv.menace, DESC_CAP)
            return `<li><strong>${name}</strong>${menace ? ` — ${menace}` : ''}</li>`
          })
          .join('')}</ul>`
      : `<p>Uh oh… the bad guys are coming for the seeds!</p>`
  const p3 = bookletPage('Page 3', 'The Invaders Appear', invaderList)

  // Beat 4 — the defenders rise (each name + power).
  const defenderList =
    defenders.length > 0
      ? `<ul class="cast">${defenders
          .map((d) => {
            const name = field(d.name, NAME_CAP) || 'A defender'
            const power = field(d.power, DESC_CAP)
            return `<li><strong>${name}</strong>${power ? ` — ${power}` : ''}</li>`
          })
          .join('')}</ul>`
      : `<p>The plant defenders rise up to protect ${vault}!</p>`
  const p4 = bookletPage('Page 4', 'The Defenders Rise', defenderList)

  // Beat 5 — the battle.
  const firstDefender = defenders[0] ? field(defenders[0].name, NAME_CAP) : 'the defenders'
  const firstInvader = invaders[0] ? field(invaders[0].name, NAME_CAP) : 'the invaders'
  const p5 = bookletPage(
    'Page 5',
    'The Battle',
    `<p><strong>${firstDefender}</strong> and the whole garden face off against <strong>${firstInvader}</strong> and the invaders. The fight for ${vault} is on!</p>`,
  )

  // Beat 6 — the win (winCondition verbatim as the climax).
  const win = field(roster.winCondition, WIN_CAP)
  const winBody = win
    ? `<p class="win-line">${win}</p>`
    : `<p class="win-line">The garden is safe. ${hero} wins!</p>`
  const p6 = bookletPage('Page 6', 'How You Win', winBody)

  return `<div class="kit-booklet">${[p1, p2, p3, p4, p5, p6].join('\n')}</div>`
}

// ── Section 3 · Sticker sheet ─────────────────────────────────────────

/** One sticker cell: art (or draw-frame), a name caption, dashed cut lines. */
function stickerCell(roster: KitRoster, key: string, name: string): string {
  const caption = field(name, NAME_CAP) || 'Draw me!'
  return `<div class="sticker">
    ${artOrFrame(roster, key, name, 'sm')}
    <div class="sticker-name">${caption}</div>
  </div>`
}

/**
 * The sticker sheet — a grid of every character's art (or draw-frame), name
 * captions, dashed cut lines. Hero first, then defenders, then invaders, matching
 * the roster's canonical order.
 */
export function buildStickerSheetSection(roster: KitRoster): string {
  const cells: string[] = [stickerCell(roster, HERO_ART_KEY, roster.heroName)]
  namedDefenders(roster).forEach((d) => cells.push(stickerCell(roster, defenderArtKey(d.id), d.name)))
  namedInvaders(roster).forEach((inv) => cells.push(stickerCell(roster, invaderArtKey(inv.id), inv.name)))

  return `<section class="page kit-stickers">
    <h2 class="section-title">Sticker Sheet</h2>
    <p class="section-hint">Cut along the dashed lines ✂️</p>
    <div class="sticker-grid">${cells.join('\n')}</div>
  </section>`
}

// Sections 4–7 (defense map, clue cards, badge, parent setup) + the full-document
// assembler are added in the next commit.
