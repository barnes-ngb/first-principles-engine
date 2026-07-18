import { describe, expect, it } from "vitest";

import {
  ALLOWED_ORDER_ORIGINS,
  checkRateLimit,
  HONEYPOT_FIELD,
  isAllowedOrigin,
  isPlausibleFamilyId,
  ORDER_LIMITS,
  validateOrderSubmission,
} from "./orderValidation.js";
import { writeOrder } from "./submitCatalogOrder.js";

const goodBody = {
  familyId: "fam-abcdef",
  customerName: "Sam",
  items: [{ productId: "prod-1", title: "Seed Vault Kit" }],
  note: "blue please",
  contact: "text 555",
};

describe("validateOrderSubmission", () => {
  it("accepts a well-formed order and normalizes it", () => {
    const result = validateOrderSubmission(goodBody);
    expect(result.ok).toBe(true);
    if (result.ok && !result.spam) {
      expect(result.order.customerName).toBe("Sam");
      expect(result.order.items).toEqual([{ productId: "prod-1", title: "Seed Vault Kit" }]);
      expect(result.order.note).toBe("blue please");
      expect(result.order.contact).toBe("text 555");
    }
  });

  it("drops empty optional fields rather than storing blanks", () => {
    const result = validateOrderSubmission({ ...goodBody, note: "   ", contact: "" });
    expect(result.ok).toBe(true);
    if (result.ok && !result.spam) {
      expect(result.order.note).toBeUndefined();
      expect(result.order.contact).toBeUndefined();
    }
  });

  it("treats a filled honeypot as spam — ok, but writes nothing", () => {
    const result = validateOrderSubmission({ ...goodBody, [HONEYPOT_FIELD]: "http://spam" });
    expect(result).toEqual({ ok: true, spam: true });
  });

  it("rejects a non-object body", () => {
    expect(validateOrderSubmission(null).ok).toBe(false);
    expect(validateOrderSubmission("nope").ok).toBe(false);
  });

  it("rejects a missing / blank customer name", () => {
    expect(validateOrderSubmission({ ...goodBody, customerName: "" }).ok).toBe(false);
    expect(validateOrderSubmission({ ...goodBody, customerName: "   " }).ok).toBe(false);
  });

  it("rejects an oversized name / note / contact", () => {
    expect(
      validateOrderSubmission({ ...goodBody, customerName: "x".repeat(ORDER_LIMITS.nameMax + 1) }).ok,
    ).toBe(false);
    expect(validateOrderSubmission({ ...goodBody, note: "x".repeat(ORDER_LIMITS.noteMax + 1) }).ok).toBe(
      false,
    );
    expect(
      validateOrderSubmission({ ...goodBody, contact: "x".repeat(ORDER_LIMITS.contactMax + 1) }).ok,
    ).toBe(false);
  });

  it("rejects an empty or over-long items list", () => {
    expect(validateOrderSubmission({ ...goodBody, items: [] }).ok).toBe(false);
    const many = Array.from({ length: ORDER_LIMITS.itemsMax + 1 }, (_, i) => ({
      productId: `p${i}`,
      title: "Kit",
    }));
    expect(validateOrderSubmission({ ...goodBody, items: many }).ok).toBe(false);
  });

  it("rejects malformed items (missing id/title, wrong shape, oversized)", () => {
    expect(validateOrderSubmission({ ...goodBody, items: [{ title: "no id" }] }).ok).toBe(false);
    expect(validateOrderSubmission({ ...goodBody, items: [{ productId: "p1" }] }).ok).toBe(false);
    expect(validateOrderSubmission({ ...goodBody, items: ["not an object"] }).ok).toBe(false);
    expect(
      validateOrderSubmission({
        ...goodBody,
        items: [{ productId: "p1", title: "x".repeat(ORDER_LIMITS.titleMax + 1) }],
      }).ok,
    ).toBe(false);
  });

  it("drops items not in the product allowlist and rejects when none survive", () => {
    const allowed = new Map([["prod-1", "Real Kit"]]);
    const mixed = validateOrderSubmission(
      {
        ...goodBody,
        items: [
          { productId: "prod-1", title: "Real Kit" },
          { productId: "prod-x", title: "Injected Kit" },
        ],
      },
      allowed,
    );
    expect(mixed.ok).toBe(true);
    if (mixed.ok && !mixed.spam) {
      expect(mixed.order.items).toEqual([{ productId: "prod-1", title: "Real Kit" }]);
    }

    const none = validateOrderSubmission(
      { ...goodBody, items: [{ productId: "prod-x", title: "Injected" }] },
      allowed,
    );
    expect(none.ok).toBe(false);
  });

  it("replaces a client-supplied title with the authoritative listed title", () => {
    const allowed = new Map([["prod-1", "Seed Vault Kit"]]);
    const result = validateOrderSubmission(
      { ...goodBody, items: [{ productId: "prod-1", title: "Free Xbox lol" }] },
      allowed,
    );
    expect(result.ok).toBe(true);
    if (result.ok && !result.spam) {
      // The browser's title snapshot is discarded — the server name wins.
      expect(result.order.items).toEqual([{ productId: "prod-1", title: "Seed Vault Kit" }]);
    }
  });

  it("passes all well-formed items on caps alone when the allowlist is unavailable", () => {
    const result = validateOrderSubmission(
      { ...goodBody, items: [{ productId: "prod-x", title: "Kit" }] },
      undefined,
    );
    expect(result.ok).toBe(true);
  });
});

