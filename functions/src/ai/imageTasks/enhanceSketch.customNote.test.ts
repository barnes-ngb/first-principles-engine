import { describe, expect, it, vi } from "vitest";
import {
  alternativesSourceFor,
  buildEnhancePrompt,
  resolveCustomNote,
} from "./enhanceSketch.js";
import { fallbackCopyrightStrip } from "./copyrightUtils.js";
import { buildStoryPrompt } from "../chat.js";
import { resolveThemeGuidance } from "../tasks/generateStory.js";
import { CUSTOM_PICTURE_NOTE_MAX_LENGTH } from "../../shared/customPictureNote.js";

/**
 * The FEAT-197 "+ My own look" note (UX-177) — the second axis.
 *
 * The whole design rests on one separation: a **look** says how the drawing is
 * redrawn (the recipe), a **note** says what is in it. FEAT-189 measured what
 * happens when the two are mixed — a style prefix that names subject matter
 * arriving beside the picture's own scene, and a split canvas — so these tests
 * pin the note in the subject position, leave the recipe untouched, and check
 * that the note cannot get out of the picture and into a story.
 */

const NOTE = "put her in a space suit";

describe("the note is a subject clause, after the recipe", () => {
  it("changes NOTHING but its own two insertions", () => {
    // The claim the design rests on, asserted over the whole prompt rather than
    // a prefix of it: remove the note clause and un-scope the keep-the-drawing
    // sentence, and what is left must be byte-identical to the note-less prompt.
    // The recipe — palette, line, shading, the theme, the cutout rail — cannot
    // move one character.
    for (const style of ["storybook", "comic", "realistic", "minecraft"]) {
      for (const theme of [undefined, "space", "fantasy"]) {
        for (const transparent of [true, false]) {
          const withNote = buildEnhancePrompt(style, undefined, theme, transparent, NOTE);
          const without = buildEnhancePrompt(style, undefined, theme, transparent);
          const stripped = withNote
            .replace(
              /Also change what is in the picture: [\s\S]*?palette, line work, or shading\. /,
              "",
            )
            .replace(
              "Apart from that one change, keep the same composition",
              "Keep the same composition",
            );
          expect(stripped).toBe(without);
        }
      }
    }
  });

  it("puts the note BEFORE the cutout rail, so a place cannot win over it", () => {
    // "put her on a beach" must not be the last word against "no background
    // scene, no ground, no environment" — a cutout with a beach behind it is
    // not a sticker.
    const prompt = buildEnhancePrompt("storybook", undefined, undefined, true, NOTE);
    expect(prompt.indexOf(NOTE)).toBeLessThan(
      prompt.indexOf("IMPORTANT: Render only"),
    );
  });

  it("puts the note after the recipe's palette, line and shading", () => {
    const prompt = buildEnhancePrompt("storybook", undefined, undefined, true, NOTE);
    const recipeAt = prompt.indexOf("Palette:");
    const noteAt = prompt.indexOf(NOTE);
    expect(recipeAt).toBeGreaterThan(-1);
    expect(noteAt).toBeGreaterThan(recipeAt);
  });

  it("tells the model the note describes only what is in the picture", () => {
    const prompt = buildEnhancePrompt("comic", undefined, undefined, true, NOTE);
    expect(prompt).toContain("describes ONLY what is in the picture");
    expect(prompt).toContain("The art style is fixed by the description above");
    // And that a note naming a style is to be ignored — a look request the
    // picker already answers.
    expect(prompt).toContain("names an art style, a medium, or a look");
  });

  it("scopes the keep-the-drawing sentence to everything but the change", () => {
    const withNote = buildEnhancePrompt("storybook", undefined, undefined, true, NOTE);
    const without = buildEnhancePrompt("storybook", undefined, undefined, true);
    expect(withNote).toContain(
      "Apart from that one change, keep the same composition",
    );
    expect(without).toContain(
      "Keep the same composition, characters, and scene layout",
    );
    expect(without).not.toContain("Apart from that one change");
  });

  it("changes nothing at all when there is no note", () => {
    for (const raw of [undefined, "", "   ", "..."]) {
      expect(buildEnhancePrompt("storybook", "a dragon", "space", true, raw)).toBe(
        buildEnhancePrompt("storybook", "a dragon", "space", true),
      );
      expect(
        buildEnhancePrompt("storybook", "a dragon", "space", true, raw),
      ).not.toContain("Also change what is in the picture");
    }
  });

  it("normalizes and caps whatever the client sent", () => {
    // The client's cap is a courtesy; this is the rule. An over-long value is
    // clamped here, not trusted.
    const long = `${"space ".repeat(80)}suit`;
    const prompt = buildEnhancePrompt("storybook", undefined, undefined, true, long);
    const clause = prompt.split("Also change what is in the picture: ")[1] ?? "";
    const note = clause.split(". That sentence")[0];
    expect(note.length).toBeLessThanOrEqual(CUSTOM_PICTURE_NOTE_MAX_LENGTH);
  });
});

