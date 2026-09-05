import { describe, expect, it } from "vitest";

import { toCurriculumPositions } from "./evaluate.js";

/**
 * UX-212 — recording the positions is what makes a rate possible at all.
 *
 * `ActivityConfig.currentPosition` is a single mutable field and there is no
 * position history anywhere in the repo, so nothing about coverage can be
 * computed retroactively. These tests pin the two things that matter about what
 * gets written: only real positions are recorded, and a position that cannot be
 * read is DROPPED rather than coerced — because a stored zero would let the
 * reader claim "no lessons covered" on no evidence.
 */

const config = (id: string, data: Record<string, unknown>) => ({ id, data });

describe("toCurriculumPositions", () => {
  it("records a workbook's position, total and unit label", () => {
    expect(
      toCurriculumPositions([
        config("w1", {
          name: "The Good and the Beautiful Math",
          currentPosition: 14,
          totalUnits: 60,
          unitLabel: "lesson",
          type: "workbook",
        }),
      ]),
    ).toEqual([
      {
        configId: "w1",
        name: "The Good and the Beautiful Math",
        currentPosition: 14,
        totalUnits: 60,
        unitLabel: "lesson",
      },
    ]);
  });

  it("skips configs that carry no position at all", () => {
    expect(
      toCurriculumPositions([
        config("r1", { name: "Prayer and Scripture", type: "routine" }),
        config("f1", { name: "Morning formation", type: "formation" }),
      ]),
    ).toEqual([]);
  });

  it("drops an unreadable position rather than recording it as zero", () => {
    expect(
      toCurriculumPositions([
        config("w1", { name: "Bad", currentPosition: Number.NaN }),
        config("w2", { name: "Worse", currentPosition: "twelve" }),
        config("w3", { name: "Negative", currentPosition: -3 }),
      ]),
    ).toEqual([]);
  });

  it("records position zero, which is a real reading — not started", () => {
    expect(toCurriculumPositions([config("w1", { name: "New", currentPosition: 0 })]))
      .toEqual([{ configId: "w1", name: "New", currentPosition: 0 }]);
  });

  it("omits optional fields that are not usable, so no undefined is written", () => {
    const [record] = toCurriculumPositions([
      config("w1", { currentPosition: 5, totalUnits: 0, unitLabel: "" }),
    ]);
    expect(record).toEqual({ configId: "w1", name: "Workbook", currentPosition: 5 });
    expect(Object.values(record).some((v) => v === undefined)).toBe(false);
  });

  it("records a finished program, flagged, so its final position is on file", () => {
    expect(
      toCurriculumPositions([
        config("w1", { name: "Done", currentPosition: 60, totalUnits: 60, completed: true }),
      ]),
    ).toEqual([
      { configId: "w1", name: "Done", currentPosition: 60, totalUnits: 60, completed: true },
    ]);
  });
});
