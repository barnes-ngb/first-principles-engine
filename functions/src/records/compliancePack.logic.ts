/**
 * Compliance pack archive — the pure half (FEAT-126).
 *
 * No Admin SDK, no network, no `firebase-functions` import: everything in here
 * is a string/array transform, so the correctness that matters (which Storage
 * object a URL names, whether that object belongs to the calling family, what
 * the offline markdown link becomes, what the manifest says about an artifact
 * that could not be fetched) is unit-testable without mocks.
 *
 * **Why this file exists at all.** A real export of Lincoln's school year was
 * 19 KB of text whose every piece of visual evidence was a tokenized
 * `firebasestorage…?alt=media&token=…` URL. Offline that pack shows an auditor
 * nothing; those tokens are revocable, so one rotation silently breaks every
 * pack already handed out; and inversely each URL is a permanent
 * unauthenticated link to a photo of a child, live for anyone holding the file.
 * Embedding the bytes and rewriting the links to `media/…` closes both at once.
 *
 * **Nothing here renders a record.** The pack's four text files arrive already
 * rendered by the client's existing builders (`buildCompliancePackFiles`), so
 * there is one renderer for hours/logs/evaluations/portfolio and no compliance
 * or hours math anywhere in `functions/`.
 */

/** Directory inside the zip that holds the embedded evidence. */
export const MEDIA_DIR = "media";

/** Manifest filename at the zip root. */
export const MANIFEST_FILE = "manifest.csv";

/** Which pack file a rendered entry is, independent of its filename. */
export const PackFileRole = {
  HoursSummary: "hoursSummary",
  DailyLogs: "dailyLogs",
  Evaluations: "evaluations",
  Portfolio: "portfolio",
} as const;
export type PackFileRole = (typeof PackFileRole)[keyof typeof PackFileRole];

export type PackTextFile = {
  role: PackFileRole;
  name: string;
  content: string;
};

/**
 * Why a piece of evidence is not in the archive. Every one of these renders
 * both **inline, at the position the evidence would have been** and as a
 * `manifest.csv` row — a pack that quietly drops evidence is worse than one
 * that says what is missing.
 */
export const PackSkipReason = {
  /** The artifact carries no media file (a note, or a photo with no URL). */
  NoMedia: "no-media",
  /** The URL is not a Storage object URL this function can resolve. */
  UnreadableUrl: "unreadable-url",
  /** The object lives outside `families/{familyId}/` — refused, never fetched. */
  OutsideFamily: "outside-family",
  /** The object is gone from Storage (deleted, or never finished uploading). */
  NotFound: "not-found",
  /** Storage returned an error for the download. */
  FetchFailed: "fetch-failed",
  /** One file alone exceeds the per-file ceiling. */
  FileTooLarge: "file-too-large",
  /** Adding this file would push the pack past its total ceiling. */
  PackSizeCap: "pack-size-cap",
  /** A media link in the markdown that no artifact in this range claimed. */
  NotInManifest: "not-in-manifest",
} as const;
export type PackSkipReason =
  (typeof PackSkipReason)[keyof typeof PackSkipReason];

const SKIP_REASON_TEXT: Record<PackSkipReason, string> = {
  [PackSkipReason.NoMedia]: "no media file on this artifact",
  [PackSkipReason.UnreadableUrl]: "media link could not be resolved to a file",
  [PackSkipReason.OutsideFamily]: "media link points outside this family's files",
  [PackSkipReason.NotFound]: "file no longer in storage",
  [PackSkipReason.FetchFailed]: "file could not be read from storage",
  [PackSkipReason.FileTooLarge]: "file larger than this archive allows",
  [PackSkipReason.PackSizeCap]: "archive size limit reached before this file",
  [PackSkipReason.NotInManifest]: "media link not matched to an artifact in this range",
};

/** Plain-language reason text, for both the inline marker and the manifest. */
export const describeSkipReason = (reason: PackSkipReason): string =>
  SKIP_REASON_TEXT[reason];

