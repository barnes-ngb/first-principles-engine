import { useEffect, useMemo, useState } from 'react'
import CloseIcon from '@mui/icons-material/Close'
import SchoolIcon from '@mui/icons-material/School'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { doc, getDoc } from 'firebase/firestore'

import { skillSnapshotsCollection } from '../../core/firebase/firestore'
import type { ChecklistItem, LadderCardDefinition, SkillSnapshot } from '../../core/types/domain'

interface TeachHelperDialogProps {
  open: boolean
  onClose: () => void
  familyId: string
  childId: string
  childName: string
  item: ChecklistItem | null
  ladders: LadderCardDefinition[]
}

/**
 * "Help me teach this" dialog — provides a micro-lesson script
 * based on the plan item, skill snapshot, and ladder rung.
 */
export default function TeachHelperDialog({
  open,
  onClose,
  familyId,
  childId,
  childName,
  item,
  ladders,
}: TeachHelperDialogProps) {
  const [snapshot, setSnapshot] = useState<SkillSnapshot | null>(null)

  useEffect(() => {
    if (!open || !childId) return
    const ref = doc(skillSnapshotsCollection(familyId), childId)
    void getDoc(ref).then((snap) => {
      if (snap.exists()) {
        setSnapshot({ ...snap.data(), id: snap.id })
      }
    })
  }, [open, familyId, childId])

  const ladderInfo = useMemo(() => {
    if (!item?.ladderRef) return null
    const ladder = ladders.find((l) => l.ladderKey === item.ladderRef!.ladderId)
    const rung = ladder?.rungs.find((r) => r.rungId === item.ladderRef!.rungId)
    return { ladder, rung }
  }, [item, ladders])

  const supports = snapshot?.supports ?? []
  const stopRules = snapshot?.stopRules ?? []

  if (!item) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SchoolIcon color="primary" />
        Help Me Teach This
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {/* What we're teaching */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Plan Item
            </Typography>
            <Typography variant="h6">{item.label}</Typography>
            {item.skillTags && item.skillTags.length > 0 && (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                {item.skillTags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" variant="outlined" />
                ))}
              </Stack>
            )}
          </Box>

          {/* Ladder context */}
          {ladderInfo?.ladder && (
            <>
              <Divider />
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Ladder
                </Typography>
                <Typography>
                  {ladderInfo.ladder.title} \u2014 {ladderInfo.rung?.name ?? 'Unknown rung'}
                </Typography>
                {ladderInfo.rung && (
                  <Typography variant="body2" color="text.secondary">
                    Evidence: {ladderInfo.rung.evidenceText}
                  </Typography>
                )}
              </Box>
            </>
          )}

          <Divider />

          {/* Micro-lesson script */}
          <Box>
            <Typography variant="subtitle2" color="primary" gutterBottom>
              Micro-Lesson (5\u201310 min)
            </Typography>
            <Stack spacing={1}>
              <Typography variant="body2">
                <strong>1. Warm up (1 min):</strong> Start with something {childName} already
                knows. Pick 2 easy examples to build confidence.
              </Typography>
              <Typography variant="body2">
                <strong>2. Teach (2\u20133 min):</strong> Introduce the concept from the plan item.
                Model it once, then do one together.
              </Typography>
              <Typography variant="body2">
                <strong>3. Practice (3\u20135 min):</strong> Let {childName} try 3\u20135 examples.
                Watch for frustration cues.
              </Typography>
              <Typography variant="body2">
                <strong>4. Check (1 min):</strong> Ask {childName} to explain what they did.
                {ladderInfo?.rung && ` Look for: ${ladderInfo.rung.evidenceText}`}
              </Typography>
            </Stack>
          </Box>

          {/* Supports */}
          {supports.length > 0 && (
            <>
              <Divider />
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Supports for {childName}
                </Typography>
                <Stack spacing={0.5}>
                  {supports.map((s, i) => (
                    <Typography key={i} variant="body2">
                      \u2022 <strong>{s.label}:</strong> {s.description}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            </>
          )}

          {/* Stop rules */}
          {stopRules.length > 0 && (
            <>
              <Divider />
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  When to Stop / Switch
                </Typography>
                <Stack spacing={0.5}>
                  {stopRules.map((rule, i) => (
                    <Alert key={i} severity="info" variant="outlined" sx={{ py: 0 }}>
                      <Typography variant="body2">
                        <strong>If:</strong> {rule.trigger}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Then:</strong> {rule.action}
                      </Typography>
                    </Alert>
                  ))}
                </Stack>
              </Box>
            </>
          )}

          {/* Common mistakes */}
          <Divider />
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Common Mistakes &amp; What to Say
            </Typography>
            <Stack spacing={0.5}>
              <Typography variant="body2">
                \u2022 <strong>If stuck:</strong> &quot;Let&apos;s look at this together. What do you see first?&quot;
              </Typography>
              <Typography variant="body2">
                \u2022 <strong>If frustrated:</strong> &quot;It&apos;s okay to find this hard. Let&apos;s try an easier one and come back.&quot;
              </Typography>
              <Typography variant="body2">
                \u2022 <strong>If rushing:</strong> &quot;Slow down \u2014 show me how you got that answer.&quot;
              </Typography>
              <Typography variant="body2">
                \u2022 <strong>If correct:</strong> &quot;You did it! Can you explain how?&quot;
              </Typography>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