describe("isPlausibleFamilyId", () => {
  it("accepts a UID-like id and rejects junk", () => {
    expect(isPlausibleFamilyId("abcDEF123_-")).toBe(true);
    expect(isPlausibleFamilyId("short")).toBe(false);
    expect(isPlausibleFamilyId("has spaces here")).toBe(false);
    expect(isPlausibleFamilyId("../evil")).toBe(false);
    expect(isPlausibleFamilyId(42)).toBe(false);
  });
});

describe("isAllowedOrigin", () => {
  it("allows only the catalog's own origins", () => {
    expect(isAllowedOrigin("https://barnesbro.web.app")).toBe(true);
    expect(isAllowedOrigin("https://firebasestorage.googleapis.com")).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
    expect(isAllowedOrigin(undefined)).toBe(false);
    expect(ALLOWED_ORDER_ORIGINS.length).toBeGreaterThan(0);
  });
});

describe("checkRateLimit", () => {
  it("allows up to the limit within a window, then blocks", () => {
    const store = new Map();
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("ip-1", now, store, 10, 60_000)).toBe(true);
    }
    expect(checkRateLimit("ip-1", now, store, 10, 60_000)).toBe(false);
  });

  it("resets after the window elapses", () => {
    const store = new Map();
    expect(checkRateLimit("ip-2", 0, store, 1, 1_000)).toBe(true);
    expect(checkRateLimit("ip-2", 500, store, 1, 1_000)).toBe(false);
    expect(checkRateLimit("ip-2", 1_001, store, 1, 1_000)).toBe(true);
  });

  it("tracks distinct keys independently", () => {
    const store = new Map();
    expect(checkRateLimit("a", 0, store, 1, 1_000)).toBe(true);
    expect(checkRateLimit("b", 0, store, 1, 1_000)).toBe(true);
    expect(checkRateLimit("a", 0, store, 1, 1_000)).toBe(false);
  });
});

describe("writeOrder", () => {
  it("writes a well-formed order to families/{familyId}/orders with status new + timestamps", async () => {
    const added: unknown[] = [];
    const collectionPaths: string[] = [];
    const db = {
      collection: (path: string) => {
        collectionPaths.push(path);
        return { add: async (doc: unknown) => void added.push(doc) };
      },
    } as unknown as FirebaseFirestore.Firestore;

    await writeOrder(db, "fam-abcdef", {
      customerName: "Sam",
      items: [{ productId: "prod-1", title: "Seed Vault Kit" }],
      note: "blue please",
    });

    expect(collectionPaths).toEqual(["families/fam-abcdef/orders"]);
    const doc = added[0] as Record<string, unknown>;
    expect(doc.status).toBe("new");
    expect(doc.customerName).toBe("Sam");
    expect(doc.items).toEqual([{ productId: "prod-1", title: "Seed Vault Kit" }]);
    expect(doc.note).toBe("blue please");
    expect(doc.createdAt).toEqual(doc.updatedAt);
    expect(typeof doc.createdAt).toBe("string");
    // No customer field beyond the minimally-scoped set (owner decision).
    expect("contact" in doc).toBe(false);
    expect("address" in doc).toBe(false);
    expect("email" in doc).toBe(false);
    expect("payment" in doc).toBe(false);
  });
});
