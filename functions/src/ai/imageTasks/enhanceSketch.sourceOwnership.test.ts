import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The source-image family boundary on `enhanceSketch` (FIX-258).
 *
 * `enhanceSketch` is handed a Storage path by its callers and reads it with the
 * **admin SDK**, which no storage rule applies to. The identity gate has always
 * checked that the caller owns `familyId` — but the object it then downloaded
 * was whatever string arrived in `sketchStoragePath`, so an authorised parent of
 * one family could name another family's object and get a redraw of it back
 * through a URL of their own.
 *
 * The boundary is the **family subtree**, not a folder policy: any nested object
 * under `families/<familyId>/` passes, so a later feature can add a folder
 * without coming back here. What is refused is a path that leaves the subtree —
 * another family, a prefix lookalike, an unscoped or URL-shaped string, and any
 * segment that reads as path structure rather than a name, encoded or not.
 *
 * These tests drive the **actual callable** — the exported handler, with the
 * provider, Storage and Firestore mocked — because the claim is about where the
 * gate sits: a rejected source must cost no copyright rewrite, no `getStorage()`,
 * no file handle, no `exists()`, no `download()`, no image call and no write.
 *
 * Path conventions are taken from the real callers rather than invented:
 * `SketchScanner.uploadToStorage` (`families/{id}/sketches/{ts}_{file.name}` and
 * the same under `stickers/`), `useBook.addSketchToPage` / `addStickerToPage`
 * (`sketches/`, `books/{bookId}/...`), `StickerPicker`/`MakeStickerDialog`
 * saving a `generateImage` result (`generated-images/`), and
 * `generateStickerVersion`, which re-runs this callable on a **saved sticker's**
 * own `storagePath` — the saved-sticker editing phase this gate precedes.
 */

const FAMILY = "fam-1";
const OTHER_FAMILY = "fam-2";

// The allowlisted address in `authGuard.ts` — `enhanceSketch` runs the real
// `requireApprovedUser`, which is deliberately NOT mocked here: the order
// "auth, then identity, then source" is part of what these tests pin.
const parent = { uid: FAMILY, token: { email: "nathan.xb9753@gmail.com" } };

/** Both free-text fields, on every negative: each would otherwise cost a Claude call. */
const WORDS = { caption: "Elsa riding a dragon", customNote: "dress her as Elsa" };

// ── Valid sources ──────────────────────────────────────────────────────────

const VALID_SOURCES = [
  // `SketchScanner` / `useBook` sketch uploads — the filename carries the
  // child's own file name, so spaces, parentheses and unicode are ORDINARY
  // here and must survive the gate.
  `families/${FAMILY}/sketches/2026-10-03T12-00-00-000Z_my dragon (2).png`,
  `families/${FAMILY}/sketches/1759500000000_zeichnung-ü.jpeg`,
  `families/${FAMILY}/sketches/2026-10-03T12-00-00-000Z_enhanced.png`,
  // A saved sticker: uploaded by `StickerPicker`, or cleaned by `SketchScanner`.
  `families/${FAMILY}/stickers/upload_2026-10-03T12-00-00-000Z.png`,
  // A saved sticker whose image came from `generateImage`.
  `families/${FAMILY}/generated-images/2026-10-03T12-00-00-000Z_sticker.png`,
  // A book page image / page sticker — nested under the book id, and deeper.
  `families/${FAMILY}/books/book-7/sticker_2026-10-03T12-00-00-000Z.png`,
  `families/${FAMILY}/books/book-7/pages/3/img_42.jpg`,
  // Other legitimate same-family subtrees. The gate draws the family boundary
  // and leaves "which folder holds a picture" to the feature that owns it.
  `families/${FAMILY}/artifacts/art-1/photo.jpg`,
  `families/${FAMILY}/scans/2026-10-03_page.jpg`,
  `families/${FAMILY}/storyGames/game-1/art.png`,
  `families/${FAMILY}/chat-uploads/photo.jpg`,
  // One object segment straight under the family is enough.
  `families/${FAMILY}/legacy-drawing.png`,
];

/** Ordinary percent signs in a child's filename, which must stay ordinary. */
const PERCENT_NAME_SOURCES = [
  `families/${FAMILY}/stickers/1759500000000_sticker 100%.png`,
  `families/${FAMILY}/sketches/50%off.png`,
  `families/${FAMILY}/sketches/my%20drawing.png`, // decodes to a space — a name
  `families/${FAMILY}/sketches/v%2e1.png`, // decodes to `v.1.png` — a name
  `families/${FAMILY}/sketches/%zz.png`, // malformed escape, left literal
  `families/${FAMILY}/sketches/100%%.png`,
];

