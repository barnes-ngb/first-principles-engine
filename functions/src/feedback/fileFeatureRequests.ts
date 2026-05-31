// ── Auto-issue routine (Build Step 5b) ────────────────────────────
//
// Closes the Shelly-portal feedback loop: a scheduled Cloud Function reads the
// silent friction log (`families/{familyId}/featureRequests`, written
// fire-and-forget by Step 5a's `logFeatureRequest`), opens one GitHub issue per
// distinct request, and marks each entry `filed`.
//
// This is the ONLY code path in the repo that talks to the GitHub API. It uses
// the Node-20 runtime's global `fetch` against the GitHub REST API — no Octokit,
// no new dependency (see docs/SHELLY_PORTAL_FEEDBACK_LOOP.md §2).
//
// Auth is a fine-grained Personal Access Token (Issues: Read & write, this repo
// only) stored in Secret Manager as `GITHUB_PAT`, declared + read exactly like
// the AI keys in aiConfig.ts. Until the human provisions that secret the
// function degrades safely: it logs a warning and writes nothing (see
// `runFileFeatureRequests`).

import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";

/** Fine-grained GitHub PAT (Issues: R/W, this repo) — see module header. */
const githubPat = defineSecret("GITHUB_PAT");

const REPO = "barnes-ngb/first-principles-engine";
const GITHUB_API_VERSION = "2022-11-28";

// ── Types (mirror src/core/types/feedback.ts — functions is a separate pkg) ──

/** Lifecycle of a captured feature request. `as const` — no enum. */
const FeatureRequestStatus = {
  New: "new",
  Filed: "filed",
  Done: "done",
} as const;
type FeatureRequestStatus =
  (typeof FeatureRequestStatus)[keyof typeof FeatureRequestStatus];

interface FeatureRequestDoc {
  quote: string;
  interpretedWant: string;
  childId?: string;
  context: string;
  createdAt: string;
  status: FeatureRequestStatus;
  dedupKey: string;
  githubIssueUrl?: string;
}

interface IssuePayload {
  title: string;
  body: string;
  labels: string[];
}

// ── Pure helpers ──────────────────────────────────────────────────

const TITLE_MAX = 120;

/** Trim and ellipsize so an issue title stays a sensible single line. */
export function truncateTitle(want: string, max = TITLE_MAX): string {
  const trimmed = want.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Assemble the GitHub issue payload from a captured request. The body leads
 * with Shelly's verbatim quote, then the structured metadata, and closes with a
 * footer marking it auto-filed. A resolvable child adds a `child:<Name>` label.
 */
export function buildIssuePayload(
  entry: FeatureRequestDoc,
  childName?: string,
): IssuePayload {
  const lines = [
    `> ${entry.quote}`,
    "",
    `**Interpreted want:** ${entry.interpretedWant}`,
    `**Context:** ${entry.context}`,
  ];
  if (childName) lines.push(`**Child:** ${childName}`);
  lines.push(`**Captured:** ${entry.createdAt}`);
  lines.push("");
  lines.push("---");
  lines.push(
    "_Auto-filed from Shelly Chat friction capture (Shelly portal feedback loop, Build Step 5b)._",
  );

  const labels = ["feature-request", "source:shelly-chat"];
  if (childName) labels.push(`child:${childName}`);

  return { title: truncateTitle(entry.interpretedWant), body: lines.join("\n"), labels };
}

// ── GitHub REST ───────────────────────────────────────────────────

/**
 * Open a GitHub issue via REST. Returns the new issue's `html_url`.
 * Throws on any non-2xx so the caller can leave the entry `new` and retry next
 * run.
 */
export async function createGitHubIssue(
  token: string,
  payload: IssuePayload,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(`https://api.github.com/repos/${REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "Content-Type": "application/json",
      "User-Agent": "first-principles-engine-feedback-bot",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub issue POST failed: ${res.status} ${detail}`.trim());
  }

  const json = (await res.json()) as { html_url?: string };
  if (!json.html_url) {
    throw new Error("GitHub issue POST succeeded but returned no html_url");
  }
  return json.html_url;
}

// ── Orchestration ─────────────────────────────────────────────────

