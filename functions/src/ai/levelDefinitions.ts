/**
 * Shared level-definition constants for AI prompts.
 *
 * Single source of truth for the concept bands that anchor the math quest
 * prompt (chat.ts buildQuestPrompt math branch), the math guided-evaluation
 * prompt (chat.ts buildEvaluationPrompt math branch), and any other
 * server-side prompt content that needs to reference math L1-L6.
 */

/**
 * Math concept bands aligned with QUEST_MODE_LEVEL_CAP.math = 6.
 * Prose form, suitable for embedding in a prompt as a bullet list.
 */
export const MATH_CONCEPT_BANDS = [
  "Level 1: Number sense — counting to 20, recognizing digits, comparing numbers (greater/less), number sequencing",
  "Level 2: Addition facts within 20 — single-digit addition, doubles, near-doubles, making 10",
  "Level 3: Subtraction facts within 20 — single-digit subtraction, fact families, missing addends",
  "Level 4: Multi-step word problems, place value (tens and ones), two-digit addition and subtraction",
  "Level 5: Multiplication facts, multi-digit multiplication, basic division, repeated addition / arrays",
  "Level 6: Fractions (recognizing, comparing, simple operations), more complex word problems, measurement and time",
] as const;

/**
 * Joined string form for prompt embedding. Each line is a level bullet.
 */
export const MATH_CONCEPT_BANDS_TEXT = MATH_CONCEPT_BANDS.map((b) => `- ${b}`).join("\n");
