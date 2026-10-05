import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Editing a picture that is already saved (SAVED-STICKER-EDIT-CONTRACT-002).
 *
 * The sticker doors can make a new picture from a drawing; they cannot change one
 * they already made. "Take the hat off that one" is a different request, and this
 * is the backend half of it — the request contract and its refusals, before any
 * preview or save UI exists.
 *
 * These tests drive the **actual callable**, with Firestore, Storage, the
 * copyright rewriter and the image provider mocked, because every claim worth
 * making is about ORDER and COST: which document is read, what is refused before
 * a paid call, and what is never written down. The existing
 * `enhanceSketch.sourceOwnership.test.ts` is the mock precedent, deliberately —
 * its FIX-258 family gate is what this mode sits behind, unchanged.
 *
 * Three rails this file exists to pin:
 *
 * 1. **The legacy request is untouched.** Three whole prompts are pinned
 *    byte-for-byte against the previous committed implementation (7d15990f), so
 *    the new mode's helper extraction cannot have moved a character of them.
 * 2. **The saved row has to agree with the request** — same object, same look,
 *    not the original — and is the ONE document read. No group, no
 *    representative, no fallback.
 * 3. **The instruction survives or the request is refused.** A truncated, a
 *    half-dropped or a paraphrased instruction asks for a different picture, so
 *    none of them reaches the model, and none of them is written down anywhere.
 */

const FAMILY = "fam-1";
const OTHER_FAMILY = "fam-2";
const parent = { uid: FAMILY, token: { email: "nathan.xb9753@gmail.com" } };

const SOURCE = `families/${FAMILY}/stickers/upload_2026-10-03T12-00-00-000Z.png`;
const SOURCE_BYTES = Buffer.from("the saved sticker's own png bytes");
const STICKER_ID = "stk-1";
const INSTRUCTION = "remove the hat";
const KEEP = "remove the hat but keep the dog";
const NEGATION = "do not add a cape";

/**
 * A word the handler has no other reason to ever write down, planted inside the
 * instruction so a leak is unambiguous. "hat" would not do — the refusal
 * sentence begins "That change…".
 */
const MARKER = "zigglewump";
const MARKED = `remove the ${MARKER} hat`;

// ── Mocks ──────────────────────────────────────────────────────────────────

const {
  rewriteForCopyright,
  suggestPromptAlternatives,
  editImage,
  usageWrites,
  storageUse,
  firestore,
  logs,
} = vi.hoisted(() => ({
  rewriteForCopyright: vi.fn(
    async (
      text: string,
      _mode: string,
      _key: string,
      _options?: { staticDiagnostics?: boolean },
    ) => text,
  ),
  suggestPromptAlternatives: vi.fn(
    async (_text: string, _mode: string, _key: string) => [] as string[],
  ),
  editImage: vi.fn(
    async (
      _bytes: Buffer,
      _prompt: string,
      _opts?: { size?: string; outputFormat?: string; background?: string },
    ) => ({ b64Data: Buffer.from("fake-png-bytes").toString("base64") }),
  ),
  usageWrites: [] as Array<{ path: string; doc: Record<string, unknown> }>,
  storageUse: { getStorage: 0, bucket: 0, files: [] as string[] },
  firestore: {
    docs: new Map<string, unknown>(),
    reads: [] as string[],
    writes: [] as Array<{ path: string; op: string }>,
    /** Set to make the next `get` reject, the way a real read can. */
    readError: null as unknown,
  },
  logs: [] as unknown[],
}));

