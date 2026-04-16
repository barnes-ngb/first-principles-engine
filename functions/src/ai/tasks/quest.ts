import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";

/**
 * Task: quest
 * Context: childProfile + sightWords + recentHistoryByDomain + wordMastery (via buildContextForTask)
 *          + per-child word progress (struggling/mastered words loaded separately)
 * Model: Sonnet
 */

// Import quest-specific prompt builder from chat.ts
import { buildQuestPrompt } from "../chat.js";

export const handleQuest = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, messages, domain, apiKey } = ctx;

  // Quest only needs childProfile + sightWords + recentHistoryByDomain (no charter, no enriched)
  console.log(`[quest] Starting quest for child=${childId}, domain=${domain}`);

  // Detect questMode early — needed for domain-filtered history and workingLevels lookup
  let questMode: string | undefined;
  if (messages.length > 0) {
    try {
      const firstMsg = JSON.parse(messages[0].content);
      questMode = firstMsg.questMode;
    } catch {
      // Not JSON or missing questMode — use default
    }
  }

  // Map questMode to eval domain for domain-scoped history.
  // Quest modes map 1:1 to eval domains except "reading" which is either
  // phonics or comprehension — default to questMode itself.
  const evalDomain = questMode ?? (domain === "math" ? "math" : "phonics");

  const sections = await buildContextForTask("quest", {
    db, familyId, childId, childData, snapshotData,
    domain: evalDomain,
  });

  // Per-quest-mode level ceilings (must match client-side QUEST_MODE_LEVEL_CAP)
  const QUEST_MODE_LEVEL_CAP: Record<string, number> = {
    phonics: 8,
    comprehension: 6,
    math: 6,
  };
  const DEFAULT_LEVEL_CAP = 10;

  // ── Determine starting level ──────────────────────────────────
  // Priority: workingLevels[questMode] > activityConfigs curriculum > default (2)
  // This mirrors the client-side computeStartLevel fallback chain.
  let suggestedStartLevel: number | undefined;

  // 1. workingLevels (authoritative — set by prior quest sessions and evaluations)
  const workingLevels = snapshotData?.workingLevels;
  const modeKey = questMode ?? (domain === "math" ? "math" : "phonics");
  const workingLevel = workingLevels?.[modeKey];
  if (workingLevel) {
    suggestedStartLevel = workingLevel.level;
    console.log(`[quest] workingLevels.${modeKey} = ${workingLevel.level} (source: ${workingLevel.source})`);
  }

  // 2. Fallback: curriculum data from activityConfigs (only if no workingLevel)
  if (!suggestedStartLevel && (domain === "reading" || !domain)) {
    try {
      const activitySnap = await db
        .collection(`families/${familyId}/activityConfigs`)
        .where("childId", "in", [childId, "both"])
        .where("type", "==", "workbook")
        .get();

      const curriculumDocs = activitySnap.docs.map((d) => d.data() as {
        subjectBucket?: string;
        curriculumMeta?: {
          completed?: boolean;
          masteredSkills?: string[];
        };
      });

      let curriculumLevel: number | undefined;
      for (const config of curriculumDocs) {
        const curriculum = config.curriculumMeta;
        if (config.subjectBucket !== "Reading" && config.subjectBucket !== "LanguageArts") continue;
        if (!curriculum) continue;

        if (curriculum.completed) {
          curriculumLevel = Math.max(curriculumLevel ?? 0, 5);
        }
        const masteredLower = (curriculum.masteredSkills ?? []).map((s) => s.toLowerCase());
        const hasVowelTeams = masteredLower.some(
          (s) => s.includes("vowel-team") || s.includes("vowel-digraph") || s.includes("vowel_team") || s === "vowel-teams-ea-ai-oa-ee-oo",
        );
        const hasDiphthongs = masteredLower.some(
          (s) => s.includes("diphthong") || s.includes("ear") || s.includes("ue") || s === "diphthongs-ear-ue",
        );
        const hasLeEndings = masteredLower.some(
          (s) => s.includes("final-stable") || s.includes("le-ending") || s.includes("le_ending") || s === "le-endings",
        );
        const hasRControlled = masteredLower.some(
          (s) => s.includes("r-controlled") || s.includes("r_controlled"),
        );
        const hasMultiSyllable = masteredLower.some(
          (s) => s.includes("multisyllab") || s.includes("multi-syllab"),
        );
        if (hasVowelTeams) {
          curriculumLevel = Math.max(curriculumLevel ?? 0, 6);
        }
        if (hasDiphthongs || hasLeEndings) {
          curriculumLevel = Math.max(curriculumLevel ?? 0, 7);
        }
        if (hasRControlled && hasMultiSyllable) {
          curriculumLevel = Math.max(curriculumLevel ?? 0, 8);
        }
      }

      if (curriculumLevel) {
        suggestedStartLevel = curriculumLevel;
        console.log(`[quest] Curriculum data fallback suggests starting level: ${curriculumLevel}`);
      }
    } catch (err) {
      console.warn("[quest] Failed to load curriculum data for starting level", err);
    }
  }

  // 3. Cap at mode ceiling (same caps as client-side QUEST_MODE_LEVEL_CAP)
  if (suggestedStartLevel) {
    const cap = QUEST_MODE_LEVEL_CAP[modeKey] ?? DEFAULT_LEVEL_CAP;
    suggestedStartLevel = Math.min(suggestedStartLevel, cap);
    suggestedStartLevel = Math.max(suggestedStartLevel, 1);
  }

  // Load word progress for this child to inform question generation
  try {
    const wordProgressRef = db
      .collection(`families/${familyId}/children/${childId}/wordProgress`);

    // Load struggling words
    const strugglingSnap = await wordProgressRef
      .where("masteryLevel", "in", ["struggling", "not-yet"])
      .orderBy("wrongCount", "desc")
      .limit(15)
      .get();

    if (!strugglingSnap.empty) {
      const strugglingWords = strugglingSnap.docs.map((d) => {
        const data = d.data();
        const total = (data.correctCount || 0) + (data.wrongCount || 0) + (data.skippedCount || 0);
        return `${data.word} (${data.pattern}, ${data.correctCount || 0}/${total} correct)`;
      });

      sections.push(
        `STRUGGLING WORDS: ${strugglingWords.join(", ")}\n` +
        `Generate some questions that revisit these struggling words. Mix them with new words — don't ONLY test struggling words or it will feel punishing.`,
      );
    }

    // Load known words to avoid over-testing
    const knownSnap = await wordProgressRef
      .where("masteryLevel", "==", "known")
      .limit(30)
      .get();

    if (!knownSnap.empty) {
      const knownWords = knownSnap.docs.map((d) => d.data().word);
      sections.push(
        `KNOWN WORDS (don't over-test): ${knownWords.join(", ")}`,
      );
    }
  } catch (err) {
    // Don't block quest if word progress loading fails
    console.warn("Failed to load word progress for quest context", err);
  }

  // Append quest-specific interactive prompt
  sections.push(buildQuestPrompt(domain || "reading", suggestedStartLevel, questMode));

  const systemPrompt = sections.join("\n\n");
  const model = modelForTask("quest");

  console.log(`[quest] System prompt: ${systemPrompt.length} chars, model: ${model}, messages: ${messages.length}`);

  let result;
  try {
    result = await callClaude({
      apiKey,
      model,
      maxTokens: 1024,
      systemPrompt,
      messages,
    });
  } catch (err) {
    console.error(`[quest] Claude API call FAILED:`, err);
    throw err;
  }

  if (!result.text) {
    console.warn("[quest] Claude returned empty response", { model, taskType: "quest" });
  }

  console.log(`[quest] Response: ${result.text.length} chars, inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`);

  await logAiUsage(db, familyId, {
    childId,
    taskType: "quest",
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return {
    message: result.text,
    model,
    usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
  };
};