/**
 * Read every family's `status == 'new'` feature requests and file each as a
 * GitHub issue, writing back `status: 'filed'` + `githubIssueUrl`.
 *
 * Safe-degradation contract:
 * - Empty/absent token → log a warning and return, writing nothing. This lets
 *   the function deploy and the human set the secret afterward.
 * - Per-entry network/HTTP failure → log, leave that entry `new` (so the next
 *   run retries), continue the batch. One bad request never aborts the run.
 *
 * Dedup is belt-and-suspenders: 5a already dedups on write, but if a re-run ever
 * sees a `new` entry whose `dedupKey` already has a non-`new` sibling, we file
 * no duplicate — we resolve the straggler to that sibling's issue instead.
 */
export async function runFileFeatureRequests(args: {
  db: Firestore;
  token: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const { db, token } = args;
  const fetchImpl = args.fetchImpl ?? fetch;

  if (!token) {
    console.warn(
      "[fileFeatureRequests] GITHUB_PAT not configured — skipping (no issues filed). " +
        "Set it with: firebase functions:secrets:set GITHUB_PAT",
    );
    return;
  }

  const familiesSnap = await db.collection("families").get();
  for (const familyDoc of familiesSnap.docs) {
    const familyId = familyDoc.id;
    const requestsCol = familyDoc.ref.collection("featureRequests");

    let newSnap;
    try {
      newSnap = await requestsCol
        .where("status", "==", FeatureRequestStatus.New)
        .get();
    } catch (err) {
      console.error(
        `[fileFeatureRequests] Failed to read featureRequests for family=${familyId}:`,
        err,
      );
      continue;
    }

    // Resolve each childId → name at most once per family.
    const childNameCache = new Map<string, string | undefined>();
    const resolveChildName = async (
      childId?: string,
    ): Promise<string | undefined> => {
      if (!childId) return undefined;
      if (childNameCache.has(childId)) return childNameCache.get(childId);
      let name: string | undefined;
      try {
        const childSnap = await familyDoc.ref
          .collection("children")
          .doc(childId)
          .get();
        name = childSnap.exists
          ? (childSnap.data() as { name?: string }).name
          : undefined;
      } catch {
        name = undefined;
      }
      childNameCache.set(childId, name);
      return name;
    };

    for (const reqDoc of newSnap.docs) {
      const entry = reqDoc.data() as FeatureRequestDoc;

      try {
        // Belt-and-suspenders dedup: if a sibling with the same dedupKey is
        // already filed/done, resolve this straggler instead of double-filing.
        const siblingSnap = await requestsCol
          .where("dedupKey", "==", entry.dedupKey)
          .get();
        const filedSibling = siblingSnap.docs.find(
          (d) =>
            d.id !== reqDoc.id &&
            (d.data() as FeatureRequestDoc).status !== FeatureRequestStatus.New,
        );
        if (filedSibling) {
          const siblingUrl = (filedSibling.data() as FeatureRequestDoc)
            .githubIssueUrl;
          await reqDoc.ref.update({
            status: FeatureRequestStatus.Filed,
            ...(siblingUrl ? { githubIssueUrl: siblingUrl } : {}),
          });
          console.log(
            `[fileFeatureRequests] Skipped duplicate (dedupKey=${entry.dedupKey}) for family=${familyId} — resolved to existing issue`,
          );
          continue;
        }

        const childName = await resolveChildName(entry.childId);
        const payload = buildIssuePayload(entry, childName);
        const issueUrl = await createGitHubIssue(token, payload, fetchImpl);

        await reqDoc.ref.update({
          status: FeatureRequestStatus.Filed,
          githubIssueUrl: issueUrl,
        });
        console.log(
          `[fileFeatureRequests] Filed ${issueUrl} for family=${familyId} (dedupKey=${entry.dedupKey})`,
        );
      } catch (err) {
        // Leave the entry `new` so the next run retries; keep the batch going.
        console.error(
          `[fileFeatureRequests] Failed to file request ${reqDoc.id} for family=${familyId} (left 'new' for retry):`,
          err,
        );
      }
    }
  }
}

// ── Scheduled Cloud Function ───────────────────────────────────────

export const fileFeatureRequests = onSchedule(
  {
    schedule: "every day 08:00",
    timeZone: "America/Chicago",
    secrets: [githubPat],
  },
  async () => {
    const db = getFirestore();
    await runFileFeatureRequests({ db, token: githubPat.value() });
  },
);
