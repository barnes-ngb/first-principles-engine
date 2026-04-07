import { doc, type DocumentReference, getDoc, setDoc } from 'firebase/firestore'

import {
  artifactsCollection,
  childrenCollection,
  weeksCollection,
} from '../firebase/firestore'
import {
  DayBlockType,
  EngineStage,
  EvidenceType,
  LearningLocation,
  RoutineItemKey,
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

  await Promise.all([
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
      },
    }),
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
  ])
}
