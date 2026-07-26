/**
 * The plain-language phrase for each concept state a parent can attest to — the
 * one place the wording lives.
 *
 * §14 (LOCKED): these are the ONLY words a parent-facing surface uses to say
 * where a concept stands. Never a band number, a working level, a percentage, or
 * a score. `not-yet` is deliberately absent: it is "we haven't seen it", which is
 * an absence of evidence, not something a parent attests to.
 *
 * Shared by the Review-Chat confirm card and the Foundations tab's concept
 * override (FEAT-66), so a choice a parent taps reads exactly like the line they
 * then confirm. It lives in its own module (not the card) so importing the
 * vocabulary never drags a component along.
 */
export const STATE_PHRASE: Record<string, string> = {
  solid: 'has this solid',
  forming: 'is coming along with this',
  frontier: 'is working on this',
}
