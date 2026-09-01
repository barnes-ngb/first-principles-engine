/**
 * LLM-JSON sanitize-and-parse.
 *
 * THE definition now lives in `functions/src/shared/sanitizeJson.ts`, compiled by
 * BOTH this app and the Cloud Functions project (ARCH-47 slice 3) — it used to
 * exist here as a "deliberate client-side port" of `functions/src/ai/sanitizeJson.ts`,
 * and the two had drifted: the app copy never received the preamble/suffix
 * fallback, so a payload wrapped in conversational text threw here and was
 * silently dropped by every consumer below. There is one parser now, on the
 * fuller behaviour.
 *
 * This file keeps its path and re-exports, so every consumer
 * (`shelly-chat/parseChatActions.ts`, `shelly-chat/parseFriction.ts` and
 * `foundations-review/foundationsReviewActions.ts`) is untouched.
 */
export { sanitizeAndParseJson } from '../../../functions/src/shared/sanitizeJson'
