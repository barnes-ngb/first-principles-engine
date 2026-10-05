import { describe, expect, it } from "vitest";
import {
  SAVED_STICKER_LOOKS,
  acceptEditInstruction,
  canonicalizeEditInstruction,
  rewrittenInstructionSurvives,
  savedStickerLook,
} from "./savedStickerEdit.js";
import {
  CUSTOM_PICTURE_NOTE_MAX_LENGTH,
  normalizeCustomPictureNote,
} from "./customPictureNote.js";

/**
 * The two rules an edit instruction passes, read on their own (the callable
 * tests in `enhanceSketch.savedStickerEdit.test.ts` are the ones that matter).
 *
 * The whole design rests on one claim: an edit instruction is not a note. A note
 * is decoration — "put her in a space suit" loses little if it is trimmed. An
 * instruction is the request itself, so "remove the hat but keep the dog" cut at
 * a word boundary asks for a different picture, and a paraphrase of "don't add a
 * cape" that drops the "don't" asks for its opposite.
 */

const KEEP = "remove the hat but keep the dog";
const NEGATION = "do not add a cape";

describe("canonicalization is whitespace and a full stop, nothing else", () => {
  it("collapses whitespace, trims, and drops the terminal punctuation", () => {
    expect(canonicalizeEditInstruction("  remove   the hat.  ")).toBe("remove the hat");
    expect(canonicalizeEditInstruction("remove the hat!!")).toBe("remove the hat");
    expect(canonicalizeEditInstruction("remove the hat?")).toBe("remove the hat");
    expect(canonicalizeEditInstruction("remove\nthe\that")).toBe("remove the hat");
  });

  it("changes no word, and no interior punctuation", () => {
    for (const text of [KEEP, NEGATION, "take off the hat, leave the scarf"]) {
      expect(canonicalizeEditInstruction(text)).toBe(text);
    }
  });

  it("is empty for anything that is not words", () => {
    for (const raw of [undefined, null, 7, {}, [], "", "   ", "..."]) {
      expect(canonicalizeEditInstruction(raw)).toBe("");
    }
  });
});

describe("an instruction is accepted only where the shared normalizer loses nothing", () => {
  it("accepts a plain change, a keep, and a negation", () => {
    for (const text of ["remove the hat", KEEP, NEGATION, "no hat", "add a red cape"]) {
      expect(acceptEditInstruction(text)).toBe(text);
    }
  });

  it("accepts benign whitespace and a trailing full stop", () => {
    expect(acceptEditInstruction("  remove the   hat. ")).toBe("remove the hat");
    expect(acceptEditInstruction(`${KEEP}!`)).toBe(KEEP);
  });

  it("refuses an empty or non-string instruction", () => {
    for (const raw of [undefined, null, "", "   ", "...", 7, {}]) {
      expect(acceptEditInstruction(raw)).toBeNull();
    }
  });

  it("refuses a second sentence rather than silently dropping it", () => {
    // The normalizer keeps the first sentence only — which on an instruction
    // would quietly answer half the request.
    const two = "remove the hat. keep the dog";
    expect(normalizeCustomPictureNote(two)).toBe("remove the hat");
    expect(acceptEditInstruction(two)).toBeNull();
  });

  it("refuses an over-length instruction rather than truncating it", () => {
    const long = `remove the hat ${"and the scarf ".repeat(20)}but keep the dog`;
    expect(long.length).toBeGreaterThan(CUSTOM_PICTURE_NOTE_MAX_LENGTH);
    // Truncation is what makes this dangerous: the kept clause is the one that
    // falls off the end.
    expect(normalizeCustomPictureNote(long)).not.toContain("keep the dog");
    expect(acceptEditInstruction(long)).toBeNull();
  });

  it("leaves the legacy normalizer exactly as it is", () => {
    // The note rule is unchanged by this work — it still truncates and still
    // keeps one sentence. This rule is a second reader of it, not an edit to it.
    expect(normalizeCustomPictureNote("put her in a space suit. and a helmet")).toBe(
      "put her in a space suit",
    );
  });
});

describe("the rewriter's answer must still say what the person said", () => {
  it("accepts an identical answer, and one differing only benignly", () => {
    expect(rewrittenInstructionSurvives("remove the hat", "remove the hat")).toBe(true);
    expect(rewrittenInstructionSurvives("remove the hat", " remove  the hat. ")).toBe(true);
  });

  it("refuses an empty or unusable answer — there is no fallback", () => {
    for (const answer of ["", "   ", "...", undefined, null, 7]) {
      expect(rewrittenInstructionSurvives("remove the hat", answer)).toBe(false);
    }
  });

  it("refuses a dropped keep clause", () => {
    expect(rewrittenInstructionSurvives(KEEP, "remove the hat")).toBe(false);
  });

  it("refuses a dropped negation", () => {
    expect(rewrittenInstructionSurvives(NEGATION, "add a cape")).toBe(false);
  });

  it("refuses even a benign paraphrase, deliberately", () => {
    // Strict text preservation: this is not semantic inference, so "take off"
    // and "remove" cannot be judged equivalent and the person is asked instead.
    expect(rewrittenInstructionSurvives("remove the hat", "take off the hat")).toBe(false);
    expect(rewrittenInstructionSurvives("remove the hat", "remove the hat, please")).toBe(
      false,
    );
  });
});

describe("a saved version's look", () => {
  it("resolves every look the picker can save", () => {
    expect(savedStickerLook("cartoon")).toEqual({ style: "storybook" });
    expect(savedStickerLook("comic")).toEqual({ style: "comic" });
    expect(savedStickerLook("minecraft")).toEqual({
      style: "minecraft",
      theme: "minecraft",
    });
    for (const id of ["fantasy", "animals", "adventure", "space", "science", "faith", "family"]) {
      expect(savedStickerLook(id)).toEqual({ theme: id });
    }
  });

  it("refuses an unknown id — no watercolor fallback", () => {
    for (const id of ["watercolor", "storybook", "dinosaurs", "ocean", "", "CARTOON", undefined, 7]) {
      expect(savedStickerLook(id)).toBeNull();
    }
  });

  it("refuses an inherited property name", () => {
    for (const id of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(savedStickerLook(id)).toBeNull();
    }
  });

  it("names ten looks and no more", () => {
    expect(Object.keys(SAVED_STICKER_LOOKS)).toHaveLength(10);
  });
});
