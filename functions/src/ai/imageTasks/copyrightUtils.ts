/**
 * Shared copyright filtering utilities for image generation tasks.
 *
 * Both generateImage and enhanceSketch use these to strip copyrighted
 * character/franchise names from prompts before sending to image models.
 */

// ── Regex of known copyrighted names ───────────────────────────────

export const COPYRIGHT_NAMES =
  /\b(mario|luigi|princess peach|peach|bowser|toad|yoshi|donkey kong|link|zelda|ganon|kirby|samus|pikachu|pokemon|charizard|bulbasaur|squirtle|eevee|mewtwo|jigglypuff|snorlax|gengar|raichu|disney|mickey mouse|mickey|minnie|goofy|donald duck|elsa|anna|olaf|moana|rapunzel|ariel|mulan|simba|woody|buzz lightyear|nemo|dory|baymax|wall-e|spider-?man|spiderman|batman|superman|iron man|hulk|thor|captain america|wonder woman|wolverine|deadpool|thanos|joker|minecraft|creeper|enderman|steve|herobrine|fortnite|roblox|sonic|tails|knuckles|shadow|amy rose|among us|hello kitty|spongebob|patrick star|squidward|peppa pig|paw patrol|bluey|cocomelon|ryan|mr\.? beast|mrbeast)\b/gi;

/** Regex-based fallback to strip copyrighted names when the AI rewriter is unavailable. */
export function fallbackCopyrightStrip(prompt: string): string {
  return prompt
    .replace(COPYRIGHT_NAMES, "character")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Claude Haiku rewriter ──────────────────────────────────────────

const STICKER_REWRITE_SYSTEM = `You rewrite children's sticker descriptions to avoid copyright issues.

CRITICAL RULES:
- NEVER output any character names, franchise names, game names, or brand names
- Replace ALL named characters with visual descriptions of how they look
- Replace ALL franchise/game names with genre descriptions
- If the input is ONLY a character name with no other context, describe that character's iconic visual appearance without naming them
- Keep it cute, simple, child-friendly
- Under 50 words

EXAMPLES:
- "Mario" → "a cheerful stocky cartoon man wearing red overalls, a red cap, brown shoes, and a big bushy mustache"
- "Pikachu" → "a small round yellow cartoon creature with long pointy ears tipped in black, rosy red cheeks, and a lightning-bolt shaped tail"
- "a Minecraft creeper" → "a tall green blocky pixelated creature with a frowning face"
- "Elsa from Frozen" → "a graceful young woman with platinum blonde hair in a long braid, wearing a sparkling ice-blue gown"
- "Spider-Man swinging" → "a superhero in a red and blue full-body suit with web patterns, swinging through the air"
- "Lincoln's Minecraft skin" → "a blocky pixel-art video game character"
- "Sonic" → "a speedy blue cartoon hedgehog with red shoes and white gloves"
- "a cute puppy" → "a cute puppy"

OUTPUT: Just the rewritten description. No preamble, no quotes, no explanation.
If the input has no copyright concerns (like "a cute puppy"), output it unchanged.`;

const SCENE_REWRITE_SYSTEM = `You rewrite children's image generation prompts to avoid copyright issues while preserving the creative intent.

RULES:
- NEVER include character names (Mario, Luigi, Pikachu, Elsa, Spider-Man, Steve, etc.)
- NEVER include franchise names (Minecraft, Pokemon, Mario Bros, Disney, Marvel, etc.)
- Instead, describe the VISUAL STYLE and WORLD without naming the IP:
  - "Minecraft" → "blocky pixel art voxel world"
  - "Mario" → "colorful platformer video game world with brick blocks, green pipes, golden coins"
  - "Pokemon" → "cute cartoon creatures in a grassy meadow"
  - "Frozen/Elsa" → "magical ice palace with snowflakes and northern lights"
  - "Spider-Man" → "comic book city rooftop scene at sunset"
- ALWAYS describe a SCENE or ENVIRONMENT, not a character doing something
- If the kid describes a character action ("Mario jumps over a pit"), convert to a scene ("a deep pit with lava below in a colorful platformer world, brick platforms floating above")
- Keep the output under 100 words
- Maintain the kid's creative intent — just make it about the WORLD not the CHARACTER
- The output should start directly with the scene description, no preamble

IMPORTANT: The child will overlay their own characters on top of this scene. So generate a BACKGROUND, not a character portrait.`;

const SKETCH_REWRITE_SYSTEM = `You rewrite children's sketch captions/descriptions to avoid copyright issues.

CRITICAL RULES:
- NEVER output any character names, franchise names, game names, or brand names
- Replace ALL named characters with visual descriptions of how they look
- Replace ALL franchise/game names with genre descriptions
- Keep it descriptive and child-friendly
- Under 50 words

EXAMPLES:
- "my Mario drawing" → "my drawing of a cheerful stocky cartoon man with a red cap and big mustache"
- "Pikachu in a garden" → "a small round yellow creature with pointy ears and rosy cheeks in a garden"
- "Minecraft house" → "a blocky pixel-art house made of colorful cubes"
- "a cute puppy" → "a cute puppy"

OUTPUT: Just the rewritten description. No preamble, no quotes, no explanation.
If the input has no copyright concerns (like "a cute puppy"), output it unchanged.`;

export type RewriteMode = "sticker" | "scene" | "sketch";

const SYSTEM_PROMPTS: Record<RewriteMode, string> = {
  sticker: STICKER_REWRITE_SYSTEM,
  scene: SCENE_REWRITE_SYSTEM,
  sketch: SKETCH_REWRITE_SYSTEM,
};

/**
 * Use Claude Haiku to rewrite a prompt, stripping copyrighted names and
 * replacing them with visual descriptions. Falls back to regex strip on failure.
 *
 * @param prompt   - The raw user-provided prompt/caption
 * @param mode     - Which rewrite style to use
 * @param apiKey   - Claude API key (from secret)
 * @returns The rewritten prompt (always returns something usable)
 */
export async function rewriteForCopyright(
  prompt: string,
  mode: RewriteMode,
  apiKey: string,
): Promise<string> {
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const claude = new Anthropic({ apiKey });

    const result = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SYSTEM_PROMPTS[mode],
      messages: [{ role: "user", content: prompt }],
    });

    const firstBlock = result.content[0];
    if (firstBlock?.type === "text" && firstBlock.text.trim()) {
      return firstBlock.text.trim();
    }

    // Empty response — fall back to regex
    return fallbackCopyrightStrip(prompt);
  } catch (err) {
    console.warn("Copyright rewriter failed, using fallback strip:", err);
    return fallbackCopyrightStrip(prompt);
  }
}
