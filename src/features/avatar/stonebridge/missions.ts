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
 * Ordered Banner Rally missions, walking the full Stonebridge Bible.
 *
 * Targets escalate gently (5 → 6 → 8 → 10 → 12 → 15 → 18) and are each reachable
 * in ~1.5–4 weeks of *existing* reading activity at a realistic pace (a few book
 * reads / Knowledge Mine quests a week, NOT "everything, every day"). The whole
 * rally sums to a full-school-term arc — see the cumulative total flagged in the
 * Slice-2 PR for human sanity-check. Locations + characters are reused VERBATIM
 * from docs/STONEBRIDGE_BIBLE.md; no new canon is invented. Banner Hall is the
 * warm capstone ("who you're becoming"), so it sits last and the rally parks
 * there once complete.
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
  {
    id: 'library_hut',
    locationName: 'The Library Hut',
    title: 'Save the Library Hut',
    framing: 'Every page you read helps Old Tomas rescue the Library Hut.',
    // ~2 weeks of reads/quests.
    target: 8,
    art: {
      emoji: '📚',
      bannerEmoji: '🎏',
      accent: '#E8C36B',
    },
    thankYou: {
      // Old Tomas — gentle, patient, poetic; answers in a short proverb or tale.
      name: 'Old Tomas',
      line: 'The shelves are dry and the old maps breathe again, young one. A village that remembers where it has been always knows where it is going. Thank you.',
    },
    formationBeat: {
      // Brother Cal — connects choices to scripture, plainly for kids.
      name: 'Brother Cal',
      line: '"Apply your heart to instruction." Every page you read kept our village\'s memory safe.',
    },
  },
  {
    id: 'the_forge',
    locationName: 'The Forge',
    title: 'Fire Up the Forge',
    framing: 'Your reading is stoking the Forge — keep the hearth roaring!',
    target: 10,
    art: {
      emoji: '⚒️',
      bannerEmoji: '🚩',
      accent: '#FF9A52',
    },
    thankYou: {
      // Finn the Smith — energetic, inventive, humble enough to learn from mistakes.
      name: 'Finn the Smith',
      line: 'Listen to that hearth ROAR, Lincoln! Now I can mend every hinge and lantern hook in town. I fumbled plenty learning this — but we kept at it, and look!',
    },
    formationBeat: {
      // Mara the Builder — faithful steps finish big jobs.
      name: 'Mara the Builder',
      line: 'Plank by plank, spark by spark — faithful steps finish big jobs. You are learning that.',
    },
  },
  {
    id: 'lantern_path',
    locationName: 'The Lantern Path',
    title: 'Light the Lantern Path',
    framing: 'Each story you read lights another lantern on the path home.',
    target: 12,
    art: {
      emoji: '🏮',
      bannerEmoji: '🎏',
      accent: '#FFD98A',
    },
    thankYou: {
      // Sister Anya — tender, steady, hopeful; true strength includes compassion.
      name: 'Sister Anya',
      line: 'The far markers glow again, Lincoln. Now no neighbor walks home in the dark. That is what real strength does — it carries a light for the weary.',
    },
    formationBeat: {
      // Old Tomas — gentle, poetic.
      name: 'Old Tomas',
      line: 'Little lights, faithfully lit, become a road. Well done.',
    },
  },
  {
    id: 'beacon_hill',
    locationName: 'Beacon Hill',
    title: 'Relight Beacon Hill',
    framing: 'Keep going — your reading is rekindling the great beacon.',
    target: 15,
    art: {
      emoji: '🔥',
      bannerEmoji: '🏴',
      accent: '#FFB347',
    },
    thankYou: {
      // Brother Cal — cheerful, grounded; speaks clearly so children understand.
      name: 'Brother Cal',
      line: 'The beacon is bright again, Lincoln! Now the allied villages can see that Stonebridge is standing, rebuilding, and ready to help others. What a light you have lit.',
    },
    formationBeat: {
      // Captain Wren — calm courage, preparation over panic.
      name: 'Captain Wren',
      line: 'A steady fire on the hill is worth more than a hundred worried words. You finished what you started — that is courage.',
    },
  },
  {
    id: 'banner_hall',
    locationName: 'Banner Hall',
    title: 'Raise Your Banner in Banner Hall',
    framing: 'Every banner you have raised leads here — to your own colors in Banner Hall.',
    // The capstone summit: still reachable, but the meaningful peak of the rally.
    target: 18,
    art: {
      emoji: '🎌',
      bannerEmoji: '🚩',
      accent: '#F5C542',
    },
    thankYou: {
      // Mayor Oakley — fair-minded servant-leader who grows Lincoln into responsibility.
      name: 'Mayor Oakley',
      line: 'Look around this hall, Lincoln — every banner is a place you helped rebuild. Today you hang your own colors. This is who you are becoming: a hero who shows up, step by step.',
    },
    formationBeat: {
      // Brother Cal — warm, not preachy.
      name: 'Brother Cal',
      line: 'You did not rebuild Stonebridge in a day — you did it one faithful page at a time. Well done, friend.',
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
