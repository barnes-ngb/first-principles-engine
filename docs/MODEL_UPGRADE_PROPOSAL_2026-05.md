# Model Upgrade Proposal — May 24, 2026

> Read-only audit of Anthropic + OpenAI model usage, with per-task recommendations. **No production code changed by this doc.** A follow-up "execute upgrades" prompt comes after Nathan reviews.

**Branch:** `claude/dreamy-rubin-JvTfm`
**Status:** Proposal, awaiting decision
**Last unified:** Mar 24, 2026 (all Claude chat tasks pinned to `claude-sonnet-4-6` / `claude-haiku-4-5-20251001`)

---

## TL;DR

1. **🚨 Urgent — DALL-E 3 was retired from the OpenAI API on May 12, 2026 (12 days ago).** Five image tasks plus the default fallback in `functions/src/ai/providers/openai.ts:23` still pass `model: "dall-e-3"`. These calls likely fail in production today. Replace with `gpt-image-1` (still live until Oct 23, 2026) or `gpt-image-1.5` / `gpt-image-2` as the new flagship. This is a hotfix, not an optional upgrade.
2. **Sonnet 4.6 is still current.** No Sonnet 4.7 exists. Anthropic's "step-change" jump is Opus 4.7 ($5/$25 vs Sonnet's $3/$15 per MTok). Recommend KEEP Sonnet for most tasks; UPGRADE to Opus 4.7 for **weeklyReview** + **analyzePatterns** only (low call volume, high reasoning value).
3. **Haiku 4.5 is current.** No change.
4. **`generateImage.ts:137` rewrite prompt** runs through `chat.ts modelForTask("chat")` → Haiku. Fine. No change.
5. **Stale model labels** in `AIUsagePanel.tsx` for Sonnet 4 / Sonnet 4.5 are display-only legacy strings (for historical aiUsage rows). Keep them but add `gpt-image-1.5` / `gpt-image-2` rows when the swap lands.

---

## 1. Current state (inventory)

### 1.1 Source of truth

- **Chat tasks:** `functions/src/ai/chat.ts:60` — `modelForTask(taskType)` switch.
- **Provider model aliases:** `functions/src/ai/providers/claude.ts:4` — `MODEL_MAP`.
- **Image provider default:** `functions/src/ai/providers/openai.ts:23` — `options?.model ?? "dall-e-3"`.

### 1.2 Claude chat task → model mapping (chat.ts:60-83)

| Task type | Current model | Confirmed via |
|---|---|---|
| `plan` | `claude-sonnet-4-6` | chat.ts:77 |
| `evaluate` | `claude-sonnet-4-6` | chat.ts:77 |
| `quest` | `claude-sonnet-4-6` | chat.ts:77 |
| `generateStory` | `claude-sonnet-4-6` | chat.ts:77 |
| `workshop` | `claude-sonnet-4-6` | chat.ts:77 |
| `analyzeWorkbook` | `claude-sonnet-4-6` | chat.ts:77 |
| `disposition` | `claude-sonnet-4-6` | chat.ts:77 |
| `conundrum` | `claude-sonnet-4-6` | chat.ts:77 |
| `weeklyFocus` | `claude-sonnet-4-6` | chat.ts:77 |
| `scan` | `claude-sonnet-4-6` | chat.ts:77 |
| `shellyChat` | `claude-sonnet-4-6` | chat.ts:77 |
| `chapterQuestions` | `claude-sonnet-4-6` | chat.ts:77 |
| `weeklyReview` | `claude-sonnet-4-6` | chat.ts:77 (`evaluate.ts:885` calls `modelForTask("weeklyReview")`) |
| `analyzePatterns` | `claude-sonnet-4-6` | chat.ts:77 |
| `monthlyReview` | `claude-sonnet-4-6` | chat.ts:77 |
| `generate` | `claude-haiku-4-5-20251001` | chat.ts:81 |
| `chat` | `claude-haiku-4-5-20251001` | chat.ts:81 (default branch) |

**Claim from CLAUDE.md verified:** the Mar 24 unification holds. All 15 reasoning tasks → Sonnet 4.6, the 2 routine generation tasks → Haiku 4.5. **No drift.**

### 1.3 Hardcoded Claude model strings in image task prompt sanitization

These call Claude directly (not via `modelForTask`) to rewrite/sanitize prompts before image gen:

