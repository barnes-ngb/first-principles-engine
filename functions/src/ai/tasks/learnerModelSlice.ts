/**
 * The `learnerModel` context slice (FEAT-57, Phase 3a — the consumption re-point).
 *
 * `buildLearnerModelSlice` distills a stored Learner Model into ~300-500 tokens of
 * parent-facing prompt context: per-domain frontier / forming-with-source /
 * recently-solid concepts (kid-names, no band numbers), the modality calibration,
 * and the synthesized `whatMattersNext`. It is the single coherent "where is this
 * child" section that `shellyChat` and `plan` read instead of reconstructing the
 * frontier from eight smeared slices (design §5).
 *
 * PURE + unit-tested. It **reads** the stored model — it never regenerates the
 * synthesis (D6: consumers serve stored, never synthesize on a read path). §14
 * display rules apply: band/level numbers and percentages are scrubbed
 * (`sanitizeTerrainText`); source units like "Fast Phonics Peak 13" survive.
 */
import { FOUNDATION_SUMMARY_MAP, summaryNodesForDomain } from "../data/foundationsGraphSummary.js";
import { sanitizeTerrainText, type StoredConceptState, type StoredLearnerModel } from "./learnerSynthesis.js";

const DOMAINS = [
  { key: "reading", label: "READING" },
  { key: "math", label: "MATH" },
] as const;

/** The best evidence one-liner for a concept, source-first, §14-scrubbed. */
function evidenceLine(cs: StoredConceptState | undefined): string {
  const ev = cs?.evidence ?? [];
  if (ev.length === 0) return "";
  // Prefer a curriculumPosition (names an external source) or attestation.
  const preferred =
    ev.find((e) => e.kind === "curriculumPosition") ??
    ev.find((e) => e.kind === "attestation") ??
    ev[ev.length - 1];
  const note = preferred.note ? sanitizeTerrainText(preferred.note) : "";
  if (preferred.kind === "curriculumPosition") {
    const src = preferred.source ? ` (covered in ${preferred.source}, not yet verified)` : " (covered, not yet verified)";
    return note ? `${note}${src}` : src.trim();
  }
  return note;
}

function conceptLine(nodeId: string, cs: StoredConceptState | undefined): string {
  const node = FOUNDATION_SUMMARY_MAP[nodeId];
  const name = node?.kidName ?? nodeId;
  const ev = evidenceLine(cs);
  return ev ? `"${name}" — ${ev}` : `"${name}"`;
}

/**
 * Build the compact `learnerModel` prompt section for one child. Returns "" when
 * there is no usable model (caller omits the section entirely).
 */
export function buildLearnerModelSlice(model: StoredLearnerModel | null | undefined): string {
  if (!model || model.status === "no-data") return "";
  const states = model.conceptStates ?? {};
  if (Object.keys(states).length === 0) return "";

  const lines: string[] = [
    "LEARNER MODEL — the synthesized read of where this child is in reading & math.",
    "Ground any level / curriculum / \"what should we work on or buy\" answer in THIS section, and name the evidence behind a level claim. It covers reading & math ONLY — for other subjects (science, handwriting, etc.) say the model doesn't cover them rather than guessing.",
  ];

  for (const { key, label } of DOMAINS) {
    const nodes = summaryNodesForDomain(key);
    const frontier: string[] = [];
    const forming: string[] = [];
    const solid: string[] = [];
    for (const n of nodes) {
      const cs = states[n.id];
      const st = cs?.state ?? "not-yet";
      if (st === "frontier") frontier.push(conceptLine(n.id, cs));
      else if (st === "forming") forming.push(conceptLine(n.id, cs));
      else if (st === "solid") {
        const node = FOUNDATION_SUMMARY_MAP[n.id];
        const kinds = Array.from(new Set((cs?.evidence ?? []).map((e) => e.kind)));
        solid.push(`"${node?.kidName ?? n.id}"${kinds.length ? ` (${kinds.join(", ")})` : ""}`);
      }
    }
    if (!frontier.length && !forming.length && !solid.length) continue;
    const block: string[] = [`${label}:`];
    if (frontier.length) block.push(`  Working edge: ${frontier.join("; ")}`);
    if (forming.length) block.push(`  Forming (partial — verify before treating as mastered): ${forming.join("; ")}`);
    if (solid.length) block.push(`  Solid: ${solid.slice(0, 12).join("; ")}`);
    lines.push(block.join("\n"));
  }

  // Modality calibration (how the child learns best) — §14-scrubbed.
  const mc = model.modalityCalibration;
  const modality = [
    mc?.reading?.note ? `Reading — ${sanitizeTerrainText(mc.reading.note)}` : "",
    mc?.writing?.note ? `Writing — ${sanitizeTerrainText(mc.writing.note)}` : "",
    mc?.math?.note ? `Math — ${sanitizeTerrainText(mc.math.note)}` : "",
  ].filter(Boolean);
  if (modality.length) lines.push(`How this child learns best: ${modality.join(" · ")}`);

  // Synthesized next moves (if a synthesis has run).
  const moves = model.synthesis?.whatMattersNext ?? [];
  if (moves.length) {
    const moveLines = moves.map((m) => {
      const name = m.kidName || FOUNDATION_SUMMARY_MAP[m.conceptId]?.kidName || m.conceptId;
      const via = m.suggestedVehicle ? ` [${m.suggestedVehicle}]` : "";
      return `  - "${name}"${via}: ${sanitizeTerrainText(m.why)}`;
    });
    lines.push(`What matters next:\n${moveLines.join("\n")}`);
  }

  return lines.join("\n\n");
}
