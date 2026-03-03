import { useCallback, useState } from 'react'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import EditNoteIcon from '@mui/icons-material/EditNote'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

import type { SkillSnapshot } from '../../core/types/domain'
import type { SkillLevel } from '../../core/types/enums'
import { SKILL_TAG_MAP } from '../../core/types/skillTags'

// ── Quick Check Prompts ──────────────────────────────────────────

interface QuickCheckPrompt {
  skillTag: string
  label: string
  prompt: string
  levels: { level: SkillLevel; description: string }[]
}

const LINCOLN_QUICK_CHECKS: QuickCheckPrompt[] = [
  {
    skillTag: 'reading.cvcBlend',
    label: 'CVC Blending Check',
    prompt: 'Show 10 CVC words (mix of new + review). How many does Lincoln read with 2 or fewer prompts?',
    levels: [
      { level: 'emerging' as SkillLevel, description: '0-3 words correct' },
      { level: 'developing' as SkillLevel, description: '4-6 words correct' },
      { level: 'supported' as SkillLevel, description: '7-8 words with some prompting' },
      { level: 'practice' as SkillLevel, description: '9-10 words with minimal prompting' },
      { level: 'secure' as SkillLevel, description: '10/10 consistently across sessions' },
    ],
  },
  {
    skillTag: 'math.subtraction.regroup',
    label: 'Regrouping Check',
    prompt: 'Give 8 two-digit subtraction problems with regrouping. How many does Lincoln solve with manipulatives or guided steps?',
    levels: [
      { level: 'emerging' as SkillLevel, description: '0-2 correct (needs full support)' },
      { level: 'developing' as SkillLevel, description: '3-4 correct with heavy guidance' },
      { level: 'supported' as SkillLevel, description: '5-6 correct with base-ten blocks' },
      { level: 'practice' as SkillLevel, description: '6-7 correct with light prompting' },
      { level: 'secure' as SkillLevel, description: '7-8 correct independently' },
    ],
  },
  {
    skillTag: 'writing.gripPosture',
    label: 'Handwriting Check',
    prompt: 'Watch Lincoln write 5 sentences. Does he maintain tripod grip and stay on the line?',
    levels: [
      { level: 'emerging' as SkillLevel, description: 'Inconsistent grip, letters float' },
      { level: 'developing' as SkillLevel, description: 'Grip okay, letters uneven' },
      { level: 'supported' as SkillLevel, description: 'Good grip, mostly on line with reminders' },
      { level: 'practice' as SkillLevel, description: 'Good grip, consistent letter size' },
      { level: 'secure' as SkillLevel, description: 'Fluent handwriting without reminders' },
    ],
  },
]

// ── Component ────────────────────────────────────────────────────

interface QuickCheckPanelProps {
  snapshot: SkillSnapshot
  onUpdateSkillLevel: (skillIndex: number, newLevel: SkillLevel) => void
  onAddObservation: (skillIndex: number, observation: string) => void
}

export default function QuickCheckPanel({
  snapshot,
  onUpdateSkillLevel,
  onAddObservation,
}: QuickCheckPanelProps) {
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null)
  const [observation, setObservation] = useState('')

  const handleLevelSelect = useCallback(
    (skillTag: string, newLevel: SkillLevel) => {
      const skillIndex = snapshot.prioritySkills.findIndex((s) => s.tag === skillTag)
      if (skillIndex >= 0) {
        onUpdateSkillLevel(skillIndex, newLevel)
      }
      setExpandedCheck(null)
    },
    [snapshot.prioritySkills, onUpdateSkillLevel],
  )

  const handleAddObservation = useCallback(
    (skillTag: string) => {
      if (!observation.trim()) return
      const skillIndex = snapshot.prioritySkills.findIndex((s) => s.tag === skillTag)
      if (skillIndex >= 0) {
        onAddObservation(skillIndex, observation.trim())
        setObservation('')
      }
    },
    [snapshot.prioritySkills, onAddObservation, observation],
  )

  // Only show checks for skills that exist in the snapshot
  const relevantChecks = LINCOLN_QUICK_CHECKS.filter((check) =>
    snapshot.prioritySkills.some((s) => s.tag === check.skillTag),
  )

  if (relevantChecks.length === 0) {
    return (
      <Alert severity="info" variant="outlined">
        Add priority skills to see quick check prompts.
      </Alert>
    )
  }

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2" color="text.secondary">
        Run a 2-3 minute check, then tap the result to update the skill level.
      </Typography>

      {relevantChecks.map((check) => {
        const skill = snapshot.prioritySkills.find((s) => s.tag === check.skillTag)
        const tagDef = SKILL_TAG_MAP[check.skillTag]
        const isExpanded = expandedCheck === check.skillTag

        return (
          <Box
            key={check.skillTag}
            sx={{
              p: 1.5,
              border: '1px solid',
              borderColor: isExpanded ? 'primary.main' : 'divider',
              borderRadius: 1,
            }}
          >
            <Stack spacing={1}>
              {/* Header */}
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="subtitle2">{check.label}</Typography>
                {skill && (
                  <Chip
                    label={skill.level}
                    size="small"
                    color="info"
                    variant="outlined"
                  />
                )}
                {tagDef && (
                  <Typography variant="caption" color="text.secondary">
                    Evidence: {tagDef.evidence}
                  </Typography>
                )}
              </Stack>

              {/* Prompt */}
              <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
                <Typography variant="body2">{check.prompt}</Typography>
              </Alert>

              {/* Level buttons (1-tap updates) */}
              {!isExpanded ? (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setExpandedCheck(check.skillTag)}
                  startIcon={<EditNoteIcon />}
                >
                  Record Result
                </Button>
              ) : (
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary">
                    Tap the level that matches what you observed:
                  </Typography>
                  <ToggleButtonGroup
                    exclusive
                    value={skill?.level ?? null}
                    onChange={(_e, newLevel) => {
                      if (newLevel) handleLevelSelect(check.skillTag, newLevel)
                    }}
                    size="small"
                    sx={{ flexWrap: 'wrap' }}
                  >
                    {check.levels.map((lvl) => (
                      <ToggleButton
                        key={lvl.level}
                        value={lvl.level}
                        sx={{
                          textTransform: 'none',
                          fontSize: '0.75rem',
                          py: 0.5,
                          px: 1,
                        }}
                      >
                        <Stack alignItems="flex-start" spacing={0}>
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>
                            {lvl.level}
                          </Typography>
                          <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>
                            {lvl.description}
                          </Typography>
                        </Stack>
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>

                  {/* Quick observation */}
                  <Stack direction="row" spacing={1} alignItems="flex-end">
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Quick observation (optional)..."
                      value={observation}
                      onChange={(e) => setObservation(e.target.value)}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={!observation.trim()}
                      onClick={() => handleAddObservation(check.skillTag)}
                      startIcon={<CheckCircleIcon />}
                    >
                      Add
                    </Button>
                  </Stack>

                  <Button
                    size="small"
                    onClick={() => setExpandedCheck(null)}
                  >
                    Cancel
                  </Button>
                </Stack>
              )}
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
