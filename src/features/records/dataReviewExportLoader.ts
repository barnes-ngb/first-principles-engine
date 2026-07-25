// ── Data-review export (FEAT-120) — the thin read-only loader ────────────────
//
// Fetches the collections the pure `dataReviewExport.logic` builder needs and
// hands them over as typed inputs. **This module performs NO writes** — it
// imports only `getDocs` / `getDoc` / `getCountFromServer` and the existing
// typed collection helpers. There is no new collection, no Cloud Function, and
// no AI call anywhere in this feature.
//
// **Bounded and paged, never silently truncated.** Every dated collection is
// paged newest-first with a named per-collection scan cap and filtered to the
// child in memory. Reading family-wide and filtering client-side is deliberate:
// it needs no composite index, and it still returns the legacy documents that
// carry no `childId` field (day logs and hours entries whose child is encoded in
// the doc id) — a `where('childId','==',…)` query would drop those silently and
// under-report compliance hours in an audit file. Each collection reports what
// it kept, what it scanned, and the server-side total, so any shortfall is
// visible in the export itself.

import {
  type CollectionReference,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
  startAfter,
  where,
} from 'firebase/firestore'

import {
  activityConfigsCollection,
  artifactsCollection,
  childrenCollection,
  dadLabReportsCollection,
  daysCollection,
  evaluationSessionsCollection,
  hoursAdjustmentsCollection,
  hoursCollection,
  learnerModelsCollection,
  sightWordProgressCollection,
  skillSnapshotsCollection,
  workbookConfigsCollection,
  xpLedgerCollection,
} from '../../core/firebase/firestore'
import {
  foundationGraphVersion,
  FAST_PHONICS_BRIDGE_VERSION,
  MATHSEEDS_BRIDGE_VERSION,
  TAG_CONCEPT_BRIDGE_VERSION,
  TGTB_LA1_BRIDGE_VERSION,
} from '../../core/foundations'
import { getStateConfig } from '../../core/compliance/stateCompliance'
import { getSchoolYearRange } from '../../core/utils/time'
import { deriveChildIdFromDocId, parseDateFromDocId } from '../../core/utils/docId'
import type {
  ActivityConfig,
  Artifact,
  DadLabReport,
  DayLog,
  HoursAdjustment,
  HoursEntry,
  LearnerModel,
  SightWordProgress,
  SkillSnapshot,
  WorkbookConfig,
  XpLedger,
} from '../../core/types'
import type {
  DispositionCache,
  DispositionOverrides,
} from '../../core/types/disposition'
import type {
  CollectionReadReport,
  DataReviewChild,
  DataReviewEvaluationSession,
  DataReviewExportInput,
  DataReviewExportMode,
} from './dataReviewExport.logic'

/**
 * Per-collection **scan** caps — the maximum number of documents read from each
 * collection, newest first. Named here and NAMED IN THE OUTPUT when hit
 * ("showing the most recent N of M"), never a silent truncation. Sized well
 * above a real family's volume so a hit means something changed, not that the
 * export routinely lies.
 */
export const DATA_REVIEW_SCAN_CAPS = {
  artifacts: 2000,
  days: 1500,
  hours: 2500,
  hoursAdjustments: 800,
  dadLabReports: 500,
  evaluationSessions: 1000,
  xpLedger: 3000,
  sightWordProgress: 2000,
} as const

/** Documents per page. Keeps any single round-trip small on a phone. */
const PAGE_SIZE = 300

interface ScanResult<T> {
  rows: T[]
  scanned: number
  capHit: boolean
}

/**
 * Page a collection newest-first (or by document id when `orderField` is
 * omitted), keeping only the rows `pick` returns. Stops at the scan cap or when
 * the collection is exhausted. Read-only.
 */
async function scanCollection<TDb, TOut>(
  ref: CollectionReference<TDb>,
  orderField: string | null,
  cap: number,
  pick: (snap: QueryDocumentSnapshot<TDb>) => TOut | null,
): Promise<ScanResult<TOut>> {
  const rows: TOut[] = []
  let scanned = 0
  let cursor: QueryDocumentSnapshot<TDb> | null = null

  for (;;) {
    const remaining = cap - scanned
    if (remaining <= 0) return { rows, scanned, capHit: true }
    const pageSize = Math.min(PAGE_SIZE, remaining)
    const constraints: QueryConstraint[] = [
      ...(orderField ? [orderBy(orderField, 'desc')] : []),
      ...(cursor ? [startAfter(cursor)] : []),
      firestoreLimit(pageSize),
    ]
    const snap: QuerySnapshot<TDb> = await getDocs(query(ref, ...constraints))
    if (snap.empty) return { rows, scanned, capHit: false }
    for (const docSnap of snap.docs) {
      scanned += 1
      const picked = pick(docSnap)
      if (picked != null) rows.push(picked)
    }
    cursor = snap.docs[snap.docs.length - 1]
    // A short page means the collection is exhausted.
    if (snap.docs.length < pageSize) return { rows, scanned, capHit: false }
  }
}

