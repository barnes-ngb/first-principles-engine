// ── Banner Rally — Stonebridge mission progress ───────────────────
//
// A mission *reflects* reading activity Lincoln already generates; it does NOT
// mint currency or touch the XP / forge / diamond economy. Progress is derived
// read-only from existing xpLedger reading events (BOOK_READ + QUEST_COMPLETE)
// and persisted here so the bar is stable across sessions.
//
// Canon (locations + characters) is reused verbatim from the Stonebridge Bible
// (docs/STONEBRIDGE_BIBLE.md / functions/src/ai/stonebridgeBible.ts). No new
// canon is invented here.

/** Derived progress counters for the currently active mission. */
export interface StonebridgeMissionProgress {
  /** Mission these counters belong to. */
  missionId: string
  /** Reading actions credited toward this mission (clamped to the target). */
  current: number
  /** Reading actions required to repair this mission's location. */
  target: number
}

/**
 * Per-child Banner Rally progress.
 *
 * Stored at `families/{familyId}/stonebridgeProgress/{childId}`.
 *
 * **Never** stores or mutates XP / diamonds — mission progress only.
 */
export interface StonebridgeProgress {
  childId: string
  /** Id of the mission currently shown as the live card. */
  currentMissionId: string
  /** Cached counters for the active mission (keeps the bar stable across reloads). */
  activeProgress: StonebridgeMissionProgress | null
  /** Completed mission ids, in completion order. */
  completedMissions: string[]
  /** Location ids whose banner has been raised (one per completed mission). */
  raisedBanners: string[]
  /**
   * Reading-action count snapshotted when each mission became active. Progress
   * for a mission = (current lifetime reading actions − its baseline), so each
   * mission starts from zero and surplus carries forward additively (no-shame).
   */
  missionBaselines: Record<string, number>
  updatedAt: string
}
