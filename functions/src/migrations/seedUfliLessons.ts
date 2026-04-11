/**
 * One-off migration: seed UFLI Foundations lesson data into Firestore.
 *
 * Usage (from functions/ directory):
 *   npx ts-node --esm src/migrations/seedUfliLessons.ts <familyId>
 *
 * Idempotent — uses set() with merge, safe to re-run.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const lessons: Array<{
  lessonNumber: number;
  concept: string;
  targetGraphemes: string[];
  heartWords: string[];
  prerequisiteLessons: number[];
  toolboxSlideUrl: string;
  decodablePassageRef: string;
  level: 1 | 2 | 3;
}> = require("../data/ufliLessons.json") as typeof lessons;

async function main() {
  const familyId = process.argv[2];
  if (!familyId) {
    console.error("Usage: npx ts-node --esm src/migrations/seedUfliLessons.ts <familyId>");
    process.exit(1);
  }

  // Initialize Firebase Admin — uses GOOGLE_APPLICATION_CREDENTIALS or default
  initializeApp({
    credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : undefined,
  });

  const db = getFirestore();
  const collectionRef = db.collection(`families/${familyId}/ufliLessons`);

  console.log(`Seeding ${lessons.length} UFLI lessons into families/${familyId}/ufliLessons...`);

  // Batch write (max 500 per batch)
  const BATCH_SIZE = 500;
  for (let i = 0; i < lessons.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = lessons.slice(i, i + BATCH_SIZE);

    for (const lesson of chunk) {
      const docRef = collectionRef.doc(String(lesson.lessonNumber));
      batch.set(docRef, lesson, { merge: true });
    }

    await batch.commit();
    console.log(`  Wrote lessons ${chunk[0].lessonNumber}–${chunk[chunk.length - 1].lessonNumber}`);
  }

  console.log("Done. All UFLI lessons seeded.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
