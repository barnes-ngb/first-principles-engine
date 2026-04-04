import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireEmailAuth } from "./authGuard.js";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { claudeApiKey } from "./aiConfig.js";
import { CHARTER_PREAMBLE } from "./contextSlices.js";
import { sanitizeAndParseJson } from "./sanitizeJson.js";
import { callClaude, logAiUsage } from "./chatTypes.js";
import { modelForTask } from "./chat.js";

// ── Types ───────────────────────────────────────────────────────

export interface WeeklyReviewDoc {
  childId: string;
  weekKey: string;
  status: string;
  celebration: string;
  summary: string;
  wins: string[];
  growthAreas: string[];
  paceAdjustments: Array<{
    id: string; area: string; currentPace: string;
    suggestedPace: string; rationale: string; decision: string;
  }>;
  recommendations: string[];
  energyPattern: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  createdAt: string;
}

interface ChildProfile {
  id: string;
  name: string;
  grade?: string;
}

interface DayLogSummary {
  date: string;
  totalItems: number;
  completedItems: number;
  engagement: Record<string, number>;
  minutesBySubject: Record<string, number>;
  gradeResults: string[];
  evidenceCount: number;
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
 * Return the Sunday-of-week date string for the most recent completed week.
 * The school week runs Sunday–Saturday. The scheduled review fires Sunday
 * evening, so lastWeekKey returns the previous Sunday (7 days ago on Sunday,
 * dayOfWeek+7 days ago otherwise).
 */
export function lastWeekKey(today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ...
  // Go back to the start of the PREVIOUS Sunday-based week
  // If today is Sunday (0), the previous week started 7 days ago
  // If today is Monday (1), the previous week started 8 days ago
  const offset = dayOfWeek === 0 ? 7 : dayOfWeek + 7;
  d.setDate(d.getDate() - offset);
  return formatDate(d);
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

interface BookActivity {
  title: string;
  childId: string;
  status: string;
  pageCount: number;
  bookType: string;
  theme?: string;
  completedThisWeek: boolean;
}

export interface WeekContext {
  child: ChildProfile;
  weekKey: string;
  dayLogs: DayLogSummary[];
  hours: HoursRecord[];
  dailyPlans: DailyPlanRecord[];
  missedDays: number;
  bookActivity: BookActivity[];
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

  // Load day logs for the week
  const daysSnap = await familyRef
    .collection("days")
    .where("date", ">=", weekKey)
    .where("date", "<=", weekEnd)
    .get();

  const dayLogs: DayLogSummary[] = daysSnap.docs
    .map((doc) => {
      const d = doc.data();
      if (d.childId !== childId) return null;
      const checklist = (d.checklist ?? []) as Array<{
        label: string; completed: boolean; engagement?: string;
        subjectBucket?: string; estimatedMinutes?: number;
        plannedMinutes?: number; gradeResult?: string;
        evidenceArtifactId?: string;
      }>;

      const engagement: Record<string, number> = {};
      const minutesBySubject: Record<string, number> = {};
      const gradeResults: string[] = [];
      let evidenceCount = 0;

      for (const item of checklist) {
        if (item.engagement) engagement[item.engagement] = (engagement[item.engagement] ?? 0) + 1;
        if (item.completed) {
          const mins = item.estimatedMinutes ?? item.plannedMinutes ?? 0;
          const bucket = item.subjectBucket ?? "Other";
          minutesBySubject[bucket] = (minutesBySubject[bucket] ?? 0) + mins;
        }
        if (item.gradeResult) gradeResults.push(item.label + ": " + item.gradeResult);
        if (item.evidenceArtifactId) evidenceCount++;
      }

      return {
        date: d.date as string, totalItems: checklist.length,
        completedItems: checklist.filter((i) => i.completed).length,
        engagement, minutesBySubject, gradeResults, evidenceCount,
      } as DayLogSummary;
    })
    .filter((d): d is DayLogSummary => d !== null);

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

  // Load book activity for the week
  const booksSnap = await familyRef
    .collection("books")
    .where("updatedAt", ">=", weekKey)
    .where("updatedAt", "<=", weekEnd + "T23:59:59")
    .get();

  const bookActivity: BookActivity[] = booksSnap.docs
    .map((d) => {
      const b = d.data();
      if (b.childId !== childId) return null;
      return {
        title: b.title as string,
        childId: b.childId as string,
        status: b.status as string,
        pageCount: (b.pages as unknown[])?.length ?? 0,
        bookType: (b.bookType as string) ?? "creative",
        theme: b.theme as string | undefined,
        completedThisWeek:
          b.status === "complete" &&
          (b.updatedAt as string) >= weekKey,
      };
    })
    .filter((b): b is BookActivity => b !== null);

  // Count school days (Sun–Thu) with no day logs and no daily plan
  const activeDates = new Set([
    ...dayLogs.map((d) => d.date),
    ...dailyPlans.map((p) => p.date),
  ]);
  let missedDays = 0;
  for (let i = 0; i < 5; i++) {
    const dateStr = addDays(weekKey, i);
    if (!activeDates.has(dateStr)) {
      missedDays++;
    }
  }

  return { child, weekKey, dayLogs, hours, dailyPlans, missedDays, bookActivity };
}

// ── Prompt building ─────────────────────────────────────────────

const WEEKLY_REVIEW_ADDENDUM = `
WEEKLY REVIEW ROLE:
You are generating a weekly review for the Barnes family homeschool. Analyze the week's data and provide actionable feedback.

REVIEW-SPECIFIC GUIDANCE:
- Never pressure Lincoln about reading aloud — celebrate willingness, not volume.
- London is attention-seeking; note when activities successfully engaged him vs when he disengaged.
- Look for disposition evidence in the engagement data and grade notes.
- When suggesting changes, explain the "why" briefly.
- Default to "both modes count as real school" framing.
- Warm, encouraging, practical tone. Never clinical or condescending.
- Speak as a knowledgeable partner, not an authority figure.
- Include disposition observations in the weekly summary alongside completion data.`;

const WEEKLY_REVIEW_SYSTEM_PROMPT = CHARTER_PREAMBLE + "\n" + WEEKLY_REVIEW_ADDENDUM;

export function buildEvaluationPrompt(ctx: WeekContext): string {
  // Compute week totals from dayLogs
  let totalItems = 0;
  let completedItems = 0;
  let totalEvidence = 0;
  const engagementTotals: Record<string, number> = {};
  const subjectMinutes: Record<string, number> = {};
  const allGradeResults: string[] = [];

  const perDayBreakdown: string[] = [];
  for (const day of ctx.dayLogs) {
    totalItems += day.totalItems;
    completedItems += day.completedItems;
    totalEvidence += day.evidenceCount;
    for (const [eng, count] of Object.entries(day.engagement)) {
      engagementTotals[eng] = (engagementTotals[eng] ?? 0) + count;
    }
    for (const [subj, mins] of Object.entries(day.minutesBySubject)) {
      subjectMinutes[subj] = (subjectMinutes[subj] ?? 0) + mins;
    }
    allGradeResults.push(...day.gradeResults);

    const completionPct = day.totalItems > 0
      ? Math.round((day.completedItems / day.totalItems) * 100) : 0;
    const engStr = Object.entries(day.engagement).map(([k, v]) => `${k}:${v}`).join(", ");
    perDayBreakdown.push(
      `  ${day.date}: ${day.completedItems}/${day.totalItems} items (${completionPct}%)${engStr ? `, engagement: ${engStr}` : ""}${day.evidenceCount > 0 ? `, ${day.evidenceCount} evidence` : ""}`
    );
  }

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

  // Energy data from daily plans
  const energyCounts: Record<string, number> = {};
  const planTypeCounts: Record<string, number> = {};
  for (const p of ctx.dailyPlans) {
    energyCounts[p.energy] = (energyCounts[p.energy] ?? 0) + 1;
    planTypeCounts[p.planType] = (planTypeCounts[p.planType] ?? 0) + 1;
  }
  const energySummary = Object.entries(energyCounts)
    .map(([level, count]) => `${level}: ${count} days`)
    .join(", ");
  const planTypeSummary = Object.entries(planTypeCounts)
    .map(([pt, count]) => `${pt}: ${count} days`)
    .join(", ");

  const subjectSummary = Object.entries(subjectMinutes)
    .map(([subj, mins]) => `  - ${subj}: ${mins} min`)
    .join("\n");

  const engagementSummary = Object.entries(engagementTotals)
    .map(([eng, count]) => `${eng}: ${count}`)
    .join(", ");

  return `Generate a weekly review for ${ctx.child.name} for the week of ${ctx.weekKey}.

DATA PROVIDED:
- Day logs recorded: ${ctx.dayLogs.length}
- Checklist completion: ${completedItems}/${totalItems} items
- Evidence artifacts captured: ${totalEvidence}
- Subject time from checklists:
${subjectSummary || "  (none)"}
- Engagement feedback: ${engagementSummary || "no data"}
${allGradeResults.length > 0 ? `- Grade results:\n${allGradeResults.map((r) => `  - ${r}`).join("\n")}` : ""}
- Hours logged: ${Math.round(totalMinutes / 60 * 10) / 10} hours (${totalMinutes} min)
${hoursSummary || "  (none)"}
- Energy states: ${energySummary || "no data"}
- Plan types: ${planTypeSummary || "no data"}
- Missed school days (Sun–Thu): ${ctx.missedDays}

## Book Activity This Week
${(ctx.bookActivity ?? []).length === 0 ? "No book activity this week." :
  (ctx.bookActivity ?? []).map((b) =>
    `- "${b.title}" (${b.bookType}, ${b.pageCount} pages, ${b.status}${b.completedThisWeek ? " — FINISHED THIS WEEK!" : ""})`
  ).join("\n")}

Per-day breakdown:
${perDayBreakdown.join("\n") || "  (no day logs)"}

GENERATE a JSON object with EXACTLY these fields:
{
  "celebration": "one specific thing to celebrate with ${ctx.child.name} this week",
  "summary": "2-3 sentence narrative of the week (warm, encouraging tone). Be specific about what ${ctx.child.name} actually did.",
  "wins": ["array of 2-4 specific wins from the data"],
  "growthAreas": ["array of 1-3 areas where gentle growth is emerging"],
  "paceAdjustments": [{"id": "unique-id", "area": "subject or skill area", "currentPace": "what's happening now", "suggestedPace": "what we might try", "rationale": "why this change makes sense"}],
  "recommendations": ["array of 1-3 practical next-week suggestions"],
  "energyPattern": "one sentence noting energy trends and proactive suggestions"
}

TONE:
- Warm partner, not authority. "We might try..." not "You should..."
- No shame. Rest by design. MVD is real school.
- Portfolio over grades — evidence of growth matters more than scores.
- If data is thin, say so honestly and keep recommendations light.
- Celebrate any books created or completed — they represent significant creative effort.
- Mention reading sessions and book creation as evidence of language arts engagement.

Respond ONLY with valid JSON. No markdown, no preamble, no explanation outside the JSON structure.`;
}

// ── Parse AI response ───────────────────────────────────────────

interface ReviewPayload {
  celebration: string;
  summary: string;
  wins: string[];
  growthAreas: string[];
  paceAdjustments: Array<{
    id: string; area: string; currentPace: string;
    suggestedPace: string; rationale: string;
  }>;
  recommendations: string[];
  energyPattern: string;
}

export function parseReviewResponse(text: string): ReviewPayload {
  const parsed = sanitizeAndParseJson<Record<string, unknown>>(text);

  return {
    celebration: String(parsed.celebration ?? ""),
    summary: String(parsed.summary ?? parsed.progressSummary ?? ""),
    wins: Array.isArray(parsed.wins)
      ? parsed.wins.map((w: unknown) => String(w))
      : [],
    growthAreas: Array.isArray(parsed.growthAreas)
      ? parsed.growthAreas.map((g: unknown) => String(g))
      : [],
    paceAdjustments: Array.isArray(parsed.paceAdjustments)
      ? parsed.paceAdjustments.map((a: Record<string, unknown>, i: number) => ({
          id: String(a.id ?? `adj-${i}`),
          area: String(a.area ?? a.subject ?? ""),
          currentPace: String(a.currentPace ?? ""),
          suggestedPace: String(a.suggestedPace ?? a.suggestedChange ?? ""),
          rationale: String(a.rationale ?? ""),
        }))
      : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((r: unknown) => String(r))
      : [],
    energyPattern: String(parsed.energyPattern ?? ""),
  };
}

// ── Generate review for one child ───────────────────────────────

export async function generateReviewForChild(
  familyId: string,
  ctx: WeekContext,
  apiKey: string,
): Promise<WeeklyReviewDoc> {
  // Skip AI call if there's no data for the week
  if (ctx.dayLogs.length === 0 && ctx.hours.length === 0) {
    const db = getFirestore();
    const emptyReview: WeeklyReviewDoc = {
      childId: ctx.child.id,
      weekKey: ctx.weekKey,
      status: "no-data",
      celebration: `No activities were logged for ${ctx.child.name} this week. That's okay — every week is different.`,
      summary: "No day logs or hours were recorded. Use the Today page during the week to build up data for next week's review.",
      wins: [],
      growthAreas: [],
      paceAdjustments: [],
      recommendations: ["Try logging at least 3 days on the Today page this week for a more useful review."],
      energyPattern: "No energy data recorded.",
      model: "none",
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: new Date().toISOString(),
    };
    const reviewDocId = `${ctx.weekKey}_${ctx.child.id}`;
    await db
      .collection(`families/${familyId}/weeklyReviews`)
      .doc(reviewDocId)
      .set(emptyReview);
    return emptyReview;
  }

  const model = modelForTask("weeklyReview");

  const userPrompt = buildEvaluationPrompt(ctx);

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 2048,
    systemPrompt: WEEKLY_REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const payload = parseReviewResponse(result.text);

  const usage = {
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };

  // Store review in Firestore
  const db = getFirestore();
  const reviewData: WeeklyReviewDoc = {
    childId: ctx.child.id,
    weekKey: ctx.weekKey,
    status: "draft",
    celebration: payload.celebration,
    summary: payload.summary,
    wins: payload.wins,
    growthAreas: payload.growthAreas,
    paceAdjustments: payload.paceAdjustments.map((a, i) => ({
      ...a, id: a.id || `adj-${i}`, decision: "pending",
    })),
    recommendations: payload.recommendations,
    energyPattern: payload.energyPattern,
    model,
    usage,
    createdAt: new Date().toISOString(),
  };

  const reviewDocId = `${ctx.weekKey}_${ctx.child.id}`;
  await db
    .collection(`families/${familyId}/weeklyReviews`)
    .doc(reviewDocId)
    .set(reviewData);

  // Log AI usage
  await logAiUsage(db, familyId, {
    childId: ctx.child.id,
    taskType: "weeklyReview",
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });

  return reviewData;
}

// ── On-demand callable (Generate Now) ───────────────────────────

export const generateWeeklyReviewNow = onCall(
  { secrets: [claudeApiKey] },
  async (request) => {
    const { uid } = requireEmailAuth(request);

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

    if (uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    const apiKey = claudeApiKey.value();
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "Missing CLAUDE_API_KEY secret.",
      );
    }

    try {
      const ctx = await assembleWeekContext(familyId, childId, weekKey);
      await generateReviewForChild(familyId, ctx, apiKey);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("generateWeeklyReviewNow failed:", {
        familyId,
        childId,
        weekKey,
        error: errMsg,
      });
      throw new HttpsError("internal", `Weekly review failed: ${errMsg}`);
    }

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
