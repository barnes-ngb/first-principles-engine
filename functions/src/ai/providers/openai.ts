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

/** Create an OpenAI provider for image generation (gpt-image-1.5). */
export function createOpenAiProvider(apiKey: string): OpenAiProvider {
  return {
    async generateImage(prompt, options) {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey });

      const model = options?.model ?? "gpt-image-1.5";

      // Cast: openai SDK 4.104 predates gpt-image-1.5 in its model union and
      // does not yet type `background` / `output_format` on every overload.
      const response = await client.images.generate({
        model,
        prompt,
        n: 1,
        size: (options?.size as "1024x1024") ?? "1024x1024",
        quality: (options?.quality as "medium") ?? "medium",
        background: options?.background ?? "auto",
        output_format: options?.outputFormat ?? "png",
      } as Parameters<typeof client.images.generate>[0]);

      const image = response.data?.[0];
      return {
        url: "",
        b64Data: image?.b64_json ?? undefined,
        revisedPrompt: undefined,
      };
    },

    async editImage(imageBuffer, prompt, options) {
      const { default: OpenAI, toFile } = await import("openai");
      const client = new OpenAI({ apiKey });

      const imageFile = await toFile(imageBuffer, "sketch.png", {
        type: "image/png",
      });

      // Cast: openai SDK 4.104 model union predates gpt-image-1.5.
      const response = await client.images.edit({
        model: "gpt-image-1.5",
        image: imageFile,
        prompt,
        size: (options?.size as "1024x1024") ?? "1024x1024",
        background: options?.background ?? "auto",
      } as Parameters<typeof client.images.edit>[0]);

      const result = response.data?.[0];
      return {
        url: "",
        b64Data: result?.b64_json ?? undefined,
        revisedPrompt: undefined,
      };
    },
  };
}
