import type { LadderCardDefinition } from '../../core/types/domain'
import { StreamKey } from '../../core/types/enums'

const GLOBAL_RULE = 'Level up on 3 ✔ in a row with same or less support.'

// ── Handwriting + Drawing ────────────────────────────────────────

export const handwriting: LadderCardDefinition = {
  ladderKey: 'handwriting',
  title: 'Handwriting + Drawing',
  intent: 'Build pencil control, letter formation, and visual expression so writing becomes automatic.',
  workItems: [
    'Pencil grip + posture check',
    'Letter formation (uppercase → lowercase)',
    'Copy words with spacing',
    'Sentence dictation',
    'Free draw + label',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Grip + posture',
      evidenceText: 'Holds pencil with tripod grip; sits upright for the task.',
      supportsText: 'Hand-over-hand, pencil grip sleeve, slant board.',
    },
    {
      rungId: 'R1',
      name: 'Letter formation',
      evidenceText: 'Traces or copies 10+ letters staying on the line.',
      supportsText: 'Dotted-line guides, verbal stroke cues ("down, bump, up").',
    },
    {
      rungId: 'R2',
      name: 'Word copying',
      evidenceText: 'Copies 3+ words with consistent spacing and sizing.',
      supportsText: 'Model word card, highlighted spacing marks.',
    },
    {
      rungId: 'R3',
      name: 'Sentence writing',
      evidenceText: 'Writes a sentence from dictation with ≤2 formation errors.',
      supportsText: 'Verbal repetition, word bank on desk.',
    },
    {
      rungId: 'R4',
      name: 'Free draw + label',
      evidenceText: 'Draws a scene and writes a caption/label independently.',
      supportsText: 'Prompt card only; no letter-level help.',
    },
  ],
}

// ── Reading Input (Listen + Discuss) ─────────────────────────────

export const readingInput: LadderCardDefinition = {
  ladderKey: 'reading_input',
  title: 'Reading Input (Listen + Discuss)',
  streamKey: StreamKey.SpeakExplain,
  intent: 'Build comprehension and engagement through read-aloud and discussion.',
  workItems: [
    'Attentive listening (5–15 min read-aloud)',
    'Recall one detail',
    'Sequence 3 events',
    'Make a connection',
    'Ask a question or share an opinion',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Attentive listening',
      evidenceText: 'Sits and attends for a 5-min read-aloud without redirection.',
      supportsText: 'Fidget tool, picture walk preview, shorter passage.',
    },
    {
      rungId: 'R1',
      name: 'Recall one detail',
      evidenceText: 'Retells one thing that happened in the story.',
      supportsText: 'Who/What/Where prompt card.',
    },
    {
      rungId: 'R2',
      name: 'Sequence events',
      evidenceText: 'Retells 3 events in the correct order.',
      supportsText: 'First/Next/Last graphic organizer.',
    },
    {
      rungId: 'R3',
      name: 'Make a connection',
      evidenceText: 'Connects something in the story to own experience or another book.',
      supportsText: '"This reminds me of…" sentence starter.',
    },
    {
      rungId: 'R4',
      name: 'Discussion',
      evidenceText: 'Asks a question OR offers an opinion about the text without prompting.',
      supportsText: 'None — independent.',
    },
  ],
}

// ── Language Arts Core — Sub-ladder A: Phonics + Blending ────────

