import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireEmailAuth } from "../authGuard.js";
import { claudeApiKey } from "../aiConfig.js";

// ── Types ────────────────────────────────────────────────────────

interface AnalyzePatternsRequest {
  familyId: string;
  childId: string;
  evaluationSessionId: string;
  currentFindings: Array<{
    skill: string;
    status: string;
    evidence: string;
    notes?: string;
  }>;
}

interface ConceptualBlockResult {
  name: string;
  affectedSkills: string[];
  recommendation: "ADDRESS_NOW" | "DEFER";
  rationale: string;
  strategies?: string[];
  deferNote?: string;
  detectedAt: string;
  evaluationSessionId: string;
}

interface AnalyzePatternsResponse {
  blocks: ConceptualBlockResult[];
  summary: string;
}

// ── Prompt ───────────────────────────────────────────────────────

function buildPatternAnalysisPrompt(
  _childName: string,
  childAge: number | null,
  neurodivergentDesc: string,
): string {
  const ageStr = childAge ? `${childAge} years old` : "school age";
  const ndStr = neurodivergentDesc
    ? ` The child has: ${neurodivergentDesc}.`
    : "";

  return `You are an educational diagnostician helping a homeschool parent understand patterns in their child's learning.

The child is ${ageStr}.${ndStr}

You have been given:
- Findings from today's evaluation
- Historical evaluation sessions (last several sessions)
- Current skill snapshot

Your job is to identify CONCEPTUAL BLOCKS — foundational gaps that explain multiple surface-level struggles. For each block you identify:

1. Name the block clearly (e.g. "Phonological awareness", "Working memory load", "Sound-symbol correspondence")
2. List which skills it appears to affect
3. Give a clear recommendation: ADDRESS NOW or DEFER
   - ADDRESS NOW: if it's foundational and blocking progress on multiple fronts
   - DEFER: if it's a developmental gap that may resolve naturally, or requires specialist support beyond homeschool scope
4. If ADDRESS NOW: suggest 1-2 concrete strategies appropriate for homeschool
5. If DEFER: suggest what to circle back to and approximately when (e.g. "revisit at age 8", "after sight words are stable")

Respond ONLY in this JSON format:
{
  "blocks": [
    {
      "name": string,
      "affectedSkills": string[],
      "recommendation": "ADDRESS_NOW" | "DEFER",
      "rationale": string,
      "strategies": string[],
      "deferNote": string
    }
  ],
  "summary": string
}

Identify 1-3 blocks maximum. If no clear pattern exists, return an empty blocks array.
Do not speculate beyond what the data supports.
Use plain, jargon-free language — a homeschool parent reads these, not a specialist.
Do NOT diagnose clinical conditions — identify patterns and suggest strategies only.
ADDRESS_NOW blocks must always include a non-empty strategies array.
DEFER blocks must always include a non-empty deferNote string.`;
}

// ── Cloud Function ───────────────────────────────────────────────

