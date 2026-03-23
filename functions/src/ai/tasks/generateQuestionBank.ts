import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { claudeApiKey } from "../aiConfig.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { buildContextForTask } from "../contextSlices.js";

// ── Types ──────────────────────────────────────────────────────

interface BankedQuestion {
  id: string;
  domain: string;
  level: number;
  skill: string;
  prompt: string;
  stimulus?: string;
  phonemeDisplay?: string;
  options: string[];
  correctAnswer: string;
  encouragement?: string;
  allowOpenResponse?: boolean;
  generatedAt: string;
  served?: boolean;
}

interface GenerateRequest {
  familyId: string;
  childId: string;
  domain: string;
  /** Number of questions per level to generate (default 8) */
  questionsPerLevel?: number;
  /** Which levels to generate for (default [1,2,3,4,5,6]) */
  levels?: number[];
}

// ── Prompt builders ────────────────────────────────────────────

function buildBatchReadingPrompt(level: number, count: number): string {
  const levelSkills: Record<number, string> = {
    1: "Letter sounds (consonant sounds, short vowels). Types: letter-to-sound, initial sound match, rhyming, vowel sound ID.",
    2: "CVC blending by word family (-at, -an, -it, -ig, -ot, -ug, -en, -op). Types: word reading with stimulus, blending from phonemes, rhyming, vowel sound ID.",
    3: "Digraphs (sh, ch, th, wh). Types: digraph identification, fill-in-blank, word reading with stimulus, real vs nonsense word.",
    4: "Consonant blends (bl, cr, st, tr, fl, gr, nd, nk). Types: blend identification, fill-in-blank, context clues, word reading with stimulus.",
    5: "CVCe / long vowels (silent-e pattern: make, bike, home, cute). Types: CVCe identification, rhyming with long vowels, context clues, synonym.",
    6: "Vowel teams (ea, ai, oa, ee, oo). Types: vowel team identification, word reading, context clues, synonym.",
  };

  return `Generate exactly ${count} multiple-choice reading questions for Level ${level}.

SKILL FOCUS: ${levelSkills[level] || levelSkills[2]}

RULES:
- Each question has exactly 3 options
- correctAnswer MUST exactly match one of the options
- Use plausible distractors (same word family, similar-looking words)
- Vary the position of the correct answer across questions
- Vary question types — don't repeat the same format consecutively
- For word-reading questions, include "stimulus" field with the target word
- For fill-in-blank, set stimulus to the pattern (e.g., "s_op")
- Levels 1-3: may include phonemeDisplay with simple notation like /s/ /t/ /o/ /p/
- Level 4+: set phonemeDisplay to null
- Set allowOpenResponse: true for word-reading questions (stimulus-based, no blanks)
- Focus on comprehension, NOT pronunciation
- Keep prompts short and clear

Respond with ONLY valid JSON array, no markdown fences:
[
  {
    "level": ${level},
    "skill": "phonics.cvc.short-o",
    "prompt": "What word is this?",
    "stimulus": "dog",
    "phonemeDisplay": ${level <= 3 ? '"/d/ /o/ /g/"' : "null"},
    "options": ["dig", "dog", "dug"],
    "correctAnswer": "dog",
    "encouragement": "The middle sound is /o/ like in 'hot'!",
    "allowOpenResponse": true
  }
]`;
}

function buildBatchMathPrompt(level: number, count: number): string {
  const levelSkills: Record<number, string> = {
    1: "Counting & number recognition. Types: counting with emoji objects, number comparison, number sequence, number word to digit.",
    2: "Addition & subtraction facts to 20. Types: addition fact, subtraction fact, simple word problem, missing addend, doubles recognition. Use Minecraft themes.",
    3: "Place value & two-digit operations. Types: two-digit addition/subtraction, place value, skip counting, two-digit comparison.",
    4: "Multiplication concepts. Types: times table fact, array/repeated addition, fact recognition, multiplication word problem. Use Minecraft themes.",
    5: "Multi-digit arithmetic & fractions intro. Types: three-digit addition/subtraction, multiply 2-digit by 1-digit, halves, basic fraction ID.",
    6: "Word problems & reasoning. Types: multi-step word problems, money, elapsed time, fraction comparison, measurement. Use Minecraft themes.",
  };

  return `Generate exactly ${count} multiple-choice math questions for Level ${level}.

SKILL FOCUS: ${levelSkills[level] || levelSkills[2]}

RULES:
- Each question has exactly 3 options
- correctAnswer MUST exactly match one of the options (exact string match)
- For number answers, ensure format matches options exactly (e.g., "12" not "twelve")
- Use plausible distractors (off-by-one errors, common misconceptions)
- Vary the position of the correct answer
- Vary question types — don't repeat the same format consecutively
- For equations needing prominent display, set "stimulus" to the expression (e.g., "24 + 37")
- For word problems, set stimulus to null
- For counting, use emoji objects in stimulus: "⭐⭐⭐⭐⭐"
- Use Minecraft themes where natural: diamonds, blocks, pickaxes, creepers
- Keep prompts short and clear

Respond with ONLY valid JSON array, no markdown fences:
[
  {
    "level": ${level},
    "skill": "math.addition.within-20",
    "prompt": "Steve has 7 diamonds and finds 5 more. How many?",
    "stimulus": null,
    "options": ["10", "12", "13"],
    "correctAnswer": "12",
    "encouragement": "7 + 5 = 12. Count up from 7!",
    "allowOpenResponse": false
  }
]`;
}