| File:line | Use case | Model |
|---|---|---|
| `imageTasks/avatarPiece.ts:67` | Copyright-safety prompt rewrite | `claude-haiku-4-5-20251001` |
| `imageTasks/baseCharacter.ts:64` | Copyright-safety prompt rewrite | `claude-haiku-4-5-20251001` |
| `imageTasks/armorPiece.ts:49` | Prompt rewrite | `claude-haiku-4-5-20251001` |
| `imageTasks/armorSheet.ts:145` | Prompt rewrite | `claude-haiku-4-5-20251001` |
| `imageTasks/armorReference.ts:125` | Prompt rewrite | `claude-haiku-4-5-20251001` |
| `imageTasks/starterAvatar.ts:56` | Prompt rewrite | `claude-haiku-4-5-20251001` |
| `imageTasks/photoTransform.ts:62` | Prompt rewrite | `claude-haiku-4-5-20251001` |
| `imageTasks/copyrightUtils.ts:110` | Copyright check | `claude-haiku-4-5-20251001` |
| `imageTasks/extractFeatures.ts:93,196` | Feature extraction (vision) | `claude-sonnet-4-6` (vision needed) |
| `imageTasks/minecraftFace.ts:84,153` | Face prompt + extraction (vision) | `claude-sonnet-4-6` |

**Pattern:** 8 calls to Haiku for cheap prompt rewriting, 2 vision-heavy paths on Sonnet. Reasonable allocation.

### 1.4 OpenAI image model usage

| File:line | Use case | Model |
|---|---|---|
| `providers/openai.ts:23` | **Default fallback for any image call** | `"dall-e-3"` |
| `imageTasks/avatarPiece.ts:93,126,141` | Avatar piece (themed) | `dall-e-3` |
| `imageTasks/baseCharacter.ts:86,116,130` | Base character (full body, no armor) | `dall-e-3` |
| `imageTasks/armorSheet.ts:168,198,225` | 3×2 full armor sheet, one call | `dall-e-3` |
| `imageTasks/starterAvatar.ts:78,108,122` | Starter avatar | `dall-e-3` |
| `imageTasks/generateImage.ts:181` | Non-sticker general image (fallback) | `dall-e-3` |
| `providers/openai.ts:29,45,75` | `gpt-image-1` branches inside provider | `gpt-image-1` |
| `imageTasks/armorPiece.ts:72,100,116` | Single armor piece (transparent PNG) | `gpt-image-1` |
| `imageTasks/photoTransform.ts:92,129,143` | Photo-to-stylized transform (edit endpoint) | `gpt-image-1` |
| `imageTasks/armorReference.ts:153,190,217` | Fully-armored reference (edit endpoint) | `gpt-image-1` |
| `imageTasks/minecraftSkin.ts:72,100,114` | 8×8 pixel face skin | `gpt-image-1` |
| `imageTasks/enhanceSketch.ts:201,264,278` | Sketch enhancement (edit endpoint) | `gpt-image-1` |
| `imageTasks/generateImage.ts:181` | Sticker variant (transparent bg) | `gpt-image-1` |

**Count:** 5 dedicated `dall-e-3` paths + the provider default + the `generateImage.ts` non-sticker branch = **all of these are broken since May 12, 2026.**

### 1.5 aiUsage display labels (`src/features/settings/AIUsagePanel.tsx:21-58`)

Maintains label + cost rates for `claude-sonnet-4-6`, legacy Sonnet 4 + 4.5 (display only for old rows), Haiku 4.5, `dall-e-3`, `gpt-image-1`. **Will need rows added** for whatever OpenAI model we move to + any new Claude model (e.g. Opus 4.7 if approved).

### 1.6 Test fixtures with hardcoded models (no action needed)

- `src/features/planner-chat/chatPlanner.logic.test.ts:450,713,1008` uses `claude-sonnet-4-20250514` as a mock value — legacy fixture, harmless.
- `functions/src/ai/providers/claude.test.ts` and `aiService.test.ts` use the current Sonnet/Haiku IDs.

### 1.7 Call-volume estimate

Cannot derive precise monthly volume without querying live `aiUsage` data. Order-of-magnitude from feature shape:

- **High frequency** (multiple/day per active child): `chat` (shellyChat), `quest`, `scan`, image generation when avatars/armor/stickers are made.
- **Daily**: `disposition`, `conundrum`, `weeklyFocus`, `chapterQuestions`, `plan` (Sun rebuild).
- **Weekly**: `weeklyReview` (Sun 7pm CT scheduled), `analyzePatterns` (manual).
- **Monthly**: `monthlyReview`.
- **On demand**: `generateStory`, `workshop`, `analyzeWorkbook`.

