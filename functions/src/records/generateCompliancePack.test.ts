import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

// ── Module-load-time dependencies of the callable registration ──────────────
// `authGuard.js` is deliberately NOT mocked: the auth rejection paths are the
// point of half of this file, so they run the real guard against the stubbed
// `HttpsError`.

const { childExistsRef } = vi.hoisted(() => ({ childExistsRef: { value: true } }));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    doc: () => ({ get: async () => ({ exists: childExistsRef.value }) }),
    collection: () => ({
      where: () => ({ where: () => ({ count: () => ({ get: async () => ({ data: () => ({ count: 0 }) }) }) }) }),
    }),
  }),
}));

vi.mock("firebase-admin/storage", () => ({ getStorage: () => ({ bucket: () => bucketForCallable }) }));

vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: (_opts: unknown, handler: unknown) => handler,
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

// Import AFTER the mocks.
import {
  buildCompliancePackArchive,
  generateCompliancePack,
  sweepAllCompliancePacks,
  type PackBucket,
} from "./generateCompliancePack.js";
import { PackFileRole, type PackRequest } from "./compliancePack.logic.js";

const FAMILY = "fam-1";
const PHOTO_PATH = `families/${FAMILY}/artifacts/art-1/photo.jpg`;
const AUDIO_PATH = `families/${FAMILY}/artifacts/art-2/clip.webm`;

const downloadUrl = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/fpe.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=abc-123`;

// ── A Storage bucket that is just a Map ─────────────────────────────────────

type FakeObject = { data: Buffer } | { error: { code: number | string } };

function makeBucket(
  objects: Record<string, FakeObject>,
  options: { signingFails?: boolean; existing?: Array<{ name: string; updated?: string }> } = {},
) {
  const saved = new Map<string, Buffer>();
  const savedMetadata = new Map<string, Record<string, string>>();
  const deleted: string[] = [];
  const existing = options.existing ?? [];

  const bucket = {
    name: "fpe.appspot.com",
    saved,
    savedMetadata,
    deleted,
    file(path: string) {
      const object = objects[path];
      return {
        async getMetadata() {
          if (!object) throw { code: 404 };
          if ("error" in object) throw object.error;
          return [{ size: String(object.data.length), contentType: "image/jpeg" }] as [
            { size?: string; contentType?: string },
          ];
        },
        async download() {
          if (!object || "error" in object) throw { code: 500 };
          return [object.data] as [Buffer];
        },
        async save(data: Buffer, saveOptions?: { metadata?: { metadata?: Record<string, string> } }) {
          saved.set(path, data);
          savedMetadata.set(path, { ...(saveOptions?.metadata?.metadata ?? {}) });
        },
        async getSignedUrl() {
          if (options.signingFails) throw new Error("SignBlob permission denied");
          return [`https://storage.googleapis.com/signed/${encodeURIComponent(path)}`] as [string];
        },
        async setMetadata(update: { metadata: Record<string, string> }) {
          savedMetadata.set(path, { ...(savedMetadata.get(path) ?? {}), ...update.metadata });
        },
      };
    },
    async getFiles() {
      return [
        existing.map((o) => ({
          name: o.name,
          metadata: { updated: o.updated },
          delete: async () => {
            deleted.push(o.name);
          },
        })),
      ] as [Array<{ name: string; metadata?: { updated?: string }; delete(): Promise<unknown> }>];
    },
  };

  return bucket as typeof bucket & PackBucket;
}

/** The bucket the callable's `getStorage()` mock hands back. */
let bucketForCallable: unknown = null;

// ── Fixture ─────────────────────────────────────────────────────────────────

const HOURS_CSV = "Subject,Minutes\nMath,600\n";
const DAILY_CSV = "Date,Minutes\n2026-07-04,120\n";

const PORTFOLIO_MD = [
  "# Portfolio Index — 2026-07-01 to 2027-06-30",
  "",
  "## Lincoln",
  "",
  `![Volcano](${downloadUrl(PHOTO_PATH)})`,
  "",
  "## Dad Lab",
  "",
  `[Narration](${downloadUrl(AUDIO_PATH)})`,
  "",
].join("\n");

const request = (over: Partial<PackRequest> = {}): PackRequest => ({
  familyId: FAMILY,
  childId: "child-1",
  childName: "Lincoln",
  startDate: "2026-07-01",
  endDate: "2027-06-30",
  files: [
    { role: PackFileRole.HoursSummary, name: "lincoln-hours-summary.csv", content: HOURS_CSV },
    { role: PackFileRole.DailyLogs, name: "lincoln-daily-logs.csv", content: DAILY_CSV },
    { role: PackFileRole.Portfolio, name: "lincoln-portfolio.md", content: PORTFOLIO_MD },
  ],
  artifacts: [
    { id: "art-1", title: "Volcano", createdAt: "2026-07-04", type: "Photo", scope: "family", urls: [downloadUrl(PHOTO_PATH)] },
    { id: "art-2", title: "Narration", createdAt: "2026-07-04", type: "Audio", scope: "family", urls: [downloadUrl(AUDIO_PATH)] },
    { id: "art-3", title: "A note", createdAt: "2026-07-05", type: "Note", scope: "child", urls: [] },
  ],
  ...over,
});

