import type { EvidenceDefinition, PrioritySkill, StopRule, SupportDefault } from '../../core/types/domain'
import { SkillLevel } from '../../core/types/enums'

/** Default priority skills for Lincoln based on current assessment. */
export const defaultPrioritySkills: PrioritySkill[] = [
  {
    tag: 'reading.phonics.cvc.emerging',
    label: 'CVC blending (phonics)',
    level: SkillLevel.Emerging,
    notes: 'Keep sessions 5\u20138 min. Prefer blending practice with sound boxes, tap + slide.',
  },
  {
    tag: 'math.subtraction.regrouping.emerging',
    label: '2-digit subtraction with regrouping',
    level: SkillLevel.Emerging,
    notes: 'Concrete \u2192 pictorial \u2192 abstract. Base-10 blocks or drawings. 3\u20136 reps/day, 3 days/week.',
  },
  {
    tag: 'writing.handwriting.grip-posture.practice',
    label: 'Handwriting (grip + posture)',
    level: SkillLevel.Practice,
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
]
