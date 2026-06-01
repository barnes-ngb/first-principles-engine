# Shelly Portal — Feedback Loop (Friction Log → Auto-GitHub-Issue)

> **Status:** SHIPPED end-to-end. Capture (Step 5a) and the auto-issue routine
> (Step 5b) are both merged. Sections 1–4 below are the original recon that
> grounded the build; the recommended mechanism (a) is what was built.
> Supports §5 of the Shelly Portal design (the feedback-to-Nathan loop).

There is no `docs/SHELLY_PORTAL_CONTEXT.md` yet, so this is a standalone doc. Fold
the `## Feedback Loop` section into the portal context doc when it lands.

---

## 0. Activation — the ONE-TIME human step (Nathan, console)

The auto-issue routine (`fileFeatureRequests`, scheduled daily 08:00 CT) is live
in code and deploys harmlessly, but **it files nothing until Nathan provisions one
secret.** This is a console action only Nathan can do — the build agent never runs
it. Until it's done the function degrades safely: it logs a warning and writes
nothing (no half-filed entries, no crash).

**Do this once to activate the loop:**

1. **Create a fine-grained GitHub PAT** scoped to **`barnes-ngb/first-principles-engine`
   only**, with repository permission **Issues: Read and write** (nothing else).
   GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
2. **Store it as a Functions secret**, then redeploy functions:
   ```
   firebase functions:secrets:set GITHUB_PAT      # paste the token when prompted
   firebase deploy --only functions
   ```

That's it. On the next 08:00 CT run the routine reads every family's `'new'`
`featureRequests`, opens one labeled GitHub issue per distinct want, and marks each
`filed`. Rotating or revoking the token simply returns the function to its safe,
no-op state.

---

## Operational notes

- **`GITHUB_PAT` expires.** The secret is a **fine-grained token with an expiration date**.
  When it lapses, `fileFeatureRequests` **safely no-ops** — it logs a warning and writes nothing;
  it does **not** error, and it never affects the chat. **Rotate it before/after expiry** by
  re-running `firebase functions:secrets:set GITHUB_PAT` (paste a fresh token) and redeploying
  functions (`firebase deploy --only functions`). This is a one-time human/console action each
  rotation, exactly as at first setup (§0).
- **Cadence.** The routine runs **daily ~08:00 CT**, so issues for a given day's friction appear
  **the next morning**, labeled `feature-request` / `source:shelly-chat`.

---

## 1. The scheduled-CF pattern to copy

The repo has **exactly two** scheduled Cloud Functions today (verified — no others;
the only other `onSchedule` reference is a test stub at
`functions/src/ai/providers/__stubs__/firebase-functions-scheduler.ts`):

| CF | File | Cadence | Options |
|---|---|---|---|
| `weeklyReview` | `functions/src/ai/evaluate.ts:1015` | `"every sunday 19:00"` (Sun 7pm CT) | `timeZone: "America/Chicago"`, `secrets: [claudeApiKey]` |
| `generateMonthlyReview` | `functions/src/ai/monthlyReview.ts:96` | `"0 8 1 * *"` (8am, 1st of month) | `timeZone: "America/Chicago"`, `memory: "1GiB"`, `timeoutSeconds: 540`, `secrets: [claudeApiKey]` |

Both are declared with `onSchedule` from `firebase-functions/v2/scheduler` and
exported through `functions/src/index.ts`.

> Note on the Tier 1–3 maintenance jobs in `docs/review/REVIEW_HOME_BASE.md` §4
> (Health Audit / Fix Companion / Context Gather): those are **Claude Code
> scheduled tasks**, not Firestore Cloud Functions. They are *not* a template for
> this routine. The friction routine is a Cloud Function and should copy the
> monthly-review CF, which is the closest analog (scheduled, secrets, per-family
> iteration, Firestore write-back).

### Canonical template (`generateMonthlyReview`)

