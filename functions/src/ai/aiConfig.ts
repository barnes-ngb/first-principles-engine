import * as functions from "firebase-functions";

/**
 * AI provider configuration read from Firebase environment config.
 *
 * Set keys with:
 *   firebase functions:config:set ai.claude_key="sk-ant-..." ai.openai_key="sk-..."
 *
 * For the local emulator, create functions/.runtimeconfig.json:
 *   { "ai": { "claude_key": "test-key", "openai_key": "test-key" } }
 *
 * Or export CLAUDE_API_KEY / OPENAI_API_KEY environment variables.
 */

export interface AiConfig {
  claudeKey: string;
  openaiKey: string;
}

export function getAiConfig(): AiConfig {
  const runtimeConfig = functions.config();

  const claudeKey =
    runtimeConfig.ai?.claude_key ?? process.env.CLAUDE_API_KEY;
  const openaiKey =
    runtimeConfig.ai?.openai_key ?? process.env.OPENAI_API_KEY;

  if (!claudeKey) {
    throw new Error(
      'Missing AI config: ai.claude_key. Run:\n' +
        '  firebase functions:config:set ai.claude_key="sk-ant-..."'
    );
  }

  if (!openaiKey) {
    throw new Error(
      'Missing AI config: ai.openai_key. Run:\n' +
        '  firebase functions:config:set ai.openai_key="sk-..."'
    );
  }

  return { claudeKey, openaiKey };
}
