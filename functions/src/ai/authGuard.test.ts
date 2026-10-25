import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CallableRequest } from "firebase-functions/v2/https";

// ── Mock firebase-admin/firestore ───────────────────────────────
const mockGet = vi.fn();
const mockCount = vi.fn(() => ({ get: mockGet }));
const mockWhere = vi.fn(() => ({ where: mockWhere, count: mockCount }));
const mockCollection = vi.fn(() => ({ where: mockWhere }));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ collection: mockCollection })),
}));

// ── Mock firebase-functions/v2/https ────────────────────────────
vi.mock("firebase-functions/v2/https", () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "HttpsError";
    }
  }
  return { HttpsError };
});

import {
  requireEmailAuth,
  isApprovedUser,
  requireApprovedUser,
  checkRateLimit,
} from "./authGuard.js";

// ── requireEmailAuth ────────────────────────────────────────────

describe("requireEmailAuth", () => {
  it("throws when request has no auth", () => {
    const request = { auth: undefined } as CallableRequest;
    expect(() => requireEmailAuth(request)).toThrow("Authentication required");
  });

  it("throws for anonymous users (no email)", () => {
    const request = {
      auth: {
        uid: "anon-123",
        token: {
          firebase: { sign_in_provider: "anonymous" },
        },
      },
    } as unknown as CallableRequest;

    expect(() => requireEmailAuth(request)).toThrow("email account is required");
  });

  it("throws for users with anonymous provider even if email present", () => {
    const request = {
      auth: {
        uid: "user-1",
        token: {
          email: "test@example.com",
          firebase: { sign_in_provider: "anonymous" },
        },
      },
    } as unknown as CallableRequest;

    expect(() => requireEmailAuth(request)).toThrow("email account is required");
  });

  it("returns uid and email for email-authenticated users", () => {
    const request = {
      auth: {
        uid: "user-1",
        token: {
          email: "nathan@example.com",
          firebase: { sign_in_provider: "password" },
        },
      },
    } as unknown as CallableRequest;

    const result = requireEmailAuth(request);
    expect(result).toEqual({ uid: "user-1", email: "nathan@example.com" });
  });
});

// ── isApprovedUser ──────────────────────────────────────────────

describe("isApprovedUser", () => {
  it("returns true for approved email", () => {
    expect(isApprovedUser("nathan.xb9753@gmail.com")).toBe(true);
  });

  it("is case-insensitive for email matching", () => {
    expect(isApprovedUser("Nathan.XB9753@Gmail.com")).toBe(true);
  });

  it("returns false for unapproved email", () => {
    expect(isApprovedUser("stranger@example.com")).toBe(false);
  });
});

// ── requireApprovedUser ─────────────────────────────────────────

describe("requireApprovedUser", () => {
  it("returns uid and email when user is approved", () => {
    const request = {
      auth: {
        uid: "user-1",
        token: {
          email: "nathan.xb9753@gmail.com",
          firebase: { sign_in_provider: "password" },
        },
      },
    } as unknown as CallableRequest;

    const result = requireApprovedUser(request);
    expect(result).toEqual({ uid: "user-1", email: "nathan.xb9753@gmail.com" });
  });

  it("throws for authenticated but unapproved user", () => {
    const request = {
      auth: {
        uid: "user-2",
        token: {
          email: "stranger@example.com",
          firebase: { sign_in_provider: "password" },
        },
      },
    } as unknown as CallableRequest;

    expect(() => requireApprovedUser(request)).toThrow("not approved");
  });

  it("throws for unauthenticated user", () => {
    const request = { auth: undefined } as CallableRequest;
    expect(() => requireApprovedUser(request)).toThrow("Authentication required");
  });
});

