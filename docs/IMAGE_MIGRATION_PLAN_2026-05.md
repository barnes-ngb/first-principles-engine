# Image Generation Migration Plan — Phase A + B

**Date:** 2026-05-24
**Source audit:** `docs/MODEL_UPGRADE_PROPOSAL_2026-05.md`
**Branch:** `claude/determined-bardeen-lSg6Z` (designated branch from session config; prompt suggested `claude/image-gen-migration-phaseAB` — staying on the designated one per system rules)
**Status:** Step 0 — inventory only. No code changes yet.

---

## Step 0 — Verified inventory

### Default model string

- **`functions/src/ai/providers/openai.ts:23`** — `const model = options?.model ?? "dall-e-3";`
  This is the **provider-level default** used by any call into `provider.generateImage(prompt, options)` that omits `options.model`. The provider then branches at line 24 (`const isGptImage = model === "gpt-image-1";`) and falls into the DALL-E 3 path at lines 46–52 (using URL response shape).
- **`functions/src/ai/imageTasks/generateImage.ts:181`** — `model: isSticker ? "gpt-image-1" : "dall-e-3"`
  The non-sticker branch hard-codes `dall-e-3`. Two further references at lines 268 and 282 use `imageOpts.model ?? "dall-e-3"` as the label fallback when writing Storage metadata + the `aiUsage` doc.
- **`functions/src/ai/aiService.ts:16`** — `DallE3: "dall-e-3"` constant inside the `ImageModel` `as const` map. Not currently consumed anywhere by name (call sites use the raw string literal), but it is exported as part of the public service contract.

### dall-e-3 call sites (proposal claimed 5 — confirmed 5 distinct task files + 1 provider default + 1 constant)

All five sites pipe through `provider.generateImage(prompt, options)` (from `createOpenAiProvider`), which means each one already has dual-mode response handling (`b64Data` ?? `url`). None of them call the OpenAI SDK directly.

| # | File:line | Function | Params passed | Response parsing | aiUsage label |
|---|---|---|---|---|---|
| 1 | `functions/src/ai/imageTasks/avatarPiece.ts:92–96` | `generateAvatarPiece` | `{ model: "dall-e-3", size: "1024x1024", quality: "standard" }` | Dual: `if (b64Data) … else if (url) fetch+download` (lines 103–112). Storage metadata at 126 → `generatedBy: "dall-e-3"`. | `aiUsage.model = "dall-e-3"` (line 141), `taskType = "avatar-piece-generation"` |
| 2 | `functions/src/ai/imageTasks/baseCharacter.ts:84–87` | `generateBaseCharacter` | `{ model: "dall-e-3", size: "1024x1024", quality: "standard" }` (+ trailing `. Safe for children, family-friendly.` appended to prompt) | Dual: lines 94–103. Storage metadata at 116. | `aiUsage.model = "dall-e-3"` (line 130), `taskType = "base-character-generation"` |
| 3 | `functions/src/ai/imageTasks/armorSheet.ts:166–169` | `generateArmorSheet` | `{ model: "dall-e-3", size: "1024x1024", quality: "standard" }` | Dual: lines 176–185. Storage metadata at 198. | `aiUsage.model = "dall-e-3"` (line 225), `taskType = "armor-sheet-generation"` |
| 4 | `functions/src/ai/imageTasks/starterAvatar.ts:76–79` | `generateStarterAvatar` | `{ model: "dall-e-3", size: "1024x1024", quality: "standard" }` | Dual: lines 86–95. Storage metadata at 108. | `aiUsage.model = "dall-e-3"` (line 122), `taskType = "starter-avatar-generation"` |
| 5 | `functions/src/ai/imageTasks/generateImage.ts:180–186` | `generateImage` (non-sticker branch) | `{ model: "dall-e-3", size: size ?? "1024x1024", quality: "standard", background: undefined, outputFormat: undefined }` | Dual: lines 232–252 (notable — this site explicitly fetches the URL and downloads via `fetch`). Storage metadata at 268. | `aiUsage.model = imageOpts.model ?? "dall-e-3"` (line 282), `taskType = "image-generation"` |

