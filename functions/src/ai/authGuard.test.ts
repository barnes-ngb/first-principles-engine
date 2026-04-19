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
});
