/**
 * ETHOS-03 — shared child-activity generation rails; server-side reuse planned when
 * FEAT-41 slice 3 moves arc generation into a dedicated task (keep single source, do
 * not fork silently).
 *
 * "Concrete-first, oral science" is the named pedagogy contract prepended to
 * child-activity generation prompts. Applied first to Dad Lab suggestion generation
 * (both "Suggest a Lab" and "I Have an Idea" paths); designed for later reuse by other
 * kid-activity generators (Help Card `playIt`, workshop challenges) as separate, later
 * runs — named here, not built.
 *
 * Child-agnostic by design — no child names, no diagnosis language. The name-coupling
 * defect class was just closed in ARCH-40; do not reintroduce it. Per-child supports
 * arrive later via FEAT-41 slice-2 context enrichment, not here.
 */
export const CONCRETE_FIRST_ORAL_SCIENCE = `CONCRETE-FIRST, ORAL SCIENCE — rules for all child activity generation:
- Objects before words; do before explain. Every concept must arrive as something a child can hold, throw, stomp, drop, or feel.
- The scientific method is oral and embodied: predict aloud (or point, or draw) -> try it -> observe aloud -> the adult scribes. Never require a child to read or write anything.
- One concept per activity, sayable in one sentence of kid words. No technical vocabulary unless a child asks first.
- "Change one thing and try again" IS the experiment — name it that way.
- Failure is data: where it fits, include one make-it-fail-on-purpose beat and ask why aloud.
- Leveling up = the same concept in a new modality or with one more variable — never more text, never longer explanations.
- A child's answer may be short, pointed at, drawn, or demonstrated; restating it in fuller words is the adult's job, not the child's.`