Provider default (#6, not a task): `functions/src/ai/providers/openai.ts:23` — covered above.
Constant declaration (#7): `functions/src/ai/aiService.ts:16` — not consumed by call sites.

**All 5 task sites currently pass `quality: "standard"`. All use `size: "1024x1024"` except `generateImage.ts` which forwards the caller's `size` (validated set: `1024x1024`, `1024x1792`, `1792x1024`).** No `style: "vivid"|"natural"` and no `response_format` parameter found anywhere — those would have lived in the provider, but the provider doesn't pass them either.

### gpt-image-1 call sites (proposal listed: sticker, armor-piece, face skin, sketch enhance, plus photo-transform and armor-reference via edit endpoint)

Two patterns: (a) calls routed through `createOpenAiProvider` (sticker path of `generateImage.ts` + `enhanceSketch.ts`), and (b) calls that import the OpenAI SDK directly and bypass the provider abstraction (the other four — `armorPiece`, `minecraftSkin`, `photoTransform`, `armorReference`).

| # | File:line | Function | Endpoint | Params passed | Response parsing | aiUsage label |
|---|---|---|---|---|---|---|
| 1 | `functions/src/ai/imageTasks/generateImage.ts:180–186` | `generateImage` (sticker branch) | `images.generate` via provider | `{ model: "gpt-image-1", size: "1024x1024", background: "transparent", outputFormat: "png" }` (quality undefined) | b64-only path is hit via the same code that handles DALL-E URLs (lines 232–252). | `aiUsage.model = imageOpts.model` (line 282) → `"gpt-image-1"` |
| 2 | `functions/src/ai/imageTasks/armorPiece.ts:71–78` | `generateArmorPiece` | `images.generate` direct SDK | `{ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", background: "transparent", output_format: "png" }` cast via `as Parameters<…>[0]` | b64-only (line 80–82). Storage metadata at 100. | `aiUsage.model = "gpt-image-1"` (line 116), `taskType = "armor-piece-generation"` |
| 3 | `functions/src/ai/imageTasks/minecraftSkin.ts:71–78` | `generateMinecraftSkin` | `images.generate` direct SDK | `{ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", background: "transparent", output_format: "png" }` cast via `as Parameters<…>[0]` | b64-only (line 80–82). Storage metadata at 100. | `aiUsage.model = "gpt-image-1"` (line 114), `taskType = "minecraft-skin"` |
| 4 | `functions/src/ai/imageTasks/photoTransform.ts:91–97` | `transformAvatarPhoto` | `images.edit` direct SDK | `{ model: "gpt-image-1", image: File, prompt, n: 1, size: "1024x1024" }` (no `background`, no `output_format` — edit endpoint constraint) | b64-only (line 99–101). Storage metadata at 129. | `aiUsage.model = "gpt-image-1"` (line 143), `taskType = "photo-transform"` |
| 5 | `functions/src/ai/imageTasks/armorReference.ts:152–158` | `generateArmorReference` | `images.edit` direct SDK | `{ model: "gpt-image-1", image: File, prompt, n: 1, size: "1024x1024" }` (no `background`, no `output_format`) | b64-only (line 160–162). Storage metadata at 190. | `aiUsage.model = "gpt-image-1"` (line 217), `taskType = "armor-reference-generation"` |
| 6 | `functions/src/ai/imageTasks/enhanceSketch.ts:196–206` | `enhanceSketch` | `images.edit` via provider | `{ size: "1024x1024", outputFormat: "png", background: transparent ? "transparent" : "auto" }` (model implicit — provider hard-codes `gpt-image-1` at line 75) | b64-only (line 244–251). Storage metadata at 264. | `aiUsage.model = "gpt-image-1"` (line 278), `taskType = "sketch-enhancement"` |

Provider sites (within `functions/src/ai/providers/openai.ts`):
- Line 24: `const isGptImage = model === "gpt-image-1";`
- Line 29: generate branch with `{ model: "gpt-image-1", prompt, n: 1, size, background, output_format }`
- Line 75: edit branch always passes `{ model: "gpt-image-1", image, prompt, size, background }`

Constant declaration: `functions/src/ai/aiService.ts:17` — `GptImage1: "gpt-image-1"`.

**Pattern note for migration:** the four "direct SDK" sites use a `as Parameters<typeof openai.images.generate>[0]` cast (visible in `armorPiece.ts:78`, `minecraftSkin.ts:78`) — that cast was needed because the SDK's TypeScript types may not yet model `background` / `output_format` on `gpt-image-1`. Same problem may apply to `gpt-image-1.5`. Tests / Step 2 will confirm.

### aiUsage tracking

The model-label string is written in two places per task:
1. **Storage metadata** (`file.save({ metadata: { metadata: { generatedBy: … } } })`) — used for forensic "what created this asset" lookups in the Storage console.
2. **`aiUsage` collection doc** (`db.collection(\`families/{familyId}/aiUsage\`).add({ model: … })`) — used by `src/features/settings/AIUsagePanel.tsx` for cost dashboards.

Current label strings (must update in lockstep with the model swap):
- 5 dall-e-3 sites all write `"dall-e-3"` in both metadata + aiUsage.
- 6 gpt-image-1 sites all write `"gpt-image-1"` in both metadata + aiUsage.
- `generateImage.ts` uses `imageOpts.model ?? "dall-e-3"` (the `?? "dall-e-3"` fallback should be updated to the new default in Step 2).

**Client-side display labels** at `src/features/settings/AIUsagePanel.tsx`:
- Line 26–27 `MODEL_LABELS`: `'dall-e-3': 'DALL-E 3'`, `'gpt-image-1': 'GPT Image'`. New row needed: `'gpt-image-1.5': 'GPT Image 1.5'`.
- Line 39 `IMAGE_MODELS` Set: must add `'gpt-image-1.5'`.
- Line 42–44 `IMAGE_COST_PER_CALL`: must add `'gpt-image-1.5'` row (~$0.06–$0.20 per call depending on quality; proposal cites ~$0.06 at medium).
- Old labels for `'dall-e-3'` and `'gpt-image-1'` must remain so historical aiUsage rows continue to display correctly.

### Response parsing patterns

Two clusters:

**(a) Sites that go through `provider.generateImage` / `provider.editImage` — handle both URL and b64_json:**
- `avatarPiece.ts:103–112`, `baseCharacter.ts:94–103`, `armorSheet.ts:176–185`, `starterAvatar.ts:86–95`, `generateImage.ts:228–252` — all five Phase-A sites. Each has a `if (imageResponse.b64Data) …else if (imageResponse.url) { fetch(url); arrayBuffer; Buffer.from }` shape.
- `enhanceSketch.ts:244–251` — b64Data only (no fallback to URL because the provider's edit branch always returns b64 anyway).

  → **Migration cost for cluster (a):** the b64 branch is *already in place*. The URL branch will become dead code after the swap and can be left (defensive) or removed for cleanliness. **No new download/upload plumbing required** — the existing b64 branch does `Buffer.from(b64, "base64")` directly into the same `file.save(buffer, …)` that the URL path feeds into. Provider's DALL-E branch (`openai.ts:46–58`) returns `url` and no `b64Data`; once that branch is deleted, the dual handling on the call sites becomes a single path. The function signatures (return `{ url, storagePath }`) are unchanged — clients still get a Firebase Storage download URL because the upload step runs after the buffer is in hand.

**(b) Sites that call the OpenAI SDK directly — already b64_json only:**
- `armorPiece.ts:80–82`, `minecraftSkin.ts:80–82`, `photoTransform.ts:99–101`, `armorReference.ts:160–162`.

  → **Migration cost for cluster (b):** model string swap only. Response shape is identical between `gpt-image-1` and `gpt-image-1.5` (both always return `b64_json` for the generate endpoint; both return PNG on edit endpoint).

**Conclusion: no call site currently parses `.data[0].url` without also handling `b64_json`. The riskiest claim in the prompt brief — "Any code currently parsing `response.data[0].url` will throw on the new model" — is mitigated by the dual handling already present in cluster (a) and is not relevant for cluster (b).** The cleanup of dead URL-handling branches is optional code hygiene; the migration is safe without it.

### Tests

Only two test files exercise the OpenAI image surface:

1. **`functions/src/ai/providers/openai.test.ts`** (96 lines, 5 tests):
   - Line 19–22: mocks `data: [{ url: "https://example.com/image.png", revised_prompt: "…" }]` — **URL-shaped**, needs update to b64.
   - Line 37–47: explicitly asserts `model: "dall-e-3"` is sent by default — **will fail** when the provider default changes to `gpt-image-1.5`.
   - Line 50–65: asserts `quality: "standard"` is sent on generate calls — **will fail** because gpt-image-1.5 rejects `quality: "standard"` (must be `low|medium|high|auto`).
   - Line 67–84: asserts custom `quality: "hd"` and `size: "1024x1792"` are forwarded — **will fail**: both values are invalid for gpt-image-1.5 (must map to `quality: "high"` and `size: "1024x1536"`).
   - Line 86–94: empty data array → empty URL — keeps passing (b64Data also undefined, url field becomes empty string already).
   - **`vi.mock("openai", …)` stubs only `images.generate`. No `images.edit` mock exists.** That's because the existing tests don't exercise `editImage` — Step 2 doesn't need to add edit-endpoint tests for Phase A (only Phase B paths use edit, and those have their own tests below or none at all).

2. **`functions/src/ai/aiService.test.ts`** (96 lines, 3 tests):
   - Line 47–50: `ImageResponse = { url: "https://example.com/img.png", revisedPrompt: "…" }` mock. This mock is at the service-interface level (already shape-agnostic to model) — passes a typed `ImageResponse` directly to the mocked `generateImage`. **No model-string coupling. Stays as-is.**

3. **`functions/src/ai/providers/__stubs__/openai.ts`** (5 lines): bare stub returning `data: []`. **No model coupling. Stays as-is.**

No other test files mock OpenAI image responses (confirmed via `grep -l "images.generate|images.edit|generateImage|editImage"` across `functions/src` test files — only the two above plus `aiService.test.ts` come back).

**Task-level tests:** none of `avatarPiece.ts`, `baseCharacter.ts`, `armorSheet.ts`, `starterAvatar.ts`, `generateImage.ts`, `armorPiece.ts`, `minecraftSkin.ts`, `photoTransform.ts`, `armorReference.ts` have a co-located `.test.ts`. Only `enhanceSketch.ts` has `enhanceSketch.test.ts` and `copyrightUtils.ts` has `copyrightUtils.test.ts` (not image-gen). Step 2 should not add per-task tests beyond what already exists, given how much would need to be mocked (Firestore, Storage, Claude rewriter, etc.) for marginal benefit — provider-level tests cover the model-swap surface.

---

## STOP — STEP 0 GATE

Step 0 inventory complete. Reviewed and approved 2026-05-25 — proceed to Step 1 using the five reasoned defaults below.

---

## Step 1 — Migration plan

**Date appended:** 2026-05-25
**Inputs:** Step 0 inventory above; OpenAI image API reference; existing call-site shapes.
**Status:** Plan-only. No code changes yet.

### Shared decisions (defaults applied)

| # | Decision | Default applied | Reasoning |
|---|---|---|---|
| 1 | Quality mapping for the 5 Phase A sites currently passing `quality: "standard"` | `"standard"` → `"medium"` (NOT `"auto"`) | Deterministic tier preserves predictable per-call cost and consistent visual output. `"auto"` lets OpenAI pick on each call, which would surprise both Lincoln/London avatar visual identity and the cost dashboard. `"hd"` (none present) would have mapped to `"high"`. |
| 2 | Default `output_format` | Keep `"png"` everywhere | Existing Storage paths all end `.png`, all `file.save` calls pass `contentType: "image/png"`, and the transparent-bg paths require `png` or `webp`. Switching to `webp` would require renaming files and re-encoding clients (e.g. avatar caching). Not worth the risk in this migration. |
| 3 | Portrait / landscape size mapping | Only `generateImage.ts` accepts caller sizes. Update the validSizes set: `1024x1792` → `1024x1536` (portrait), `1792x1024` → `1536x1024` (landscape). Keep `1024x1024`. Add a defensive client-input remap (accept legacy `1024x1792` / `1792x1024`, silently map to new sizes) so any in-flight client code keeps working without a coordinated client release. | The 5 hard-coded `1024x1024` sites need no size change. `generateImage.ts:16` (the request type) + `generateImage.ts:98` (the validSizes Set) are the only places. Defensive remap is cheap (5 lines) and reversible. |
| 4 | Fallback strategy for `gpt-image-1.5` org-verification 403 | HARD-FAIL with a clear `HttpsError("failed-precondition", "OpenAI org verification incomplete — ask Dad to complete API Organization Verification in OpenAI dashboard.")`. Do NOT transparently fall back to `gpt-image-1`. | Prompt's guardrails section explicitly forbids silent fallback. A silent fallback also hides the verification gap from Nathan and lets avatar generation drift back to a deprecated model (gpt-image-1 retires Oct 23, 2026). Hard-fail surfaces the issue once, Nathan completes verification once, problem solved. |
| 5 | Backward-compat for client callers | No client-side change required. Every callable Cloud Function (`generateImage`, `generateAvatarPiece`, `generateStarterAvatar`, `generateArmorPiece`, `generateBaseCharacter`, `generateArmorSheet`, `generateArmorReference`, `enhanceSketch`, `transformAvatarPhoto`, `generateMinecraftSkin`) currently returns `{ url: string, storagePath: string, …}`. After migration, the internal flow becomes b64 → decode → `file.save` → return a Firebase Storage download URL — same return shape. Clients see only the URL, identical contract. | The b64 → Storage upload step already exists in every site (per Step 0 cluster analysis). Nothing in the public surface changes. |

### SDK cast status (Phase B explicit)

`functions/package-lock.json` resolves `openai@4.104.0`. The model-string union in that SDK version predates `gpt-image-1.5` and almost certainly does not include it. Two consequences:

1. **The 4 direct-SDK call sites that already use `as Parameters<typeof openai.images.generate>[0]`** (`armorPiece.ts:78`, `minecraftSkin.ts:78`) keep the cast. Same workaround applies — the cast bypasses the model-name union check and lets us pass `"gpt-image-1.5"` as a string. **No SDK bump required for this migration.**

2. **`armorReference.ts:152–158`** (`openai.images.edit({ model: "gpt-image-1", … })`) and **`photoTransform.ts:91–97`** (same shape) do NOT currently have a cast. Once swapped to `"gpt-image-1.5"`, the strict union may reject. **Step 2 action:** add the same `as Parameters<typeof openai.images.edit>[0]` cast at both sites, or use the provider's `editImage` (which already does the cast implicitly — but the provider path runs through the gpt-image-1 hard-coding at `openai.ts:75`, so the provider itself needs the cast updated).

3. **Provider** (`openai.ts:28–35` for generate, `openai.ts:74–80` for edit): no cast currently because `model` is computed from `options?.model ?? "<default>"` and TypeScript narrows the call arg without choking. When the default flips to `"gpt-image-1.5"`, the SDK's type-checker will probably reject. **Step 2 action:** add `as Parameters<typeof client.images.generate>[0]` and `as Parameters<typeof client.images.edit>[0]` casts at the provider's call sites.

**Step 2 will verify by running `npx tsc -b` from `functions/` after the swap — if the casts are unnecessary we delete them, if necessary we keep them with a one-line comment naming the SDK version and the missing type.**

A future cleanup (NOT this migration): bump `openai` to a version that natively types `gpt-image-1.5` and drop every cast. Defer to a separate prompt.

### `DallE3` constant rename in `aiService.ts:14–19`

Current:
```ts
export const ImageModel = {
  DallE3: "dall-e-3",
  GptImage1: "gpt-image-1",
} as const
export type ImageModel = (typeof ImageModel)[keyof typeof ImageModel]
```

No call site references either constant by name (Step 0 confirmed — all task sites use raw string literals). The constant is purely an exported contract surface.

**Step 2 change:**
```ts
export const ImageModel = {
  GptImage15: "gpt-image-1.5",
  /** @deprecated retiring Oct 23, 2026 — kept only for historical aiUsage row labeling. */
  GptImage1: "gpt-image-1",
} as const
export type ImageModel = (typeof ImageModel)[keyof typeof ImageModel]
```

- Removes `DallE3` entirely (the value would be misleading — the model itself was removed from the API on May 12, 2026; keeping the constant invites someone to use it).
- Adds `GptImage15` as the new primary.
- Keeps `GptImage1` with a deprecation comment so any future cleanup pass has a clear marker, and so the `ImageModel` union still includes the historical string for backward-compat with any aiUsage analytics typing.
- **No call site updates needed for this rename** — the rename is purely additive at the contract level (no consumers). If any new consumer wants the const, they get the new name.

If any later grep turns up a consumer of `ImageModel.DallE3`, that consumer is broken regardless of this rename (the model is gone) — surface it for separate fix, don't preserve the constant to mask the break.

---

### BEFORE / AFTER per call site

Each block cites the file:line, shows the parameter delta, and flags the per-site risk. No prose beyond what changes — surrounding code stays untouched.

#### 1. `functions/src/ai/providers/openai.ts:17–90` — provider — Phase A core

This is the linchpin. All 5 Phase A sites + the sticker variant of `generateImage` route through here. The current dual-branch (`isGptImage` vs DALL-E 3) collapses to a single generate path + a single edit path.

**BEFORE (lines 19–58, generate):**
```ts
async generateImage(prompt, options) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const model = options?.model ?? "dall-e-3";
  const isGptImage = model === "gpt-image-1";

  if (isGptImage) {
    // gpt-image-1: supports transparent backgrounds, returns b64_json
    const response = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: (options?.size as "1024x1024") ?? "1024x1024",
      background: options?.background ?? "auto",
      output_format: options?.outputFormat ?? "png",
    });

    const image = response.data?.[0];
    return {
      url: "",
      b64Data: image?.b64_json ?? undefined,
      revisedPrompt: undefined,
    };
  }

  // DALL-E 3: standard URL-based response
  const response = await client.images.generate({
    model,
    prompt,
    n: 1,
    size: (options?.size as "1024x1024") ?? "1024x1024",
    quality: (options?.quality as "standard") ?? "standard",
  });

  const image = response.data?.[0];
  return {
    url: image?.url ?? "",
    revisedPrompt: image?.revised_prompt,
  };
},
```

**AFTER (target):**
```ts
async generateImage(prompt, options) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const model = options?.model ?? "gpt-image-1.5";

  const response = await client.images.generate({
    model,
    prompt,
    n: 1,
    size: (options?.size as "1024x1024") ?? "1024x1024",
    quality: (options?.quality as "medium") ?? "medium",
    background: options?.background ?? "auto",
    output_format: options?.outputFormat ?? "png",
  } as Parameters<typeof client.images.generate>[0]);

  const image = response.data?.[0];
  return {
    url: "",
    b64Data: image?.b64_json ?? undefined,
    revisedPrompt: undefined,
  };
},
```

Changes:
- Model default: `"dall-e-3"` → `"gpt-image-1.5"`.
- Branching deleted — single path.
- `style` not present (good).
- `response_format` not present (good — gpt-image-1.5 always returns b64).
- `quality` now passed unconditionally (gpt-image-1.5 accepts it; the type cast covers any SDK lag).
- `background` + `output_format` now passed unconditionally.
- Return shape: always `{ url: "", b64Data, revisedPrompt: undefined }`. `revisedPrompt` is dropped because gpt-image-1.5 doesn't return `revised_prompt`. Callers that read `.revisedPrompt` (only `generateImage.ts:295` for the ImageGenResponse type) tolerate `undefined`.

**BEFORE (lines 61–88, edit) — unchanged except cast:**
```ts
const response = await client.images.edit({
  model: "gpt-image-1",
  image: imageFile,
  prompt,
  size: (options?.size as "1024x1024") ?? "1024x1024",
  background: options?.background ?? "auto",
});
```

**AFTER:**
```ts
const response = await client.images.edit({
  model: "gpt-image-1.5",
  image: imageFile,
  prompt,
  size: (options?.size as "1024x1024") ?? "1024x1024",
  background: options?.background ?? "auto",
} as Parameters<typeof client.images.edit>[0]);
```

Changes: model string + add cast (SDK 4.104 union likely lacks `gpt-image-1.5`).

**Risk: MEDIUM.** This is the central change. Provider tests at `providers/openai.test.ts` will break and need a full rewrite (Step 2 mock now returns `data: [{ b64_json: "…" }]`, default model assertion flips, quality assertion flips).

---

#### 2. `functions/src/ai/imageTasks/generateImage.ts:178–186, 268, 282` — `generateImage` — Phase A

**BEFORE:**
```ts
const isSticker = style === "book-sticker";
const imageOpts: ImageOptions = {
  model: isSticker ? "gpt-image-1" : "dall-e-3",
  size: isSticker ? "1024x1024" : (size ?? "1024x1024"),
  quality: isSticker ? undefined : "standard",
  background: isSticker ? "transparent" : undefined,
  outputFormat: isSticker ? "png" : undefined,
};
```

**AFTER:**
```ts
const isSticker = style === "book-sticker";
const imageOpts: ImageOptions = {
  model: "gpt-image-1.5",
  size: isSticker ? "1024x1024" : remapLegacySize(size ?? "1024x1024"),
  quality: isSticker ? undefined : "medium",
  background: isSticker ? "transparent" : undefined,
  outputFormat: isSticker ? "png" : undefined,
};
```

Plus, at file top, add the size validator update:
```ts
const validSizes = new Set(["1024x1024", "1024x1536", "1536x1024"]);
// Accept legacy DALL-E 3 sizes from clients still in flight:
const LEGACY_SIZE_REMAP: Record<string, string> = {
  "1024x1792": "1024x1536",
  "1792x1024": "1536x1024",
};
function remapLegacySize(s: string): string {
  return LEGACY_SIZE_REMAP[s] ?? s;
}
```

And the request type:
```ts
export interface ImageGenRequest {
  // …
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "1024x1792" | "1792x1024"; // last two: legacy, silently remapped
  // …
}
```

The two label fallbacks at lines 268 and 282 update:
```ts
generatedBy: imageOpts.model ?? "gpt-image-1.5",  // line 268
model: imageOpts.model ?? "gpt-image-1.5",         // line 282
```

The URL-download branch at lines 235–249 becomes dead code (gpt-image-1.5 never returns a URL). Leave it in place as defensive code — it's 15 lines and removing it doesn't change behavior. Mark with a comment: `// Dead post-gpt-image-1.5 migration; retained as defensive fallback.`

**Risk: LOW** — sticker branch was already using gpt-image-1.5-shaped code. Non-sticker branch just swaps the model string.

---

#### 3. `functions/src/ai/imageTasks/avatarPiece.ts:92–96, 126, 141` — `generateAvatarPiece` — Phase A

**BEFORE:**
```ts
imageResponse = await provider.generateImage(dallePrompt, {
  model: "dall-e-3",
  size: "1024x1024",
  quality: "standard",
});
// …
generatedBy: "dall-e-3",  // line 126
// …
model: "dall-e-3",         // line 141
```

**AFTER:**
```ts
imageResponse = await provider.generateImage(safeDescriptionPrompt, {
  model: "gpt-image-1.5",
  size: "1024x1024",
  quality: "medium",
});
// …
generatedBy: "gpt-image-1.5",  // line 126
// …
model: "gpt-image-1.5",         // line 141
```

Variable rename suggestion: `dallePrompt` → `safeDescriptionPrompt` (cosmetic; the variable name is now misleading). **Acceptable to skip the rename if it bloats the diff** — surface the suggestion, don't enforce.

**Risk: LOW.**

---

#### 4. `functions/src/ai/imageTasks/baseCharacter.ts:84–87, 116, 130` — `generateBaseCharacter` — Phase A

**BEFORE:**
```ts
imageResponse = await provider.generateImage(
  `${safePrompt}. Safe for children, family-friendly.`,
  { model: "dall-e-3", size: "1024x1024", quality: "standard" },
);
// …
generatedBy: "dall-e-3",  // 116
// …
model: "dall-e-3",         // 130
```

**AFTER:**
```ts
imageResponse = await provider.generateImage(
  `${safePrompt}. Safe for children, family-friendly.`,
  { model: "gpt-image-1.5", size: "1024x1024", quality: "medium" },
);
// …
generatedBy: "gpt-image-1.5",  // 116
// …
model: "gpt-image-1.5",         // 130
```

**Risk: LOW.**

---

#### 5. `functions/src/ai/imageTasks/armorSheet.ts:166–169, 198, 225` — `generateArmorSheet` — Phase A

**BEFORE:**
```ts
imageResponse = await provider.generateImage(
  `${safePrompt}. Safe for children, family-friendly.`,
  { model: "dall-e-3", size: "1024x1024", quality: "standard" },
);
// …
generatedBy: "dall-e-3",  // 198
// …
model: "dall-e-3",         // 225
```

**AFTER:** identical pattern — `dall-e-3` → `gpt-image-1.5`, `standard` → `medium`.

**Risk: LOW-MEDIUM.** Armor sheet is a 3×2 reference grid prompt that's been visually validated against DALL-E 3 output. gpt-image-1.5 may render the grid layout slightly differently. Flagged in smoke test (Step 4) — Nathan should compare against existing sheets to confirm visual parity is acceptable.

---

#### 6. `functions/src/ai/imageTasks/starterAvatar.ts:76–79, 108, 122` — `generateStarterAvatar` — Phase A

Same shape as #3–#5. `dall-e-3` → `gpt-image-1.5`, `standard` → `medium`.

**Risk: LOW.**

---

#### 7. `functions/src/ai/imageTasks/armorPiece.ts:71–78, 100, 116` — `generateArmorPiece` — Phase B

**BEFORE:**
```ts
const response = await openai.images.generate({
  model: "gpt-image-1",
  prompt: `${safePrompt}. Safe for children, family-friendly.`,
  n: 1,
  size: "1024x1024",
  background: "transparent",
  output_format: "png",
} as Parameters<typeof openai.images.generate>[0]);
// …
generatedBy: "gpt-image-1",  // 100
// …
model: "gpt-image-1",         // 116
```

**AFTER:**
```ts
const response = await openai.images.generate({
  model: "gpt-image-1.5",
  prompt: `${safePrompt}. Safe for children, family-friendly.`,
  n: 1,
  size: "1024x1024",
  background: "transparent",
  output_format: "png",
} as Parameters<typeof openai.images.generate>[0]);
// …
generatedBy: "gpt-image-1.5",  // 100
// …
model: "gpt-image-1.5",         // 116
```

Cast already present — no new cast needed. Transparent + PNG params preserved (required for transparent backgrounds per OpenAI docs).

**Risk: LOW.**

---

#### 8. `functions/src/ai/imageTasks/minecraftSkin.ts:71–78, 100, 114` — `generateMinecraftSkin` — Phase B

Identical pattern to #7. Cast already present.

**Risk: LOW.**

---

#### 9. `functions/src/ai/imageTasks/photoTransform.ts:91–97, 129, 143` — `transformAvatarPhoto` — Phase B (edit endpoint)

**BEFORE:**
```ts
const response = await openai.images.edit({
  model: "gpt-image-1",
  image: imageFile,
  prompt: `${safeInstruction}. Safe for children, family-friendly.`,
  n: 1,
  size: "1024x1024",
});
// …
generatedBy: "gpt-image-1",  // 129
// …
model: "gpt-image-1",         // 143
```

**AFTER:**
```ts
const response = await openai.images.edit({
  model: "gpt-image-1.5",
  image: imageFile,
  prompt: `${safeInstruction}. Safe for children, family-friendly.`,
  n: 1,
  size: "1024x1024",
} as Parameters<typeof openai.images.edit>[0]);
// …
generatedBy: "gpt-image-1.5",  // 129
// …
model: "gpt-image-1.5",         // 143
```

**Adds new `as Parameters<…>[0]` cast** — none present today. SDK 4.104 strongly types the edit endpoint's model field.

**Risk: LOW-MEDIUM.** Edit endpoint behavior on gpt-image-1.5 hasn't been visually verified for photo-to-stylized transforms. Smoke test in Step 4 should compare against a known good DALL-E 3 transform output.

---

#### 10. `functions/src/ai/imageTasks/armorReference.ts:152–158, 190, 217` — `generateArmorReference` — Phase B (edit endpoint)

Same shape as #9. Add `as Parameters<typeof openai.images.edit>[0]` cast.

**Risk: LOW-MEDIUM.** Same edit-endpoint visual-parity caveat as #9.

---

#### 11. `functions/src/ai/imageTasks/enhanceSketch.ts:196–206, 264, 278` — `enhanceSketch` — Phase B (provider edit path)

Call site uses `provider.editImage(...)` — the model swap happens in the provider (covered in #1). At the call-site level the only changes are the storage metadata label + aiUsage label.

**BEFORE:**
```ts
generatedBy: "gpt-image-1",  // 264
// …
model: "gpt-image-1",         // 278
```

**AFTER:**
```ts
generatedBy: "gpt-image-1.5",  // 264
// …
model: "gpt-image-1.5",         // 278
```

Body of the function unchanged.

**Risk: LOW** (changes here are label-only; the real change is upstream in the provider).

---

### Test mocks to update in Step 2

#### `functions/src/ai/providers/openai.test.ts` — rewrite

This file (96 lines, 5 tests) is the only test file that exercises the OpenAI image surface in a model-aware way. Tests that assert `model: "dall-e-3"`, `quality: "standard"`, or URL responses must flip:

- Default model assertion flips to `"gpt-image-1.5"`.
- Default quality assertion flips to `"medium"`.
- Mocks at lines 19–22, 37–47, 50–65, 67–84 all need to return `data: [{ b64_json: "<base64 placeholder>" }]` instead of `data: [{ url: "https://…" }]`.
- Custom-size test (lines 67–84) flips `1024x1792` → `1024x1536` and `quality: "hd"` → `quality: "high"`.
- Empty-data test (lines 86–94) keeps passing — `b64Data` is undefined, `url: ""` still returned.

**Add one new test:** assert that `gpt-image-1.5` receives `background` + `output_format` (the params that DALL-E 3 didn't accept and that we now pass unconditionally).

#### `functions/src/ai/aiService.test.ts` — keep as-is

Lines 47–50 mock at the service-interface level with a typed `ImageResponse`. Mock value `url: "https://example.com/img.png"` is shape-only; the test doesn't care which model produced it. **No change.**

#### `functions/src/ai/providers/__stubs__/openai.ts` — keep as-is

5-line bare stub returning `data: []`. No model coupling. **No change.**

#### `functions/src/ai/imageTasks/enhanceSketch.test.ts` — keep as-is

Tests `buildEnhancePrompt` only — pure string-building logic, no API surface. **No change.**

---

### Step 2 commit plan (preview)

One logical commit per migration phase, to keep `git revert` clean:

- Commit A: `feat(image-gen): Phase A — migrate dall-e-3 → gpt-image-1.5 with b64_json handling`
  - `providers/openai.ts` (single-path generate, both methods cast)
  - `aiService.ts` (`DallE3` → `GptImage15` rename)
  - `imageTasks/generateImage.ts` (model, size validator, label fallbacks)
  - `imageTasks/avatarPiece.ts`
  - `imageTasks/baseCharacter.ts`
  - `imageTasks/armorSheet.ts`
  - `imageTasks/starterAvatar.ts`
  - `src/features/settings/AIUsagePanel.tsx` (add `'gpt-image-1.5'` to MODEL_LABELS, IMAGE_MODELS, IMAGE_COST_PER_CALL)
  - `providers/openai.test.ts` (rewritten)

- Commit B: `feat(image-gen): Phase B — migrate gpt-image-1 → gpt-image-1.5 on transparent paths`
  - `imageTasks/armorPiece.ts`
  - `imageTasks/minecraftSkin.ts`
  - `imageTasks/photoTransform.ts` (+ new cast)
  - `imageTasks/armorReference.ts` (+ new cast)
  - `imageTasks/enhanceSketch.ts` (labels only)

Step 3 = Commit B, Step 4 = smoke test doc, Step 5 = docs alignment, Step 6 = push.

---

## STOP — STEP 1 GATE

Step 1 BEFORE/AFTER plan complete. Five defaults applied (medium quality, png output, size remap, hard-fail on org-verification, no client contract change). SDK cast status surfaced (2 sites already cast, 2 sites need new casts, provider needs new casts). `DallE3` constant rename plan: drop the constant, add `GptImage15`, keep `GptImage1` with deprecation comment.

Awaiting Nathan's review before any code changes in Step 2.
