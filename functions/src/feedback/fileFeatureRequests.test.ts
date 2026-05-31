import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

import {
  buildIssuePayload,
  createGitHubIssue,
  runFileFeatureRequests,
  truncateTitle,
} from "./fileFeatureRequests.js";

// ── Fake Firestore ─────────────────────────────────────────────────
//
// Minimal stand-in: one `families` collection whose docs expose
// `ref.collection('featureRequests')` (queryable by status/dedupKey) and
// `ref.collection('children').doc(id)`. Each request doc's `ref.update` mutates
// the backing object and records the patch so tests can assert write-back.

interface ReqEntry {
  id: string;
  data: Record<string, unknown>;
}

interface FamilyConfig {
  id: string;
  requests: ReqEntry[];
  children?: Record<string, { name?: string }>;
}

function buildDb(families: FamilyConfig[]): {
  db: Firestore;
  updateCalls: Array<{ id: string; patch: Record<string, unknown> }>;
} {
  const updateCalls: Array<{ id: string; patch: Record<string, unknown> }> = [];

  const familyDocs = families.map((fam) => {
    const docs = fam.requests.map((r) => ({
      id: r.id,
      data: () => r.data,
      ref: {
        update: vi.fn(async (patch: Record<string, unknown>) => {
          Object.assign(r.data, patch);
          updateCalls.push({ id: r.id, patch });
        }),
      },
    }));

    const requestsCol = {
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => ({
          docs: docs.filter((d) => d.data()[field] === value),
        }),
      }),
    };

    const childrenCol = {
      doc: (childId: string) => ({
        get: async () => {
          const c = fam.children?.[childId];
          return { exists: Boolean(c), data: () => c };
        },
      }),
    };

    return {
      id: fam.id,
      ref: {
        collection: (name: string) =>
          name === "featureRequests" ? requestsCol : childrenCol,
      },
    };
  });

  const db = {
    collection: (_name: string) => ({
      get: async () => ({ docs: familyDocs }),
    }),
  };

  return { db: db as unknown as Firestore, updateCalls };
}

function okFetch(htmlUrl: string): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 201,
    json: async () => ({ html_url: htmlUrl }),
    text: async () => "",
  })) as unknown as typeof fetch;
}

function makeEntry(over: Partial<Record<string, unknown>> = {}): ReqEntry {
  const { id, ...dataOver } = over as { id?: string } & Record<string, unknown>;
  return {
    id: id ?? "req-1",
    data: {
      quote: "I wish I could see all his missed words in one place",
      interpretedWant: "A single view of all of a child's missed sight words",
      context: "shelly-chat: sight words",
      createdAt: "2026-05-30T12:00:00.000Z",
      status: "new",
      dedupKey: "abc123",
      ...dataOver,
    },
  };
}

// ── Pure helpers ────────────────────────────────────────────────────

describe("truncateTitle", () => {
  it("returns short titles untouched", () => {
    expect(truncateTitle("A short want")).toBe("A short want");
  });

  it("ellipsizes overly long titles", () => {
    const long = "x".repeat(200);
    const out = truncateTitle(long, 20);
    expect(out.length).toBe(20);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildIssuePayload", () => {
  it("uses the interpretedWant as the title and includes the verbatim quote", () => {
    const { data } = makeEntry();
    const payload = buildIssuePayload(data as never);
    expect(payload.title).toBe(data.interpretedWant);
    expect(payload.body).toContain(data.quote as string);
    expect(payload.body).toContain(data.context as string);
    expect(payload.body).toContain(data.createdAt as string);
    expect(payload.body).toContain("Auto-filed from Shelly Chat");
    expect(payload.labels).toEqual(["feature-request", "source:shelly-chat"]);
  });

  it("adds a child label and line when a name resolves", () => {
    const { data } = makeEntry();
    const payload = buildIssuePayload(data as never, "Lincoln");
    expect(payload.labels).toContain("child:Lincoln");
    expect(payload.body).toContain("**Child:** Lincoln");
  });
});

// ── createGitHubIssue ───────────────────────────────────────────────

describe("createGitHubIssue", () => {
  it("POSTs with auth + versioned headers and returns html_url", async () => {
    const fetchImpl = okFetch("https://github.com/o/r/issues/7");
    const url = await createGitHubIssue(
      "tok",
      { title: "t", body: "b", labels: ["feature-request"] },
      fetchImpl,
    );
    expect(url).toBe("https://github.com/o/r/issues/7");
    const [calledUrl, init] = (fetchImpl as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(
      "https://api.github.com/repos/barnes-ngb/first-principles-engine/issues",
    );
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(headers.Accept).toBe("application/vnd.github+json");
  });

  it("throws on non-2xx", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => "forbidden",
    })) as unknown as typeof fetch;
    await expect(
      createGitHubIssue("tok", { title: "t", body: "b", labels: [] }, fetchImpl),
    ).rejects.toThrow("403");
  });
});

