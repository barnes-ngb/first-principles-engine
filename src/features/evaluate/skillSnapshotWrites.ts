import { doc, getDoc, setDoc } from 'firebase/firestore'

import { skillSnapshotsCollection } from '../../core/firebase/firestore'
import type {
  ConceptualBlock,
  ConceptualBlockSource,
  ConceptualBlockStatus,
  PrioritySkill,
  QuestActivity,
  QuestActivityMarker,
  SkillSnapshot,
  StopRule,
  SupportDefault,
  WorkingLevel,
  WorkingLevels,
} from '../../core/types/evaluation'
import { MasteryGate, SkillLevel } from '../../core/types/enums'
import { effectiveStatus, generateBlockId } from '../../core/utils/blockerLifecycle'

/**
 * Centralized, additive write-through into `skillSnapshots` (the FUNC-01
 * authority for "what to teach next").
 *
 * Per the FUNC-01 ruling (`docs/review/DECISION_FUNC-01_source_of_truth.md`),
 * a curriculum scan advances `childSkillMaps` / `activityConfigs` but must also
 * fold its mastered skills into the Skill Snapshot so the two stores cannot
 * silently disagree. This module is that write-through seam (FUNC-02).
 *
 * It also carries the **additive, evidence-stamped edit ops** (Build 6a /
 * Tier C Option 2) the Shelly portal uses to *add* to a child's snapshot by
 * chat (confirm-gated in 6b): append priority skills / supports / stop rules,
 * each stamped as a parent directive. These ops are **additive-only** — they
 * never remove or downgrade. Removals / downgrades are deliberately out of
 * scope (the future Option 3, which needs a separate human-authoritative
 * override path).
 *
 * Since UX-383 it also carries the **working-level restore** — the one op here
 * that writes `workingLevels`, and the one the owner authorised on 2026-09-11 so
 * a level a handwriting scan pushed down could be put back. It is upgrade-only
 * for exactly the reason everything else here is additive: it may raise a level
 * and can never lower one.
 *
 * ARCH-12: this module is the intended convergence point for the three inline
 * snapshot writers (`EvaluateChatPage`, `useQuestSession`, `SkillSnapshotPage`).
 * They are not migrated here yet — tracked separately as ARCH-12.
 *
 * `applyToSnapshot` is a pure reducer; `writeSnapshotUpdate` is the thin
 * Firestore writer that reads-merges-writes around it.
 */

/** Describes the mastered-skill signal a scan (or other source) contributes. */
export interface SnapshotApplyUpdate {
  /** Skills the source reports as mastered/covered (free text). */
  masteredSkills: string[]
  /**
   * When true, advance matched blocks straight to `RESOLVED` (the milestone
   * marks the skill mastered). Otherwise advance them to `RESOLVING`.
   *
   * **It governs the conceptual-BLOCK branch only** — see
   * {@link SnapshotApplyUpdate.skipPrioritySkillLevels} for why that mattered
   * and what a caller does about it.
   */
  fullyMastered?: boolean
  /**
   * Treat {@link SnapshotApplyUpdate.masteredSkills} as a **progress** signal
   * rather than a mastery one: matched conceptual blocks still advance (to
   * `RESOLVING`, per `fullyMastered`), and matched priority skills keep the
   * level they have (UX-187).
   *
   * **Additive and opt-in. Absent — as it is at every existing call site — this
   * changes nothing**: the FUNC-02 scan write-through, `commitMasteryRollup`,
   * the quest session and the certificate paths all behave byte-for-byte as
   * before, and no stored value moves.
   *
   * It exists because `fullyMastered` reached only one of the two branches this
   * update drives. The priority-skill fold below never consulted it and wrote
   * `SkillLevel.Secure` / `MasteryGate.IndependentConsistent` — the app's top
   * rating, the same value a completed guided evaluation writes — for *any*
   * matched skill. So Ask AI's `markSkillProgress` card reading *"Mark 'CVCe
   * long vowels' as **progressing** for Lincoln"* recorded full mastery, and
   * every downstream reader that gates on level (planner priority targeting,
   * quest targeting, Knowledge Mine access) then treated a forming skill as
   * finished. The word "progressing" appeared on the card and nowhere in the
   * write.
   *
   * Naming the flag for what it *skips* keeps the additive-only contract
   * legible: it can only cause **fewer** fields to move, never more, so it can
   * never downgrade a level and never removes anything. Lowering a level stays
   * out of scope — that is the future Option 3 override path.
   */
  skipPrioritySkillLevels?: boolean
  /** What produced this write (recorded as the block's `lastSource`). */
  source?: ConceptualBlockSource
  /** Short evidence string appended to any block this update touches. */
  evidence?: string
  /** ISO timestamp; defaults to now. Pass a fixed value in tests. */
  at?: string