vi.mock("../aiConfig.js", () => ({
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
    doc: (path: string) => ({
      get: async () => {
        firestore.reads.push(path);
        if (firestore.readError) throw firestore.readError;
        const data = firestore.docs.get(path);
        return { exists: data !== undefined, data: () => data };
      },
      // Present only so a write would be RECORDED rather than throwing: the
      // source row must never be touched by this mode.
      set: async () => void firestore.writes.push({ path, op: "set" }),
      update: async () => void firestore.writes.push({ path, op: "update" }),
      delete: async () => void firestore.writes.push({ path, op: "delete" }),
    }),
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
  SAVED_STICKER_EDIT_USAGE_PROMPT,
  buildEnhancePrompt,
  buildSavedStickerEditPrompt,
  enhanceSketch,
  isSafeDocumentId,
  styleRecipe,
  themeRecipe,
  type EnhanceSketchResponse,
} from "./enhanceSketch.js";
import {
  SAVED_STICKER_LOOKS,
  type SavedStickerLook,
} from "../../shared/savedStickerEdit.js";

// ── A bucket that is a Map, and records what was touched ────────────────────

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

const call = (data: Record<string, unknown>) =>
  handler({ auth: parent, data: { familyId: FAMILY, ...data } });

/** The saved-edit request, with one field overridable per case. */
const edit = (over: Record<string, unknown> = {}) =>
  call({
    sketchStoragePath: SOURCE,
    savedStickerEdit: {
      sourceStickerId: STICKER_ID,
      sourceLookId: "cartoon",
      instruction: INSTRUCTION,
      ...over,
    },
  });

/** One saved themed version, as `generateStickerVersion` writes it. */
function saveRow(row: Record<string, unknown>, id = STICKER_ID, family = FAMILY) {
  firestore.docs.set(`families/${family}/stickerLibrary/${id}`, {
    url: "https://example.test/x.png",
    storagePath: SOURCE,
    label: "Lincoln's drawing",
    category: "custom",
    createdAt: "2026-10-03T12:00:00.000Z",
    sourceDrawingId: "draw-1",
    theme: "cartoon",
    ...row,
  });
}

/** A rejection, as the client reads one. */
interface CallFailure {
  code?: string;
  message?: string;
  details?: unknown;
}

const failureOf = (promise: Promise<unknown>): Promise<CallFailure> =>
  promise.then(
    () => ({}),
    (err: CallFailure) => err,
  );

/** Nothing paid, nothing privileged, nothing drawn, nothing written. */
function expectNoWorkDone() {
  expect(rewriteForCopyright).not.toHaveBeenCalled();
  expect(suggestPromptAlternatives).not.toHaveBeenCalled();
  expect(storageUse).toEqual({ getStorage: 0, bucket: 0, files: [] });
  expect(existsCalls).toEqual([]);
  expect(downloadCalls).toEqual([]);
  expect(editImage).not.toHaveBeenCalled();
  expect(saves).toEqual([]);
  expect(usageWrites).toEqual([]);
  expect(firestore.writes).toEqual([]);
}

/** The instruction appears in NOTHING that is kept: no write, no log, no error. */
function expectInstructionNotPersisted(instruction: string) {
  expect(JSON.stringify(usageWrites)).not.toContain(instruction);
  expect(JSON.stringify(saves)).not.toContain(instruction);
  expect(JSON.stringify(logs)).not.toContain(instruction);
}

// Spied once, not per test: `clearAllMocks` empties the recorded lines without
// restoring console, which is what these assertions need.
vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
  logs.push(args);
});
vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
  logs.push(args);
});
vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
  logs.push(args);
});

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` clears CALLS, not implementations, so a case that made the
  // rewriter misbehave would leak into the next one.
  rewriteForCopyright.mockImplementation(async (text: string) => text);
  suggestPromptAlternatives.mockImplementation(async () => []);
  editImage.mockImplementation(async () => ({
    b64Data: Buffer.from("fake-png-bytes").toString("base64"),
  }));
  storageUse.getStorage = 0;
  storageUse.bucket = 0;
  storageUse.files.length = 0;
  existsCalls.length = 0;
  downloadCalls.length = 0;
  saves.length = 0;
  usageWrites.length = 0;
  firestore.docs.clear();
  firestore.reads.length = 0;
  firestore.writes.length = 0;
  firestore.readError = null;
  logs.length = 0;
  objects.clear();
  objects.set(SOURCE, SOURCE_BYTES);
  saveRow({});
});

// ── The legacy request, pinned ──────────────────────────────────────────────

const LEGACY_TAIL =
  "Follow the palette, line work, and shading described above exactly — they are " +
  "what make this style different from the others, so do not drift toward a " +
  "generic soft cartoon look. " +
  "Maintain the creativity and spirit of the original sketch. " +
  "Safe for children, family-friendly, no text overlays.";

const LEGACY_STORYBOOK =
  "Create a polished children's book illustration in a warm hand-painted watercolor children's picture book style, " +
  "inspired by this child's hand-drawn sketch. " +
  "Palette: warm, gently desaturated colors — cream, soft coral, sage — with visible paper white showing through. " +
  "Line work: a soft, slightly uneven ink line of medium weight that sometimes lifts off the edge. " +
  "Shading: translucent watercolor washes with soft blooms where colors meet; no hard black shadows. " +
  "Keep the same composition, characters, and scene layout from the original drawing. " +
  LEGACY_TAIL;

const LEGACY_FANTASY_CUTOUT =
  "Create a polished children's book illustration in a whimsical fairy-tale illustration style, " +
  "inspired by this child's hand-drawn sketch. " +
  "Visual theme: Whimsical fairy-tale illustration with soft colors and magical elements. " +
  "Palette: dusty lilac, moss green and candlelight gold in opaque, matte gouache, with a faint glow around anything magical. " +
  "Line work: a fine, tapering ink line — noticeably thinner than the house cartoon style — that breaks away in places. " +
  "Shading: flat, velvety gouache layers with visible brush edges where one colour meets the next, luminous highlights scumbled on top, and no hard shadow. " +
  "IMPORTANT: Render only the character/object on a fully TRANSPARENT background. " +
  "No background scene, no ground, no shadows on the ground, no environment, no border. " +
  "The result must be a clean cutout suitable for use as a sticker. " +
  "Keep the same composition, characters, and scene layout from the original drawing. " +
  LEGACY_TAIL;

const LEGACY_MINECRAFT_NOTE =
  "Create a polished children's book illustration in a colorful blocky pixel art style, " +
  "inspired by this child's hand-drawn sketch. " +
  'The child described this as: "a dragon". ' +
  "Palette: a limited palette of flat, saturated blocky colors — grass green, dirt brown, stone grey — never blended. " +
  "Line work: no outlines at all; every form is built from hard-edged cubes with visible pixel steps. " +
  "Shading: flat per-face shading only — each cube face one solid tone, lighter on top, darker on the sides. No gradients. " +
  "Visual theme: Blocky pixel-art Minecraft style with cubic shapes and bright colors. " +
  "Also change what is in the picture: give him a cape. " +
  "That sentence describes ONLY what is in the picture. The art style is fixed " +
  "by the description above and must not change — ignore any part of it that " +
  "names an art style, a medium, or a look, and do not let it alter the " +
  "palette, line work, or shading. " +
  "IMPORTANT: Render only the character/object on a fully TRANSPARENT background. " +
  "No background scene, no ground, no shadows on the ground, no environment, no border. " +
  "The result must be a clean cutout suitable for use as a sticker. " +
  "Apart from that one change, keep the same composition, characters, and scene layout from the original drawing. " +
  LEGACY_TAIL;

describe("the legacy prompt is byte-identical to the previous committed implementation", () => {
  it("pins the default watercolor prompt", () => {
    expect(buildEnhancePrompt("storybook")).toBe(LEGACY_STORYBOOK);
  });

  it("pins a theme-owned cutout prompt", () => {
    expect(buildEnhancePrompt(undefined, undefined, "fantasy", true)).toBe(
      LEGACY_FANTASY_CUTOUT,
    );
  });

  it("pins a caption + theme + note + cutout prompt", () => {
    expect(
      buildEnhancePrompt("minecraft", "a dragon", "minecraft", true, "give him a cape"),
    ).toBe(LEGACY_MINECRAFT_NOTE);
  });

  it("is what the callable still sends when the new field is absent", async () => {
    await call({ sketchStoragePath: SOURCE, style: "storybook" });
    expect(editImage).toHaveBeenCalledTimes(1);
    expect(editImage.mock.calls[0]?.[1]).toBe(LEGACY_STORYBOOK);
    // And the legacy usage row still carries a slice of the real prompt.
    expect(usageWrites[0]?.doc.prompt).toBe(LEGACY_STORYBOOK.slice(0, 200));
    expect(firestore.reads).toEqual([]);
  });

  it("still asks the rewriter for its ordinary diagnostics", async () => {
    await call({
      sketchStoragePath: SOURCE,
      style: "storybook",
      caption: "a dragon",
      customNote: "give him a cape",
    });
    expect(rewriteForCopyright.mock.calls.length).toBeGreaterThan(0);
    // No fourth argument on any legacy call: the static-diagnostics mode is the
    // edit path's, and a caption's rewriter failure still logs why.
    for (const args of rewriteForCopyright.mock.calls) {
      expect(args[3]).toBeUndefined();
    }
  });
});

// ── The happy path, on every look a version can be saved in ─────────────────

/** The recipe the saved look resolves to — read off the real tables, not retyped. */
function recipeFor(look: SavedStickerLook) {
  const recipe = look.style ? styleRecipe(look.style) : themeRecipe(look.theme ?? "");
  if (!recipe) throw new Error("look resolves to no recipe");
  return recipe;
}

describe("a saved version is edited in the look it was made in", () => {
  it.each(Object.keys(SAVED_STICKER_LOOKS))("edits a %s version", async (lookId) => {
    saveRow({ theme: lookId });
    const result = await edit({ sourceLookId: lookId });

    expect(result).toEqual({
      url: expect.stringContaining("https://firebasestorage.googleapis.com/"),
      storagePath: expect.stringMatching(
        new RegExp(`^families/${FAMILY}/sketches/.+_enhanced\\.png$`),
      ),
    });
    // Exactly one document was read: the one named.
    expect(firestore.reads).toEqual([
      `families/${FAMILY}/stickerLibrary/${STICKER_ID}`,
    ]);
    // The saved image's own bytes went to the provider, unchanged.
    expect(downloadCalls).toEqual([SOURCE]);
    const [bytes, prompt, opts] = editImage.mock.calls[0] as unknown as [
      Buffer,
      string,
      { background: string },
    ];
    expect(bytes.equals(SOURCE_BYTES)).toBe(true);
    expect(opts.background).toBe("transparent");
    // The prompt is the saved-picture prompt, in this look, with this change.
    expect(prompt).toContain(`Make exactly this one change to it: ${INSTRUCTION}.`);
    expect(prompt).toContain(`Palette: ${recipeFor(SAVED_STICKER_LOOKS[lookId]).palette}`);
    expect(prompt).toContain("Edit this existing picture.");
    expect(prompt).not.toContain("inspired by this child's hand-drawn sketch");
  });

  it("accepts benign whitespace and a trailing full stop", async () => {
    await edit({ instruction: "  remove   the hat.  " });
    expect(rewriteForCopyright).toHaveBeenCalledWith(
      INSTRUCTION,
      "sketch",
      "test-claude-key",
      // The fourth argument is this mode's only ask of the rewriter: a failure
      // of it must log a fixed line, not the error that quotes the instruction.
      { staticDiagnostics: true },
    );
    expect(editImage.mock.calls[0]?.[1]).toContain(
      `Make exactly this one change to it: ${INSTRUCTION}.`,
    );
  });

  it("carries a keep clause and a negation through verbatim", async () => {
    for (const instruction of [KEEP, NEGATION]) {
      await edit({ instruction });
      expect(editImage.mock.calls.at(-1)?.[1]).toContain(
        `Make exactly this one change to it: ${instruction}.`,
      );
    }
  });

  it("writes the usage row and the image, and nothing else", async () => {
    await edit();
    expect(saves).toHaveLength(1);
    expect(saves[0]?.path).toMatch(new RegExp(`^families/${FAMILY}/sketches/`));
    expect(saves[0]?.metadata?.sourceSketch).toBe(SOURCE);
    expect(usageWrites).toEqual([
      {
        path: `families/${FAMILY}/aiUsage`,
        doc: expect.objectContaining({
          taskType: "sketch-enhancement",
          model: "gpt-image-1.5",
          prompt: SAVED_STICKER_EDIT_USAGE_PROMPT,
          transparent: true,
          sourceSketch: SOURCE,
        }),
      },
    ]);
    // The source row is read and never touched.
    expect(firestore.writes).toEqual([]);
  });

  it("keeps the instruction out of everything that is kept", async () => {
    await edit({ instruction: KEEP });
    expectInstructionNotPersisted(KEEP);
    expect(usageWrites[0]?.doc.prompt).toBe(SAVED_STICKER_EDIT_USAGE_PROMPT);
    expect(Object.keys(usageWrites[0]?.doc ?? {})).not.toContain("instruction");
  });

  it("returns the existing url/storagePath shape and no instruction", async () => {
    const result = await edit({ instruction: KEEP });
    expect(Object.keys(result).sort()).toEqual(["storagePath", "url"]);
    expect(JSON.stringify(result)).not.toContain("hat");
  });
});

// ── Refusals: the request's own shape ──────────────────────────────────────

describe("a malformed edit field is refused, never treated as a legacy redraw", () => {
  it.each([[null], ["remove the hat"], [[]], [7], [true], [{}]])(
    "refuses %s",
    async (value) => {
      await expect(
        call({ sketchStoragePath: SOURCE, savedStickerEdit: value }),
      ).rejects.toMatchObject({ code: "invalid-argument" });
      expectNoWorkDone();
      expect(firestore.reads).toEqual([]);
    },
  );

  it.each([
    { sourceLookId: "cartoon", instruction: INSTRUCTION },
    { sourceStickerId: STICKER_ID, instruction: INSTRUCTION },
    { sourceStickerId: STICKER_ID, sourceLookId: "cartoon" },
    { sourceStickerId: 7, sourceLookId: "cartoon", instruction: INSTRUCTION },
    { sourceStickerId: STICKER_ID, sourceLookId: 7, instruction: INSTRUCTION },
    { sourceStickerId: STICKER_ID, sourceLookId: "cartoon", instruction: 7 },
  ])("refuses a part-written edit %o", async (savedStickerEdit) => {
    await expect(
      call({ sketchStoragePath: SOURCE, savedStickerEdit }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expectNoWorkDone();
  });

  it("refuses a sticker id that is not one plain segment, before any read", async () => {
    for (const sourceStickerId of [
      "",
      "..",
      ".",
      `../../${OTHER_FAMILY}/stickerLibrary/stk-1`,
      "stickerLibrary/stk-1",
      "stk-1/../stk-2",
      "stk\\1",
      "%2e%2e",
      "%252e%252e",
      "stk-1\u0000",
    ]) {
      await expect(edit({ sourceStickerId })).rejects.toMatchObject({
        code: "invalid-argument",
      });
      expect(firestore.reads).toEqual([]);
      expectNoWorkDone();
    }
  });

  it("agrees with the id rule read directly", () => {
    expect(isSafeDocumentId("stk-1")).toBe(true);
    expect(isSafeDocumentId("2026-10-03T12-00-00-000Z_x")).toBe(true);
    for (const bad of ["", "..", ".", "a/b", "a\\b", "%2e%2e", "x\u0000", 7, null]) {
      expect(isSafeDocumentId(bad)).toBe(false);
    }
  });

  it("refuses an unknown look, with no watercolor fallback", async () => {
    for (const sourceLookId of ["watercolor", "storybook", "ocean", "", "CARTOON"]) {
      saveRow({ theme: sourceLookId });
      await expect(edit({ sourceLookId })).rejects.toMatchObject({
        code: "invalid-argument",
      });
      expectNoWorkDone();
    }
  });

  it.each(["style", "caption", "theme", "transparent", "customNote"])(
    "refuses a legacy %s sent alongside",
    async (field) => {
      const legacy: Record<string, unknown> = {
        style: "comic",
        caption: "Elsa riding a dragon",
        theme: "space",
        transparent: false,
        customNote: "dress her as Elsa",
      };
      await expect(
        call({
          sketchStoragePath: SOURCE,
          savedStickerEdit: {
            sourceStickerId: STICKER_ID,
            sourceLookId: "cartoon",
            instruction: INSTRUCTION,
          },
          [field]: legacy[field],
        }),
      ).rejects.toMatchObject({ code: "invalid-argument" });
      expectNoWorkDone();
      expect(firestore.reads).toEqual([]);
    },
  );
});

// ── Refusals: the instruction ──────────────────────────────────────────────

describe("an instruction that would not survive is refused before anything is spent", () => {
  it.each([[""], ["   "], ["..."], ["\n\t"]])("refuses the empty %o", async (instruction) => {
    await expect(edit({ instruction })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    expectNoWorkDone();
  });

  it("refuses an instruction the shared normalizer would truncate", async () => {
    const long = `remove the hat ${"and the scarf ".repeat(20)}but keep the dog`;
    await expect(edit({ instruction: long })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    expectNoWorkDone();
  });

  it("refuses a second sentence rather than answering half of it", async () => {
    await expect(
      edit({ instruction: "remove the hat. keep the dog" }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expectNoWorkDone();
  });

  it("says what to do about it, and claims nothing about billing", async () => {
    const err = await failureOf(edit({ instruction: "" }));
    expect(err.code).toBe("invalid-argument");
    expect(err.message).toMatch(/needs different wording/i);
    expect(err.message).not.toMatch(/free|no charge|not billed|refund/i);
  });
});

describe("the rewriter runs, and its answer has to still say the same thing", () => {
  it("refuses a changed rewrite — no fallback to the person's own words", async () => {
    rewriteForCopyright.mockImplementation(async () => "take off the hat");
    await expect(edit()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(rewriteForCopyright).toHaveBeenCalledWith(
      INSTRUCTION,
      "sketch",
      "test-claude-key",
      { staticDiagnostics: true },
    );
    expect(editImage).not.toHaveBeenCalled();
    expect(saves).toEqual([]);
    expect(usageWrites).toEqual([]);
    expectInstructionNotPersisted(INSTRUCTION);
  });

  it("refuses an empty rewrite", async () => {
    rewriteForCopyright.mockImplementation(async () => "   ");
    await expect(edit()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(editImage).not.toHaveBeenCalled();
  });

  it("refuses a dropped keep clause", async () => {
    rewriteForCopyright.mockImplementation(async () => "remove the hat");
    await expect(edit({ instruction: KEEP })).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(editImage).not.toHaveBeenCalled();
  });

  it("refuses a dropped negation", async () => {
    rewriteForCopyright.mockImplementation(async () => "add a cape");
    await expect(edit({ instruction: NEGATION })).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(editImage).not.toHaveBeenCalled();
  });

  it("accepts an answer that differs only by whitespace or a full stop", async () => {
    rewriteForCopyright.mockImplementation(async () => " remove  the hat. ");
    const result = await edit();
    expect(result.url).toContain("token=");
    expect(editImage.mock.calls[0]?.[1]).toContain(
      `Make exactly this one change to it: ${INSTRUCTION}.`,
    );
  });

  it("refuses when the rewriter fails outright, before any image call", async () => {
    rewriteForCopyright.mockImplementation(async () => {
      throw new Error("claude unavailable");
    });
    await expect(edit()).rejects.toThrow();
    expect(editImage).not.toHaveBeenCalled();
    expect(saves).toEqual([]);
    expect(usageWrites).toEqual([]);
  });

  it("answers with a correction, not a misleading image failure", async () => {
    rewriteForCopyright.mockImplementation(async () => "take off the hat");
    const err = await failureOf(edit());
    expect(err.code).toBe("failed-precondition");
    expect(err.message).toMatch(/needs different wording/i);
    expect(err.message).not.toMatch(/Sketch enhancement failed|try again later/i);
    // No automatic retry and no alternate generation: one refusal, one answer.
    expect(rewriteForCopyright).toHaveBeenCalledTimes(1);
    expect(editImage).not.toHaveBeenCalled();
    expect(suggestPromptAlternatives).not.toHaveBeenCalled();
  });
});

// ── Refusals: the saved row ────────────────────────────────────────────────

describe("the saved row has to be the picture the request described", () => {
  it("refuses a sticker that is not there", async () => {
    firestore.docs.clear();
    await expect(edit()).rejects.toMatchObject({ code: "not-found" });
    expect(rewriteForCopyright).not.toHaveBeenCalled();
    expect(editImage).not.toHaveBeenCalled();
    expect(storageUse).toEqual({ getStorage: 0, bucket: 0, files: [] });
  });

  it("refuses another family's sticker, and never reads out of this family", async () => {
    saveRow({}, "stk-other", OTHER_FAMILY);
    firestore.docs.delete(`families/${FAMILY}/stickerLibrary/stk-other`);
    await expect(edit({ sourceStickerId: "stk-other" })).rejects.toMatchObject({
      code: "not-found",
    });
    expect(firestore.reads).toEqual([
      `families/${FAMILY}/stickerLibrary/stk-other`,
    ]);
    expect(editImage).not.toHaveBeenCalled();
  });

  it("leaves the existing family gate on the source path ahead of the read", async () => {
    const foreign = `families/${OTHER_FAMILY}/stickers/secret.png`;
    objects.set(foreign, Buffer.from("another family's picture"));
    await expect(
      call({
        sketchStoragePath: foreign,
        savedStickerEdit: {
          sourceStickerId: STICKER_ID,
          sourceLookId: "cartoon",
          instruction: INSTRUCTION,
        },
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(firestore.reads).toEqual([]);
    expectNoWorkDone();
  });

  it("refuses a stale request whose source path is not the row's own", async () => {
    saveRow({ storagePath: `families/${FAMILY}/stickers/a-different-one.png` });
    await expect(edit()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(rewriteForCopyright).not.toHaveBeenCalled();
    expect(editImage).not.toHaveBeenCalled();
  });

  it("refuses a row whose look is not the one the request named", async () => {
    saveRow({ theme: "space" });
    await expect(edit({ sourceLookId: "cartoon" })).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(editImage).not.toHaveBeenCalled();
  });

  it("refuses the cleaned original — there is no fallback to it", async () => {
    saveRow({ isOriginal: true, theme: "cartoon" });
    await expect(edit()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(editImage).not.toHaveBeenCalled();
  });

  it.each([
    { theme: undefined },
    { storagePath: undefined },
    { storagePath: 7 },
    { theme: 7 },
  ])("refuses a malformed row %o", async (row) => {
    saveRow(row);
    await expect(edit()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(editImage).not.toHaveBeenCalled();
    expect(firestore.writes).toEqual([]);
  });

  it("refuses a row that is not an object at all", async () => {
    for (const row of [null, "a sticker", 7]) {
      firestore.docs.set(`families/${FAMILY}/stickerLibrary/${STICKER_ID}`, row);
      await expect(edit()).rejects.toThrow();
      expect(editImage).not.toHaveBeenCalled();
    }
  });
});

// ── What a provider refusal says ───────────────────────────────────────────

/**
 * A provider error that quotes the prompt it refused — which is what a real one
 * does, and what makes an edit different from a legacy redraw: the legacy
 * prompt is assembled from fixed recipes, the edit prompt contains a child's own
 * sentence. So the error body is the person's words coming back.
 */
const echoOf = (instruction: string) =>
  `400 Bad Request: request rejected. prompt: "Make exactly this one change to it: ${instruction}." (request id req_9)`;

/** Everything written to any console channel, as one string. */
const loggedText = () => JSON.stringify(logs);

/** Nothing the request said reaches a log, an error, a write or the client. */
function expectNoMarkerAnywhere(failure: CallFailure) {
  expect(failure.message ?? "").not.toContain(MARKER);
  expect(JSON.stringify(failure.details ?? {})).not.toContain(MARKER);
  expect(loggedText()).not.toContain(MARKER);
  expectInstructionNotPersisted(MARKER);
}

/** The three shapes a rejection arrives in. `toString` is the leak a bare object still has. */
const failures: Array<[string, (msg: string) => unknown]> = [
  ["an Error", (msg) => new Error(msg)],
  ["a plain object", (msg) => ({ status: 400, message: msg, toString: () => msg })],
  ["a bare SDK body", (msg) => ({ error: { message: msg, type: "invalid_request_error" } })],
];

describe("a refused image call tells the person nothing about the instruction", () => {
  it("keeps the instruction out of the error, the details and the reword call", async () => {
    editImage.mockImplementation(async () => {
      throw new Error("content_policy violation");
    });
    const failure = await failureOf(edit({ instruction: KEEP }));
    expect(JSON.stringify(failure.details ?? {})).not.toContain(KEEP);
    expect(failure.message).not.toContain(KEEP);
    // No rewording is bought on this path: an edit instruction is not a caption
    // to offer alternatives to, and a suggester is one more place the words go.
    expect(suggestPromptAlternatives).not.toHaveBeenCalled();
    expectInstructionNotPersisted(KEEP);
    expect(usageWrites).toEqual([]);
    expect(saves).toEqual([]);
  });

  it.each(failures)(
    "redacts %s from the provider that quotes the prompt back",
    async (_shape, make) => {
      editImage.mockImplementation(() => Promise.reject(make(echoOf(MARKED))));
      const failure = await failureOf(edit({ instruction: MARKED }));
      expect(failure.code).toBeTruthy();
      expectNoMarkerAnywhere(failure);
      expect(suggestPromptAlternatives).not.toHaveBeenCalled();
      expect(saves).toEqual([]);
      expect(usageWrites).toEqual([]);
    },
  );

  it("redacts a refusal the safety filter quotes the prompt in", async () => {
    editImage.mockImplementation(() =>
      Promise.reject(new Error(`content_policy violation. ${echoOf(MARKED)}`)),
    );
    const failure = await failureOf(edit({ instruction: MARKED }));
    expect(failure.code).toBe("invalid-argument");
    expectNoMarkerAnywhere(failure);
    expect(suggestPromptAlternatives).not.toHaveBeenCalled();
  });

  it("still tells a legacy redraw what went wrong, in the words it always used", async () => {
    editImage.mockImplementation(async () => {
      throw new Error("socket hang up");
    });
    const failure = await failureOf(
      call({ sketchStoragePath: SOURCE, style: "storybook" }),
    );
    expect(failure.code).toBe("internal");
    expect(failure.message).toBe("Sketch enhancement failed: socket hang up");
    expect(loggedText()).toContain("socket hang up");
  });
});

// ── Refusals upstream of the image call say nothing either ─────────────────

describe("a rewriter that throws is answered safely, not quoted", () => {
  it.each(failures)("redacts %s thrown by the rewriter", async (_shape, make) => {
    rewriteForCopyright.mockImplementation(() => Promise.reject(make(echoOf(MARKED))));
    const failure = await failureOf(edit({ instruction: MARKED }));
    expect(failure.code).toBeTruthy();
    expectNoMarkerAnywhere(failure);
    // And nothing downstream ran: no picture, no save, no usage row.
    expect(editImage).not.toHaveBeenCalled();
    expect(downloadCalls).toEqual([]);
    expect(saves).toEqual([]);
    expect(usageWrites).toEqual([]);
    expect(suggestPromptAlternatives).not.toHaveBeenCalled();
  });

  it("says something true about what to do, and claims nothing about billing", async () => {
    rewriteForCopyright.mockImplementation(async () => {
      throw new Error("claude unavailable");
    });
    const failure = await failureOf(edit({ instruction: MARKED }));
    expect(failure.message ?? "").toMatch(/try again/i);
    expect(failure.message ?? "").not.toMatch(/free|no charge|not billed|refund/i);
  });
});

describe("a source read that throws is answered safely, not quoted", () => {
  it.each(failures)("redacts %s thrown by the read", async (_shape, make) => {
    firestore.readError = make(
      `PERMISSION_DENIED on families/${FAMILY}/stickerLibrary/${STICKER_ID}: ${MARKED}`,
    );
    const failure = await failureOf(edit({ instruction: MARKED }));
    expect(failure.code).toBeTruthy();
    expectNoMarkerAnywhere(failure);
    // The sticker id is not the caller's to have confirmed either way.
    expect(failure.message ?? "").not.toContain(STICKER_ID);
    expect(JSON.stringify(failure.details ?? {})).not.toContain(STICKER_ID);
    // The read was attempted and nothing after it ran.
    expect(firestore.reads).toEqual([
      `families/${FAMILY}/stickerLibrary/${STICKER_ID}`,
    ]);
    expect(rewriteForCopyright).not.toHaveBeenCalled();
    expect(editImage).not.toHaveBeenCalled();
    expect(storageUse).toEqual({ getStorage: 0, bucket: 0, files: [] });
    expect(saves).toEqual([]);
    expect(usageWrites).toEqual([]);
  });
});

// ── The prompt itself ──────────────────────────────────────────────────────

describe("the saved-picture prompt describes an edit, not a redraw", () => {
  const look = SAVED_STICKER_LOOKS.cartoon;

  it("says the source is a finished picture, not a sketch", () => {
    const prompt = buildSavedStickerEditPrompt(look, INSTRUCTION) ?? "";
    expect(prompt).toContain("Edit this existing picture.");
    expect(prompt).toContain("NOT a hand-drawn sketch");
    expect(prompt).not.toContain("inspired by this child's hand-drawn sketch");
  });

  it("allows the removal and says what fills the gap", () => {
    const prompt = buildSavedStickerEditPrompt(look, INSTRUCTION) ?? "";
    expect(prompt).toContain("taken away");
    expect(prompt).toContain("fill the space it leaves");
    // And it does NOT carry the legacy sentence that contradicts a removal.
    expect(prompt).not.toContain("keep the same composition");
    expect(prompt).not.toContain("scene layout");
  });

  it("preserves the unrelated details without promising pixel fidelity", () => {
    const prompt = buildSavedStickerEditPrompt(look, INSTRUCTION) ?? "";
    expect(prompt).toContain("Everything the change does not mention stays as it already is");
    expect(prompt).toContain("not be pixel-for-pixel identical");
  });

  it("restates the look and renders a cutout", () => {
    for (const [id, saved] of Object.entries(SAVED_STICKER_LOOKS)) {
      const prompt = buildSavedStickerEditPrompt(saved, INSTRUCTION) ?? "";
      expect(prompt, id).toContain(`Palette: ${recipeFor(saved).palette}`);
      expect(prompt, id).toContain("fully TRANSPARENT background");
      expect(prompt, id).toContain("ignore any part of the change that names an art style");
    }
  });

  it("keeps the minecraft theme line subordinate, as the legacy prompt does", () => {
    const prompt = buildSavedStickerEditPrompt(SAVED_STICKER_LOOKS.minecraft, INSTRUCTION) ?? "";
    expect(prompt).toContain(
      "Visual theme: Blocky pixel-art Minecraft style with cubic shapes and bright colors. ",
    );
    // One full recipe, never two: the theme's own palette line stays out.
    expect(prompt).not.toContain("a limited 16-color palette");
  });

  it("has no prompt for a look that resolves to no recipe", () => {
    expect(buildSavedStickerEditPrompt({}, INSTRUCTION)).toBeNull();
    expect(buildSavedStickerEditPrompt({ theme: "nope" }, INSTRUCTION)).toBeNull();
    expect(buildSavedStickerEditPrompt(look, "")).toBeNull();
  });
});
