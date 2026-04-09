# Knowledge Mine Audit — April 2026

> Read-only audit, 4 parts. No code changes.
> Auditor: Claude Code. Date: 2026-04-07.

---

## Summary

1. **"Back to mine" can destroy a session with one tap.** No confirmation dialog — tapping the button mid-quest instantly clears all progress with no Firestore save. This is the highest-risk UX issue for Lincoln. (Part C, Finding C1)
2. **Level 7+ is undefined territory for Comprehension and Math.** The adaptive engine supports Levels 1-10, but Comprehension and Math prompts only define Levels 1-6. Above Level 6 the AI freestyles with no content guidance. Phonics is fine (all 10 levels defined). (Part A)
3. **Level 1 frustration trap.** A child stuck at Level 1 who keeps getting wrong answers will never trigger the frustration exit — `levelDownsInARow` can't increment at the floor. The session only ends at 10 questions or 8 minutes. (Part B, Finding B1)
4. **Coverage gaps are safely handled.** Speech Quest is properly disabled with "Coming soon!" messaging and non-clickable UI. London (no evaluation history) can use Knowledge Mine without crashes — the system gracefully defaults to Level 2 with generic questions. (Part F)
5. **The "6 level" claim is stale.** The intro screen says "Levels 1-6" but the engine supports 1-10. Not a bug, but the UI description is wrong and misleading. (Part A)

---

## Part A: Quest Type Inventory

### Quest Modes

| Quest Mode | Domain | Levels Claimed (UI) | Levels Actual (Engine) | Levels Defined (Prompt) | Format | File: Prompt Builder | File: Client Hook |
|---|---|---|---|---|---|---|---|
| **Phonics** | Reading | 1-6 | 1-10 | 1-10 | MC (3 options), optional voice/typed | `functions/src/ai/chat.ts:927-1161` | `src/features/quest/useQuestSession.ts` |
| **Comprehension** | Reading | 1-6 | 1-10 | 1-6 | MC (3 options), passage-based | `functions/src/ai/chat.ts:766-858` | same hook |
| **Fluency** | Reading | N/A | N/A (no levels) | N/A | Read-aloud passage + self-rating | `functions/src/ai/chat.ts:863-906` | same hook |
| **Math** | Math | (none shown) | 1-10 | 1-6 | MC (3 options), Minecraft-themed | `functions/src/ai/chat.ts:1163-1316` | same hook |
| **Speech** | Speech | N/A | N/A | N/A | Disabled (`enabled: false`) | None | N/A |

### Starting Level Logic

| Curriculum State | Starting Level | Location |
|---|---|---|
| No curriculum data | **2** | `useQuestSession.ts:391` |
| Reading curriculum completed | **5** | `useQuestSession.ts:404` |
| Vowel teams mastered | **6** | `useQuestSession.ts:436` |
| Diphthongs or le-endings mastered | **7** | `useQuestSession.ts:437` |
| R-controlled + multisyllabic mastered | **8** | `useQuestSession.ts:438` |

Note: Comprehension quest prompt caps starting level at 6 via `Math.min(startingLevel, 6)` at `chat.ts:768`. Phonics caps at 10 via `Math.min(startingLevel, 10)` at `chat.ts:924`. Math prompt has no starting level injection at all.

### Adaptive Constants

| Constant | Value | Location |
|---|---|---|
| `MAX_QUESTIONS` | 10 | `questTypes.ts:38` |
| `MIN_QUESTIONS` | 5 | `questTypes.ts:39` |
| `MAX_SECONDS` | 480 (8 min) | `questTypes.ts:40` |
| `LEVEL_UP_STREAK` | 3 | `questTypes.ts:41` |
| `LEVEL_DOWN_STREAK` | 2 | `questTypes.ts:42` |
| `FRUSTRATION_LIMIT` | 2 | `questTypes.ts:43` |
| Level floor | 1 | `questAdaptive.ts:36` |
| Level ceiling | 10 | `questAdaptive.ts:28` |

---

## Part A Findings: Level-by-Level Analysis

### Phonics Quest (Reading)

**Levels 1-2: Letter Sounds & CVC Blending**
- Developmentally appropriate: Yes. Letter-sound correspondence and CVC word families are foundational.
- Format: Word identification, rhyming, sound matching, word building, letter-to-sound, word reading. Six rotation types.
- Lincoln-friendliness: Excellent. All MC tap. Phoneme display (`/d/ /o/ /g/`) shown. TTS on tap. No typing required. Stimulus word displayed prominently.
- Concern: None.

**Levels 3-4: Digraphs & Consonant Blends**
- Developmentally appropriate: Yes. Natural progression from CVC.
- Format: Sound identification, fill-in-blank (capped at 2/session), sentence completion, odd-one-out, real vs. nonsense, word reading. Six rotation types.
- Lincoln-friendliness: Good. Fill-in-blank questions have strict validation (blank count must match answer length). Kid-friendly language rules explicitly ban "digraph," "consonant blend," etc.
- Concern: Fill-in-blank questions are the most error-prone AI generation type. The code includes `shouldFlagAsError()` and `validateQuestion()` specifically to catch bad fill-in-blanks — evidence this is a known pain point.

**Levels 5-6: CVCe & Vowel Teams**
- Developmentally appropriate: Yes. Silent-e and vowel teams are standard phonics scope and sequence.
- Format: Silent-e identification, rhyming with long vowels, sentence completion, synonyms, word reading, vowel team identification. Six rotation types.
- Lincoln-friendliness: Good. Phoneme display disabled (Level 4+). Word reading with stimulus display still available.
- Concern: None.

**Levels 7-8: Multi-syllable Words & Affixes**
- Developmentally appropriate: Yes, for a child who has mastered through vowel teams. This is roughly late 2nd / early 3rd grade phonics.
- Format: Syllable counting, compound word identification, prefix/suffix meaning, suffix application, sentence completion, antonyms using prefixes. Six rotation types.
- Lincoln-friendliness: Good. All MC. Questions use "beats" instead of "syllables." No metalanguage.
- Concern: The prompt says "beats" for syllables (good!), but the AI may not always obey. No client-side enforcement.

