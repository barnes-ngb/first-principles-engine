import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { addDoc } from 'firebase/firestore'

import { artifactsCollection } from '../../core/firebase/firestore'
import {
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
} from '../../core/types/enums'

interface Conundrum {
  title: string
  scenario: string
  question: string
  lincolnPrompt: string
  londonPrompt: string
  virtueConnection: string
  readingTieIn?: string
  mathContext?: string
  londonDrawingPrompt?: string
  dadLabSuggestion?: string
  discussed?: boolean
  discussedAt?: string
}

interface WeekFocusData {
  theme?: string
  virtue?: string
  scriptureRef?: string
  scriptureText?: string
  heartQuestion?: string
  formationPrompt?: string
  conundrum?: Conundrum
}

interface WeekFocusCardProps {
  weekFocus: WeekFocusData
  familyId: string
  selectedChildId: string
  onSnackMessage: (msg: { text: string; severity: 'success' | 'error' }) => void
}

export default function WeekFocusCard({
  weekFocus,
  familyId,
  selectedChildId,
  onSnackMessage,
}: WeekFocusCardProps) {
  return (
    <>
      {/* --- Week Focus --- */}
      {(weekFocus.theme || weekFocus.scriptureRef) && (
        <Box sx={{
          p: 2, borderRadius: 2,
          bgcolor: 'primary.50',
          border: '1px solid',
          borderColor: 'primary.100',
        }}>
          {weekFocus.theme && (
            <Typography variant="subtitle2" color="primary.main">
              Theme: {weekFocus.theme}
            </Typography>
          )}
          {weekFocus.virtue && (
            <Typography variant="body2" color="text.secondary">
              Virtue: {weekFocus.virtue}
            </Typography>
          )}
          {weekFocus.scriptureRef && (
            <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 0.5 }}>
              📖 {weekFocus.scriptureRef}
              {weekFocus.scriptureText && ` — "${weekFocus.scriptureText}"`}
            </Typography>
          )}
          {weekFocus.heartQuestion && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              ❤️ {weekFocus.heartQuestion}
            </Typography>
          )}
          {weekFocus.formationPrompt && (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 1 }}>
              🙏 {weekFocus.formationPrompt}
            </Typography>
          )}
        </Box>
      )}

      {/* --- This Week's Conundrum --- */}
      {weekFocus.conundrum && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">
              This Week&apos;s Conundrum: {weekFocus.conundrum.title}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.5}>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                {weekFocus.conundrum.scenario}
              </Typography>
              <Box sx={{ p: 1.5, bgcolor: 'primary.50', borderRadius: 1, border: '1px solid', borderColor: 'primary.100' }}>
                <Typography variant="subtitle2" color="primary.main">
                  {weekFocus.conundrum.question}
                </Typography>
              </Box>
              <Typography variant="body2"><strong>Lincoln:</strong> {weekFocus.conundrum.lincolnPrompt}</Typography>
              <Typography variant="body2"><strong>London:</strong> {weekFocus.conundrum.londonPrompt}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {weekFocus.conundrum.virtueConnection}
              </Typography>
              {weekFocus.conundrum.readingTieIn && (
                <Typography variant="body2" color="text.secondary">
                  📖 <strong>Reading:</strong> {weekFocus.conundrum.readingTieIn}
                </Typography>
              )}
              {weekFocus.conundrum.mathContext && (
                <Typography variant="body2" color="text.secondary">
                  🔢 <strong>Math:</strong> {weekFocus.conundrum.mathContext}
                </Typography>
              )}
              {weekFocus.conundrum.londonDrawingPrompt && (
                <Typography variant="body2" color="text.secondary">
                  🎨 <strong>Drawing:</strong> {weekFocus.conundrum.londonDrawingPrompt}
                </Typography>
              )}
              <Button
                size="small"
                variant="outlined"
                onClick={async () => {
                  try {
                    await addDoc(artifactsCollection(familyId), {
                      childId: selectedChildId,
                      title: `Conundrum: ${weekFocus.conundrum!.title}`,
                      type: EvidenceType.Note,
                      tags: { engineStage: EngineStage.Wonder, subjectBucket: SubjectBucket.Other, domain: '', location: LearningLocation.Home },
                      content: `Discussed conundrum: ${weekFocus.conundrum!.title}`,
                      createdAt: new Date().toISOString(),
                    })
                    onSnackMessage({ text: 'Conundrum discussion recorded!', severity: 'success' })
                  } catch (err) {
                    console.error('Failed to record conundrum:', err)
                    onSnackMessage({ text: 'Failed to save.', severity: 'error' })
                  }
                }}
                sx={{ alignSelf: 'flex-start' }}
              >
                We discussed this!
              </Button>
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
    </>
  )
}