/**
 * The inline marker that replaces a media link whose file is not in the pack.
 * Italic so it reads as a note rather than as evidence, and it names the
 * artifact so the missing item is traceable back to Firestore.
 */
export const unavailableMarker = (
  artifactId: string | undefined,
  reason: PackSkipReason,
): string =>
  `_[evidence unavailable — artifact ${artifactId?.trim() || "unknown"}, ${describeSkipReason(reason)}]_`;

// ─── Storage URL → object path ───────────────────────────────────────────────

export type StorageObjectRef = {
  /** Bucket named by the URL, when the URL names one. */
  bucket?: string;
  /** Object path, decoded (`families/fam-1/artifacts/a1/2026-07-04.jpg`). */
  path: string;
};

/**
 * Resolve a stored media URL to the Storage object it names.
 *
 * Artifact writers persist only the download URL — `uploadArtifactFile` returns
 * `{ downloadUrl, storagePath }` and every caller destructures `downloadUrl`
 * alone — so the archive cannot read a `storagePath` field off the artifact and
 * has to parse. Three shapes are accepted, covering everything the app has ever
 * written:
 *
 * - `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<url-encoded path>?alt=media&token=…`
 * - `https://storage.googleapis.com/<bucket>/<path>`
 * - `gs://<bucket>/<path>`
 *
 * Returns `null` for anything else — an external link, a data URI, a blob URL.
 * A `null` is a *skip with a reason*, never a silent drop.
 */
