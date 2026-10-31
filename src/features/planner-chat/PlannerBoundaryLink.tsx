import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useNavigate } from 'react-router-dom'

import {
  PLANNER_BOUNDARY_FALLBACK,
  plannerBoundaryJobById,
} from '../../../functions/src/shared/plannerBoundary'
import {
  PLANNER_ASK_HANDOFF_STATE_KEY,
  stagePlannerAskHandoff,
  type PlannerAskHandoffRequest,
} from './plannerAskHandoff'

/**
 * What the bubble says when the model wrote the marker and nothing else.
 *
 * Two reasons this is not simply an empty bubble with a button under it. It
 * would read as the app having lost her reply — and, concretely, an assistant
 * turn with empty text becomes an empty content block on the NEXT call in the
 * thread, which the API rejects. Short, honest, and it invents nothing: the
 * button beside it says where to go.
 */
export const BOUNDARY_BARE_REFUSAL_TEXT = "I can't do that from here."

/**
 * The line added to a generated plan when the reply that came back was a
 * refusal rather than a week.
 *
 * The boundary rule is installed on every `TaskType.Plan` call, so a job the
 * planner cannot do — typed into the setup card's notes field rather than into
 * the chat — can be declined in a reply that was asked for a week.
 *
 * Two shapes, and the second is the common one now that the prompt tells the
 * model to plan the week anyway. The reply is unparseable, and the generate
 * paths read it as a broken plan and fall back to the local planner (Codex
 * round 2, P2). Or the reply is a perfectly good plan with a marker after it —
 * `extractJsonObject` takes the braces and ignores the rest, so the plan lands
 * and the declined ask would vanish without a trace (Codex round 3, P2).
 *
 * So the parse runs BEFORE the success/failure branch in all three paths, and
 * this line is worded to be true of both: it says nothing about where the plan
 * came from.
 */
export const BOUNDARY_DURING_GENERATE_TEXT =
  "One thing in your notes isn't something I can change from here. The plan is below; the button says where that one lives."

/**
 * What the control says it will do with her sentence, before she taps it.
 *
 * The repo's rail for a surface whose tap carries work somewhere else: say so
 * ahead of the tap, and say the part that matters — that nothing is sent. A
 * pre-filled turn that sent itself would put a confirm-card write one tap from a
 * screen she did not choose to be on, so "unsent" is the promise this line is
 * making and the one the receiving view keeps.
 */
export const BOUNDARY_HANDOFF_CAPTION =
  'Takes your question with you — unsent, so you choose when to send it.'

interface PlannerBoundaryLinkProps {
  /**
   * The job the assistant turn declined, as the model named it. Resolved here
   * rather than at write time so a route that moves fixes every stored
   * conversation at once.
   */
  jobId: string
  /**
   * Her sentence and the context it was asked in, when this refusal has one to
   * carry (UX-273). **Absent is the normal case and the original behaviour**: a
   * conversation reloaded from Firestore, a refusal beside a generated plan, a
   * destination that is a screen rather than Ask AI — all of those navigate
   * exactly as UX-269 shipped, with nothing carried and no extra line on screen.
   */
  handoff?: PlannerAskHandoffRequest
  /**
   * Is the transcript this refusal sits in still the live scope's? Asked at the
   * TAP, not at render (UX-273's source rail).
   *
   * Render already proved it, but a tap can land on a render the shell has
   * superseded — the staging happens on the click, so the click is where the
   * last word belongs. Absent means there is nothing to re-ask and the `handoff`
   * prop stands on its own, which is how the pre-existing call sites and the
   * tests that compose a fixed source behave.
   */
  authorizeHandoff?: () => boolean
}

/**
 * The way forward out of a planner-chat refusal (UX-269).
 *
 * The prompt rule alone was never going to be enough — a prompt is a
 * probability, and this chat's defect is that it sounds authoritative when it is
 * wrong. So the boundary is also a control she can tap: FEAT-206's lesson —
 * *when prose loses to a rule, give her a button* — applied to a refusal instead
 * of a request.
 *
 * Three things it deliberately does not do:
 *
 * - **It does not render a route the model wrote.** The model names a job; this
 *   maps it. A model-composed path is the invented-screen failure with a tap on
 *   it, which is strictly worse than the sentence it replaced.
 * - **It does not guess.** An id the table does not carry falls through to the
 *   one general destination (Ask AI), because a wrong link is worse than a
 *   general one.
 * - **It does not send anything.** Since UX-273 the tap may carry her sentence
 *   to Ask AI's composer, where it sits UNSENT. The third thing it did not do
 *   was carry her sentence at all; that is now the `handoff` prop, and the two
 *   rules above are untouched by it — the route is still the app's, the
 *   destination is still never guessed, and a refusal with nothing to carry
 *   still navigates exactly as it did.
 */
export default function PlannerBoundaryLink({
  jobId,
  handoff,
  authorizeHandoff,
}: PlannerBoundaryLinkProps) {
  const navigate = useNavigate()
  const destination = plannerBoundaryJobById(jobId) ?? PLANNER_BOUNDARY_FALLBACK

  // The staging happens on the TAP, never on render: a refusal sitting on screen
  // has put nothing anywhere, so a parent who reads it and goes elsewhere leaves
  // no sentence behind to surface on a later visit. A stage that refuses (over
  // the cap, a destination with no composer, or an owner that can no longer be
  // proven) falls through to the plain UX-269 navigation rather than to nothing —
  // the button's job is the screen.
  const handleClick = () => {
    const owned = handoff ? authorizeHandoff?.() ?? true : false
    const stagedHandoff = owned && handoff ? stagePlannerAskHandoff(handoff) : null
    if (!stagedHandoff) {
      navigate(destination.route)
      return
    }
    navigate(destination.route, {
      state: { [PLANNER_ASK_HANDOFF_STATE_KEY]: stagedHandoff.generation },
    })
  }

  return (
    <Box sx={{ mt: 1 }}>
      <Button
        size="small"
        variant="outlined"
        endIcon={<ArrowForwardIcon fontSize="small" />}
        onClick={handleClick}
        sx={{ textTransform: 'none' }}
      >
        {destination.linkLabel}
      </Button>
      {handoff && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {BOUNDARY_HANDOFF_CAPTION}
        </Typography>
      )}
    </Box>
  )
}
