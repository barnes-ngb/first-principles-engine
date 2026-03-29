import type { ChatTaskHandler } from "../chatTypes.js";
import { handlePlan } from "./plan.js";
import { handleChat } from "./chatHandler.js";
import { handleEvaluate } from "./evaluate.js";
import { handleQuest } from "./quest.js";
import { handleGenerateStory } from "./generateStory.js";
import { handleWorkshop } from "./workshop.js";
import { handleAnalyzeWorkbook } from "./analyzeWorkbook.js";
import { handleDisposition } from "./disposition.js";
import { handleConundrum } from "./conundrum.js";
import { handleWeeklyFocus } from "./weeklyFocus.js";
import { handleScan } from "./scan.js";

export { analyzeEvaluationPatterns } from "./analyzePatterns.js";

export const CHAT_TASKS: Record<string, ChatTaskHandler> = {
  plan: handlePlan,
  chat: handleChat,
  generate: handleChat,
  evaluate: handleEvaluate,
  quest: handleQuest,
  generateStory: handleGenerateStory,
  workshop: handleWorkshop,
  analyzeWorkbook: handleAnalyzeWorkbook,
  disposition: handleDisposition,
  conundrum: handleConundrum,
  weeklyFocus: handleWeeklyFocus,
  scan: handleScan,
};