  // ── Additive edit ops (Build 6a / Tier C Option 2) ──────────────────
  // All append-only: each new entry is deduped against what already exists
  // and stamped as a parent directive (see `directive`). They never remove or
  // downgrade an existing entry, and never touch RESOLVED/DEFER blocks.

  /** Priority-skill labels to append (only if not already present, matched on slug). */
  addPrioritySkills?: string[]
  /** Support labels to append as new {@link SupportDefault} entries (dedup'd by label). */
  addSupports?: string[]
  /** Stop-rule labels to append as new {@link StopRule} entries (dedup'd by label). */
  addStopRules?: string[]
  /**
   * Provenance note for the additive edits above. Required-in-spirit whenever
   * any `add*` field is present: every appended entry is stamped so the
   * snapshot records that the edit came from a parent directive. Pass the
   * parent's own words to make the stamp specific; otherwise a generic
   * `parent directive via chat — <at>` stamp is recorded.
   */
  directive?: string

  // ── Quest activity marker (visibility-only; additive, separate from levels) ──
  /**
   * Record a per-domain "last mined" marker (see {@link QuestActivityMarker}).
   * Purely additive visibility: it writes only `questActivity[domain]` and never
   * touches `workingLevels`, the level value, never-downgrade, or manual logic.
   * Unlike the mastered-skill path this is **not** idempotent — each sufficient
   * quest overwrites the domain's marker (last-write-wins) so `lastQuestAt`
   * always reflects the most recent counted run.
   */
  recordQuestActivity?: {
    domain: keyof QuestActivity
    marker: QuestActivityMarker
  }

  // ── Working-level restore (UX-383; owner decision 2026-09-11) ───────────
  /**
   * Put back a working level a scan overwrote downwards, derived from stored
   * evidence (`src/features/settings/restoreScanLoweredLevels.ts`).
   *
   * **This is the only op in this module that writes `workingLevels`**, and it
   * keeps the additive-only contract rather than bending it: it lands **only
   * when the restored level is strictly HIGHER** than the one standing, so it
   * can raise a number a handwriting page pushed down and can never lower one.
   * A restore that would not raise is a no-op, which is also what makes the
   * one-shot idempotent. Removals and downgrades remain out of scope (the
   * future Option 3 override path).
   *
   * The writer merges **only this key**, never the whole `workingLevels` map,
   * so a level another device wrote between the read and the write survives.
   */
  restoreWorkingLevel?: {
    key: keyof WorkingLevels
    level: WorkingLevel
  }
}

export interface ApplyResult {
  snapshot: SkillSnapshot
  /** True when the update actually mutated a block, priority skill, support, or stop rule. */
  changed: boolean
  /**
   * Per-field change breakdown, so the writer can persist only what changed.
   * (The mastered-skill path mutates `prioritySkills`/`conceptualBlocks`; the
   * additive ops can also touch `supports`/`stopRules`.)
   */
  changedFields: {
    prioritySkills: boolean
    conceptualBlocks: boolean
    supports: boolean
    stopRules: boolean
    questActivity: boolean
    /** UX-383 — the single restored `workingLevels` key, or false. */
    workingLevel: keyof WorkingLevels | false
  }
}

/** Ordered lifecycle ranks. Higher = more resolved. Used to never downgrade. */
const STATUS_RANK: Record<ConceptualBlockStatus, number> = {
  ADDRESS_NOW: 0,
  RESOLVING: 1,
  RESOLVED: 2,
  // DEFER is a parent decision to set a block aside — not part of the
  // address→resolve path. Scans never advance a deferred block.
  DEFER: 0,
}

