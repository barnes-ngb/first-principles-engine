import { describe, expect, it } from "vitest";

import type { VisualRecipe } from "./visualRecipe.js";
import { recipeDetail, recipeMediums, MEDIUM_TERMS } from "./visualRecipe.js";

// ── recipeDetail ───────────────────────────────────────────────────────────

describe("recipeDetail", () => {
  const recipe: VisualRecipe = {
    hint: "in a bold comic-book style",
    summary: "Comic book",
    palette: "saturated primaries, hard black",
    line: "heavy ink outlines, speed lines",
    shading: "flat fills with halftone dots",
    shadingCutout: "rim light on the subject, no ground shadow",
  };

  it("concatenates palette, line and shading", () => {
    const result = recipeDetail(recipe);
    expect(result).toContain("Palette: saturated primaries, hard black");
    expect(result).toContain("Line work: heavy ink outlines, speed lines");
    expect(result).toContain("Shading: flat fills with halftone dots");
  });

  it("uses the regular shading when transparent is false", () => {
    const result = recipeDetail(recipe, { transparent: false });
    expect(result).toContain("Shading: flat fills with halftone dots");
  });

  it("uses the regular shading when no opts provided", () => {
    const result = recipeDetail(recipe);
    expect(result).not.toContain("rim light");
    expect(result).toContain("halftone");
  });

  it("uses shadingCutout when transparent is true", () => {
    const result = recipeDetail(recipe, { transparent: true });
    expect(result).toContain(
      "Shading: rim light on the subject, no ground shadow",
    );
    expect(result).not.toContain("halftone");
  });

  it("falls back to regular shading when transparent but no shadingCutout", () => {
    const noShadingCutout: VisualRecipe = {
      hint: "watercolor",
      summary: "Watercolor",
      palette: "earth tones",
      line: "soft pencil edges",
      shading: "layered washes",
    };
    const result = recipeDetail(noShadingCutout, { transparent: true });
    expect(result).toContain("Shading: layered washes");
  });
});

// ── recipeMediums ──────────────────────────────────────────────────────────

describe("recipeMediums", () => {
  it("finds a single watercolor medium", () => {
    const recipe: VisualRecipe = {
      hint: "in watercolor",
      summary: "Watercolor",
      palette: "soft watercolor washes",
      line: "thin outlines",
      shading: "translucent layering",
    };
    expect(recipeMediums(recipe)).toEqual(["watercolor"]);
  });

  it("finds multiple mediums in one recipe", () => {
    const recipe: VisualRecipe = {
      hint: "mixed media",
      summary: "Mixed",
      palette: "gouache and watercolor layers",
      line: "marker outlines",
      shading: "flat fills",
    };
    const mediums = recipeMediums(recipe);
    expect(mediums).toContain("gouache");
    expect(mediums).toContain("watercolor");
    expect(mediums).toContain("marker");
  });

  it("reads coloured pencil as colored pencil, not as pencil too", () => {
    const recipe: VisualRecipe = {
      hint: "soft illustration",
      summary: "Pencil",
      palette: "coloured pencil hues",
      line: "soft edges",
      shading: "gentle hatching",
    };
    const mediums = recipeMediums(recipe);
    expect(mediums).toContain("colored pencil");
    expect(mediums).not.toContain("pencil");
  });

  it("reads pencil when not part of a longer phrase", () => {
    const recipe: VisualRecipe = {
      hint: "sketch",
      summary: "Sketch",
      palette: "pencil grey tones",
      line: "loose pencil strokes",
      shading: "cross-hatching",
    };
    expect(recipeMediums(recipe)).toContain("pencil");
  });

  it("reads shadingCutout as well as regular shading", () => {
    const recipe: VisualRecipe = {
      hint: "adventure style",
      summary: "Adventure",
      palette: "rich oils, deep greens",
      line: "heavy brush ink outlines",
      shading: "gouache washes with cast shadows",
      shadingCutout: "airbrush highlights on subject",
    };
    const mediums = recipeMediums(recipe);
    expect(mediums).toContain("gouache");
    expect(mediums).toContain("ink");
    expect(mediums).toContain("airbrush");
  });

  it("returns empty for a recipe naming no medium", () => {
    const recipe: VisualRecipe = {
      hint: "simple",
      summary: "Simple",
      palette: "bright colors",
      line: "clean edges",
      shading: "flat fills",
    };
    expect(recipeMediums(recipe)).toEqual([]);
  });

  it("returns sorted results", () => {
    const recipe: VisualRecipe = {
      hint: "mixed",
      summary: "Mixed",
      palette: "watercolor and gouache",
      line: "marker outlines",
      shading: "acrylic highlights",
    };
    const mediums = recipeMediums(recipe);
    expect(mediums).toEqual([...mediums].sort());
  });

  it("handles voxel/pixel terms", () => {
    const recipe: VisualRecipe = {
      hint: "blocky",
      summary: "Blocky",
      palette: "pixel art palette",
      line: "cube face edges",
      shading: "flat voxel shading",
    };
    expect(recipeMediums(recipe)).toContain("voxel");
  });

  it("handles screen print / halftone", () => {
    const recipe: VisualRecipe = {
      hint: "retro",
      summary: "Retro",
      palette: "limited pop colors",
      line: "bold outlines",
      shading: "halftone dot shading",
    };
    expect(recipeMediums(recipe)).toContain("screen print");
  });

  it("handles cut paper / collage", () => {
    const recipe: VisualRecipe = {
      hint: "collage style",
      summary: "Collage",
      palette: "collage textures, warm tones",
      line: "torn edges",
      shading: "paper shadows",
    };
    expect(recipeMediums(recipe)).toContain("cut paper");
  });

  it("does not double-count when both spelling variants appear", () => {
    const recipe: VisualRecipe = {
      hint: "watercolor",
      summary: "Watercolor",
      palette: "watercolor and watercolour tones",
      line: "soft edges",
      shading: "layered washes",
    };
    const mediums = recipeMediums(recipe);
    expect(mediums.filter((m) => m === "watercolor")).toHaveLength(1);
  });
});

// ── MEDIUM_TERMS completeness ──────────────────────────────────────────────

describe("MEDIUM_TERMS", () => {
  it("has at least 15 mediums", () => {
    expect(Object.keys(MEDIUM_TERMS).length).toBeGreaterThanOrEqual(15);
  });

  it("every medium has at least one search term", () => {
    for (const [medium, terms] of Object.entries(MEDIUM_TERMS)) {
      expect(terms.length).toBeGreaterThan(0);
    }
  });

  it("all search terms are lowercase", () => {
    for (const terms of Object.values(MEDIUM_TERMS)) {
      for (const term of terms) {
        expect(term).toBe(term.toLowerCase());
      }
    }
  });
});