**Levels 9-10: Reading Comprehension & Vocabulary**
- Developmentally appropriate: These are comprehension skills, not phonics. Including them in the phonics quest creates a domain mismatch — a child who reaches Level 9 in "Phonics Quest" is suddenly doing comprehension work.
- Format: Short passages (2-4 sentences) + questions, inference, vocabulary-in-context, best-word completion, cause-and-effect, main idea. Six rotation types.
- Lincoln-friendliness: **Moderate concern.** Passages of 2-4 sentences on a tablet screen are text-heavy. TTS is available (tap-to-hear each word), but the passage comprehension paradigm assumes the child can read or listen to multi-sentence text and hold it in working memory. For Lincoln (speech/neurodivergence, ~1st grade reading per CLAUDE.md), reaching Level 9 would indicate strong decoding but may still be a big jump to passage comprehension.
- **Key finding:** Levels 9-10 in the phonics quest duplicate what the comprehension quest tests. A child who excels at phonics would be better served by being directed to the comprehension quest rather than encountering comprehension questions inside phonics.

### Comprehension Quest (Reading)

**Levels 1-2: Explicit Comprehension**
- Defined as: "Short sentences, common vocabulary, explicit comprehension"
- Format: Vocabulary-in-context, passage comprehension (2-3 sentences), inference, sequence/cause-effect, word meaning from parts, synonyms/antonyms, main idea. Seven rotation types shared across all levels.
- Lincoln-friendliness: Good. All MC. Passage read-aloud button available. Individual words tappable for TTS.
- Concern: The prompt does not define different question types per level band (unlike phonics which has 6 types per 2-level band). Instead, it defines 7 types and tells the AI to use "common vocabulary" at Levels 1-2. This is vague — the AI gets less concrete guidance.

**Levels 3-4: Simple Inference**
- Defined as: "Longer passages, less common vocabulary, simple inference"
- Same 7 question types. AI is told to increase passage length and vocabulary difficulty.
- Concern: "Longer passages" at Level 4 on a phone/tablet screen is a usability challenge.

**Levels 5-6: Deep Inference**
- Defined as: "Multi-sentence passages, context clues for unknown words, deeper inference"
- Same 7 question types. AI is told to increase difficulty further.
- Concern: None for format. But this is the highest defined level.

**Levels 7-10: UNDEFINED**
- The comprehension prompt defines only Levels 1-6 in its "DIFFICULTY LEVELS" section.
- However, the adaptive engine (`questAdaptive.ts`) has no comprehension-specific cap — if a child gets 3 correct at Level 6, they advance to Level 7.
- At Level 7+, the AI has no prompt guidance on what to generate. It will extrapolate from the Level 5-6 pattern.
- **This is the Level 7 mystery resolved**: A child CAN see "Comprehension Quest - Level 7" on their tablet. It's not a bug — the adaptive engine has no level cap. But the AI prompt has no content definition above Level 6, so question quality is unpredictable.
- **The comprehension prompt does cap starting level at 6** (`Math.min(startingLevel, 6)` at `chat.ts:768`), so you can't START at Level 7+ from curriculum data. But you CAN reach it by answering correctly.

### Fluency Practice (Reading)

- No level system. Generates passages on demand.
- Format: 3-6 sentences (40-80 words), Minecraft-themed, read aloud, self-rate (easy/medium/hard).
- Appropriate: Yes. Simple, low-pressure, voice-first.
- Lincoln-friendliness: Excellent. No MC, no "right answer," just read and self-assess. Speech words naturally embedded for passive exposure.
- Concern: The passage prompt hardcodes "2nd-3rd grade reading level" regardless of the child's actual level. Not adaptive within a session — each passage is the same difficulty.

### Math Quest

**Levels 1-2: Counting & Addition/Subtraction**
- Developmentally appropriate: Yes. Counting, number recognition, basic facts to 20.
- Format: Counting with emoji, number comparison, addition/subtraction facts, word problems, making ten, doubles. Good variety.
- Lincoln-friendliness: Excellent. All MC. Minecraft themes (Steve, diamonds). Math questions auto-read via TTS.
- Concern: None.

**Levels 3-4: Place Value & Multiplication**
- Developmentally appropriate: Yes. Two-digit operations, skip counting, times tables.
- Format: Two-digit add/subtract, place value, skip counting, multiplication facts, arrays, word problems.
- Lincoln-friendliness: Good. Word problems use Minecraft themes consistently.
- Concern: None.

**Levels 5-6: Multi-digit & Fractions**
- Developmentally appropriate: Yes. Three-digit operations, basic fractions, multi-step word problems.
- Format: Three-digit add/subtract, multiply by 1-digit, halves/quarters, money, time, fraction comparison.
- Lincoln-friendliness: Good.
- Concern: Fractions and measurement are conceptually harder to test via text-only MC. "What fraction is shaded? (2 out of 4 parts)" works but is less intuitive than visual fractions.

**Levels 7-10: UNDEFINED**
- Same issue as comprehension: the math prompt defines only Levels 1-6, but the engine allows 1-10. Reaching Level 7+ gives the AI no content guidance.
- **Lower risk than comprehension** because math has a natural starting level of 2 and Lincoln is described as "~3rd grade math" — unlikely to reach Level 7 in a 10-question session.

---

## Level 7 Mystery: Resolution

**Question**: A tablet screenshot showed "Comprehension Quest - Level 7" which contradicts the claimed 6-level system. Is this a bug?

**Answer**: Not a bug, but a documentation/UI mismatch with a prompt gap:

1. **The UI description says "Levels 1-6"** — `KnowledgeMinePage.tsx:46,54`. This is stale text from Phase 1 when only 6 phonics levels existed.
2. **The adaptive engine supports Levels 1-10** — `questAdaptive.ts:28` (`currentLevel < 10`). No quest-mode-specific cap exists.
3. **The phonics prompt defines all 10 levels** — expanded post-Phase 1 to include multi-syllable (7-8) and comprehension (9-10).
4. **The comprehension prompt defines only Levels 1-6** — `chat.ts:809-812`. Above Level 6, the AI has no difficulty specification.
5. **The math prompt defines only Levels 1-6** — `chat.ts:1173-1179`. Same gap.
6. **Starting level cap differs by quest mode**:
   - Comprehension: capped at 6 (`Math.min(startingLevel, 6)`)
   - Phonics: capped at 10 (`Math.min(startingLevel, 10)`)
   - Math: no starting level injection from curriculum

**How to see Level 7 in Comprehension**: Start at Level 2 (default) or up to Level 6 (from curriculum). Get 3 correct at Level 6 → engine promotes to Level 7. The UI header shows `⛏️ Comprehension Quest — Level 7`. The AI generates a question with no level-specific guidance.

---

## Difficulty Progression Assessment

### Phonics: Well-defined, sensible progression

| Transition | Assessment |
|---|---|
| L1→L2 | Letter sounds → CVC blending. Natural step. |
| L2→L3 | CVC → digraphs. Standard phonics sequence. |
| L3→L4 | Digraphs → blends. Appropriate. |
| L4→L5 | Blends → CVCe/long vowels. Standard. |
| L5→L6 | CVCe → vowel teams. Appropriate. |
| L6→L7 | Vowel teams → multi-syllable. Bigger jump — first structural complexity. |
| L7→L8 | Multi-syllable → prefixes/suffixes. Natural extension. |
| L8→L9 | **Affixes → passage comprehension. Domain shift.** This is where phonics stops being phonics. |
| L9→L10 | Passage comprehension → vocabulary-in-context. Reasonable within comprehension. |

### Comprehension: Under-specified progression

| Transition | Assessment |
|---|---|
| L1→L2 | Both "short sentences, common vocabulary." No real difficulty change specified. |
| L3→L4 | Both "longer passages, less common vocabulary." Same problem. |
| L5→L6 | Both "multi-sentence, deeper inference." |
| L6→L7 | **Undefined. AI freestyles.** |

The comprehension prompt defines difficulty in 2-level bands rather than per-level. The AI has to interpolate between "short sentences" (L1-2) and "longer passages" (L3-4), which is imprecise.

### Math: Well-defined within range, missing above

| Transition | Assessment |
|---|---|
| L1→L2 | Counting → addition/subtraction. Standard. |
| L2→L3 | Facts to 20 → two-digit operations. Appropriate. |
| L3→L4 | Two-digit → multiplication. Standard 3rd grade sequence. |
| L4→L5 | Multiplication → multi-digit + fractions. Bigger jump. |
| L5→L6 | Multi-digit → word problems + reasoning. Appropriate capstone. |
| L6→L7 | **Undefined.** |

---

## Lincoln's Constraints Compliance

| Constraint | Status | Notes |
|---|---|---|
| No required typing | **PASS** | `allowOpenResponse` is always optional alongside MC. MC tap is always primary. |
| No required spelling | **PASS** | Fill-in-blank uses fragment options (e.g., "sh", "th"), not free spelling. |
| TTS support | **PASS** | Every word tappable for TTS. Math auto-reads. Passage read-aloud button. Mute toggle. |
| Voice input optional | **PASS** | `useSpeechRecognition` only activates when `allowOpenResponse` is true. Not required for answer. |
| "Diamonds not scores" | **PASS** | Summary shows "X diamonds mined" not "X/Y correct." |
| "End on a win" | **PASS** | Bonus round at easier level if session would end on wrong answer. `bonusRoundUsedRef` prevents double-bonus. |
| "Questions explored not correct/total" | **PARTIAL** | Summary shows "X questions explored" (good) but also shows diamond count which implicitly reveals score. |
| No metalanguage | **PASS** (in prompt) | Prompt explicitly bans "consonant blend," "digraph," "vowel," "phoneme," "syllable," "CVC," etc. and provides kid-friendly alternatives. No client-side enforcement — relies on AI compliance. |
| Short sessions | **PASS** | 10 questions max, 8 minutes hard cap, frustration limit at 2 consecutive level-downs. |

---

## Open Questions

1. **Should the adaptive engine have per-quest-mode level caps?** Comprehension and math only define 6 levels. Should `computeNextState` cap at 6 for these modes to prevent undefined territory?

2. **Should phonics L9-10 exist?** They test comprehension, not phonics. A child who reaches L9 in phonics is demonstrating strong decoding — should the system redirect them to the comprehension quest instead?

3. **Should the comprehension prompt define per-level question types?** Currently it has 7 types shared across all levels with only a vague 2-level-band difficulty description. The phonics prompt has 6 types per 2-level band with specific examples — much more concrete.

4. **Fluency passage difficulty**: Hardcoded at "2nd-3rd grade reading level." Should this adapt based on the child's skill snapshot or previous fluency performance?

5. **Fallback question generator only covers levels 1-6** (`questHelpers.ts:210-217`, `wordSets` keyed 1-6). If the AI fails at Level 7+, the fallback generates a Level 6 question. Harmless but worth noting.

6. **UI description "Levels 1-6"** on the intro screen (`KnowledgeMinePage.tsx:46,54`) is stale. Should be updated or removed to avoid confusion.

7. **Duplicate starting-level logic**: The curriculum-to-starting-level computation exists in both `useQuestSession.ts:390-443` (client) and `quest.ts:29-87` (server). The server result (`suggestedStartLevel`) is sent to the AI prompt, but the client result is what sets the actual `QuestState.currentLevel`. These could drift if one is updated without the other.

8. ~~**Math has no starting-level boost from curriculum data.** Unlike reading, math always starts at Level 2 regardless of curriculum completion. Is this intentional or an oversight?~~ **RESOLVED:** `workingLevels` data model now tracks per-domain starting levels. Math curriculum scans write `workingLevels.math` with `source: 'curriculum'`. Quest sessions, evaluations, and scans all feed into the same progression model.

