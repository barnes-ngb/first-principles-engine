import { SubjectBucket } from '../types/enums'
import type { SubjectBucket as SubjectBucketType } from '../types/enums'
import type { WorkingLevels } from '../types'

/**
 * **Which working level — if any — may a scanned page drive?** (UX-381)
 *
 * A scan reads a photo of a curriculum page and, from its lesson number, writes
 * a number onto `skillSnapshots.workingLevels` — the field
 * `functions/src/ai/storyReadingLevel.ts` chooses every generated story's
 * reading level from, that `seedLearnerModel` projects the whole concept
 * terrain off, and that the planner's snapshot slice reads. So the question
 * *"which domain did this page measure?"* had better be answered from evidence.
 *
 * It was not. `deriveLevelForSubject` sent **every `LanguageArts` scan to the
 * phonics level**, on a comment that read *"LA workbooks (e.g. GATB Language
 * Arts) often cover phonics skills."* Often is not always: handwriting, grammar
 * and copywork are all LanguageArts and contain no phonics at all. On
 * 2026-09-10/11 Shelly scanned the handwriting page each boy had just done —
 * exactly what Today asks her to do — and *The Good and the Beautiful
 * Handwriting Lesson 35* was read as phonics lesson 35, which the fixed ladder
 * in `derivePhonicsWorkingLevelFromScan` calls **phonics level 2**. London went
 * from 5 to 2 and Lincoln from 3 to 2, four hours apart, off the same book.
 *
 * The rule now names its evidence. A scan may drive the **phonics** level only
 * when the curriculum is *known* to be a phonics program:
 *
 *   • it resolves to one of the {@link PHONICS_BEARING_BRIDGE_SOURCE_IDS} — the
 *     owner-curated bridges that map a position onto phonics concepts, which is
 *     the strongest statement in the repo that a book teaches phonics; or
 *   • its own name says `phonics`.
 *
 * **Everything else writes no working level at all** — handwriting, grammar,
 * copywork, spelling, and any language-arts book the rule cannot place. No
 * level is better than a wrong one: an absent level leaves every reader on the
 * level it already had, while a wrong one silently re-levels the child's
 * stories, terrain and plan. That is the whole finding.
 *
 * Pure and parameterised on the bridge id rather than importing the bridge
 * lookup, so the decision is assertable on its own and the caller owns the
 * (tolerant, ambiguity-refusing) name→bridge resolution.
 */

/** The working-level slots a scan can address. */
export type ScanWorkingLevelDomain = Extract<
  keyof WorkingLevels,
  'phonics' | 'comprehension' | 'math'
>

/**
 * Bridges whose units map onto **phonics** concepts, so a page from one of them
 * really does say where the child is in a phonics sequence.
 *
 * `fastPhonics` is a phonics program by name and by curation. `tgtbLanguageArts1`
 * is kept deliberately: TGTB Language Arts Level 1 *is* a phonics-bearing course
 * (its bridge covers blends → digraphs → vowel teams on the reading graph), and
 * it is the case the old `LanguageArts → phonics` line was written for. What the
 * old line did wrong was extend that one true case to every LA book.
 *
 * `mathseeds` is deliberately absent — a bridge is not evidence of *phonics*,
 * only of whatever graph it covers, and Mathseeds covers the math graph.
 */
export const PHONICS_BEARING_BRIDGE_SOURCE_IDS: readonly string[] = [
  'fastPhonics',
  'tgtbLanguageArts1',
]

/** True when the book's own name says it teaches phonics. */
function namesPhonics(curriculumName: string): boolean {
  return curriculumName.toLowerCase().includes('phonics')
}

/**
 * True when this curriculum is known to teach phonics — by a curated bridge or
 * by its own name. Exported because the UX-383 restore asks the same question
 * of a level already written, and the two must not answer differently.
 */
export function isPhonicsBearingCurriculum(
  curriculumName: string,
  bridgeSourceId: string | null,
): boolean {
  if (bridgeSourceId && PHONICS_BEARING_BRIDGE_SOURCE_IDS.includes(bridgeSourceId)) return true
  return namesPhonics(curriculumName)
}

/**
 * The one answer to *which working level may this scanned page write?*
 *
 * - `math` — the subject bucket is Math, which `mapSubjectBucket` only returns
 *   when the name itself says math, so the domain is already name-evidenced.
 * - `phonics` — a Reading- or LanguageArts-bucket book that is a known phonics
 *   program (see {@link isPhonicsBearingCurriculum}).
 * - `comprehension` — a Reading-bucket book that is not a phonics program. The
 *   bucket is only Reading when the name says *reading* (or the provider is
 *   Reading Eggs), so this too is name-evidenced.
 * - `null` — everything else, LanguageArts included. Writes nothing.
 *
 * `bridgeSourceId` is the `WorkbookBridge.sourceId` the curriculum name resolves
 * to, or `null` for no bridge **and for an ambiguous one** — an ambiguous name
 * is not evidence about anything, and the safe direction here is to write less.
 */
export function resolveScanWorkingLevelDomain(
  subject: SubjectBucketType,
  curriculumName: string,
  bridgeSourceId: string | null,
): ScanWorkingLevelDomain | null {
  switch (subject) {
    case SubjectBucket.Math:
      return 'math'
    case SubjectBucket.Reading:
      return isPhonicsBearingCurriculum(curriculumName, bridgeSourceId)
        ? 'phonics'
        : 'comprehension'
    case SubjectBucket.LanguageArts:
      // Handwriting, grammar, copywork, spelling and anything the rule cannot
      // place fall through to `null`. This is the line UX-381 exists for.
      return isPhonicsBearingCurriculum(curriculumName, bridgeSourceId) ? 'phonics' : null
    default:
      return null
  }
}
