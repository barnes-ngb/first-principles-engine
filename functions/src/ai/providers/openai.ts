import type { ImageEditOptions, ImageOptions, ImageResponse } from "../aiService.js";

/** OpenAI-specific image generation provider. */
export interface OpenAiProvider {
  generateImage(
    prompt: string,
    options?: ImageOptions,
  ): Promise<ImageResponse>;
  editImage(
    imageBuffer: Buffer,
    prompt: string,
    options?: ImageEditOptions,
  ): Promise<ImageResponse>;
}

/** Create an OpenAI provider for image generation (DALL-E 3 and gpt-image-1). */
export function createOpenAiProvider(apiKey: string): OpenAiProvider {
  return {
    async generateImage(prompt, options) {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey });

      const model = options?.model ?? "dall-e-3";
      const isGptImage = model === "gpt-image-1";

      if (isGptImage) {
        // gpt-image-1: supports transparent backgrounds, returns b64_json
        const response = await client.images.generate({
          model: "gpt-image-1",
          prompt,
          n: 1,
          size: (options?.size as "1024x1024") ?? "1024x1024",
          background: options?.background ?? "auto",
          output_format: options?.outputFormat ?? "png",
        });

        const image = response.data?.[0];
        return {
          url: "",
          b64Data: image?.b64_json ?? undefined,
          revisedPrompt: undefined,
        };
      }

      // DALL-E 3: standard URL-based response
      const response = await client.images.generate({
        model,
        prompt,
        n: 1,
        size: (options?.size as "1024x1024") ?? "1024x1024",
        quality: (options?.quality as "standard") ?? "standard",
      });

      const image = response.data?.[0];
      return {
        url: image?.url ?? "",
        revisedPrompt: image?.revised_prompt,
      };
    },

    async editImage(imageBuffer, prompt, options) {
      const { default: OpenAI } = await import("openai");
      const { Blob } = await import("buffer");
      const client = new OpenAI({ apiKey });

      // Use gpt-image-1 for edit — it accepts image input with a prompt
      // Convert Buffer to a File-like Blob that the OpenAI SDK accepts
      const imageFile = new Blob([new Uint8Array(imageBuffer)], {
        type: "image/png",
      }) as unknown as File;
      Object.defineProperty(imageFile, "name", { value: "sketch.png" });

      const response = await client.images.edit({
        model: "gpt-image-1",
        image: imageFile,
        prompt,
        n: 1,
        size: (options?.size as "1024x1024") ?? "1024x1024",
      });

      const result = response.data?.[0];
      return {
        url: "",
        b64Data: result?.b64_json ?? undefined,
        revisedPrompt: undefined,
      };
    },
  };
}
