/**
 * Task: learnerSynthesis  (FEAT-57, Learner Model Phase 3a — the judgment layer)
 *
 * The single Sonnet beat that turns a child's deterministic Learner Model (concept
 * states + evidence trails, written by the seeder / Review Chat / quest write-back)
 * into the parent-facing judgment layer: `whatMattersNext`, a `narrative` growth
 * story, and an `openQuestionsSummary` (design §3.4 / §3.6 / §3.5).
 *
 * This file is PURE + unit-tested: it shapes the synthesis INPUT from a stored
 * model + the server graph summary (`buildSynthesisInput`), assembles the prompt
 * (`buildSynthesisPrompt`), and parses the strict-JSON reply (`parseSynthesisResponse`).
 * The Firestore read/write + Claude call live in the orchestrator
 * (`../learnerSynthesis.ts`) so the LLM plumbing stays out of the pure layer.
 *
 * Design rules encoded here:
 * - **The LLM explains, it never reorders.** Candidate moves are ranked
 *   deterministically (frontier-first, `underlies` fan-out tiebreak — the 2a
 *   ordering, mirrored server-side) and handed to the model in that order.
 * - **§14 display rules (LOCKED):** no band numbers, no percentages/raw scores in
 *   generated text — asserted in `learnerSynthesis.test.ts`.
 * - **No-shame rails:** terrain not deficit, never "behind," never logging-guilt.
 */
import { CHARTER_PREAMBLE } from "../contextSlices.js";
import { sanitizeAndParseJson } from "../sanitizeJson.js";
import {
  FOUNDATION_SUMMARY_MAP,
  FOUNDATION_SUMMARY_NODES,
  summaryNodesForDomain,
  type FoundationSummaryNode,
} from "../data/foundationsGraphSummary.js";

// ── Minimal server-side view of the stored model ────────────────
// The functions build can't import the client `LearnerModel` type, so we mirror
// only the fields the synthesis reads (a read-only projection).

export interface StoredEvidenceRef {
  kind: string;
  note?: string;
  observedAt?: string;
  source?: string;
}
export interface StoredConceptState {
  state: "solid" | "forming" | "frontier" | "not-yet";
  evidence?: StoredEvidenceRef[];
}
export interface StoredModalityEntry {
  level?: number;
  note: string;
}
export interface StoredOpenQuestion {
  conceptId: string;
  question?: string;
  routedTo?: string;
  reason?: string;
  resolvedAt?: string;
}
export interface StoredChangeEntry {
  conceptId: string;
  from: string;
  to: string;
  cause: string;
  at: string;
}
export interface StoredLearnerModel {
  childId?: string;
  status?: string;
  conceptStates?: Record<string, StoredConceptState>;
  modalityCalibration?: {
    reading?: StoredModalityEntry;
    writing?: StoredModalityEntry;
    math?: StoredModalityEntry;
  };
  changeFeed?: StoredChangeEntry[];
  openQuestions?: StoredOpenQuestion[];
}

// ── Deterministic candidate ordering (mirrors reviewPriority.ts) ──

const STATE_TIER: Record<string, number> = {
  frontier: 0,
  forming: 1,
  "not-yet": 2,
};

function bandRank(band: string): number {
  const first = band.split("-")[0];
  return first === "K" ? 0 : Number(first);
}

/** Transitive `underlies` fan-out per node (memoized DFS over in-domain edges). */
export function computeFanOut(nodes: FoundationSummaryNode[]): Record<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, Set<string>>();
  const descendants = (id: string, seen: Set<string>): Set<string> => {
    const cached = memo.get(id);
    if (cached) return cached;
    const out = new Set<string>();
    const node = byId.get(id);
    if (!node || seen.has(id)) return out;
    seen.add(id);
    for (const child of node.underlies) {
      if (!byId.has(child)) continue;
      out.add(child);
      for (const d of descendants(child, seen)) out.add(d);
    }
    seen.delete(id);
    memo.set(id, out);
    return out;
  };
  const result: Record<string, number> = {};
  for (const node of nodes) result[node.id] = descendants(node.id, new Set()).size;
  return result;
}

/**
 * Frontier-first candidate order for `whatMattersNext` within one domain: frontier
 * before forming before not-yet, then `underlies` fan-out (desc), band (earlier
 * first), id (stable). `solid` is excluded — we don't propose what's already solid.
 */
