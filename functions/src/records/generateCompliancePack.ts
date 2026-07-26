import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
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
 * Delete generated packs older than the retention window.
 *
 * Packs are derived data — regenerable from Firestore and Storage at any time —
 * so they are swept on the next generation rather than kept. Best-effort: a
 * failed sweep never fails the pack the parent is waiting for.
 */
async function sweepExpiredPacks(
  bucket: PackBucket,
  familyId: string,
  nowMs: number,
): Promise<void> {
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
    await Promise.all(
      objects
        .filter((o) => expired.has(o.name))
        .map((o) => o.delete().catch(() => undefined)),
    );
  } catch (err) {
    console.warn("Compliance pack retention sweep failed (non-blocking):", err);
  }
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

  const { randomUUID } = await import("crypto");
  const downloadToken = randomUUID();
  const packFile = bucket.file(objectPath);
  await packFile.save(archive, {
    metadata: {
      contentType: "application/zip",
      metadata: {
        generatedBy: "generateCompliancePack",
        childId: request.childId,
        firebaseStorageDownloadTokens: downloadToken,
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
    // the tokenized download URL every image function already issues — the
    // object is swept within the retention window either way, so the link dies
    // with it. Reported back rather than hidden.
    console.warn("Signed URL unavailable, falling back to download token:", err);
    downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
    urlKind = "token";
  }

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