export const laPhonics: LadderCardDefinition = {
  ladderKey: 'la_phonics',
  title: 'LA · Phonics + Blending',
  streamKey: StreamKey.DecodeRead,
  intent: 'Decode words from letters → sounds → blends → multisyllable.',
  workItems: [
    'Letter-sound ID (a→/a/)',
    'CVC blending (c-a-t → cat)',
    'Digraphs + blends (sh, ch, bl, cr)',
    'Silent-e + vowel teams (cake, rain)',
    'Multisyllable decoding (rabbit → rab·bit)',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Letter-sound ID',
      evidenceText: 'Says the correct sound for 20+ letters on flashcards.',
      supportsText: 'Picture cue card (a = apple), verbal model.',
    },
    {
      rungId: 'R1',
      name: 'CVC blending',
      evidenceText: 'Blends and reads 10 CVC words aloud (e.g., cat, sit, hop).',
      supportsText: 'Elkonin boxes, finger tapping.',
    },
    {
      rungId: 'R2',
      name: 'Digraphs + blends',
      evidenceText: 'Reads words with sh, ch, th, bl, cr without sounding each letter separately.',
      supportsText: 'Digraph flashcards, color-coded chunks.',
    },
    {
      rungId: 'R3',
      name: 'Silent-e + vowel teams',
      evidenceText: 'Reads words like cake, rain, boat applying the pattern rule.',
      supportsText: 'Rule reminder card ("magic e makes the vowel say its name").',
    },
    {
      rungId: 'R4',
      name: 'Multisyllable decoding',
      evidenceText: 'Reads 2-syllable words by chunking (e.g., rab·bit, kit·ten).',
      supportsText: 'Syllable clap, dot between syllables.',
    },
  ],
}

// ── Language Arts Core — Sub-ladder B: Sight Words (anti-forget) ─

export const laSightWords: LadderCardDefinition = {
  ladderKey: 'la_sightwords',
  title: 'LA · Sight Words (anti-forget)',
  intent: 'Build automatic recognition of high-frequency words. Only add new words when stable.',
  workItems: [
    'First 10 words',
    'First 25 words',
    'First 50 words',
    'First 75 words',
    '100+ words — review cycle active',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE + ' Only add new words when current set is stable.',
  rungs: [
    {
      rungId: 'R0',
      name: 'First 10',
      evidenceText: 'Reads 10 high-frequency words on sight (≤2 sec each).',
      supportsText: 'Flashcards with picture hints, repeated exposure.',
    },
    {
      rungId: 'R1',
      name: 'First 25',
      evidenceText: 'Reads 25 sight words on sight with ≤1 error.',
      supportsText: 'Rainbow writing, word wall reference.',
    },
    {
      rungId: 'R2',
      name: 'First 50',
      evidenceText: 'Reads 50 sight words on sight with ≤2 errors.',
      supportsText: 'Bingo game review, spaced repetition.',
    },
    {
      rungId: 'R3',
      name: 'First 75',
      evidenceText: 'Reads 75 sight words on sight with ≤2 errors.',
      supportsText: 'Self-check flashcard ring, peer quiz.',
    },
    {
      rungId: 'R4',
      name: '100+ stable',
      evidenceText: 'Reads 100+ sight words; weekly review cycle catches drift.',
      supportsText: 'None — self-managed review ring.',
    },
  ],
}

// ── Language Arts Core — Sub-ladder C: Spelling + Writing Prompts ─

export const laSpellingPrompts: LadderCardDefinition = {
  ladderKey: 'la_spellingprompts',
  title: 'LA · Spelling + Writing Prompts (output)',
  streamKey: StreamKey.SpellWrite,
  intent: 'Move from sound-spelling to pattern-spelling to prompted writing.',
  workItems: [
    'Sound-spell CVC words',
    'Write a phonetic sentence',
    'Use spelling patterns (-ight, -tion)',
    'Write 3–4 sentences from a prompt',
    'Write, re-read, and self-edit',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Sound spelling',
      evidenceText: 'Spells 5 CVC words by stretching sounds (e.g., c-a-t → cat).',
      supportsText: 'Elkonin boxes, verbal stretching model.',
    },
    {
      rungId: 'R1',
      name: 'Phonetic sentences',
      evidenceText: 'Writes a simple sentence using phonetic spelling (readable even if imperfect).',
      supportsText: 'Word bank, verbal repetition of sentence.',
    },
    {
      rungId: 'R2',
      name: 'Pattern spelling',
      evidenceText: 'Uses known patterns (e.g., -ight, -tion, silent-e) in dictation.',
      supportsText: 'Pattern chart on desk.',
    },
    {
      rungId: 'R3',
      name: 'Prompted paragraph',
      evidenceText: 'Writes 3–4 sentences from a prompt with mostly correct spelling.',
      supportsText: 'Sentence starters, prompt card.',
    },
    {
      rungId: 'R4',
      name: 'Edited draft',
      evidenceText: 'Writes a paragraph, re-reads, and fixes ≥1 error independently.',
      supportsText: 'Editing checklist only.',
    },
  ],
}

