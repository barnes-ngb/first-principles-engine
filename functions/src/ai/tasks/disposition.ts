import type { Firestore } from "firebase-admin/firestore";
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";

/**
 * Task: disposition
 * Context: charter + childProfile + engagement + gradeResults (via buildContextForTask)
 *          + specialized 4-week day log aggregation, recent evaluations, recent lab reports
 * Model: Sonnet
 */

// ── Data loaders ──────────────────────────────────────────────

interface DayLogEntry {
  date: string;
  totalItems: number;
  completedItems: number;
  engagement: Record<string, number>;
  minutesBySubject: Record<string, number>;
  gradeResults: string[];
  evidenceCount: number;
}

async function loadRecentDayLogs(
  db: Firestore,
  familyId: string,
  childId: string,
  weeks: number,
): Promise<DayLogEntry[]> {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - weeks * 7);
  const startStr = start.toISOString().slice(0, 10);

  const snap = await db
    .collection(`families/${familyId}/days`)
    .where("date", ">=", startStr)
    .get();

  return snap.docs
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
        if (item.gradeResult) gradeResults.push(`${item.label}: ${item.gradeResult}`);
        if (item.evidenceArtifactId) evidenceCount++;
      }

      return {
        date: d.date as string,
        totalItems: checklist.length,
        completedItems: checklist.filter((i) => i.completed).length,
        engagement,
        minutesBySubject,
        gradeResults,
        evidenceCount,
      } as DayLogEntry;
    })
    .filter((d): d is DayLogEntry => d !== null);
}

async function loadRecentEvaluations(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<string> {
  const snap = await db
    .collection(`families/${familyId}/evaluationSessions`)
    .where("childId", "==", childId)
    .where("status", "==", "complete")
    .orderBy("evaluatedAt", "desc")
    .limit(3)
    .get();

  if (snap.empty) return "No recent evaluation sessions.";

  return snap.docs
    .map((doc) => {
      const d = doc.data();
      const findings = Array.isArray(d.findings)
        ? (d.findings as Array<{ text?: string }>).map((f) => f.text ?? "").filter(Boolean).join("; ")
        : "";
      return `${d.domain ?? "unknown"} (${d.evaluatedAt ?? "?"}): ${findings || "no findings"}`;
    })
    .join("\n");
}

async function loadRecentLabReports(
  db: Firestore,
  familyId: string,
  childId: string,
): Promise<string> {
  const snap = await db
    .collection(`families/${familyId}/dadLabReports`)
    .where("status", "==", "completed")
    .orderBy("completedAt", "desc")
    .limit(5)
    .get();

  if (snap.empty) return "No recent lab reports.";

  return snap.docs
    .map((doc) => {
      const d = doc.data();
      const childContrib = Array.isArray(d.contributions)
        ? (d.contributions as Array<{ childId?: string; prediction?: string; explanation?: string }>)
            .filter((c) => c.childId === childId)
        : [];
      const hasPrediction = childContrib.some((c) => c.prediction);
      const hasExplanation = childContrib.some((c) => c.explanation);
      return `Lab: ${d.title ?? "untitled"} (${d.completedAt ?? "?"})${hasPrediction ? " [predicted]" : ""}${hasExplanation ? " [explained]" : ""}`;
    })
    .join("\n");
}

// ── Weekly aggregation ────────────────────────────────────────

interface WeekAggregate {
  weekLabel: string;
  daysLogged: number;
  completionRate: number;
  totalEvidence: number;
  engagement: Record<string, number>;
  subjects: string[];
}

function aggregateByWeek(dayLogs: DayLogEntry[]): WeekAggregate[] {
  const weekMap = new Map<string, DayLogEntry[]>();
  for (const log of dayLogs) {
    const d = new Date(log.date + "T00:00:00");
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(d);
    monday.setDate(d.getDate() - diff);
    const key = monday.toISOString().slice(0, 10);
    const existing = weekMap.get(key) ?? [];
    existing.push(log);
    weekMap.set(key, existing);
  }

  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekKey, logs]) => {
      const totalItems = logs.reduce((s, l) => s + l.totalItems, 0);
      const completedItems = logs.reduce((s, l) => s + l.completedItems, 0);
      const totalEvidence = logs.reduce((s, l) => s + l.evidenceCount, 0);
      const engagement: Record<string, number> = {};
      const subjectSet = new Set<string>();
      for (const log of logs) {
        for (const [eng, count] of Object.entries(log.engagement)) {
          engagement[eng] = (engagement[eng] ?? 0) + count;
        }
        for (const subj of Object.keys(log.minutesBySubject)) {
          subjectSet.add(subj);
        }
      }
      return {
        weekLabel: weekKey,
        daysLogged: logs.length,
        completionRate: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
        totalEvidence,
        engagement,
        subjects: Array.from(subjectSet),
      };
    });
}

