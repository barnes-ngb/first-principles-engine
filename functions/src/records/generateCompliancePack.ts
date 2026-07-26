import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import JSZip from "jszip";

import { requireEmailAuth } from "../ai/authGuard.js";
import {
  buildPackManifestCsv,
  checkSizeAllowance,
  DEFAULT_PACK_LIMITS,
  findRemainingRemoteUrls,
  MANIFEST_FILE,
  PACK_RETENTION_MS,
  PACK_STORAGE_PREFIX,
  PackFileRole,
  PackSkipReason,
  packDownloadName,
  packObjectPath,
  planPackMedia,
  rewritePortfolioMedia,
  selectExpiredPacks,
  SIGNED_URL_TTL_MS,
  summarizePack,
  validatePackRequest,
  type PackMediaEntry,
  type PackRequest,
  type PackSizeLimits,
} from "./compliancePack.logic.js";

/**
 * The compliance pack as a real evidence archive (FEAT-126).
 *
 * The existing client-side pack (`buildComplianceZip`) is untouched and still
 * the fast, text-only export. This is the **full archive**: the same four
 * rendered files, plus every artifact's actual bytes under `media/`, plus a
 * `manifest.csv` accounting for what did and did not make it in — assembled
 * server-side because ~31 media for one child-year is plausibly 50–150 MB and a
 * phone fetching that through the client is not a thing to rely on for a legal
 * record.
 *
 * **Nothing here recomputes a record.** The four text files arrive already
 * rendered by the client's existing builders, so no hours/compliance math ever
 * moves into `functions/`, and the archive's text is the same text the fast
 * pack ships. The only thing this function authors is the media layer and the
 * manifest.
 */

// ── The narrow slice of the Storage API this uses ──────────────────────────
// Typed structurally rather than against `@google-cloud/storage` so the worker
// below is exercised in tests with a plain fake — no emulator, no credentials.

export type PackStorageFile = {
  getMetadata(): Promise<[{ size?: string | number; contentType?: string }]>;
  download(): Promise<[Buffer]>;
  save(data: Buffer, options?: unknown): Promise<unknown>;
  getSignedUrl(options: {
    action: "read";
    expires: number;
    version?: "v4";
  }): Promise<[string]>;
  setMetadata(metadata: {
    metadata: Record<string, string>;
  }): Promise<unknown>;
};

export type PackStorageObject = {
  name: string;
  metadata?: { updated?: string };
  delete(): Promise<unknown>;
};

export type PackBucket = {
  name: string;
  file(path: string): PackStorageFile;
  getFiles(options: { prefix: string }): Promise<[PackStorageObject[]]>;
};

export type BuildPackResult = {
  objectPath: string;
  downloadName: string;
  downloadUrl: string;
  /** `signed` is the intended path; `token` is the documented fallback. */
  urlKind: "signed" | "token";
  expiresAt: string;
  bytes: number;
  mediaIncluded: number;
  mediaSkipped: number;
  /** True when at least one piece of evidence is flagged rather than embedded. */
  hasGaps: boolean;
};

type StorageErrorish = { code?: number | string; message?: string };

const isNotFound = (err: unknown): boolean => {
  const code = (err as StorageErrorish)?.code;
  return code === 404 || code === "404";
};