export function parseStorageObjectRef(url: string): StorageObjectRef | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;

  if (raw.startsWith("gs://")) {
    const rest = raw.slice("gs://".length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    const path = decodeSafely(rest.slice(slash + 1));
    return path ? { bucket: rest.slice(0, slash), path } : null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const host = parsed.hostname.toLowerCase();

  // firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded path>
  if (host === "firebasestorage.googleapis.com") {
    const m = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!m) return null;
    const path = decodeSafely(m[2]);
    return path ? { bucket: m[1], path } : null;
  }

  // storage.googleapis.com/<bucket>/<path> (and the <bucket>.storage.… variant)
  if (host === "storage.googleapis.com") {
    const segments = parsed.pathname.replace(/^\//, "");
    const slash = segments.indexOf("/");
    if (slash <= 0) return null;
    const path = decodeSafely(segments.slice(slash + 1));
    return path ? { bucket: segments.slice(0, slash), path } : null;
  }
  if (host.endsWith(".storage.googleapis.com")) {
    const path = decodeSafely(parsed.pathname.replace(/^\//, ""));
    return path
      ? { bucket: host.slice(0, -".storage.googleapis.com".length), path }
      : null;
  }

  return null;
}

function decodeSafely(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * True when an object path is inside the calling family's own tree.
 *
 * The archive fetches with the Admin SDK, which is not bound by
 * `storage.rules` — so this is the *only* thing standing between a caller and
 * every object in the bucket. Path traversal (`..`) and a leading slash are
 * both refused rather than normalized.
 */
export function isPathWithinFamily(path: string, familyId: string): boolean {
  if (!familyId || familyId.includes("/")) return false;
  if (!path || path.startsWith("/")) return false;
  if (path.split("/").some((seg) => seg === "." || seg === "..")) return false;
  return path.startsWith(`families/${familyId}/`);
}

// ─── Media plan ──────────────────────────────────────────────────────────────

/** One artifact as the client hands it over — id, label, and its media URLs. */
export type PackArtifactInput = {
  id?: string;
  title?: string;
  createdAt?: string;
  type?: string;
  /** `'child'` or `'family'` — a whole-family capture reads as shared (DATA-04). */
  scope?: string;
  urls?: string[];
};

/** One planned media file: either resolved to an object, or skipped with cause. */
export type PackMediaEntry = {
  artifactId: string;
  title: string;
  createdAt: string;
  type: string;
  scope: string;
  /** The URL as it appears in the rendered markdown. */
  url: string;
  /** Resolved object path, when the URL resolved and is in-family. */
  objectPath?: string;
  /** Zip entry name (`media/<artifactId>-<file>`), when planned for inclusion. */
  entryName?: string;
  /** Set once the entry is known not to be in the archive. */
  skipReason?: PackSkipReason;
  /** Byte size, once fetched. */
  bytes?: number;
};

/** An artifact that contributes no media file at all — still a manifest row. */
export type PackManifestRow = {
  artifactId: string;
  title: string;
  createdAt: string;
  type: string;
  scope: string;
  url: string;
  status: "included" | "skipped";
  file: string;
  reason: string;
};

const sanitizeSegment = (value: string): string =>
  value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 120) ||
  "file";

/** Basename of an object path, with any directory part dropped. */
export const objectBasename = (path: string): string =>
  path.split("/").filter(Boolean).pop() ?? "file";

/**
 * Zip entry name for one media file: `media/<artifactId>-<original name>`.
 *
 * Carries the artifact id on purpose — a bare index (`media/1.jpg`) is not
 * traceable back to the record it evidences, and an auditor holding the zip has
 * no other way to make that link.
 */
export function mediaEntryName(
  artifactId: string,
  objectPath: string,
  used: Set<string>,
): string {
  const base = `${MEDIA_DIR}/${sanitizeSegment(artifactId)}-${sanitizeSegment(objectBasename(objectPath))}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  // Two URLs on one artifact can share a basename; disambiguate rather than
  // let one silently overwrite the other inside the zip.
  const dot = base.lastIndexOf(".");
  const stem = dot > base.lastIndexOf("/") ? base.slice(0, dot) : base;
  const ext = dot > base.lastIndexOf("/") ? base.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

/**
 * Turn the caller's artifact list into the archive's media plan.
 *
 * Every artifact produces at least one row: one per media URL, or a single
 * `no-media` row when it carries none. Nothing is dropped for being boring —
 * the manifest's job is to account for the whole range.
 */
export function planPackMedia(
  artifacts: PackArtifactInput[],
  familyId: string,
): PackMediaEntry[] {
  const used = new Set<string>();
  const entries: PackMediaEntry[] = [];

  for (const artifact of artifacts) {
    const base = {
      artifactId: artifact.id?.trim() || "unknown",
      title: artifact.title?.trim() || "Untitled",
      createdAt: artifact.createdAt?.trim() ?? "",
      type: artifact.type?.trim() ?? "",
      scope: artifact.scope?.trim() ?? "",
    };

    const urls = (artifact.urls ?? []).map((u) => (u ?? "").trim()).filter(Boolean);
    if (urls.length === 0) {
      entries.push({ ...base, url: "", skipReason: PackSkipReason.NoMedia });
      continue;
    }

    for (const url of urls) {
      const ref = parseStorageObjectRef(url);
      if (!ref) {
        entries.push({ ...base, url, skipReason: PackSkipReason.UnreadableUrl });
        continue;
      }
      if (!isPathWithinFamily(ref.path, familyId)) {
        entries.push({ ...base, url, skipReason: PackSkipReason.OutsideFamily });
        continue;
      }
      entries.push({
        ...base,
        url,
        objectPath: ref.path,
        entryName: mediaEntryName(base.artifactId, ref.path, used),
      });
    }
  }

  return entries;
}

// ─── Size ceilings ───────────────────────────────────────────────────────────

export type PackSizeLimits = {
  /** Refuse any single file above this. */
  maxFileBytes: number;
  /** Stop adding media once the embedded total would exceed this. */
  maxTotalBytes: number;
};

/**
 * Media are buffered in memory and zipped in one pass, so both ceilings exist
 * to keep the function inside its 2 GiB allocation rather than to ration
 * evidence. `storage.rules` already caps every upload at 25 MB, so the per-file
 * ceiling is headroom, not a policy.
 */
export const DEFAULT_PACK_LIMITS: PackSizeLimits = {
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 400 * 1024 * 1024,
};

/**
 * Whether one more file fits. A refusal here is a **skip with a reason**, which
 * the caller must render inline and in the manifest — silent truncation is the
 * defect this whole run exists to prevent.
 */
export function checkSizeAllowance(
  bytesSoFar: number,
  fileBytes: number,
  limits: PackSizeLimits = DEFAULT_PACK_LIMITS,
): { ok: true } | { ok: false; reason: PackSkipReason } {
  if (fileBytes > limits.maxFileBytes) {
    return { ok: false, reason: PackSkipReason.FileTooLarge };
  }
  if (bytesSoFar + fileBytes > limits.maxTotalBytes) {
    return { ok: false, reason: PackSkipReason.PackSizeCap };
  }
  return { ok: true };
}

// ─── Markdown rewriting ──────────────────────────────────────────────────────

/** Any markdown link or image: `[text](target)` / `![text](target)`. */
const MARKDOWN_LINK = /(!?)\[([^\]\n]*)\]\(([^)\s]+)\)/g;

/** Hosts whose links cannot survive as evidence in an offline archive. */
const REMOTE_STORAGE_HOSTS = [
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
];

const isRemoteStorageUrl = (url: string): boolean => {
  const ref = parseStorageObjectRef(url);
  if (ref) return true;
  const lower = url.toLowerCase();
  return REMOTE_STORAGE_HOSTS.some((h) => lower.includes(h));
};

/**
 * Rewrite the portfolio markdown so it reads offline.
 *
 * Each media link becomes either a **relative** `media/…` path (the file is in
 * the zip) or an inline unavailable marker naming the artifact and the reason.
 * Nothing is left pointing at `firebasestorage.googleapis.com`: an archive that
 * still needs the network — and a live download token — to show its evidence is
 * the exact artifact this run replaces, and those tokens are revocable and
 * public in equal measure.
 *
 * A storage link the plan never claimed is marked `not-in-manifest` rather than
 * left intact, and is reported back so the manifest can account for it too.
 */
export function rewritePortfolioMedia(
  markdown: string,
  entries: PackMediaEntry[],
): { markdown: string; unmatchedUrls: string[] } {
  const byUrl = new Map<string, PackMediaEntry>();
  for (const entry of entries) {
    if (entry.url && !byUrl.has(entry.url)) byUrl.set(entry.url, entry);
  }

  const unmatched = new Set<string>();
  const rewritten = markdown.replace(
    MARKDOWN_LINK,
    (whole, bang: string, text: string, target: string) => {
      const entry = byUrl.get(target);
      if (entry) {
        if (entry.entryName && !entry.skipReason) {
          return `${bang}[${text}](${entry.entryName})`;
        }
        return unavailableMarker(
          entry.artifactId,
          entry.skipReason ?? PackSkipReason.FetchFailed,
        );
      }
      if (isRemoteStorageUrl(target)) {
        unmatched.add(target);
        return unavailableMarker(undefined, PackSkipReason.NotInManifest);
      }
      return whole;
    },
  );

  return { markdown: rewritten, unmatchedUrls: [...unmatched] };
}

/**
 * Every remote storage URL still present in a rendered file. Used as a runtime
 * guard before the zip is written, and asserted in tests: a pack that leaks one
 * of these is still handing out a permanent public link to a photo of a child.
 */
export function findRemainingRemoteUrls(content: string): string[] {
  // One pass over whole URLs rather than one per host: `storage.googleapis.com`
  // is a substring of `firebasestorage.googleapis.com`, so a per-host scan
  // reports the same leak twice at two different offsets.
  const re = /(?:https?:\/\/[a-z0-9.-]*(?:firebasestorage|storage)\.googleapis\.com|gs:\/\/)[^\s)"'<>\]]*/gi;
  return [...new Set(content.match(re) ?? [])];
}

// ─── Manifest ────────────────────────────────────────────────────────────────

const csvCell = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const MANIFEST_HEADER = [
  "artifactId",
  "title",
  "createdAt",
  "type",
  "scope",
  "status",
  "file",
  "bytes",
  "reason",
] as const;

/**
 * One row per piece of evidence the range holds — included **and** skipped.
 *
 * This is the archive's honesty record: an auditor (or a parent) can tell at a
 * glance that thirty-one artifacts existed and twenty-nine are in the zip, and
 * exactly why the other two are not.
 */
export function buildPackManifestCsv(
  entries: PackMediaEntry[],
  unmatchedUrls: string[] = [],
): string {
  const rows: string[] = [MANIFEST_HEADER.join(",")];

  for (const entry of entries) {
    const included = Boolean(entry.entryName) && !entry.skipReason;
    rows.push(
      [
        entry.artifactId,
        entry.title,
        entry.createdAt,
        entry.type,
        entry.scope,
        included ? "included" : "skipped",
        included ? (entry.entryName ?? "") : "",
        included && entry.bytes != null ? String(entry.bytes) : "",
        entry.skipReason ? describeSkipReason(entry.skipReason) : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  for (const url of unmatchedUrls) {
    rows.push(
      [
        "unknown",
        url,
        "",
        "",
        "",
        "skipped",
        "",
        "",
        describeSkipReason(PackSkipReason.NotInManifest),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return `${rows.join("\n")}\n`;
}

/** Counts for the callable's response and the log line. */
export function summarizePack(entries: PackMediaEntry[]): {
  included: number;
  skipped: number;
  bytes: number;
} {
  let included = 0;
  let skipped = 0;
  let bytes = 0;
  for (const entry of entries) {
    if (entry.entryName && !entry.skipReason) {
      included++;
      bytes += entry.bytes ?? 0;
    } else {
      skipped++;
    }
  }
  return { included, skipped, bytes };
}

// ─── Request validation ──────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Caps on the client-supplied payload. Rendered text, not media. */
export const REQUEST_LIMITS = {
  maxFiles: 8,
  maxFileChars: 4 * 1024 * 1024,
  maxArtifacts: 5000,
  maxUrlsPerArtifact: 50,
} as const;

export type PackRequest = {
  familyId: string;
  childId: string;
  childName: string;
  startDate: string;
  endDate: string;
  files: PackTextFile[];
  artifacts: PackArtifactInput[];
};

const ROLES = new Set<string>(Object.values(PackFileRole));

/**
 * Validate the callable payload. Pure so the shape rules are testable without
 * standing up a callable, matching `orderValidation.ts` (FEAT-89).
 *
 * The rendered text arrives from the client on purpose — see the module header —
 * so the checks here are about shape and size, not about trusting a total.
 */
export function validatePackRequest(
  body: unknown,
): { ok: true; request: PackRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be an object." };
  }
  const b = body as Record<string, unknown>;

  const familyId = typeof b.familyId === "string" ? b.familyId.trim() : "";
  const childId = typeof b.childId === "string" ? b.childId.trim() : "";
  const startDate = typeof b.startDate === "string" ? b.startDate.trim() : "";
  const endDate = typeof b.endDate === "string" ? b.endDate.trim() : "";
  const childName = typeof b.childName === "string" ? b.childName.trim() : "";

  if (!familyId) return { ok: false, error: "familyId is required." };
  if (!childId) return { ok: false, error: "childId is required." };
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return { ok: false, error: "startDate and endDate must be YYYY-MM-DD." };
  }
  if (endDate < startDate) {
    return { ok: false, error: "endDate must not precede startDate." };
  }

  if (!Array.isArray(b.files) || b.files.length === 0) {
    return { ok: false, error: "files is required and must be non-empty." };
  }
  if (b.files.length > REQUEST_LIMITS.maxFiles) {
    return { ok: false, error: "Too many files in the pack." };
  }

  const files: PackTextFile[] = [];
  const seenNames = new Set<string>();
  for (const raw of b.files) {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, error: "Each file must be an object." };
    }
    const f = raw as Record<string, unknown>;
    const name = typeof f.name === "string" ? f.name.trim() : "";
    const content = typeof f.content === "string" ? f.content : "";
    const role = typeof f.role === "string" ? f.role : "";
    if (!name || name.includes("/") || name.includes("\\") || name.startsWith(".")) {
      return { ok: false, error: `Invalid pack file name: ${name || "(blank)"}` };
    }
    if (seenNames.has(name)) {
      return { ok: false, error: `Duplicate pack file name: ${name}` };
    }
    if (!ROLES.has(role)) {
      return { ok: false, error: `Unknown pack file role: ${role || "(blank)"}` };
    }
    if (content.length > REQUEST_LIMITS.maxFileChars) {
      return { ok: false, error: `Pack file too large: ${name}` };
    }
    seenNames.add(name);
    files.push({ role: role as PackFileRole, name, content });
  }

  const rawArtifacts = Array.isArray(b.artifacts) ? b.artifacts : [];
  if (rawArtifacts.length > REQUEST_LIMITS.maxArtifacts) {
    return { ok: false, error: "Too many artifacts in one pack." };
  }
  const artifacts: PackArtifactInput[] = [];
  for (const raw of rawArtifacts) {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, error: "Each artifact must be an object." };
    }
    const a = raw as Record<string, unknown>;
    const urls = Array.isArray(a.urls)
      ? a.urls.filter((u): u is string => typeof u === "string")
      : [];
    if (urls.length > REQUEST_LIMITS.maxUrlsPerArtifact) {
      return { ok: false, error: "Too many media links on one artifact." };
    }
    artifacts.push({
      id: typeof a.id === "string" ? a.id : undefined,
      title: typeof a.title === "string" ? a.title : undefined,
      createdAt: typeof a.createdAt === "string" ? a.createdAt : undefined,
      type: typeof a.type === "string" ? a.type : undefined,
      scope: typeof a.scope === "string" ? a.scope : undefined,
      urls,
    });
  }

  return {
    ok: true,
    request: { familyId, childId, childName, startDate, endDate, files, artifacts },
  };
}

// ─── Storage naming ──────────────────────────────────────────────────────────

/** Storage prefix the generated (derived, disposable) packs live under. */
export const PACK_STORAGE_PREFIX = "compliance-packs";

/**
 * Where one generated pack is written. Derived data in its own prefix, never
 * mixed with the artifacts it embeds, so retention can sweep it freely.
 */
export function packObjectPath(
  familyId: string,
  childName: string,
  startDate: string,
  endDate: string,
  generatedAtIso: string,
): string {
  const stamp = sanitizeSegment(generatedAtIso.replace(/[:.]/g, "-"));
  const who = sanitizeSegment(childName.toLowerCase() || "family");
  return `families/${familyId}/${PACK_STORAGE_PREFIX}/${stamp}-${who}-compliance-archive-${startDate}-to-${endDate}.zip`;
}

/** Suggested download filename for the browser. */
export function packDownloadName(
  childName: string,
  startDate: string,
  endDate: string,
): string {
  const prefix = childName ? `${sanitizeSegment(childName.toLowerCase())}-` : "";
  return `${prefix}compliance-archive-${startDate}-to-${endDate}.zip`;
}

/** How long a generated pack survives before the next run sweeps it. */
export const PACK_RETENTION_MS = 24 * 60 * 60 * 1000;

/** How long the returned download link stays valid. */
export const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

/**
 * Which previously-generated packs are past retention. Pure so the sweep's
 * cutoff is testable, and deliberately conservative: an object with no readable
 * timestamp is left alone rather than deleted on a guess.
 */
export function selectExpiredPacks(
  objects: Array<{ name: string; updated?: string | number | Date }>,
  nowMs: number,
  retentionMs: number = PACK_RETENTION_MS,
): string[] {
  const expired: string[] = [];
  for (const object of objects) {
    if (object.updated == null) continue;
    const at = new Date(object.updated).getTime();
    if (Number.isNaN(at)) continue;
    if (nowMs - at > retentionMs) expired.push(object.name);
  }
  return expired;
}