/** Append an evidence snippet, de-duplicating against the existing string. */
function appendEvidence(existing: string | undefined, addition: string | undefined): string | undefined {
  if (!addition) return existing
  if (!existing) return addition
  if (existing.includes(addition)) return existing
  return `${existing} | ${addition}`
}

/** True if any mastered-skill slug matches this block's id/name/affectedSkills. */
function matchesMastered(block: ConceptualBlock, masteredIds: Set<string>): boolean {
  if (block.id && masteredIds.has(block.id)) return true
  if (block.name && masteredIds.has(generateBlockId(block.name))) return true
  return (block.affectedSkills ?? []).some((s) => masteredIds.has(generateBlockId(s)))
}

/**
 * Build the evidence stamp recorded on every additive edit (6a). Always marks
 * the entry as a parent directive; folds in the caller's own words when given.
 */
function directiveStamp(directive: string | undefined, at: string): string {
  const base = `parent directive via chat — ${at}`
  const note = directive?.trim()
  return note ? `${note} (${base})` : base
}

/**
 * Pure reducer: fold a mastered-skill update into a snapshot.
 *
 * Guarantees (the FUNC-02 contract):
 * - **Additive / never downgrades** — a block only moves to a *higher*
 *   lifecycle rank; `RESOLVED` and `DEFER` blocks are left untouched.
 * - **Block-merging by stable id** — matched only by slugified skill name.
 * - **No-op when nothing matches** — returns `changed: false` and the snapshot
 *   unchanged.
 * - **Tolerates a missing snapshot** — accepts `null`/`undefined`/partial and
 *   normalizes it.
 * - **Idempotent** — re-applying the same update advances nothing further, so
 *   repeated scans don't oscillate or keep bumping counters.
 */
