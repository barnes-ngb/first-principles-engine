import { describe, expect, it } from "vitest";

import {
  civilDateInZone,
  civilDateObjectInZone,
  DEFAULT_FAMILY_TIME_ZONE,
} from "./familyClock.js";
import {
  civilDateInZone as reExportedCivilDateInZone,
  DEFAULT_FAMILY_TIME_ZONE as reExportedZone,
} from "./tasks/shellyChat.js";

describe("familyClock — the one place a CF turns 'now' into a date (UX-266)", () => {
  it("is still the zone every scheduled function in this repo runs on", () => {
    expect(DEFAULT_FAMILY_TIME_ZONE).toBe("America/Chicago");
  });

  it("is the SAME helper shellyChat exports — a move, not a copy", () => {
    // The original definition lived in `tasks/shellyChat.ts`. It moved here so
    // `evaluate.ts` could reach it without a cycle (shellyChat imports
    // `summarizeTeachBacks` from evaluate). If someone re-adds a local copy
    // there, these stop being the same function object and this fails.
    expect(reExportedCivilDateInZone).toBe(civilDateInZone);
    expect(reExportedZone).toBe(DEFAULT_FAMILY_TIME_ZONE);
  });

  describe("civilDateObjectInZone", () => {
    it("positions a UTC instant on the family's civil day, not the runtime's", () => {
      // 02:00 UTC on Aug 17 is 21:00 CDT on Aug 16 — the case the whole rule
      // exists for.
      const instant = new Date("2026-08-17T02:00:00Z");
      const d = civilDateObjectInZone(instant, "America/Chicago");
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(7); // August
      expect(d.getDate()).toBe(16);
    });

    it("zeroes the time, so date arithmetic can't be nudged by an hour", () => {
      const d = civilDateObjectInZone(new Date("2026-08-17T02:00:00Z"), "America/Chicago");
      expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([
        0, 0, 0, 0,
      ]);
    });

    it("reads back through LOCAL getters as exactly the civil date that went in", () => {
      // The reason this builds from the field triple rather than parsing the
      // string: `new Date("2026-08-16")` is interpreted as UTC and, west of
      // Greenwich, reads back locally as Aug 15.
      const instant = new Date("2026-08-17T02:00:00Z");
      const d = civilDateObjectInZone(instant, "America/Chicago");
      const readBack = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      expect(readBack).toBe(civilDateInZone(instant, "America/Chicago"));
    });

    it("defaults to the family zone", () => {
      const instant = new Date("2026-08-17T02:00:00Z");
      expect(civilDateObjectInZone(instant).getTime()).toBe(
        civilDateObjectInZone(instant, DEFAULT_FAMILY_TIME_ZONE).getTime(),
      );
    });

    it("falls back to the runtime's own day on a bad zone rather than throwing", () => {
      // A bad `Family.timeZone` must not take a scheduled review down.
      expect(() => civilDateObjectInZone(new Date("2026-08-17T02:00:00Z"), "Not/AZone")).not.toThrow();
    });
  });
});
