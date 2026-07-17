import type { ChatMessage, ChatOptions, ChatResponse } from "../aiService.js";
import { CLAUDE_HAIKU, CLAUDE_SONNET, modelAcceptsTemperature } from "../models.js";

/** Map task-based model aliases to Anthropic model IDs (sourced from models.ts). */
const MODEL_MAP: Record<string, string> = {
  haiku: CLAUDE_HAIKU,
  sonnet: CLAUDE_SONNET,
};

/** Claude-specific chat provider. */
export interface ClaudeProvider {
  chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse>;
}

/** Create a Claude chat provider backed by the Anthropic SDK. */
export function createClaudeProvider(apiKey: string): ClaudeProvider {
  return {
    async chat(messages, options) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey });

      const systemMessages = messages.filter((m) => m.role === "system");
      const conversationMessages = messages.filter((m) => m.role !== "system");

      const model = MODEL_MAP[options.model] ?? options.model;

      const response = await client.messages.create({
        model,
        max_tokens: options.maxTokens ?? 1024,
        // `temperature` is gated to models that still accept it: the Sonnet-5 /
        // Opus-4.6+ generation removed it and 400s on the field (FEAT-58 follow-up).
        ...(options.temperature != null && modelAcceptsTemperature(model)
          ? { temperature: options.temperature }
          : {}),
        ...(systemMessages.length > 0 && {
          system: systemMessages.map((m) => m.content).join("\n\n"),
        }),
        messages: conversationMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      const textBlock = response.content.find((c) => c.type === "text");

      return {
        content: textBlock?.text ?? "",
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
}