9. **Word progress tracking**: Only fires for the interactive quest modes (phonics/comprehension), not for fluency or math. Tracked at `families/{familyId}/children/{childId}/wordProgress` — a subcollection not listed in CLAUDE.md's Firestore Collections table (it is mentioned in a note but not in the main table).

---

## Part B: Adaptive Logic Audit

### MASTER_OUTLINE Rule Verification

| Rule | Expected | Actual | Status | Location |
|---|---|---|---|---|
| 3 correct → level up | 3 consecutive correct answers raise level by 1 | `consecutiveCorrect >= LEVEL_UP_STREAK (3)` triggers `currentLevel + 1` | **PASS** | `questAdaptive.ts:28-31` |
| 2 wrong → level down | 2 consecutive wrong answers lower level by 1 | `consecutiveWrong >= LEVEL_DOWN_STREAK (2)` triggers `currentLevel - 1` | **PASS** | `questAdaptive.ts:36-41` |
| 10 question cap | Session ends after 10 questions | `totalQuestions >= MAX_QUESTIONS (10)` triggers end | **PASS** | `questAdaptive.ts:64`, `questTypes.ts:38` |
| 8 minute cap | Session ends after 480 seconds | `elapsedSeconds >= MAX_SECONDS (480)` triggers end | **PASS** | `questAdaptive.ts:60-61`, `questTypes.ts:40` |
| Frustration limit | 2 consecutive level-downs end session | `levelDownsInARow >= FRUSTRATION_LIMIT (2)` triggers end (only after `MIN_QUESTIONS` reached) | **PASS** | `questAdaptive.ts:66` |
| End-on-a-win bonus round | If session would end on a wrong answer, give one bonus question at easier level | Bonus round fires when `shouldEnd && !timedOut && !correct && !bonusRoundUsedRef.current && levelDownsInARow < FRUSTRATION_LIMIT`. Bonus level = `currentLevel - 2` (floor 1). Used only once per session (`bonusRoundUsedRef`). | **PASS** | `useQuestSession.ts:1037-1054, 1062` |
| Level floor = 1 | Can't go below Level 1 | `currentLevel > 1` guard on level-down | **PASS** | `questAdaptive.ts:36` |
| Level ceiling = 10 | Can't go above Level 10 | `currentLevel < 10` guard on level-up | **PASS** | `questAdaptive.ts:28` |
| Minimum questions = 5 | Frustration limit doesn't trigger before 5 questions | `pastMinimum = totalQuestions >= MIN_QUESTIONS (5)` required for frustration end | **PASS** | `questAdaptive.ts:63, 66` |

### Test Coverage

The adaptive logic has thorough unit tests in `questAdaptive.test.ts`:
- Level up after 3 correct (lines 25-38)
- No level up past 10 (lines 47-52)
- Level down after 2 wrong (lines 56-66)
- No level down past 1 (lines 68-72)
- `levelDownsInARow` increment on level-down (lines 74-78)
- `levelDownsInARow` reset on any correct answer (lines 41-44)
- Session end at 10 questions (line 112-114)
- Session end at 480 seconds (lines 116-118)
- Frustration end after MIN_QUESTIONS (lines 120-125)
- No frustration end before MIN_QUESTIONS (lines 127-129)
- Timeout still ends before MIN_QUESTIONS (lines 131-133)

**Missing test**: No unit test for the bonus round logic itself (it lives in `useQuestSession.ts`, not in the pure `questAdaptive.ts` functions). The bonus round is integration-level logic, harder to unit test but should be tested.

### Edge Cases — Frustration Loop Analysis

**Scenario: Lincoln stuck at Level 1**

If Lincoln starts at Level 2 and gets 2 wrong → drops to Level 1. Gets 2 more wrong at Level 1 → can't drop below 1, but `levelDownsInARow` is NOT incremented because the level-down guard (`currentLevel > 1`) prevents the level change AND the `levelDownsInARow` increment (both are inside the same `if` block at `questAdaptive.ts:36-41`).

**This is a potential frustration trap.** Here's the sequence:

