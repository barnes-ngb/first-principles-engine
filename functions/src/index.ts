import { initializeApp } from "firebase-admin/app";

initializeApp();

export { healthCheck } from "./ai/health.js";
export { chat, analyzeEvaluationPatterns } from "./ai/chat.js";
export { weeklyReview, generateWeeklyReviewNow } from "./ai/evaluate.js";
export { generateActivity } from "./ai/generate.js";
export { generateImage, generateAvatarPiece, generateStarterAvatar, transformAvatarPhoto } from "./ai/imageGen.js";
