import type { EvidenceDefinition, PrioritySkill, StopRule, SupportDefault } from '../../core/types/domain'
import { MasteryGate, SkillLevel } from '../../core/types/enums'

/** Default priority skills for Lincoln based on current assessment. */
export const defaultPrioritySkills: PrioritySkill[] = [
  {
    tag: 'reading.cvcBlend',
    label: 'CVC blending (phonics)',
    level: SkillLevel.Emerging,
    masteryGate: MasteryGate.NotYet,
    notes: 'Keep sessions 5\u20138 min. Prefer blending practice with sound boxes, tap + slide.',
  },
  {
    tag: 'math.subtraction.regroup',
    label: '2-digit subtraction with regrouping',
    level: SkillLevel.Emerging,
    masteryGate: MasteryGate.NotYet,
    notes: 'Concrete \u2192 pictorial \u2192 abstract. Base-10 blocks or drawings. 3\u20136 reps/day, 3 days/week.',
  },
  {
    tag: 'writing.gripPosture',
    label: 'Handwriting (grip + posture)',
    level: SkillLevel.Practice,
    masteryGate: MasteryGate.MostlyIndependent,
  },
  {
    tag: 'regulation.startAnyway',
    label: 'Start Anyway (self-regulation)',
    level: SkillLevel.Emerging,
    masteryGate: MasteryGate.NotYet,
    notes: 'Primary throughput bottleneck. Use Start-Anyway Protocol when refusal triggers.',
  },
]

/** Default supports/adaptations for Lincoln. */
export const defaultSupports: SupportDefault[] = [
  {
    label: 'Short reading sessions',
    description: '5\u20138 min. 5\u201310 CVC words per session with immediate success loops (2 easy, 1 stretch).',
  },
  {
    label: 'Concrete math manipulatives',
    description: 'Use base-10 blocks or drawings before abstract notation.',
  },
  {
    label: 'Reduced problem count',
    description: 'Do odds only or 6 problems max, then 2-min review.',
  },
  {
    label: 'Guided regrouping examples',
    description: '3 guided reps using base-10 instead of full worksheet.',
  },
  {
    label: 'Start-Anyway Protocol',
    description: 'Offer 2 choices (same skill, different modality), 5-min timer, first rep together, immediate win.',
  },
]

/** Default stop rules for Lincoln. */
export const defaultStopRules: StopRule[] = [
  {
    label: 'Skip long passages',
    trigger: 'Passage has many unknown phonics patterns',
    action: 'Replace with 5\u201310 CVC blending reps',
  },
  {
    label: 'Skip large regrouping worksheets',
    trigger: 'Frustration spikes during regrouping practice',
    action: 'Switch to 3 guided reps with base-10 + 1-min error review',
  },
  {
    label: 'Reduce attention-window overflow',
    trigger: 'Too many reps for attention window',
    action: 'Do odds only (6 problems), then 2-min review',
  },
  {
    label: 'Refusal/complaining protocol',
    trigger: 'Refusal or complaining longer than 60 seconds',
    action: 'Switch to 5-minute version + choice card + end on a win',
  },
  {
    label: 'Regrouping mistake cascade',
    trigger: '3 mistakes in a row on regrouping',
    action: 'Stop worksheet; do manipulatives; return with 2 problems only',
  },
]

/** Default evidence definitions for Lincoln. */
export const defaultEvidenceDefinitions: EvidenceDefinition[] = [
  {
    label: 'CVC blending progress',
    description: 'Child blends 3+ new CVC words in a session with \u22641 error.',
  },
  {
    label: 'Regrouping understanding',
    description: 'Child can explain the regroup step once (trade 1 ten for 10 ones).',
  },
  {
    label: 'Worksheet completion',
    description: '5/6 correct with help on modified set.',
  },
  {
    label: 'Start-Anyway success',
    description: 'Child begins task within 2 minutes of prompt despite initial reluctance.',
  },
]