Family = 2 active kids. Approximate Sonnet calls/month ≈ 200–500; image calls/month ≈ 50–150 depending on avatar churn.

---

## 2. Available options (as of May 24, 2026)

### 2.1 Anthropic — current generally available

Source: [Claude Models overview](https://platform.claude.com/docs/en/about-claude/models/overview), fetched 2026-05-24.

| Model | API ID | Input $/MTok | Output $/MTok | Context | Max output | Notes |
|---|---|---|---|---|---|---|
| **Claude Opus 4.7** | `claude-opus-4-7` | $5 | $25 | 1M | 128k | "Most capable", step-change agentic coding/reasoning over 4.6. Adaptive thinking. No extended thinking. |
| **Claude Sonnet 4.6** | `claude-sonnet-4-6` | $3 | $15 | 1M | 64k | "Best speed/intelligence combo". Extended + adaptive thinking. |
| **Claude Haiku 4.5** | `claude-haiku-4-5-20251001` | $1 | $5 | 200k | 64k | "Fastest, near-frontier". Extended thinking. |

**No Sonnet 4.7.** Sonnet 4.6 remains current. No deprecation notice for `claude-sonnet-4-6` or `claude-haiku-4-5-20251001`.

Legacy / deprecation: Sonnet 4 (`claude-sonnet-4-20250514`) + Opus 4 retire **June 15, 2026**. The legacy display labels in `AIUsagePanel.tsx` reference Sonnet 4 — fine for displaying old usage rows; no calls go to it.

### 2.2 OpenAI image models — current generally available

Source: WebSearch 2026-05-24, citing [Genra.ai retirement post](https://genra.ai/blog/dall-e-retired-may-2026-what-replaces-it), [OpenAI Deprecations](https://developers.openai.com/api/docs/deprecations), [WaveSpeed GPT Image 2 review](https://wavespeed.ai/blog/posts/gpt-image-2-2026/), [LaoZhang pricing roundup](https://blog.laozhang.ai/en/posts/chatgpt-images-2-0).

| Model | Status | Approx price / 1024×1024 (low / med / high) | Transparent bg | Edit endpoint | Notes |
|---|---|---|---|---|---|
| **dall-e-3** | ❌ **Removed May 12, 2026** | n/a | No | No | Calls fail. **All `dall-e-3` paths in our code are broken.** |
| **dall-e-2** | ❌ Removed May 12, 2026 | n/a | n/a | n/a | Never used by us. |
| **gpt-image-1** | ⚠️ Deprecated, retires **Oct 23, 2026** | ~$0.02 / $0.07 / $0.19 | ✅ Yes (`background: 'transparent'`) | ✅ Yes | What we currently use for stickers/armor/edits. |
| **gpt-image-1-mini** | ✅ Current, cheapest | ~$0.005 / $0.018 / $0.052 | ✅ Yes | ✅ Yes | Good for non-portfolio assets. |
| **gpt-image-1.5** | ✅ Current ("flagship for migration") | ~$0.009 / $0.06 / $0.20 | ✅ Yes | ✅ Yes | 4× faster than gpt-image-1, ~20% cheaper, better instruction following. |
| **gpt-image-2** | ✅ Current (latest, with "thinking") | ~$0.006 / $0.053 / $0.211 | ❌ **No transparent bg on text-to-image** | ✅ Yes | Reasoning before generation, mixed-script text rendering. Cheapest at low quality. |

**Critical compatibility note:** `gpt-image-2` does **not** support `background: 'transparent'` on its generation endpoint. That blocks a direct swap for sticker / armor-piece / face-skin paths that depend on transparent PNGs. `gpt-image-1.5` and `gpt-image-1-mini` preserve transparency. (Source: [WaveSpeed GPT Image 2 review](https://wavespeed.ai/blog/posts/gpt-image-2-2026/).)

**Migration caveat (from [DEV community migration note](https://dev.to/flarecanary/dalle-shuts-down-may-12-the-gpt-image-1-migration-isnt-the-drop-in-swap-it-looks-like-3p02)):** swapping `dall-e-3` → `gpt-image-*` requires removing `response_format`, `style`, and `quality` parameters that the new models reject. Our code at `providers/openai.ts:51` passes `quality` only in the DALL-E branch, so that's already isolated — but it still needs verification.

---

## 3. Recommendation per task

### 3.1 Chat tasks (Claude)

| Task | Current | Recommendation | Reason | Cost delta | Risk |
|---|---|---|---|---|---|
| `plan` | Sonnet 4.6 | **KEEP** | Sonnet handles weekly plan synthesis well today; output format is stable; planner-chat regression risk on Opus is high. | $0 | Low |
| `evaluate` | Sonnet 4.6 | **KEEP** | Knowledge Mine evaluation prompts are tuned for Sonnet; questions per session are short, no obvious quality ceiling hit. | $0 | Low |
| `quest` | Sonnet 4.6 | **KEEP** | Same as evaluate. Heavy prompt engineering (Phase 1+2 blockers, targeted evidence). Changing model = re-tune. | $0 | Low |
| `generateStory` | Sonnet 4.6 | **KEEP** | Creative content; Sonnet is sufficient. | $0 | Low |
| `workshop` | Sonnet 4.6 | **KEEP** | Game generation is structured; Sonnet 4.6 handles JSON schemas reliably. | $0 | Low |
| `analyzeWorkbook` | Sonnet 4.6 | **KEEP** | Vision task. Opus has no documented edge on vision over Sonnet, and Sonnet's vision is mature. | $0 | Low |
| `disposition` | Sonnet 4.6 | **EVALUATE** Opus 4.7 | Narrative synthesis from day-log data; Opus's reasoning *might* yield more discerning per-child narratives. Low volume (per-child, on demand). | +$2/MTok in / +$10/MTok out (~+67% per call) on Opus | Low — output is parent-facing text, easy to A/B |
| `conundrum` | Sonnet 4.6 | **KEEP** | Stonebridge story arc is well-defined; Sonnet handles continuity. | $0 | Low |
| `weeklyFocus` | Sonnet 4.6 | **KEEP** | Short directive output. No upside on Opus. | $0 | Low |
| `scan` | Sonnet 4.6 | **KEEP** | Vision-heavy; Sonnet's vision is fast and good enough. | $0 | Low |
| `shellyChat` | Sonnet 4.6 | **KEEP** | Conversational; Sonnet quality is already strong; high volume makes Opus expensive. | $0 | Low |
| `chapterQuestions` | Sonnet 4.6 | **KEEP** | Generates 5–8 questions per chapter; well-tuned. | $0 | Low |
| `weeklyReview` | Sonnet 4.6 | **UPGRADE** Opus 4.7 | Once-per-week per child, ~3.1k input tokens. Opus's deeper synthesis matches the "look across a full week of evidence and write a parent-facing summary" job. Lowest-risk upgrade because output is text only. | ~$0.10 → $0.17 per review (back-of-envelope at avg sizing) | Low — easy revert |
| `analyzePatterns` | Sonnet 4.6 | **UPGRADE** Opus 4.7 | Manual trigger, very low volume. Pattern detection across many sessions benefits from Opus's reasoning. | ~+67% per call on a handful of calls/month | Low |
| `monthlyReview` | Sonnet 4.6 | **UPGRADE** Opus 4.7 | Monthly, large input context, narrative output. Same reasoning as weeklyReview. | Negligible (1 call/child/month) | Low |
| `generate` | Haiku 4.5 | **KEEP** | Routine lesson-card generation; Haiku is right tier. | $0 | None |
| `chat` | Haiku 4.5 | **KEEP** | Routine + prompt-rewrite duty; Haiku is right tier. | $0 | None |

### 3.2 Image task prompt sanitization (Claude calls inside imageTasks/)

All 10 sites — **KEEP**. Haiku for cheap rewriting, Sonnet for vision. No upgrade rationale.

### 3.3 OpenAI image generation (the urgent set)

| Task | Current | Recommendation | Reason | Risk |
|---|---|---|---|---|
| `providers/openai.ts:23` (default) | `dall-e-3` | **HOTFIX → `gpt-image-1.5`** (default), or remove default + require explicit model | DALL-E 3 dead since May 12. The provider default catches any caller that forgets `options.model`. | Low — backward-compatible swap, but Step 4 risk note on param shape |
| `avatarPiece.ts:93` | `dall-e-3` | **HOTFIX → `gpt-image-1.5`** | Themed avatar pieces. 1.5 has better instruction following per migration guides. No transparency needed here. | Low |
| `baseCharacter.ts:86` | `dall-e-3` | **HOTFIX → `gpt-image-1.5`** | Full-body character render, no transparency required (background is part of the scene). | Low |
| `armorSheet.ts:168` | `dall-e-3` | **HOTFIX → `gpt-image-1.5`** | 3×2 sheet — sheet layout is sensitive; Opus → 1.5 has better instruction following but verify output. | Medium — verify sheet grid integrity |
| `starterAvatar.ts:78` | `dall-e-3` | **HOTFIX → `gpt-image-1.5`** | One-time starter image per child. Low call volume. | Low |
| `generateImage.ts:181` non-sticker branch | `dall-e-3` | **HOTFIX → `gpt-image-1.5`** | General-purpose Shelly chat / book illustration path. | Low |
| `generateImage.ts:181` sticker branch | `gpt-image-1` | **KEEP for now, EVALUATE `gpt-image-1.5` swap** | Transparency required. `gpt-image-1` still works until Oct 23, but `1.5` is faster + ~20% cheaper and supports transparent bg. | Low — confirm transparency parity |
| `armorPiece.ts:72` (transparent) | `gpt-image-1` | **KEEP for now, EVALUATE → `gpt-image-1.5`** | Transparent PNG critical. Verify transparency on 1.5 first. | Low |
| `photoTransform.ts:92` (edit) | `gpt-image-1` | **KEEP for now, EVALUATE → `gpt-image-1.5`** | Edit endpoint usage. Verify edit-endpoint parity. | Low |
| `armorReference.ts:153` (edit) | `gpt-image-1` | **KEEP for now, EVALUATE → `gpt-image-1.5`** | Same as above. | Low |
| `minecraftSkin.ts:72` (transparent) | `gpt-image-1` | **KEEP for now, EVALUATE → `gpt-image-1.5`** | Transparent 8×8 pixel face. | Low |
| `enhanceSketch.ts:201` (edit + transparent) | `gpt-image-1` | **KEEP for now, EVALUATE → `gpt-image-1.5`** | Sketch enhancement, transparency preserved. | Low |

**Do not swap any path to `gpt-image-2`** until OpenAI ships transparent-background support — `gpt-image-2` blocks the sticker, armor-piece, face-skin, sketch-enhancement flows.

---

## 4. Cost projection

Rough monthly estimate, family-scale (2 kids):

| Bucket | Current | Proposed | Delta |
|---|---|---|---|
| Claude Sonnet 4.6 calls (KEEP set, ~300/mo, ~3k in / 1k out avg) | ~$7.50/mo | ~$7.50/mo | $0 |
| Claude Sonnet 4.6 → Opus 4.7 (weeklyReview + analyzePatterns + monthlyReview + maybe disposition) | ~$0.80/mo | ~$1.40/mo | +$0.60 |
| Claude Haiku 4.5 (generate + chat) | ~$0.50/mo | ~$0.50/mo | $0 |
| OpenAI `dall-e-3` → `gpt-image-1.5` (~80 calls/mo, high quality) | ~$3.20/mo (when working — currently $0 because broken) | ~$2.56/mo (post-swap at 20% lower price) | Restores ~$2.56/mo of working spend |
| OpenAI `gpt-image-1` → `gpt-image-1.5` (~50 calls/mo, high quality) | ~$2.00/mo | ~$1.60/mo | -$0.40 |
| **Net** | **~$14/mo (with broken DALL-E paths)** | **~$13.50/mo** | **roughly flat; restores broken features** |

Numbers are order-of-magnitude. Real `aiUsage` query needed for precision; defer to the execute step.

---

## 5. Risk inventory

### Per upgrade

- **Opus 4.7 on weeklyReview / analyzePatterns / monthlyReview**:
  - Opus follows instructions more literally; existing prompts may need shorter system preambles or the model will over-explain.
  - Output length may grow → check `WeekInEvidence.tsx` and the weekly-review UI for layout regressions.
  - No tool-use changes (we don't use tools in these flows).
  - Easy revert: change `chat.ts:77` switch back.

- **gpt-image-1.5 swap (any path)**:
  - Param shape changes: `style` / `response_format` rejected; `quality` semantics may differ (verify against [aiphotogenerator migration guide](https://www.aiphotogenerator.net/blog/2026/04/dalle-3-deprecation-deadline-how-to-migrate-to-gpt-image-15-before-may-12-2026)). Our `providers/openai.ts:46-52` DALL-E branch passes `quality` — needs to be conditional or removed when model is gpt-image-1.5.
  - Output format: `gpt-image-*` returns `b64_json` (we already handle this in the gpt-image-1 branch). The DALL-E branch returns a URL we download. The provider needs a unified return path for the new model.
  - Style/look differences: avatars, armor sheets, starter images will *look* different. Plan for an aesthetic shakedown on Lincoln's avatar before promoting.
  - Rate limits: gpt-image-* models have stricter per-minute limits than DALL-E 3. Armor sheet (single call) and starter avatar (one-off) are unaffected; rapid sticker generation may hit ceilings.

- **Disposition on Opus (if pursued)**:
  - This is the one parent-facing daily-ish narrative — wrong tone hurts the most. EVALUATE, not UPGRADE, until we A/B side-by-side.

### Cross-cutting

- **`AIUsagePanel.tsx` cost table** uses hardcoded per-MTok rates. After any upgrade, add Opus 4.7 ($5/$25) and gpt-image-1.5 (~$0.07–$0.20/image) rows so the cost view stays accurate.
- **No prompt redesign in this proposal.** Output drift from a model change is observable in real use; a separate prompt-tuning pass can follow if needed.
- **Tests** in `claude.test.ts` and `openai.test.ts` reference current model IDs and will need parallel updates; `aiService.test.ts` mocks the response shape — no model coupling there.

---

## 6. Recommended sequencing

**Phase A — Hotfix (this week, must ship):**
1. Replace `dall-e-3` with `gpt-image-1.5` in all 5 dedicated image tasks + the provider default + the non-sticker `generateImage.ts` branch.
2. Update `providers/openai.ts` to handle `gpt-image-1.5` response shape (b64_json, no `quality`/`style`/`response_format` params).
3. Add `gpt-image-1.5` row to `AIUsagePanel.tsx` cost table.
4. Verify one round of: avatar piece, base character, armor sheet, starter avatar, non-sticker general image.

**Phase B — Sticker / transparent path (1–2 weeks later, after Phase A is stable):**
5. Migrate `gpt-image-1` → `gpt-image-1.5` in sticker / armor-piece / face-skin / photo-transform / armor-reference / sketch-enhancement paths. Verify transparency preserved on each.
6. **Do not** touch `gpt-image-2` until transparent-bg parity ships.

**Phase C — Optional Claude upgrades (after Phase A + B prove out):**
7. Switch `weeklyReview` to Opus 4.7. Watch one Sunday's run. Compare output quality.
8. If satisfied, extend to `analyzePatterns` and `monthlyReview`.
9. Optionally A/B `disposition` for one child before committing.

**Phase D — Defer:**
10. `gpt-image-2` evaluation when transparent-bg ships OR for paths that don't need transparency (and only if quality wins are measurable).
11. Any Claude Sonnet 4.7 / future model — none exists today.

Phases A–C are independent rollbacks. Phase A must ship first because production is currently broken.

---

## 7. What this proposal does NOT do

- ❌ Does not change any model string in production code.
- ❌ Does not modify `aiUsage` tracking schema or labels.
- ❌ Does not run live API calls against new models (no quality benchmarking).
- ❌ Does not redesign system prompts for any new model's preferences.
- ❌ Does not touch test fixtures.

It is read-only research + decision support. The "execute upgrades" prompt comes next.

---

## Sources

- [Anthropic — Claude Models overview](https://platform.claude.com/docs/en/about-claude/models/overview) (fetched 2026-05-24)
- [OpenAI — Deprecations](https://developers.openai.com/api/docs/deprecations) (referenced 2026-05-24)
- [OpenAI Developer Community — DALL·E shutdown reminder](https://community.openai.com/t/deprecation-reminder-dall-e-will-be-shut-down-on-may-12-2026/1378754)
- [Genra.ai — DALL-E Is Dead: What Replaces Them](https://genra.ai/blog/dall-e-retired-may-2026-what-replaces-it) (referenced 2026-05-24)
- [aiphotogenerator — DALL·E 3 → GPT Image 1.5 Migration Guide](https://www.aiphotogenerator.net/blog/2026/04/dalle-3-deprecation-deadline-how-to-migrate-to-gpt-image-15-before-may-12-2026)
- [WaveSpeed — GPT Image 2 in 2026: Worth Integrating?](https://wavespeed.ai/blog/posts/gpt-image-2-2026/) (transparent-bg limitation)
- [DEV community — gpt-image-1 migration isn't a drop-in swap](https://dev.to/flarecanary/dalle-shuts-down-may-12-the-gpt-image-1-migration-isnt-the-drop-in-swap-it-looks-like-3p02)
- [LaoZhang AI — ChatGPT Images 2.0 pricing](https://blog.laozhang.ai/en/posts/chatgpt-images-2-0)