```ts
// functions/src/ai/monthlyReview.ts
import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { claudeApiKey } from "./aiConfig.js";

export const generateMonthlyReview = onSchedule(
  {
    schedule: "0 8 1 * *",          // cron, evaluated in timeZone below
    timeZone: "America/Chicago",
    memory: "1GiB",
    timeoutSeconds: 540,
    secrets: [claudeApiKey],         // declare every secret the handler reads
  },
  async () => {
    const db = getFirestore();
    const apiKey = claudeApiKey.value();   // read inside the handler only

    // Per-family / per-child fan-out — the standard iteration shape.
    const familiesSnap = await db.collection("families").get();
    for (const familyDoc of familiesSnap.docs) {
      const familyId = familyDoc.id;
      // ... do work, then write back:
      // await db.collection(`families/${familyId}/<collection>`).doc(id).set(payload);
    }
  },
);
```

**Secrets wiring** (`functions/src/ai/aiConfig.ts`): secrets are Google Cloud Secret
Manager values declared with `defineSecret` from `firebase-functions/params`:

```ts
export const claudeApiKey = defineSecret("CLAUDE_API_KEY");
export const openaiApiKey = defineSecret("OPENAI_API_KEY");
```

A handler must (1) import the secret, (2) list it in the `secrets: [...]` option,
(3) call `.value()` inside the handler. Secrets are set in the console / CLI with
`firebase functions:secrets:set <NAME>`; for the local emulator they go in
`functions/.secret.local`.

---

## 2. There is no GitHub-issue automation today

Confirmed by search (`octokit`, `@octokit`, `issues.create`, `createIssue`,
`api.github.com`, `GITHUB_TOKEN` across `functions/`, `src/`, and both `package.json`
files):

- **No Octokit dependency** anywhere in the repo.
- **No issue-creation code** of any kind.
- The **only** `GITHUB_TOKEN` use is the hosting deploy step in
  `.github/workflows/deploy.yml` (`repoToken: ${{ secrets.GITHUB_TOKEN }}` for
  `FirebaseExtended/action-hosting-deploy`). That token is scoped to that Action
  run and is unrelated to issue filing.

So **opening an issue from app code is net-new.** Two viable mechanisms:

### (a) Scheduled CF → GitHub REST  ✅ recommended

A scheduled Cloud Function (cloned from `generateMonthlyReview`) reads
`featureRequests` where `status == 'new'`, dedups, and for each opens an issue via
the GitHub REST API:

```
POST https://api.github.com/repos/barnes-ngb/first-principles-engine/issues
Authorization: Bearer <fine-grained PAT>
{ "title": ..., "body": ..., "labels": ["feature-request", "source:shelly-chat", ...] }
```

- The PAT is a **fine-grained Personal Access Token** scoped to this one repo with
  **Issues: Read & write**, stored in Secret Manager **exactly like the AI keys**
  (`defineSecret("GITHUB_PAT")` in `aiConfig.ts`, declared in the CF's `secrets`
  array, read with `.value()`).
- **No new client dependency** — call `fetch` directly (the CF runtime has global
  `fetch`), or add `@octokit/rest` only to `functions/`. `fetch` keeps the
  dependency surface at zero.
- **Fully automatic** once the secret exists. No data has to leave Firestore.

**The one human console step:** create the PAT and store the secret, once:
1. GitHub → Settings → Developer settings → Fine-grained tokens → generate a token
   scoped to `barnes-ngb/first-principles-engine` with **Issues: Read & write**.
2. `firebase functions:secrets:set GITHUB_PAT` (or paste it in the GCP Secret
   Manager console) and paste the token.

This is a console action **for Nathan** — the build agent never runs it.

### (b) GitHub Actions workflow (schedule / repository_dispatch)

A workflow reads exported `featureRequests` and opens issues with the built-in
`${{ secrets.GITHUB_TOKEN }}` (no app secret needed). **But** the Firestore data
has to *reach* the Action — either an export job writes a committed file, or a CF
fires a `repository_dispatch` with the payload. That is strictly more moving parts
(export pipeline + workflow + still a dispatch trigger) for a phone-first owner
with no local admin.

### Recommendation

**Mechanism (a).** One new secret, no new dependency, no export pipeline, and it
reuses the secrets + scheduled-CF pattern the codebase already runs. (b) trades the
one-time PAT for a permanent data-plumbing problem, which is the opposite of what a
phone-first, no-local-admin owner wants.

---

## 3. `featureRequests` is net-new — proposed schema