export function orderMoveCandidates(
  nodes: FoundationSummaryNode[],
  states: Record<string, StoredConceptState>,
): FoundationSummaryNode[] {
  const fanOut = computeFanOut(nodes);
  const stateOf = (id: string): string => states[id]?.state ?? "not-yet";
  return nodes
    .filter((n) => stateOf(n.id) !== "solid")
    .filter((n) => stateOf(n.id) in STATE_TIER)
    .sort((a, b) => {
      const ta = STATE_TIER[stateOf(a.id)];
      const tb = STATE_TIER[stateOf(b.id)];
      if (ta !== tb) return ta - tb;
      if (fanOut[b.id] !== fanOut[a.id]) return fanOut[b.id] - fanOut[a.id];
      const ba = bandRank(a.band);
      const bb = bandRank(b.band);
      if (ba !== bb) return ba - bb;
      return a.id.localeCompare(b.id);
    });
}

// ── Synthesis input (the LLM's structured context) ──────────────

export interface DomainSynthesisView {
  domain: string;
  frontier: Array<{ conceptId: string; kidName: string; description: string; evidence: string[] }>;
  forming: Array<{ conceptId: string; kidName: string; description: string; evidence: string[] }>;
  recentSolid: Array<{ conceptId: string; kidName: string; evidenceKinds: string[] }>;
  /** Ordered candidate ids for `whatMattersNext` (frontier-first). */
  moveCandidates: Array<{ conceptId: string; kidName: string; description: string; state: string }>;
}

export interface SynthesisInput {
  childName: string;
  domains: DomainSynthesisView[];
  modality: { reading?: string; writing?: string; math?: string };
  recentChanges: string[];
  openQuestions: Array<{ conceptId: string; kidName: string; question: string }>;
}

const DOMAINS = ["reading", "math"] as const;

/**
 * Strip band/level numbers and percentages from internal note text before it
 * enters the prompt, so the LLM can't echo a §14-forbidden number. Source units
 * like "Fast Phonics Peak 13" are explicitly allowed (§14.3) and are left intact —
 * only the working-level coordinate ("working level 4"), bare "band N", and "N%"
 * are scrubbed.
 */
