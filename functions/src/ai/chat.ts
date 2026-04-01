import type { Firestore } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { claudeApiKey } from "./aiConfig.js";
import { requireEmailAuth, checkRateLimit } from "./authGuard.js";

// ── Request / Response types ────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Task types determine model selection.
 *  - "plan" / "evaluate" → Sonnet (complex reasoning)
 *  - "generate" / "chat"  → Haiku  (routine generation)
 */
export const TaskType = {
  Plan: "plan",
  Evaluate: "evaluate",
  Generate: "generate",
  Chat: "chat",
  Quest: "quest",
  GenerateStory: "generateStory",
  Workshop: "workshop",
  AnalyzeWorkbook: "analyzeWorkbook",
  Disposition: "disposition",
  Conundrum: "conundrum",
  WeeklyFocus: "weeklyFocus",
  Scan: "scan",
  ShellyChat: "shellyChat",
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

interface ChatRequest {
  familyId: string;
  childId: string;
  taskType: TaskType;
  messages: ChatMessage[];
  /** Evaluation domain (only used when taskType === 'evaluate') */
  domain?: string;
}

interface ChatResponse {
  message: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

// ── Model mapping ───────────────────────────────────────────────

export function modelForTask(taskType: TaskType): string {
  switch (taskType) {
    case TaskType.Plan:
    case TaskType.Evaluate:
    case TaskType.Quest:
    case TaskType.GenerateStory:
    case TaskType.Workshop:
    case TaskType.AnalyzeWorkbook:
    case TaskType.Disposition:
    case TaskType.Conundrum:
    case TaskType.WeeklyFocus:
    case TaskType.Scan:
    case TaskType.ShellyChat:
      return "claude-sonnet-4-6";
    case TaskType.Generate:
    case TaskType.Chat:
    default:
      return "claude-haiku-4-5-20251001";
  }
}

// ── Enriched context types ──────────────────────────────────────

interface WorkbookPace {
  name: string;
  unitLabel: string;
  currentPosition: number;
  totalUnits: number;
  unitsPerDayNeeded: number;
  targetFinishDate: string;
  status: "ahead" | "on-track" | "behind";
}

interface WeekContext {
  theme: string;
  virtue: string;
  scriptureRef: string;
  heartQuestion?: string;
}

interface EngagementSummary {
  activity: string;
  counts: Record<string, number>;
}

/** A grade/review result from a captured worksheet or activity. */
interface GradeResult {
  activity: string;
  result: string;
  date: string;
}


// ── Date helpers ────────────────────────────────────────────────

/** Returns YYYY-MM-DD string for a Date. */
function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns the Monday of the ISO week containing the given date. */
export function getWeekMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Returns school year start (Aug 1) for the given date. */
function schoolYearStart(d: Date): string {
  const year = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${year}-08-01`;
}

// ── Enriched context loaders ────────────────────────────────────

/** Load workbook configs and calculate pace for each. */
export async function loadWorkbookPaces(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<WorkbookPace[]> {
  const snap = await db
    .collection(`families/${familyId}/workbookConfigs`)
    .where("childId", "==", childId)
    .get();

  const today = new Date();
  const paces: WorkbookPace[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as {
      name: string;
      unitLabel: string;
      currentPosition: number;
      totalUnits: number;
      targetFinishDate: string;
      schoolDaysPerWeek: number;
    };

    const remaining = data.totalUnits - data.currentPosition;
    const targetDate = new Date(data.targetFinishDate + "T00:00:00");
    const msPerDay = 86_400_000;
    const calendarDaysLeft = Math.max(
      1,
      Math.ceil((targetDate.getTime() - today.getTime()) / msPerDay),
    );
    // Approximate school days: (calendarDays / 7) * schoolDaysPerWeek
    const schoolDaysLeft = Math.max(
      1,
      Math.round((calendarDaysLeft / 7) * (data.schoolDaysPerWeek || 5)),
    );
    const unitsPerDay = remaining / schoolDaysLeft;

    let status: WorkbookPace["status"];
    if (unitsPerDay <= 0.8) status = "ahead";
    else if (unitsPerDay <= 1.2) status = "on-track";
    else status = "behind";

    paces.push({
      name: data.name,
      unitLabel: data.unitLabel || "lesson",
      currentPosition: data.currentPosition,
      totalUnits: data.totalUnits,
      unitsPerDayNeeded: Math.round(unitsPerDay * 10) / 10,
      targetFinishDate: data.targetFinishDate,
      status,
    });
  }

  return paces;
}

/** Load current week's plan (theme, virtue, scripture). */
export async function loadWeekContext(
  db: Firestore,
  familyId: string,
): Promise<WeekContext | null> {
  const monday = getWeekMonday(new Date());
  const weekId = toDateString(monday);

  const snap = await db.doc(`families/${familyId}/weeks/${weekId}`).get();

  if (!snap.exists) return null;

  const data = snap.data() as {
    theme?: string;
    virtue?: string;
    scriptureRef?: string;
    heartQuestion?: string;
  };

  if (!data.theme && !data.virtue && !data.scriptureRef) return null;

  return {
    theme: data.theme || "",
    virtue: data.virtue || "",
    scriptureRef: data.scriptureRef || "",
    heartQuestion: data.heartQuestion,
  };
}

/** Load hours logged since school year start and sum total minutes. */
export async function loadHoursSummary(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<{ totalMinutes: number }> {
  const startDate = schoolYearStart(new Date());

  const snap = await db
    .collection(`families/${familyId}/hours`)
    .where("childId", "==", childId)
    .where("date", ">=", startDate)
    .get();

  let totalMinutes = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as { minutes?: number; hours?: number };
    totalMinutes += data.minutes || 0;
    if (data.hours) totalMinutes += data.hours * 60;
  }

  return { totalMinutes };
}

/** Load engagement data from recent day logs (last 14 days). */
export async function loadEngagementSummary(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<EngagementSummary[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = toDateString(cutoff);

  const snap = await db
    .collection(`families/${familyId}/days`)
    .where("childId", "==", childId)
    .where("date", ">=", cutoffStr)
    .get();

  const byActivity = new Map<string, Record<string, number>>();

  for (const doc of snap.docs) {
    const data = doc.data() as {
      checklist?: Array<{ label?: string; engagement?: string }>;
    };
    if (!data.checklist) continue;
    for (const item of data.checklist) {
      if (!item.engagement || !item.label) continue;
      const activity = item.label.replace(/\s*\(\d+m\)\s*$/, "");
      if (!byActivity.has(activity)) {
        byActivity.set(activity, { engaged: 0, okay: 0, struggled: 0, refused: 0 });
      }
      const counts = byActivity.get(activity)!;
      if (counts[item.engagement] !== undefined) {
        counts[item.engagement]++;
      }
    }
  }

  return [...byActivity.entries()].map(([activity, counts]) => ({
    activity,
    counts,
  }));
}

/** Load grade/review results from recent day logs (last 14 days). */
export async function loadGradeResults(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<GradeResult[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = toDateString(cutoff);

  const snap = await db
    .collection(`families/${familyId}/days`)
    .where("childId", "==", childId)
    .where("date", ">=", cutoffStr)
    .get();

  const results: GradeResult[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as {
      date?: string;
      checklist?: Array<{ label?: string; gradeResult?: string }>;
    };
    if (!data.checklist) continue;
    for (const item of data.checklist) {
      if (!item.gradeResult || !item.label) continue;
      results.push({
        activity: item.label.replace(/\s*\(\d+m\)\s*$/, ""),
        result: item.gradeResult,
        date: data.date || "unknown",
      });
    }
  }

  return results;
}

/** Load draft book count for child. */
export async function loadDraftBookCount(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<number> {
  const snap = await db
    .collection(`families/${familyId}/books`)
    .where("childId", "==", childId)
    .where("status", "==", "draft")
    .get();
  return snap.size;
}

/** Load word mastery summary from quest wordProgress collection. */
export async function loadWordMasterySummary(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<string> {
  const snap = await db
    .collection(`families/${familyId}/children/${childId}/wordProgress`)
    .get();

  if (snap.empty) return "";

  const words = snap.docs.map(
    (d) =>
      d.data() as {
        word: string;
        pattern: string;
        masteryLevel: string;
        correctCount: number;
        wrongCount: number;
        skippedCount: number;
      },
  );

  const counts = { known: 0, emerging: 0, struggling: 0, "not-yet": 0 };
  for (const w of words) {
    if (w.masteryLevel in counts) {
      counts[w.masteryLevel as keyof typeof counts]++;
    }
  }

  const lines = [
    `WORD MASTERY: ${words.length} words tracked. ${counts.known} mastered, ${counts.emerging} emerging, ${counts.struggling} struggling, ${counts["not-yet"]} not-yet.`,
  ];

  // Group struggling words by pattern
  const struggling = words.filter(
    (w) => w.masteryLevel === "struggling" || w.masteryLevel === "not-yet",
  );

  if (struggling.length > 0) {
    const byPattern = new Map<string, string[]>();
    for (const w of struggling) {
      const key = w.pattern || "unknown";
      if (!byPattern.has(key)) byPattern.set(key, []);
      byPattern.get(key)!.push(w.word);
    }

    const patternSummaries = [...byPattern.entries()]
      .map(([pattern, wordList]) => `${pattern} (${wordList.join(", ")})`)
      .join("; ");

    lines.push(`STRUGGLING PATTERNS: ${patternSummaries}`);
    lines.push(
      `STRUGGLING WORDS: ${struggling.map((w) => w.word).join(", ")}`,
    );
    lines.push(
      "SUGGESTION: Generate or assign a sight word story targeting these struggling words.",
    );
  }

  return lines.join("\n");
}


// ── Types ───────────────────────────────────────────────────────

interface ChildContext {
  name: string;
  grade?: string;
  prioritySkills?: Array<{ tag: string; label: string; level: string }>;
  supports?: Array<{ label: string; description: string }>;
  stopRules?: Array<{ label: string; trigger: string; action: string }>;
}


// ── Plan output format instructions ─────────────────────────────

/** Returns plan output format instructions for the system prompt. */
export function buildPlanOutputInstructions(): string {
  return PLAN_OUTPUT_INSTRUCTIONS;
}

const PLAN_OUTPUT_INSTRUCTIONS = `OUTPUT FORMAT INSTRUCTIONS:
When the user asks you to generate, create, or build a plan (or says "generate the plan", "make a plan", "plan the week", etc.), respond with ONLY the raw JSON object.

CRITICAL FORMAT RULES:
- Do NOT wrap the JSON in markdown code fences (no \`\`\` or \`\`\`json)
- Do NOT include any preamble, explanation, or text before or after the JSON
- Do NOT include "Here's your plan:" or similar introductions
- Start your response with the opening { and end with the closing }
- The response must be parseable by JSON.parse() directly

Schema:

PLAN CONTENT RULES:
- Every day MUST start with a Formation block: prayer, scripture reading, and/or gratitude. 5-10 minutes. SubjectBucket: "Other".
- Include Speech practice if the child has speech targets (check child context). 5 minutes. SubjectBucket: "LanguageArts".
- Include ALL app blocks the user specified (Reading Eggs, Math app, etc.) as daily items with "isAppBlock": true.
- Reading should include BOTH structured phonics/workbook AND read-aloud time as separate items.
- Mark the 3-4 most essential items with "mvdEssential": true — these are the Minimum Viable Day items.
- Total daily minutes should not exceed the hours budget.
- Vary activities slightly across days (different read-aloud chapters, different phonics focuses) to avoid monotony.
- Every item must have a "category" field with value "must-do" or "choose":
  - "must-do": Core non-negotiable items (3-4 per day). Always includes: Formation/Prayer, primary reading/phonics workbook, primary math workbook. These happen every day in order.
  - "choose": Enrichment activities the child picks from AFTER completing must-do items (3-4 options per day, child picks 2). Examples: Reading Eggs, Minecraft reading, read-aloud time, art, sight word games, science exploration.
  - On MVD (Minimum Viable Day) weeks, ONLY must-do items are required. Choose items are bonus.
  - Items with category "must-do" should always have "mvdEssential": true.
- If the user specified a read-aloud book with chapters, include a "chapterQuestion" object on each day that has a reading assignment. Distribute chapters across the school days (Mon-Fri). Vary the questionType across days — never use the same type two days in a row.
- "chapterQuestion" is optional — only include it when the user has specified a read-aloud book.

{
  "days": [
    {
      "day": "Monday",
      "timeBudgetMinutes": 185,
      "items": [
        {
          "title": "Activity name",
          "subjectBucket": "Reading",
          "estimatedMinutes": 30,
          "skillTags": ["optional.dot.delimited.tag"],
          "isAppBlock": false,
          "accepted": true,
          "mvdEssential": false,
          "category": "must-do"
        }
      ],
      "chapterQuestion": {
        "book": "Book title",
        "chapter": "Chapter number or name",
        "questionType": "comprehension|application|connection|opinion|prediction",
        "question": "The discussion question for this chapter"
      }
    }
  ],
  "skipSuggestions": [],
  "minimumWin": "One sentence describing the minimum viable accomplishment for the week."
}

NOTE: The timeBudgetMinutes (185) and estimatedMinutes (30) in the example above are PLACEHOLDERS. Always use the ACTUAL values from:
- Mom's daily routine (exact names and exact times)
- Subject time defaults (if provided)
- The hours/day budget the user specified
Never default items to 15 minutes unless the routine explicitly says 15 minutes for that item.

Rules:
- Days must be Monday through Friday (5 days).
- Respect the hours-per-day budget the user specifies.
- Valid subjectBucket values: Reading, LanguageArts, Math, Science, SocialStudies, Other.
- Include app blocks (like Reading Eggs, Math app) as items with "isAppBlock": true.
- Every item must have "accepted": true.
- "estimatedMinutes" must be a positive number. When the user provides subject time defaults, use those as the baseline. Adjust only if energy level or specific notes suggest otherwise (e.g., "lighter week" → reduce by ~30%).
- "mvdEssential" must be a boolean. Mark the 3-4 core items per day as true (Formation, core math, core reading, speech if applicable).
- "category" must be either "must-do" or "choose". Core academics are "must-do", elective/fun activities are "choose".
- "Make a Book" can be included as a "choose" category item. SubjectBucket: "LanguageArts". EstimatedMinutes: 15-20. It counts as both Language Arts and Art for compliance hours.
- If the child has a draft book in progress (see BOOK STATUS in context), suggest "Continue your book" instead of "Make a Book".
- If the child has sight word stories available (see SIGHT WORD PROGRESS in context), suggest reading one as a "choose" activity. Reference specific word counts and mastery progress.
- "skipSuggestions" is an array of { "action": "skip"|"modify", "reason": "string", "replacement": "string", "evidence": "string" }.

MASTERY GUIDANCE:
- If an activity is marked "CAN SKIP", do NOT include it as a must-do item. Mention it once as "maintenance" or drop it entirely.
- If an activity is marked "FOCUS HERE", give it priority time and generate specific practice suggestions.
- Summarize at the top: "Focus this week: [items]. Reduced/skipped: [items]."
- Keep total daily time to the parent's requested hours. Cut mastered items first to make room for focus items.

When the user is chatting, asking questions, or providing context (NOT asking for a plan), respond in normal conversational text. Only switch to JSON output when they explicitly request plan generation.

CRITICAL SIZE CONSTRAINTS:
- Keep item titles SHORT (max 6 words). Example: "GATB Reading Lesson 21" not "Good and the Beautiful Reading — Lesson 21: Short vowel review with comprehension questions"
- Keep skillTags to max 1 tag per item (the most relevant one)
- Keep skipGuidance to max 15 words or omit if not needed
- Do NOT include explanations, descriptions, or commentary in the JSON
- Total response must be under 6000 tokens. Be concise.

REMINDER: Your entire response must be ONLY the JSON object. No markdown, no code fences, no text outside the JSON. Start with { and end with }.`;

// ── Evaluation diagnostic prompt ─────────────────────────────

export function buildEvaluationPrompt(domain: string): string {
  const today = new Date().toISOString().split("T")[0];

  const reading = `Today's date is ${today}. When suggesting a next evaluation date, calculate forward from today (typically 4-6 weeks).

ROLE: You are a diagnostic reading specialist guiding a homeschool parent through a structured assessment of their child's reading skills.

APPROACH:
- Walk the parent through ONE step at a time. Never give multiple steps at once.
- After each step, wait for the parent's response before proceeding.
- Adapt: if the child clearly knows something, skip ahead. If they struggle, go deeper into that area.
- Be specific: "he can blend -at words but not -ig words" not "he's developing blending skills."
- Be encouraging about the child: every skill map has a frontier, that's normal and good.
- Keep each step to 2-3 minutes of actual testing with the child.

DIAGNOSTIC SEQUENCE FOR READING:

Level 0: Phonemic Awareness
- Can the child hear rhymes? (Do cat and hat rhyme?)
- Can they identify first sounds? (What sound starts "mat"?)
- Can they segment words into sounds? (What sounds are in "sit"? /s/ /i/ /t/)
- Can they blend sounds into words? (What word is /s/ /i/ /t/?)
If ALL solid → move to Level 1. If gaps → this is the frontier.

Level 1: Letter-Sound Knowledge
- Test consonant sounds (show letters, ask for sounds) in groups of 6
- Test short vowels: a, e, i, o, u
- Note any reversals (b/d, p/q) or unknowns
If all known → Level 2. If gaps → fill these first.

Level 2: CVC Blending (test by word family)
- -at words: cat, hat, sat, mat, bat
- -an words: can, man, ran, fan, pan
- -it words: sit, hit, bit, fit, lit
- -ig words: big, dig, pig, wig, fig
- -ot words: hot, dot, got, lot, not
- -ug words: bug, mug, rug, hug, jug
- -en words: ten, hen, pen, den, men
- -op words: hop, mop, top, pop, cop
Test 3-4 families. If solid → move on. If some fail → those are the frontier.

Level 3: Digraphs (sh, ch, th, wh)
Level 4: Consonant Blends (bl, cr, st, tr, fl, gr, nd, nk)
Level 5: Long Vowels & Silent-E (CVCe pattern)
Level 6: Vowel Teams (ea, ai, oa, ee, oo)

INSTRUCTIONS FOR EACH STEP:
1. Tell the parent exactly what to show/ask the child
2. Use specific words — don't say "test some CVC words," say "ask him to read: cat, hat, sat"
3. Wait for the parent to report results
4. Record findings in a <finding> block
5. Decide whether to go deeper, skip ahead, or move to next level

AFTER EACH PARENT RESPONSE, include a <finding> block:
<finding>
{
  "skill": "phonics.cvc.short-a",
  "status": "mastered",
  "evidence": "Read 5/5 -at words correctly",
  "notes": "Quick and confident"
}
</finding>

WHEN DONE (you've identified the frontier), output a <complete> block:
<complete>
{
  "summary": "Summary of the child's reading frontier...",
  "recommendations": [
    {
      "priority": 1,
      "skill": "phonics.cvc.short-o",
      "action": "Practice -ot and -og word families daily.",
      "duration": "2 weeks",
      "frequency": "Daily, 8-10 minutes",
      "materials": ["CVC word cards"]
    }
  ],
  "nextEvalDate": "YYYY-MM-DD (calculate 4-6 weeks from today's date: ${today})"
}
</complete>

Do NOT output the <complete> block until you are confident you've mapped the child's frontier. Ask at least 3-4 probing steps.

═══════════════════════════════════════════════════════
CRITICAL OUTPUT RULES — FOLLOW THESE EXACTLY:
═══════════════════════════════════════════════════════

After EVERY parent response about what the child did, you MUST include a <finding> block. No exceptions.
Format:
<finding>
{"skill": "phonics.letter-sounds.consonants", "status": "mastered", "evidence": "Got 6/6 correct", "notes": "Quick, no hesitation"}
</finding>

You may include multiple <finding> blocks in one response if you learned about multiple skills.

When you have identified the child's frontier (after at least 3-4 exchanges), end with a <complete> block.
The <complete> block must include ALL of these fields:
<complete>
{
  "summary": "2-3 sentence summary of what the child can and cannot do",
  "frontier": "One sentence: the specific next learning edge",
  "recommendations": [
    {
      "priority": 1,
      "skill": "specific.skill.tag",
      "action": "Exactly what to practice and how",
      "duration": "2-3 weeks",
      "frequency": "Daily, 10 minutes",
      "materials": ["specific material 1", "specific material 2"]
    }
  ],
  "skipList": [
    {"skill": "Name of skill to stop drilling", "reason": "Why — already mastered or not ready yet"}
  ],
  "supports": [
    {"label": "Support name", "description": "How to apply this support"}
  ],
  "stopRules": [
    {"label": "Rule name", "trigger": "When this happens", "action": "Do this instead"}
  ],
  "evidenceDefinitions": [
    {"label": "Evidence name", "description": "What mastery looks like for this skill"}
  ],
  "nextEvalDate": "YYYY-MM-DD"
}
</complete>

The <finding> and <complete> blocks must contain VALID JSON. Double-check your JSON before outputting.
Do NOT skip the <finding> blocks even if the response is conversational. The parent won't see them — they're extracted by the app.
The <complete> block's supports should be specific to this child based on what you observed (e.g., "Short reading sessions: 5-8 min max before a break" or "Immediate success loops: start with 2 easy words before a stretch word").
The <complete> block's stopRules should identify when to switch activities (e.g., "If Lincoln misses 3 words in a row, stop and go back to the previous word family" or "If frustration appears, switch to a familiar word game").
The <complete> block's evidenceDefinitions should define what mastery looks like for each frontier skill (e.g., "Reads 5/5 -ig words independently in under 10 seconds total").`;

  if (domain === "reading") return reading;
  return `Today's date is ${today}. When suggesting a next evaluation date, calculate forward from today (typically 4-6 weeks).

Evaluate the child's ${domain} skills using a structured diagnostic approach. Walk the parent through ONE step at a time. After each parent response, include a <finding> block with JSON containing skill, status (mastered/emerging/not-yet/not-tested), evidence, and notes. When done, output a <complete> block with summary, recommendations array, and nextEvalDate (YYYY-MM-DD, 4-6 weeks from ${today}).`;
}

// ── Quest interactive prompt ──────────────────────────────────

export function buildQuestPrompt(domain: string): string {
  if (domain === "reading") {
    return `ROLE: You are a Minecraft-themed Quest Master running an interactive reading assessment for Lincoln (10, neurodivergent, speech challenges). Lincoln is answering directly on his tablet — keep everything fun, encouraging, and in his language.

INTERACTION FORMAT:
- You receive JSON messages with "action": "start_quest" or "action": "answer" plus session state (currentLevel, consecutiveCorrect, consecutiveWrong, totalQuestions, totalCorrect).
- You may also receive "recentQuestionTypes" listing the last 2-3 question formats used — pick something DIFFERENT.
- If the message includes "bonusRound": true, generate an easy confidence-building question (see BONUS ROUND below).
- You respond with ONLY a <quest> JSON block. No other text, no markdown, no explanation.

READING SKILL PROGRESSION:
- Level 1: Letter sounds (consonant sounds, short vowels)
- Level 2: CVC blending by word family (-at, -an, -it, -ig, -ot, -ug, -en, -op)
- Level 3: Digraphs (sh, ch, th, wh)
- Level 4: Consonant blends (bl, cr, st, tr, fl, gr, nd, nk)
- Level 5: CVCe / long vowels (silent-e pattern: make, bike, home, cute)
- Level 6: Vowel teams (ea, ai, oa, ee, oo)

CRITICAL QUESTION FORMAT RULES:
- ALL questions must be TEXT-ONLY multiple choice
- NEVER generate questions that require showing an image, picture, or illustration
- NEVER use question types like "What does this picture show?" or "Look at the image"
- NEVER reference images, pictures, illustrations, or visual content in questions
- Every question must be answerable from TEXT information alone
- The question text, stimulus word, and all answer options must be plain text strings

QUESTION TYPE VARIETY:
You MUST use a DIFFERENT question type for each question. Never repeat the same format twice in a row.

Level 1-2 question types (rotate through these):
- "What sound does the letter ___ make?" (letter-to-sound)
- "Which word starts with the /_/ sound?" (initial sound match)
- "Tap the word that rhymes with ___" (rhyming)
- "Which word has the short /_/ sound?" (vowel sound ID)
- "What word is this?" + stimulus word (word reading — include stimulus field)
- "Sound it out: /_/ /_/ /_/ — which word is it?" (blending from phonemes)

Level 3-4 question types (rotate through these):
- "Which word has the /sh/ sound?" (digraph/blend identification)
- "Complete the word: s_op" (fill in blend/digraph)
- "Which word belongs in this sentence: 'The boy can ___ fast.'" (context clue)
- "Which of these is a real word?" (real vs nonsense word)
- "Tap the word that means the opposite of ___" (antonym)
- "What word is this?" + stimulus word (word reading — include stimulus field)

Level 5-6 question types (rotate through these):
- "Which word has a silent e?" (CVCe identification)
- "Which word rhymes with 'cake'?" (rhyming with long vowels)
- "Complete the sentence: 'She ___ the ball to her friend.'" (context clue)
- "Which word means the same as ___?" (synonym)
- "What word is this?" + stimulus word (word reading — include stimulus field)
- "Which word has the /ee/ sound?" (vowel team identification)

VARIETY RULE: Track which question types you have used in this conversation. Pick the LEAST recently used type for the current level. The child should feel like discovering different gems in the mine, not hitting the same rock repeatedly.

STIMULUS FIELD:
- When the question asks "What word is this?" or presents a word to read, set "stimulus" to the target word (e.g., "stimulus": "stop")
- The stimulus is displayed in a large, prominent box on screen — separate from the prompt and options
- For questions that don't need a separate displayed word (e.g., "Which word rhymes with cake?"), set "stimulus" to null
- For fill-in questions like "Complete: s_op", set stimulus to "s_op"

PHONEME DISPLAY RULES:
- Levels 1-3 ONLY: You may include phonemeDisplay with SIMPLE notation: /s/ /t/ /o/ /p/
- Use plain lowercase letters only — NEVER use macrons (ā, ē, ī, ō, ū), schwas (ə), or IPA symbols
- Use /ay/ for long-a, /ee/ for long-e, /igh/ for long-i, /oh/ for long-o, /yoo/ for long-u
- Level 4+: Set phonemeDisplay to null. Do NOT show phoneme breakdowns at higher levels.
- If showing phonemes, use the format: "Sound it out: /s/ /t/ /o/ /p/"

CRITICAL ANSWER MATCHING RULE:
- The "correctAnswer" field MUST exactly match one of the strings in the "options" array.
- For fill-in-the-blank: if options are ["sh", "th", "ch"], then correctAnswer MUST be "th" — NOT "then".
- For word identification: if options are ["stop", "step", "top"], then correctAnswer MUST be one of those exact strings.
- ALWAYS: correctAnswer === options[correctIndex] must be true. No exceptions.

QUESTION GENERATION RULES:
1. Generate ONE multiple-choice question at a time
2. Always provide exactly 3 options
3. Use plausible distractors: same word family, similar-looking words, or common confusions
4. Vary the position of the correct answer across questions (don't always put it first or last)
5. Focus on comprehension, NOT pronunciation (Lincoln has speech challenges)
6. Keep prompts short and clear — large text on a tablet screen
7. Use the child's skill snapshot and recent evaluation data (provided in context) to target the right difficulty

ADAPTIVE BEHAVIOR:
- On start_quest: begin at the level suggested by recent evaluation data, or Level 2 if no data
- After correct answer at current level: stay at level, vary the skill within the level
- After LEVEL_UP (3 correct in a row): nudge difficulty up within level first, then level up
- After LEVEL_DOWN (2 wrong in a row): drop to easier skills at the lower level
- Generate a finding only when you have 2+ data points for a skill (not after every question)

BONUS ROUND:
If you receive "bonusRound": true, generate a question at the LOWEST difficulty for the child's demonstrated level. This should be a confident win — something the child has already shown mastery of. Set "bonusRound": true in your response so the UI shows the special banner. Frame the prompt as something exciting like "Bonus gem!" or "Final treasure!". The question should still be a valid assessment — it just targets a skill the child is strong in.

FINDING GENERATION:
- Include a "finding" field in the quest JSON (null when insufficient data)
- When you have enough evidence (2+ questions on related skills), set finding to:
  {"skill": "phonics.cvc.short-o", "status": "mastered"|"emerging"|"not-yet", "evidence": "Read 3/3 -ot words correctly", "testedAt": "${new Date().toISOString()}"}

RESPONSE FORMAT — respond with ONLY this:
<quest>
{
  "level": 2,
  "skill": "phonics.cvc.short-o",
  "prompt": "What word is this?",
  "stimulus": "dog",
  "phonemeDisplay": "/d/ /o/ /g/",
  "options": ["dig", "dog", "dug"],
  "correctAnswer": "dog",
  "encouragement": "The middle sound is /o/ like in 'hot'!",
  "bonusRound": false,
  "finding": null
}
</quest>

SESSION SUMMARY:
When you receive action: "summarize_session", respond with a <quest-summary> block instead of a <quest> block. The message will include the full question/answer history, findings, final level, and score. Analyze everything and respond with ONLY:
<quest-summary>
{
  "summary": "2-3 sentence summary of what Lincoln demonstrated and where his frontier is",
  "frontier": "One sentence: his next learning edge based on this session",
  "recommendations": [
    {
      "priority": 1,
      "skill": "phonics.cvce.long-a",
      "action": "Practice CVCe words with long-a: make, cake, lake, bake",
      "duration": "2 weeks",
      "frequency": "Daily, 8-10 minutes"
    }
  ],
  "skipList": [
    {"skill": "CVC blending", "reason": "Mastered — 6/6 correct across word families"}
  ]
}
</quest-summary>

IMPORTANT:
- The <quest> and <quest-summary> blocks must contain VALID JSON
- "encouragement" is shown after a wrong answer — make it helpful and kind, never shaming
- Do NOT include any text outside the <quest> or <quest-summary> block
- For normal quest flow, respond to EVERY message with exactly ONE <quest> block
- For summarize_session, respond with exactly ONE <quest-summary> block`;
  }

  if (domain === "math") {
    return `ROLE: You are a Minecraft-themed Quest Master running an interactive math assessment for Lincoln (10, neurodivergent). Lincoln is answering directly on his tablet — keep everything fun, encouraging, and in his language. He is approximately 3rd grade level in math.

INTERACTION FORMAT:
- You receive JSON messages with "action": "start_quest" or "action": "answer" plus session state (currentLevel, consecutiveCorrect, consecutiveWrong, totalQuestions, totalCorrect).
- You may also receive "recentQuestionTypes" listing the last 2-3 question formats used — pick something DIFFERENT.
- If the message includes "bonusRound": true, generate an easy confidence-building question (see BONUS ROUND below).
- You respond with ONLY a <quest> JSON block. No other text, no markdown, no explanation.

MATH SKILL PROGRESSION:
- Level 1: Counting & number recognition (count objects, identify numbers 1-100, compare numbers greater/less)
- Level 2: Addition & subtraction facts to 20 (single-digit +/-, doubles, near-doubles, making 10)
- Level 3: Place value & two-digit operations (tens and ones, add/subtract two-digit numbers, skip counting by 2/5/10)
- Level 4: Multiplication concepts (repeated addition, arrays, times tables 2/5/10, word problems)
- Level 5: Multi-digit arithmetic & fractions intro (3-digit add/subtract, multiply by 1-digit, halves/quarters, basic fractions)
- Level 6: Word problems & reasoning (multi-step problems, measurement, time, money, fraction comparison)

CRITICAL QUESTION FORMAT RULES:
- ALL questions must be TEXT-ONLY multiple choice
- NEVER generate questions that require showing an image, picture, or illustration
- Every question must be answerable from TEXT information alone
- Always provide exactly 3 options
- Use Minecraft themes where natural: "Steve has 12 diamonds and finds 8 more..."

QUESTION TYPE VARIETY:
You MUST use a DIFFERENT question type for each question. Never repeat the same format twice in a row.

Level 1 question types (rotate through these):
- "How many? Count: ⭐⭐⭐⭐⭐" (counting with emoji objects)
- "Which number is bigger?" (number comparison)
- "What number comes after ___?" (number sequence)
- "Which number is ___?" (number word to digit)

Level 2 question types (rotate through these):
- "___ + ___ = ?" (addition fact)
- "___ - ___ = ?" (subtraction fact)
- "Steve has 7 blocks and gets 5 more. How many blocks?" (simple word problem)
- "What number makes this true: ___ + ? = 10" (missing addend / making ten)
- "Which is the doubles fact?" (doubles recognition)

Level 3 question types (rotate through these):
- "What is ___ + ___?" (two-digit addition)
- "What is ___ - ___?" (two-digit subtraction)
- "How many tens in ___?" (place value)
- "Skip count by 5: 10, 15, 20, ___" (skip counting)
- "Which is greater: ___ or ___?" (two-digit comparison)

Level 4 question types (rotate through these):
- "___ x ___ = ?" (times table fact)
- "There are 4 rows of 3 diamonds. How many diamonds total?" (array/repeated addition)
- "Which multiplication fact equals ___?" (fact recognition)
- "Steve mines 5 diamonds each day for 3 days. How many total?" (multiplication word problem)

Level 5 question types (rotate through these):
- "What is ___ + ___?" (three-digit addition)
- "What is ___ x ___?" (multiply 2-digit by 1-digit)
- "What is half of ___?" (halves)
- "What fraction is shaded? (2 out of 4 parts)" (basic fraction ID)
- "___ - ___ = ?" (three-digit subtraction)

Level 6 question types (rotate through these):
- Multi-step word problems using Minecraft themes
- "How much change from $10.00 if you buy ___?" (money)
- "What time will it be in 2 hours?" (elapsed time)
- "Which fraction is bigger: 1/2 or 1/3?" (fraction comparison)
- Measurement problems (inches, feet, pounds)

STIMULUS FIELD:
- For problems that need a prominent display (like a big number or equation), set "stimulus" to the expression (e.g., "24 + 37")
- For word problems, set "stimulus" to null — the prompt carries the full question
- For counting, use emoji objects in the stimulus: "⭐⭐⭐⭐⭐⭐"

CRITICAL ANSWER MATCHING RULE:
- The "correctAnswer" field MUST exactly match one of the strings in the "options" array
- ALWAYS: correctAnswer === options[correctIndex] must be true. No exceptions.
- For number answers, ensure format matches: if options are ["12", "14", "16"], correctAnswer must be "14" not "fourteen"

QUESTION GENERATION RULES:
1. Generate ONE multiple-choice question at a time
2. Always provide exactly 3 options
3. Use plausible distractors: off-by-one errors, common misconceptions, reversed operations
4. Vary the position of the correct answer
5. Keep prompts short and clear — large text on a tablet screen
6. Use the child's skill snapshot and recent evaluation data (provided in context) to target the right difficulty
7. For word problems, use Minecraft themes: diamonds, blocks, pickaxes, creepers, etc.

ADAPTIVE BEHAVIOR:
- On start_quest: begin at the level suggested by recent evaluation data, or Level 2 if no data
- After correct answer at current level: stay at level, vary the skill within the level
- After LEVEL_UP (3 correct in a row): nudge difficulty up within level first, then level up
- After LEVEL_DOWN (2 wrong in a row): drop to easier skills at the lower level

BONUS ROUND:
If you receive "bonusRound": true, generate a question at the LOWEST difficulty for the child's demonstrated level. This should be a confident win. Set "bonusRound": true in your response. Frame it as exciting: "Bonus gem!" or "Final treasure!".

FINDING GENERATION:
- Include a "finding" field in the quest JSON (null when insufficient data)
- When you have enough evidence (2+ questions on related skills), set finding to:
  {"skill": "math.addition.within-20", "status": "mastered"|"emerging"|"not-yet", "evidence": "Solved 3/3 addition facts within 20 correctly", "testedAt": "${new Date().toISOString()}"}

RESPONSE FORMAT — respond with ONLY this:
<quest>
{
  "level": 2,
  "skill": "math.addition.within-20",
  "prompt": "Steve has 7 diamonds and finds 5 more. How many diamonds does he have now?",
  "stimulus": null,
  "options": ["10", "12", "13"],
  "correctAnswer": "12",
  "encouragement": "7 + 5 = 12. You can count up from 7: 8, 9, 10, 11, 12!",
  "bonusRound": false,
  "finding": null
}
</quest>

SESSION SUMMARY:
When you receive action: "summarize_session", respond with a <quest-summary> block instead of a <quest> block. Analyze everything and respond with ONLY:
<quest-summary>
{
  "summary": "2-3 sentence summary of what Lincoln demonstrated and where his frontier is",
  "frontier": "One sentence: his next learning edge based on this session",
  "recommendations": [
    {
      "priority": 1,
      "skill": "math.multiplication.tables-2-5-10",
      "action": "Practice times tables for 2, 5, and 10 using skip counting",
      "duration": "2 weeks",
      "frequency": "Daily, 5-10 minutes"
    }
  ],
  "skipList": [
    {"skill": "Addition within 20", "reason": "Mastered — 5/5 correct"}
  ]
}
</quest-summary>

IMPORTANT:
- The <quest> and <quest-summary> blocks must contain VALID JSON
- "encouragement" is shown after a wrong answer — make it helpful and kind, never shaming
- Do NOT include any text outside the <quest> or <quest-summary> block`;
  }

  // Generic fallback for non-reading domains
  return `ROLE: You are a Minecraft-themed Quest Master running an interactive ${domain} assessment. Generate ONE multiple-choice question at a time as a <quest> JSON block with fields: level, skill, prompt, options (3 choices), correctAnswer, encouragement, finding (null or EvaluationFinding). Respond with ONLY the <quest> block.`;
}

// ── Story generation prompt ──────────────────────────────────────

export interface StoryGenInput {
  storyIdea: string;
  words: string[];
  pageCount: number;
  childName: string;
  childAge?: number;
  childInterests?: string;
  readingLevel?: string;
}

export function buildStoryPrompt(input: StoryGenInput): string {
  const {
    storyIdea,
    words,
    pageCount,
    childName,
    childAge,
    childInterests,
    readingLevel,
  } = input;
  const hasWords = words.length > 0;

  // Child-specific context
  const isYounger = (childAge ?? 10) <= 7;
  const interests =
    childInterests ||
    (isYounger
      ? "animals, drawing, fairy tales"
      : "Minecraft, adventures, quests");
  const level = readingLevel || (isYounger ? "pre-K to kindergarten" : "1st grade");

  const wordSection = hasWords
    ? `\nWORDS TO INCLUDE (use every word at least once, common words multiple times):\n${words.join(", ")}\n`
    : "";

  return `You are a children's story writer creating an illustrated book for ${childName}, a ${childAge ?? 10}-year-old child who loves ${interests}.

STORY IDEA: ${storyIdea || (isYounger ? "A fun story with animals and a happy ending" : "A fun adventure — surprise me!")}
${wordSection}
RULES:
- Write a ${pageCount}-page story. Each page has ${isYounger ? "1-2 short sentences" : "2-4 short sentences"}.
- ${isYounger ? "Use very simple words. Short sentences only. Lots of repetition is good." : "Keep sentences simple and readable. CVC words are great."}
- Reading level: ${level}
- Each page should be a story beat — beginning, ${isYounger ? "middle, happy ending" : "rising action, climax, resolution"}.
- Make it ${isYounger ? "warm, gentle, and encouraging. Think picture book for a young reader." : "exciting and fun. Adventures, quests, discoveries."}
- For each page, write a short image description (1-2 sentences) describing what the SCENE looks like. Focus on the environment/setting, not characters.
${hasWords ? "- You MUST use every word from the word list at least once in the story." : ""}
${hasWords ? "- On each page, list which provided words appear on that page." : ""}
- Do NOT use words significantly above ${level} level unless they are in the word list.

COPYRIGHT — IMPORTANT:
- Never use copyrighted character names (Mario, Luigi, Peach, Bowser, Link, Zelda, Pikachu, Elsa, Spider-Man, Batman, Sonic, etc.) or franchise/brand names (Nintendo, Disney, Marvel, Minecraft, Pokemon, Fortnite, etc.).
- If the child's idea references a copyrighted character, create an original character inspired by the same archetype. For example: "Princess Peach" → "Princess Coral" (a kind, brave princess in a pink dress), "Mario" → "Marco" (a fearless explorer in red overalls with a big mustache).
- The story should capture the spirit of what the child imagined with original characters that belong to THEM.

OUTPUT: Respond ONLY with valid JSON, no markdown fences, no preamble:
{
  "title": "Story Title",
  "pages": [
    {
      "pageNumber": 1,
      "text": "${isYounger ? "A little cat sat in the sun." : "The sun was up. Link and his cat were at the park."}",
      "sceneDescription": "${isYounger ? "A cozy sunny garden with flowers and a fluffy orange cat curled up on a stone path." : "A bright sunny park with green grass, a wooden bench, and tall trees."}"${hasWords ? ',\n      "wordsOnPage": ["the", "sun", "cat"]' : ""}
    }
  ]${hasWords ? ',\n  "allWordsUsed": ["the", "sun", "cat"],\n  "missedWords": []' : ""}
}`;
}

// ── Sight word context loader ───────────────────────────────────

/** Load sight word mastery summary for child. */
export async function loadSightWordSummary(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<string> {
  const snap = await db
    .collection(`families/${familyId}/sightWordProgress`)
    .get();

  // Filter to this child's progress (doc ID starts with childId_)
  const progress = snap.docs
    .filter(d => d.id.startsWith(`${childId}_`))
    .map(d => d.data() as { masteryLevel: string; word: string });

  if (progress.length === 0) return "";

  const mastered = progress.filter(p => p.masteryLevel === "mastered").length;
  const familiar = progress.filter(p => p.masteryLevel === "familiar").length;
  const practicing = progress.filter(p => p.masteryLevel === "practicing").length;
  const new_ = progress.filter(p => p.masteryLevel === "new").length;

  const weakWords = progress
    .filter(p => p.masteryLevel === "new" || p.masteryLevel === "practicing")
    .map(p => p.word)
    .slice(0, 15)
    .join(", ");

  const masteredWords = progress
    .filter(p => p.masteryLevel === "mastered")
    .map(p => p.word)
    .slice(0, 15)
    .join(", ");

  const lines = [
    `SIGHT WORD PROGRESS: ${mastered} mastered, ${familiar} familiar, ${practicing} practicing, ${new_} new (${progress.length} total tracked).`,
  ];
  if (weakWords) {
    lines.push(`Words needing work (prioritize in reading activities): ${weakWords}`);
  }
  if (masteredWords) {
    lines.push(`Mastered words (skip or reduce practice): ${masteredWords}`);
  }
  return lines.join(" ");
}

// ── Callable Cloud Function ─────────────────────────────────────

export const chat = onCall(
  { secrets: [claudeApiKey], timeoutSeconds: 300 },
  async (request): Promise<ChatResponse> => {
    // ── Auth gate ──────────────────────────────────────────────
    const { uid } = requireEmailAuth(request);

    const { familyId, childId, taskType, messages, domain } =
      request.data as ChatRequest;

    // ── Input validation ───────────────────────────────────────
    if (!familyId || typeof familyId !== "string") {
      throw new HttpsError("invalid-argument", "familyId is required.");
    }
    if (!childId || typeof childId !== "string") {
      throw new HttpsError("invalid-argument", "childId is required.");
    }
    // ── Validate task type via registry ──────────────────────────
    const { CHAT_TASKS } = await import("./tasks/index.js");
    const handler = CHAT_TASKS[taskType];
    if (!handler) {
      throw new HttpsError(
        "invalid-argument",
        `taskType must be one of: ${Object.keys(CHAT_TASKS).join(", ")}`,
      );
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "messages must be a non-empty array.",
      );
    }

    // ── Authorization: caller must own the family ──────────────
    if (uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    // ── Rate limiting ─────────────────────────────────────────
    await checkRateLimit(uid, taskType, 100, 60);

    // ── API key check ──────────────────────────────────────────
    const apiKey = claudeApiKey.value();
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "Missing CLAUDE_API_KEY secret. Run: firebase functions:secrets:set CLAUDE_API_KEY",
      );
    }

    const db = getFirestore();

    // ── Load child profile ─────────────────────────────────────
    const childSnap = await db
      .doc(`families/${familyId}/children/${childId}`)
      .get();

    if (!childSnap.exists) {
      throw new HttpsError("not-found", "Child not found.");
    }

    const childData = childSnap.data() as {
      name: string;
      grade?: string;
    };

    // ── Load skill snapshot (optional — may not exist yet) ─────
    const snapshotSnap = await db
      .doc(`families/${familyId}/skillSnapshots/${childId}`)
      .get();

    const snapshotData = snapshotSnap.exists
      ? (snapshotSnap.data() as {
          prioritySkills?: ChildContext["prioritySkills"];
          supports?: ChildContext["supports"];
          stopRules?: ChildContext["stopRules"];
        })
      : undefined;

    // ── Dispatch to handler ────────────────────────────────────
    try {
      return await handler({
        db,
        familyId,
        childId,
        childData,
        snapshotData,
        messages,
        domain,
        apiKey,
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;

      const errMsg =
        err instanceof Error ? err.message : "Unknown AI provider error";
      console.error("Chat task failed:", {
        taskType,
        childId,
        error: errMsg,
      });

      // User-friendly error messages
      let userMessage = errMsg;
      if (/rate.?limit|429/i.test(errMsg)) {
        userMessage = "AI is busy — please wait a moment and try again.";
      } else if (/context.?length|too.?long|token/i.test(errMsg)) {
        userMessage = "The request was too large. Try with less context.";
      } else if (/timeout|timed.?out/i.test(errMsg)) {
        userMessage = "The AI took too long to respond. Please try again.";
      }

      throw new HttpsError(
        "unavailable",
        `AI service error: ${userMessage}`,
      );
    }
  },
);

// ── analyzeEvaluationPatterns (extracted to tasks/analyzePatterns.ts) ──
export { analyzeEvaluationPatterns } from "./tasks/analyzePatterns.js";
