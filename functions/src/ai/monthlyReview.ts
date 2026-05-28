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
import {
  getMonthBounds,
  getPreviousMonth,
  loadCompletedBooksInMonth,
  loadConundrumsForMonth,
  loadDadLabReportsInMonth,
  loadDayLogsForMonth,
  loadDiamondsForMonth,
  loadHoursForMonth,
  loadPhotosForMonth,
  loadQuestCountForMonth,
  loadWeeklyReviewsForMonth,
} from "./tasks/monthlyReviewData.js";

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

// ── Diagnostic: raw source audit (read-only, no AI call) ──────
//
// Returns the raw aggregation counts plus a shape-only sample of dadLabReport
// documents so we can confirm the writer schema from inside the app (no
// Firebase Console access required). Used by the DiagnosticPanel rendered on
// MonthlyReviewReader when `?diag=1` is set. Read-only — no Firestore writes.

interface AuditArgs {
  familyId?: string;
  childId?: string;
  month?: string;
}

export const auditMonthlyReviewSources = onCall(
  {
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    const { uid } = requireEmailAuth(request);
    const { familyId, childId, month } = (request.data ?? {}) as AuditArgs;

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

    const db = getFirestore();
    const childSnap = await db
      .doc(`families/${familyId}/children/${childId}`)
      .get();
    const childName = childSnap.exists
      ? ((childSnap.data() as { name?: string }).name ?? null)
      : null;

    const { start, end } = getMonthBounds(month);

    const [
      weeklyReviews,
      dayLogs,
      books,
      dadLabReports,
      photosResult,
      conundrums,
      hours,
      diamonds,
      questCount,
    ] = await Promise.all([
      loadWeeklyReviewsForMonth(db, familyId, childId, start, end),
      loadDayLogsForMonth(db, familyId, childId, start, end),
      loadCompletedBooksInMonth(db, familyId, childId, start, end),
      loadDadLabReportsInMonth(
        db,
        familyId,
        childId,
        start,
        end,
        childName ?? undefined,
      ),
      loadPhotosForMonth(db, familyId, childId, start, end),
      loadConundrumsForMonth(db, familyId, start, end),
      loadHoursForMonth(db, familyId, childId, start, end),
      loadDiamondsForMonth(db, familyId, childId, start, end),
      loadQuestCountForMonth(db, familyId, childId, start, end),
    ]);

    // Unfiltered read of dadLabReports for this family — limited to a
    // reasonable cap so the callable doesn't time out on large histories.
    const allDadLabSnap = await db
      .collection(`families/${familyId}/dadLabReports`)
      .limit(100)
      .get();

    const allReports = allDadLabSnap.docs.map((d) => ({
      id: d.id,
      data: d.data() as Record<string, unknown>,
    }));

    const sampleReportShapes = allReports.slice(0, 3).map((r) => ({
      id: r.id,
      schema: Object.fromEntries(
        Object.entries(r.data).map(([k, v]) => [k, describeValue(v)]),
      ),
      dateFields: {
        date: (r.data.date as string | undefined) ?? null,
        createdAt: (r.data.createdAt as string | undefined) ?? null,
        completedAt: (r.data.completedAt as string | undefined) ?? null,
        updatedAt: (r.data.updatedAt as string | undefined) ?? null,
      },
      childAttribution: {
        childId: (r.data.childId as string | undefined) ?? null,
        childReportsKeys:
          r.data.childReports && typeof r.data.childReports === "object"
            ? Object.keys(r.data.childReports as Record<string, unknown>)
            : null,
      },
      status: (r.data.status as string | undefined) ?? null,
    }));

    return {
      query: {
        familyId,
        childId,
        childName,
        month,
        start,
        end,
      },
      counts: {
        weeklyReviews: weeklyReviews.length,
        dayLogs: dayLogs.length,
        books: books.length,
        dadLabReports: dadLabReports.length,
        photos: photosResult.photos.length,
        conundrums: conundrums.length,
      },
      hours,
      diamonds,
      questCount,
      dadLabDiagnostic: {
        reportsReturnedByLoader: dadLabReports.length,
        allReportsInDb: allReports.length,
        sampleReportShapes,
      },
    };
  },
);

function describeValue(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array(${v.length})`;
  if (typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>);
    return `object(${keys.join(",")})`;
  }
  return typeof v;
}

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