// ── Question validation ────────────────────────────────────────

function validateQuestion(q: Record<string, unknown>): boolean {
  if (!q.skill || !q.prompt || !q.correctAnswer) return false;
  if (!Array.isArray(q.options) || q.options.length !== 3) return false;

  const correct = String(q.correctAnswer).trim().toLowerCase();
  const hasMatch = (q.options as string[]).some(
    (opt) => String(opt).trim().toLowerCase() === correct,
  );
  if (!hasMatch) return false;

  // Check for duplicate options
  const lower = (q.options as string[]).map((o) => String(o).trim().toLowerCase());
  if (new Set(lower).size !== lower.length) return false;

  return true;
}

// ── Callable Cloud Function ────────────────────────────────────

export const generateQuestionBank = onCall(
  { secrets: [claudeApiKey], timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { familyId, childId, domain, questionsPerLevel = 8, levels = [1, 2, 3, 4, 5, 6] } =
      request.data as GenerateRequest;

    if (!familyId || !childId || !domain) {
      throw new HttpsError("invalid-argument", "familyId, childId, and domain are required.");
    }

    if (request.auth.uid !== familyId) {
      throw new HttpsError("permission-denied", "You do not have access to this family.");
    }

    const apiKey = claudeApiKey.value();
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "Missing CLAUDE_API_KEY secret.");
    }

    const db = getFirestore();

    // Load child context for skill-aware generation
    const childSnap = await db.doc(`families/${familyId}/children/${childId}`).get();
    if (!childSnap.exists) {
      throw new HttpsError("not-found", "Child not found.");
    }

    const childData = childSnap.data() as { name: string; grade?: string };
    const snapshotSnap = await db.doc(`families/${familyId}/skillSnapshots/${childId}`).get();
    const snapshotData = snapshotSnap.exists ? snapshotSnap.data() : undefined;

    const contextSections = await buildContextForTask("quest", {
      db, familyId, childId, childData, snapshotData,
    });
    const contextPrefix = contextSections.join("\n\n");

    // Generate questions for each level in parallel (2 levels at a time to manage rate limits)
    const allQuestions: BankedQuestion[] = [];
    const now = new Date().toISOString();
    let totalInput = 0;
    let totalOutput = 0;

    // Process levels in batches of 2
    for (let i = 0; i < levels.length; i += 2) {
      const batch = levels.slice(i, i + 2);

      const results = await Promise.all(
        batch.map(async (level) => {
          const promptBuilder = domain === "math" ? buildBatchMathPrompt : buildBatchReadingPrompt;
          const batchPrompt = promptBuilder(level, questionsPerLevel);

          const systemPrompt = `${contextPrefix}\n\nYou are generating a bank of pre-made questions for an interactive quiz. Generate diverse, high-quality questions.`;

          const result = await callClaude({
            apiKey,
            model: "claude-haiku-4-5-20251001",
            maxTokens: 4096,
            systemPrompt,
            messages: [{ role: "user", content: batchPrompt }],
          });

          totalInput += result.inputTokens;
          totalOutput += result.outputTokens;

          // Parse the JSON array response
          try {
            // Strip markdown fences if present
            let text = result.text.trim();
            if (text.startsWith("```")) {
              text = text.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
            }
            const questions = JSON.parse(text) as Array<Record<string, unknown>>;

            return questions
              .filter(validateQuestion)
              .map((q, idx) => ({
                id: `bank_${domain}_${level}_${Date.now()}_${idx}`,
                domain,
                level: Number(q.level) || level,
                skill: String(q.skill || ""),
                prompt: String(q.prompt || ""),
                stimulus: q.stimulus ? String(q.stimulus) : undefined,
                phonemeDisplay: q.phonemeDisplay ? String(q.phonemeDisplay) : undefined,
                options: (q.options as string[]).map(String),
                correctAnswer: String(q.correctAnswer || ""),
                encouragement: q.encouragement ? String(q.encouragement) : undefined,
                allowOpenResponse: Boolean(q.allowOpenResponse),
                generatedAt: now,
                served: false,
              } satisfies BankedQuestion));
          } catch (err) {
            console.warn(`Failed to parse question bank for level ${level}:`, err);
            return [];
          }
        }),
      );

      for (const levelQuestions of results) {
        allQuestions.push(...levelQuestions);
      }
    }

    // Save to Firestore
    const docId = `${childId}_${domain}`;
    const bankDoc = {
      childId,
      domain,
      questions: allQuestions.map((q) => JSON.parse(JSON.stringify(q))),
      generatedAt: now,
      remainingCount: allQuestions.length,
    };

    await db.doc(`families/${familyId}/questionBanks/${docId}`).set(bankDoc);

    // Log usage
    await logAiUsage(db, familyId, {
      childId,
      taskType: "generateQuestionBank",
      model: "claude-haiku-4-5-20251001",
      inputTokens: totalInput,
      outputTokens: totalOutput,
      questionsGenerated: allQuestions.length,
    });

    console.log(
      `[AI] Generated question bank: ${allQuestions.length} questions for ${domain} (${levels.length} levels)`,
    );

    return {
      questionsGenerated: allQuestions.length,
      levels: levels.length,
      domain,
    };
  },
);