/** Server-side family-wide document count. Best-effort — `undefined` on error. */
async function countOf<TDb>(
  ref: CollectionReference<TDb>,
): Promise<number | undefined> {
  try {
    const snap = await getCountFromServer(ref)
    return snap.data().count
  } catch {
    // A count failure must never break the export; the report just omits the
    // total and the count line falls back to the kept-rows wording.
    return undefined
  }
}

/** Assemble one collection's read report from a scan + a server-side count. */
function reportFor<T>(
  collection: string,
  scan: ScanResult<T>,
  total: number | undefined,
  cap: number,
  note?: string,
): CollectionReadReport {
  return {
    collection,
    shown: scan.rows.length,
    scanned: scan.scanned,
    total,
    cap: scan.capHit ? cap : undefined,
    note,
  }
}

/** The child-doc fields the disposition section reads (not on `Child`). */
interface ChildDocExtras {
  dispositionCache?: DispositionCache
  dispositionOverrides?: DispositionOverrides
}

/**
 * Read everything one child's data-review export needs. Read-only end to end.
 *
 * @param now the clock, supplied by the caller so the export stamp and the
 *            current-school-year resolution come from one source.
 */
export async function loadDataReviewExportInput(
  familyId: string,
  child: DataReviewChild,
  mode: DataReviewExportMode,
  now: Date = new Date(),
): Promise<DataReviewExportInput> {
  const childId = child.id
  const stateConfig = getStateConfig()

  // ── Point-in-time documents (one read each) ──
  const [modelSnap, snapshotSnap, childSnap, configSnap, workbookSnap, xpTotalsSnap] =
    await Promise.all([
      getDoc(doc(learnerModelsCollection(familyId), childId)),
      getDoc(doc(skillSnapshotsCollection(familyId), childId)),
      getDoc(doc(childrenCollection(familyId), childId)),
      getDocs(
        query(
          activityConfigsCollection(familyId),
          where('childId', 'in', [childId, 'both']),
        ),
      ),
      getDocs(workbookConfigsCollection(familyId)),
      getDoc(doc(xpLedgerCollection(familyId), childId)),
    ])

  const childExtras = (childSnap.data() ?? {}) as ChildDocExtras
  const activityConfigs: ActivityConfig[] = configSnap.docs.map((d) => d.data())
  const workbookConfigs: WorkbookConfig[] = workbookSnap.docs
    .map((d) => d.data())
    .filter((w) => w.childId === childId)

  // ── Paged, capped scans ──
  const caps = DATA_REVIEW_SCAN_CAPS

  const [
    artifactScan,
    dayScan,
    hoursScan,
    adjustmentScan,
    labScan,
    sessionScan,
    xpScan,
    sightWordScan,
  ] = await Promise.all([
    scanCollection<Artifact, Artifact>(
      artifactsCollection(familyId),
      'createdAt',
      caps.artifacts,
      (d) => {
        const a = d.data()
        // DATA-04: a whole-family artifact is written with `childId: 'both'` —
        // the three-beat Dad Lab capture (`LabReportForm.captureBeatArtifact`)
        // does exactly this, with the real per-item attribution living on the
        // report's beat entry. Keeping only an exact child id would drop those
        // photos and recordings from BOTH children's indexes and integrity
        // checks, undercounting the very evidence this export exists to audit.
        if (a.childId !== childId && a.childId !== 'both') return null
        return { ...a, id: a.id ?? d.id }
      },
    ),
    scanCollection<DayLog, DayLog>(
      daysCollection(familyId),
      'date',
      caps.days,
      (d) => {
        const raw = d.data()
        // Legacy day logs carry no `childId` field — derive it from the doc id
        // exactly as RecordsPage does, so those days still count.
        const resolvedChildId = raw.childId ?? deriveChildIdFromDocId(d.id) ?? ''
        if (resolvedChildId !== childId) return null
        return { ...raw, childId: resolvedChildId, date: raw.date ?? parseDateFromDocId(d.id) }
      },
    ),
    scanCollection<HoursEntry, HoursEntry>(
      hoursCollection(familyId),
      'date',
      caps.hours,
      (d) => {
        const raw = d.data()
        const resolvedChildId =
          raw.childId ??
          (raw.dayLogId ? deriveChildIdFromDocId(raw.dayLogId) : undefined)
        if (resolvedChildId !== childId) return null
        return { ...raw, childId: resolvedChildId, id: raw.id ?? d.id, date: raw.date ?? d.id }
      },
    ),
    scanCollection<HoursAdjustment, HoursAdjustment>(
      hoursAdjustmentsCollection(familyId),
      'date',
      caps.hoursAdjustments,
      (d) => {
        const raw = d.data()
        // DATA-09 attribution: a 'both' adjustment is legitimate family-wide time.
        if (raw.childId !== childId && raw.childId !== 'both') return null
        return { ...raw, id: d.id }
      },
    ),
    scanCollection<DadLabReport, DadLabReport>(
      dadLabReportsCollection(familyId),
      'date',
      caps.dadLabReports,
      (d) => ({ ...d.data(), id: d.id }),
    ),
    scanCollection<DataReviewEvaluationSession, DataReviewEvaluationSession>(
      evaluationSessionsCollection(
        familyId,
      ) as unknown as CollectionReference<DataReviewEvaluationSession>,
      'evaluatedAt',
      caps.evaluationSessions,
      (d) => {
        const s = d.data()
        return s.childId === childId ? { ...s, id: d.id } : null
      },
    ),
    scanCollection<XpLedger, XpLedger>(
      xpLedgerCollection(familyId),
      'awardedAt',
      caps.xpLedger,
      (d) => {
        const e = d.data()
        return e.childId === childId ? e : null
      },
    ),
    // Sight-word docs carry no date field; page by document id and keep the
    // `{childId}_{word}` prefix.
    scanCollection<SightWordProgress, SightWordProgress>(
      sightWordProgressCollection(familyId),
      null,
      caps.sightWordProgress,
      (d) => (d.id.startsWith(`${childId}_`) ? d.data() : null),
    ),
  ])

  const [
    artifactTotal,
    dayTotal,
    hoursTotal,
    adjustmentTotal,
    labTotal,
    sessionTotal,
    xpTotal,
    sightWordTotal,
  ] = await Promise.all([
    countOf(artifactsCollection(familyId)),
    countOf(daysCollection(familyId)),
    countOf(hoursCollection(familyId)),
    countOf(hoursAdjustmentsCollection(familyId)),
    countOf(dadLabReportsCollection(familyId)),
    countOf(evaluationSessionsCollection(familyId)),
    countOf(xpLedgerCollection(familyId)),
    countOf(sightWordProgressCollection(familyId)),
  ])

  const reads: CollectionReadReport[] = [
    { collection: 'activityConfigs', shown: activityConfigs.length },
    { collection: 'workbookConfigs', shown: workbookConfigs.length },
    reportFor('artifacts', artifactScan, artifactTotal, caps.artifacts),
    reportFor('days', dayScan, dayTotal, caps.days),
    reportFor('hours', hoursScan, hoursTotal, caps.hours),
    reportFor(
      'hoursAdjustments',
      adjustmentScan,
      adjustmentTotal,
      caps.hoursAdjustments,
      "Includes adjustments tagged 'both' (family-wide time), per DATA-09.",
    ),
    reportFor(
      'dadLabReports',
      labScan,
      labTotal,
      caps.dadLabReports,
      'Dad Lab reports are family-shared, so every report is included for both children.',
    ),
    reportFor('evaluationSessions', sessionScan, sessionTotal, caps.evaluationSessions),
    reportFor(
      'xpLedger',
      xpScan,
      xpTotal,
      caps.xpLedger,
      'Per-event documents only; the cumulative doc is read separately by id.',
    ),
    reportFor(
      'sightWordProgress',
      sightWordScan,
      sightWordTotal,
      caps.sightWordProgress,
    ),
  ]

  return {
    generatedAt: now.toISOString(),
    mode,
    child,
    schoolYear: getSchoolYearRange(now),
    schoolYearStart: stateConfig.schoolYearStart,
    hoursRequirement: stateConfig.hoursRequirement,
    versions: {
      graph: foundationGraphVersion(),
      fastPhonicsBridge: FAST_PHONICS_BRIDGE_VERSION,
      mathseedsBridge: MATHSEEDS_BRIDGE_VERSION,
      tgtbLa1Bridge: TGTB_LA1_BRIDGE_VERSION,
      tagConceptBridge: TAG_CONCEPT_BRIDGE_VERSION,
    },
    activityConfigs,
    workbookConfigs,
    learnerModel: modelSnap.exists() ? (modelSnap.data() as LearnerModel) : null,
    skillSnapshot: snapshotSnap.exists()
      ? (snapshotSnap.data() as SkillSnapshot)
      : null,
    sightWords: sightWordScan.rows,
    dayLogs: dayScan.rows,
    hoursEntries: hoursScan.rows,
    hoursAdjustments: adjustmentScan.rows,
    artifacts: artifactScan.rows,
    dadLabReports: labScan.rows,
    evaluationSessions: sessionScan.rows,
    disposition: {
      cache: childExtras.dispositionCache,
      overrides: childExtras.dispositionOverrides,
    },
    xpEvents: xpScan.rows,
    xpTotals: xpTotalsSnap.exists() ? (xpTotalsSnap.data() as XpLedger) : null,
    reads,
  }
}
