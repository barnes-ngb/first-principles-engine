import { useNavigate, useSearchParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../core/auth/useAuth'
import { useLearnerModel } from '../../core/hooks/useLearnerModel'
import { scrubDisplayJargon } from '../progress/foundationsView'
import { PROGRESS_TABS, progressPath } from '../progress/progressNav'

/**
 * The one-line ambient planner surface (FEAT-65, Phase 3b / design §7.3): *"This
 * week's foundation focus: {kidName}, because {why}"*, sourced from
 * `synthesis.whatMattersNext[0]`, tapping through to the Foundations tab.
 *
 * Read-only. Renders **nothing** when the model is still loading, absent,
 * `no-data`, or carries no synthesis focus — no empty-state noise on the planner.
 * §14: the `why` is scrubbed of any leaked band/level/percent before display.
 */
export default function FoundationsFocusLine({ childId }: { childId: string }) {
  const familyId = useFamilyId()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { model, loading } = useLearnerModel(familyId, childId)

  if (loading || !model || model.status === 'no-data') return null
  const move = model.synthesis?.whatMattersNext?.[0]
  if (!move) return null

  return (
    <Alert
      severity="info"
      icon={<ExploreOutlinedIcon fontSize="inherit" />}
      // UX-52: name the tab this line is about rather than relying on
      // Foundations happening to be index 0, and carry `?diag=1` through.
      onClick={() => navigate(progressPath(PROGRESS_TABS.Foundations, searchParams))}
      sx={{ mb: 1, cursor: 'pointer' }}
    >
      <Typography variant="body2">
        <strong>This week's foundation focus:</strong> {move.kidName}, because{' '}
        {scrubDisplayJargon(move.why)}
      </Typography>
    </Alert>
  )
}
