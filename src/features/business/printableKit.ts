import type { KitRoster } from '../../core/types/business'
import { escapeHtml } from './catalogSheet'
import { defenderArtKey, HERO_ART_KEY, invaderArtKey } from './kitArt'

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

  // Beat 5 — the battle. A retained row may have a power/menace but no name
  // (`namedDefenders` keeps either), so fall back on the *rendered* name being
  // empty — never just on the row's absence — or Page 5 prints blank <strong> tags.
  const firstDefender = field(defenders[0]?.name ?? '', NAME_CAP) || 'the defenders'
  const firstInvader = field(invaders[0]?.name ?? '', NAME_CAP) || 'the invaders'
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

// ── Section 4 · Defense map ───────────────────────────────────────────

/** How many stops the map path has (start → 5 stops → the Vault). */
export const MAP_STOP_COUNT = 5

/**
 * Pick the defender guarding stop `i`, cycling through the named defenders so a
 * short roster still labels all five stops. Returns undefined when there are no
 * named defenders (the stop then shows a draw-frame label).
 */
function defenderForStop(defenders: KitRoster['defenders'], i: number): KitRoster['defenders'][number] | undefined {
  if (defenders.length === 0) return undefined
  return defenders[i % defenders.length]
}

/**
 * The defense map — a simple numbered path (start → 5 stops → the Vault), each
 * stop labeled with a defender, and the instruction "place your sticker when you
 * clear each stop." Defenders cycle to fill five stops; with none named, each
 * stop invites a drawing.
 */
export function buildDefenseMapSection(roster: KitRoster): string {
  const defenders = namedDefenders(roster)
  const vault = vaultLabel(roster)

  const stops = Array.from({ length: MAP_STOP_COUNT }, (_, i) => {
    const guard = defenderForStop(defenders, i)
    const label = guard ? field(guard.name, NAME_CAP) || `Defender ${i + 1}` : `draw a defender here!`
    return `<li class="map-stop">
      <span class="map-num">${i + 1}</span>
      <span class="map-guard">Guarded by <strong>${label}</strong></span>
    </li>`
  }).join('\n')

  return `<section class="page kit-map">
    <h2 class="section-title">Defense Map</h2>
    <p class="section-hint">Place your sticker when you clear each stop! 🌱</p>
    <ol class="map-path">
      <li class="map-start"><span class="map-num">▶</span><span class="map-guard">Start</span></li>
      ${stops}
      <li class="map-vault"><span class="map-num">★</span><span class="map-guard">${vault}</span></li>
    </ol>
  </section>`
}

// ── Section 5 · Clue cards (5, quarter-sheet) ─────────────────────────

/** How many clue cards the kit ships. */
export const CLUE_CARD_COUNT = 5

/** Safe cast pickers for the clue templates — cycle, warm generic fallback. */
function defenderName(defenders: KitRoster['defenders'], i: number): string {
  const d = defenders.length > 0 ? defenders[i % defenders.length] : undefined
  return d ? field(d.name, NAME_CAP) || 'a defender' : 'a plant defender'
}
function defenderPower(defenders: KitRoster['defenders'], i: number): string {
  const d = defenders.length > 0 ? defenders[i % defenders.length] : undefined
  return d ? field(d.power, DESC_CAP) || 'its special power' : 'its special power'
}
function invaderName(invaders: KitRoster['invaders'], i: number): string {
  const inv = invaders.length > 0 ? invaders[i % invaders.length] : undefined
  return inv ? field(inv.name, NAME_CAP) || 'a bad guy' : 'a garden invader'
}

/** One quarter-sheet clue card: a number, a title, and a picture-forward line. */
function clueCard(n: number, title: string, body: string): string {
  return `<div class="clue-card">
    <div class="clue-num">Clue ${n}</div>
    <div class="clue-title">${escapeHtml(title)}</div>
    <div class="clue-body">${body}</div>
  </div>`
}

/**
 * Five clue cards — template instructions woven from the cast (find / count /
 * match / follow / defend patterns), each referencing real defenders and invaders
 * by name, one card per quarter-sheet with cut lines. Picture-forward wording a
 * 5-year-old can follow with help.
 */
