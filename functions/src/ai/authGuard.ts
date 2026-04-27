import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Verify the caller is an authenticated email user (not anonymous).
 * Throws HttpsError if not.
 */
export function requireEmailAuth(request: CallableRequest): {
  uid: string;
  email: string;
} {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  // Firebase anonymous users have no email and provider === 'anonymous'
  const provider = request.auth.token?.firebase?.sign_in_provider;
  if (provider === "anonymous" || !request.auth.token?.email) {
    throw new HttpsError(
      "permission-denied",
      "An email account is required to use AI features. Please create an account in Settings.",
    );
  }

  return {
    uid: request.auth.uid,
    email: request.auth.token.email as string,
  };
}

/**
 * Check against an allowlist of approved emails.
 * Returns true if the email is approved, false otherwise.
 *
 * For now this is a simple set. Later it could read from Firestore.
 */
const APPROVED_EMAILS = new Set([
  "nathan.xb9753@gmail.com", // Nathan
  // Add more approved emails here
]);

const APPROVED_DOMAINS = new Set<string>([
  // Add a domain to approve all emails from it
  // "example.com",
]);

export function isApprovedUser(email: string): boolean {
  if (APPROVED_EMAILS.has(email.toLowerCase())) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  if (domain && APPROVED_DOMAINS.has(domain)) return true;
  return false;
}

/**
 * Full gate: require email auth + check allowlist.
 * Use this for expensive operations (image generation).
 * Use requireEmailAuth alone for moderate operations (chat, planning).
 */
export function requireApprovedUser(request: CallableRequest): {
  uid: string;
  email: string;
} {
  const { uid, email } = requireEmailAuth(request);

  if (!isApprovedUser(email)) {
    throw new HttpsError(
      "permission-denied",
      "Your account is not approved for this feature. Contact the administrator.",
    );
  }

  return { uid, email };
}

/**
 * Simple per-user rate limit using Firestore.
 * Checks if the user has exceeded maxCalls in the last windowMinutes.
 */
export async function checkRateLimit(
  uid: string,
  action: string,
  maxCalls: number = 50,
  windowMinutes: number = 60,
): Promise<void> {
  try {
    const db = getFirestore();
    const cutoff = new Date(
      Date.now() - windowMinutes * 60 * 1000,
    ).toISOString();

    const recentSnap = await db
      .collection(`families/${uid}/aiUsage`)
      .where("taskType", "==", action)
      .where("createdAt", ">=", cutoff)
      .count()
      .get();

    const count = recentSnap.data().count;
    if (count >= maxCalls) {
      throw new HttpsError(
        "resource-exhausted",
        `Rate limit exceeded: max ${maxCalls} ${action} calls per ${windowMinutes} minutes.`,
      );
    }
  } catch (err) {
    // Re-throw actual rate limit violations
    if (err instanceof HttpsError) throw err;
    // Log but don't block on infrastructure errors (e.g. missing composite index)
    console.warn("Rate limit check failed (non-blocking):", err);
  }
}