export function applyToSnapshot(
  existing: Partial<SkillSnapshot> | null | undefined,
  update: SnapshotApplyUpdate,
): ApplyResult {
  const now = update.at ?? new Date().toISOString()
  const base: SkillSnapshot = {
    childId: existing?.childId ?? '',
    prioritySkills: existing?.prioritySkills ?? [],
    supports: existing?.supports ?? [],
    stopRules: existing?.stopRules ?? [],
    evidenceDefinitions: existing?.evidenceDefinitions ?? [],
    conceptualBlocks: existing?.conceptualBlocks ?? [],
    workingLevels: existing?.workingLevels,
    questActivity: existing?.questActivity,
    completedPrograms: existing?.completedPrograms,
    blocksUpdatedAt: existing?.blocksUpdatedAt,
    createdAt: existing?.createdAt,
    updatedAt: existing?.updatedAt,
  }

  const mastered = (update.masteredSkills ?? []).map((s) => s.trim()).filter(Boolean)
  const masteredIds = new Set(mastered.map(generateBlockId))

  const targetStatus: ConceptualBlockStatus = update.fullyMastered ? 'RESOLVED' : 'RESOLVING'

  // ── Advance matched conceptual blocks ──────────────────────────────
  let blocksChanged = false
  const nextBlocks = (base.conceptualBlocks ?? []).map((block) => {
    if (mastered.length === 0) return block
    if (!matchesMastered(block, masteredIds)) return block
    const current = effectiveStatus(block)
    // Only advance active blocks; never reopen RESOLVED or override DEFER.
    if (current !== 'ADDRESS_NOW' && current !== 'RESOLVING') return block
    if (STATUS_RANK[targetStatus] <= STATUS_RANK[current]) return block
    blocksChanged = true
    return {
      ...block,
      status: targetStatus,
      resolvedAt: targetStatus === 'RESOLVED' ? (block.resolvedAt ?? now) : block.resolvedAt,
      evidence: appendEvidence(block.evidence, update.evidence),
      lastReinforcedAt: now,
      sessionCount: (block.sessionCount ?? 1) + 1,
      lastSource: update.source ?? block.lastSource ?? block.source,
    }
  })

  // ── Fold mastered signal into priority-skill status (never downgrading) ──
  // Skipped whole when the caller declared this a PROGRESS signal (UX-187):
  // this branch has only one destination — `Secure` — so a claim that is not a
  // mastery claim has nothing truthful to write here, and the blocks above have
  // already recorded the movement as `RESOLVING`.
  let skillsChanged = false
  let nextSkills = base.prioritySkills.map((skill) => {
    if (mastered.length === 0) return skill
    if (update.skipPrioritySkillLevels) return skill
    const skillId = generateBlockId(skill.label || String(skill.tag))
    if (!skillId || !masteredIds.has(skillId)) return skill
    const gate = skill.masteryGate ?? MasteryGate.NotYet
    if (gate >= MasteryGate.IndependentConsistent && skill.level === SkillLevel.Secure) return skill
    skillsChanged = true
    return {
      ...skill,
      level: SkillLevel.Secure,
      masteryGate: MasteryGate.IndependentConsistent,
    }
  })

  // ── Additive edit ops (6a): append priority skills / supports / stop rules ──
  // Each entry is deduped against what already exists, stamped as a parent
  // directive, and appended — never replacing, removing, or downgrading.
  const stamp = directiveStamp(update.directive, now)

  // Priority skills — match on slugified label/tag (like the block matcher).
  // A newly *flagged* priority is appended at the lowest level: it asserts
  // "teach this next", never a mastery claim, so it can't downgrade anything.
  let addedSkills = false
  const skillSlugs = new Set(nextSkills.map((s) => generateBlockId(s.label || String(s.tag))))
  for (const raw of update.addPrioritySkills ?? []) {
    const text = raw.trim()
    if (!text) continue
    const slug = generateBlockId(text)
    if (skillSlugs.has(slug)) continue
    skillSlugs.add(slug)
    const newSkill: PrioritySkill = {
      tag: slug,
      label: text,
      level: SkillLevel.Emerging,
      masteryGate: MasteryGate.NotYet,
      notes: stamp,
    }
    nextSkills = [...nextSkills, newSkill]
    addedSkills = true
  }

  // Supports — dedup by normalized label.
  let supportsChanged = false
  let nextSupports = base.supports
  const supportKeys = new Set(nextSupports.map((s) => s.label.trim().toLowerCase()))
  for (const raw of update.addSupports ?? []) {
    const text = raw.trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (supportKeys.has(key)) continue
    supportKeys.add(key)
    const newSupport: SupportDefault = { label: text, description: stamp }
    nextSupports = [...nextSupports, newSupport]
    supportsChanged = true
  }

  // Stop rules — dedup by normalized label. The directive stamp lands in
  // `action` (the field a single free-text directive maps onto); `trigger`
  // is left blank for a human to fill on the snapshot page.
  let stopRulesChanged = false
  let nextStopRules = base.stopRules
  const stopRuleKeys = new Set(nextStopRules.map((r) => r.label.trim().toLowerCase()))
  for (const raw of update.addStopRules ?? []) {
    const text = raw.trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (stopRuleKeys.has(key)) continue
    stopRuleKeys.add(key)
    const newStopRule: StopRule = { label: text, trigger: '', action: stamp }
    nextStopRules = [...nextStopRules, newStopRule]
    stopRulesChanged = true
  }

  // ── Quest activity marker (visibility-only) ─────────────────────────
  // Additive write to a separate `questActivity[domain]` slot. Never touches
  // `workingLevels`, the level value, never-downgrade, or manual logic. Always
  // a change when present (last-write-wins — it carries a fresh `lastQuestAt`).
  let activityChanged = false
  let nextQuestActivity: QuestActivity | undefined = base.questActivity
  if (update.recordQuestActivity) {
    const { domain, marker } = update.recordQuestActivity
    nextQuestActivity = { ...(base.questActivity ?? {}), [domain]: marker }
    activityChanged = true
  }

  // ── Working-level restore (UX-383) — upgrade-only ───────────────────
  // The one place this module writes `workingLevels`. It lands only when it
  // RAISES the standing level, so it cannot downgrade (the module's contract)
  // and a second run of the one-shot writes nothing.
  let restoredKey: keyof WorkingLevels | false = false
  let nextWorkingLevels: WorkingLevels | undefined = base.workingLevels
  if (update.restoreWorkingLevel) {
    const { key, level } = update.restoreWorkingLevel
    const standing = base.workingLevels?.[key]
    if (!standing || level.level > standing.level) {
      nextWorkingLevels = { ...(base.workingLevels ?? {}), [key]: level }
      restoredKey = key
    }
  }

  const prioritySkillsChanged = skillsChanged || addedSkills
  const changed =
    blocksChanged ||
    prioritySkillsChanged ||
    supportsChanged ||
    stopRulesChanged ||
    activityChanged ||
    restoredKey !== false
  const snapshot: SkillSnapshot = {
    ...base,
    prioritySkills: nextSkills,
    supports: nextSupports,
    stopRules: nextStopRules,
    conceptualBlocks: nextBlocks,
    questActivity: nextQuestActivity,
    workingLevels: nextWorkingLevels,
    ...(blocksChanged ? { blocksUpdatedAt: now } : {}),
    ...(changed ? { updatedAt: now } : {}),
  }
  return {
    snapshot,
    changed,
    changedFields: {
      prioritySkills: prioritySkillsChanged,
      conceptualBlocks: blocksChanged,
      supports: supportsChanged,
      stopRules: stopRulesChanged,
      questActivity: activityChanged,
      workingLevel: restoredKey,
    },
  }
}

