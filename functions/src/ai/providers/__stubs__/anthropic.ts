export default class Anthropic {
  messages = { create: async () => ({ content: [], model: '', usage: { input_tokens: 0, output_tokens: 0 } }) }
  constructor(_opts?: unknown) {}
}
