import type { AiConfig } from "./aiConfig.js";
import { createClaudeProvider } from "./providers/claude.js";
import { createOpenAiProvider } from "./providers/openai.js";

/** Task-based model aliases for chat completions. */
export const AiModel = {
  /** Fast, cheap — routine generation (worksheets, prompts). */
  Haiku: "haiku",
  /** Capable — complex planning and evaluation. */
  Sonnet: "sonnet",
} as const;
export type AiModel = (typeof AiModel)[keyof typeof AiModel];

/** Image generation models. */
export const ImageModel = {
  DallE3: "dall-e-3",
} as const;
export type ImageModel = (typeof ImageModel)[keyof typeof ImageModel];

/** Chat message role. */
export const ChatRole = {
  System: "system",
  User: "user",
  Assistant: "assistant",
} as const;
export type ChatRole = (typeof ChatRole)[keyof typeof ChatRole];

/** A single message in a chat conversation. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Options for a chat completion request. */
export interface ChatOptions {
  model: AiModel;
  maxTokens?: number;
  temperature?: number;
}

/** Response from a chat completion. */
export interface ChatResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/** Options for image generation. */
export interface ImageOptions {
  model?: ImageModel;
  size?: "1024x1024" | "1024x1792" | "1792x1024";
  quality?: "standard" | "hd";
}

/** Response from image generation. */
export interface ImageResponse {
  url: string;
  revisedPrompt?: string;
}

/** Provider-agnostic AI service interface. */
export interface AiService {
  chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse>;
  generateImage(
    prompt: string,
    options?: ImageOptions,
  ): Promise<ImageResponse>;
}

/** Create a unified AI service backed by Claude (chat) and OpenAI (images). */
export function createAiService(config: AiConfig): AiService {
  const claude = createClaudeProvider(config.claudeKey);
  const openai = createOpenAiProvider(config.openaiKey);

  return {
    chat(messages, options) {
      return claude.chat(messages, options);
    },
    generateImage(prompt, options) {
      return openai.generateImage(prompt, options);
    },
  };
}