const NOW = new Date("2026-07-26T03:00:00.000Z");

async function readPack(bucket: ReturnType<typeof makeBucket>, objectPath: string) {
  const buffer = bucket.saved.get(objectPath);
  expect(buffer, "pack was not written to storage").toBeTruthy();
  const zip = await JSZip.loadAsync(buffer as Buffer);
  const text = async (name: string) => zip.file(name)?.async("string");
  return { zip, text, names: Object.keys(zip.files) };
}

// ── The archive ─────────────────────────────────────────────────────────────

describe("buildCompliancePackArchive", () => {
  it("embeds the real bytes and points the markdown at them", async () => {
    const bucket = makeBucket({
      [PHOTO_PATH]: { data: Buffer.from("JPEGBYTES") },
      [AUDIO_PATH]: { data: Buffer.from("WEBMBYTES") },
    });

    const result = await buildCompliancePackArchive(bucket, request(), { now: NOW });
    const { zip, text, names } = await readPack(bucket, result.objectPath);

    expect(names).toContain("media/art-1-photo.jpg");
    expect(names).toContain("media/art-2-clip.webm");
    expect(await zip.file("media/art-1-photo.jpg")?.async("string")).toBe("JPEGBYTES");

    const portfolio = (await text("lincoln-portfolio.md")) ?? "";
    expect(portfolio).toContain("![Volcano](media/art-1-photo.jpg)");
    expect(portfolio).toContain("[Narration](media/art-2-clip.webm)");
    expect(result.mediaIncluded).toBe(2);
    expect(result.hasGaps).toBe(true); // art-3 carries no media, and says so
  });

  it("leaves no firebasestorage URL anywhere in the packed markdown", async () => {
    const bucket = makeBucket({
      [PHOTO_PATH]: { data: Buffer.from("JPEGBYTES") },
      [AUDIO_PATH]: { data: Buffer.from("WEBMBYTES") },
    });
    const result = await buildCompliancePackArchive(bucket, request(), { now: NOW });
    const { zip, names } = await readPack(bucket, result.objectPath);

    for (const name of names.filter((n) => n.endsWith(".md") || n.endsWith(".csv"))) {
      const content = (await zip.file(name)?.async("string")) ?? "";
      expect(content, name).not.toContain("firebasestorage.googleapis.com");
      expect(content, name).not.toContain("alt=media&token=");
    }
  });

  it("has every media reference in the markdown resolve to a file in the zip", async () => {
    const bucket = makeBucket({
      [PHOTO_PATH]: { data: Buffer.from("JPEGBYTES") },
      [AUDIO_PATH]: { data: Buffer.from("WEBMBYTES") },
    });
    const result = await buildCompliancePackArchive(bucket, request(), { now: NOW });
    const { zip, text, names } = await readPack(bucket, result.objectPath);

    const portfolio = (await text("lincoln-portfolio.md")) ?? "";
    const targets = [...portfolio.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target.startsWith("media/"), target).toBe(true);
      expect(names, target).toContain(target);
      expect(zip.file(target)).toBeTruthy();
    }
  });

  it("passes the record files through byte-identical", async () => {
    const bucket = makeBucket({ [PHOTO_PATH]: { data: Buffer.from("x") }, [AUDIO_PATH]: { data: Buffer.from("y") } });
    const result = await buildCompliancePackArchive(bucket, request(), { now: NOW });
    const { text } = await readPack(bucket, result.objectPath);

    expect(await text("lincoln-hours-summary.csv")).toBe(HOURS_CSV);
    expect(await text("lincoln-daily-logs.csv")).toBe(DAILY_CSV);
  });

  it("still builds when an artifact is gone from storage, and says so twice", async () => {
    const bucket = makeBucket({ [AUDIO_PATH]: { data: Buffer.from("WEBMBYTES") } }); // photo deleted
    const result = await buildCompliancePackArchive(bucket, request(), { now: NOW });
    const { text, names } = await readPack(bucket, result.objectPath);

    // 1 — inline, at the position the evidence would have been.
    const portfolio = (await text("lincoln-portfolio.md")) ?? "";
    expect(portfolio).toContain(
      "_[evidence unavailable — artifact art-1, file no longer in storage]_",
    );
    // 2 — as a manifest row.
    const manifest = (await text("manifest.csv")) ?? "";
    expect(manifest).toContain("art-1");
    expect(manifest).toContain("file no longer in storage");
    // The pack still generated, with the evidence that survived.
    expect(names).toContain("media/art-2-clip.webm");
    expect(names).not.toContain("media/art-1-photo.jpg");
    expect(result.mediaIncluded).toBe(1);
    expect(result.hasGaps).toBe(true);
  });

  it("flags a size-capped file rather than silently truncating the pack", async () => {
    const bucket = makeBucket({
      [PHOTO_PATH]: { data: Buffer.alloc(4096) },
      [AUDIO_PATH]: { data: Buffer.alloc(4096) },
    });
    const result = await buildCompliancePackArchive(bucket, request(), {
      now: NOW,
      limits: { maxFileBytes: 4096, maxTotalBytes: 5000 },
    });
    const { text, names } = await readPack(bucket, result.objectPath);

    expect(names).toContain("media/art-1-photo.jpg");
    expect(names).not.toContain("media/art-2-clip.webm");
    const portfolio = (await text("lincoln-portfolio.md")) ?? "";
    expect(portfolio).toContain("artifact art-2, archive size limit reached");
    expect((await text("manifest.csv")) ?? "").toContain("archive size limit reached");
  });

  it("accounts for a media-less artifact in the manifest rather than omitting it", async () => {
    const bucket = makeBucket({ [PHOTO_PATH]: { data: Buffer.from("x") }, [AUDIO_PATH]: { data: Buffer.from("y") } });
    const result = await buildCompliancePackArchive(bucket, request(), { now: NOW });
    const { text } = await readPack(bucket, result.objectPath);

    const manifest = ((await text("manifest.csv")) ?? "").trimEnd().split("\n");
    expect(manifest[0]).toMatch(/^artifactId,/);
    expect(manifest).toHaveLength(4); // header + three artifacts
    expect(manifest.some((row) => row.startsWith("art-3,") && row.includes("no media file"))).toBe(true);
  });

  it("never fetches an object outside the family, even when asked to", async () => {
    const foreign = "families/fam-2/artifacts/x/secret.jpg";
    const bucket = makeBucket({ [foreign]: { data: Buffer.from("SECRET") } });
    const result = await buildCompliancePackArchive(
      bucket,
      request({
        files: [{ role: PackFileRole.Portfolio, name: "p.md", content: `![x](${downloadUrl(foreign)})` }],
        artifacts: [{ id: "art-x", title: "x", urls: [downloadUrl(foreign)] }],
      }),
      { now: NOW },
    );
    const { zip, text, names } = await readPack(bucket, result.objectPath);

    expect(names.some((n) => n.startsWith("media/"))).toBe(false);
    expect(JSON.stringify(await zip.file("p.md")?.async("string"))).not.toContain("SECRET");
    expect((await text("p.md")) ?? "").toContain("points outside this family's files");
    expect(result.mediaIncluded).toBe(0);
  });

  it("writes the pack to its own prefix and returns a short-lived signed link", async () => {
    const bucket = makeBucket({ [PHOTO_PATH]: { data: Buffer.from("x") }, [AUDIO_PATH]: { data: Buffer.from("y") } });
    const result = await buildCompliancePackArchive(bucket, request(), { now: NOW });

    expect(result.objectPath).toContain(`families/${FAMILY}/compliance-packs/`);
    expect(result.objectPath).not.toContain("/artifacts/");
    expect(result.urlKind).toBe("signed");
    expect(result.downloadUrl).toContain("/signed/");
    expect(Date.parse(result.expiresAt) - NOW.getTime()).toBe(15 * 60 * 1000);
    expect(result.downloadName).toBe("lincoln-compliance-archive-2026-07-01-to-2027-06-30.zip");
  });

  it("mints NO download token on the signed path", async () => {
    // A `firebaseStorageDownloadTokens` value is an unauthenticated, permanently
    // fetchable URL for as long as the object lives — never issued where a
    // signed URL works (Codex P1, PR #1631).
    const bucket = makeBucket({ [PHOTO_PATH]: { data: Buffer.from("x") }, [AUDIO_PATH]: { data: Buffer.from("y") } });
    const result = await buildCompliancePackArchive(bucket, request(), { now: NOW });

    expect(bucket.savedMetadata.get(result.objectPath)).not.toHaveProperty(
      "firebaseStorageDownloadTokens",
    );
  });

  it("falls back to a token link when the runtime cannot sign, and reports it", async () => {
    const bucket = makeBucket(
      { [PHOTO_PATH]: { data: Buffer.from("x") }, [AUDIO_PATH]: { data: Buffer.from("y") } },
      { signingFails: true },
    );
    const result = await buildCompliancePackArchive(bucket, request(), { now: NOW });

    expect(result.urlKind).toBe("token");
    expect(result.downloadUrl).toContain("alt=media&token=");
    // The token exists only on this path, and only after signing failed.
    expect(bucket.savedMetadata.get(result.objectPath)).toHaveProperty(
      "firebaseStorageDownloadTokens",
    );
  });

  it("sweeps packs past retention and leaves fresh ones alone", async () => {
    const bucket = makeBucket(
      { [PHOTO_PATH]: { data: Buffer.from("x") }, [AUDIO_PATH]: { data: Buffer.from("y") } },
      {
        existing: [
          { name: `families/${FAMILY}/compliance-packs/old.zip`, updated: "2026-07-24T03:00:00.000Z" },
          { name: `families/${FAMILY}/compliance-packs/fresh.zip`, updated: "2026-07-26T02:00:00.000Z" },
        ],
      },
    );
    await buildCompliancePackArchive(bucket, request(), { now: NOW });

    expect(bucket.deleted).toEqual([`families/${FAMILY}/compliance-packs/old.zip`]);
  });
});

