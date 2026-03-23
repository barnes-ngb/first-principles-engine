import { HttpsError } from "firebase-functions/v2/https";
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";

// ── Workshop prompt builder ─────────────────────────────────────

interface WorkshopInput {
  theme: string;
  players: Array<{ id: string; name: string; avatarUrl?: string; isCreator: boolean }>;
  goal: string;
  challenges: Array<{ type: string; idea?: string }>;
  boardStyle: string;
  boardLength: string;
  gameType?: "board" | "adventure";
  storySetup?: string;
  choiceSeeds?: string[];
  adventureLength?: "short" | "medium" | "long";
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

  const playerNames = inputs.players.map((p) => p.name).join(", ");

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
- Players: ${playerNames}
- Goal: ${inputs.goal}
- Challenge types requested: ${challengeTypes}
- Board style: ${inputs.boardStyle}
- Board length: ${inputs.boardLength} (~${spaceCount} spaces)

The players are real family members playing together. Use their real names in the story intro and narrative flavor text. Story NPCs (villains, creatures, bosses) come from the theme — they are not players.

Generate a complete board game definition. Return your response as JSON wrapped in <game> tags.

The JSON must follow this exact schema:
<game>
{
  "title": "string — creative game title",
  "storyIntro": "string — 2-3 sentences read aloud before the game starts, setting the scene using the real player names",
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

// ── Adventure prompt builder ────────────────────────────────────

function buildAdventurePrompt(
  childName: string,
  childGrade: string | undefined,
  snapshot: { prioritySkills?: Array<{ tag: string; label: string; level: string }> } | undefined,
  inputs: WorkshopInput,
): string {
  const skillContext = snapshot?.prioritySkills?.length
    ? `\nChild's current skill levels:\n${snapshot.prioritySkills.map((s) => `- ${s.label}: ${s.level}`).join("\n")}`
    : "";

  const playerNames = inputs.players.map((p) => p.name).join(", ");

  const choiceSeedsList = inputs.choiceSeeds?.length
    ? inputs.choiceSeeds.map((c) => `- "${c}"`).join("\n")
    : "- (none provided — create interesting binary choices that fit the story)";

  const depthConfig =
    inputs.adventureLength === "short"
      ? { depth: "3-4 levels", choices: "about 5" }
      : inputs.adventureLength === "long"
        ? { depth: "5-6 levels", choices: "about 12" }
        : { depth: "4-5 levels", choices: "about 8" };

  return `You are the Story Adventure Wizard, helping a child named ${childName} (${childGrade ?? "kindergarten"}) create a choose-your-adventure story from their ideas.
${skillContext}

FAMILY VALUES CONTEXT:
- Every adventure ${childName} creates is a real story — never say "try again" or suggest the idea isn't good enough.
- Learning is invisible: reading practice and math are embedded naturally into the story flow.
- ${childName} is the Story Keeper — the creator and authority of this adventure.
- All text will be read aloud by text-to-speech. Write for the ear, not the eye.
- NO bad endings — if a path leads somewhere tricky, it's a "retry" ending that links back.

ADVENTURE DESIGN CONSTRAINTS:
- Branching tree structure, ${depthConfig.depth} deep, ${depthConfig.choices} total choice points
- Each node has 2-3 choices (except endings)
- Multiple paths to multiple endings
- Some nodes have embedded challenge cards (reading, math, story, action)
- Challenge difficulty: mostly at child's current level, 1-2 stretch challenges framed as exciting
- Retry endings say something like "Oh no! Want to go back and try another way?" and link back to the previous choice node
- Victory endings celebrate the adventure
- All text must be TTS-friendly: short sentences, no abbreviations, no special symbols

STORY INPUTS FROM ${childName.toUpperCase()}:
- Theme: ${inputs.theme}
- Players: ${playerNames}
- Story setup: ${inputs.storySetup ?? "a mysterious adventure"}
- Choice ideas from ${childName}:
${choiceSeedsList}
- Adventure length: ${inputs.adventureLength ?? "medium"} (${depthConfig.choices} choices, ${depthConfig.depth})

Use ${childName}'s story setup and choice seeds throughout the adventure. The players are real family members experiencing the story together.

Generate a complete adventure tree. Return your response as JSON wrapped in <adventure> tags.

The JSON must follow this exact schema:
<adventure>
{
  "nodes": {
    "node-1": {
      "id": "node-1",
      "text": "2-4 sentences of narrative text",
      "spokenText": "TTS-optimized version — shorter, conversational",
      "illustration": "brief description for generating scene art (optional)",
      "choices": [
        {
          "id": "choice-1a",
          "text": "choice label shown on button",
          "spokenText": "TTS version of the choice",
          "nextNodeId": "node-2"
        }
      ],
      "challenge": {
        "type": "reading | math | story | action",
        "content": "the challenge text",
        "spokenText": "TTS version",
        "answer": "optional correct answer",
        "options": ["optional", "multiple", "choice"],
        "difficulty": "easy | medium | stretch"
      },
      "isEnding": false
    },
    "node-ending-1": {
      "id": "node-ending-1",
      "text": "ending narrative",
      "spokenText": "TTS version",
      "isEnding": true,
      "endingType": "victory | neutral | retry",
      "retryNodeId": "node-id-to-go-back-to (only for retry endings)"
    }
  },
  "rootNodeId": "node-1",
  "totalNodes": 15,
  "totalEndings": 3,
  "challengeCount": 4
}
</adventure>

IMPORTANT:
- Every node must have a unique ID starting with "node-"
- Every choice must have a unique ID starting with "choice-"
- The root node is the beginning of the story
- No dead ends — every non-ending node must have choices
- Include 3-5 challenge cards spread across the tree (not on every node)
- At least 2 endings should be victory/neutral, and 1 can be retry
- Retry endings MUST have retryNodeId pointing to a valid earlier node
- Weave ${childName}'s story setup and choice seeds throughout naturally`;
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

// ── Extract JSON from <adventure> tags ──────────────────────────

function extractAdventureJson(text: string): string {
  const match = text.match(/<adventure>\s*([\s\S]*?)\s*<\/adventure>/);
  if (!match) {
    throw new HttpsError(
      "internal",
      "AI response did not contain <adventure> tags. Cannot parse adventure definition.",
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
      "workshop requires JSON with story inputs.",
    );
  }

  const isAdventure = workshopInput.gameType === "adventure";

  const systemPrompt = isAdventure
    ? buildAdventurePrompt(childData.name, childData.grade, snapshotData, workshopInput)
    : buildWorkshopPrompt(childData.name, childData.grade, snapshotData, workshopInput);

  const model = modelForTask("workshop");

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: isAdventure ? 8192 : 4096,
    systemPrompt,
    messages: [
      {
        role: "user",
        content: isAdventure
          ? "Generate the choose-your-adventure story now."
          : "Generate the board game now.",
      },
    ],
  });

  // Validate JSON extraction
  if (isAdventure) {
    const adventureJson = extractAdventureJson(result.text);
    try {
      JSON.parse(adventureJson);
    } catch {
      throw new HttpsError(
        "internal",
        "AI returned malformed JSON in <adventure> tags. Please try again.",
      );
    }
  } else {
    const gameJson = extractGameJson(result.text);
    try {
      JSON.parse(gameJson);
    } catch {
      throw new HttpsError(
        "internal",
        "AI returned malformed JSON in <game> tags. Please try again.",
      );
    }
  }

  console.log(
    `[AI] taskType=workshop${isAdventure ? "-adventure" : ""} inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`,
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
export { buildWorkshopPrompt, buildAdventurePrompt, extractGameJson, extractAdventureJson };
export type { WorkshopInput };
