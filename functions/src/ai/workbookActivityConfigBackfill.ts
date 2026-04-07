import type { Firestore } from "firebase-admin/firestore";

interface CurriculumMeta {
  provider?: string;
  level?: string;
  lastMilestone?: string;
  milestoneDate?: string;
  completed?: boolean;
  masteredSkills?: string[];
  activeSkills?: string[];
}

interface WorkbookConfigDoc {
  childId?: string;
  name?: string;
  subjectBucket?: string;
  totalUnits?: number;
  currentPosition?: number;
  unitLabel?: string;
  defaultMinutes?: number;
  curriculum?: CurriculumMeta;
  completed?: boolean;
  completedDate?: string;
}

interface ActivityConfigDoc {
  id?: string;
  childId?: string;
  name?: string;
  type?: string;
  subjectBucket?: string;
  defaultMinutes?: number;
  frequency?: string;
  sortOrder?: number;
  curriculum?: string;
  totalUnits?: number;
  currentPosition?: number;
  unitLabel?: string;
  curriculumMeta?: CurriculumMeta;
  completed?: boolean;
  completedDate?: string;
  scannable?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkbookBackfillStats {
  scannedLegacyWorkbooks: number;
  created: number;
  updated: number;
}

function normalizeCurriculumKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function mergeStringArray(existing: string[] = [], incoming: string[] = []): string[] {
  return [...new Set([...existing, ...incoming].filter(Boolean))];
}

function toActivityDocId(childId: string, curriculumKey: string): string {
  return `wb_${childId}_${curriculumKey}`;
}

function toCurriculumKey(config: { name?: string; curriculum?: string }): string {
  return normalizeCurriculumKey(config.curriculum || config.name || "");
}

function mergeCurriculumMeta(
  existing: CurriculumMeta | undefined,
  legacy: CurriculumMeta | undefined,
): CurriculumMeta | undefined {
  if (!existing && !legacy) return undefined;

  return {
    provider: existing?.provider || legacy?.provider || "other",
    level: existing?.level || legacy?.level,
    lastMilestone: existing?.lastMilestone || legacy?.lastMilestone,
    milestoneDate: existing?.milestoneDate || legacy?.milestoneDate,
    completed: Boolean(existing?.completed || legacy?.completed),
    masteredSkills: mergeStringArray(existing?.masteredSkills, legacy?.masteredSkills),
    activeSkills: mergeStringArray(existing?.activeSkills, legacy?.activeSkills),
  };
}

export function buildWorkbookBackfillPatch(
  existing: ActivityConfigDoc | null,
  legacy: WorkbookConfigDoc,
  nowIso: string,
): ActivityConfigDoc {
  const mergedCurriculumMeta = mergeCurriculumMeta(existing?.curriculumMeta, legacy.curriculum);
  const completed = Boolean(existing?.completed || legacy.completed || mergedCurriculumMeta?.completed);

  return {
    ...(existing ?? {}),
    name: existing?.name || legacy.name || "Workbook",
    type: "workbook",
    childId: existing?.childId || legacy.childId,
    subjectBucket: existing?.subjectBucket || legacy.subjectBucket || "Other",
    defaultMinutes: existing?.defaultMinutes ?? legacy.defaultMinutes ?? 30,
    frequency: existing?.frequency || "daily",
    sortOrder: existing?.sortOrder ?? 11,
    curriculum: existing?.curriculum || legacy.name || mergedCurriculumMeta?.provider || "Workbook",
    totalUnits: Math.max(existing?.totalUnits ?? 0, legacy.totalUnits ?? 0),
    currentPosition: Math.max(existing?.currentPosition ?? 0, legacy.currentPosition ?? 0),
    unitLabel: existing?.unitLabel || legacy.unitLabel || "lesson",
    curriculumMeta: mergedCurriculumMeta,
    completed,
    completedDate: existing?.completedDate || legacy.completedDate,
    scannable: existing?.scannable ?? true,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Guaranteed server-side workbook backfill for the active child.
 *
 * This is intentionally idempotent:
 * - Uses deterministic IDs for created workbook activity configs.
 * - Merges legacy workbook progress into existing activity configs.
 * - Safe to run on every AI request for child-scoped tasks.
 *
 * Phase 2C fallback removal is safe only after this path has been deployed
 * and telemetry shows active families no longer require workbookConfigs reads.
 */
export async function ensureWorkbookActivityConfigsForChild(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<WorkbookBackfillStats> {
  const legacySnap = await db
    .collection(`families/${familyId}/workbookConfigs`)
    .where("childId", "==", childId)
    .get();

  if (legacySnap.empty) {
    return { scannedLegacyWorkbooks: 0, created: 0, updated: 0 };
  }

  const activitySnap = await db
    .collection(`families/${familyId}/activityConfigs`)
    .where("childId", "in", [childId, "both"])
    .where("type", "==", "workbook")
    .get();

  const activityByKey = new Map<string, { id: string; data: ActivityConfigDoc }>();
  for (const doc of activitySnap.docs) {
    const data = doc.data() as ActivityConfigDoc;
    const key = toCurriculumKey({ name: data.name, curriculum: data.curriculum });
    if (key) {
      activityByKey.set(key, { id: doc.id, data });
    }
  }

  const nowIso = new Date().toISOString();
  const batch = db.batch();
  let created = 0;
  let updated = 0;

  for (const legacyDoc of legacySnap.docs) {
    const legacy = legacyDoc.data() as WorkbookConfigDoc;
    const key = toCurriculumKey({ name: legacy.name, curriculum: legacy.name });
    if (!key) continue;

    const existing = activityByKey.get(key);
    const merged = buildWorkbookBackfillPatch(existing?.data ?? null, legacy, nowIso);

    if (existing) {
      const hasDiff = JSON.stringify(existing.data) !== JSON.stringify({ ...existing.data, ...merged });
      if (hasDiff) {
        batch.set(
          db.doc(`families/${familyId}/activityConfigs/${existing.id}`),
          merged,
          { merge: true },
        );
        updated++;
      }
      continue;
    }

    const docId = toActivityDocId(childId, key);
    batch.set(db.doc(`families/${familyId}/activityConfigs/${docId}`), {
      ...merged,
      id: docId,
      childId,
      createdAt: nowIso,
      updatedAt: nowIso,
    }, { merge: true });
    created++;
  }

  if (created > 0 || updated > 0) {
    await batch.commit();
  }

  return {
    scannedLegacyWorkbooks: legacySnap.size,
    created,
    updated,
  };
}
