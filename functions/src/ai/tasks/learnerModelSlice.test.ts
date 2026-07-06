import { describe, expect, it } from "vitest";
import { buildLearnerModelSlice } from "./learnerModelSlice.js";
import type { StoredLearnerModel } from "./learnerSynthesis.js";

const MODEL: StoredLearnerModel = {
  childId: "lincoln",
  status: "seeded",
  conceptStates: {
    "reading.phonics.blends": { state: "solid", evidence: [{ kind: "workingLevel", note: "Below reading working level 4" }] },
    "reading.phonics.digraphs": {
      state: "forming",
      evidence: [{ kind: "curriculumPosition", note: "Fast Phonics Peak 13", source: "fastPhonics" }],
    },
    "reading.phonics.longVowels": { state: "frontier", evidence: [{ kind: "workingLevel", note: "At reading working level 4" }] },
    "math.operations.regrouping": { state: "frontier", evidence: [{ kind: "workingLevel", note: "At math working level 7" }] },
  },
  modalityCalibration: {
    reading: { level: 4, note: "Reads around working level 4 — put short reading in activities at this level." },
    writing: { level: 2, note: "Scribe by default; tiles and dictation count fully." },
    math: { level: 7, note: "Works math around level 7 — heard-aloud word problems count fully." },
  },
  synthesis: {
    whatMattersNext: [
      { conceptId: "reading.phonics.longVowels", kidName: "Read long-vowel words", why: "Blends are solid; long vowels are the next unlock.", suggestedVehicle: "quest" },
    ],
    narrative: "Reading with real momentum.",
    openQuestionsSummary: [],
    generatedAt: "2026-07-05T00:00:00Z",
  },
};

describe("buildLearnerModelSlice", () => {
  const slice = buildLearnerModelSlice(MODEL);

  it("names the frontier and forming concepts by kid-name, with source", () => {
    expect(slice).toContain("Read long-vowel words");
    expect(slice).toContain("Working edge");
    // Forming digraphs carries the external source and the not-yet-verified caveat.
    expect(slice).toContain("Two letters, one sound");
    expect(slice).toContain("covered in fastPhonics, not yet verified");
  });

  it("surfaces both domains and the synthesized next move", () => {
    expect(slice).toContain("READING:");
    expect(slice).toContain("MATH:");
    expect(slice).toContain("What matters next");
    expect(slice).toContain("[quest]");
  });

  it("instructs grounding + names the reading/math-only coverage limit", () => {
    expect(slice.toLowerCase()).toContain("ground");
    expect(slice.toLowerCase()).toContain("science");
  });

  it("obeys §14 — no band/level numbers or percentages leak", () => {
    expect(slice).not.toMatch(/band\s+\d/i);
    expect(slice).not.toMatch(/level\s+\d/i);
    expect(slice).not.toMatch(/\d+\s*%/);
    // Source units like "Peak 13" are allowed and survive.
    expect(slice).toContain("Peak 13");
  });

  it("returns empty for a no-data or empty model (section omitted)", () => {
    expect(buildLearnerModelSlice(null)).toBe("");
    expect(buildLearnerModelSlice({ status: "no-data", conceptStates: {} })).toBe("");
    expect(buildLearnerModelSlice({ status: "seeded", conceptStates: {} })).toBe("");
  });
});