/**
 * Thin Firestore writer around {@link applyToSnapshot}. Reads the current
 * snapshot, applies the update, and writes back only when something changed.
 * Tolerates a missing snapshot doc (treats it as empty and merges).
 */
export async function writeSnapshotUpdate(
  familyId: string,
  childId: string,
  update: SnapshotApplyUpdate,
): Promise<{ changed: boolean }> {
  const ref = doc(skillSnapshotsCollection(familyId), childId)
  const snap = await getDoc(ref)
  const existing: Partial<SkillSnapshot> = snap.exists() ? snap.data() : {}
  const { snapshot, changed, changedFields } = applyToSnapshot({ ...existing, childId }, update)
  if (!changed) return { changed: false }

  // A working-level restore that changed nothing else writes ONLY that key
  // (UX-383). The arrays below are rewritten wholesale, which is right when they
  // are what moved and needless when they are not — and a restore never touches
  // them, so it has no business re-sending a read that may already be stale.
  if (changedFields.workingLevel && !changedFields.prioritySkills &&
      !changedFields.conceptualBlocks && !changedFields.supports &&
      !changedFields.stopRules && !changedFields.questActivity) {
    await setDoc(
      ref,
      JSON.parse(
        JSON.stringify({
          childId,
          // Merge the single key, never the whole map: Firestore merges a nested
          // map leaf by leaf, so a sibling level written meanwhile survives.
          workingLevels: { [changedFields.workingLevel]: snapshot.workingLevels?.[changedFields.workingLevel] },
          updatedAt: snapshot.updatedAt,
        }),
      ),
      { merge: true },
    )
    return { changed: true }
  }

  // Always merge-write prioritySkills + conceptualBlocks (the mastered-skill
  // path); additionally write supports / stopRules only when an additive edit
  // touched them (6a). Read-merge-write, skip when nothing changed.
  const payload: Record<string, unknown> = {
    childId,
    prioritySkills: snapshot.prioritySkills,
    conceptualBlocks: snapshot.conceptualBlocks,
    blocksUpdatedAt: snapshot.blocksUpdatedAt,
    updatedAt: snapshot.updatedAt,
  }
  if (changedFields.workingLevel) {
    payload.workingLevels = {
      [changedFields.workingLevel]: snapshot.workingLevels?.[changedFields.workingLevel],
    }
  }
  if (changedFields.supports) payload.supports = snapshot.supports
  if (changedFields.stopRules) payload.stopRules = snapshot.stopRules
  // Visibility-only activity marker — write the separate `questActivity` slot
  // only when it changed. It never includes `workingLevels`; the single
  // restore key above is the one op in this module that does.
  if (changedFields.questActivity) payload.questActivity = snapshot.questActivity

  await setDoc(
    ref,
    // Strip undefined (Firestore rejects it) — matches the codebase pattern.
    JSON.parse(JSON.stringify(payload)),
    { merge: true },
  )
  return { changed: true }
}
