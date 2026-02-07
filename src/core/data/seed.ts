import { doc, type DocumentReference, getDoc, setDoc } from 'firebase/firestore'

import {
  artifactsCollection,
  childrenCollection,
  laddersCollection,
  milestoneProgressCollection,
  weeksCollection,
} from '../firebase/firestore'
import {
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
  TrackType,
} from '../types/enums'
import { formatDateYmd } from '../../lib/format'

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
    { id: 'lincoln', name: 'Lincoln' },
    { id: 'london', name: 'London' },
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
    ensureDocument(doc(laddersCollection(familyId), 'lincoln-reading'), {
      id: 'lincoln-reading',
      title: 'Lincoln Reading Ladder',
      description: 'Foundational reading practice.',
      rungs: [
        { title: 'Sound it out', order: 1 },
        { title: 'Read with rhythm', order: 2 },
      ],
    }),
    ensureDocument(doc(laddersCollection(familyId), 'london-math'), {
      id: 'london-math',
      title: 'London Math Ladder',
      description: 'Daily math fluency steps.',
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
    ensureDocument(
      doc(milestoneProgressCollection(familyId), 'lincoln-lincoln-reading-order-1'),
      {
        id: 'lincoln-lincoln-reading-order-1',
        childId: 'lincoln',
        ladderId: 'lincoln-reading',
        rungId: 'order-1',
        label: 'Sound it out',
        achieved: true,
        status: 'achieved',
        achievedAt,
      },
    ),
    ensureDocument(
      doc(milestoneProgressCollection(familyId), 'london-london-math-order-1'),
      {
        id: 'london-london-math-order-1',
        childId: 'london',
        ladderId: 'london-math',
        rungId: 'order-1',
        label: 'Count to 100',
        achieved: false,
        status: 'active',
      },
    ),
  ])
}