export function buildClueCardsSection(roster: KitRoster): string {
  const defenders = namedDefenders(roster)
  const invaders = namedInvaders(roster)
  const vault = vaultLabel(roster)

  // FIND · COUNT · MATCH · FOLLOW · DEFEND — the five clue patterns.
  const cards = [
    clueCard(
      1,
      'Find',
      `<p>Find <strong>${defenderName(defenders, 0)}</strong>! Look where something grows. 🌿</p>`,
    ),
    clueCard(
      2,
      'Count',
      `<p>How many <strong>${invaderName(invaders, 0)}</strong> can you spot? Count them all! 🔢</p>`,
    ),
    clueCard(
      3,
      'Match',
      `<p>Match <strong>${defenderName(defenders, 1)}</strong> to the invader it beats: <strong>${invaderName(invaders, 1)}</strong>. 🧩</p>`,
    ),
    clueCard(
      4,
      'Follow',
      `<p>Follow the path to the next stop, guarded by <strong>${defenderName(defenders, 2)}</strong>. 👣</p>`,
    ),
    clueCard(
      5,
      'Defend',
      `<p><strong>${invaderName(invaders, 2)}</strong> is attacking ${vault}! Use <strong>${defenderName(defenders, 3)}</strong>'s power — <strong>${defenderPower(defenders, 3)}</strong> — to defend! 🛡️</p>`,
    ),
  ].join('\n')

  return `<section class="page kit-clues">
    <h2 class="section-title">Clue Cards</h2>
    <p class="section-hint">Cut apart and hide them around the garden ✂️</p>
    <div class="clue-grid">${cards}</div>
  </section>`
}

// ── Section 6 · Garden Defender badge ─────────────────────────────────

/**
 * The badge — a circular Garden Defender badge with the hero's art (or a
 * draw-frame) and "Official Garden Defender".
 */
export function buildBadgeSection(roster: KitRoster): string {
  return `<section class="page kit-badge">
    <div class="badge">
      <div class="badge-ring">
        <div class="badge-art">${artOrFrame(roster, HERO_ART_KEY, roster.heroName, 'sm')}</div>
        <div class="badge-caption">Official Garden Defender</div>
      </div>
    </div>
    <p class="section-hint">Cut it out and wear it proud! 🏅</p>
  </section>`
}

// ── Section 7 · Parent setup card ─────────────────────────────────────

/**
 * The parent setup card — a 30-second "what this is, how to hide clues + lay the
 * map, ages 5+". The one adult-facing page; deterministic copy, no kid text
 * beyond the vault/hero names for context.
 */
export function buildParentCardSection(roster: KitRoster): string {
  const vault = vaultLabel(roster)
  const hero = heroLabel(roster)
  return `<section class="page kit-parent">
    <h2 class="section-title">For the Grown-Up 👋</h2>
    <div class="parent-body">
      <p><strong>What this is:</strong> a Garden Defense Quest — a make-believe adventure where a young
      Garden Defender protects <strong>${vault}</strong> alongside the hero <strong>${hero}</strong>. Ages 5+,
      adult setup recommended.</p>
      <p><strong>30-second setup:</strong></p>
      <ol class="parent-steps">
        <li>Cut apart the sticker sheet and the five clue cards.</li>
        <li>Lay out the defense map somewhere the kids can reach it.</li>
        <li>Hide the clue cards around the garden (or the living room!).</li>
        <li>Give the kids the map — they clear each stop, solve the clue, and place a sticker.</li>
        <li>When every stop is cleared, ${vault} is safe — award the Garden Defender badge! 🏅</li>
      </ol>
      <p class="parent-note">Contains small parts. Adult setup recommended. Have fun defending the garden! 🌱</p>
    </div>
  </section>`
}

// ── Full document assembler ───────────────────────────────────────────