// ── Math Core — Sub-ladder A: Addition + Doubles ─────────────────

export const mathDoubles: LadderCardDefinition = {
  ladderKey: 'math_doubles',
  title: 'Math · Addition + Doubles',
  intent: 'Build addition fluency from counting-on → doubles → mental math to 100.',
  workItems: [
    'Count-on strategy',
    'Doubles facts to 10+10',
    'Doubles-plus-one',
    'Fluency within 20',
    'Mental addition to 100',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Count-on',
      evidenceText: 'Uses counting-on from the larger number for single-digit addition.',
      supportsText: 'Number line, counters, verbal model.',
    },
    {
      rungId: 'R1',
      name: 'Doubles facts',
      evidenceText: 'Knows doubles to 10+10 within 3 sec per fact.',
      supportsText: 'Doubles anchor chart, mirror visual.',
    },
    {
      rungId: 'R2',
      name: 'Doubles +1',
      evidenceText: 'Uses doubles-plus-one strategy (6+7 = 6+6+1 = 13).',
      supportsText: 'Strategy prompt card.',
    },
    {
      rungId: 'R3',
      name: 'Fluency within 20',
      evidenceText: 'Solves addition within 20 in ≤5 sec per fact.',
      supportsText: 'Timed drills with self-check.',
    },
    {
      rungId: 'R4',
      name: 'Mental addition to 100',
      evidenceText: 'Adds 2-digit numbers mentally using place-value strategy.',
      supportsText: 'None — mental math.',
    },
  ],
}

// ── Math Core — Sub-ladder B: Long-Form Subtraction ──────────────

export const mathLongSub: LadderCardDefinition = {
  ladderKey: 'math_longsub',
  title: 'Math · Long-Form Subtraction',
  intent: 'Move from concrete subtraction to multi-digit regrouping.',
  workItems: [
    'Subtract within 10',
    'Subtract within 20 (number line)',
    '2-digit without regrouping',
    '2-digit with regrouping',
    '3-digit with multiple regroups',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Subtract within 10',
      evidenceText: 'Subtracts within 10 using objects or fingers correctly.',
      supportsText: 'Counters, ten-frame, verbal model.',
    },
    {
      rungId: 'R1',
      name: 'Subtract within 20',
      evidenceText: 'Subtracts within 20 using a number line.',
      supportsText: 'Number line mat, hop-back model.',
    },
    {
      rungId: 'R2',
      name: '2-digit no regroup',
      evidenceText: 'Solves 2-digit subtraction without regrouping (e.g., 45−23).',
      supportsText: 'Place-value chart, base-ten blocks.',
    },
    {
      rungId: 'R3',
      name: '2-digit with regroup',
      evidenceText: 'Solves 2-digit subtraction with borrowing (e.g., 53−27).',
      supportsText: 'Step-by-step regrouping guide.',
    },
    {
      rungId: 'R4',
      name: '3-digit subtraction',
      evidenceText: 'Solves 3-digit subtraction with multiple regroups (e.g., 321−187).',
      supportsText: 'Graph paper for alignment only.',
    },
  ],
}

// ── Math Core — Sub-ladder C: Word Problems ──────────────────────

export const mathWordProblems: LadderCardDefinition = {
  ladderKey: 'math_wordproblems',
  title: 'Math · Word Problems',
  intent: 'Read, model, solve, and eventually create word problems.',
  workItems: [
    'Identify the question',
    'Choose the operation',
    'Model + solve (bar model)',
    'Two-step problems',
    'Write own problem',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Identify the question',
      evidenceText: 'Circles or states what the word problem is asking.',
      supportsText: 'Highlighter, "What is the question?" prompt card.',
    },
    {
      rungId: 'R1',
      name: 'Choose operation',
      evidenceText: 'Picks + or − for a one-step word problem and explains why.',
      supportsText: 'Key-word chart (altogether = add, left = subtract).',
    },
    {
      rungId: 'R2',
      name: 'Model + solve',
      evidenceText: 'Draws a bar model and writes the equation for a one-step problem.',
      supportsText: 'Bar-model template, guided example.',
    },
    {
      rungId: 'R3',
      name: 'Two-step problem',
      evidenceText: 'Solves a two-step word problem showing both steps.',
      supportsText: '"Step 1 / Step 2" organizer.',
    },
    {
      rungId: 'R4',
      name: 'Write own problem',
      evidenceText: 'Creates a word problem for a given equation and solves it.',
      supportsText: 'None — independent.',
    },
  ],
}