// ── Retention without a later export ────────────────────────────────────────

describe("sweepAllCompliancePacks", () => {
  const db = (familyIds: string[]) => ({
    collection: () => ({ get: async () => ({ docs: familyIds.map((id) => ({ id })) }) }),
  });

  it("deletes expired packs for every family, with no export involved", async () => {
    // The P1 this closes: a family that generates one archive and never
    // generates another would otherwise keep the object — and, on the
    // token-fallback path, its unauthenticated URL — well past the advertised
    // 24 hours, because the only sweep ran during a later export.
    const bucket = makeBucket(
      {},
      {
        existing: [
          { name: "families/fam-1/compliance-packs/old.zip", updated: "2026-07-24T03:00:00.000Z" },
          { name: "families/fam-1/compliance-packs/fresh.zip", updated: "2026-07-26T02:00:00.000Z" },
        ],
      },
    );

    const result = await sweepAllCompliancePacks(db(["fam-1", "fam-2"]), bucket, NOW.getTime());

    expect(result.families).toBe(2);
    // Both families list the same fake prefix, so the expired object goes once each.
    expect(result.deleted).toBe(2);
    expect(new Set(bucket.deleted)).toEqual(
      new Set(["families/fam-1/compliance-packs/old.zip"]),
    );
  });

  it("does nothing when every pack is inside the window", async () => {
    const bucket = makeBucket(
      {},
      { existing: [{ name: "families/fam-1/compliance-packs/fresh.zip", updated: "2026-07-26T02:00:00.000Z" }] },
    );
    const result = await sweepAllCompliancePacks(db(["fam-1"]), bucket, NOW.getTime());
    expect(result.deleted).toBe(0);
    expect(bucket.deleted).toEqual([]);
  });
});