// ── runFileFeatureRequests ──────────────────────────────────────────

describe("runFileFeatureRequests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("files a new entry: POSTs an issue and writes back status+url", async () => {
    const entry = makeEntry({ childId: "child-1" });
    const { db, updateCalls } = buildDb([
      {
        id: "fam-1",
        requests: [entry],
        children: { "child-1": { name: "Lincoln" } },
      },
    ]);
    const fetchImpl = okFetch("https://github.com/o/r/issues/42");

    await runFileFeatureRequests({ db, token: "tok", fetchImpl });

    // POST happened once with the resolved child label.
    expect((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls)
      .toHaveLength(1);
    const init = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string) as {
      title: string;
      labels: string[];
    };
    expect(body.title).toBe(entry.data.interpretedWant);
    expect(body.labels).toContain("child:Lincoln");

    // Write-back resolved the entry.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch).toMatchObject({
      status: "filed",
      githubIssueUrl: "https://github.com/o/r/issues/42",
    });
    expect(entry.data.status).toBe("filed");
  });

  it("skips an entry whose dedupKey already has a filed sibling (no POST)", async () => {
    const fresh = makeEntry({ id: "req-new", status: "new", dedupKey: "dup" });
    const filed = makeEntry({
      id: "req-old",
      status: "filed",
      dedupKey: "dup",
      githubIssueUrl: "https://github.com/o/r/issues/1",
    });
    const { db, updateCalls } = buildDb([
      { id: "fam-1", requests: [fresh, filed] },
    ]);
    const fetchImpl = okFetch("https://github.com/o/r/issues/99");

    await runFileFeatureRequests({ db, token: "tok", fetchImpl });

    // No issue was opened…
    expect((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls)
      .toHaveLength(0);
    // …and the straggler was resolved to the existing issue.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].id).toBe("req-new");
    expect(updateCalls[0].patch).toMatchObject({
      status: "filed",
      githubIssueUrl: "https://github.com/o/r/issues/1",
    });
  });

  it("leaves an entry 'new' and continues when the POST fails", async () => {
    const failing = makeEntry({ id: "req-fail", dedupKey: "k1" });
    const ok = makeEntry({ id: "req-ok", dedupKey: "k2" });
    const { db, updateCalls } = buildDb([
      { id: "fam-1", requests: [failing, ok] },
    ]);

    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return {
          ok: false,
          status: 500,
          json: async () => ({}),
          text: async () => "boom",
        };
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({ html_url: "https://github.com/o/r/issues/2" }),
        text: async () => "",
      };
    }) as unknown as typeof fetch;

    await runFileFeatureRequests({ db, token: "tok", fetchImpl });

    // Both were attempted; only the successful one was written back.
    expect((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls)
      .toHaveLength(2);
    expect(failing.data.status).toBe("new");
    expect(ok.data.status).toBe("filed");
    expect(updateCalls.map((u) => u.id)).toEqual(["req-ok"]);
  });

  it("degrades safely when the secret is absent: no POST, no write, warns", async () => {
    const entry = makeEntry();
    const { db, updateCalls } = buildDb([{ id: "fam-1", requests: [entry] }]);
    const fetchImpl = okFetch("https://github.com/o/r/issues/3");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await runFileFeatureRequests({ db, token: undefined, fetchImpl });

    expect((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls)
      .toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
    expect(entry.data.status).toBe("new");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("GITHUB_PAT not configured"),
    );
  });
});