// ── Math Core — Sub-ladder D: Time + Calendar + Seasons ──────────

export const mathTimeCalendar: LadderCardDefinition = {
  ladderKey: 'math_timecalendar',
  title: 'Math · Time + Calendar + Seasons',
  intent: 'Build time-telling, calendar navigation, and season awareness.',
  workItems: [
    'Days of the week in order',
    'Tell time to the hour',
    'Tell time to the half-hour',
    'Calendar math (days from now)',
    'Months + seasons',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Days of week',
      evidenceText: 'Names all 7 days in order without help.',
      supportsText: 'Days-of-week song, visual calendar.',
    },
    {
      rungId: 'R1',
      name: 'Time to the hour',
      evidenceText: 'Reads an analog clock to the hour (e.g., 3:00).',
      supportsText: 'Geared teaching clock, verbal cue ("short hand = hour").',
    },
    {
      rungId: 'R2',
      name: 'Time to the half-hour',
      evidenceText: 'Reads an analog clock to the half-hour (e.g., 3:30).',
      supportsText: 'Teaching clock with labeled 30-min mark.',
    },
    {
      rungId: 'R3',
      name: 'Calendar math',
      evidenceText: 'Answers "What day is 3 days from Tuesday?" type questions.',
      supportsText: 'Calendar with moveable marker.',
    },
    {
      rungId: 'R4',
      name: 'Months + seasons',
      evidenceText: 'Names all 12 months in order and identifies the season for each.',
      supportsText: 'Months song reference only.',
    },
  ],
}

// ── Math Core — Sub-ladder E: Fractions (intro) ──────────────────

export const mathFractions: LadderCardDefinition = {
  ladderKey: 'math_fractions',
  title: 'Math · Fractions (intro)',
  intent: 'Introduce fractions through concrete models → comparisons → number line.',
  workItems: [
    'Equal parts (halves)',
    'Name fractions (½, ⅓, ¼)',
    'Fraction of a set',
    'Compare fractions',
    'Fraction number line',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Equal parts',
      evidenceText: 'Splits a shape into 2 equal halves and identifies each half.',
      supportsText: 'Paper folding, pre-drawn shape to cut.',
    },
    {
      rungId: 'R1',
      name: 'Name fractions',
      evidenceText: 'Identifies ½, ⅓, ¼ of a shaded shape.',
      supportsText: 'Fraction circles manipulative.',
    },
    {
      rungId: 'R2',
      name: 'Fraction of a set',
      evidenceText: 'Finds ½ of 8 objects or ¼ of 12 objects.',
      supportsText: 'Counters to share into groups.',
    },
    {
      rungId: 'R3',
      name: 'Compare fractions',
      evidenceText: 'Tells which is bigger (½ or ¼) and explains why.',
      supportsText: 'Fraction strips for visual comparison.',
    },
    {
      rungId: 'R4',
      name: 'Fraction number line',
      evidenceText: 'Places ½, ¼, ¾ on a number line from 0 to 1.',
      supportsText: 'Pre-labeled 0 and 1 endpoints only.',
    },
  ],
}

// ── Science (Explore + Discuss) ──────────────────────────────────

