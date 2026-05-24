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

Step 0 inventory complete. Awaiting Nathan's review before continuing to Step 1 (BEFORE/AFTER per-site migration plan).