const toBytes = (size: string | number | undefined): number => {
  if (typeof size === "number") return size;
  if (typeof size === "string") {
    const n = Number(size);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

/**
 * Fetch one planned media file, or mark it skipped.
 *
 * Size is read from metadata **before** downloading so an oversized object is
 * refused rather than buffered into the function's memory first.
 */
async function fetchMediaEntry(
  bucket: PackBucket,
  entry: PackMediaEntry,
  bytesSoFar: number,
  limits: PackSizeLimits,
): Promise<{ entry: PackMediaEntry; data?: Buffer }> {
  if (!entry.objectPath) return { entry };

  const file = bucket.file(entry.objectPath);

  let declaredBytes = 0;
  try {
    const [metadata] = await file.getMetadata();
    declaredBytes = toBytes(metadata?.size);
  } catch (err) {
    return {
      entry: {
        ...entry,
        skipReason: isNotFound(err)
          ? PackSkipReason.NotFound
          : PackSkipReason.FetchFailed,
      },
    };
  }

  const allowance = checkSizeAllowance(bytesSoFar, declaredBytes, limits);
  if (!allowance.ok) {
    return { entry: { ...entry, skipReason: allowance.reason } };
  }

  try {
    const [data] = await file.download();
    return { entry: { ...entry, bytes: data.length }, data };
  } catch (err) {
    return {
      entry: {
        ...entry,
        skipReason: isNotFound(err)
          ? PackSkipReason.NotFound
          : PackSkipReason.FetchFailed,
      },
    };
  }
}

/**
 * Delete one family's generated packs older than the retention window.
 *
 * Packs are derived data — regenerable from Firestore and Storage at any time —
 * so they are deleted rather than kept. Returns how many went, so the scheduled
 * beat can log it. Best-effort: a failed sweep never fails the pack the parent
 * is waiting for.
 */
export async function sweepExpiredPacks(
  bucket: PackBucket,
  familyId: string,
  nowMs: number,
): Promise<number> {
  try {
    const [objects] = await bucket.getFiles({
      prefix: `families/${familyId}/${PACK_STORAGE_PREFIX}/`,
    });
    const expired = new Set(
      selectExpiredPacks(
        objects.map((o) => ({ name: o.name, updated: o.metadata?.updated })),
        nowMs,
        PACK_RETENTION_MS,
      ),
    );
    const doomed = objects.filter((o) => expired.has(o.name));
    await Promise.all(doomed.map((o) => o.delete().catch(() => undefined)));
    return doomed.length;
  } catch (err) {
    console.warn("Compliance pack retention sweep failed (non-blocking):", err);
    return 0;
  }
}

/** Just enough Firestore to enumerate families, so the sweep is fake-testable. */
export type FamilyLister = {
  collection(path: string): { get(): Promise<{ docs: Array<{ id: string }> }> };
};

/**
 * Sweep every family's expired packs.
 *
 * Retention has to hold **without** a later export. A family that generates one
 * archive and never generates another would otherwise keep that object — and,
 * on the token-fallback path, its unauthenticated URL — long past the 24 h this
 * feature advertises (Codex P1, PR #1631). Enumerating families the way the
 * other scheduled functions do keeps this to one prefix listing per family
 * rather than a scan of the whole bucket.
 */
export async function sweepAllCompliancePacks(
  db: FamilyLister,
  bucket: PackBucket,
  nowMs: number,
): Promise<{ families: number; deleted: number }> {
  const familiesSnap = await db.collection("families").get();
  let deleted = 0;
  for (const family of familiesSnap.docs) {
    deleted += await sweepExpiredPacks(bucket, family.id, nowMs);
  }
  return { families: familiesSnap.docs.length, deleted };
}

/**
 * Assemble the archive and hand back a short-lived link.
 *
 * Media are fetched **sequentially and buffered**. Sequential because the size
 * ceiling then bites in a stable, reportable order rather than on whichever
 * parallel fetch happened to land last; buffered because JSZip needs the bytes
 * anyway and a school year sits well inside the 2 GiB allocation.
 */
export async function buildCompliancePackArchive(
  bucket: PackBucket,
  request: PackRequest,
  options: { now?: Date; limits?: PackSizeLimits } = {},
): Promise<BuildPackResult> {
  const now = options.now ?? new Date();
  const limits = options.limits ?? DEFAULT_PACK_LIMITS;

  const zip = new JSZip();
  const planned = planPackMedia(request.artifacts, request.familyId);

  const resolved: PackMediaEntry[] = [];
  let bytesSoFar = 0;
  for (const entry of planned) {
    if (!entry.objectPath) {
      resolved.push(entry);
      continue;
    }
    const { entry: outcome, data } = await fetchMediaEntry(
      bucket,
      entry,
      bytesSoFar,
      limits,
    );
    if (data && outcome.entryName && !outcome.skipReason) {
      zip.file(outcome.entryName, data);
      bytesSoFar += data.length;
    }
    resolved.push(outcome);
  }

  // The rendered text goes in exactly as received — except the portfolio, whose
  // media links become relative paths into `media/` (or an inline marker naming
  // what is missing and why).
  const unmatchedUrls = new Set<string>();
  for (const file of request.files) {
    let content = file.content;
    if (file.role === PackFileRole.Portfolio) {
      const rewrite = rewritePortfolioMedia(content, resolved);
      content = rewrite.markdown;
      for (const url of rewrite.unmatchedUrls) unmatchedUrls.add(url);
    }
    const leaked = findRemainingRemoteUrls(content);
    if (leaked.length > 0) {
      // A remote storage URL surviving into the archive is the exact exposure
      // this feature removes — fail loudly rather than ship the pack.
      throw new HttpsError(
        "internal",
        `Pack file ${file.name} still contains ${leaked.length} storage URL(s) after rewriting.`,
      );
    }
    zip.file(file.name, content);
  }

  zip.file(MANIFEST_FILE, buildPackManifestCsv(resolved, [...unmatchedUrls]));

  const archive = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    // Media are already compressed (JPEG/PNG/WebM); level 1 spends far less CPU
    // for effectively the same size.
    compressionOptions: { level: 1 },
  });

  const objectPath = packObjectPath(
    request.familyId,
    request.childName,
    request.startDate,
    request.endDate,
    now.toISOString(),
  );

  // Saved with NO download token. A `firebaseStorageDownloadTokens` value is an
  // unauthenticated, permanently-fetchable URL for as long as the object lives —
  // exactly what this feature removes from the pack — so it is minted only on
  // the path that has no alternative, and never on the signed-URL path (Codex
  // P1, PR #1631).
  const packFile = bucket.file(objectPath);
  await packFile.save(archive, {
    metadata: {
      contentType: "application/zip",
      metadata: {
        generatedBy: "generateCompliancePack",
        childId: request.childId,
      },
    },
  });

  const expiresAtMs = now.getTime() + SIGNED_URL_TTL_MS;
  let downloadUrl: string;
  let urlKind: "signed" | "token";
  try {
    const [signed] = await packFile.getSignedUrl({
      action: "read",
      version: "v4",
      expires: expiresAtMs,
    });
    downloadUrl = signed;
    urlKind = "signed";
  } catch (err) {
    // Signing needs the runtime service account to hold
    // `roles/iam.serviceAccountTokenCreator`. Where it does not, fall back to
    // the tokenized download URL every image function already issues. The
    // object is deleted within the retention window — by `sweepCompliancePacks`
    // on its daily beat, not merely by a later export — so the link dies with
    // it. Reported back rather than hidden.
    console.warn("Signed URL unavailable, falling back to download token:", err);
    const { randomUUID } = await import("crypto");
    const downloadToken = randomUUID();
    await packFile.setMetadata({
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    });
    downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
    urlKind = "token";
  }

  // Opportunistic: the scheduled sweep is what guarantees retention, but a
  // family generating packs back to back should not wait a day for the last
  // one to go.
  await sweepExpiredPacks(bucket, request.familyId, now.getTime());

  const counts = summarizePack(resolved);
  return {
    objectPath,
    downloadName: packDownloadName(
      request.childName,
      request.startDate,
      request.endDate,
    ),
    downloadUrl,
    urlKind,
    expiresAt: new Date(expiresAtMs).toISOString(),
    bytes: archive.length,
    mediaIncluded: counts.included,
    mediaSkipped: counts.skipped,
    hasGaps: counts.skipped > 0 || unmatchedUrls.size > 0,
  };
}

