/**
 * One-off script: set Lincoln's Knowledge Mine working levels so phonics
 * quests start at Level 6 and comprehension at Level 4.
 *
 * Usage (from repo root):
 *   npm run set:lincoln-level
 *
 * Env vars:
 *   GOOGLE_APPLICATION_CREDENTIALS — path to service-account key JSON
 *   FAMILY_ID                      — (optional) explicit family ID;
 *                                    defaults to first family found
 *
 * Idempotent — uses Firestore set({ merge: true }), safe to re-run.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const LINCOLN_NAME = "lincoln";
const PHONICS_LEVEL = 6;
const COMPREHENSION_LEVEL = 4;

async function main() {
  // ── Init Firebase Admin ──────────────────────────────────────
  initializeApp({
    credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : undefined,
  });
  const db = getFirestore();

  // ── Resolve family ID ────────────────────────────────────────
  let familyId = process.env.FAMILY_ID;
  if (!familyId) {
    const families = await db.collection("families").limit(1).get();
    if (families.empty) {
      console.error("No families found in Firestore.");
      process.exit(1);
    }
    familyId = families.docs[0].id;
    console.log(`No FAMILY_ID env var — using first family: ${familyId}`);
  }

  // ── Find Lincoln ─────────────────────────────────────────────
  const childrenSnap = await db
    .collection(`families/${familyId}/children`)
    .get();

  const lincolnDoc = childrenSnap.docs.find(
    (doc) => (doc.data().name ?? "").toLowerCase() === LINCOLN_NAME,
  );

  if (!lincolnDoc) {
    console.error(
      `Could not find child named "${LINCOLN_NAME}" in family ${familyId}.`,
    );
    console.error(
      "Children found:",
      childrenSnap.docs.map((d) => d.data().name),
    );
    process.exit(1);
  }

  const childId = lincolnDoc.id;
  console.log(`Found Lincoln: childId=${childId}`);

  // ── Read current snapshot ────────────────────────────────────
  const snapshotRef = db.doc(
    `families/${familyId}/skillSnapshots/${childId}`,
  );
  const snapshotDoc = await snapshotRef.get();
  const currentData = snapshotDoc.exists ? snapshotDoc.data() : null;
  const currentLevels = currentData?.workingLevels ?? {};

  console.log("BEFORE workingLevels:", JSON.stringify(currentLevels, null, 2));

  // ── Build update ─────────────────────────────────────────────
  const now = new Date().toISOString();
  const update = {
    workingLevels: {
      phonics: {
        level: PHONICS_LEVEL,
        updatedAt: now,
        source: "manual",
        evidence: "Phase 0: set via setLincolnPhonicsLevel script",
      },
      comprehension: {
        level: COMPREHENSION_LEVEL,
        updatedAt: now,
        source: "manual",
        evidence: "Phase 0: set via setLincolnPhonicsLevel script",
      },
    },
    updatedAt: now,
  };

  // ── Write (merge to preserve other snapshot fields) ──────────
  await snapshotRef.set(update, { merge: true });

  // ── Verify ───────────────────────────────────────────────────
  const afterDoc = await snapshotRef.get();
  const afterLevels = afterDoc.data()?.workingLevels ?? {};
  console.log("AFTER workingLevels:", JSON.stringify(afterLevels, null, 2));

  console.log(
    `\nDone. Lincoln's Knowledge Mine levels set: phonics=${PHONICS_LEVEL}, comprehension=${COMPREHENSION_LEVEL}`,
  );
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