describe("the note goes through the copyright rewriter", () => {
  it("hands the rewriter the normalized note", async () => {
    const rewrite = vi.fn(async (text: string) => text);
    await resolveCustomNote("  put   her in a  space suit.  ", rewrite);
    expect(rewrite).toHaveBeenCalledWith("put her in a space suit");
  });

  it("comes back rewritten when the note names a character", async () => {
    // `fallbackCopyrightStrip` is the rewriter's own offline path, so this is
    // the real filter rather than a stand-in for it.
    const { safeNote, revisedNote } = await resolveCustomNote(
      "dress her as Elsa",
      async (text) => fallbackCopyrightStrip(text),
    );
    expect(safeNote).not.toMatch(/elsa/i);
    expect(revisedNote).toBe(safeNote);
  });

  it("says nothing when the rewrite changed nothing", async () => {
    const { safeNote, revisedNote } = await resolveCustomNote(
      "give him a cape",
      async (text) => fallbackCopyrightStrip(text),
    );
    expect(safeNote).toBe("give him a cape");
    expect(revisedNote).toBeUndefined();
  });

  it("never calls the rewriter when there is no note", async () => {
    const rewrite = vi.fn(async (text: string) => text);
    expect(await resolveCustomNote("   ", rewrite)).toEqual({ safeNote: "" });
    expect(await resolveCustomNote(undefined, rewrite)).toEqual({ safeNote: "" });
    expect(rewrite).not.toHaveBeenCalled();
  });

  it("keeps the person's own words when the rewriter answers with nothing", async () => {
    const { safeNote } = await resolveCustomNote(NOTE, async () => "   ");
    expect(safeNote).toBe(NOTE);
  });

  it("caps the rewriter's answer too", async () => {
    const { safeNote } = await resolveCustomNote(NOTE, async () =>
      `${"a shining silver ".repeat(40)}suit`,
    );
    expect(safeNote.length).toBeLessThanOrEqual(CUSTOM_PICTURE_NOTE_MAX_LENGTH);
  });
});

describe("a refusal rewords the note, not the caption", () => {
  it("prefers the note", () => {
    expect(alternativesSourceFor(NOTE, "my dragon drawing")).toBe(NOTE);
  });

  it("falls back to the caption where there is no note", () => {
    expect(alternativesSourceFor("", "my dragon drawing")).toBe("my dragon drawing");
    expect(alternativesSourceFor(undefined, "my dragon drawing")).toBe(
      "my dragon drawing",
    );
  });

  it("asks for nothing when there is neither — the call is skipped", () => {
    expect(alternativesSourceFor(undefined, undefined)).toBe("");
  });
});

describe("the note never reaches the story writer", () => {
  /**
   * The mirror of FEAT-194's rail. That one keeps a parent's story note out of
   * every image prompt, because free text naming subject matter beside a page's
   * own scene splits the canvas. This one is the same rule pointed the other
   * way: a picture note is an argument to `enhanceSketch` and nothing else, and
   * the story path's single free-text channel — `resolveThemeGuidance` — reads
   * `customTheme` and only `customTheme`.
   */
  it("has no route into theme guidance", () => {
    expect(JSON.stringify(resolveThemeGuidance("space", undefined) ?? {})).not.toContain(
      NOTE,
    );
    // Even handed in as a rogue extra field on the config a story is built from.
    expect(resolveThemeGuidance(undefined, undefined)).toBeUndefined();
  });

  it("does not appear in a story prompt built with everything a book carries", () => {
    // Note the asymmetry this pins: `themeGuidance.customNote` is FEAT-194's
    // STORY note and legitimately reaches the prompt. A PICTURE note has no
    // field of its own here, so a caller that wrongly forwarded one would have
    // to invent one — and an invented field reaches nothing.
    const prompt = buildStoryPrompt({
      storyIdea: "a girl who flies",
      words: [],
      pageCount: 6,
      childName: "Lincoln",
      childAge: 10,
      themeGuidance: resolveThemeGuidance("space", undefined),
      ...({ customNote: NOTE, customPictureNote: NOTE } as Record<string, unknown>),
    } as Parameters<typeof buildStoryPrompt>[0]);
    expect(prompt).not.toContain(NOTE);
    expect(prompt).not.toContain("space suit");
  });
});
