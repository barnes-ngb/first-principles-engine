# Knowledge Mine — Feature Brief

> Interactive evaluation for Lincoln. Phase 1 built Mar 14-15, 2026.

---

## Concept

Lincoln interacts directly with AI on his tablet. He taps cards to answer Minecraft-themed reading questions. The system adapts difficulty in real time, captures skill findings, and always ends on a win. It's a game AND an evaluation — he learns while we assess.

---

## Design Principles

1. **Minecraft themed** — diamonds mined (not scores), bricks for wrong answers, quest metaphor throughout
2. **Short sessions** — 5-8 minutes target (max 10 questions or 8 minutes hard cap)
3. **Adaptive difficulty** — questions get harder when he's succeeding, easier when struggling
4. **Game not test** — never feels like assessment; positive framing always
5. **Learning AND evaluation** — every question teaches phonics patterns while capturing diagnostic data
6. **Speech-aware** — focuses on comprehension, not pronunciation (Lincoln has speech challenges). Multiple choice = tap, no speaking required.
7. **Parent can review** — session data saved to Firestore, findings flow into skill snapshot pipeline
8. **Always end on a win** — frustration limit ends session before it gets discouraging; summary celebrates diamonds mined

---

## Screen Flow

```
┌─────────────────┐
│   Intro Screen   │
│                  │
│  Select domain:  │
│  [Reading]       │
│  [Math] (soon)   │
│  [Speech] (soon) │
│                  │
│  Streak: 🔥 3    │
└────────┬─────────┘
         ▼
┌─────────────────┐
│  Quest Screen    │
│                  │
│  "What word      │
│   is this?"      │
│                  │
│   /d/ /o/ /g/    │
│                  │
│  [dig] [dog] [dug]│
└────────┬─────────┘
         ▼
┌─────────────────┐
│ Feedback Screen  │
│                  │
│  ⬩ Diamond!     │  (correct)
│  — or —          │
│  🧱 Brick        │  (wrong + encouragement)
│                  │
│  "The middle     │
│   sound is /o/   │
│   like in hot!"  │
└────────┬─────────┘
         ▼
  (loop until end condition)
         ▼
┌─────────────────┐
│ Summary Screen   │
│                  │
│  ⬩⬩⬩⬩⬩⬩⬩       │
│  7 diamonds!     │
│                  │
│  Level reached: 3│
│  Streak: 🔥 4    │
│                  │
│  [Play Again]    │
│  [Done]          │
└─────────────────┘
```

---

## Question Types (Phase 1)

**Multiple choice only** — 3 options, tap to answer.

- Plausible distractors: same word family, similar-looking words, common confusions
- Correct answer position varies across questions
- `phonemeDisplay` shown for blending questions (Levels 2-4): `/d/ /o/ /g/`
- Prompts are short and clear — large text for tablet screen

---

## Adaptive Logic

| Event | Action |
|---|---|
| 3 correct in a row | Level up (increment `currentLevel`, reset streak) |
| 2 wrong in a row | Level down (decrement `currentLevel`, reset streak) |
| 2 level-downs in a row | End session (frustration limit) |
| 10 questions answered | End session (max questions) |
| 8 minutes elapsed | End session (time limit) |

Constants defined in `questTypes.ts`:
- `MAX_QUESTIONS = 10`
- `MAX_SECONDS = 480` (8 minutes)
- `LEVEL_UP_STREAK = 3`
- `LEVEL_DOWN_STREAK = 2`
- `FRUSTRATION_LIMIT = 2`

---

## Reading Skill Progression

| Level | Focus | Example |
|---|---|---|
| 1 | Letter sounds | Consonant sounds, short vowels |
| 2 | CVC blending | Word families: -at, -an, -it, -ig, -ot, -ug, -en, -op |
| 3 | Digraphs | sh, ch, th, wh |
| 4 | Consonant blends | bl, cr, st, tr, fl, gr, nd, nk |
| 5 | CVCe / long vowels | Silent-e pattern: make, bike, home, cute |
| 6 | Vowel teams | ea, ai, oa, ee, oo |

---

## Data Model

### `InteractiveSessionData` (extends `EvaluationSession`)