export function sanitizeTerrainText(text: string): string {
  return text
    .replace(/\b(?:working\s+)?level\s+\d+/gi, "the working edge")
    .replace(/\bband\s+\d+/gi, "here")
    .replace(/\b\d+\s*%/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeMaybe(text: string | undefined): string | undefined {
  return text ? sanitizeTerrainText(text) : undefined;
}

function evidenceNotes(cs: StoredConceptState | undefined): string[] {
  return (cs?.evidence ?? [])
    .map((e) => (e.note ? sanitizeTerrainText(e.note) : e.kind))
    .filter(Boolean) as string[];
}

/**
 * Shape a stored model into the compact synthesis input. Pure over the model + the
 * static graph summary — no Firestore, no LLM. `maxRecentChanges` caps the change
 * feed tail handed to the model (D6 cost ceiling).
 */
export function buildSynthesisInput(
  model: StoredLearnerModel,
  childName: string,
  opts: { maxRecentChanges?: number; maxCandidatesPerDomain?: number } = {},
): SynthesisInput {
  const maxChanges = opts.maxRecentChanges ?? 20;
  const maxCandidates = opts.maxCandidatesPerDomain ?? 8;
  const states = model.conceptStates ?? {};

  const domains: DomainSynthesisView[] = DOMAINS.map((domain) => {
    const nodes = summaryNodesForDomain(domain);
    const frontier: DomainSynthesisView["frontier"] = [];
    const forming: DomainSynthesisView["forming"] = [];
    const recentSolid: DomainSynthesisView["recentSolid"] = [];
    for (const n of nodes) {
      const cs = states[n.id];
      const st = cs?.state ?? "not-yet";
      if (st === "frontier") {
        frontier.push({ conceptId: n.id, kidName: n.kidName, description: n.parentDescription, evidence: evidenceNotes(cs) });
      } else if (st === "forming") {
        forming.push({ conceptId: n.id, kidName: n.kidName, description: n.parentDescription, evidence: evidenceNotes(cs) });
      } else if (st === "solid") {
        recentSolid.push({
          conceptId: n.id,
          kidName: n.kidName,
          evidenceKinds: Array.from(new Set((cs?.evidence ?? []).map((e) => e.kind))),
        });
      }
    }
    const moveCandidates = orderMoveCandidates(nodes, states)
      .slice(0, maxCandidates)
      .map((n) => ({
        conceptId: n.id,
        kidName: n.kidName,
        description: n.parentDescription,
        state: states[n.id]?.state ?? "not-yet",
      }));
    return { domain, frontier, forming, recentSolid, moveCandidates };
  });

  const recentChanges = (model.changeFeed ?? [])
    .slice(-maxChanges)
    .map((c) => {
      const kid = FOUNDATION_SUMMARY_MAP[c.conceptId]?.kidName ?? c.conceptId;
      return `"${kid}": ${c.from} → ${c.to} (${sanitizeTerrainText(c.cause)})`;
    });

  const openQuestions = (model.openQuestions ?? [])
    .filter((q) => !q.resolvedAt)
    .map((q) => ({
      conceptId: q.conceptId,
      kidName: FOUNDATION_SUMMARY_MAP[q.conceptId]?.kidName ?? q.conceptId,
      question: q.question ?? "waiting on a quick check",
    }));

  return {
    childName,
    domains,
    modality: {
      reading: sanitizeMaybe(model.modalityCalibration?.reading?.note),
      writing: sanitizeMaybe(model.modalityCalibration?.writing?.note),
      math: sanitizeMaybe(model.modalityCalibration?.math?.note),
    },
    recentChanges,
    openQuestions,
  };
}

// ── Prompt assembly ─────────────────────────────────────────────

/** §14 locked display rules — shared string so the test can pin it. */
export const SYNTHESIS_DISPLAY_RULES = `DISPLAY RULES (LOCKED — never break these in anything you write):
- NEVER write a band number, grade level, or "level N". Use the plain concept names only.
- NEVER write a percentage or a raw score-count (no "80%", no "3 of 350"). Name evidence in plain words instead ("two sources agree", "from the June check", "Fast Phonics", "you confirmed it").
- Frame everything as TERRAIN, never deficit: "not yet" means "we haven't seen it," never "behind" or "can't". Never imply the parent should have logged, tracked, or done more.`;

function renderDomain(v: DomainSynthesisView): string {
  const line = (c: { kidName: string; description: string; evidence?: string[] }) => {
    const ev = c.evidence && c.evidence.length ? ` [evidence: ${c.evidence.join("; ")}]` : "";
    return `    - "${c.kidName}" — ${c.description}${ev}`;
  };
  const parts: string[] = [`${v.domain.toUpperCase()}:`];
  parts.push(`  Working edge (frontier):${v.frontier.length ? "\n" + v.frontier.map(line).join("\n") : " (none)"}`);
  parts.push(`  Forming (partial evidence):${v.forming.length ? "\n" + v.forming.map(line).join("\n") : " (none)"}`);
  parts.push(
    `  Recently solid:${
      v.recentSolid.length
        ? "\n" + v.recentSolid.map((c) => `    - "${c.kidName}" (from: ${c.evidenceKinds.join(", ") || "derived"})`).join("\n")
        : " (none)"
    }`,
  );
  parts.push(
    `  NEXT-MOVE CANDIDATES for this domain, already ranked best-first — pick from THESE, keep this order, DO NOT reorder:${
      v.moveCandidates.length
        ? "\n" + v.moveCandidates.map((c) => `    [${c.conceptId}] "${c.kidName}" — ${c.description} (${c.state})`).join("\n")
        : " (none)"
    }`,
  );
  return parts.join("\n");
}

/** Assemble the full system prompt for one child's synthesis. Pure. */
export function buildSynthesisPrompt(input: SynthesisInput): string {
  const name = input.childName || "this child";
  const domainBlocks = input.domains.map(renderDomain).join("\n\n");
  const modalityLines = [
    input.modality.reading ? `- Reading: ${input.modality.reading}` : "",
    input.modality.writing ? `- Writing: ${input.modality.writing}` : "",
    input.modality.math ? `- Math: ${input.modality.math}` : "",
  ].filter(Boolean).join("\n");
  const changeLines = input.recentChanges.length
    ? input.recentChanges.map((c) => `- ${c}`).join("\n")
    : "- (nothing has moved since the last synthesis)";
  const askLines = input.openQuestions.length
    ? input.openQuestions.map((q) => `- "${q.kidName}": ${q.question}`).join("\n")
    : "- (no open questions right now)";

  return `${CHARTER_PREAMBLE}

You are the LEARNING ENGINE synthesizing where ${name} is in reading and math from the family's own captured evidence. You do NOT reassess or grade — you read the terrain below (already derived) and write the small judgment layer a parent reads: the next moves, a short growth story, and a plain-language line per open question.

${SYNTHESIS_DISPLAY_RULES}

THE TERRAIN (derived deterministically — do not re-derive, do not contradict it):

${domainBlocks}

HOW ${name.toUpperCase()} LEARNS BEST (modality — reflect this in your "why" when it matters):
${modalityLines || "- (no modality signal yet)"}

WHAT MOVED RECENTLY (the change feed — cite convergent evidence when two sources agree):
${changeLines}

OPEN QUESTIONS (asks already routed to kid-facing checks — summarize each in parent language):
${askLines}

YOUR TASK — return ONE JSON object, no prose outside it, exactly this shape:
{
  "whatMattersNext": [
    {
      "conceptId": "<one of the NEXT-MOVE CANDIDATE ids above, keeping their order>",
      "why": "2-3 plain sentences a parent can read, citing the evidence — e.g. 'Two sources agree: Fast Phonics and his quest on Tuesday.' Say WHY it's the next move (what's solid underneath it).",
      "suggestedVehicle": "routine | play | project | dadLab | quest"
    }
  ],
  "narrative": "3-5 sentences: the growth story since last time. Terrain, not deficit. Celebrate convergent evidence explicitly. Never say 'behind'. Never guilt the parent about logging.",
  "openQuestionsSummary": ["<one plain-language line per open question above, or [] if none>"]
}

RULES FOR whatMattersNext:
- 1 to 3 moves total, drawn ONLY from the NEXT-MOVE CANDIDATE lists, in the order they appear (frontier before forming before not-yet). You EXPLAIN and pick a vehicle; you do NOT reorder or invent concepts.
- suggestedVehicle: 'quest' for a quick check, 'routine' for daily practice, 'play' for a game, 'project' for a build, 'dadLab' for a hands-on investigation. Match the move to how ${name} learns best.
- If there are no candidates at all, return an empty whatMattersNext array and say so warmly in the narrative.
Return only the JSON.`;
}

// ── Response parsing (strict, with a null fallback) ─────────────

const VEHICLES = new Set(["routine", "play", "project", "dadLab", "quest"]);

export interface ParsedSynthesis {
  whatMattersNext: Array<{ conceptId: string; kidName: string; why: string; suggestedVehicle: string }>;
  narrative: string;
  openQuestionsSummary: string[];
}

/**
 * Parse the model's JSON reply into a validated synthesis, or `null` if it is
 * unparseable / malformed. Null ⇒ the orchestrator writes nothing and the prior
 * synthesis stands (deterministic fallback — a synthesis failure never breaks a
 * consumer). Unknown conceptIds are dropped; vehicles are validated; `kidName` is
 * filled deterministically from the graph summary (never trusted from the LLM).
 */
export function parseSynthesisResponse(text: string): ParsedSynthesis | null {
  let raw: unknown;
  try {
    raw = sanitizeAndParseJson(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.narrative !== "string" || !obj.narrative.trim()) return null;

  const movesIn = Array.isArray(obj.whatMattersNext) ? obj.whatMattersNext : [];
  const whatMattersNext: ParsedSynthesis["whatMattersNext"] = [];
  for (const m of movesIn) {
    if (!m || typeof m !== "object") continue;
    const mm = m as Record<string, unknown>;
    const conceptId = typeof mm.conceptId === "string" ? mm.conceptId : "";
    const node = FOUNDATION_SUMMARY_MAP[conceptId];
    if (!node) continue; // never invent a concept the graph doesn't have
    const why = typeof mm.why === "string" ? mm.why.trim() : "";
    if (!why) continue;
    const vehicleRaw = typeof mm.suggestedVehicle === "string" ? mm.suggestedVehicle : "";
    const suggestedVehicle = VEHICLES.has(vehicleRaw) ? vehicleRaw : "routine";
    whatMattersNext.push({ conceptId, kidName: node.kidName, why, suggestedVehicle });
    if (whatMattersNext.length >= 3) break;
  }

  const summaryIn = Array.isArray(obj.openQuestionsSummary) ? obj.openQuestionsSummary : [];
  const openQuestionsSummary = summaryIn
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());

  return { whatMattersNext, narrative: obj.narrative.trim(), openQuestionsSummary };
}

/** Total node count — a tiny export so tests can sanity-check the summary import. */
export const SYNTHESIS_NODE_COUNT = FOUNDATION_SUMMARY_NODES.length;
