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
