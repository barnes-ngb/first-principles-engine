import { describe, expect, it } from "vitest";
import { getWeekMonday } from "./chat.js";

// ── getWeekMonday ──────────────────────────────────────────────

describe("getWeekMonday", () => {
  it("returns Monday for a Monday input", () => {
    const mon = new Date(2026, 2, 2); // Mon March 2, 2026
    const result = getWeekMonday(mon);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-02");
  });

  it("returns Monday for a Wednesday input", () => {
    const wed = new Date(2026, 2, 4); // Wed March 4, 2026
    const result = getWeekMonday(wed);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-02");
  });

  it("returns Monday for a Sunday input", () => {
    const sun = new Date(2026, 2, 1); // Sun March 1, 2026
    const result = getWeekMonday(sun);
    expect(result.toISOString().slice(0, 10)).toBe("2026-02-23");
  });

  it("returns Monday for a Saturday input", () => {
    const sat = new Date(2026, 2, 7); // Sat March 7, 2026
    const result = getWeekMonday(sat);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-02");
  });

  it("returns Monday for a Friday input", () => {
    const fri = new Date(2026, 2, 6); // Fri March 6, 2026
    const result = getWeekMonday(fri);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-02");
  });
});