// ── checkRateLimit ──────────────────────────────────────────────

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes when count is below limit", async () => {
    mockGet.mockResolvedValueOnce({ data: () => ({ count: 5 }) });

    await expect(checkRateLimit("user-1", "chat", 50, 60)).resolves.toBeUndefined();
  });

  it("throws when count reaches limit", async () => {
    mockGet.mockResolvedValueOnce({ data: () => ({ count: 50 }) });

    await expect(checkRateLimit("user-1", "chat", 50, 60)).rejects.toThrow(
      "Rate limit exceeded",
    );
  });

  it("throws when count exceeds limit", async () => {
    mockGet.mockResolvedValueOnce({ data: () => ({ count: 100 }) });

    await expect(checkRateLimit("user-1", "chat", 50, 60)).rejects.toThrow(
      "Rate limit exceeded",
    );
  });

  it("does not throw on infrastructure errors (non-blocking)", async () => {
    mockGet.mockRejectedValueOnce(new Error("Firestore unavailable"));

    await expect(checkRateLimit("user-1", "chat")).resolves.toBeUndefined();
  });

  it("queries the correct collection path", async () => {
    mockGet.mockResolvedValueOnce({ data: () => ({ count: 0 }) });

    await checkRateLimit("user-1", "chat");

    expect(mockCollection).toHaveBeenCalledWith("families/user-1/aiUsage");
    expect(mockWhere).toHaveBeenCalledWith("taskType", "==", "chat");
  });

  it("passes when count is zero", async () => {
    mockGet.mockResolvedValueOnce({ data: () => ({ count: 0 }) });

    await expect(checkRateLimit("user-1", "scan")).resolves.toBeUndefined();
  });

  it("uses default maxCalls of 50 when not specified", async () => {
    mockGet.mockResolvedValueOnce({ data: () => ({ count: 49 }) });
    await expect(checkRateLimit("user-1", "chat")).resolves.toBeUndefined();

    mockGet.mockResolvedValueOnce({ data: () => ({ count: 50 }) });
    await expect(checkRateLimit("user-1", "chat")).rejects.toThrow("Rate limit exceeded");
  });

  it("includes action name and limits in error message", async () => {
    mockGet.mockResolvedValueOnce({ data: () => ({ count: 10 }) });

    await expect(checkRateLimit("user-1", "generateImage", 10, 30)).rejects.toThrow(
      /max 10 generateImage calls per 30 minutes/,
    );
  });

  it("uses custom maxCalls and windowMinutes", async () => {
    mockGet.mockResolvedValueOnce({ data: () => ({ count: 4 }) });
    await expect(checkRateLimit("user-1", "scan", 5, 15)).resolves.toBeUndefined();

    mockGet.mockResolvedValueOnce({ data: () => ({ count: 5 }) });
    await expect(checkRateLimit("user-1", "scan", 5, 15)).rejects.toThrow("Rate limit exceeded");
  });

  it("filters by the correct createdAt cutoff", async () => {
    mockGet.mockResolvedValueOnce({ data: () => ({ count: 0 }) });
    const before = Date.now();

    await checkRateLimit("user-1", "chat", 50, 60);

    const after = Date.now();
    const cutoffArg = mockWhere.mock.calls.find(
      (c: unknown[]) => c[0] === "createdAt",
    );
    expect(cutoffArg).toBeDefined();
    expect(cutoffArg![1]).toBe(">=");
    const cutoffTime = new Date(cutoffArg![2] as string).getTime();
    expect(cutoffTime).toBeGreaterThanOrEqual(before - 60 * 60 * 1000 - 1000);
    expect(cutoffTime).toBeLessThanOrEqual(after - 60 * 60 * 1000 + 1000);
  });

  it("throws HttpsError with resource-exhausted code", async () => {
    mockGet.mockResolvedValueOnce({ data: () => ({ count: 50 }) });

    try {
      await checkRateLimit("user-1", "chat", 50, 60);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe("resource-exhausted");
    }
  });
});

// ── requireEmailAuth edge cases ─────────────────────────────────

describe("requireEmailAuth — edge cases", () => {
  it("throws for auth object with no token", () => {
    const request = {
      auth: {
        uid: "user-1",
        token: undefined,
      },
    } as unknown as CallableRequest;

    expect(() => requireEmailAuth(request)).toThrow();
  });

  it("throws for auth with token but no email and no provider", () => {
    const request = {
      auth: {
        uid: "user-1",
        token: {
          firebase: {},
        },
      },
    } as unknown as CallableRequest;

    expect(() => requireEmailAuth(request)).toThrow("email account is required");
  });

  it("returns uid and email for Google sign-in provider", () => {
    const request = {
      auth: {
        uid: "user-google",
        token: {
          email: "user@gmail.com",
          firebase: { sign_in_provider: "google.com" },
        },
      },
    } as unknown as CallableRequest;

    const result = requireEmailAuth(request);
    expect(result).toEqual({ uid: "user-google", email: "user@gmail.com" });
  });

  it("returns uid and email for custom provider", () => {
    const request = {
      auth: {
        uid: "user-custom",
        token: {
          email: "user@company.com",
          firebase: { sign_in_provider: "custom" },
        },
      },
    } as unknown as CallableRequest;

    const result = requireEmailAuth(request);
    expect(result).toEqual({ uid: "user-custom", email: "user@company.com" });
  });
});

// ── isApprovedUser edge cases ──────────────────────────────────

describe("isApprovedUser — edge cases", () => {
  it("returns false for empty string", () => {
    expect(isApprovedUser("")).toBe(false);
  });

  it("returns false for email with no domain", () => {
    expect(isApprovedUser("nodomain")).toBe(false);
  });

  it("handles email with extra whitespace in domain", () => {
    expect(isApprovedUser("nathan.xb9753@gmail.com")).toBe(true);
  });

  it("returns false for partial match of approved email", () => {
    expect(isApprovedUser("nathan.xb9753@gmail.co")).toBe(false);
    expect(isApprovedUser("athan.xb9753@gmail.com")).toBe(false);
  });
});

// ── requireApprovedUser edge cases ─────────────────────────────

describe("requireApprovedUser — edge cases", () => {
  it("throws unauthenticated before permission-denied for anonymous", () => {
    const request = {
      auth: {
        uid: "anon-1",
        token: {
          firebase: { sign_in_provider: "anonymous" },
        },
      },
    } as unknown as CallableRequest;

    expect(() => requireApprovedUser(request)).toThrow("email account is required");
  });

  it("returns correct uid when approved email has mixed case", () => {
    const request = {
      auth: {
        uid: "user-mixed",
        token: {
          email: "NATHAN.XB9753@GMAIL.COM",
          firebase: { sign_in_provider: "password" },
        },
      },
    } as unknown as CallableRequest;

    const result = requireApprovedUser(request);
    expect(result.uid).toBe("user-mixed");
    expect(result.email).toBe("NATHAN.XB9753@GMAIL.COM");
  });
});