```typescript
interface InteractiveSessionData {
  sessionType: 'interactive'     // distinguishes from 'guided' Shelly sessions
  questions: SessionQuestion[]   // every answered question
  finalLevel: number             // difficulty level at session end
  totalCorrect: number
  totalQuestions: number
  diamondsMined: number          // = totalCorrect
  streakDays: number             // consecutive days with a quest
  timedOut?: boolean             // true if session ended by timer
}
```

### `SessionQuestion` (per answer)

```typescript
interface SessionQuestion {
  id: string
  type: 'multiple-choice'
  level: number
  skill: string                  // e.g. "phonics.cvc.short-o"
  prompt: string
  options: string[]
  correctAnswer: string
  childAnswer: string
  correct: boolean
  responseTimeMs: number
  timestamp: string
}
```

### `QuestState` (adaptive state, client-side)

```typescript
interface QuestState {
  currentLevel: number
  consecutiveCorrect: number
  consecutiveWrong: number
  levelDownsInARow: number
  totalQuestions: number
  totalCorrect: number
  questionsThisLevel: number
  startedAt: string
  elapsedSeconds: number
}
```

### Findings

Reuses `EvaluationFinding` from the evaluation system:
```typescript
interface EvaluationFinding {
  skill: string                  // "phonics.cvc.short-o"
  status: 'mastered' | 'emerging' | 'not-yet' | 'not-tested'
  evidence: string
  notes?: string
  testedAt: string
}
```

AI generates findings when it has 2+ data points for a skill (not after every question).

---

## Connection to Existing Systems

### Same collection
Interactive sessions save to `evaluationSessions` (same as Shelly-guided diagnostics), distinguished by `sessionType: 'interactive'`.

### Same findings pipeline
Findings from quest sessions use the same `EvaluationFinding` type → same skill snapshot pipeline → findings inform planner context and future quests.

### Quest prompt gets enriched context
The Cloud Function (`taskType: 'quest'`) loads:
- Child profile + skill snapshot (priority skills, supports, stop rules)
- Enriched context (recent sessions, workbook paces, engagement, grades)
- Recent evaluation session (summary + recommendations)

This means quest difficulty adapts based on everything the system knows about Lincoln, not just the current session.

### Model selection
Quest uses Claude Sonnet (same tier as plan/evaluate) for higher-quality question generation and adaptive behavior.

---

## What's Built (Phase 1)

### Client-side (`src/features/quest/`)
| File | Purpose |
|---|---|
| `questTypes.ts` | Types: QuestState, QuestQuestion, SessionQuestion, InteractiveSessionData, constants |
| `questAdaptive.ts` | Pure functions: `computeNextState`, `shouldEndSession`, `calculateStreak`, `formatSkillLabel` |
| `questAdaptive.test.ts` | Tests for adaptive logic (level up/down, frustration limit, streak calculation) |
| `useQuestSession.ts` | Hook: session lifecycle, AI communication, Firestore save, auto-apply findings to skill snapshot |
| `KnowledgeMinePage.tsx` | Page component: intro screen with domain selection and streak display |
| `ReadingQuest.tsx` | Quest UI: question display, option buttons, feedback (diamond/brick), loading states |
| `QuestSummary.tsx` | Summary screen: diamonds mined, level reached, streak, findings list |

### Cloud Function (`functions/src/ai/chat.ts`)
- `TaskType.Quest` added to task type enum
- `buildQuestPrompt()` — Minecraft-themed quest master prompt with reading skill progression, adaptive rules, `<quest>` JSON response format
- Quest gets enriched context + recent evaluation data
- Model: Claude Sonnet (complex reasoning tier)

### Navigation
- Kid nav: "Knowledge Mine" → `/quest`
- Route: `/quest` → `KnowledgeMinePage`

---

## What's Next

### Phase 2: Input Expansion
- Voice input (speech-to-text) so Lincoln can say answers
- Type-to-answer question type for spelling/writing practice
- Phoneme audio playback (hear the sounds, not just see them)

### Phase 3: Performance + Polish
- Pre-generated question bank (reduce AI latency between questions)
- Avatar integration (Minecraft character progression)
- Session review for parents (detailed question-by-question breakdown)
- Quest data in weekly review summary

### Phase 4: Domain Expansion
- Math domain (number sense, operations, word problems)
- Speech domain (articulation practice with audio recording)
- Cross-domain quests (reading + math combo sessions)
- London's quest experience (age-appropriate, story-themed instead of Minecraft)