1. Start Level 2. Wrong, wrong → Level 1. `levelDownsInARow = 1`.
2. Level 1. Wrong → `consecutiveWrong = 1`. No level change (floor).
3. Level 1. Wrong → `consecutiveWrong = 2`. Guard fails (`currentLevel > 1` is false). `consecutiveWrong` stays at 2 (never reset because the level-down block doesn't execute). `levelDownsInARow` stays at 1.
4. Level 1. Wrong → `consecutiveWrong = 3`. Same — guard keeps failing.
5. **The child is stuck**: `levelDownsInARow` is frozen at 1 (never reaches FRUSTRATION_LIMIT of 2), so the frustration exit never fires. The only exits are 10-question cap or 8-minute timeout.

**Wait — let me re-read the code more carefully.**

At `questAdaptive.ts:34-41`:
```ts
consecutiveWrong = prev.consecutiveWrong + 1
consecutiveCorrect = 0
if (consecutiveWrong >= LEVEL_DOWN_STREAK && currentLevel > 1) {
  currentLevel = prev.currentLevel - 1
  consecutiveWrong = 0
  questionsThisLevel = 0
  levelDownsInARow = prev.levelDownsInARow + 1
}
```

When at Level 1: `consecutiveWrong` keeps incrementing (1, 2, 3, 4...) because the reset inside the `if` block never fires. But `levelDownsInARow` never increments past 1. So:

**Finding B1 (Medium): Level 1 frustration trap.** A child who drops to Level 1 and continues getting wrong answers will never trigger the frustration exit (`levelDownsInARow >= 2`). They must answer all 10 questions or wait 8 minutes. This is the worst case for Lincoln: stuck at Level 1 with questions he can't answer, no adaptive escape.

**Mitigation already present**: The skip button appears after 8 seconds or 2 consecutive wrong answers (`ReadingQuest.tsx:500`). Skips don't count toward the question total (`useQuestSession.ts:1195-1196`), so Lincoln can skip bad questions indefinitely. However, skipping also doesn't advance the session toward the 10-question exit — a skip-heavy session could theoretically run until the 8-minute timeout. In practice, the parent would intervene, but the system doesn't have an automatic escape.

**Recommendation**: Consider adding a "total wrong at Level 1" counter (e.g., 4 wrong answers at Level 1 → end session), or counting level-floor hits toward `levelDownsInARow`.

---

**Scenario: Rapid oscillation between levels**

1. Level 3. Correct, correct, correct → Level 4. `levelDownsInARow = 0`.
2. Level 4. Wrong, wrong → Level 3. `levelDownsInARow = 1`.
3. Level 3. Correct, correct, correct → Level 4. `levelDownsInARow = 0` (reset by correct answer at step 3.1).
4. Level 4. Wrong, wrong → Level 3. `levelDownsInARow = 1`.
5. Repeat.

**Finding B2 (Low): Oscillation doesn't trigger frustration exit.** Because any correct answer resets `levelDownsInARow` to 0 (`questAdaptive.ts:27`), a child who oscillates between two levels (e.g., getting 3 right then 2 wrong repeatedly) will never trigger the frustration limit. They'll hit the 10-question cap naturally, which is appropriate — this pattern shows the child is near their frontier, and the 10-question cap keeps the session short.

**Verdict**: Not a real problem. The 10-question cap handles this correctly.

---

**Scenario: Bonus round edge cases**

The bonus round fires when:
- Session should end (10 questions OR frustration limit)
- Last answer was wrong
- Not timed out
- Bonus not already used
- `levelDownsInARow < FRUSTRATION_LIMIT`

The bonus level is `Math.max(1, currentLevel - 2)`.

**Finding B3 (Low): Bonus round can exceed MAX_QUESTIONS.** If the session hits 10 questions on a wrong answer, the bonus round adds an 11th question. This is by design (the bonus question extends the session to end on a positive note). The counter display shows `11/10` momentarily (`ReadingQuest.tsx:545`: `questState.totalQuestions + 1}/{MAX_QUESTIONS}`). Cosmetic issue only — the underlying behavior is intentional and correct.

**Finding B4 (Info): Bonus round skipped during frustration.** The bonus round correctly does NOT fire when `levelDownsInARow >= FRUSTRATION_LIMIT` (`useQuestSession.ts:1043`). This means a child who exits due to frustration won't be forced to do one more question — good design for Lincoln.

### Adaptive State Purity

`computeNextState` is a pure function with no side effects — verified by inspection. All state transitions are deterministic. The function does not access refs, hooks, or external state. It only reads its two inputs (`prev: QuestState`, `correct: boolean`) and returns a new state object.

The skip path correctly does NOT call `computeNextState` (`useQuestSession.ts:1195`), so skips don't affect level, streaks, or frustration counters.

---

## Part C: Quest UX Audit

### C1: "Back to Mine" Button — Accidental Tap Risk

**Location**: `KnowledgeMinePage.tsx:337-350` (active quest) and `KnowledgeMinePage.tsx:160-172` (fluency).

**Current implementation**:
```tsx
<Button
  onClick={quest.resetToIntro}
  sx={{
    fontFamily: MC.font,
    fontSize: '0.4rem',
    color: MC.stone,
    textTransform: 'none',
    mb: 1,
    '&:hover': { color: MC.white },
  }}
>
  ← Back to mine
</Button>
```

**Finding C1 (High): No confirmation dialog.** Tapping "← Back to mine" immediately calls `resetToIntro()`, which clears ALL session state — `questState`, `answeredQuestions`, `findings`, `currentQuestion`, etc. (`useQuestSession.ts:1496-1516`). There is no confirm dialog. If Lincoln accidentally taps it mid-question, the entire session is lost with no recovery. The session has NOT been saved to Firestore at this point (saving happens only in `endSession()`).

**Position**: The button is rendered ABOVE the question card, in the top-left corner. On a phone, this is close to where a child might tap while scrolling or adjusting grip. The button has no minimum tap target height (uses default MUI Button sizing with `fontSize: '0.4rem'`, which is very small). The small size reduces accidental tap risk somewhat, but the lack of confirmation is the real danger.

**Visibility**: The button is hidden on the Summary screen (`quest.screen !== QuestScreen.Summary` guard at line 337), which is correct — once the session is complete, "Back to mine" shouldn't appear.

**Recommendation**:
1. Add a confirmation dialog: "End quest? Your progress won't be saved." with Cancel/End buttons.
2. Alternatively, auto-save partial sessions before navigating away, so progress isn't completely lost.
3. Consider moving the button to a less prominent position (e.g., overflow menu / three-dot icon).

### C2: Phoneme Display — `/s/ /t/` Style Notation

**Finding C2 (Pass): Phoneme display is correctly scoped to Levels 1-3 only.**

- The AI prompt explicitly limits phoneme display: "Levels 1-3 ONLY: You may include phonemeDisplay with SIMPLE notation: /s/ /t/ /o/ /p/" (`chat.ts:1058`).
- The prompt explicitly bans IPA symbols: "NEVER use macrons (ā, ē, ī, ō, ū), schwas (ə), or IPA symbols" (`chat.ts:1059`).
- Kid-friendly substitutions are mandated: `/ay/` for long-a, `/ee/` for long-e, `/igh/` for long-i, `/oh/` for long-o, `/yoo/` for long-u (`chat.ts:1060`).
- Level 4+: "Set phonemeDisplay to null. Do NOT show phoneme breakdowns at higher levels" (`chat.ts:1061`).
- The client renders `phonemeDisplay` only if the field is present (`ReadingQuest.tsx:734`: `{question.phonemeDisplay && ...}`), so even if the AI erroneously includes it at Level 5+, the field would render. However, the AI is explicitly told not to, and the field is optional (`questTypes.ts:78`).

**Concern**: No client-side level check. If the AI sends `phonemeDisplay` at Level 5, the client will display it. A defensive guard like `{question.phonemeDisplay && questState.currentLevel <= 3 && ...}` would be safer, but this is low risk since the prompt is clear.

### C3: Word Stimulus Rendering

**Finding C3 (Pass): Target word renders large and clear above answer options.**

The stimulus word display at `ReadingQuest.tsx:711-731`:
```tsx
{displayStimulus && (
  <Box sx={{
    bgcolor: MC.darkStone,
    border: `2px solid ${MC.diamond}`,
    borderRadius: 2,
    p: 2.5,
    textAlign: 'center',
    mb: 3,
  }}>
    <TappableText
      text={displayStimulus}
      onTapWord={speakWord}
      fontFamily={MC.font}
      fontSize="1.4rem"
      color={MC.diamond}
      sx={{ letterSpacing: 6, textTransform: 'lowercase' }}
    />
  </Box>
)}
```

- Font size: `1.4rem` — significantly larger than the prompt (`0.7rem`) and options (`0.7rem`).
- Color: `MC.diamond` (#5BFCEE) — bright cyan on dark background, high contrast.
- Border: `2px solid ${MC.diamond}` — clearly delineated box.
- Position: Above the answer options, below the prompt text. Correct visual hierarchy.
- Tappable for TTS: Each word in the stimulus is individually tappable to hear pronunciation.
- Defensive fallback: If the AI omits the stimulus but the prompt asks "What word is this?", the code falls back to using `correctAnswer` as the display word (`ReadingQuest.tsx:521`). This prevents Lincoln from guessing blind.

### C4: Skip Button Behavior

**Finding C4 (Pass with notes): Skip is well-designed but has an infinite-skip edge case.**

**When Skip appears** (`ReadingQuest.tsx:500`):
- After 8 seconds on the current question (`timerElapsed`), OR
- After 2+ consecutive wrong answers (`consecutiveWrong >= 2`)

**What Skip does** (`ReadingQuest.tsx:506-514`, `useQuestSession.ts:1167-1196`):

1. **UI**: Highlights the correct answer for 2 seconds (correct option turns green, others fade), then moves on.
2. **Recording**: The question is recorded as `skipped: true`, `correct: false`, `childAnswer: ''`.
3. **Error flagging**: If the question had a formatting error (detected by `shouldFlagAsError()`), it's also marked `flaggedAsError: true`.
4. **Adaptive state**: Skip does NOT call `computeNextState()`. It does NOT increment `totalQuestions`, `consecutiveWrong`, `consecutiveCorrect`, or `levelDownsInARow`. The adaptive engine is completely unaffected by skips.
5. **Next question**: A replacement question is requested at the same level with an instruction to test a different skill/word.

**Behavior is consistent across quest types**: The same `handleSkip` function is used for phonics, comprehension, and math quests. Fluency mode doesn't have skippable questions (it's self-paced reading).

**Edge case — infinite skips** (`useQuestSession.ts:1195-1196`):
> "DO NOT call computeNextState — skip doesn't affect adaptive state"
> "DO NOT increment totalQuestions — question counter stays the same"

Because skips don't count toward `totalQuestions`, a child could theoretically skip indefinitely without ever reaching the 10-question cap. The only exits would be:
- The 8-minute timeout (which continues ticking during skips)
- The parent tapping "Back to mine"
- The child answering (not skipping) enough questions to trigger a normal end condition

**In practice**: This is unlikely to be a problem. Skipping generates a new question at the same level, so a child who skips repeatedly will keep getting new questions they can attempt. The 8-minute timeout provides a hard backstop. And a child who is motivated enough to keep skipping is demonstrating engagement (or demonstrating that the questions are too hard, which the parent would notice).

**UI detail**: The skip button is styled as a muted stone-colored block below the answer options (`ReadingQuest.tsx:829-872`). It has `minHeight: 56` — same as answer options. It says "Skip ⛏️". It's visually distinct from answer options (stone border vs. no border on options), reducing accidental skip taps.

### C5: Score Framing — "Questions Explored" vs. "X Correct out of Y"

**Finding C5 (Pass): The child-facing UI consistently uses "questions explored" and "diamonds mined" framing. No "X correct out of Y" language appears.**

| Location | What's Shown | Framing |
|---|---|---|
| In-quest header (`ReadingQuest.tsx:544-546`) | `{totalQuestions + 1}/{MAX_QUESTIONS}` | Progress counter ("question 3 of 10"), NOT a score |
| In-quest diamond counter (`ReadingQuest.tsx:585`) | `💎 {questState.totalCorrect}` | Raw diamond count, no denominator |
| Feedback — correct (`ReadingQuest.tsx:165`) | `{totalCorrect} diamond(s) mined so far` | Diamonds framing |
| Feedback — wrong (`ReadingQuest.tsx:129`) | `Almost!` + correct answer + encouragement | No score shown on wrong answer |
| Summary diamonds (`QuestSummary.tsx:136`) | `{totalCorrect} diamond(s) mined!` | Diamonds framing |
| Summary detail (`QuestSummary.tsx:145`) | `{totalQuestions} questions explored · Level {finalLevel}` | "Questions explored" — not "correct" |
| Summary XP (`QuestSummary.tsx:229`) | `+{questXp} XP!` | XP framing |

**One parent-facing exception**: The internal session summary text (`useQuestSession.ts:658`) uses `${finalState.totalCorrect}/${finalState.totalQuestions} correct` — but this is stored in Firestore for the parent's review, not shown to the child during the quest.

**The diamond count implicitly reveals the score** (noted in Part A as PARTIAL), but it's framed as an achievement ("diamonds mined") rather than a deficit ("X wrong"). A child who gets 3 out of 10 sees "3 diamonds mined!" and "10 questions explored" — positive framing on both counts.

### C6: Additional UX Finding — Header Counter Shows "11/10" During Bonus Round

During the bonus round, `totalQuestions` has already reached 10 (the trigger for `shouldEnd`), but a new question is shown. The header renders `{questState.totalQuestions + 1}/{MAX_QUESTIONS}` which evaluates to `11/10`. This is a minor cosmetic issue — the "BONUS ROUND!" banner at `ReadingQuest.tsx:589-616` draws attention away from the counter, but `11/10` could confuse a child who notices it.

**Recommendation**: Hide the progress counter during the bonus round, or cap the display at `10/10`.

---

## Part F: Coverage Gaps

### F1: Math Quest — Status: Enabled and Safe

Math Quest was promoted from "coming soon" to enabled status. Per `MASTER_OUTLINE.md:127`: "Math Quest enabled (was 'coming soon')."

**Implementation**:
- `KnowledgeMinePage.tsx:66-75`: `MATH_MODES` array has `enabled: true`.
- Full AI prompt exists at `functions/src/ai/chat.ts:1163-1316` with 6 defined levels.
- TTS auto-reads math questions (`ReadingQuest.tsx:462-467`).
- Uses the same adaptive engine, quest session hook, and quest UI as reading quests.
- No separate routes — domain selection is UI-only within `/quest`.

**Finding F1 (Pass):** Math Quest is production-ready. No broken nav links, no half-built UI. Fully functional and navigable.

### F2: Speech Quest — Status: Safely Disabled

**Implementation** (`KnowledgeMinePage.tsx:77-85`):
```
domain: EvaluationDomain.Speech,
label: 'Speech Quest',
icon: '🗣️',
enabled: false,
description: 'Coming soon!',
```

**Safety verification**:

| Check | Result |
|---|---|
| Clickable? | **No.** `QuestCard` only renders `onClick`/`role="button"`/`tabIndex` when `enabled={true}`. |
| Visual state | Opacity 0.4, cursor `default` (not pointer). Clearly disabled. |
| "Coming soon" messaging | **Yes.** Description reads "Coming soon!" |
| Broken nav links to speech quest? | **None.** No `/speech-quest` route. No hardcoded links anywhere in the codebase. |
| Half-built components? | **None.** No `SpeechQuestPage.tsx` or speech-specific quest components. |
| Backend prompt? | **None.** No speech quest task handler exists. |
| Evaluate page tab? | Speech tab exists in `EvaluateChatPage.tsx` but is also disabled with "coming soon" messaging. |
| Keyboard accessible? | **No** (correctly — `tabIndex` not set when disabled). |

**Finding F2 (Pass):** Speech Quest is safely stubbed. Lincoln cannot accidentally enter it. No broken navigation paths. Clear "Coming soon!" messaging.

### F3: London in Knowledge Mine — No Learner Profile

London (6, kindergarten) has no evaluation sessions, no skill snapshots, no word progress data, and no workbook configs. What happens if she opens Knowledge Mine?

**Step-by-step walkthrough**:

1. **Page load**: `KnowledgeMinePage` renders normally. `useActiveChild()` returns London's child document (which exists in the `children` collection). No age gating, no profile requirement. Greeting: "Hey London! Ready to mine some knowledge?"

2. **Quest selection**: All three reading modes (Phonics, Comprehension, Fluency) and Math Quest display as enabled. Speech Quest displays as disabled. Avatar shows Wooden tier, 0 XP (defaults).

3. **Start quest (e.g., Phonics)**:
   - `startQuest()` checks `activeChildId && activeChild` — both exist, proceeds.
   - Attempts to load `workbookConfigs` for starting level — none exist, defaults to **Level 2** (`useQuestSession.ts:391`).
   - Calls AI service with London's context.

4. **Cloud function context loading** (`contextSlices.ts` + `quest.ts`):
   - All 6 context slices use `Promise.allSettled()` — failures don't block:
     - `childProfile`: Loads from `children` collection — **succeeds**.
     - `sightWords`: Queries `sightWordProgress` — **empty, returns empty string**.
     - `recentEval`: Queries last evaluation — **none exist, returns empty string**.
     - `wordMastery`: Queries `children/{childId}/wordProgress` — **empty, returns empty string**.
     - `skillSnapshot`: Loads skill snapshot doc — **none exists, returns empty string**.
     - `workbookPaces`: Loads curriculum workbooks — **empty, returns empty string**.

5. **AI prompt**: Generated with London's name, Level 2, and all optional context sections empty. The AI generates generic Level 2 phonics questions (CVC blending) with no personalization.

6. **Session completion**: Questions, score, and level are saved to `evaluationSessions`. XP and diamonds are awarded normally. A skill snapshot is auto-created from session findings.

**Finding F3 (Pass with notes):** Knowledge Mine works correctly for London with no crashes or broken UI.

| Behavior | Assessment |
|---|---|
| Page renders | Pass — no missing data crashes |
| Quest starts | Pass — defaults to Level 2 |
| AI generates questions | Pass — generic but age-appropriate CVC content |
| Session saves | Pass — creates new evaluation session and skill snapshot |
| XP/diamonds awarded | Pass — standard awards apply |
| Streak tracking | Pass — shows "Never played" for first session |

**Caveats**:
- Questions are completely generic (no personalization from prior evaluations or skill data). This is fine for a first session.
- Every session starts at Level 2 until workbook configs or curriculum data is added for London. There's no automatic progression of starting level between sessions based on prior quest performance.
- The system does NOT check whether the child's grade or age is appropriate for the quest content. Level 2 phonics (CVC blending) is developmentally appropriate for London (kindergarten, knows most letter sounds), but this is coincidental — the default, not an intentional age adaptation.

---

## Prioritized Fix List

### P0 — Breaks Lincoln's Flow or Violates Core Design Principle

| # | Title | Part | Description | Effort |
|---|---|---|---|---|
| P0-1 | "Back to mine" needs confirmation | C | Tapping the button mid-quest instantly destroys session with no save and no confirmation dialog. One accidental tap = lost progress. **Fixed:** Resume now restores full state (level, diamonds, current question) — no more fresh-start regression on Continue. | S |
| P0-2 | Level 1 frustration trap | B | A child stuck at Level 1 never triggers frustration exit. `levelDownsInARow` can't increment at floor. Only 10-question cap or 8-min timeout ends the session. Add a "total wrong at Level 1" escape. | S |

### P1 — Quality Issue, Should Fix Soon

| # | Title | Part | Description | Effort |
|---|---|---|---|---|
| P1-1 | Comprehension/Math level cap at 6 | A | Adaptive engine allows Level 7-10 but prompts only define 1-6. Add per-quest-mode level caps in `computeNextState` so children can't enter undefined territory. | S |
| P1-2 | Stale "Levels 1-6" UI text | A | `KnowledgeMinePage.tsx:46,54` claims Levels 1-6 for all quests. Phonics actually supports 1-10. Either update text or remove level range from UI. | S |
| P1-3 | Comprehension prompt under-specified | A | Only 3 difficulty bands (2 levels each) with vague guidance. Phonics has 6 specific bands with concrete question types. Comprehension quality is unpredictable. | M |
| P1-4 | Phonics L9-10 domain mismatch | A | Levels 9-10 test passage comprehension, not phonics. A child who excels at decoding gets comprehension questions inside "Phonics Quest." Should redirect to Comprehension Quest instead. | M |
| P1-5 | Duplicate starting-level logic | A | Curriculum-to-starting-level computed in both client (`useQuestSession.ts:390-443`) and server (`quest.ts:29-87`). Could drift if only one is updated. | M |
| P1-6 | ~~Math has no starting-level boost~~ | A | ~~Math always starts at Level 2 regardless of curriculum data. Reading adapts starting level from workbook completion. Math should do the same.~~ **FIXED:** Math curriculum scans now write `workingLevels.math` via `deriveMathWorkingLevelFromScan`. Quest sessions read from `workingLevels` fallback chain. | S |

### P2 — Nice to Have

| # | Title | Part | Description | Effort |
|---|---|---|---|---|
| P2-1 | Bonus round shows "11/10" counter | B, C | Header renders `11/10` during bonus question. Cosmetic — hide counter or cap display at `10/10`. | S |
| P2-2 | Fluency passage difficulty hardcoded | A | Fluency passages always generate at "2nd-3rd grade reading level" regardless of child's actual level. Not adaptive. | S |
| P2-3 | No client-side phoneme display guard | C | Phoneme display renders at any level if the AI sends it. Add `questState.currentLevel <= 3` guard. | S |
| P2-4 | Infinite skip edge case | C | Skips don't count toward question total — theoretically unlimited. 8-min timeout is the only backstop. Consider counting skips toward a separate cap. | S |
| P2-5 | No bonus round unit test | B | Bonus round logic lives in `useQuestSession.ts` (integration level). No isolated unit test. | S |
| P2-6 | `wordProgress` subcollection undocumented | A | `children/{childId}/wordProgress` is not in CLAUDE.md's Firestore collections table (mentioned in a note only). | S |

---

## Open Questions for Shelly/Nathan

1. **Should Phonics L9-10 exist?** They test comprehension, not phonics. A child who reaches L9 has demonstrated strong decoding — should the system redirect them to Comprehension Quest with a message like "You've mastered phonics! Try Comprehension Quest next"? Or is it fine to keep the domain bleed?

2. **Per-quest level caps or expand prompts?** Two ways to fix the Level 7+ gap: (a) cap Comprehension and Math at Level 6 in the adaptive engine, or (b) define Levels 7-10 content in their prompts. Option (a) is simpler but limits growth. Option (b) is more work but better long-term.

3. ~~**Should London's starting level adapt over time?** Currently every quest session starts at Level 2 for a child with no curriculum data. After London completes several quests, should her starting level increase based on prior quest performance (not just workbook configs)?~~ **RESOLVED:** `workingLevels` now updates from quest session performance. After each session, `computeWorkingLevelFromSession` writes the new level. Next session reads it via `computeStartLevel` fallback chain.

4. **Level 1 escape — what feels right?** Options: (a) count level-floor hits as frustration events, (b) add a "4 wrong at Level 1 → end session" rule, (c) show a parent-facing prompt ("London seems stuck — want to end the session?"). Which approach fits the "no shame" philosophy best?

5. ~~**Math starting level from curriculum**: Reading uses workbook completion to boost starting level (up to Level 8). Should math do the same from math curriculum data? Or is Level 2 the right default since Lincoln is "~3rd grade math" and the levels are well-calibrated for that range?~~ **RESOLVED:** Math curriculum scans now write `workingLevels.math` via GATB lesson-to-level mapping. Quest also updates from session performance.

6. **Fluency difficulty**: Should fluency passages adapt to the child's reading level from their most recent skill snapshot, or is the fixed "2nd-3rd grade" target appropriate for both Lincoln (~1st grade reading) and future children?

7. **Bonus round counter display**: Hide the counter entirely during bonus round, cap at "10/10", or show "BONUS" instead of the number? Minor but worth a quick decision.

---

*Audit complete. 4 parts, 6 sections (A-C, F), 15 findings, 14 fixes, 7 open questions.*
*No code was changed. No files were modified except this document.*

---

## Post-Audit Fix: workingLevels Data Model (2026-04-09)

**Problem:** Every Knowledge Mine session started at Level 2 (or curriculum-derived for reading). Quest performance had no effect on future sessions — Lincoln could ace 10 phonics sessions and still start at Level 2 next time.

**Fix:** Added `workingLevels` field to `skillSnapshots/{childId}` — a per-domain (phonics/comprehension/math) authoritative "where is this child now" record.

**Read path:** `computeStartLevel()` uses fallback chain: workingLevels[mode] → curriculum hint → Level 2 default. Always capped at mode ceiling.

**Write paths:**
1. **Quest session end** — `computeWorkingLevelFromSession()` derives new level from session performance (stable ceiling vs crash detection)
2. **Guided evaluation apply** — `deriveWorkingLevelFromEvaluation()` maps mastered findings to levels
3. **Math curriculum scan** — `deriveMathWorkingLevelFromScan()` maps GATB lesson numbers to levels

**Manual override protection:** `source: 'manual'` is protected from automated overwrites for 48 hours.

**Resolved:** P1-6, Open Questions 3/5/8.