/** Shared print CSS — letter pages, one section per page, kid-warm styling. */
const KIT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Comic Sans MS', 'Trebuchet MS', system-ui, sans-serif; color: #2a2a2a; background: #fff; }
  .page { width: 100%; min-height: 10in; padding: 0.6in; page-break-after: always; break-after: page; page-break-inside: avoid; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .section-title { font-size: 24pt; color: #2e7d32; text-align: center; margin-bottom: 6pt; }
  .section-hint { text-align: center; font-size: 12pt; color: #777; margin-bottom: 18pt; }

  /* Cover */
  .kit-cover { display: flex; align-items: center; justify-content: center; text-align: center; }
  .cover-kicker { font-size: 16pt; letter-spacing: 2pt; text-transform: uppercase; color: #66a266; margin-bottom: 8pt; }
  .cover-title { font-size: 48pt; color: #2e7d32; line-height: 1.1; margin-bottom: 24pt; word-break: break-word; }
  .cover-hero { margin: 0 auto 24pt; }
  .cover-credit { font-size: 18pt; color: #555; font-style: italic; }

  /* Art + draw-frames */
  .art { display: block; object-fit: contain; margin: 0 auto; }
  .art.sm { width: 130pt; height: 130pt; }
  .art.lg { width: 260pt; height: 260pt; }
  .frame { display: flex; align-items: center; justify-content: center; text-align: center; margin: 0 auto;
    border: 3px dashed #bcd6bc; border-radius: 12pt; color: #8bab8b; background: #f6faf6; font-size: 12pt; padding: 8pt; }
  .frame.sm { width: 130pt; height: 130pt; }
  .frame.lg { width: 260pt; height: 260pt; font-size: 16pt; }

  /* Booklet */
  .booklet-page { display: flex; flex-direction: column; }
  .beat-label { font-size: 12pt; color: #999; text-transform: uppercase; letter-spacing: 1pt; margin-bottom: 6pt; }
  .beat-heading { font-size: 32pt; color: #2e7d32; margin-bottom: 18pt; }
  .beat-body { font-size: 20pt; line-height: 1.5; }
  .beat-body p { margin-bottom: 10pt; }
  .beat-body .cast { list-style: none; }
  .beat-body .cast li { margin-bottom: 8pt; }
  .beat-art { margin-top: 20pt; }
  .win-line { font-size: 24pt; font-weight: bold; color: #2e7d32; }

  /* Sticker sheet */
  .sticker-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14pt; }
  .sticker { border: 2px dashed #bbb; border-radius: 10pt; padding: 10pt; text-align: center; page-break-inside: avoid; break-inside: avoid; }
  .sticker-name { margin-top: 6pt; font-size: 12pt; font-weight: bold; }

  /* Defense map */
  .map-path { list-style: none; max-width: 5in; margin: 0 auto; }
  .map-path li { display: flex; align-items: center; gap: 12pt; padding: 10pt 0; border-bottom: 2px dashed #cfe8cf; }
  .map-path li:last-child { border-bottom: none; }
  .map-num { flex: none; width: 30pt; height: 30pt; border-radius: 50%; background: #2e7d32; color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14pt; }
  .map-vault .map-num { background: #f9a825; }
  .map-guard { font-size: 16pt; }

  /* Clue cards — quarter-sheet grid */
  .clue-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0; }
  .clue-card { border: 2px dashed #bbb; padding: 18pt; min-height: 3.5in; page-break-inside: avoid; break-inside: avoid; }
  .clue-num { font-size: 12pt; color: #66a266; text-transform: uppercase; letter-spacing: 1pt; }
  .clue-title { font-size: 22pt; color: #2e7d32; font-weight: bold; margin: 4pt 0 12pt; }
  .clue-body { font-size: 18pt; line-height: 1.5; }

  /* Badge */
  .kit-badge { display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .badge-ring { width: 320pt; height: 320pt; border-radius: 50%; border: 8pt solid #f9a825; background: #fffdf5;
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .badge-caption { margin-top: 12pt; font-size: 18pt; font-weight: bold; color: #2e7d32; }

  /* Parent card */
  .parent-body { max-width: 6in; margin: 0 auto; font-size: 14pt; line-height: 1.5; }
  .parent-body p { margin-bottom: 12pt; }
  .parent-steps { margin: 0 0 12pt 20pt; }
  .parent-steps li { margin-bottom: 8pt; }
  .parent-note { font-size: 12pt; color: #777; font-style: italic; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`

/**
 * Build the whole print-ready kit document from a roster — all seven sections in
 * canonical order (cover · booklet · sticker sheet · defense map · clue cards ·
 * badge · parent card), each print-paginated. `childName` credits the author on
 * the cover. Returns a complete `<!DOCTYPE html>` string suitable for
 * `window.open` + `print()`. Pure — reads the roster, writes nothing.
 */
export function buildPrintableKitHtml(roster: KitRoster, childName: string): string {
  const sections = [
    buildCoverSection(roster, childName),
    buildBookletSection(roster),
    buildStickerSheetSection(roster),
    buildDefenseMapSection(roster),
    buildClueCardsSection(roster),
    buildBadgeSection(roster),
    buildParentCardSection(roster),
  ].join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(clip(roster.vaultName, NAME_CAP) || 'Garden Defense Quest')} — Kit</title>
  <style>${KIT_STYLES}</style>
</head>
<body>
${sections}
</body>
</html>`
}