Confirmed there is **no** existing `featureRequests` or `frictionLog` collection or
type (`featureRequests` / `frictionLog` / `interpretedWant` return zero hits across
`src/` and `functions/`), and it is absent from the `CLAUDE.md` collections table.

**Path:** `families/{familyId}/featureRequests/{id}`

| Field | Type | Notes |
|---|---|---|
| `quote` | `string` | Shelly's own words (the friction, verbatim). |
| `interpretedWant` | `string` | AI one-line restatement of the want. |
| `childId` | `string?` | Optional — present when the friction is child-scoped. |
| `context` | `string` | Page / topic where it surfaced (e.g. `"planner-chat"`). |
| `createdAt` | `string` | Date string, `YYYY-MM-DD` per the repo date convention. |
| `status` | `'new' \| 'filed' \| 'done'` | Lifecycle. Routine reads `'new'`. |
| `dedupKey` | `string` | Hash of normalized `interpretedWant` (see below). |
| `githubIssueUrl` | `string?` | Written back after the issue is opened. |

Use `as const` + companion type for `status` (no `enum` — `erasableSyntaxOnly`):

```ts
export const FeatureRequestStatus = {
  New: 'new',
  Filed: 'filed',
  Done: 'done',
} as const
export type FeatureRequestStatus =
  (typeof FeatureRequestStatus)[keyof typeof FeatureRequestStatus]
```

### Dedup key — mirror the `xpLedger` pattern

The XP ledger achieves idempotency with a deterministic per-event doc id
(`firestore.ts`): `xpLedgerDocId(childId, dedupKey) => \`${childId}_${dedupKey}\``,
and `addXpEvent` skips the write if that doc already exists. Apply the same idea:
`dedupKey` is a hash of the **normalized** `interpretedWant` (lowercased, trimmed,
whitespace-collapsed), and the routine skips any request whose `dedupKey` already
has `status != 'new'` (or already has a `githubIssueUrl`). This prevents repeated
phrasings of the same want from opening duplicate issues.

### Routine rules

1. Query `featureRequests` where `status == 'new'`.
2. Group / dedup by `dedupKey`; skip ones already filed.
3. For each unique want, open **one** labeled issue:
   `feature-request`, `source:shelly-chat`, plus an optional child label.
4. Write back `status: 'filed'` and `githubIssueUrl` on the doc(s).

---

## 4. Silent-capture hook point

Per the design ethos, the chat logs friction **silently in the background** — it
must **not** interrupt Shelly with "want to file a request?". Capture is a
fire-and-forget Firestore write that never alters the chat reply.

**Where it hooks in:** the same chat-response path the portal recon identifies —
the `handleSend` callback in `src/features/shelly-chat/ShellyChatPage.tsx`
(`:457`). That callback writes the user message, calls the `shellyChat` Cloud
Function via `useAI()`'s `chat({ taskType: 'shellyChat', ... })`
(`functions/src/ai/tasks/shellyChat.ts`), then persists the assistant reply with
`addDoc(shellyChatMessagesCollection(...))` (around `:547`). The point **right
after the assistant reply comes back** is the canonical insertion point. (There is
no `applyChatAction` / `chatHandlers.ts` symbol in the codebase today — the send
handler lives inline in `ShellyChatPage.tsx`.)

At that point, if the model flagged a friction signal in its response, fire a
fire-and-forget `featureRequests/{id}` write with `status: 'new'` and move on — no
UI, no prompt, no blocking, no change to the rendered reply. The scheduled routine
in §1–§3 does the rest, out of band.

---

## Summary

- **Mechanism:** scheduled CF → GitHub REST with a fine-grained PAT in Secret
  Manager. One new secret, no new dependency, no export pipeline; copies the
  `generateMonthlyReview` CF + `aiConfig.ts` secrets pattern.
- **One human console step:** create a fine-grained PAT (Issues: R/W, this repo)
  and run `firebase functions:secrets:set GITHUB_PAT`. The build agent never runs
  this.
- **Ledger:** nothing here is a code change, so no ledger item is created by this
  recon. The build work (new `featureRequests` collection + CLAUDE.md table entry +
  the friction CF + the silent-capture write) should become a ledger item when the
  build prompt runs.
