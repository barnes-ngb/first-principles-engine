import { useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined'

import SectionCard from '../../components/SectionCard'
import { useFamilyId } from '../../core/auth/useAuth'
import { useChildren } from '../../core/hooks/useChildren'
import type { FoundationDomain } from '../../core/foundations/types'
import FoundationsReviewSession from './FoundationsReviewSession'

interface OpenSession {
  childId: string
  childName: string
  domain: FoundationDomain
}

/**
 * Foundations Review Chat launcher (FEAT-51, slice 2a). Lives in the Foundations
 * area on the parent-only Progress page (the FEAT-48 diag panel's home). Per child,
 * two chips — "Review reading" / "Review math" — open a subject-scoped review
 * session. Parent-only by virtue of the Progress route being `parentOnly` (the kid
 * profiles never see this page). This is the primary interface for feeding the
 * Learner Model until the full Foundations tab lands (slice 3).
 */
export default function FoundationsReviewLauncher() {
  const familyId = useFamilyId()
  const { children } = useChildren()
  const [open, setOpen] = useState<OpenSession | null>(null)

  if (children.length === 0) return null

  return (
    <SectionCard title="Foundations Review">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        A ~10-minute chat to establish where each child really is — by what you’ve seen, what
        you’ve covered, or a quick test. Nothing is saved until you confirm it.
      </Typography>
      <Stack spacing={1.5}>
        {children.map((child) => (
          <Box key={child.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, minWidth: 72 }}>
              {child.name}
            </Typography>
            <Chip
              icon={<MenuBookOutlinedIcon />}
              label="Review reading"
              onClick={() => setOpen({ childId: child.id, childName: child.name, domain: 'reading' })}
              variant="outlined"
              clickable
            />
            <Chip
              icon={<CalculateOutlinedIcon />}
              label="Review math"
              onClick={() => setOpen({ childId: child.id, childName: child.name, domain: 'math' })}
              variant="outlined"
              clickable
            />
          </Box>
        ))}
      </Stack>

      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: { height: { xs: '100%', sm: '80vh' }, maxHeight: '100%' } } }}
      >
        {open && (
          <FoundationsReviewSession
            familyId={familyId}
            childId={open.childId}
            childName={open.childName}
            domain={open.domain}
            onClose={() => setOpen(null)}
          />
        )}
      </Dialog>
    </SectionCard>
  )
}
