/**
 * Seed UFLI Foundations lesson data and initialize Lincoln's progress.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json npm run seed:ufli
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json FAMILY_ID=abc123 npm run seed:ufli
 *
 * Idempotent — safe to re-run:
 *   - Lessons use set() with merge (no duplicate writes)
 *   - Lincoln's progress is only written if currentLesson <= 1
 */
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface LessonData {
  lessonNumber: number
  concept: string
  targetGraphemes: string[]
  heartWords: string[]
  prerequisiteLessons: number[]
  toolboxSlideUrl: string
  decodablePassageRef: string
  level: 1 | 2 | 3
}

async function main() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credPath) {
    console.error(
      'Error: Set GOOGLE_APPLICATION_CREDENTIALS to your service account key path.\n' +
        'Example: GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json npm run seed:ufli',
    )
    process.exit(1)
  }

  initializeApp({ credential: cert(credPath) })
  const db = getFirestore()

  // Resolve family ID from env or first Firestore family doc
  let familyId = process.env.FAMILY_ID
  if (!familyId) {
    const snap = await db.collection('families').limit(1).get()
    if (snap.empty) {
      console.error('No FAMILY_ID env var set and no families found in Firestore.')
      process.exit(1)
    }
    familyId = snap.docs[0].id
    console.log(`No FAMILY_ID set — using first family: ${familyId}`)
  } else {
    console.log(`Using FAMILY_ID: ${familyId}`)
  }

  // ── 1. Seed UFLI lessons ─────────────────────────────────────
  const lessonsPath = resolve(__dirname, '..', 'functions', 'src', 'data', 'ufliLessons.json')
  const lessons: LessonData[] = JSON.parse(readFileSync(lessonsPath, 'utf-8'))
  const collRef = db.collection(`families/${familyId}/ufliLessons`)

  console.log(`\nSeeding ${lessons.length} UFLI lessons into families/${familyId}/ufliLessons...`)
  const BATCH_SIZE = 500
  for (let i = 0; i < lessons.length; i += BATCH_SIZE) {
    const batch = db.batch()
    const chunk = lessons.slice(i, i + BATCH_SIZE)
    for (const lesson of chunk) {
      batch.set(collRef.doc(String(lesson.lessonNumber)), lesson, { merge: true })
    }
    await batch.commit()
    console.log(
      `  Wrote lessons ${chunk[0].lessonNumber}\u2013${chunk[chunk.length - 1].lessonNumber}`,
    )
  }
  console.log(`Done \u2014 ${lessons.length} lessons seeded.`)

  // ── 2. Find Lincoln by name ──────────────────────────────────
  const childrenSnap = await db.collection(`families/${familyId}/children`).get()
  const lincolnDoc = childrenSnap.docs.find(
    (d) => ((d.data().name as string) || '').toLowerCase() === 'lincoln',
  )

  if (!lincolnDoc) {
    console.warn('\nNo child named "Lincoln" found \u2014 skipping progress initialization.')
    console.log('You can manually set a starting lesson via Progress > Curriculum in the app.')
    process.exit(0)
  }

  const lincolnId = lincolnDoc.id
  console.log(`\nFound Lincoln (${lincolnId}).`)

  // ── 3. Set starting lesson (idempotent) ──────────────────────
  const progressRef = db.doc(
    `families/${familyId}/children/${lincolnId}/ufliProgress/current`,
  )
  const progressSnap = await progressRef.get()

  if (progressSnap.exists && (progressSnap.data()?.currentLesson ?? 0) > 1) {
    console.log(
      `Lincoln is already at lesson ${progressSnap.data()!.currentLesson} \u2014 not overwriting.`,
    )
  } else {
    const startLesson = 62
    const masteredLessons = Array.from({ length: startLesson - 1 }, (_, i) => i + 1)
    await progressRef.set({
      currentLesson: startLesson,
      masteredLessons,
      lastEncodingScore: null,
      lastEncodingDate: null,
      nonsenseWordFluency: [],
    })
    console.log(
      `Set Lincoln to Lesson ${startLesson} (${masteredLessons.length} lessons mastered).`,
    )
  }

  console.log('\nAll done!')
  process.exit(0)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
