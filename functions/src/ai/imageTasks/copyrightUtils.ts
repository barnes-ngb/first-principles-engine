/**
 * Shared copyright filtering utilities for image generation tasks.
 *
 * Both generateImage and enhanceSketch use these to strip copyrighted
 * character/franchise names from prompts before sending to image models.
 */

import { CLAUDE_HAIKU } from "../models.js";

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
      model: CLAUDE_HAIKU,
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

// ── Alternatives after a refusal (FEAT-195) ────────────────────────

/** How many rewordings a refused prompt comes back with. */
export const ALTERNATIVES_MAX = 3;

/**
 * The same cheap Haiku that already rewrites every prompt, asked a different
 * question: the picture was refused anyway — what else could this person have
 * meant? Three answers, so the card offers a choice rather than a single
 * take-it-or-leave-it.
 *
 * Deliberately NOT a general "make it safe" rewrite: {@link rewriteForCopyright}
 * already ran and the model still said no, so the useful move is to vary the
 * *subject* the person described, not to strip names again.
 */
const ALTERNATIVES_SYSTEM = `A child asked for a picture and the image generator's safety filter refused it. Suggest what they could ask for instead.

Write EXACTLY 3 alternative picture descriptions, one per line.

RULES:
- Keep what they actually wanted — the same subject, mood and action, described differently.
- Make the three genuinely different from each other. Not one description reworded three ways.
- NEVER use a character name, franchise name, game name or brand name. Describe how it LOOKS.
- Describe a picture, not a story: what is in it and what it looks like.
- Nothing violent, frightening, or involving real people.
- Under 20 words each. Plain words a child can read.

OUTPUT: three lines. No numbering, no bullets, no quotes, no preamble, no blank lines.`;

/** What kind of picture each mode is asking for, so the suggestions fit the door. */
const ALTERNATIVES_ASK: Record<RewriteMode, string> = {
  sticker: "They asked for a sticker — one thing on its own, no background.",
  scene: "They asked for a scene — a world or background, not a character portrait.",
  sketch: "They asked to redraw their own drawing. Describe what the drawing shows.",
};

/**
 * Parse the suggester's reply into at most {@link ALTERNATIVES_MAX} clean lines.
 *
 * Pure, and strict about two things: a line that still names a franchise
 * character would be refused again (so it is dropped rather than offered as a
 * fix), and a line long enough to be a paragraph is not a tappable choice.
 */
export function parsePromptAlternatives(
  raw: string,
  max: number = ALTERNATIVES_MAX,
): string[] {
  return raw
    .split("\n")
    .map((line) =>
      line
        // Leading bullet or "1." / "1)" numbering, however the model formats it.
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
        .replace(/^["'“]+|["'”]+$/g, "")
        .trim(),
    )
    .filter(
      (line) =>
        line.length > 0 &&
        line.length <= 300 &&
        // Still names an IP character → it would just be refused again.
        line.match(COPYRIGHT_NAMES) === null,
    )
    .slice(0, max);
}

/**
 * Ask for alternative descriptions of a refused prompt.
 *
 * **Spends one cheap call, and only on the refusal path** — every caller invokes
 * this from inside a `catch` that has already decided the image was blocked, so
 * a successful generation never pays for it. Never throws and never rejects:
 * an empty list means the client shows its own static tips, which is a worse
 * card but still a card.
 */
export async function suggestPromptAlternatives(
  prompt: string,
  mode: RewriteMode,
  apiKey: string,
): Promise<string[]> {
  // Nothing to reword — an uncaptioned sketch, say. Skip the call entirely.
  if (!prompt.trim()) return [];
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const claude = new Anthropic({ apiKey });

    const result = await claude.messages.create({
      model: CLAUDE_HAIKU,
      max_tokens: 300,
      system: ALTERNATIVES_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${ALTERNATIVES_ASK[mode]}\n\nThey asked for: ${prompt}`,
        },
      ],
    });

    const firstBlock = result.content[0];
    if (firstBlock?.type === "text") {
      return parsePromptAlternatives(firstBlock.text);
    }
    return [];
  } catch (err) {
    console.warn("Alternative suggester failed:", err);
    return [];
  }
}