// ── Auth ────────────────────────────────────────────────────────────────────

describe("generateCompliancePack — access", () => {
  const handler = generateCompliancePack as unknown as (req: unknown) => Promise<unknown>;
  const parent = { uid: FAMILY, token: { email: "nathan@example.com" } };

  beforeEach(() => {
    childExistsRef.value = true;
    bucketForCallable = makeBucket({
      [PHOTO_PATH]: { data: Buffer.from("x") },
      [AUDIO_PATH]: { data: Buffer.from("y") },
    });
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(handler({ auth: null, data: request() })).rejects.toThrow(/Authentication required/i);
  });

  it("rejects a non-parent (anonymous / no-email) caller", async () => {
    await expect(
      handler({
        auth: { uid: FAMILY, token: { firebase: { sign_in_provider: "anonymous" } } },
        data: request(),
      }),
    ).rejects.toThrow(/email account is required/i);
  });

  it("rejects a parent of a DIFFERENT family", async () => {
    await expect(
      handler({
        auth: { uid: "fam-2", token: { email: "someone@example.com" } },
        data: request(),
      }),
    ).rejects.toThrow(/do not have access to this family/i);
  });

  it("rejects a childId this family does not have", async () => {
    childExistsRef.value = false;
    await expect(handler({ auth: parent, data: request() })).rejects.toThrow(/not found in this family/i);
  });

  it("rejects a malformed payload before touching storage", async () => {
    await expect(
      handler({ auth: parent, data: { ...request(), startDate: "07/01/2026" } }),
    ).rejects.toThrow(/YYYY-MM-DD/);
  });

  it("builds the archive for the owning parent", async () => {
    const result = (await handler({ auth: parent, data: request() })) as { mediaIncluded: number };
    expect(result.mediaIncluded).toBe(2);
  });
});
