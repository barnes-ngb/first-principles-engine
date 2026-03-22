import { HttpsError } from "firebase-functions/v2/https";
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";

// ── Workshop prompt builder ─────────────────────────────────────

interface WorkshopInput {
  theme: string;
  characters: Array<{ name: string; trait: string }>;
  goal: string;
  challenges: Array<{ type: string; idea?: string }>;
  boardStyle: string;
  boardLength: string;
}

function buildWorkshopPrompt(
  childName: string,
  childGrade: string | undefined,
  snapshot: { prioritySkills?: Array<{ tag: string; label: string; level: string }> } | undefined,
  inputs: WorkshopInput,
): string {
  const skillContext = snapshot?.prioritySkills?.length
    ? `\nChild's current skill levels:\n${snapshot.prioritySkills.map((s) => `- ${s.label}: ${s.level}`).join("\n")}`
    : "";

  const spaceCount =
    inputs.boardLength === "short" ? 15
      : inputs.boardLength === "long" ? 35
        : 25;

  const characterList = inputs.characters
    .map((c) => `${c.name} (${c.trait})`)
    .join(", ");

  const challengeTypes = inputs.challenges
    .map((c) => (c.type === "custom" ? `custom: "${c.idea}"` : c.type))
    .join(", ");

  return `You are the Story Game Wizard, helping a child named ${childName} (${childGrade ?? "kindergarten"}) create a board game from their story ideas.
${skillContext}

FAMILY VALUES CONTEXT:
- Every game ${childName} makes is a real game — never say "try again" or suggest the idea isn't good enough.
- Learning is invisible: reading practice is "the card reads a word and you say it back," math is "count your spaces."
- ${childName} is the Story Keeper — the creator and authority of this game.
- All text will be read aloud by text-to-speech. Write for the ear, not the eye.

GAME DESIGN CONSTRAINTS:
- Maximum 5 rules (simple, clear sentences)
- All card text must be TTS-friendly: short sentences, no abbreviations, no special symbols
- Challenge cards: majority at the child's current skill level, 1-2 stretch "boss" cards framed as special (Dragon's Riddle, Boss Battle), not as "hard"
- Board: clear path, no ambiguity, ${spaceCount} total spaces
- Tone: adventurous, encouraging, ${childName} is the creator
- Target play time: 10-20 minutes

STORY INPUTS FROM ${childName.toUpperCase()}:
- Theme: ${inputs.theme}
- Characters: ${characterList}
- Goal: ${inputs.goal}
- Challenge types requested: ${challengeTypes}
- Board style: ${inputs.boardStyle}
- Board length: ${inputs.boardLength} (~${spaceCount} spaces)

Generate a complete board game definition. Return your response as JSON wrapped in <game> tags.

The JSON must follow this exact schema:
<game>
{
  "title": "string — creative game title",
  "storyIntro": "string — 2-3 sentences read aloud before the game starts, setting the scene",
  "board": {
    "spaces": [
      {
        "index": 0,
        "type": "normal | challenge | bonus | setback | special",
        "label": "optional theme label for the space",
        "challengeCardId": "optional — ID of the challenge card assigned to this space",
        "color": "optional hex color hint"
      }
    ],
    "totalSpaces": ${spaceCount}
  },
  "challengeCards": [
    {
      "id": "card-1",
      "type": "reading | math | story | action",
      "subjectBucket": "Reading | LanguageArts | Math | Art | Other",
      "content": "the challenge text shown on the card",
      "readAloudText": "TTS-optimized version — shorter, conversational, no abbreviations",
      "difficulty": "easy | medium | stretch",
      "answer": "optional correct answer for reading/math cards",
      "options": ["optional", "multiple", "choice", "answers"]
    }
  ],
  "rules": [
    {
      "number": 1,
      "text": "rule text",
      "readAloudText": "TTS-optimized version of the rule"
    }
  ],
  "metadata": {
    "playerCount": { "min": 2, "max": 4 },
    "estimatedMinutes": 15,
    "theme": "${inputs.theme}"
  }
}
</game>

IMPORTANT:
- Generate 8-16 challenge cards mixing the types ${childName} requested
- Every challenge space on the board must have a corresponding challengeCardId
- The first space (index 0) is Start, the last space is Finish
- Include 2-4 bonus spaces ("Go forward!") and 1-2 setback spaces ("Oh no!")
- Each card needs both "content" and "readAloudText" — the readAloudText is what gets spoken
- subjectBucket must be one of: Reading, LanguageArts, Math, Art, Other
- reading cards → Reading or LanguageArts, math cards → Math, story cards → LanguageArts, action cards → Other`;
}

// ── Extract JSON from <game> tags ───────────────────────────────

function extractGameJson(text: string): string {
  const match = text.match(/<game>\s*([\s\S]*?)\s*<\/game>/);
  if (!match) {
    throw new HttpsError(
      "internal",
      "AI response did not contain <game> tags. Cannot parse game definition.",
    );
  }
  return match[1].trim();
}

// ── Handler ─────────────────────────────────────────────────────

export const handleWorkshop = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, messages, apiKey } = ctx;

  // Parse workshop inputs from the first message
  let workshopInput: WorkshopInput;
  try {
    workshopInput = JSON.parse(messages[0].content);
  } catch {
    throw new HttpsError(
      "invalid-argument",
      "workshop requires JSON with story inputs (theme, characters, goal, challenges, boardStyle, boardLength).",
    );
  }

  const systemPrompt = buildWorkshopPrompt(
    childData.name,
    childData.grade,
    snapshotData,
    workshopInput,
  );

  const model = modelForTask("workshop");

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 4096,
    systemPrompt,
    messages: [{ role: "user", content: "Generate the board game now." }],
  });

  // Validate that we can extract the game JSON
  const gameJson = extractGameJson(result.text);
  try {
    JSON.parse(gameJson);
  } catch {
    throw new HttpsError(
      "internal",
      "AI returned malformed JSON in <game> tags. Please try again.",
    );
  }

  console.log(
    `[AI] taskType=workshop inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`,
  );

  await logAiUsage(db, familyId, {
    childId,
    taskType: "workshop",
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return {
    message: result.text,
    model,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    },
  };
};

// Export for testing
export { buildWorkshopPrompt, extractGameJson };
export type { WorkshopInput };