// ── Callable ───────────────────────────────────────────────────────────────

export const generateCompliancePack = onCall(
  {
    memory: "2GiB",
    timeoutSeconds: 540,
  },
  async (request): Promise<BuildPackResult> => {
    const { uid } = requireEmailAuth(request);

    const validated = validatePackRequest(request.data);
    if (!validated.ok) {
      throw new HttpsError("invalid-argument", validated.error);
    }
    const packRequest = validated.request;

    // The family IS the authenticated account here (`storage.rules` gates on
    // `request.auth.uid == familyId`, and kid profiles share that account), so
    // "parent of this family" is enforceable server-side only as this identity
    // check. No client-supplied role flag is consulted.
    if (uid !== packRequest.familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    // Makes `childId` load-bearing rather than decorative: a pack is per-child,
    // and one naming a child this family does not have is a bug worth surfacing.
    const childSnap = await getFirestore()
      .doc(`families/${packRequest.familyId}/children/${packRequest.childId}`)
      .get();
    if (!childSnap.exists) {
      throw new HttpsError(
        "not-found",
        `Child ${packRequest.childId} not found in this family.`,
      );
    }

    const bucket = getStorage().bucket() as unknown as PackBucket;
    try {
      return await buildCompliancePackArchive(bucket, packRequest);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("generateCompliancePack failed:", err);
      throw new HttpsError(
        "internal",
        err instanceof Error ? err.message : "Failed to build compliance pack.",
      );
    }
  },
);

// ── Retention beat ─────────────────────────────────────────────────────────

/**
 * Delete expired compliance packs daily, whether or not anyone exports again.
 *
 * The pack is the one object in this repo that embeds photos and recordings of
 * the children into a single downloadable file, so "it goes away in 24 hours"
 * has to be true on its own schedule rather than as a side effect of the next
 * export. Reads nothing but family ids; writes nothing but deletes.
 */
export const sweepCompliancePacks = onSchedule(
  {
    schedule: "every day 04:00",
    timeZone: "America/Chicago",
    memory: "256MiB",
    timeoutSeconds: 300,
  },
  async () => {
    const bucket = getStorage().bucket() as unknown as PackBucket;
    const result = await sweepAllCompliancePacks(
      getFirestore() as unknown as FamilyLister,
      bucket,
      Date.now(),
    );
    console.log(
      `[sweepCompliancePacks] ${result.families} family/families, ${result.deleted} expired pack(s) deleted`,
    );
  },
);
