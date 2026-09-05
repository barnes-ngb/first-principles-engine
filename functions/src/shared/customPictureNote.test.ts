import { describe, expect, it } from "vitest";
import {
  CUSTOM_PICTURE_NOTE_MAX_LENGTH,
  hasCustomPictureNote,
  normalizeCustomPictureNote,
} from "./customPictureNote.js";

/**
 * The shared normalize/cap rule behind the FEAT-197 "+ My own look" note.
 *
 * This is the file BOTH projects compile, so these assertions hold on the client
 * (where the cap is a courtesy shown while typing) and on the server (where it
 * is the rule applied to whatever actually arrived).
 */
describe("normalizeCustomPictureNote", () => {
  it("keeps a plain note as it is", () => {
    expect(normalizeCustomPictureNote("put her in a space suit")).toBe(
      "put her in a space suit",
    );
  });

  it("is empty for anything that is not a string", () => {
    for (const raw of [undefined, null, 42, {}, [], true]) {
      expect(normalizeCustomPictureNote(raw)).toBe("");
      expect(hasCustomPictureNote(raw)).toBe(false);
    }
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeCustomPictureNote("  give   him\n\na  cape  ")).toBe(
      "give him a cape",
    );
  });

  it("takes one sentence and drops its terminator", () => {
    expect(
      normalizeCustomPictureNote("put her in a space suit. and add a dog"),
    ).toBe("put her in a space suit");
    expect(normalizeCustomPictureNote("give him a cape!")).toBe("give him a cape");
  });

  it("does not split on a period that is not a sentence end", () => {
    // "e.g." and friends stay intact — the rule is a terminator followed by
    // whitespace or the end of the string.
    expect(normalizeCustomPictureNote("e.g. a red cape")).toBe("e.g. a red cape");
  });

  it("caps a long note, at a word boundary", () => {
    const long = `${"space ".repeat(60)}suit`;
    const result = normalizeCustomPictureNote(long);
    expect(result.length).toBeLessThanOrEqual(CUSTOM_PICTURE_NOTE_MAX_LENGTH);
    // No half word left at the end.
    expect(result.endsWith("space")).toBe(true);
  });

  it("falls back to a hard slice for one word longer than the cap", () => {
    const result = normalizeCustomPictureNote("x".repeat(500));
    expect(result.length).toBe(CUSTOM_PICTURE_NOTE_MAX_LENGTH);
  });

  it("is empty for whitespace or punctuation alone", () => {
    expect(normalizeCustomPictureNote("   ")).toBe("");
    expect(normalizeCustomPictureNote("...")).toBe("");
    expect(hasCustomPictureNote("   ")).toBe(false);
  });

  it("is idempotent", () => {
    const once = normalizeCustomPictureNote("  Put her  in a SPACE suit. really ");
    expect(normalizeCustomPictureNote(once)).toBe(once);
  });
});