export const science: LadderCardDefinition = {
  ladderKey: 'science',
  title: 'Science (Explore + Discuss)',
  intent: 'Build observation, questioning, and simple experimentation skills.',
  workItems: [
    'Observe with senses',
    'Ask "I wonder…" questions',
    'Predict before testing',
    'Test + record results',
    'Explain findings',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Observe',
      evidenceText: 'Describes what they see, hear, or feel about a natural object/event.',
      supportsText: '5-senses chart, magnifying glass, guided walk.',
    },
    {
      rungId: 'R1',
      name: 'Question',
      evidenceText: 'Asks an "I wonder why…" or "What would happen if…" question.',
      supportsText: 'Wonder wall poster, sentence frame.',
    },
    {
      rungId: 'R2',
      name: 'Predict',
      evidenceText: 'Makes a guess before a simple test and states it aloud.',
      supportsText: '"I think ___ because ___" prompt.',
    },
    {
      rungId: 'R3',
      name: 'Test + record',
      evidenceText: 'Runs a simple test and draws/writes the result.',
      supportsText: 'Recording sheet template.',
    },
    {
      rungId: 'R4',
      name: 'Explain',
      evidenceText: 'Tells someone what happened and why they think so.',
      supportsText: 'None — independent narration.',
    },
  ],
}

// ── Art (Color + Seasons + Sensory) ──────────────────────────────

export const art: LadderCardDefinition = {
  ladderKey: 'art',
  title: 'Art (Color + Seasons + Sensory)',
  intent: 'Explore art materials, color theory, seasonal themes, and observation drawing.',
  workItems: [
    'Free exploration with materials',
    'Color mixing (primary → secondary)',
    'Seasonal art project',
    'Sensory/observation drawing',
    'Finished piece with title + statement',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Free exploration',
      evidenceText: 'Uses art materials (paint, clay, crayon, etc.) freely for 10+ min.',
      supportsText: 'Materials laid out, open-ended prompt.',
    },
    {
      rungId: 'R1',
      name: 'Color mixing',
      evidenceText: 'Mixes 2 primary colors to make a secondary and names the result.',
      supportsText: 'Color wheel poster, guided demo.',
    },
    {
      rungId: 'R2',
      name: 'Seasonal art',
      evidenceText: 'Creates an art piece connected to the current season or nature theme.',
      supportsText: 'Photo reference, season word bank.',
    },
    {
      rungId: 'R3',
      name: 'Observation drawing',
      evidenceText: 'Draws from a real object (still life, nature find) with recognizable details.',
      supportsText: 'Object placed in front; verbal prompt to look again.',
    },
    {
      rungId: 'R4',
      name: 'Finished piece',
      evidenceText: 'Completes a piece, gives it a title, and says one sentence about it.',
      supportsText: 'None — independent.',
    },
  ],
}

// ── Booster Cards (Spaced Review Deck) ───────────────────────────

export const booster: LadderCardDefinition = {
  ladderKey: 'booster',
  title: 'Booster Cards (Spaced Review Deck)',
  intent: 'Maintain mastery across subjects with a personal spaced-review card deck.',
  workItems: [
    'Build a deck of 10+ review cards',
    'Daily 5-card flip with self-check',
    'Self-sort know vs. review piles',
    'Teach-back a card to a partner',
    'Retire mastered cards, rotate new ones',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Deck setup',
      evidenceText: '10+ review cards created from prior lessons with Q on front, A on back.',
      supportsText: 'Card template, adult writes while child dictates.',
    },
    {
      rungId: 'R1',
      name: 'Daily flip',
      evidenceText: 'Reviews 5 cards/day and self-checks with ≤1 error for 3 sessions.',
      supportsText: 'Timer, adult reads question if needed.',
    },
    {
      rungId: 'R2',
      name: 'Self-sort',
      evidenceText: 'Independently sorts cards into "know" and "review" piles after flipping.',
      supportsText: 'Two labeled trays/piles.',
    },
    {
      rungId: 'R3',
      name: 'Teach-back',
      evidenceText: 'Picks a card and explains the answer to a partner in own words.',
      supportsText: '"Teach it like you\'re the teacher" prompt.',
    },
    {
      rungId: 'R4',
      name: 'Retire + rotate',
      evidenceText: 'Retires mastered cards and adds new ones from the week\'s lessons independently.',
      supportsText: 'None — self-managed.',
    },
  ],
}

// ── All Lincoln Ladders ──────────────────────────────────────────

export const LINCOLN_LADDERS: LadderCardDefinition[] = [
  handwriting,
  readingInput,
  laPhonics,
  laSightWords,
  laSpellingPrompts,
  mathDoubles,
  mathLongSub,
  mathWordProblems,
  mathTimeCalendar,
  mathFractions,
  science,
  art,
  booster,
]
