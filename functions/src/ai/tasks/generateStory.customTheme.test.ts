import { describe, expect, it } from "vitest";

import {
  CUSTOM_STORY_THEME_MAX_LENGTH,
  normalizeCustomStoryTheme,
  resolveThemeGuidance,
} from "./generateStory.js";
import { COPYRIGHT_BLOCK, buildStoryPrompt } from "../chat.js";
import {
  PRESET_IMAGE_PREFIXES,
  buildImagePrompt,
} from "../imageTasks/generateImage.js";

/**
 * FEAT-194 — the one-off "what should this story feel like?" note, and the one
 * constraint that makes it small: it reaches the STORY, never the picture.
 */

const NOTE = "a spooky forest with a kind witch who bakes bread";

describe("normalizeCustomStoryTheme (server)", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeCustomStoryTheme("  warm   and \n gentle ")).toBe(
      "warm and gentle",
    );
  });

  it("caps independently of the client — a client-only length is not a limit", () => {
    const long = "x".repeat(CUSTOM_STORY_THEME_MAX_LENGTH + 500);
    expect(normalizeCustomStoryTheme(long)).toHaveLength(
      CUSTOM_STORY_THEME_MAX_LENGTH,
    );
  });

  it("is empty for anything that is not a string", () => {
    expect(normalizeCustomStoryTheme(undefined)).toBe("");
    expect(normalizeCustomStoryTheme(42)).toBe("");
    expect(normalizeCustomStoryTheme({ note: NOTE })).toBe("");
    expect(normalizeCustomStoryTheme(["a"])).toBe("");
  });
});

describe("resolveThemeGuidance", () => {
  it("returns the note as the whole guidance when there is one", () => {
    expect(resolveThemeGuidance(undefined, NOTE)).toEqual({ customNote: NOTE });
  });

  it("prefers the note over a preset id — that id is inferred, the note is chosen", () => {
    // The Generate chat always sends a `theme` from `inferBookTheme`, so both
    // arrive on the same payload. A parent's own words win, and the preset is
    // dropped outright: two worlds in one prompt are two stories.
    expect(resolveThemeGuidance("adventure", NOTE)).toEqual({ customNote: NOTE });
  });

  it("carries NOTHING an image prompt can read", () => {
    const guidance = resolveThemeGuidance("adventure", NOTE);
    // `imageStylePrefix` is the only field of theme guidance that has ever
    // reached a picture. A note must never populate it, so the shape a note
    // produces has exactly one key.
    expect(Object.keys(guidance ?? {})).toEqual(["customNote"]);
  });

  it("still returns the preset triple when there is no note", () => {
    const guidance = resolveThemeGuidance("adventure", undefined);
    expect(guidance?.storyWorldDescription).toContain("hidden treasures");
    expect(guidance?.storyTone).toContain("adventurous");
  });

  it("is undefined with no theme and no note", () => {
    expect(resolveThemeGuidance(undefined, undefined)).toBeUndefined();
    expect(resolveThemeGuidance("", "   ")).toBeUndefined();
  });

  it("falls through an unknown id, as it did before the library was retired", () => {
    // A leftover `bookThemes` auto-id on some old book resolves to no guidance
    // rather than a Firestore read. The orphan documents are left in place,
    // unread.
    expect(resolveThemeGuidance("K3nO0pQrS7uVwXyZ", undefined)).toBeUndefined();
  });
});

const baseStoryInput = {
  storyIdea: "a ship on a dock",
  words: [],
  pageCount: 6,
  childName: "Lincoln",
  childAge: 10,
};

describe("buildStoryPrompt with a note", () => {
  it("puts the note in THEME GUIDANCE and names whose words they are", () => {
    const prompt = buildStoryPrompt({
      ...baseStoryInput,
      themeGuidance: { customNote: NOTE },
    });
    expect(prompt).toContain("STORY WORLD AND TONE: " + NOTE);
    expect(prompt).toContain("the parent's own words for this one book");
  });

  it("emits no IMAGE STYLE line — the note is not an art direction", () => {
    const prompt = buildStoryPrompt({
      ...baseStoryInput,
      themeGuidance: { customNote: NOTE },
    });
    expect(prompt).not.toContain("IMAGE STYLE:");
    // And none of the preset block's own lines, since a note replaces it.
    expect(prompt).not.toContain("STORY WORLD:");
    expect(prompt).not.toContain("VOCABULARY STYLE:");
  });

  it("says the note does not move the vocabulary", () => {
    // Free text is exactly where "make it sophisticated and literary" would
    // otherwise arrive as an instruction, so the note's own line restates the
    // READING LEVEL block's precedence (FEAT-176) in the same breath.
    const prompt = buildStoryPrompt({
      ...baseStoryInput,
      themeGuidance: { customNote: NOTE },
    });
    expect(prompt).toContain("does NOT change the vocabulary");
  });

  it("is governed by COPYRIGHT and outranked by READING LEVEL, by prompt order", () => {
    const prompt = buildStoryPrompt({
      ...baseStoryInput,
      readingLevelBlock: {
        level: 2,
        levelSource: "assessed",
        childName: "Lincoln",
        safeWords: ["the", "cat"],
        sentenceTarget: "one short sentence",
      },
      themeGuidance: { customNote: NOTE },
    });
    const levelAt = prompt.indexOf("READING LEVEL");
    const noteAt = prompt.indexOf("STORY WORLD AND TONE");
    const copyrightAt = prompt.indexOf(COPYRIGHT_BLOCK);
    expect(levelAt).toBeGreaterThanOrEqual(0);
    expect(noteAt).toBeGreaterThan(levelAt);
    expect(copyrightAt).toBeGreaterThan(noteAt);
  });

  it("leaves the preset block byte-identical when there is no note", () => {
    const preset = resolveThemeGuidance("adventure", undefined);
    const prompt = buildStoryPrompt({ ...baseStoryInput, themeGuidance: preset });
    expect(prompt).toContain("THEME GUIDANCE:");
    expect(prompt).toContain("STORY WORLD: ");
  });
});

describe("the picture is untouched by a note", () => {
  it("produces a byte-identical image prompt with and without one", () => {
    // The claim the whole design rests on. `buildImagePrompt`'s third argument
    // is the only route a theme has into a picture, and the guidance a note
    // produces has no such field — so the prompt for a book carrying a note is
    // the same string as for the same book without it.
    const scene = "A wooden hut in a wide green field.";
    const style = "book-illustration-storybook";
    const withNote = resolveThemeGuidance("adventure", NOTE) as Record<
      string,
      string | undefined
    >;
    const withoutNote = resolveThemeGuidance("adventure", undefined) as Record<
      string,
      string | undefined
    >;

    expect(
      buildImagePrompt(scene, style, withNote.imageStylePrefix),
    ).toBe(buildImagePrompt(scene, style, withoutNote.imageStylePrefix));
  });

  it("never contains the note's words, on any style", () => {
    const scene = "A wooden hut in a wide green field.";
    for (const style of [
      "general",
      "book-illustration-storybook",
      "book-illustration-comic",
    ]) {
      const prompt = buildImagePrompt(
        scene,
        style,
        PRESET_IMAGE_PREFIXES["adventure"],
      );
      expect(prompt).not.toContain("spooky");
      expect(prompt).not.toContain("witch");
    }
  });
});
