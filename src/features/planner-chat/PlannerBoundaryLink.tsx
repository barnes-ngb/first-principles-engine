import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import Button from '@mui/material/Button'
import { useNavigate } from 'react-router-dom'

import {
  PLANNER_BOUNDARY_FALLBACK,
  plannerBoundaryJobById,
} from '../../../functions/src/shared/plannerBoundary'

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

interface PlannerBoundaryLinkProps {
  /**
   * The job the assistant turn declined, as the model named it. Resolved here
   * rather than at write time so a route that moves fixes every stored
   * conversation at once.
   */
  jobId: string
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
 * - **It does not carry her sentence across.** Ask AI has no prefill today, and
 *   adding one reaches into the portal chat this run does not own — filed as
 *   UX-273 rather than half-built here.
 */
export default function PlannerBoundaryLink({ jobId }: PlannerBoundaryLinkProps) {
  const navigate = useNavigate()
  const destination = plannerBoundaryJobById(jobId) ?? PLANNER_BOUNDARY_FALLBACK

  return (
    <Button
      size="small"
      variant="outlined"
      endIcon={<ArrowForwardIcon fontSize="small" />}
      onClick={() => navigate(destination.route)}
      sx={{ mt: 1, textTransform: 'none' }}
    >
      {destination.linkLabel}
    </Button>
  )
}
