import { describe, it, expect } from "vitest";
import {
  getMonthBounds,
  getPreviousMonth,
} from "./monthlyReviewData.js";

describe("getMonthBounds", () => {
  it("returns full month range for April (30 days)", () => {
    const { start, end } = getMonthBounds("2026-04");
    expect(start).toBe("2026-04-01");
    expect(end).toBe("2026-04-30");
  });

  it("returns 31 days for May", () => {
    const { start, end } = getMonthBounds("2026-05");
    expect(start).toBe("2026-05-01");
    expect(end).toBe("2026-05-31");
  });

  it("returns 28 days for non-leap February", () => {
    const { start, end } = getMonthBounds("2025-02");
    expect(start).toBe("2025-02-01");
    expect(end).toBe("2025-02-28");
  });

  it("returns 29 days for leap February", () => {
    const { start, end } = getMonthBounds("2024-02");
    expect(start).toBe("2024-02-01");
    expect(end).toBe("2024-02-29");
  });

  it("throws on invalid format", () => {
    expect(() => getMonthBounds("2026-4")).toThrow();
    expect(() => getMonthBounds("not-a-month")).toThrow();
  });
});

describe("getPreviousMonth", () => {
  it("returns May when today is June 1", () => {
    expect(getPreviousMonth(new Date(2026, 5, 1))).toBe("2026-05");
  });

  it("returns April when today is May 15", () => {
    expect(getPreviousMonth(new Date(2026, 4, 15))).toBe("2026-04");
  });

  it("crosses year boundary: returns 2025-12 when today is Jan 15 2026", () => {
    expect(getPreviousMonth(new Date(2026, 0, 15))).toBe("2025-12");
  });

  it("returns previous month even on the last day", () => {
    expect(getPreviousMonth(new Date(2026, 2, 31))).toBe("2026-02");
  });
});
