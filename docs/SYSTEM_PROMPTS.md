# First Principles Engine — System Prompts Reference (v3)

> Generated from source: `functions/src/ai/` — chat.ts, chatTypes.ts, contextSlices.ts, tasks/\*, evaluate.ts, generate.ts, imageGen.ts
>
> Last updated: 2026-03-29

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Model Selection](#2-model-selection)
3. [Context Slices](#3-context-slices)
4. [Task Handlers](#4-task-handlers)
5. [Output Schemas](#5-output-schemas)
6. [AI Guardrails](#6-ai-guardrails)

---

## 1. Architecture Overview

### Task Dispatch Flow

```
Client (React)                    Cloud Functions (Firebase)
─────────────────                 ──────────────────────────
src/core/ai/useAI.ts              functions/src/ai/
  → calls 'chat' CF                 chat.ts
     with taskType,                   → validates request
     messages,                        → loads child profile + snapshot
     childId,                         → dispatches to CHAT_TASKS[taskType]
     familyId                              ↓
                                  tasks/index.ts
                                    CHAT_TASKS registry:
                                      plan       → handlePlan
                                      chat       → handleChat
                                      generate   → handleChat
                                      evaluate   → handleEvaluate
                                      quest      → handleQuest
                                      generateStory → handleGenerateStory
                                      workshop   → handleWorkshop
                                      analyzeWorkbook → handleAnalyzeWorkbook
                                      disposition → handleDisposition
                                      conundrum  → handleConundrum
                                      weeklyFocus → handleWeeklyFocus
                                           ↓
                                  tasks/<handler>.ts
                                    → buildContextForTask(taskType, ...)  [contextSlices.ts]
                                    → assembles system prompt from sections
                                    → callClaude({ apiKey, model, systemPrompt, messages })
                                    → logAiUsage(db, familyId, ...)
                                    → returns { message, model, usage }
```

### Standalone Cloud Functions (not task-dispatched)

| Function | File | Trigger |
|----------|------|---------|
| `generateActivity` | generate.ts | onCall — lesson card generation |
| `weeklyReview` | evaluate.ts | onSchedule — automated weekly review |
| `generateWeeklyReviewNow` | evaluate.ts | onCall — manual weekly review |
| `analyzeEvaluationPatterns` | tasks/analyzePatterns.ts | onCall — cross-session pattern analysis |
| `generateImage` | imageGen.ts → imageTasks/ | onCall — image generation routing |
| `generateAvatarPiece` | imageTasks/avatarPiece.ts | onCall |
| `generateStarterAvatar` | imageTasks/starterAvatar.ts | onCall |
| `transformAvatarPhoto` | imageTasks/photoTransform.ts | onCall |
| `generateArmorPiece` | imageTasks/armorPiece.ts | onCall |
| `generateBaseCharacter` | imageTasks/baseCharacter.ts | onCall |
| `generateArmorSheet` | imageTasks/armorSheet.ts | onCall |
| `generateArmorReference` | imageTasks/armorReference.ts | onCall |
| `extractFeatures` | imageTasks/extractFeatures.ts | onCall |
| `generateMinecraftSkin` | imageTasks/minecraftSkin.ts | onCall |
| `generateMinecraftFace` | imageTasks/minecraftFace.ts | onCall |
| `enhanceSketch` | imageTasks/enhanceSketch.ts | onCall |
| `healthCheck` | health.ts | onCall |

---

## 2. Model Selection

### `modelForTask()` (chat.ts)

| Task Type | Model | Use Case |
|-----------|-------|----------|
| `plan` | `claude-sonnet-4-6` | Weekly plan generation |
| `evaluate` | `claude-sonnet-4-6` | Reading/math diagnostic evaluation |
| `quest` | `claude-sonnet-4-6` | Interactive Knowledge Mine quests |
| `generateStory` | `claude-sonnet-4-6` | Sight word story generation |
| `workshop` | `claude-sonnet-4-6` | Story Game Workshop |
| `analyzeWorkbook` | `claude-sonnet-4-6` | Workbook page analysis |
| `disposition` | `claude-sonnet-4-6` | Learning disposition narrative |
| `conundrum` | `claude-sonnet-4-6` | Weekly conundrum generation |
| `weeklyFocus` | `claude-sonnet-4-6` | Unified weekly focus + conundrum |
| `generate` | `claude-haiku-4-5-20251001` | Activity/lesson generation |
| `chat` | `claude-haiku-4-5-20251001` | General chat |

### Standalone Functions

| Function | Model |
|----------|-------|
| `weeklyReview` / `generateWeeklyReviewNow` | `claude-sonnet-4-6` |
| `analyzeEvaluationPatterns` | `claude-sonnet-4-6` |
| `extractFeatures` | `claude-sonnet-4-6` |
| Image generation | `gpt-image-1` or `dall-e-3` |
| `enhanceSketch` | `gpt-image-1` (image editing) |
| Image prompts (Claude describes scene) | `claude-sonnet-4-6` |

---

## 3. Context Slices

### How It Works

`contextSlices.ts` defines a `TASK_CONTEXT` mapping that specifies which data slices each task type needs. `buildContextForTask(taskType, ctx)` loads only the relevant slices in parallel and returns an array of prompt sections.

### Slice Definitions

| Slice | Loader | Data |
|-------|--------|------|
| `charter` | (constant) | CHARTER_PREAMBLE — family values, both kids, formation-first principles |
| `childProfile` | formatChildProfile() | Name, grade, priority skills, supports, stop rules from skill snapshot |
| `workbookPaces` | loadWorkbookPaces() | Current position, units/day needed, ahead/on-track/behind status |
| `weekFocus` | loadWeekContext() | Current week's theme, virtue, scripture reference, heart question |
| `hoursProgress` | loadHoursSummary() | Total hours logged since school year start vs 1000-hour MO target |
| `engagement` | loadEngagementSummary() | Activity engagement patterns (engaged/okay/struggled/refused) compressed |
| `gradeResults` | loadGradeResults() | Recent work review results (grades, corrections) |
| `bookStatus` | loadDraftBookCount() | Draft book count — suggests "Continue your book" vs "Make a Book" |
| `sightWords` | loadSightWordSummary() | Mastered/familiar/practicing/new word counts + weak words list |
| `recentEval` | loadRecentEvalContext() | Most recent evaluation findings for the child |
| `wordMastery` | loadWordMasterySummary() | Quest word progress — mastery levels, struggling patterns |
| `generatedContent` | (from chatTypes) | Recently generated content to avoid repetition |
| `workshopGames` | (from chatTypes) | Workshop game state for story continuation |

### Task → Slice Mapping

| Task Type | Slices Loaded |
|-----------|--------------|
| `plan` | charter, childProfile, workbookPaces, weekFocus, hoursProgress, engagement, gradeResults, bookStatus, sightWords, recentEval, wordMastery, generatedContent, workshopGames |
| `chat` | charter, childProfile |
| `generate` | charter, childProfile |
| `evaluate` | charter, childProfile, sightWords, wordMastery |
| `quest` | childProfile, sightWords, recentEval, wordMastery |
| `generateStory` | childProfile, sightWords, wordMastery |
| `workshop` | charter, childProfile, workshopGames |
| `analyzePatterns` | childProfile |
| `disposition` | _(self-loading)_ charter preamble + 4 weeks day logs + 3 recent evals + 5 recent lab reports |
| `conundrum` | _(self-loading)_ charter preamble + week focus + recent subjects + child profiles |
| `weeklyFocus` | _(self-loading)_ charter preamble + previous 4 weeks' themes + recent subjects + user input |

---

## 4. Task Handlers

### `plan` (tasks/plan.ts)

**System prompt assembly:**
1. Context slices for "plan" (all slices — richest context)
2. Per-child subject time defaults (from `plannerDefaults_{childId}` Firestore doc)
3. Daily routine promotion: extracts routine from user message and re-inserts it in the system prompt with emphasis (CRITICAL INSTRUCTION banner)
4. `PLAN_OUTPUT_INSTRUCTIONS` (JSON schema, rules, size constraints)

**Key behaviors:**
- Outputs raw JSON (no markdown fences) for a 5-day weekly plan
- Each day has must-do (3-4 core items) and choose (enrichment) categories
- Formation block required every day
- MVD-essential items marked for Minimum Viable Day mode
- Token budget: max 6000 tokens, item titles max 6 words

### `evaluate` (tasks/evaluate.ts)

**System prompt assembly:**
1. Context slices for "evaluate"
2. `buildEvaluationPrompt(domain)` — structured diagnostic sequence

**Domains:**
- **reading**: 7-level diagnostic sequence (phonemic awareness → vowel teams), step-by-step guided assessment
- **math**: 6-level sequence (counting → word problems/reasoning)
- **generic**: Simplified for other domains

**Output protocol:**
- `<finding>` blocks after each parent response (skill, status, evidence, notes)
- `<complete>` block when frontier is identified (summary, frontier, recommendations, skipList, supports, stopRules, evidenceDefinitions, nextEvalDate)

### `quest` (tasks/quest.ts)

**System prompt assembly:**
1. Context slices for "quest"
2. `buildQuestPrompt(domain)` — Minecraft-themed interactive assessment
3. Recent evaluation findings injected for adaptive starting level

**Key behaviors:**
- Generates ONE multiple-choice question at a time as `<quest>` JSON block
- 3 options, plausible distractors, text-only (no images)
- Adaptive: level up after 3 correct, level down after 2 wrong
- Question type variety required (never repeat same format consecutively)
- Bonus rounds for confidence building
- `<quest-summary>` block for session summaries
- Findings generated after 2+ data points on a skill

### `generateStory` (tasks/generateStory.ts)

**System prompt assembly:**
1. Context slices for "generateStory"
2. `buildStoryPrompt(input)` — sight word story generator

**Input:** storyIdea, words[], pageCount, childName, childAge, childInterests, readingLevel

**Output:** JSON with title, pages[] (pageNumber, text, sceneDescription, wordsOnPage), allWordsUsed, missedWords

### `workshop` (tasks/workshop.ts)

**System prompt assembly:**
1. Context slices for "workshop"
2. Workshop-specific system prompt (board games, adventure games, card games)

**Key behaviors:**
- Story Game Workshop — generates interactive game content
- Adapts to child's reading level and interests

### `analyzeWorkbook` (tasks/analyzeWorkbook.ts)

**System prompt assembly:**
1. Context slices (minimal — uses modelForTask)
2. Analyzes workbook page images for grading/feedback

### `chat` / `generate` (tasks/chatHandler.ts)

**System prompt assembly:**
1. Context slices for "chat" (charter + childProfile only)

**Key behaviors:**
- Generic conversational handler
- Used for both "chat" and "generate" task types
- Lightest context — just charter values and child profile

### `disposition` (tasks/disposition.ts)

**System prompt assembly:**
1. CHARTER_PREAMBLE (self-loaded, does not use buildContextForTask)
2. Custom narrative prompt: assess HOW a child approaches learning (portfolio over grades)
3. 5 dispositions: Curiosity, Persistence, Articulation, Self-Awareness, Ownership
4. Levels: growing / steady / emerging / not-yet-visible; Trends: up / stable / down / insufficient-data

**Data loading (4-week window):**
- Recent day logs (4 weeks) aggregated by week: completion rates, engagement patterns, evidence, subject minutes
- Recent evaluation sessions (3 most recent completed)
- Recent Dad Lab reports (5 most recent) with child contributions

**Output:** JSON with `profileDate`, `periodWeeks`, 5 disposition objects (level, narrative, trend), `celebration`, `nudge`, `parentNote`

**Tokens:** 4096

### `conundrum` (tasks/conundrum.ts)

**System prompt assembly:**
1. CHARTER_PREAMBLE (self-loaded)
2. Open-ended scenario design principles (no single right answer, for family discussion)
3. Age context: Lincoln (10), London (6)

**Data loading:**
- Current week's focus (theme, virtue, scripture, heart question)
- Recent subjects from last 7 days of day logs
- All children profiles

**Output:** JSON with `title`, `scenario` (2-3 paragraphs, readable by 6-year-old), `question`, `angles` (3 valid perspectives), `lincolnPrompt` (deeper), `londonPrompt` (simpler), `virtueConnection`, `subjectConnection`

**Tokens:** 2048

### `weeklyFocus` (tasks/weeklyFocus.ts)

**System prompt assembly:**
1. CHARTER_PREAMBLE (self-loaded)
2. 4 recurring Stonebridge characters (Mayor Oakley, Tinkerer Maple, Story Keeper Wren, Elder Ironroot)
3. Lincoln → engineering/building, London → stories/drawing
4. Cohesion requirement: theme → virtue → scripture → conundrum → connections

**Data loading:**
- User input (read-aloud book, subjects, notes)
- Previous 4 weeks' themes/virtues/conundrums (for continuity, no repeats)
- Recent subjects from last 7 days

**Output:** Large JSON with `theme`, `virtue`, `scriptureRef`, `scriptureText`, `heartQuestion`, `formationPrompt`, and nested conundrum object with Stonebridge scenario, `lincolnPrompt`, `londonPrompt`, `readingTieIn`, `mathContext`, `londonDrawingPrompt`, `dadLabSuggestion`

**Tokens:** 4096

### `enhanceSketch` (imageTasks/enhanceSketch.ts)

**Standalone onCall function** (image generation, not task-dispatched).

- Downloads child's sketch from Firebase Storage
- Enhances into polished children's book illustration via gpt-image-1 `editImage()`
- 4 style options: storybook (default), comic, realistic, minecraft
- Saves enhanced image back to Storage, returns download URL
- Logs usage to aiUsage collection

### `analyzeEvaluationPatterns` (tasks/analyzePatterns.ts)

**Standalone onCall function** (not dispatched through CHAT_TASKS).

- Loads historical evaluation sessions for a child
- Builds a pattern analysis prompt asking Claude to identify conceptual blocks
- Returns structured analysis of learning patterns across sessions

---

## 5. Output Schemas

### Plan JSON

```json
{
  "days": [
    {
      "day": "Monday",
      "timeBudgetMinutes": 185,
      "items": [
        {
          "title": "Activity name (max 6 words)",
          "subjectBucket": "Reading | LanguageArts | Math | Science | SocialStudies | Other",
          "estimatedMinutes": 30,
          "skillTags": ["optional.dot.delimited.tag"],
          "isAppBlock": false,
          "accepted": true,
          "mvdEssential": false,
          "category": "must-do | choose"
        }
      ]
    }
  ],
  "skipSuggestions": [
    { "action": "skip | modify", "reason": "...", "replacement": "...", "evidence": "..." }
  ],
  "minimumWin": "One sentence describing minimum viable accomplishment."
}
```

### Evaluation Finding (`<finding>` block)

```json
{ "skill": "phonics.cvc.short-a", "status": "mastered | emerging | not-yet", "evidence": "Read 5/5 -at words", "notes": "Quick and confident" }
```

### Evaluation Complete (`<complete>` block)

```json
{
  "summary": "2-3 sentence summary",
  "frontier": "One sentence: next learning edge",
  "recommendations": [{ "priority": 1, "skill": "...", "action": "...", "duration": "2 weeks", "frequency": "Daily, 10 min", "materials": ["..."] }],
  "skipList": [{ "skill": "...", "reason": "..." }],
  "supports": [{ "label": "...", "description": "..." }],
  "stopRules": [{ "label": "...", "trigger": "...", "action": "..." }],
  "evidenceDefinitions": [{ "label": "...", "description": "..." }],
  "nextEvalDate": "YYYY-MM-DD"
}
```

### Quest Question (`<quest>` block)

```json
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
```

### Quest Summary (`<quest-summary>` block)

```json
{
  "summary": "2-3 sentence summary",
  "frontier": "One sentence: next learning edge",
  "recommendations": [{ "priority": 1, "skill": "...", "action": "...", "duration": "2 weeks", "frequency": "Daily, 8-10 min" }],
  "skipList": [{ "skill": "...", "reason": "..." }]
}
```

### Story Generation

```json
{
  "title": "Story Title",
  "pages": [
    { "pageNumber": 1, "text": "Story text...", "sceneDescription": "Scene description for image gen...", "wordsOnPage": ["the", "cat"] }
  ],
  "allWordsUsed": ["the", "cat"],
  "missedWords": []
}
```

### Disposition Profile

```json
{
  "profileDate": "2026-03-29",
  "periodWeeks": 4,
  "curiosity": { "level": "growing", "narrative": "2-3 sentences...", "trend": "up" },
  "persistence": { "level": "steady", "narrative": "...", "trend": "stable" },
  "articulation": { "level": "emerging", "narrative": "...", "trend": "up" },
  "selfAwareness": { "level": "emerging", "narrative": "...", "trend": "stable" },
  "ownership": { "level": "not-yet-visible", "narrative": "...", "trend": "insufficient-data" },
  "celebration": "Warm, specific thing to celebrate",
  "nudge": "Gentle suggestion for next step",
  "parentNote": "Note to Shelly about what she's doing well"
}
```

### Conundrum

```json
{
  "title": "The Neighborhood Garden",
  "scenario": "2-3 paragraphs, readable by 6-year-old...",
  "question": "What should they do?",
  "angles": ["Perspective 1", "Perspective 2", "Perspective 3"],
  "lincolnPrompt": "Deeper thinking prompt for Lincoln",
  "londonPrompt": "Simpler prompt for London",
  "virtueConnection": "How this connects to the week's virtue",
  "subjectConnection": "How this connects to what they're studying"
}
```

### Weekly Focus

```json
{
  "theme": "Bridges That Connect",
  "virtue": "Faithfulness",
  "scriptureRef": "Proverbs 3:5-6",
  "scriptureText": "Trust in the Lord...",
  "heartQuestion": "What does it mean to be faithful?",
  "formationPrompt": "Short family discussion starter",
  "conundrum": {
    "title": "The Bridge Builder's Choice",
    "scenario": "Stonebridge scenario with 2-3 recurring characters...",
    "question": "What should they do?",
    "angles": ["...", "...", "..."],
    "lincolnPrompt": "Engineering angle...",
    "londonPrompt": "Story/drawing angle...",
    "readingTieIn": "Connected to the week's read-aloud",
    "mathContext": "Word problem for 10-year-old tied to theme",
    "londonDrawingPrompt": "Drawing activity for London",
    "dadLabSuggestion": "Hands-on experiment with household materials"
  }
}
```

---

## 6. AI Guardrails

### Charter Injection

Every task that includes the `charter` slice gets the CHARTER_PREAMBLE injected as the first section of the system prompt. This ensures all AI responses align with family values:

- **Formation first**: character and virtue before academics
- **Both kids count**: Lincoln (10, neurodivergent) and London (6, story-driven)
- **Narration counts**: oral evidence is first-class, especially for Lincoln
- **Small artifacts > perfect documentation**
- **No heroics**: simple routines, minimum viable days are real school
- **Split-block scheduling**: Shelly's attention is the primary resource

### Safety Rules

- **No-shame rule**: Quest encouragement is "shown after a wrong answer — make it helpful and kind, never shaming"
- **No images in questions**: Quest questions are text-only multiple choice — NEVER reference images or illustrations
- **Answer matching**: `correctAnswer` must exactly match one option string
- **Charter alignment**: All AI-generated content must be reviewable against family values
- **No API keys in client**: All AI calls route through Cloud Functions

### Cost Controls

- Token usage logged to `families/{familyId}/aiUsage` for every call
- Model selection by complexity (Haiku for routine tasks, Sonnet for reasoning)
- Plan responses capped at 6000 tokens
- Context slices are task-specific (lighter tasks get less context = fewer input tokens)

### Feature Flags

AI paths are opt-in via config. Local logic stays as fallback. The planner-chat has local draft plan generation that works without AI.
