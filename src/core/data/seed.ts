import { doc, setDoc } from 'firebase/firestore'

import {
  artifactsCollection,
  childrenCollection,
  laddersCollection,
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

const ensureDoc = async <T>(ref: ReturnType<typeof doc>, data: T) =>
  setDoc(ref, data, { merge: true })

const startOfWeekMonday = (date: Date) => {
  const start = new Date(date)
  const day = start.getDay()
  const offset = (day + 6) % 7
  start.setDate(start.getDate() - offset)
  start.setHours(0, 0, 0, 0)
  return start
}

export const seedDemoFamily = async (familyId: string): Promise<void> => {
  const children = [
    { id: 'lincoln', name: 'Lincoln' },
    { id: 'london', name: 'London' },
  ]

  await Promise.all(
    children.map((child) => {
      const childRef = doc(childrenCollection(familyId), child.id)
      return ensureDoc(childRef, child)
    }),
  )

  const ladders = [
    {
      id: 'lincoln-reading',
      title: 'Lincoln Reading Ladder',
      description: 'Short daily reading practice.',
      rungs: [
        { id: 'lincoln-reading-1', title: 'Read a short story', order: 1 },
        { id: 'lincoln-reading-2', title: 'Retell the main idea', order: 2 },
      ],
    },
    {
      id: 'london-math',
      title: 'London Math Ladder',
      description: 'Hands-on number sense games.',
      rungs: [
        { id: 'london-math-1', title: 'Count to 20', order: 1 },
        { id: 'london-math-2', title: 'Add within 10', order: 2 },
      ],
    },
  ]

  await Promise.all(
    ladders.map((ladder) => {
      const ladderRef = doc(laddersCollection(familyId), ladder.id)
      return ensureDoc(ladderRef, ladder)
    }),
  )

  const weekStart = startOfWeekMonday(new Date())
  const weekId = formatDateYmd(weekStart)
  const weekPlan = {
    id: weekId,
    startDate: weekId,
    theme: 'Curiosity leads to discovery.',
    virtue: 'Perseverance',
    scriptureRef: 'James 1:5',
    heartQuestion: 'What do we do when learning feels hard?',
    tracks: [TrackType.Support, TrackType.Stretch],
    flywheelPlan: 'Short cycles of wonder, build, and reflect each day.',
    buildLab:
      'Build Lab: create a simple model, draw it, and explain what you learned.',
  }

  const weekRef = doc(weeksCollection(familyId), weekId)
  await ensureDoc(weekRef, weekPlan)

  const today = formatDateYmd(new Date())
  const artifacts = [
    {
      id: 'lincoln-reading-note',
      childId: 'lincoln',
      weekPlanId: weekId,
      title: 'Reading reflection',
      type: EvidenceType.Note,
      createdAt: today,
      tags: {
        engineStage: EngineStage.Reflect,
        subjectBucket: SubjectBucket.Reading,
        location: LearningLocation.Home,
        domain: 'Comprehension',
      },
    },
    {
      id: 'london-math-photo',
      childId: 'london',
      weekPlanId: weekId,
      title: 'Math game snapshot',
      type: EvidenceType.Photo,
      createdAt: today,
      tags: {
        engineStage: EngineStage.Build,
        subjectBucket: SubjectBucket.Math,
        location: LearningLocation.Home,
        domain: 'Number sense',
      },
    },
  ]

  await Promise.all(
    artifacts.map((artifact) => {
      const artifactRef = doc(artifactsCollection(familyId), artifact.id)
      return ensureDoc(artifactRef, artifact)
    }),
  )
}
