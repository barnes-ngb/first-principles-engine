# Knowledge Mine Audit — April 2026

> Read-only audit, Part 1 of 4. No code changes.
> Auditor: Claude Code. Date: 2026-04-07.

---

## Summary

1. **The "6 level" claim is stale.** The intro screen says "Levels 1-6" for both Phonics and Comprehension quests, but the actual system supports Levels 1-10 with a hard cap of 10 in `questAdaptive.ts:28`. A child can reach Level 7+ in normal play — this is not a bug, but the UI description is wrong.
2. **Phonics and Comprehension use different level scales.** Phonics has 10 well-defined levels (letter sounds through vocabulary-in-context). Comprehension has only 6 defined difficulty tiers in its prompt (Levels 1-6) but shares the same 1-10 adaptive engine, meaning Levels 7-10 are undefined for comprehension — the AI is freestyling above Level 6.
3. **Math is capped at 6 levels by design** in the prompt but also shares the 1-10 engine. Same undefined-above-6 problem.
4. **Lincoln's constraints are well-respected** for Levels 1-8 (no required typing, MC primary, TTS available, voice optional). Levels 9-10 introduce reading passages that may be too text-heavy for comfortable tablet interaction, though TTS is available.
5. **The comprehension quest correctly skips phonics** — its "DO NOT TEST" list explicitly blocks letter sounds, CVC, blends, and digraphs. However, its 6-level difficulty definition is too coarse for the 10-level engine it runs on.

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

8. **Math has no starting-level boost from curriculum data.** Unlike reading, math always starts at Level 2 regardless of curriculum completion. Is this intentional or an oversight?

9. **Word progress tracking**: Only fires for the interactive quest modes (phonics/comprehension), not for fluency or math. Tracked at `families/{familyId}/children/{childId}/wordProgress` — a subcollection not listed in CLAUDE.md's Firestore Collections table (it is mentioned in a note but not in the main table).
