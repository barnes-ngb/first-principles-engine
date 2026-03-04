import { initializeApp } from "firebase-admin/app";

initializeApp();

export { healthCheck } from "./ai/health.js";
export { chat } from "./ai/chat.js";
export { weeklyReview } from "./ai/evaluate.js";
export { generateActivity } from "./ai/generate.js";
export { generateImage } from "./ai/imageGen.js";
