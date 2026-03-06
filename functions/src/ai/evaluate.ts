import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { claudeApiKey } from "./aiConfig.js";
import { sanitizeAndParseJson } from "./sanitizeJson.js";

// ── Types ───────────────────────────────────────────────────────

export interface WeeklyReview {
  childId: string;
  weekKey: string;
  status: "draft" | "approved";
  progressSummary: string;
  paceAdjustments: PaceAdjustment[];
  planModifications: PlanModification[];
  energyPattern: string;
  celebration: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  createdAt: string;
}

export interface PaceAdjustment {
  subject: string;
  currentPace: string;
  suggestedChange: string;
}

export interface PlanModification {
  area: string;
  observation: string;
  recommendation: string;
}

interface ChildProfile {
  id: string;
  name: string;
  grade?: string;
}

interface SessionRecord {
  streamId: string;
  result: string;
  date: string;
  durationSeconds?: number;
  supports?: string[];
}

interface HoursRecord {
  minutes: number;
  subjectBucket?: string;
  date: string;
}

interface DailyPlanRecord {
  date: string;
  energy: string;
  planType: string;
  sessions: Array<{ streamId: string; ladderId: string }>;
}

// ── Week helpers ────────────────────────────────────────────────

/**
 * Return the Monday-of-week date string for the most recent completed week.
 * If today is Sunday, that week just ended. Otherwise, go back to the
 * previous Monday–Sunday window.
 */
export function lastWeekKey(today: Date): string {
  const day = today.getDay(); // 0=Sun
  // Days since the Monday that started last week:
  // Sunday (0): last Monday was 6 days ago
  // Monday (1): last Monday was 7 days ago (previous week)
  // Tuesday–Saturday: last Monday was (day + 6) days ago
  const daysBack = day === 0 ? 6 : day + 6;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysBack);
  return formatDate(monday);
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

// ── Context assembly ────────────────────────────────────────────

export interface WeekContext {
  child: ChildProfile;
  weekKey: string;
  sessions: SessionRecord[];
  hours: HoursRecord[];
  dailyPlans: DailyPlanRecord[];
  missedDays: number;
}

export async function assembleWeekContext(
  familyId: string,
  childId: string,
  weekKey: string,
): Promise<WeekContext> {
  const db = getFirestore();
  const familyRef = db.collection("families").doc(familyId);

  const weekEnd = addDays(weekKey, 6);

  // Load child profile
  const childSnap = await familyRef.collection("children").doc(childId).get();
  if (!childSnap.exists) {
    throw new Error(`Child ${childId} not found in family ${familyId}`);
  }
  const childData = childSnap.data() as { name: string; grade?: string };
  const child: ChildProfile = {
    id: childId,
    name: childData.name,
    grade: childData.grade,
  };

  // Load sessions for the week
  const sessionsSnap = await familyRef
    .collection("sessions")
    .where("childId", "==", childId)
    .where("date", ">=", weekKey)
    .where("date", "<=", weekEnd)
    .get();

  const sessions: SessionRecord[] = sessionsSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      streamId: d.streamId,
      result: d.result,
      date: d.date,
      durationSeconds: d.durationSeconds,
      supports: d.supports,
    };
  });

  // Load hours for the week
  const hoursSnap = await familyRef
    .collection("hours")
    .where("childId", "==", childId)
    .where("date", ">=", weekKey)
    .where("date", "<=", weekEnd)
    .get();

  const hours: HoursRecord[] = hoursSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      minutes: d.minutes,
      subjectBucket: d.subjectBucket,
      date: d.date,
    };
  });

  // Load daily plans for the week
  const plansSnap = await familyRef
    .collection("dailyPlans")
    .where("childId", "==", childId)
    .where("date", ">=", weekKey)
    .where("date", "<=", weekEnd)
    .get();

  const dailyPlans: DailyPlanRecord[] = plansSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      date: d.date,
      energy: d.energy,
      planType: d.planType,
      sessions: d.sessions ?? [],
    };
  });

  // Count school days (Mon–Fri) with no sessions and no daily plan
  const activeDates = new Set([
    ...sessions.map((s) => s.date),
    ...dailyPlans.map((p) => p.date),
  ]);
  let missedDays = 0;
  for (let i = 0; i < 5; i++) {
    const dateStr = addDays(weekKey, i);
    if (!activeDates.has(dateStr)) {
      missedDays++;
    }
  }

  return { child, weekKey, sessions, hours, dailyPlans, missedDays };
}

