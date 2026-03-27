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
  gameType?: "board" | "adventure" | "cards";
  storySetup?: string;
  choiceSeeds?: string[];
  adventureLength?: "short" | "medium" | "long";
  cardMechanic?: "matching" | "collecting" | "battle";
  cardDescriptions?: string[];
  cardBackStyle?: "classic" | "decorated" | "custom";
  cardBackCustom?: string;
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
- Include 2-4 bonus spaces. Labels MUST include a number: "Go forward 2!" or "Boost — move ahead 3!". Type: "bonus".
- Include 1-2 setback spaces. Labels MUST include a number: "Go back 2!" or "Oops — slip back 1!". Type: "setback".
- Include 0-1 shortcut spaces. Labels should say where to jump: "Shortcut — jump to space 20!". Type: "special".
- Bonus/setback/special space labels must always contain a movement number (1-3). This is critical for gameplay.
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

// ── Card game prompt builder ────────────────────────────────

function buildCardGamePrompt(
  childName: string,
  childGrade: string | undefined,
  snapshot: { prioritySkills?: Array<{ tag: string; label: string; level: string }> } | undefined,
  inputs: WorkshopInput,
): string {
  const skillContext = snapshot?.prioritySkills?.length
    ? `\nChild's current skill levels:\n${snapshot.prioritySkills.map((s) => `- ${s.label}: ${s.level}`).join("\n")}`
    : "";

  const playerNames = inputs.players.map((p) => p.name).join(", ");
  const mechanic = inputs.cardMechanic ?? "matching";
  const descriptions = inputs.cardDescriptions?.length
    ? inputs.cardDescriptions.map((d) => `- "${d}"`).join("\n")
    : "- (none provided — create interesting cards that fit the theme)";

  const mechanicConfig: Record<string, { label: string; pairCount: string; setCount: string; cardCount: string; rules: string }> = {
    matching: {
      label: "Matching (Memory)",
      pairCount: "6-12 pairs",
      setCount: "",
      cardCount: "",
      rules: "Cards are face-down. On your turn, flip two cards. If they match, keep them! If not, flip them back. Most pairs wins.",
    },
    collecting: {
      label: "Collecting (Go Fish)",
      pairCount: "",
      setCount: "4-6 sets of 3-4 cards each",
      cardCount: "",
      rules: "Draw cards or ask other players for cards. Collect complete sets. Most sets wins.",
    },
    battle: {
      label: "Battle (War with a twist)",
      pairCount: "",
      setCount: "",
      cardCount: "16-24 cards",
      rules: "Each player plays a card. Compare power values — highest wins and collects the played cards. If tied, play again! Most cards at the end wins.",
    },
  };

  const config = mechanicConfig[mechanic] ?? mechanicConfig.matching;

  return `You are the Card Game Wizard, helping a child named ${childName} (${childGrade ?? "kindergarten"}) create a custom card game from their ideas.
${skillContext}

FAMILY VALUES CONTEXT:
- Every game ${childName} makes is a real game — never say "try again" or suggest the idea isn't good enough.
- Learning is invisible: reading practice and math are woven into card text naturally.
- ${childName} is the Story Keeper — the creator and authority of this game.
- All text will be read aloud by text-to-speech. Write for the ear, not the eye.

CARD GAME DESIGN CONSTRAINTS:
- Game mechanic: ${config.label}
- Core rules: ${config.rules}
- Maximum 5 rules (simple, clear sentences)
- All card text must be TTS-friendly: short sentences, no abbreviations, no special symbols
- 20-30% of cards should have a learning element (reading or math), calibrated to ${childName}'s level
  - Learning elements should feel natural, not forced — "read the magic word to activate your card" or "solve this to power up"
  - Mostly at the child's current skill level, 1-2 stretch challenges framed as "boss" or "legendary" cards
- Target play time: 10-15 minutes
- Tone: creative, encouraging, ${childName} is the creator

STORY INPUTS FROM ${childName.toUpperCase()}:
- Theme: ${inputs.theme}
- Players: ${playerNames}
- Game mechanic: ${mechanic}
- Card ideas from ${childName}:
${descriptions}

${mechanic === "matching" ? `Generate ${config.pairCount}. Each pair shares a connection (same category but different variations). For learning elements, pairs might be "word + picture" or "3+2" matched with "5".` : ""}
${mechanic === "collecting" ? `Generate ${config.setCount}. Each set has a theme name and 3-4 cards within it. For learning elements, claiming a card might require reading a word or answering a question.` : ""}
${mechanic === "battle" ? `Generate ${config.cardCount}. Each card has a name, power value (1-10), and optional special ability. For learning elements, answering correctly gives a +2 power bonus.` : ""}

Use ${childName}'s card ideas throughout. The players are real family members playing together.

Generate a complete card game definition. Return your response as JSON wrapped in <cardgame> tags.

The JSON must follow this exact schema:
<cardgame>
{
  "mechanic": "${mechanic}",
  "cards": [
    {
      "id": "card-1",
      "name": "string — card name",
      "spokenText": "TTS-optimized card name/description",
      "category": "string — group/pair/set name (for matching/collecting)",
      "value": 5,
      "specialAbility": "optional ability text for battle cards",
      "learningElement": {
        "type": "reading | math",
        "content": "the learning challenge text",
        "answer": "correct answer",
        "options": ["optional", "multiple", "choice", "answers"]
      },
      "artPrompt": "brief description for generating card face art"
    }
  ],
  "rules": [
    {
      "number": 1,
      "text": "rule text",
      "spokenText": "TTS-optimized version of the rule"
    }
  ],
  "metadata": {
    "deckSize": 24,
    "estimatedMinutes": 12,
    "playerCount": { "min": 2, "max": 4 }
  }
}
</cardgame>

IMPORTANT:
- Every card must have a unique ID starting with "card-"
- For matching: cards come in pairs sharing the same "category" value. Generate exactly 2 cards per pair.
- For collecting: cards are grouped by "category" into sets of 3-4 cards each.
- For battle: every card needs a "value" (1-10 power level). Higher = rarer/cooler.
- 20-30% of cards should have a "learningElement" — not every card
- "artPrompt" should describe the card's visual for art generation
- "spokenText" is what gets spoken aloud by TTS — keep it short and natural
- Keep rules to a maximum of 5, simple enough for a kindergartener to follow`;
}

