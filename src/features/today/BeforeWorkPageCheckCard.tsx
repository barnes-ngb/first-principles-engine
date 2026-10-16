/**
 * Today's entry to the before-work page check.
 *
 * Deliberately NOT a row affordance: the question "is this page right for him
 * today?" arrives with a page in the parent's hand, and the planned row for it
 * may not exist — there may be no workbook row at all, and there is certainly no
 * AI-written `skipGuidance` sentence saying *check lesson*, which is what the
 * old door waited for. So this sits on the day as one card, reachable on an
 * empty plan.
 *
 * It names the child from the SAME active-child context the page header reads
 * (`activeChild`, passed down) — no second selector, nothing to get out of step
 * with the chip in the shell.
 *
 * Parent-only: the caller passes `canCheck` from the one canonical capability
 * answer, and renders nothing when it is false. The hook asks again at the tap.
 */

import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import SectionCard from '../../components/SectionCard'
import { BEFORE_WORK_ENTRY_BLURB } from './beforeWorkPageCheck'

export interface BeforeWorkPageCheckCardProps {
  /** The child the page header already named. Display only. */
  childName: string
  /** Parent capability. Render nothing when false. */
  canCheck: boolean
  /** Open the check. The card itself takes no photo and makes no call. */
  onOpen: () => void
}

export default function BeforeWorkPageCheckCard({
  childName,
  canCheck,
  onOpen,
}: BeforeWorkPageCheckCardProps) {
  if (!canCheck) return null
  return (
    <SectionCard title="Before he starts">
      <Stack spacing={1}>
        <Typography variant="body2" color="text.secondary">
          {BEFORE_WORK_ENTRY_BLURB}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<PhotoCameraIcon />}
          onClick={onOpen}
          sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
        >
          {`Check this page for ${childName}`}
        </Button>
      </Stack>
    </SectionCard>
  )
}
