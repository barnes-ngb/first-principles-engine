import type { EvidenceDefinition, PrioritySkill, StopRule, SupportDefault } from '../../core/types'
import { MasteryGate, SkillLevel } from '../../core/types/enums'
import { MathTags, ReadingTags, RegulationTags, WritingTags } from '../../core/types/skillTags'

// ── London's kindergarten starting frame ────────────────────────────
//
// Mirrors `lincolnDefaults.ts`'s exact four exports, retuned for a 6-year-old
// at a true K floor: voice-first, 2–3 min, playful, no-shame. Selected per child
// by `getDefaultsForChild` (grade/age band, never by name). Lincoln's defaults
// are untouched.
//
// Every priority skill maps to an EXISTING `SkillTag` (see `skillTags.ts`).
// Where K has no dedicated tag, the closest existing tag is used and flagged
// with a `// TODO` — tags are never invented (downstream working-level matching
// keys on them).

/** Default priority skills for London (kindergarten starting frame). */
export const defaultPrioritySkills: PrioritySkill[] = [
  {
    tag: ReadingTags.LetterSound,
    label: 'Letter–sound correspondence',
    level: SkillLevel.Emerging,
    masteryGate: MasteryGate.NotYet,
    notes: 'Voice-first, 2–3 min. Point to a letter, he says the sound. Keep it a game, not a quiz.',
  },
  {
    tag: ReadingTags.PhonemicAwareness,
    label: 'Phonemic awareness (rhyming, first sounds, blending)',
    level: SkillLevel.Emerging,
    masteryGate: MasteryGate.NotYet,
    notes: 'Oral only — no print. Rhyme pairs, "what sound does cat start with?", blend /c/-/a/-/t/. 2–3 min, playful.',
  },
  {
    // TODO: no K counting / number-sense SkillTag exists yet (math tags start at
    // addition facts). Using the closest existing tag; add a `math.counting` /
    // `math.numberSense` tag when the K math taxonomy lands.
    tag: MathTags.PlaceValue,
    label: 'Counting & number sense (number recognition)',
    level: SkillLevel.Emerging,
    masteryGate: MasteryGate.NotYet,
    notes: 'Count objects aloud to 10–20, name numerals he sees. Use fingers/toys. 2–3 min, no worksheet.',
  },
  {
    tag: WritingTags.LetterFormation,
    label: 'Early letter / name formation',
    level: SkillLevel.Emerging,
    masteryGate: MasteryGate.NotYet,
    notes: 'Drawing/tracing the letters in his name. Finger-in-air or big crayon strokes count. Never a handwriting drill.',
  },
  {
    tag: RegulationTags.Attention,
    label: 'Stays engaged with a grown-up (early regulation)',
    level: SkillLevel.Emerging,
    masteryGate: MasteryGate.NotYet,
    notes: 'He disengages when unsupervised — keep it interactive and supervised. One short, attention-rich activity at a time.',
  },
]

/** Default supports/adaptations for London. */
export const defaultSupports: SupportDefault[] = [
  {
    label: 'Answers aloud (voice-first)',
    description: 'He says or shows the answer — never asked to read or write the response. Capture his words.',
  },
  {
    label: 'One step at a time',
    description: 'Give a single, short instruction; finish it together before the next one.',
  },
  {
    label: 'Drawing / oral over writing',
    description: 'Let him draw or tell instead of write. A picture or a spoken answer is full evidence.',
  },
  {
    label: 'Immediate encouragement',
    description: 'Praise the try right away. Lead with an easy win to build momentum.',
  },
  {
    label: 'Supervised, attention-rich',
    description: 'Stay with him — he disengages when working alone. Keep it interactive and playful.',
  },
]

/** Default stop rules for London. */
export const defaultStopRules: StopRule[] = [
  {
    label: 'Stop at frustration or wiggles',
    trigger: 'He gets frustrated, squirmy, or stops paying attention',
    action: 'Pause, switch to something playful or movement-based, come back later.',
  },
  {
    label: 'Keep it play, not a test',
    trigger: 'It starts feeling like a quiz or a grade',
    action: 'Reframe as a game; drop the "right answer" pressure and just explore together.',
  },
  {
    label: 'End on a win',
    trigger: 'Attention is fading near the end of a short activity',
    action: 'Finish with something he can do easily so he ends feeling successful.',
  },
]

/** Default evidence definitions for London. */
export const defaultEvidenceDefinitions: EvidenceDefinition[] = [
  {
    label: 'Oral answers',
    description: 'What London says aloud — sounds, counts, rhymes, or naming — counts as evidence.',
  },
  {
    label: 'Photos of drawings',
    description: 'A snapshot of a drawing, traced letter, or built thing he made.',
  },
  {
    label: 'Parent observation',
    description: 'A quick note from the grown-up about what he tried and how it went.',
  },
]