// ── Extract JSON from <cardgame> tags ───────────────────────

function extractCardGameJson(text: string): string {
  const match = text.match(/<cardgame>\s*([\s\S]*?)\s*<\/cardgame>/);
  if (!match) {
    throw new HttpsError(
      "internal",
      "AI response did not contain <cardgame> tags. Cannot parse card game definition.",
    );
  }
  return match[1].trim();
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
  const isCards = workshopInput.gameType === "cards";

  const systemPrompt = isCards
    ? buildCardGamePrompt(childData.name, childData.grade, snapshotData, workshopInput)
    : isAdventure
      ? buildAdventurePrompt(childData.name, childData.grade, snapshotData, workshopInput)
      : buildWorkshopPrompt(childData.name, childData.grade, snapshotData, workshopInput);

  const model = modelForTask("workshop");

  const userContent = isCards
    ? "Generate the card game now."
    : isAdventure
      ? "Generate the choose-your-adventure story now."
      : "Generate the board game now.";

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: isCards ? 8192 : isAdventure ? 16384 : 4096,
    systemPrompt,
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
  });

  // Validate JSON extraction
  if (isCards) {
    const cardGameJson = extractCardGameJson(result.text);
    try {
      JSON.parse(cardGameJson);
    } catch {
      throw new HttpsError(
        "internal",
        "AI returned malformed JSON in <cardgame> tags. Please try again.",
      );
    }
  } else if (isAdventure) {
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

  const typeLabel = isCards ? "-cards" : isAdventure ? "-adventure" : "";
  console.log(
    `[AI] taskType=workshop${typeLabel} inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`,
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
export { buildWorkshopPrompt, buildAdventurePrompt, buildCardGamePrompt, extractGameJson, extractAdventureJson, extractCardGameJson };
export type { WorkshopInput };