export const analyzeEvaluationPatterns = onCall(
  { secrets: [claudeApiKey] },
  async (request): Promise<AnalyzePatternsResponse> => {
    const { uid } = requireEmailAuth(request);

    const { familyId, childId, evaluationSessionId, currentFindings } =
      request.data as AnalyzePatternsRequest;

    if (!familyId || typeof familyId !== "string") {
      throw new HttpsError("invalid-argument", "familyId is required.");
    }
    if (!childId || typeof childId !== "string") {
      throw new HttpsError("invalid-argument", "childId is required.");
    }
    if (!evaluationSessionId || typeof evaluationSessionId !== "string") {
      throw new HttpsError("invalid-argument", "evaluationSessionId is required.");
    }
    if (!Array.isArray(currentFindings)) {
      throw new HttpsError("invalid-argument", "currentFindings must be an array.");
    }

    if (uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    const db = getFirestore();

    // Load last 5 completed evaluation sessions for this child
    const histSnap = await db
      .collection(`families/${familyId}/evaluationSessions`)
      .where("childId", "==", childId)
      .where("status", "==", "complete")
      .orderBy("evaluatedAt", "desc")
      .limit(5)
      .get();

    // Skip the current session (it may already be saved as complete)
    const historicalSessions = histSnap.docs
      .filter((d) => d.id !== evaluationSessionId)
      .map((d) => d.data() as {
        domain?: string;
        evaluatedAt?: string;
        summary?: string;
        findings?: Array<{ skill: string; status: string; evidence: string; notes?: string }>;
        recommendations?: Array<{ skill: string; action: string }>;
      });

    // Need at least 2 historical sessions (excluding current) to detect patterns
    if (historicalSessions.length < 2) {
      return {
        blocks: [],
        summary: "Not enough evaluation history to detect patterns yet.",
      };
    }

    // Load child profile
    const childSnap = await db
      .doc(`families/${familyId}/children/${childId}`)
      .get();
    const childData = childSnap.exists
      ? (childSnap.data() as { name?: string; birthdate?: string; grade?: string })
      : {};

    const childName = childData.name ?? "the child";
    let childAge: number | null = null;
    if (childData.birthdate) {
      const birth = new Date(childData.birthdate);
      childAge = Math.floor(
        (Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      );
    }

    // Build neurodivergent description from known child profiles
    const neurodivergentDesc = childName.toLowerCase() === "lincoln"
      ? "speech challenges, neurodivergent, benefits from short routines and frequent wins"
      : "";

    // Assemble context for the AI
    const historicalContext = historicalSessions
      .map((s, i) => {
        const findings = (s.findings || [])
          .map((f) => `  - ${f.skill}: ${f.status} (${f.evidence})`)
          .join("\n");
        return `Session ${i + 1} (${s.domain || "unknown"}, ${s.evaluatedAt?.slice(0, 10) || "unknown date"}):
Summary: ${s.summary || "no summary"}
Findings:
${findings || "  (none)"}`;
      })
      .join("\n\n");

    const currentFindingsText = currentFindings
      .map((f) => `  - ${f.skill}: ${f.status} (${f.evidence}${f.notes ? ` — ${f.notes}` : ""})`)
      .join("\n");

    const userMessage = `Today's evaluation findings:
${currentFindingsText}

Historical evaluation sessions (${historicalSessions.length} prior sessions):
${historicalContext}

Please identify any conceptual blocks in the pattern above.`;

    const systemPrompt = buildPatternAnalysisPrompt(childName, childAge, neurodivergentDesc);
    const model = "claude-sonnet-4-6";

    const apiKey = claudeApiKey.value();
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "Missing CLAUDE_API_KEY secret.",
      );
    }

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const completion = await client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const firstBlock = completion.content[0];
    const responseText =
      firstBlock && firstBlock.type === "text" ? firstBlock.text : "";

    console.log(`[AI] taskType=analyzePatterns inputTokens≈${completion.usage.input_tokens} outputTokens≈${completion.usage.output_tokens}`);

    // Log usage
    try {
      await db.collection(`families/${familyId}/aiUsage`).add({
        childId,
        taskType: "analyzePatterns",
        model,
        inputTokens: completion.usage.input_tokens,
        outputTokens: completion.usage.output_tokens,
        createdAt: new Date().toISOString(),
      });
    } catch (logErr) {
      console.warn("Failed to log AI usage:", logErr);
    }

    // Parse the response
    let parsed: { blocks: ConceptualBlockResult[]; summary: string };
    try {
      // Strip markdown fences if present
      const cleaned = responseText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const raw = JSON.parse(cleaned) as {
        blocks?: Array<{
          name?: string;
          affectedSkills?: string[];
          recommendation?: string;
          rationale?: string;
          strategies?: string[];
          deferNote?: string;
        }>;
        summary?: string;
      };
      const now = new Date().toISOString();

      const blocks: ConceptualBlockResult[] = (raw.blocks || [])
        .slice(0, 3)
        .map((b) => {
          const rec = b.recommendation === "ADDRESS_NOW" ? "ADDRESS_NOW" : "DEFER";
          const result: ConceptualBlockResult = {
            name: b.name || "Unknown block",
            affectedSkills: b.affectedSkills || [],
            recommendation: rec,
            rationale: b.rationale || "",
            detectedAt: now,
            evaluationSessionId,
          };
          if (rec === "ADDRESS_NOW" && b.strategies?.length) {
            result.strategies = b.strategies;
          } else if (rec === "ADDRESS_NOW") {
            result.strategies = ["Consult with a specialist for targeted strategies."];
          }
          if (rec === "DEFER" && b.deferNote) {
            result.deferNote = b.deferNote;
          } else if (rec === "DEFER") {
            result.deferNote = "Revisit when foundational skills are more stable.";
          }
          return result;
        });

      parsed = { blocks, summary: raw.summary || "" };
    } catch {
      console.warn("Failed to parse pattern analysis response:", responseText);
      parsed = { blocks: [], summary: "" };
    }

    return parsed;
  },
);
