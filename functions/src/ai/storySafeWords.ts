/**
 * The child's own words, as an ALLOWLIST (FEAT-176).
 *
 * The story prompt already had two sight-word context slices attached, and
 * neither could serve as an allowlist:
 *
 *  - `loadWordMasterySummary` (`chat.ts`) prints `STRUGGLING WORDS: …` followed
 *    by *"SUGGESTION: Generate or assign a sight word story targeting these
 *    struggling words."* — a slice written for the lesson planner, which reaches
 *    a story writer as an instruction to use the hardest words the child knows.
 *    It was the ONLY concrete word list anywhere in the story prompt.
 *  - `loadSightWordSummary` (`chat.ts`) caps mastered words at 15 and frames
 *    them as *"Mastered words (skip or reduce practice)"* — again the planner's
 *    framing, and the opposite of "safe to use".
 *
 * So this module reads the same collection the second one does and returns the
 * words themselves, grouped by mastery, for `composeSafeWords` to order and cap
 * and for `checkStoryReadability` to treat as decodable at any level. Nothing
 * here changes what a sight word is, and nothing here writes.
 *
 * Read-only on `sightWordProgress`. Never throws: a failed read yields empty
 * groups, and the story is then measured against the core list alone.
 */

import type { Firestore } from "firebase-admin/firestore";

export interface StorySafeWordGroups {
  mastered: string[];
  familiar: string[];
  practicing: string[];
  /** `new` in the data; renamed here because `new` is a reserved word. */
  justAdded: string[];
}

const EMPTY: StorySafeWordGroups = {
  mastered: [],
  familiar: [],
  practicing: [],
  justAdded: [],
};

/**
 * The child's sight words grouped by mastery level.
 *
 * Doc-id filter (`{childId}_…`) matches `loadSightWordSummary` exactly — the
 * collection is family-scoped with a composite id, and this must select the
 * same rows the prompt's summary describes.
 */
export async function loadStorySafeWords(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<StorySafeWordGroups> {
  try {
    const snap = await db.collection(`families/${familyId}/sightWordProgress`).get();
    const groups: StorySafeWordGroups = {
      mastered: [],
      familiar: [],
      practicing: [],
      justAdded: [],
    };
    for (const doc of snap.docs) {
      if (!doc.id.startsWith(`${childId}_`)) continue;
      const data = doc.data() as { word?: unknown; masteryLevel?: unknown };
      const word = typeof data.word === "string" ? data.word.trim() : "";
      if (!word) continue;
      switch (data.masteryLevel) {
        case "mastered":
          groups.mastered.push(word);
          break;
        case "familiar":
          groups.familiar.push(word);
          break;
        case "practicing":
          groups.practicing.push(word);
          break;
        case "new":
          groups.justAdded.push(word);
          break;
        default:
          break;
      }
    }
    return groups;
  } catch (err) {
    // A story that cannot read the child's word list is still a story; it is
    // just measured against the core list alone. Never block generation.
    console.warn("[storySafeWords] sightWordProgress read failed", {
      familyId,
      childId,
      error: String(err),
    });
    return { ...EMPTY, mastered: [], familiar: [], practicing: [], justAdded: [] };
  }
}
