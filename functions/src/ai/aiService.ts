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
  GptImage1: "gpt-image-1",
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
  model?: string;
  size?: string;
  quality?: string;
  /** For gpt-image-1: 'transparent', 'opaque', or 'auto' */
  background?: "transparent" | "opaque" | "auto";
  /** Output format: 'png' (default), 'jpeg', 'webp' */
  outputFormat?: "png" | "jpeg" | "webp";
}

/** Options for image editing (sketch enhancement). */
export interface ImageEditOptions {
  model?: string;
  size?: string;
  /** Output format: 'png' (default), 'jpeg', 'webp' */
  outputFormat?: "png" | "jpeg" | "webp";
  /** For gpt-image-1: 'transparent', 'opaque', or 'auto' */
  background?: "transparent" | "opaque" | "auto";
}

/** Response from image generation. */
export interface ImageResponse {
  url: string;
  /** Base64-encoded image data (gpt-image-1 returns this instead of URL) */
  b64Data?: string;
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
