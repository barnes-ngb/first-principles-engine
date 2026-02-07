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
        { id: 'sound-it-out', title: 'Sound it out', order: 1 },
        { id: 'read-with-rhythm', title: 'Read with rhythm', order: 2 },
      ],
    }),
    ensureDocument(doc(laddersCollection(familyId), 'london-math'), {
      id: 'london-math',
      title: 'London Math Ladder',
      description: 'Daily math fluency steps.',
      rungs: [
        { id: 'count-to-100', title: 'Count to 100', order: 1 },
        { id: 'solve-quick-sums', title: 'Solve quick sums', order: 2 },
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
    buildLab: 'Build Lab: gather materials and tinker together.',
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
      doc(
        milestoneProgressCollection(familyId),
        'lincoln-lincoln-reading-sound-it-out',
      ),
      {
        id: 'lincoln-lincoln-reading-sound-it-out',
        childId: 'lincoln',
        ladderId: 'lincoln-reading',
        rungId: 'sound-it-out',
        label: 'Sound it out',
        status: 'achieved',
        achievedAt: createdAt,
        notes: 'Sounded out short vowel words.',
      },
    ),
    ensureDocument(
      doc(
        milestoneProgressCollection(familyId),
        'lincoln-lincoln-reading-read-with-rhythm',
      ),
      {
        id: 'lincoln-lincoln-reading-read-with-rhythm',
        childId: 'lincoln',
        ladderId: 'lincoln-reading',
        rungId: 'read-with-rhythm',
        label: 'Read with rhythm',
        status: 'active',
      },
    ),
    ensureDocument(
      doc(
        milestoneProgressCollection(familyId),
        'london-london-math-count-to-100',
      ),
      {
        id: 'london-london-math-count-to-100',
        childId: 'london',
        ladderId: 'london-math',
        rungId: 'count-to-100',
        label: 'Count to 100',
        status: 'achieved',
        achievedAt: createdAt,
      },
    ),
    ensureDocument(
      doc(
        milestoneProgressCollection(familyId),
        'london-london-math-solve-quick-sums',
      ),
      {
        id: 'london-london-math-solve-quick-sums',
        childId: 'london',
        ladderId: 'london-math',
        rungId: 'solve-quick-sums',
        label: 'Solve quick sums',
        status: 'locked',
      },
    ),
  ])
}
