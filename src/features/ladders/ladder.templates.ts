import type { Ladder, Rung } from '../../core/types/domain'

const literacyRungs: Rung[] = [
  {
    title: 'Letter Sounds',
    description: 'Knows all 26 letter sounds',
    order: 1,
    proofExamples: ['Says the sound for each letter', 'Points to the right letter when given a sound'],
  },
  {
    title: 'CVC Words',
    description: 'Reads consonant-vowel-consonant words (cat, dog, sun)',
    order: 2,
    proofExamples: ['Reads 5 CVC words without help', 'Sounds out a new CVC word'],
  },
  {
    title: 'Sight Words (10)',
    description: 'Reads 10 high-frequency sight words',
    order: 3,
    proofExamples: ['Reads 10 sight words in a row', 'Spots sight words in a book'],
  },
  {
    title: 'Short Sentences',
    description: 'Reads simple sentences with CVC + sight words',
    order: 4,
    proofExamples: ['Reads a 5-word sentence', 'Reads a page from a decodable reader'],
  },
  {
    title: 'Blends & Digraphs',
    description: 'Reads words with blends (bl, cr, st) and digraphs (sh, ch, th)',
    order: 5,
    proofExamples: ['Reads blend words: stop, clap, bring', 'Reads digraph words: ship, chat, thin'],
  },
  {
    title: 'Handwriting (letters)',
    description: 'Writes all 26 lowercase letters legibly',
    order: 6,
    proofExamples: ['Writes full alphabet from memory', 'Copies a sentence with correct letter formation'],
  },
  {
    title: 'Spelling (CVC)',
    description: 'Spells CVC words correctly',
    order: 7,
    proofExamples: ['Spells 5 CVC words from dictation', 'Writes a CVC word in a sentence'],
  },
  {
    title: 'Paragraph Reading',
    description: 'Reads a short paragraph with expression',
    order: 8,
    proofExamples: ['Reads a paragraph from Minecraft book', 'Retells what happened in the paragraph'],
  },
]

const mathRungs: Rung[] = [
  {
    title: 'Counting to 20',
    description: 'Counts objects to 20 with one-to-one correspondence',
    order: 1,
    proofExamples: ['Counts 20 objects accurately', 'Writes numbers 1-20'],
  },
  {
    title: 'Number Recognition (1-20)',
    description: 'Identifies written numbers 1-20',
    order: 2,
    proofExamples: ['Points to the right number', 'Reads numbers out of order'],
  },
  {
    title: 'Addition to 5',
    description: 'Solves addition problems with sums up to 5',
    order: 3,
    proofExamples: ['Solves 3+2 with manipulatives', 'Answers 5 addition problems correctly'],
  },
  {
    title: 'Subtraction from 5',
    description: 'Solves subtraction problems within 5',
    order: 4,
    proofExamples: ['Solves 5-3 with objects', 'Answers 5 subtraction problems'],
  },
  {
    title: 'Addition to 10',
    description: 'Solves addition problems with sums up to 10',
    order: 5,
    proofExamples: ['Solves 7+3 mentally or with fingers', 'Completes a page of addition problems'],
  },
  {
    title: 'Subtraction from 10',
    description: 'Solves subtraction within 10',
    order: 6,
    proofExamples: ['Solves 10-4 correctly', 'Explains subtraction with a story'],
  },
  {
    title: 'Place Value (tens & ones)',
    description: 'Understands tens and ones in two-digit numbers',
    order: 7,
    proofExamples: ['Shows 34 as 3 tens and 4 ones', 'Reads and writes two-digit numbers'],
  },
  {
    title: 'Word Problems',
    description: 'Solves simple addition/subtraction word problems',
    order: 8,
    proofExamples: ['Solves "3 apples + 2 apples = ?" type problems', 'Creates own word problem'],
  },
]

export function createLiteracyLadder(childId: string): Omit<Ladder, 'id'> & { id: string } {
  return {
    id: `${childId}-reading`,
    childId,
    title: 'Literacy Ladder',
    description: 'Handwriting, Spelling, Sight Words, Reading, Reading Eggs',
    domain: 'literacy',
    rungs: literacyRungs,
  }
}

export function createMathLadder(childId: string): Omit<Ladder, 'id'> & { id: string } {
  return {
    id: `${childId}-math`,
    childId,
    title: 'Math Ladder',
    description: 'Number sense through word problems',
    domain: 'math',
    rungs: mathRungs,
  }
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
