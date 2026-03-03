import { defineSecret } from "firebase-functions/params";

/**
 * AI provider secrets backed by Google Cloud Secret Manager.
 *
 * Set secrets with:
 *   firebase functions:secrets:set CLAUDE_API_KEY
 *   firebase functions:secrets:set OPENAI_API_KEY
 *
 * For the local emulator, create functions/.secret.local with:
 *   CLAUDE_API_KEY=sk-ant-...
 *   OPENAI_API_KEY=sk-...
 *
 * Any Cloud Function that uses these must declare them so the runtime
 * makes the values available:
 *
 *   import { claudeApiKey, openaiApiKey } from "./aiConfig.js";
 *   export const myFn = onCall({ secrets: [claudeApiKey, openaiApiKey] }, async (req) => {
 *     const key = claudeApiKey.value();
 *   });
 */

export const claudeApiKey = defineSecret("CLAUDE_API_KEY");
export const openaiApiKey = defineSecret("OPENAI_API_KEY");

export interface AiConfig {
  claudeKey: string;
  openaiKey: string;
}

/**
 * Read current secret values. Only call from within a function handler
 * that has declared the secrets via the `secrets` option.
 */
export function getAiConfig(): AiConfig {
  const claudeKey = claudeApiKey.value();
  const openaiKey = openaiApiKey.value();

  if (!claudeKey) {
    throw new Error(
      "Missing secret CLAUDE_API_KEY. Run:\n" +
        "  firebase functions:secrets:set CLAUDE_API_KEY",
    );
  }

  if (!openaiKey) {
    throw new Error(
      "Missing secret OPENAI_API_KEY. Run:\n" +
        "  firebase functions:secrets:set OPENAI_API_KEY",
    );
  }

  return { claudeKey, openaiKey };
}
