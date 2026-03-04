import type { ChatMessage, ChatOptions, ChatResponse } from "../aiService.js";

/** Map task-based model aliases to Anthropic model IDs. */
const MODEL_MAP: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
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

      const response = await client.messages.create({
        model: MODEL_MAP[options.model] ?? options.model,
        max_tokens: options.maxTokens ?? 1024,
        ...(options.temperature != null && {
          temperature: options.temperature,
        }),
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
