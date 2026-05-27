/**
 * One-off script: set Lincoln's profile.voiceInputEnhanced = true so the
 * voice input module routes his recordings through Whisper. Other children
 * keep the default (Web Speech) until manually opted in via Settings.
 *
 * Usage (from repo root):
 *   npx tsx scripts/setLincolnVoiceInputEnhanced.ts
 *
 * Env vars:
 *   GOOGLE_APPLICATION_CREDENTIALS — path to service-account key JSON
 *   FAMILY_ID                      — (optional) explicit family ID;
 *                                    defaults to first family found
 *
 * Idempotent — uses Firestore set({ merge: true }), safe to re-run.
 *
 * See docs/DESIGN_VOICE_INPUT_MODULE.md §5.2 for rationale.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const LINCOLN_NAME = "lincoln";

async function main() {
  initializeApp({
    credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : undefined,
  });
  const db = getFirestore();

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
    process.exit(1);
  }

  const childId = lincolnDoc.id;
  console.log(`Found Lincoln: childId=${childId}`);
  console.log(
    `BEFORE voiceInputEnhanced: ${lincolnDoc.data().voiceInputEnhanced ?? "<unset>"}`,
  );

  await lincolnDoc.ref.set({ voiceInputEnhanced: true }, { merge: true });

  const after = await lincolnDoc.ref.get();
  console.log(
    `AFTER voiceInputEnhanced: ${after.data()?.voiceInputEnhanced}`,
  );
  console.log("\nDone. Lincoln will now use Whisper-backed voice input.");
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