// ── Main handler ──────────────────────────────────────────────

export const handleDisposition = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, apiKey } = ctx;
  const model = modelForTask("disposition" as never);

  // Load shared context (charter + child profile + engagement + grade results)
  const contextSections = await buildContextForTask("disposition", {
    db,
    familyId,
    childId,
    childData,
    snapshotData: ctx.snapshotData,
  });
  const familyContext = contextSections.join("\n\n");

  // Load specialized data in parallel (beyond what buildContextForTask provides)
  const [dayLogs, evalSummary, labSummary] = await Promise.all([
    loadRecentDayLogs(db, familyId, childId, 4),
    loadRecentEvaluations(db, familyId, childId),
    loadRecentLabReports(db, familyId, childId),
  ]);

  const weekAggregates = aggregateByWeek(dayLogs);

  const weekSummary = weekAggregates
    .map((w) => {
      const engStr = Object.entries(w.engagement).map(([k, v]) => `${k}:${v}`).join(", ");
      return `  ${w.weekLabel}: ${w.daysLogged} days, ${w.completionRate}% completion, ${w.totalEvidence} evidence, engagement: ${engStr || "none"}, subjects: ${w.subjects.join(", ") || "none"}`;
    })
    .join("\n");

  const systemPrompt = `${familyContext}

You are generating a Learning Disposition Profile for ${childData.name}. This is a portfolio-over-grades assessment that looks at HOW a child approaches learning, not what they can pass on a test.

FIVE DISPOSITIONS TO ASSESS:

1. **Curiosity (Wonder)**: Does the child ask questions, explore new topics, show interest beyond requirements?
   Observable signals: variety of subjects engaged with, evidence artifacts created voluntarily, engagement ratings of "engaged", new topics explored.

2. **Persistence (Build)**: Does the child stick with hard things, complete tasks, return to challenges?
   Observable signals: completion rates, engagement with struggled items (returning vs refusing), consistency across days, time spent on harder subjects.

3. **Articulation (Explain)**: Can the child express what they've learned, teach others, narrate their thinking?
   Observable signals: grade results with explanations, teach-back artifacts, narration quality, lab report explanations.

4. **Self-Awareness (Reflect)**: Does the child recognize their own patterns, energy, and needs?
   Observable signals: engagement self-reports, retro notes, evidence of choosing appropriate difficulty, recognizing when to stop.

5. **Ownership (Share)**: Does the child take initiative, contribute to family learning, share discoveries?
   Observable signals: manual checklist additions, evidence artifacts initiated by child, lab predictions, project notes.

LEVEL VALUES:
- "growing": Clear, consistent evidence across multiple days/weeks
- "steady": Some evidence, fairly consistent but not strong
- "emerging": Early signs visible but inconsistent
- "not-yet-visible": Insufficient data or no clear signals (this is NOT failure — just thin data)

TREND VALUES:
- "up": Improving over the 4-week window
- "stable": Roughly the same
- "down": Declining (frame gently — fatigue and seasons are real)
- "insufficient-data": Not enough data points to determine trend

OUTPUT FORMAT (JSON only):
{
  "profileDate": "YYYY-MM-DD",
  "periodWeeks": 4,
  "dispositions": {
    "curiosity": { "level": "...", "narrative": "2-3 sentences about what you see", "trend": "..." },
    "persistence": { "level": "...", "narrative": "...", "trend": "..." },
    "articulation": { "level": "...", "narrative": "...", "trend": "..." },
    "selfAwareness": { "level": "...", "narrative": "...", "trend": "..." },
    "ownership": { "level": "...", "narrative": "...", "trend": "..." }
  },
  "celebration": "One warm, specific thing to celebrate about this child's learning disposition",
  "nudge": "One gentle, practical suggestion for the coming weeks (not criticism)",
  "parentNote": "A warm note to Shelly about what you see in this child's learning journey"
}

TONE:
- Portfolio over grades. Diamonds, not scores.
- Never shame. Thin data is honestly reported, not padded.
- Rest by design. A light week is not failure.
- Be specific — cite actual data patterns, not generic encouragements.

Respond ONLY with valid JSON.`;

  const userMessage = `Generate a learning disposition profile for ${childData.name}.

WEEKLY AGGREGATES (last 4 weeks):
${weekSummary || "(no day log data)"}

RECENT EVALUATION SESSIONS:
${evalSummary}

RECENT LAB REPORTS:
${labSummary}

Total day logs in period: ${dayLogs.length}`;

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 4096,
    systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  await logAiUsage(db, familyId, {
    childId,
    taskType: "disposition",
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    createdAt: new Date().toISOString(),
  });

  return {
    message: result.text,
    model,
    usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
  };
};
