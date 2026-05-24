import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { claudeApiKey } from "./aiConfig.js";
import { requireEmailAuth } from "./authGuard.js";
import type { SnapshotData } from "./chatTypes.js";
import {
  runMonthlyReview,
  type MonthlyReviewPayload,
} from "./tasks/monthlyReview.js";
import { getPreviousMonth } from "./tasks/monthlyReviewData.js";

// ── Per-child generator ────────────────────────────────────────

async function loadChildData(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<{ name: string; grade?: string }> {
  const snap = await db.doc(`families/${familyId}/children/${childId}`).get();
  if (!snap.exists) {
    throw new Error(`Child ${childId} not found in family ${familyId}`);
  }
  const d = snap.data() as { name: string; grade?: string };
  return { name: d.name, grade: d.grade };
}

async function loadSnapshotData(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<SnapshotData | undefined> {
  const snap = await db
    .doc(`families/${familyId}/skillSnapshots/${childId}`)
    .get();
  if (!snap.exists) return undefined;
  return snap.data() as SnapshotData;
}

/**
 * Generate a monthly review for one child and write it to Firestore.
 * Returns the doc id (`{childId}_{month}`).
 *
 * Idempotency:
 * - If a review already exists and is `published`, callers should decide
 *   whether to skip or overwrite. This function will overwrite by default;
 *   the scheduled and callable wrappers enforce the policy.
 */
async function generateForChildMonth(
  familyId: string,
  childId: string,
  month: string,
  apiKey: string,
): Promise<{ reviewId: string; payload: MonthlyReviewPayload }> {
  const db = getFirestore();

  const [childData, snapshotData] = await Promise.all([
    loadChildData(db, familyId, childId),
    loadSnapshotData(db, familyId, childId),
  ]);

  const { payload } = await runMonthlyReview({
    db,
    familyId,
    childId,
    childData,
    snapshotData,
    apiKey,
    month,
  });

  const reviewId = `${childId}_${month}`;
  await db
    .collection(`families/${familyId}/monthlyReviews`)
    .doc(reviewId)
    .set(payload);

  return { reviewId, payload };
}

// ── Scheduled Cloud Function ───────────────────────────────────

export const generateMonthlyReview = onSchedule(
  {
    schedule: "0 8 1 * *", // 8:00 AM on the 1st of each month
    timeZone: "America/Chicago",
    memory: "1GiB",
    timeoutSeconds: 540,
    secrets: [claudeApiKey],
  },
  async () => {
    const db = getFirestore();
    const apiKey = claudeApiKey.value();
    if (!apiKey) {
      console.error("[generateMonthlyReview] CLAUDE_API_KEY not configured");
      return;
    }

    const month = getPreviousMonth(new Date());
    console.log(`[generateMonthlyReview] Generating for month: ${month}`);

    const familiesSnap = await db.collection("families").get();
    for (const familyDoc of familiesSnap.docs) {
      const familyId = familyDoc.id;
      const childrenSnap = await familyDoc.ref.collection("children").get();

      for (const childDoc of childrenSnap.docs) {
        const childId = childDoc.id;
        const reviewId = `${childId}_${month}`;

        try {
          // Scheduled run never overwrites existing reviews (draft or published).
          const existing = await db
            .doc(`families/${familyId}/monthlyReviews/${reviewId}`)
            .get();
          if (existing.exists) {
            console.log(
              `[generateMonthlyReview] Skipping ${reviewId} — review already exists`,
            );
            continue;
          }

          await generateForChildMonth(familyId, childId, month, apiKey);
          console.log(`[generateMonthlyReview] Wrote ${reviewId}`);
        } catch (err) {
          console.error(
            `[generateMonthlyReview] Failed for family=${familyId} child=${childId} month=${month}:`,
            err,
          );
        }
      }
    }
  },
);

// ── Callable Cloud Function ────────────────────────────────────

export const generateMonthlyReviewNow = onCall(
  {
    memory: "1GiB",
    timeoutSeconds: 540,
    secrets: [claudeApiKey],
  },
  async (request) => {
    const { uid } = requireEmailAuth(request);

    const { familyId, childId, month } = (request.data ?? {}) as {
      familyId?: string;
      childId?: string;
      month?: string;
    };

    if (!familyId || !childId || !month) {
      throw new HttpsError(
        "invalid-argument",
        "familyId, childId, and month are required.",
      );
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new HttpsError(
        "invalid-argument",
        "month must be in YYYY-MM format.",
      );
    }
    if (uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    const apiKey = claudeApiKey.value();
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "Missing CLAUDE_API_KEY secret.",
      );
    }

    const db = getFirestore();
    const reviewId = `${childId}_${month}`;

    // Only published reviews are protected from overwrite.
    const existing = await db
      .doc(`families/${familyId}/monthlyReviews/${reviewId}`)
      .get();
    if (existing.exists) {
      const data = existing.data() as { status?: string };
      if (data.status === "published") {
        return { reviewId, skipped: true, reason: "published" };
      }
    }

    try {
      const { reviewId: writtenId } = await generateForChildMonth(
        familyId,
        childId,
        month,
        apiKey,
      );
      return { reviewId: writtenId, skipped: false };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("[generateMonthlyReviewNow] failed:", {
        familyId,
        childId,
        month,
        error: errMsg,
      });
      throw new HttpsError("internal", `Monthly review failed: ${errMsg}`);
    }
  },
);

// ── Publish / Unpublish callables ─────────────────────────────

interface PublishArgs {
  familyId?: string;
  childId?: string;
  month?: string;
}

function parsePublishArgs(data: unknown, uid: string): {
  familyId: string;
  childId: string;
  month: string;
} {
  const { familyId, childId, month } = (data ?? {}) as PublishArgs;
  if (!familyId || !childId || !month) {
    throw new HttpsError(
      "invalid-argument",
      "familyId, childId, and month are required.",
    );
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new HttpsError(
      "invalid-argument",
      "month must be in YYYY-MM format.",
    );
  }
  if (uid !== familyId) {
    throw new HttpsError(
      "permission-denied",
      "You do not have access to this family.",
    );
  }
  return { familyId, childId, month };
}

export const publishMonthlyReview = onCall(
  {
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (request) => {
    const { uid } = requireEmailAuth(request);
    const { familyId, childId, month } = parsePublishArgs(request.data, uid);

    const db = getFirestore();
    const reviewId = `${childId}_${month}`;
    const ref = db.doc(`families/${familyId}/monthlyReviews/${reviewId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", `Review ${reviewId} not found.`);
    }

    const now = new Date().toISOString();
    await ref.update({
      status: "published",
      publishedAt: now,
      lastEditedAt: now,
    });

    return { reviewId, publishedAt: now };
  },
);

export const unpublishMonthlyReview = onCall(
  {
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (request) => {
    const { uid } = requireEmailAuth(request);
    const { familyId, childId, month } = parsePublishArgs(request.data, uid);

    const db = getFirestore();
    const reviewId = `${childId}_${month}`;
    const ref = db.doc(`families/${familyId}/monthlyReviews/${reviewId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", `Review ${reviewId} not found.`);
    }

    const now = new Date().toISOString();
    await ref.update({
      status: "draft",
      publishedAt: FieldValue.delete(),
      lastEditedAt: now,
    });

    return { reviewId };
  },
);
