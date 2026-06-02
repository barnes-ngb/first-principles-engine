// ── Banner Rally — Slice 1 mission definitions ────────────────────
//
// Locations and characters are reused VERBATIM from the Stonebridge Bible
// (docs/STONEBRIDGE_BIBLE.md). No new canon is invented. Each mission heals one
// named location; its repair raises a banner and a canon character thanks the
// hero. Targets are small, reachable amounts of *existing* reading activity
// (book reads + Knowledge Mine quest completions), pickable in ~1–2 weeks at a
// realistic pace — not "everything, every day."

/** Two-state location art descriptor. Kept deliberately simple (styled emoji +
 *  CSS), not a 2.5D isometric map — that's a later slice. */
export interface StonebridgeLocationArt {
  /** Emoji motif for the location (large, centered). */
  emoji: string
  /** Banner emoji raised on the pole when the location is repaired. */
  bannerEmoji: string
  /** Accent color for the repaired glow + banner. */
  accent: string
}

/** A short canon character beat (thank-you or virtue line), Bible-faithful. */
export interface StonebridgeCharacterLine {
  /** Character name, verbatim from the Bible. */
  name: string
  /** 1–2 sentence, kid-readable line in that character's voice. */
  line: string
}

export interface StonebridgeMission {
  /** Stable mission id (also used as the dedup key in the progress doc). */
  id: string
  /** Bible location name, verbatim. */
  locationName: string
  /** Card title in Lincoln's language. */
  title: string
  /** One-line framing tying reading to the repair. */
  framing: string
  /** Reading actions (book reads + quest completions) needed to repair. */
  target: number
  /** Two-state art for the location. */
  art: StonebridgeLocationArt
  /** Canon character who thanks the hero on completion. */
  thankYou: StonebridgeCharacterLine
  /** Optional, brief, skippable formation/virtue beat in a canon voice. */
  formationBeat?: StonebridgeCharacterLine
}

/**
 * Ordered Slice-1 missions. Slice 1 fully delivers the Old Bridge; the Watchtower
 * is defined so it can become the live card when the Old Bridge is repaired.
 * Later slices add the rest of the Bible's locations.
 */
export const STONEBRIDGE_MISSIONS: StonebridgeMission[] = [
  {
    id: 'old_bridge',
    locationName: 'The Old Bridge',
    title: 'Repair the Old Bridge',
    framing: 'Your reading is repairing the Old Bridge!',
    // ~1–2 weeks: a few book reads and/or a couple of quest completions.
    target: 5,
    art: {
      emoji: '🌉',
      bannerEmoji: '🚩',
      accent: '#7BC8FF',
    },
    thankYou: {
      // Mara the Builder — pragmatic, warm, plain-spoken; breaks big jobs into
      // faithful doable steps.
      name: 'Mara the Builder',
      line: "You did it, Lincoln — plank by plank, the Old Bridge holds again! Wagons can cross to the farms now. That's what faithful steps build.",
    },
    formationBeat: {
      // Brother Cal — connects village choices to scripture, plainly for kids.
      name: 'Brother Cal',
      line: '"Let us not grow weary in doing good." Every page you read was a small, steady good — and look what it rebuilt.',
    },
  },
  {
    id: 'watchtower',
    locationName: 'The Watchtower',
    title: 'Restore the Watchtower',
    framing: 'Keep reading — the Watchtower needs its signal balcony back!',
    target: 6,
    art: {
      emoji: '🗼',
      bannerEmoji: '🏴',
      accent: '#A0E8A0',
    },
    thankYou: {
      // Captain Wren — alert, disciplined, quietly protective; values
      // preparation over panic.
      name: 'Captain Wren',
      line: 'The stair holds and the balcony stands, Lincoln. Now the watch can see the whole valley again. Well prepared — well done.',
    },
    formationBeat: {
      // Sister Anya — tender, steady, hopeful.
      name: 'Sister Anya',
      line: 'You watched over the village by finishing what you started. That is real strength — steady and kind.',
    },
  },
]

/** First mission id — the default active mission for a fresh child. */
export const FIRST_MISSION_ID = STONEBRIDGE_MISSIONS[0].id

/** Look up a mission by id. */
export function getMission(missionId: string): StonebridgeMission | undefined {
  return STONEBRIDGE_MISSIONS.find((m) => m.id === missionId)
}

/** The mission that follows the given one, or null if it's the last defined. */
export function getNextMission(missionId: string): StonebridgeMission | null {
  const idx = STONEBRIDGE_MISSIONS.findIndex((m) => m.id === missionId)
  if (idx < 0 || idx >= STONEBRIDGE_MISSIONS.length - 1) return null
  return STONEBRIDGE_MISSIONS[idx + 1]
}
