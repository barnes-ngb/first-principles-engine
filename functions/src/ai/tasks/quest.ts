import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";

/**
 * Task: quest
 * Context: childProfile + sightWords + recentEval + wordMastery (via buildContextForTask)
 *          + per-child word progress (struggling/mastered words loaded separately)
 * Model: Sonnet
 */

// Import quest-specific prompt builder from chat.ts
import { buildQuestPrompt } from "../chat.js";

export const handleQuest = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, messages, domain, apiKey } = ctx;

  // Quest only needs childProfile + sightWords + recentEval (no charter, no enriched)
  console.log(`[quest] Starting quest for child=${childId}, domain=${domain}`);

  const sections = await buildContextForTask("quest", {
    db, familyId, childId, childData, snapshotData,
  });

  // Determine starting level from curriculum completion data
  let suggestedStartLevel: number | undefined;
  if (domain === "reading" || !domain) {
    try {
      // TODO: Migrate to activityConfigs. WorkbookConfig is legacy — see migrateActivityConfigs.ts
      const wbSnap = await db
        .collection(`families/${familyId}/workbookConfigs`)
        .where("childId", "==", childId)
        .get();

      for (const wbDoc of wbSnap.docs) {
        const config = wbDoc.data() as {
          subjectBucket?: string;
          curriculum?: {
            completed?: boolean;
            masteredSkills?: string[];
          };
        };
        if (config.subjectBucket !== "Reading" && config.subjectBucket !== "LanguageArts") continue;
        if (!config.curriculum) continue;

        // Completed reading curriculum → start past basic phonics
        if (config.curriculum.completed) {
          suggestedStartLevel = Math.max(suggestedStartLevel ?? 0, 5);
        }
        // Check specific mastered skills for finer-grained level (flexible matching)
        const masteredLower = (config.curriculum.masteredSkills ?? []).map((s) => s.toLowerCase());
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
          suggestedStartLevel = Math.max(suggestedStartLevel ?? 0, 6);
        }
        if (hasDiphthongs || hasLeEndings) {
          suggestedStartLevel = Math.max(suggestedStartLevel ?? 0, 7);
        }
        if (hasRControlled && hasMultiSyllable) {
          suggestedStartLevel = Math.max(suggestedStartLevel ?? 0, 8);
        }
      }

      if (suggestedStartLevel) {
        console.log(`[quest] Curriculum data suggests starting level: ${suggestedStartLevel}`);
      }
    } catch (err) {
      console.warn("[quest] Failed to load workbook configs for starting level", err);
    }
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

  // Detect questMode from the first user message
  let questMode: string | undefined;
  if (messages.length > 0) {
    try {
      const firstMsg = JSON.parse(messages[0].content);
      questMode = firstMsg.questMode;
    } catch {
      // Not JSON or missing questMode — use default
    }
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
