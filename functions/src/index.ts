import { initializeApp } from "firebase-admin/app";

initializeApp();

export { healthCheck } from "./ai/health.js";
export { chat, analyzeEvaluationPatterns } from "./ai/chat.js";
export { generateQuestionBank } from "./ai/tasks/generateQuestionBank.js";
export { weeklyReview, generateWeeklyReviewNow } from "./ai/evaluate.js";
export { generateActivity } from "./ai/generate.js";
export { generateImage, generateAvatarPiece, generateStarterAvatar, transformAvatarPhoto, generateArmorPiece, generateBaseCharacter, generateArmorSheet, generateArmorReference, extractFeatures } from "./ai/imageGen.js";