// ── Rejected sources ───────────────────────────────────────────────────────

/** Well-formed, but not this family's subtree. */
const FOREIGN_SOURCES = [
  // Another family outright — the object exists in the fake bucket, so without
  // the gate this is a successful cross-family redraw, not a 404.
  `families/${OTHER_FAMILY}/sketches/secret-drawing.png`,
  `families/${OTHER_FAMILY}/books/book-1/page.png`,
  `families/${OTHER_FAMILY}/legacy-drawing.png`,
  // Prefix lookalikes: a family id this one is a prefix OF.
  `families/${FAMILY}-evil/sketches/x.png`,
  `families/${FAMILY}0/sketches/x.png`,
  `families/${FAMILY}x/stickers/x.png`,
  // Not under this family at all.
  "sketches/x.png",
  "public/catalog/product-1/hero.png",
  "families/sketches/x.png",
];

/** Shapes that are not a plain family-scoped object path at all. */
const MALFORMED_SOURCES = [
  // Traversal, in both slash flavours.
  `families/${FAMILY}/sketches/../../${OTHER_FAMILY}/sketches/secret-drawing.png`,
  `families/${FAMILY}/../${OTHER_FAMILY}/sketches/secret-drawing.png`,
  `families/${FAMILY}/sketches/..`,
  `families/${FAMILY}/./sketches/x.png`,
  `families\\${FAMILY}\\sketches\\x.png`,
  `families/${FAMILY}/sketches\\..\\..\\${OTHER_FAMILY}\\x.png`,
  // Empty segments.
  `families/${FAMILY}//sketches/x.png`,
  `/families/${FAMILY}/sketches/x.png`,
  `families/${FAMILY}/sketches/`,
  // URLs, which is what a client holds far more often than a path.
  `https://firebasestorage.googleapis.com/v0/b/fpe.appspot.com/o/${encodeURIComponent(
    `families/${OTHER_FAMILY}/sketches/secret-drawing.png`,
  )}?alt=media&token=abc-123`,
  `gs://fpe.appspot.com/families/${OTHER_FAMILY}/sketches/secret-drawing.png`,
  // A whole path, percent-encoded as one segment.
  encodeURIComponent(`families/${OTHER_FAMILY}/sketches/secret-drawing.png`),
];

/**
 * Encoded structure. Each of these is refused as **ambiguous**: something that
 * decodes the name once more would read path structure out of it.
 */
const ENCODED_STRUCTURE_SOURCES = [
  // Encoded dot segments, either case.
  `families/${FAMILY}/sketches/%2e%2e/x.png`,
  `families/${FAMILY}/sketches/%2E%2E/x.png`,
  `families/${FAMILY}/%2e/x.png`,
  `families/${FAMILY}/sketches/%2e%2e`,
  // Double-encoded — one layer deeper than the obvious check.
  `families/${FAMILY}/sketches/%252e%252e/x.png`,
  `families/${FAMILY}/sketches/%25252e%25252e`,
  // Valid-dangerous escapes mixed with an invalid one, so `..%` cannot pass as
  // a name just because the trailing `%` survived.
  `families/${FAMILY}/sketches/%2e%2e%`,
  `families/${FAMILY}/sketches/%252e%2e%`,
  // Encoded separators and control characters.
  `families/${FAMILY}/sketches/a%2fb.png`,
  `families/${FAMILY}/sketches/a%2Fb.png`,
  `families/${FAMILY}/sketches/a%5cb.png`,
  `families/${FAMILY}/sketches/x%00.png`,
  `families/${FAMILY}/sketches/x%0a.png`,
  `families/${FAMILY}%2f${OTHER_FAMILY}/sketches/x.png`,
];

// ── Mocks ──────────────────────────────────────────────────────────────────

const { rewriteForCopyright, suggestPromptAlternatives, editImage, usageWrites, storageUse } =
  vi.hoisted(() => ({
    rewriteForCopyright: vi.fn(async (text: string) => text),
    suggestPromptAlternatives: vi.fn(async () => [] as string[]),
    editImage: vi.fn(async () => ({
      b64Data: Buffer.from("fake-png-bytes").toString("base64"),
    })),
    usageWrites: [] as Array<{ path: string; doc: Record<string, unknown> }>,
    // Every privileged Storage step, not just the reads: a gate that lets a
    // refused path reach `getStorage()` is a gate in the wrong place.
    storageUse: { getStorage: 0, bucket: 0, files: [] as string[] },
  }));

vi.mock("../aiConfig.js", () => ({
  // Fake values — no credential and no network call anywhere in this file.
  claudeApiKey: { value: () => "test-claude-key" },
  openaiApiKey: { value: () => "test-openai-key" },
}));

