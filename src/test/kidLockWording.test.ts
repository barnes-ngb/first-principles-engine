import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { expectKidLine, expectKidWording } from './kidReadability'

/**
 * FEAT-186 — the lock-and-gate wording pass, walked.
 *
 * The London audit's #10: every string that tells a six-year-old he *cannot*
 * do a thing yet was written in a parent's vocabulary — `Complete`, `unlock`,
 * `equipped`, `reading actions` — and several of them carried Lincoln's
 * Minecraft framing ("quests") into copy that both kids read. This suite is
 * the record of what those strings became, and the thing that keeps them
 * there: a later edit that reverts one, or adds a fifteen-word caption beside
 * it, fails here rather than shipping to a kid who cannot read it.
 *
 * ── Why the source is read, and not the render ───────────────────────────
 *
 * These strings are inline JSX across five features, and mounting `KidTodayView`
 * or `KidLabView` costs a Firestore harness apiece — which would make this a
 * suite about mocking, not about words. The run's rail was "text only, no new
 * props, handlers, reads or writes", so hoisting them into a copy module was
 * out too. What is left is honest and cheap: assert the literal is IN the file
 * that renders it, and put the literal through the FEAT-178 kid bar. Both
 * halves matter — the bar alone would pass on a string nothing renders, and
 * the presence check alone would pass on a string no kid can read.
 *
 * The bar itself lives in `./kidReadability` and is shared with
 * `books/__tests__/artHelpContent.test.ts`, FEAT-178's original home for it.
 * `expectKidLine` (word count + syllables + a full stop) is for sentences;
 * `expectKidWording` (word count + syllables) is for chip and button labels
 * and bare counts, which are not sentences — see that module's header.
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

/**
 * The same file with its comments removed.
 *
 * The retired-phrasing scan below is about what a kid READS, and a comment
 * explaining why a phrase was retired necessarily quotes it — this file's own
 * `before:` notes do exactly that. Scanning the raw source would make the
 * check unable to coexist with its own explanation.
 */
const readRendered = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

type Touched = {
  /** Where a kid meets it. */
  where: string
  /** The file that renders it. */
  file: string
  /** The exact substring the source must still contain. */
  source: string
  /** How a kid reads it, with any count filled in. Defaults to `source`. */
  rendered?: string
  /** A sentence (full stop required) vs a label / count (not a sentence). */
  kind: 'line' | 'label'
}

// ── What this run wrote ─────────────────────────────────────────────
//
// `before` is kept in the comment on each entry so the diff of intent is
// readable here and not only in the PR body.
const TOUCHED: Touched[] = [
  // before: "🔒 Complete {n} more quest{s}" — the disabled book link inside a
  // locked must-do row (rendered twice: must-do list and a selected choice).
  {
    where: 'Kid Today · locked book link',
    file: 'src/features/today/KidChecklist.tsx',
    source: '🔒 Do {gateThreshold - mustDoCompleted} more job',
    rendered: '🔒 Do 2 more jobs',
    kind: 'label',
  },
  // before: "{n} quest{s} to go!" — the one falling count (UX-75).
  {
    where: 'Kid Today · the day count',
    file: 'src/features/today/KidChecklist.tsx',
    source: '${listRemaining} job${listRemaining !== 1 ? \'s\' : \'\'} to go!',
    rendered: '2 jobs to go!',
    kind: 'label',
  },
  // before: isLincoln ? "Complete your quests to unlock crafting!"
  //                   : "Complete your must-do items to unlock choices!"
  // One line now — the same sentence had been forked by name.
  {
    where: 'Kid Today · Choose section lock',
    file: 'src/features/today/KidChecklist.tsx',
    source: 'Do your must-do jobs first.',
    kind: 'line',
  },
  // before: "Complete {n} more quest{s} to unlock!" — the locked Workshop card.
  {
    where: 'Kid Today · locked Game Workshop card',
    file: 'src/features/today/KidTodayView.tsx',
    source: "Do {gateThreshold - mustDoCompleted} more job{gateThreshold - mustDoCompleted !== 1 ? 's' : ''} to open this.",
    rendered: 'Do 2 more jobs to open this.',
    kind: 'line',
  },
  // before: "🔒 Finish quests first" — the locked draft-book and read-book chips.
  {
    where: 'Kid Today · locked book chips',
    file: 'src/features/today/KidTodayView.tsx',
    source: '🔒 Do your jobs first',
    kind: 'label',
  },
  // before: "Light day today. Just {n} quest{s}!"
  {
    where: 'Kid Today · MVD message',
    file: 'src/features/today/KidTodayView.tsx',
    source: 'Light day today. Just {mustDo.length} job',
    rendered: 'Light day today. Just 2 jobs!',
    kind: 'label',
  },
  // before: "⛏️ I Did More Mining!" — Minecraft framing on a card both kids get.
  {
    where: 'Kid Today · extra logger title',
    file: 'src/features/today/KidExtraLogger.tsx',
    source: '⭐ I Did More!',
    kind: 'label',
  },
  // before: "Did extra work on your tablet? (Reading Eggs, Math App, Typing) Log it here!"
  {
    where: 'Kid Today · extra logger body',
    file: 'src/features/today/KidExtraLogger.tsx',
    source: 'Did more work today? Add it here.',
    kind: 'line',
  },
  // before: "⛏️ I Did More!"
  {
    where: 'Kid Today · extra logger open button',
    file: 'src/features/today/KidExtraLogger.tsx',
    source: '⭐ Add More Work',
    kind: 'label',
  },
  // before: "💎 Log It!" — "log" is the parent's verb for it.
  {
    where: 'Kid Today · extra logger save button',
    file: 'src/features/today/KidExtraLogger.tsx',
    source: '💎 Save It!',
    kind: 'label',
  },
  // before: "Hmm, that didn't save. Check your connection and try again."
  // A six-year-old alone cannot check a connection.
  {
    where: 'Kid Today · extra logger save error',
    file: 'src/features/today/KidExtraLogger.tsx',
    source: 'Hmm, that did not save. Try again.',
    kind: 'line',
  },
  // before: "{n} / {n} reading actions"
  {
    where: 'Banner Rally · mission progress',
    file: 'src/features/avatar/stonebridge/StonebridgeMissionCard.tsx',
    source: '{active.current} / {active.target} done',
    rendered: '2 / 5 done',
    kind: 'label',
  },
  // before: "✓ Repaired · tap to revisit"
  {
    where: 'Banner Rally · a repaired location',
    file: 'src/features/avatar/stonebridge/StonebridgeVillage.tsx',
    source: '✓ Fixed · tap to see it',
    kind: 'label',
  },
  // before: "Your raised colors — one for every place you've rebuilt."
  {
    where: 'Banner Rally · Banner Hall',
    file: 'src/features/avatar/stonebridge/StonebridgeVillage.tsx',
    source: 'A banner for each place you fixed.',
    kind: 'line',
  },
  // before: "When it ends, tap “Mark it done” to count your time and save what you saw."
  {
    where: 'Watch · planned-video caption',
    file: 'src/features/watch/WatchPlayer.tsx',
    source: 'At the end, tap “Mark it done”.',
    kind: 'line',
  },
  // before: "Suit up before starting your day, {childName}."
  {
    where: 'Armor gate · instruction',
    file: 'src/features/avatar/ArmorGateScreen.tsx',
    source: 'Suit up first, {childName}.',
    rendered: 'Suit up first, London.',
    kind: 'line',
  },
  // before: "{n} of {n} pieces equipped." — "equipped" is three syllables, and
  // Kid Today already said "pieces on" for the same count.
  {
    where: 'Armor gate · progress',
    file: 'src/features/avatar/ArmorGateScreen.tsx',
    source: '{gateStatus.equipped} of {gateStatus.total} pieces on.',
    rendered: '2 of 6 pieces on.',
    kind: 'line',
  },
]

