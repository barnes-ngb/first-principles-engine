import { doc, type DocumentReference, getDoc, setDoc } from 'firebase/firestore'

import {
  artifactsCollection,
  childrenCollection,
  laddersCollection,
  milestoneProgressCollection,
  projectsCollection,
  sessionsCollection,
  weeksCollection,
} from '../firebase/firestore'
import {
  DayBlockType,
  EngineStage,
  EvidenceType,
  LearningLocation,
  ProjectPhase,
  RoutineItemKey,
  SessionResult,
  StreamId,
  SubjectBucket,
  TrackType,
} from '../types/enums'
import { formatDateYmd } from '../utils/format'

const getWeekStart = (date: Date) => {
  const start = new Date(date)
  const day = start.getDay()
  const diff = (day + 6) % 7
  start.setDate(start.getDate() - diff)
  start.setHours(0, 0, 0, 0)
  return start
}

const ensureDocument = async <T>(ref: DocumentReference<T>, data: T) => {
  const snapshot = await getDoc(ref)
  if (snapshot.exists()) {
    await setDoc(ref, data, { merge: true })
    return
  }
  await setDoc(ref, data)
}

export const seedDemoFamily = async (familyId: string): Promise<void> => {
  const children = [
    {
      id: 'lincoln',
      name: 'Lincoln',
      dayBlocks: [
        DayBlockType.Formation,
        DayBlockType.Reading,
        DayBlockType.Math,
        DayBlockType.Together,
        DayBlockType.Project,
      ],
      routineItems: [
        RoutineItemKey.PhonemicAwareness,
        RoutineItemKey.PhonicsLesson,
        RoutineItemKey.DecodableReading,
        RoutineItemKey.SpellingDictation,
        RoutineItemKey.NumberSenseOrFacts,
        RoutineItemKey.WordProblemsModeled,
        RoutineItemKey.NarrationOrSoundReps,
      ],
    },
    {
      id: 'london',
      name: 'London',
      dayBlocks: [
        DayBlockType.Formation,
        DayBlockType.Reading,
        DayBlockType.Project,
        DayBlockType.Together,
      ],
    },
  ]

  await Promise.all(
    children.map((child) =>
      ensureDocument(doc(childrenCollection(familyId), child.id), {
        id: child.id,
        name: child.name,
      }),
    ),
  )

  await Promise.all([
    // ── Lincoln Ladders (6 streams) ──────────────────────────────

    // 1. Decode → Read (Literacy input)
    ensureDocument(doc(laddersCollection(familyId), 'lincoln-reading'), {
      id: 'lincoln-reading',
      childId: 'lincoln',
      title: 'Decode → Read',
      description:
        'Letters → sounds → words → short pages. Finish a page with fewer stalls.',
      domain: 'Reading',
      rungs: [
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
      ],
    }),

    // 2. Spell → Write (Literacy output)
    ensureDocument(doc(laddersCollection(familyId), 'lincoln-writing'), {
      id: 'lincoln-writing',
      childId: 'lincoln',
      title: 'Spell → Write',
      description:
        'Sounds → letters → words → 1–3 sentences. Use a simple checklist.',
      domain: 'LanguageArts',
      rungs: [
        {
          title: 'Segment sounds',
          description:
            'Break a spoken word into individual sounds (cat → c-a-t).',
          order: 1,
          proofExamples: [
            'Segment 5 CVC words correctly using sound boxes',
            'Tap out sounds on fingers for a new word',
          ],
        },
        {
          title: 'Spell CVC words',
          description:
            'Write CVC words from dictation (hearing "dog" → writing d-o-g).',
          order: 2,
          proofExamples: [
            'Correctly spell 8/10 CVC dictation words',
            'Write a CVC word without needing sound boxes',
          ],
        },
        {
          title: 'Spell blends & digraphs',
          description:
            'Spell words with blends (st, bl) and digraphs (sh, ch, th).',
          order: 3,
          proofExamples: [
            'Spell 5 blend/digraph words from dictation',
            'Identify the digraph sound in a new word',
          ],
        },
        {
          title: 'Write a simple sentence',
          description:
            'Write one sentence with a capital letter, spaces between words, and a period.',
          order: 4,
          proofExamples: [
            'Write a dictated sentence with correct capitalization and punctuation',
            'Leave clear finger spaces between words',
          ],
        },
        {
          title: 'Write 2–3 connected sentences',
          description:
            'Write a short paragraph of 2–3 sentences about one topic.',
          order: 5,
          proofExamples: [
            'Produce 2–3 sentences that stay on topic',
            'Use the checklist: capital, spaces, punctuation, on-topic',
          ],
        },
        {
          title: 'Edit own writing',
          description:
            'Re-read writing and fix at least one error using a checklist.',
          order: 6,
          proofExamples: [
            'Identify and correct 1+ errors in own writing without prompting',
            'Use the editing checklist independently',
          ],
        },
      ],
    }),

    // 3. Speak → Explain (Communication)
    ensureDocument(doc(laddersCollection(familyId), 'lincoln-communication'), {
      id: 'lincoln-communication',
      childId: 'lincoln',
      title: 'Speak → Explain',
      description:
        'Clear short answers → First/Then/Last stories → teach-back.',
      domain: 'Communication',
      rungs: [
        {
          title: 'Answer in a full sentence',
          description:
            'Respond to a question with a complete sentence instead of one word.',
          order: 1,
          proofExamples: [
            'Answer 3 questions in a row with full sentences',
            'Start answers with "I…" or "The…" instead of a single word',
          ],
        },
        {
          title: 'Retell with First/Then/Last',
          description:
            'Retell a short event or story using First, Then, Last structure.',
          order: 2,
          proofExamples: [
            'Retell a read-aloud using all three parts',
            'Retell a weekend activity using First/Then/Last',
          ],
        },
        {
          title: 'Describe with details',
          description:
            'Add at least 2 describing details when telling about something (color, size, feeling).',
          order: 3,
          proofExamples: [
            'Describe an object with 2+ details',
            'Add a feeling or sensory word to a description',
          ],
        },
        {
          title: 'Explain why',
          description:
            'Give a reason when explaining a choice or answer ("because…").',
          order: 4,
          proofExamples: [
            'Answer 3 "why" questions with a reason attached',
            'Use "because" naturally in conversation',
          ],
        },
        {
          title: 'Teach-back',
          description:
            'Explain a concept or activity to someone else so they understand it.',
          order: 5,
          proofExamples: [
            'Teach London one thing learned; London can repeat it back',
            'Explain a process clearly enough for another person to follow',
          ],
        },
        {
          title: 'Narrate a sequence',
          description:
            'Tell a multi-step process in order with transition words.',
          order: 6,
          proofExamples: [
            'Explain a 4+ step process (recipe, build, experiment) clearly',
            'Use words like first, next, then, finally',
          ],
        },
      ],
    }),

    // 4. Number sense → Word problems (Math spine)
    ensureDocument(doc(laddersCollection(familyId), 'lincoln-math'), {
      id: 'lincoln-math',
      childId: 'lincoln',
      title: 'Number Sense → Word Problems',
      description:
        'Place value + add/sub strategies → early mult concepts → explain thinking.',
      domain: 'Math',
      rungs: [
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
      ],
    }),

    // 5. Start/finish → Independence (Executive function)
    ensureDocument(doc(laddersCollection(familyId), 'lincoln-independence'), {
      id: 'lincoln-independence',
      childId: 'lincoln',
      title: 'Start/Finish → Independence',
      description:
        'Begin with one prompt → sustain 10–15 min → complete a loop + mark tracker.',
      domain: 'Executive Function',
      rungs: [
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
            'Circle the correct score symbol (✔ / △ / ✖) without help',
          ],
        },
      ],
    }),

    // 6. Build/test/improve (Curiosity / Dad Lab)
    ensureDocument(doc(laddersCollection(familyId), 'lincoln-dadlab'), {
      id: 'lincoln-dadlab',
      childId: 'lincoln',
      title: 'Build / Test / Improve',
      description:
        'Follow a build → change a variable → iterate → teach London.',
      domain: 'Curiosity',
      rungs: [
        {
          title: 'Follow a build plan',
          description:
            'Follow step-by-step instructions to complete a simple build.',
          order: 1,
          proofExamples: [
            'Complete a guided build (LEGO set, craft kit) following the steps',
            'Point to each step before doing it',
          ],
        },
        {
          title: 'Name what happened',
          description:
            'Observe and describe what happened during a build or experiment.',
          order: 2,
          proofExamples: [
            'State 2 observations after a build ("It fell over. The tape didn\'t hold.")',
            'Answer "What did you notice?" with a specific detail',
          ],
        },
        {
          title: 'Change one variable',
          description:
            'Identify one thing to change and try it ("What if we use more tape?").',
          order: 3,
          proofExamples: [
            'Name the variable changed and describe the new result',
            'Say "I changed ___ and now ___"',
          ],
        },
        {
          title: 'Predict before testing',
          description:
            'Make a prediction before trying something ("I think it will hold because…").',
          order: 4,
          proofExamples: [
            'State a prediction with a reason before 2 experiments',
            'Use "I think ___ because ___" before testing',
          ],
        },
        {
          title: 'Iterate and improve',
          description:
            'Use test results to make a second version that works better.',
          order: 5,
          proofExamples: [
            'Show version 1 and version 2 with explanation of what changed',
            'Explain why version 2 is better',
          ],
        },
        {
          title: 'Teach London',
          description:
            'Explain the build or experiment to London so he understands the key idea.',
          order: 6,
          proofExamples: [
            'London can repeat back the main idea',
            'London attempts the build using Lincoln\'s explanation',
          ],
        },
      ],
    }),

    // ── London Ladders ───────────────────────────────────────────

    ensureDocument(doc(laddersCollection(familyId), 'london-math'), {
      id: 'london-math',
      childId: 'london',
      title: 'London Math Ladder',
      description: 'Daily math fluency steps.',
      domain: 'Math',
      rungs: [
        { title: 'Count to 100', order: 1 },
        { title: 'Solve quick sums', order: 2 },
      ],
    }),
  ])

  const today = new Date()
  const weekStart = getWeekStart(today)
  const weekId = formatDateYmd(weekStart)

  await ensureDocument(doc(weeksCollection(familyId), weekId), {
    id: weekId,
    startDate: weekId,
    theme: 'Curiosity in creation',
    virtue: 'Perseverance',
    scriptureRef: 'Psalm 19:1',
    heartQuestion: 'What do we notice about God today?',
    tracks: [TrackType.Support, TrackType.Stretch],
    flywheelPlan: 'Daily wonder walk with short reflections.',
    buildLab: {
      title: 'Build Lab: gather materials and tinker together.',
      materials: ['Cardboard', 'Tape', 'Markers'],
      steps: [
        'Sketch a simple build idea.',
        'Gather materials and build together.',
        'Share what worked and what you would try next.',
      ],
    },
    childGoals: [
      { childId: 'lincoln', goals: ['Read aloud for 10 minutes'] },
      { childId: 'london', goals: ['Practice quick sums for 5 minutes'] },
    ],
  })

  const createdAt = formatDateYmd(today)
  const achievedAt = new Date().toISOString()

  await Promise.all([
    // ── Lincoln artifacts ────────────────────────────────────────
    ensureDocument(doc(artifactsCollection(familyId), 'lincoln-wonder-note'), {
      id: 'lincoln-wonder-note',
      childId: 'lincoln',
      title: 'Backyard bird notes',
      type: EvidenceType.Note,
      createdAt,
      tags: {
        engineStage: EngineStage.Wonder,
        subjectBucket: SubjectBucket.Science,
        location: LearningLocation.Home,
        domain: 'Nature',
      },
    }),
    ensureDocument(doc(artifactsCollection(familyId), 'lincoln-letter-sounds'), {
      id: 'lincoln-letter-sounds',
      childId: 'lincoln',
      title: 'Letter-sound flashcard run (20+ letters)',
      type: EvidenceType.Note,
      createdAt,
      tags: {
        engineStage: EngineStage.Explain,
        subjectBucket: SubjectBucket.Reading,
        location: LearningLocation.Home,
        domain: 'Reading',
        ladderRef: { ladderId: 'lincoln-reading', rungId: 'order-1' },
      },
    }),
    ensureDocument(doc(artifactsCollection(familyId), 'lincoln-cvc-blend'), {
      id: 'lincoln-cvc-blend',
      childId: 'lincoln',
      title: 'Blended 10 CVC words aloud',
      type: EvidenceType.Audio,
      createdAt,
      tags: {
        engineStage: EngineStage.Explain,
        subjectBucket: SubjectBucket.Reading,
        location: LearningLocation.Home,
        domain: 'Reading',
        ladderRef: { ladderId: 'lincoln-reading', rungId: 'order-2' },
      },
    }),
    ensureDocument(doc(artifactsCollection(familyId), 'lincoln-dadlab-build'), {
      id: 'lincoln-dadlab-build',
      childId: 'lincoln',
      title: 'Cardboard ramp build (followed plan)',
      type: EvidenceType.Photo,
      createdAt,
      tags: {
        engineStage: EngineStage.Build,
        subjectBucket: SubjectBucket.Science,
        location: LearningLocation.Home,
        domain: 'Curiosity',
        ladderRef: { ladderId: 'lincoln-dadlab', rungId: 'order-1' },
      },
    }),

    // ── London artifacts ─────────────────────────────────────────
    ensureDocument(doc(artifactsCollection(familyId), 'london-build-photo'), {
      id: 'london-build-photo',
      childId: 'london',
      title: 'Shape tower build',
      type: EvidenceType.Photo,
      createdAt,
      tags: {
        engineStage: EngineStage.Build,
        subjectBucket: SubjectBucket.Math,
        location: LearningLocation.Home,
        domain: 'Geometry',
      },
    }),

    // ── Lincoln milestone progress ───────────────────────────────
    // Reading: Letter-sound match → achieved
    ensureDocument(
      doc(milestoneProgressCollection(familyId), 'lincoln-lincoln-reading-order-1'),
      {
        id: 'lincoln-lincoln-reading-order-1',
        childId: 'lincoln',
        ladderId: 'lincoln-reading',
        rungId: 'order-1',
        label: 'Letter-sound match',
        status: 'achieved',
        achievedAt,
      },
    ),
    // Reading: Blend CVC words → achieved
    ensureDocument(
      doc(milestoneProgressCollection(familyId), 'lincoln-lincoln-reading-order-2'),
      {
        id: 'lincoln-lincoln-reading-order-2',
        childId: 'lincoln',
        ladderId: 'lincoln-reading',
        rungId: 'order-2',
        label: 'Blend CVC words',
        status: 'achieved',
        achievedAt,
      },
    ),
    // Math: Count and write to 100 → achieved
    ensureDocument(
      doc(milestoneProgressCollection(familyId), 'lincoln-lincoln-math-order-1'),
      {
        id: 'lincoln-lincoln-math-order-1',
        childId: 'lincoln',
        ladderId: 'lincoln-math',
        rungId: 'order-1',
        label: 'Count and write to 100',
        status: 'achieved',
        achievedAt,
      },
    ),
    // Dad Lab: Follow a build plan → achieved
    ensureDocument(
      doc(milestoneProgressCollection(familyId), 'lincoln-lincoln-dadlab-order-1'),
      {
        id: 'lincoln-lincoln-dadlab-order-1',
        childId: 'lincoln',
        ladderId: 'lincoln-dadlab',
        rungId: 'order-1',
        label: 'Follow a build plan',
        status: 'achieved',
        achievedAt,
      },
    ),

    // ── London milestone progress ────────────────────────────────
    ensureDocument(
      doc(milestoneProgressCollection(familyId), 'london-london-math-order-1'),
      {
        id: 'london-london-math-order-1',
        childId: 'london',
        ladderId: 'london-math',
        rungId: 'order-1',
        label: 'Count to 100',
        status: 'active',
      },
    ),
  ])

  // ── Sample sessions for Lincoln ──────────────────────────────
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const twoDaysAgo = new Date(today)
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

  await Promise.all([
    ensureDocument(doc(sessionsCollection(familyId), 'lincoln-reading-1'), {
      id: 'lincoln-reading-1',
      childId: 'lincoln',
      date: formatDateYmd(twoDaysAgo),
      streamId: StreamId.Reading,
      ladderId: 'lincoln-reading',
      targetRungOrder: 3,
      result: SessionResult.Hit,
      durationSeconds: 720,
      createdAt: twoDaysAgo.toISOString(),
    }),
    ensureDocument(doc(sessionsCollection(familyId), 'lincoln-reading-2'), {
      id: 'lincoln-reading-2',
      childId: 'lincoln',
      date: formatDateYmd(yesterday),
      streamId: StreamId.Reading,
      ladderId: 'lincoln-reading',
      targetRungOrder: 3,
      result: SessionResult.Hit,
      durationSeconds: 600,
      createdAt: yesterday.toISOString(),
    }),
    ensureDocument(doc(sessionsCollection(familyId), 'lincoln-reading-3'), {
      id: 'lincoln-reading-3',
      childId: 'lincoln',
      date: formatDateYmd(today),
      streamId: StreamId.Reading,
      ladderId: 'lincoln-reading',
      targetRungOrder: 3,
      result: SessionResult.Hit,
      durationSeconds: 540,
      createdAt: today.toISOString(),
    }),
    ensureDocument(doc(sessionsCollection(familyId), 'lincoln-math-1'), {
      id: 'lincoln-math-1',
      childId: 'lincoln',
      date: formatDateYmd(yesterday),
      streamId: StreamId.Math,
      ladderId: 'lincoln-math',
      targetRungOrder: 2,
      result: SessionResult.Near,
      durationSeconds: 900,
      createdAt: yesterday.toISOString(),
    }),
    ensureDocument(doc(sessionsCollection(familyId), 'lincoln-math-2'), {
      id: 'lincoln-math-2',
      childId: 'lincoln',
      date: formatDateYmd(today),
      streamId: StreamId.Math,
      ladderId: 'lincoln-math',
      targetRungOrder: 2,
      result: SessionResult.Hit,
      durationSeconds: 840,
      createdAt: today.toISOString(),
    }),
  ])

  // ── Sample Dad Lab project for Lincoln ───────────────────────
  await ensureDocument(doc(projectsCollection(familyId), 'lincoln-ramp-build'), {
    id: 'lincoln-ramp-build',
    childId: 'lincoln',
    title: 'Cardboard Ramp Experiment',
    phase: ProjectPhase.Test,
    planNotes: 'Build a ramp from cardboard and test how far a marble rolls.',
    buildNotes: 'Used 3 pieces of cardboard taped together. Added side rails.',
    testNotes: 'Marble went 4 feet on carpet. Trying tile floor next.',
    createdAt: twoDaysAgo.toISOString(),
    updatedAt: today.toISOString(),
    completed: false,
  })
}
