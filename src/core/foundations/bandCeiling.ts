// ── Band-ceiling lesson→unit helper (FEAT-64) ────────────────────────────
//
// Dependency-free on purpose: the bridge data modules (`mathseedsBridge`,
// `tgtbLa1Bridge`) need this, and `workbookBridge` imports THOSE for its registry.
// Keeping the helper here — imported by nobody it imports back — breaks what would
// otherwise be a value-level import cycle (a bridge module loaded as a test entry
// would read the registry before its own const finished initializing).

/**
 * Build a band-ceiling `lessonToUnit`: given a curriculum's ordered band ceilings
 * (each band's `upToLesson`, ascending), map a family lesson to the ceiling of the
 * band it falls INTO — i.e. round the lesson UP to the next ceiling (clamped to the
 * last band for lessons past the end). This gives **in-band credit**: a child partway
 * through a broad band (Mathseeds L122 in the 101–150 band) is credited for that
 * band's concepts, since a ~50-lesson band's content is distributed across it and the
 * `covered → forming` cap keeps the claim honest (FEAT-64 §1/§2).
 */
export function makeBandCeilingLessonToUnit(
  ceilings: number[],
): (lesson: number) => number | null {
  return (lesson: number) => {
    if (!Number.isFinite(lesson)) return null
    for (const ceiling of ceilings) {
      if (lesson <= ceiling) return ceiling
    }
    // Past the last band → clamp to the final ceiling (still fully covered).
    return ceilings.length > 0 ? ceilings[ceilings.length - 1] : null
  }
}
