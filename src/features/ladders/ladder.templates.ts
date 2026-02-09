import type { Ladder, Rung } from '../../core/types/domain'

type LadderWithId = Omit<Ladder, 'id'> & { id: string }

// ── Literacy Engine (6 rungs) ──────────────────────────────────

const literacyRungs: Rung[] = [
  {
    title: 'Letter-sound match',
    description:
      'Identify and say the sound for each letter (a→/a/, b→/b/).',
    order: 1,
    proofExamples: [
      'Name sounds for 20+ letters on flashcards',
      'Point to a letter and say its sound without hesitation',
    ],
  },
  {
    title: 'Blend CVC words',
    description:
      'Sound out and blend consonant-vowel-consonant words (c-a-t → cat).',
    order: 2,
    proofExamples: [
      'Read 10 CVC words aloud without help',
      'Blend a new CVC word on first attempt',
    ],
  },
  {
    title: 'Sight-word recognition',
    description:
      'Read common sight words (the, is, and, was) on sight.',
    order: 3,
    proofExamples: [
      'Read 20 sight words from flashcards in one sitting',
      'Spot sight words in a sentence without sounding out',
    ],
  },
  {
    title: 'Decode short sentences',
    description:
      'Read simple sentences with CVC + sight words (The cat sat.).',
    order: 4,
    proofExamples: [
      'Read 3 short sentences with ≤2 stalls per sentence',
      'Self-correct a misread word mid-sentence',
    ],
  },
  {
    title: 'Read a decodable page',
    description:
      'Read a full decodable-reader page with fluency.',
    order: 5,
    proofExamples: [
      'Finish a page with ≤1 stall',
      'Retell 2 details from the page',
    ],
  },
  {
    title: 'Read aloud with expression',
    description:
      'Read a short passage with rhythm, pausing at periods and lifting voice at questions.',
    order: 6,
    proofExamples: [
      'Read a 50+ word passage at pace with expression',
      'Pause at periods and change voice for questions',
    ],
  },
]

// ── Math Engine (6 rungs) ──────────────────────────────────────

const mathRungs: Rung[] = [
  {
    title: 'Count and write to 100',
    description:
      'Count objects and write numbers to 100 with correct formation.',
    order: 1,
    proofExamples: [
      'Count a set of 20+ objects accurately',
      'Write numbers 1–100 on a chart',
    ],
  },
  {
    title: 'Place value (tens & ones)',
    description:
      'Identify tens and ones in two-digit numbers (34 = 3 tens, 4 ones).',
    order: 2,
    proofExamples: [
      'Build 5 numbers with base-ten blocks and state tens/ones',
      'Write a number given a tens/ones description',
    ],
  },
  {
    title: 'Add & subtract within 20',
    description:
      'Use a strategy (counting on, number line, doubles) to solve +/− within 20.',
    order: 3,
    proofExamples: [
      'Solve 10 problems within 20 and name the strategy used',
      'Explain how "doubles plus one" works',
    ],
  },
  {
    title: 'Add & subtract within 100',
    description:
      'Solve two-digit addition and subtraction with or without regrouping.',
    order: 4,
    proofExamples: [
      'Complete 5 problems within 100',
      'Explain one strategy (number line, break apart, etc.)',
    ],
  },
  {
    title: 'Intro to multiplication',
    description:
      'Understand equal groups and repeated addition (3 groups of 4 = 12).',
    order: 5,
    proofExamples: [
      'Draw or build 3 equal-group problems',
      'Write the repeated addition for each group',
    ],
  },
  {
    title: 'Solve & explain a word problem',
    description:
      'Read a one-step word problem, solve it, and explain thinking aloud.',
    order: 6,
    proofExamples: [
      'Solve a word problem and state the operation used',
      'Explain why that operation makes sense',
    ],
  },
]

// ── Independence & Courage (6 rungs) ───────────────────────────

const independenceRungs: Rung[] = [
  {
    title: 'Start with one prompt',
    description:
      'Begin a familiar task after a single verbal cue (no repeated reminders).',
    order: 1,
    proofExamples: [
      'Start 3 tasks in a session from one prompt each',
      'Move to workspace without a second reminder',
    ],
  },
  {
    title: 'Follow a 2–3 step routine',
    description:
      'Complete a short routine (sit → open book → begin) without extra cues.',
    order: 2,
    proofExamples: [
      'Complete the start routine independently for 3 sessions in a row',
      'Use a visual checklist to self-guide the routine',
    ],
  },
  {
    title: 'Sustain 10 minutes',
    description:
      'Work on a task for 10 continuous minutes before needing a break or redirect.',
    order: 3,
    proofExamples: [
      'Timer shows 10 minutes of focused work with ≤1 redirect',
      'Complete a reading or math block without stopping early',
    ],
  },
  {
    title: 'Sustain 15 minutes',
    description:
      'Work on a task for 15 continuous minutes with minimal redirection.',
    order: 4,
    proofExamples: [
      'Timer shows 15 minutes of focused work with ≤1 redirect',
      'Self-initiate return to task after a brief distraction',
    ],
  },
  {
    title: 'Complete a full loop',
    description:
      'Finish a task from start to end and put materials away.',
    order: 5,
    proofExamples: [
      'Complete a task and clean up without being asked',
      'Close the book, put away pencils, and say "done"',
    ],
  },
  {
    title: 'Self-track on scoreboard',
    description:
      'Mark own progress on the weekly scoreboard after completing a task.',
    order: 6,
    proofExamples: [
      'Independently mark scoreboard for 3 sessions in a row',
      'Circle the correct score symbol without help',
    ],
  },
]

// ── Factory functions ──────────────────────────────────────────

export function createDefaultLiteracyLadder(childId: string): LadderWithId {
  return {
    id: `${childId}-reading`,
    childId,
    title: 'Literacy Engine',
    description: 'Letters → sounds → words → fluent reading with expression.',
    domain: 'Reading',
    rungs: literacyRungs,
  }
}

export function createDefaultMathLadder(childId: string): LadderWithId {
  return {
    id: `${childId}-math`,
    childId,
    title: 'Math Engine',
    description: 'Counting → place value → operations → word problems.',
    domain: 'Math',
    rungs: mathRungs,
  }
}

export function createDefaultIndependenceLadder(childId: string): LadderWithId {
  return {
    id: `${childId}-independence`,
    childId,
    title: 'Independence & Courage',
    description: 'One prompt → sustain focus → complete a loop → self-track.',
    domain: 'Executive Function',
    rungs: independenceRungs,
  }
}

/** Returns all 3 default ladders for a child. */
export function createDefaultLadders(childId: string): LadderWithId[] {
  return [
    createDefaultLiteracyLadder(childId),
    createDefaultMathLadder(childId),
    createDefaultIndependenceLadder(childId),
  ]
}

/** Promotion rule: 3 wins in 7 days OR 5 wins total */
export const PROMOTION_RULES = {
  winsInWindow: 3,
  windowDays: 7,
  totalWins: 5,
} as const

export function shouldPromote(
  wins: { date: string }[],
  today: string,
): boolean {
  if (wins.length >= PROMOTION_RULES.totalWins) return true

  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - PROMOTION_RULES.windowDays)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const recentWins = wins.filter((w) => w.date >= cutoffStr)
  return recentWins.length >= PROMOTION_RULES.winsInWindow
}