describe('FEAT-186 — every kid lock/gate string this run wrote', () => {
  it('is still in the file that renders it', () => {
    for (const t of TOUCHED) {
      expect(read(t.file).includes(t.source), `${t.where} (${t.file}): "${t.source}"`).toBe(true)
    }
  })

  it('holds the FEAT-178 kid readability bar', () => {
    for (const t of TOUCHED) {
      const text = t.rendered ?? t.source
      if (t.kind === 'line') expectKidLine(text, t.where)
      else expectKidWording(text, t.where)
    }
  })
})

// ── The retired phrasings ───────────────────────────────────────────
//
// Presence checks above cannot catch a SECOND copy of the old wording added
// back somewhere else, which is exactly how a wording pass rots. These are the
// exact strings #10 named; none of them may return anywhere a kid can read.
const RETIRED: { phrase: string; files: string[] }[] = [
  {
    phrase: 'more quest',
    files: ['src/features/today/KidChecklist.tsx', 'src/features/today/KidTodayView.tsx'],
  },
  {
    phrase: 'quests to go',
    files: ['src/features/today/KidChecklist.tsx'],
  },
  {
    phrase: 'unlock crafting',
    files: ['src/features/today/KidChecklist.tsx'],
  },
  {
    phrase: 'unlock choices',
    files: ['src/features/today/KidChecklist.tsx'],
  },
  {
    phrase: 'Finish quests first',
    files: ['src/features/today/KidTodayView.tsx'],
  },
  {
    phrase: 'I Did More Mining',
    files: ['src/features/today/KidExtraLogger.tsx'],
  },
  {
    phrase: 'reading actions',
    files: ['src/features/avatar/stonebridge/StonebridgeMissionCard.tsx'],
  },
  {
    phrase: 'pieces equipped',
    files: ['src/features/avatar/ArmorGateScreen.tsx'],
  },
  {
    phrase: 'count your time and save what you saw',
    files: ['src/features/watch/WatchPlayer.tsx'],
  },
]

describe('FEAT-186 — the retired phrasings stay retired', () => {
  it('none of them is rendered any more', () => {
    for (const { phrase, files } of RETIRED) {
      for (const file of files) {
        expect(readRendered(file).includes(phrase), `${file} still renders "${phrase}"`).toBe(false)
      }
    }
  })
})

// ── Dad Lab's lab-type chip (UX-90) ─────────────────────────────────
//
// This one IS importable, because the fix was to give it a map. The chip used
// to print `activeLab.labType` raw, so a six-year-old read `engineering`.

describe('FEAT-186 / UX-90 — the Dad Lab type labels', () => {
  it('names every type in words, held to the kid bar', async () => {
    const { DAD_LAB_TYPE_LABELS } = await import('../core/types/dadlab')
    const { DadLabType } = await import('../core/types/enums')
    for (const type of Object.values(DadLabType)) {
      const label = DAD_LAB_TYPE_LABELS[type]
      expect(label?.trim(), `no label for "${type}"`).toBeTruthy()
      // Never the raw enum value back again — that is the bug being fixed.
      expect(label, `"${type}" is still the enum value`).not.toBe(type)
      expectKidWording(label, `labType/${type}`)
    }
  })

  it('is what the kid lab view renders — not the raw enum', () => {
    const src = readRendered('src/features/dad-lab/KidLabView.tsx')
    expect(src.includes('DAD_LAB_TYPE_LABELS[activeLab.labType]')).toBe(true)
    expect(src.includes('label={activeLab.labType}')).toBe(false)
  })
})
