import { onCall } from "firebase-functions/v2/https";

export const healthCheck = onCall(async () => {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  };
});