vi.mock("./copyrightUtils.js", () => ({
  rewriteForCopyright,
  suggestPromptAlternatives,
}));

vi.mock("../providers/openai.js", () => ({
  createOpenAiProvider: () => ({ editImage, generateImage: vi.fn() }),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    collection: (path: string) => ({
      add: async (doc: Record<string, unknown>) => {
        usageWrites.push({ path, doc });
        return { id: "usage-1" };
      },
    }),
  }),
}));

vi.mock("firebase-admin/storage", () => ({
  getStorage: () => {
    storageUse.getStorage += 1;
    return {
      bucket: () => {
        storageUse.bucket += 1;
        return bucket;
      },
    };
  },
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

// Import AFTER the mocks.
import {
  checkSketchSourcePath,
  enhanceSketch,
  type EnhanceSketchResponse,
} from "./enhanceSketch.js";

// ── A Storage bucket that is just a Map, and records what was touched ───────

const objects = new Map<string, Buffer>();
const existsCalls: string[] = [];
const downloadCalls: string[] = [];
const saves: Array<{ path: string; metadata?: Record<string, unknown> }> = [];

const bucket = {
  name: "fpe.appspot.com",
  file(path: string) {
    storageUse.files.push(path);
    return {
      async exists() {
        existsCalls.push(path);
        return [objects.has(path)] as [boolean];
      },
      async download() {
        downloadCalls.push(path);
        const data = objects.get(path);
        if (!data) throw new Error(`no such object: ${path}`);
        return [data] as [Buffer];
      },
      async save(
        _data: Buffer,
        options?: { metadata?: { metadata?: Record<string, unknown> } },
      ) {
        saves.push({ path, metadata: options?.metadata?.metadata });
      },
    };
  },
};

const handler = enhanceSketch as unknown as (
  req: unknown,
) => Promise<EnhanceSketchResponse>;

const call = (sketchStoragePath: unknown, over: Record<string, unknown> = {}) =>
  handler({
    auth: parent,
    data: { familyId: FAMILY, sketchStoragePath, ...over },
  });

/** Nothing was rewritten, no storage was reached, nothing was drawn or written. */
function expectNoWorkDone() {
  expect(rewriteForCopyright).not.toHaveBeenCalled();
  expect(suggestPromptAlternatives).not.toHaveBeenCalled();
  expect(storageUse).toEqual({ getStorage: 0, bucket: 0, files: [] });
  expect(existsCalls).toEqual([]);
  expect(downloadCalls).toEqual([]);
  expect(editImage).not.toHaveBeenCalled();
  expect(saves).toEqual([]);
  expect(usageWrites).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  storageUse.getStorage = 0;
  storageUse.bucket = 0;
  storageUse.files.length = 0;
  existsCalls.length = 0;
  downloadCalls.length = 0;
  saves.length = 0;
  usageWrites.length = 0;
  objects.clear();
  // Every path these tests name exists, including the other family's — the
  // boundary is the gate's job, not the bucket's.
  for (const path of [
    ...VALID_SOURCES,
    ...PERCENT_NAME_SOURCES,
    ...FOREIGN_SOURCES,
    ...MALFORMED_SOURCES,
    ...ENCODED_STRUCTURE_SOURCES,
  ]) {
    objects.set(path, Buffer.from("fake-source-bytes"));
  }
  objects.set(
    `families/${OTHER_FAMILY}/sketches/secret-drawing.png`,
    Buffer.from("another family's child's drawing"),
  );
});

// ── The gate ───────────────────────────────────────────────────────────────

describe("enhanceSketch refuses a source outside this family", () => {
  it.each(FOREIGN_SOURCES)("refuses %s", async (path) => {
    await expect(call(path, WORDS)).rejects.toThrow(/source image/i);
    expectNoWorkDone();
  });

  it("names the refusal permission-denied, not a 404", async () => {
    // A `not-found` would be the shape of the pre-gate behaviour on an absent
    // object, and it tells the caller whether another family's object exists.
    await expect(
      call(`families/${OTHER_FAMILY}/sketches/secret-drawing.png`),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("refuses the other family's object even though it EXISTS in the bucket", async () => {
    // The point of the whole gate: without it this call succeeds and hands back
    // a redraw of another family's child's drawing under a URL of our own.
    const foreign = `families/${OTHER_FAMILY}/sketches/secret-drawing.png`;
    expect(objects.has(foreign)).toBe(true);
    await expect(call(foreign, WORDS)).rejects.toThrow();
    expectNoWorkDone();
  });
});

describe("enhanceSketch refuses a source that is not a plain object path", () => {
  it.each(MALFORMED_SOURCES)("refuses %s", async (path) => {
    await expect(call(path, WORDS)).rejects.toThrow(/source image/i);
    expectNoWorkDone();
  });

  it("names a malformed path invalid-argument", async () => {
    await expect(
      call(`families/${FAMILY}/sketches/../../${OTHER_FAMILY}/x.png`),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  // Wrapped one-per-row: `it.each` SPREADS an array row into arguments, so a
  // bare `[]` case would arrive as no argument at all.
  it.each([[null], [123], [{}], [[]], [true]])(
    "refuses the non-string %s",
    async (path) => {
      await expect(call(path, WORDS)).rejects.toThrow();
      expectNoWorkDone();
    },
  );
});

describe("enhanceSketch refuses encoded path structure", () => {
  it.each(ENCODED_STRUCTURE_SOURCES)("refuses %s", async (path) => {
    await expect(call(path, WORDS)).rejects.toThrow(/source image/i);
    expectNoWorkDone();
  });

  it("names encoded structure invalid-argument", async () => {
    await expect(
      call(`families/${FAMILY}/sketches/%252e%252e/x.png`),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("decodes the validation copy only — the path to Storage is never rewritten", async () => {
    // A legitimate name that happens to contain an escape sequence must reach
    // the bucket byte-for-byte as the caller sent it: a decoded or normalized
    // path would look up an object that does not exist.
    const literal = `families/${FAMILY}/sketches/my%20drawing.png`;
    await call(literal);
    expect(storageUse.files[0]).toBe(literal);
    expect(existsCalls).toEqual([literal]);
    expect(downloadCalls).toEqual([literal]);
  });
});

describe("the rule itself, read directly", () => {
  // The callable tests above are the ones that matter; these pin the boundary
  // claim and the encoding rail at the level they are written.
  it("is an exact family-segment match, not a string prefix", () => {
    expect(checkSketchSourcePath(FAMILY, `families/${FAMILY}/sketches/a.png`)).toBe("ok");
    for (const lookalike of [`${FAMILY}-evil`, `${FAMILY}0`, `${FAMILY}x`, "fam", "FAM-1"]) {
      expect(checkSketchSourcePath(FAMILY, `families/${lookalike}/sketches/a.png`)).toBe(
        "outside-family",
      );
    }
  });

  it("allows any folder inside the family, and at least one object segment", () => {
    expect(checkSketchSourcePath(FAMILY, `families/${FAMILY}/anything-new/a.png`)).toBe("ok");
    expect(checkSketchSourcePath(FAMILY, `families/${FAMILY}/a/b/c/d/e.png`)).toBe("ok");
    expect(checkSketchSourcePath(FAMILY, `families/${FAMILY}/a.png`)).toBe("ok");
    expect(checkSketchSourcePath(FAMILY, `families/${FAMILY}`)).toBe("malformed");
    expect(checkSketchSourcePath(FAMILY, "families")).toBe("malformed");
  });

  it("separates another family from a shape that is not a path", () => {
    expect(checkSketchSourcePath(FAMILY, `families/${OTHER_FAMILY}/sketches/a.png`)).toBe(
      "outside-family",
    );
    expect(checkSketchSourcePath(FAMILY, `families/${FAMILY}/sketches/../../x/y.png`)).toBe(
      "malformed",
    );
  });

  it("keeps an ordinary percent and refuses encoded structure", () => {
    for (const name of ["100%.png", "50%off.png", "my%20drawing.png", "v%2e1.png", "%zz.png"]) {
      expect(checkSketchSourcePath(FAMILY, `families/${FAMILY}/sketches/${name}`)).toBe("ok");
    }
    for (const name of ["%2e", "%2e%2e", "%2E%2E", "%252e%252e", "%2e%2e%", "a%2fb", "a%5cb", "x%00"]) {
      expect(checkSketchSourcePath(FAMILY, `families/${FAMILY}/sketches/${name}`)).toBe(
        "malformed",
      );
    }
  });

  it("refuses a familyId that is not one safe segment", () => {
    // Belt and braces: the caller's uid is what reaches this today, but the
    // family prefix is BUILT from it, so a `..`, a slash or an encoded one
    // cannot be allowed to widen the boundary.
    for (const bad of ["", "..", ".", "fam/1", "fam\\1", "fam\u0000", "%2e%2e"]) {
      expect(checkSketchSourcePath(bad, `families/${bad}/sketches/a.png`)).toBe("malformed");
    }
  });
});

describe("the gate runs before any paid or privileged work", () => {
  it("rejects before the copyright rewriter is called", async () => {
    await expect(
      call(`families/${OTHER_FAMILY}/sketches/secret-drawing.png`, WORDS),
    ).rejects.toThrow();
    // Both fields would otherwise each cost a Claude call before Storage is
    // ever touched.
    expect(rewriteForCopyright).not.toHaveBeenCalled();
    expectNoWorkDone();
  });

  it("leaves the auth and family-identity gates ahead of it", async () => {
    // Unauthenticated — the auth guard answers first, whatever the source.
    await expect(
      handler({
        auth: null,
        data: { familyId: FAMILY, sketchStoragePath: VALID_SOURCES[0] },
      }),
    ).rejects.toThrow(/Authentication required/i);

    // An approved parent of a DIFFERENT family: the pre-existing identity gate
    // still answers, so its message is unchanged even though the source is a
    // perfectly valid path in the family being named.
    await expect(
      handler({
        auth: { uid: OTHER_FAMILY, token: { email: "nathan.xb9753@gmail.com" } },
        data: { familyId: FAMILY, sketchStoragePath: VALID_SOURCES[0] },
      }),
    ).rejects.toThrow(/do not have access to this family/i);

    // A signed-in address that is not on the allowlist is still refused by the
    // allowlist, not by the source gate (allowlist behaviour unchanged).
    await expect(
      handler({
        auth: { uid: FAMILY, token: { email: "stranger@example.com" } },
        data: { familyId: FAMILY, sketchStoragePath: VALID_SOURCES[0] },
      }),
    ).rejects.toThrow(/not approved/i);

    expectNoWorkDone();
  });

  it("still refuses a missing family-scoped object with not-found", async () => {
    // The pre-gate behaviour for a path that is legitimate but absent must not
    // change — this is the sticker whose object was deleted, not an attack.
    const absent = `families/${FAMILY}/sketches/deleted.png`;
    objects.delete(absent);
    await expect(call(absent)).rejects.toMatchObject({ code: "not-found" });
    expect(existsCalls).toEqual([absent]);
    expect(downloadCalls).toEqual([]);
    expect(editImage).not.toHaveBeenCalled();
  });
});

// ── What must still work ───────────────────────────────────────────────────

describe("enhanceSketch still enhances every source its callers produce", () => {
  it.each([...VALID_SOURCES, ...PERCENT_NAME_SOURCES])("accepts %s", async (path) => {
    const result = await call(path, { style: "storybook" });

    expect(result.url).toContain("https://firebasestorage.googleapis.com/");
    expect(result.storagePath).toMatch(
      new RegExp(`^families/${FAMILY}/sketches/.+_enhanced\\.png$`),
    );
    // The source really was read, byte-for-byte as sent, and really was drawn from.
    expect(storageUse).toMatchObject({ getStorage: 1, bucket: 1 });
    expect(storageUse.files[0]).toBe(path);
    expect(existsCalls).toEqual([path]);
    expect(downloadCalls).toEqual([path]);
    expect(editImage).toHaveBeenCalledTimes(1);
    // And the save path is unchanged by this run's change: still this family's
    // own `sketches/` tree, stamped with the source it came from.
    expect(saves).toHaveLength(1);
    expect(saves[0]?.metadata?.sourceSketch).toBe(path);
    expect(usageWrites).toHaveLength(1);
    expect(usageWrites[0]?.path).toBe(`families/${FAMILY}/aiUsage`);
  });

  it("accepts a saved sticker as the source, which is what the version flow sends", async () => {
    // `generateStickerVersion` passes `source.storagePath` straight through, so
    // a sticker made from a `generateImage` result and one uploaded by hand are
    // both legitimate sources for a new version.
    for (const path of [
      `families/${FAMILY}/generated-images/2026-10-03T12-00-00-000Z_sticker.png`,
      `families/${FAMILY}/stickers/upload_2026-10-03T12-00-00-000Z.png`,
    ]) {
      const result = await call(path, { transparent: true, customNote: "give him a cape" });
      expect(result.url).toContain("token=");
    }
    expect(editImage).toHaveBeenCalledTimes(2);
  });

  it("passes the caption and note through the rewriter exactly as before", async () => {
    await call(VALID_SOURCES[0], {
      caption: "my dragon drawing",
      customNote: "put her in a space suit",
    });
    expect(rewriteForCopyright).toHaveBeenCalledWith(
      "my dragon drawing",
      "sketch",
      "test-claude-key",
    );
    expect(rewriteForCopyright).toHaveBeenCalledWith(
      "put her in a space suit",
      "sketch",
      "test-claude-key",
    );
  });
});
