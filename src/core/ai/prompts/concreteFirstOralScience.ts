/**
 * ETHOS-03 / ETHOS-04 — shared child-activity generation rails; server-side reuse
 * planned when FEAT-41 slice 3 moves arc generation into a dedicated task (keep single
 * source, do not fork silently).
 *
 * "Concrete-first, oral science" is the named pedagogy contract prepended to
 * child-activity generation prompts. Applied first to Dad Lab suggestion generation
 * (both "Suggest a Lab" and "I Have an Idea" paths); designed for later reuse by other
 * kid-activity generators (Help Card `playIt`, workshop challenges) as separate, later
 * runs — named here, not built.
 *
 * ETHOS-04 correction (owner, 2026-07-03): ETHOS-03 shipped rev-1 which read "Never
 * require a child to read or write anything." That over-corrected into avoidance. The
 * goal is *understanding*: meet each child at their working level and stretch one step,
 * and NEVER hide a skill. A child who reads better than he writes should still read —
 * short, purposeful reading AT his level belongs in activities. Avoidance dressed as
 * accommodation is its own failure. The block below is calibration-not-avoidance.
 *
 * Child-agnostic by design — no child names, no diagnosis language. "Working level" is a
 * system term, not a diagnosis. The name-coupling defect class was closed in ARCH-40; do
 * not reintroduce it. Per-child calibration is now supplied separately by
 * `buildCalibrationParagraph` (`dadLabPrompts.ts`), an interim seam that re-points to the
 * Learner Model's `modalityCalibration` block when FEAT-46 ships (design doc §3.3).
 */
export const CONCRETE_FIRST_ORAL_SCIENCE = `CONCRETE-FIRST, ORAL SCIENCE — rules for all child activity generation:
- Objects before words; do before explain. Every concept must arrive as something a child can hold, throw, stomp, drop, or feel.
- The scientific method is oral and embodied: predict aloud (or point, or draw) -> try it -> observe aloud -> the adult scribes by default.
- Meet each child at their working level and stretch one step. Never hide a skill from a child: short, purposeful reading AT the child's level belongs in activities (a label, a one-line instruction, a prediction card). The goal is understanding, not avoidance.
- Writing: the adult scribes by default; a child who wants to write, writes. Dictation counts fully.
- One concept per activity, sayable in one sentence of kid words. Technical vocabulary arrives when the concept is already in their hands, not before.
- "Change one thing and try again" IS the experiment — name it that way.
- Failure is data: where it fits, include one make-it-fail-on-purpose beat and ask why aloud.
- Leveling up = the same concept in a new modality or with one more variable. Where a foundation concept the child is working on elsewhere fits naturally, reinforce it — activities pull toward the same foundational frontier as the rest of the week.
- A child's answer may be short, pointed at, drawn, or demonstrated; restating it in fuller words is the adult's job.`