// ── Prompt building ─────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are the learning assistant for the Barnes family homeschool. You serve
two parents (Shelly and Nathan) and two boys (Lincoln, 10, and London, 6).

CHARTER VALUES (non-negotiable):
- Faith first: identity comes from God, not performance.
- No shame: correct behavior without attacking identity. Fast repair.
- Courage + perseverance: hard things in small steps; mistakes are feedback.
- Rest by design: margin and pacing are part of the plan, not signs of failure.
- Portfolio over grades: evidence of growth matters more than scores.
- Adventure matters: movement, building, discovery are core curriculum.

OPERATING PRINCIPLES:
- Shelly has fibromyalgia. Energy management is real. Never frame a low-energy
  day as failure. The Minimum Viable Day is real school.
- Lincoln has speech and neurodivergence challenges. Keep instructions short,
  visual, and predictable. Celebrate small wins. Never pressure reading aloud.
- London is story-driven and attention-seeking. Activities must be interactive
  and engaging. Passive busywork will fail.
- Shelly's direct attention is the primary resource. Plans must account for
  split-block scheduling.

TONE:
- Warm, encouraging, practical. Never clinical or condescending.
- Speak as a knowledgeable partner, not an authority figure.
- When suggesting changes, explain the "why" briefly.
- Default to "both modes count as real school" framing.`;

export function buildEvaluationPrompt(ctx: WeekContext): string {
  // Summarize sessions by stream
  const streamResults: Record<string, { hits: number; nears: number; misses: number }> = {};
  for (const s of ctx.sessions) {
    if (!streamResults[s.streamId]) {
      streamResults[s.streamId] = { hits: 0, nears: 0, misses: 0 };
    }
    const bucket = streamResults[s.streamId];
    if (s.result === "hit") bucket.hits++;
    else if (s.result === "near") bucket.nears++;
    else if (s.result === "miss") bucket.misses++;
  }

  const sessionSummary = Object.entries(streamResults)
    .map(([stream, r]) => `  - ${stream}: ${r.hits} hits, ${r.nears} nears, ${r.misses} misses`)
    .join("\n");

  // Summarize hours by subject
  const hoursBySubject: Record<string, number> = {};
  let totalMinutes = 0;
  for (const h of ctx.hours) {
    const key = h.subjectBucket ?? "Other";
    hoursBySubject[key] = (hoursBySubject[key] ?? 0) + h.minutes;
    totalMinutes += h.minutes;
  }
  const hoursSummary = Object.entries(hoursBySubject)
    .map(([subject, mins]) => `  - ${subject}: ${mins} min`)
    .join("\n");

  // Summarize energy states
  const energyCounts: Record<string, number> = {};
  for (const p of ctx.dailyPlans) {
    energyCounts[p.energy] = (energyCounts[p.energy] ?? 0) + 1;
  }
  const energySummary = Object.entries(energyCounts)
    .map(([level, count]) => `${level}: ${count} days`)
    .join(", ");

  // Summarize plan types
  const planTypeCounts: Record<string, number> = {};
  for (const p of ctx.dailyPlans) {
    planTypeCounts[p.planType] = (planTypeCounts[p.planType] ?? 0) + 1;
  }
  const planTypeSummary = Object.entries(planTypeCounts)
    .map(([pt, count]) => `${pt}: ${count} days`)
    .join(", ");

  return `Generate a weekly review for ${ctx.child.name} for the week of ${ctx.weekKey}.

DATA PROVIDED:
- Sessions completed: ${ctx.sessions.length}
${sessionSummary || "  (none)"}
- Total hours logged: ${Math.round(totalMinutes / 60 * 10) / 10} hours (${totalMinutes} min)
${hoursSummary || "  (none)"}
- Energy states: ${energySummary || "no data"}
- Plan types: ${planTypeSummary || "no data"}
- Missed school days (Mon–Fri): ${ctx.missedDays}
- Daily plans recorded: ${ctx.dailyPlans.length}

GENERATE a JSON object with these fields:
1. "progressSummary": 2-3 sentence narrative of the week (warm, encouraging tone). Be specific about what ${ctx.child.name} actually did.
2. "paceAdjustments": array of objects { "subject", "currentPace", "suggestedChange" } for any subject off-pace. Empty array if all on track.
3. "planModifications": array of objects { "area", "observation", "recommendation" } if patterns suggest a change. Empty array if none.
4. "energyPattern": one sentence noting energy trends and proactive suggestions. If energy data is sparse, note that.
5. "celebration": one specific thing to celebrate with ${ctx.child.name} this week.

