# Image Generation Migration — Smoke Test Checklist

**Date:** 2026-05-25
**Branch / PR:** `claude/image-gen-migration-phaseAB` (PR #1217)
**Migration covered:** Phase A (`dall-e-3` → `gpt-image-1.5`) + Phase B (`gpt-image-1` → `gpt-image-1.5`).

Run this checklist on the tablet **after the deploy lands** (push to `deploy` branch or merge to `main` + functions deploy). Treat any unchecked row as "not yet verified" — don't assume parity from earlier paths.

---

## Pre-flight (do BEFORE triggering any path)

- [ ] OpenAI dashboard → Organization → API Organization Verification shows **complete**. If it isn't, every call below will return a `failed-precondition` HttpsError saying "OpenAI org verification incomplete — ask Dad to complete API Organization Verification in the OpenAI dashboard." Don't progress past this row until verification is green.
- [ ] Confirm Cloud Functions are on the new revision: in Firebase Console → Functions → check the deploy timestamp on `generateImage`, `generateBaseCharacter`, `generateArmorSheet`, `generateArmorPiece`, `enhanceSketch`. Should match the deploy you just did.

---

## Phase A paths (5) — sanity check

These five paths were broken in production since 2026-05-12 (DALL-E 3 removed). Expect them to start working again.

### 1. `generateImage` — book illustrations & general scenes
- **Trigger:** Book Editor → add illustrated page → pick a non-sticker style (e.g. "Storybook" or "Comic") → tap **Generate Image** with a simple prompt like "a friendly dragon in a meadow".
- **Expect:** Image renders within ~20 s, no red error toast, image appears in the page slot.
- **Confirm in Firebase Storage Console:** `families/{familyId}/generated-images/{timestamp}.png` exists, metadata `generatedBy: "gpt-image-1.5"`.
- **Confirm in Firestore:** Settings → AI Usage → most recent row shows model **"GPT Image 1.5"** and task type **"Image Generation"**.
- **Note for size:** if you pass a legacy size (`1024x1792` or `1792x1024`) from old client code, it should silently remap to the new portrait/landscape (`1024x1536` / `1536x1024`) and still succeed. New client code should send the new sizes directly.

### 2. `generateBaseCharacter` — full-body bare character (no armor)
- **Trigger:** My Avatar → Forge → start a new avatar build for Lincoln or London → pick a theme (Minecraft or Platformer) → confirm the **Base Character** step generates.
- **Expect:** Single full-body image renders, no armor visible, neutral pose, plain background. Settings → AI Usage shows a row labelled **"GPT Image 1.5"** with task type **"base-character-generation"**.
- **Confirm in Storage:** `families/{familyId}/avatars/{childId}/base-character.png`, metadata `generatedBy: "gpt-image-1.5"`.

### 3. `generateArmorSheet` — 3×2 reference grid (all 6 pieces, one call)
- **Trigger:** My Avatar → Forge → Armor Suite → trigger an armor sheet generation for a tier (Minecraft: stone / diamond / netherite OR Platformer: basic / powerup / champion).
- **Expect:** A 3-column × 2-row grid of 6 themed armor pieces (belt, breastplate, shoes, shield, helmet, sword/wand). Visual style matches the tier.
- **Risk to watch:** The armor-sheet prompt is the most prompt-engineering-sensitive Phase A path — gpt-image-1.5 may render the grid layout slightly differently than DALL-E 3. **Compare side-by-side against existing armor sheets for the same tier (Storage → `families/{familyId}/avatars/{childId}/armor-sheet-{tier}.png` had old versions before Phase A).** If grid spacing or piece order looks wrong, note which tier in this checklist and we'll iterate on the prompt rather than rolling back.
- **Confirm:** Storage `families/{familyId}/avatars/{childId}/armor-sheet-{tier}.png` updated, metadata `generatedBy: "gpt-image-1.5"`, Firestore `avatarProfiles/{childId}.armorSheetUrls[{tier}]` is the new URL, AI Usage row task type `armor-sheet-generation`.

### 4. `generateStarterAvatar` — one-off themed avatar shell
- **Trigger:** My Avatar → first-time setup → choose a theme → confirm starter avatar generates.
- **Expect:** Full-body themed character with simple starter outfit, no armor. Position is neutral, hands visible.
- **Confirm:** Storage `families/{familyId}/avatars/{childId}/starter.png`, metadata `gpt-image-1.5`, AI Usage row `starter-avatar-generation`.

### 5. `generateAvatarPiece` — single themed avatar piece
- **Trigger:** My Avatar → Forge → Avatar Piece flow → generate a non-armor piece (the codepath used by themed avatar customization, not the armor-piece flow).
- **Expect:** Single themed character image rendered, matching the piece description. (This path uses `images.generate` non-transparent.)
- **Confirm:** Storage `families/{familyId}/avatars/{childId}/{pieceId}.png`, metadata `gpt-image-1.5`, AI Usage row `avatar-piece-generation`.

---

## Phase B paths (5) — sanity check

These paths were working on `gpt-image-1` pre-migration. Expect parity, with possible visual subtleties because gpt-image-1.5 has been retrained.

### 6. `generateImage` (sticker variant) — transparent-background sticker
- **Trigger:** Book Editor → add a sticker → pick the **"Sticker"** style → generate with a simple prompt ("a smiling sun").
- **Expect:** Transparent-background PNG, no opaque white box behind the subject. Should drop into the page background cleanly.
- **Confirm:** AI Usage row model **"GPT Image 1.5"**, task type **"Image Generation"**, but Storage metadata `style: "book-sticker"`. Visually inspect the PNG against the page background — alpha channel must be transparent.

### 7. `generateArmorPiece` — single transparent armor piece (overlay)
- **Trigger:** My Avatar → Forge → generate an individual armor piece (e.g. a helmet for stone tier).
- **Expect:** Single piece on a transparent background, ready to layer over the base character.
- **Confirm:** Storage `families/{familyId}/avatars/{childId}/{pieceId}-{tier}.png`, metadata `gpt-image-1.5`. Open in an image viewer with a checker pattern background — confirm transparency.

### 8. `generateMinecraftSkin` — 8×8 pixel face skin
- **Trigger:** My Avatar → Customize → upload a photo → run the Minecraft skin face generator.
- **Expect:** Pixelated 8×8 face matching the photo's skin tone, hair color, eye color. Transparent background.
- **Confirm:** Storage `families/{familyId}/avatars/{childId}/minecraft-skin.png`, metadata `gpt-image-1.5`.
- **Risk to watch:** The 8×8 pixel grid prompt is precise — gpt-image-1.5 may produce slightly different pixel patterns than gpt-image-1. Eyeball whether the face still looks recognizable; if it's badly off, note here.

### 9. `transformAvatarPhoto` — photo-to-stylized character (edit endpoint)
- **Trigger:** My Avatar → Forge → "Use a photo of me" path → take/upload a photo → run the photo transform.
- **Expect:** A pixel-art (Minecraft) or cartoon (Platformer) character that matches the photo's hair color, skin tone, body proportions. Plain background.
- **Confirm:** Storage `families/{familyId}/avatars/{childId}/bare-character-from-photo.png`, metadata `gpt-image-1.5`.
- **Risk to watch:** Edit-endpoint behavior on gpt-image-1.5 hasn't been visually verified for photo-to-stylized transforms in this codebase. Compare against a pre-migration transform if one exists in Storage (Storage Console → object metadata `generatedBy` field). If the new transform looks significantly worse, note it — we may need to tune the prompt.

### 10. `generateArmorReference` — fully-armored character (edit endpoint)
- **Trigger:** My Avatar → Forge → after base character + armor sheet are generated → trigger the armor reference render for a tier.
- **Expect:** The base character with all 6 armor pieces overlaid in the same pose and background. Style consistent with the tier.
- **Confirm:** Storage `families/{familyId}/avatars/{childId}/armor-reference-{tier}.png`, metadata `gpt-image-1.5`, Firestore `avatarProfiles/{childId}.armorReferenceUrls[{tier}]` updated.
- **Risk to watch:** Same edit-endpoint caveat as #9. If the armor doesn't apply cleanly or the character changes pose/proportions, that's the issue to flag.

### 11. `enhanceSketch` — kid's sketch → polished illustration (edit endpoint, via provider)
- **Trigger:** Book Editor → add a sketch page → draw something → tap **Reimagine**. Try once with `transparent: false` (scene) and once with `transparent: true` (sticker).
- **Expect:** Polished illustration in the picked style; transparent variant has no background or ground shadows.
- **Confirm:** Storage `families/{familyId}/sketches/{timestamp}_enhanced.png`, metadata `gpt-image-1.5`, AI Usage row `sketch-enhancement`.

---

## Failure modes to watch for

- **403 / "organization" / "verification" in the error message:** the new failed-precondition branch in `generateImage.ts` will surface this as *"OpenAI org verification incomplete — ask Dad to complete API Organization Verification in the OpenAI dashboard."* The other 9 task sites don't have this branch (they were Phase B / direct-SDK) — those will surface a generic "internal" error containing "403". Either way: complete OpenAI org verification before retrying.
- **Slow generation:** gpt-image-1.5 should be **faster** than dall-e-3 (~20% per the migration brief), not slower. If a single call routinely takes >30 s, check Cloud Function logs (Firebase Console → Functions → Logs → filter by the function name) for latency anomalies.
- **Empty or black images:** likely a base64 decode bug — check the Cloud Function log for the actual response shape. The b64 path is `Buffer.from(b64, "base64")` in every site; a malformed `b64_json` value would surface here.
- **Watermark / quality regression:** compare a sample of generated images against pre-migration screenshots in Storage Console (filter `generatedBy: "dall-e-3"` for Phase A baselines, `generatedBy: "gpt-image-1"` for Phase B baselines).
- **Wrong cost on the AI Usage dashboard:** `IMAGE_COST_PER_CALL['gpt-image-1.5']` is set to **$0.06** as a provisional medium-quality estimate. Once you've seen actual OpenAI billing for 5–10 generations, update the constant in `src/features/settings/AIUsagePanel.tsx` if the real per-call cost is materially different. Historical `dall-e-3` and `gpt-image-1` rows continue to use their own per-call rates.
- **Stickers come back with opaque white backgrounds:** the sticker path passes `background: "transparent"` + `output_format: "png"`. If gpt-image-1.5 ignores `background: "transparent"`, that's an OpenAI behavior change — capture the Storage file and check its alpha channel in an image viewer. May need to fall back to `gpt-image-1` for sticker paths specifically (NOT the default fallback the prompt forbade — that was for org-verification 403s only).

---

## After all rows are green

- [ ] Open Firestore Console → `families/{familyId}/aiUsage` → confirm no rows logged with model `"dall-e-3"` after the deploy timestamp. New rows should all be `"gpt-image-1.5"`.
- [ ] Spot-check the cost estimate on the AI Usage panel — sanity check it's not wildly off versus your OpenAI dashboard's actual spend.
- [ ] Note any rows where the visual output materially regressed and file a follow-up. Don't roll the migration back for a minor visual delta — Phase C / model tuning is a separate effort.
