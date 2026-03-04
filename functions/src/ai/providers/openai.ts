import type { ImageOptions, ImageResponse } from "../aiService.js";

/** OpenAI-specific image generation provider. */
export interface OpenAiProvider {
  generateImage(
    prompt: string,
    options?: ImageOptions,
  ): Promise<ImageResponse>;
}

/** Create an OpenAI provider for image generation (DALL-E). */
export function createOpenAiProvider(apiKey: string): OpenAiProvider {
  return {
    async generateImage(prompt, options) {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey });

      const response = await client.images.generate({
        model: options?.model ?? "dall-e-3",
        prompt,
        n: 1,
        size: options?.size ?? "1024x1024",
        quality: options?.quality ?? "standard",
      });

      const image = response.data?.[0];

      return {
        url: image?.url ?? "",
        revisedPrompt: image?.revised_prompt,
      };
    },
  };
}