TONE: Speak to the parent as a trusted partner. Frame everything constructively.
Never use language that implies failure. "We might try..." not "You should..."

Respond ONLY with valid JSON. No markdown, no preamble, no explanation outside the JSON structure.`;
}

// ── Parse AI response ───────────────────────────────────────────

interface ReviewPayload {
  progressSummary: string;
  paceAdjustments: PaceAdjustment[];
  planModifications: PlanModification[];
  energyPattern: string;
  celebration: string;
}

export function parseReviewResponse(text: string): ReviewPayload {
  const parsed = sanitizeAndParseJson<Record<string, unknown>>(text);

  return {
    progressSummary: String(parsed.progressSummary ?? ""),
    paceAdjustments: Array.isArray(parsed.paceAdjustments)
      ? parsed.paceAdjustments.map((a: Record<string, unknown>) => ({
          subject: String(a.subject ?? ""),
          currentPace: String(a.currentPace ?? ""),
          suggestedChange: String(a.suggestedChange ?? ""),
        }))
      : [],
    planModifications: Array.isArray(parsed.planModifications)
      ? parsed.planModifications.map((m: Record<string, unknown>) => ({
          area: String(m.area ?? ""),
          observation: String(m.observation ?? ""),
          recommendation: String(m.recommendation ?? ""),
        }))
      : [],
    energyPattern: String(parsed.energyPattern ?? ""),
    celebration: String(parsed.celebration ?? ""),
  };
}

// ── Generate review for one child ───────────────────────────────

export async function generateReviewForChild(
  familyId: string,
  ctx: WeekContext,
  apiKey: string,
): Promise<WeeklyReview> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const model = "claude-sonnet-4-20250514";

  const userPrompt = buildEvaluationPrompt(ctx);

  const completion = await client.messages.create({
    model,
    max_tokens: 2048,
    system: BASE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const responseText =
    completion.content[0].type === "text" ? completion.content[0].text : "";

  const payload = parseReviewResponse(responseText);

  const usage = {
    inputTokens: completion.usage.input_tokens,
    outputTokens: completion.usage.output_tokens,
  };

  // Store review in Firestore
  const db = getFirestore();
  const reviewData: WeeklyReview = {
    childId: ctx.child.id,
    weekKey: ctx.weekKey,
    status: "draft",
    progressSummary: payload.progressSummary,
    paceAdjustments: payload.paceAdjustments,
    planModifications: payload.planModifications,
    energyPattern: payload.energyPattern,
    celebration: payload.celebration,
    model,
    usage,
    createdAt: new Date().toISOString(),
  };

  await db
    .collection(`families/${familyId}/weeklyReviews`)
    .add(reviewData);

  // Log AI usage
  await db.collection(`families/${familyId}/aiUsage`).add({
    childId: ctx.child.id,
    taskType: "weekly-review",
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    createdAt: new Date().toISOString(),
  });

  return reviewData;
}

// ── On-demand callable (Generate Now) ───────────────────────────

export const generateWeeklyReviewNow = onCall(
  { secrets: [claudeApiKey] },
  async (request) => {
    const { familyId, childId, weekKey } = request.data as {
      familyId?: string;
      childId?: string;
      weekKey?: string;
    };

    if (!familyId || !childId || !weekKey) {
      throw new HttpsError(
        "invalid-argument",
        "familyId, childId, and weekKey are required.",
      );
    }

    const apiKey = claudeApiKey.value();
    const ctx = await assembleWeekContext(familyId, childId, weekKey);
    await generateReviewForChild(familyId, ctx, apiKey);

    return { success: true };
  },
);

// ── Scheduled Cloud Function ────────────────────────────────────

export const weeklyReview = onSchedule(
  {
    schedule: "every sunday 19:00",
    timeZone: "America/Chicago",
    secrets: [claudeApiKey],
  },
  async () => {
    const db = getFirestore();
    const weekKey = lastWeekKey(new Date());
    const apiKey = claudeApiKey.value();

    // Get all families
    const familiesSnap = await db.collection("families").get();

    for (const familyDoc of familiesSnap.docs) {
      const familyId = familyDoc.id;

      // Get all children in this family
      const childrenSnap = await familyDoc.ref.collection("children").get();

      for (const childDoc of childrenSnap.docs) {
        const childId = childDoc.id;

        try {
          const ctx = await assembleWeekContext(familyId, childId, weekKey);
          await generateReviewForChild(familyId, ctx, apiKey);
        } catch (err) {
          console.error(
            `Failed to generate weekly review for family=${familyId} child=${childId}:`,
            err,
          );
        }
      }
    }
  },
);
