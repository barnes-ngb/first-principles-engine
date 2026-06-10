import { useState, useCallback } from 'react'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { addDoc } from 'firebase/firestore'

import SectionCard from '../../components/SectionCard'
import { hoursCollection } from '../../core/firebase/firestore'
import { assertAttributed } from './records.logic'
import {
  QUICK_ACTIVITIES,
  DURATION_OPTIONS,
  GROUPS,
  buildQuickAddEntry,
  type QuickActivity,
  type HomeAway,
} from './QuickAddHours.logic'

interface QuickAddHoursProps {
  familyId: string
  childId: string
  childName: string
  date: string  // YYYY-MM-DD
  onSaved: (message: string) => void
}

export default function QuickAddHours({ familyId, childId, childName, date, onSaved }: QuickAddHoursProps) {
  const [selectedActivity, setSelectedActivity] = useState<QuickActivity | null>(null)
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null)
  const [homeAway, setHomeAway] = useState<HomeAway>('away')
  const [saving, setSaving] = useState(false)
  const [recentlyAdded, setRecentlyAdded] = useState<Array<{ label: string; minutes: number }>>([])

  const handleSave = useCallback(async () => {
    if (!selectedActivity || !selectedMinutes) return
    // DATA-05: never write an unattributed entry.
    if (!childId) return
    setSaving(true)
    try {
      // FEAT-24: log as a normal HoursEntry (not an adjustment). Still guarded
      // by assertAttributed (DATA-05). Both fold into collectHoursContributions,
      // so totals are unchanged — this is about semantics + category accuracy.
      await addDoc(hoursCollection(familyId), assertAttributed(buildQuickAddEntry({
        childId,
        date,
        activity: selectedActivity,
        minutes: selectedMinutes,
        homeAway,
      })))

      setRecentlyAdded(prev => [...prev, { label: selectedActivity.label, minutes: selectedMinutes }])
      setSelectedActivity(null)
      setSelectedMinutes(null)
      onSaved(`${selectedActivity.emoji} ${selectedActivity.label} — ${selectedMinutes}m logged for ${childName}`)
    } catch (err) {
      console.error('Quick add failed:', err)
      onSaved('Failed to save. Try again.')
    }
    setSaving(false)
  }, [familyId, childId, date, selectedActivity, selectedMinutes, homeAway, childName, onSaved])

  return (
    <SectionCard title="⚡ Quick Add Activity">
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Tap an activity and how long. These count toward your 1,000 hours.
        </Typography>

        {/* Home / Away — applied to each logged activity until changed (default Away) */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Where?
          </Typography>
          <ToggleButtonGroup
            value={homeAway}
            exclusive
            size="small"
            onChange={(_e, next: HomeAway | null) => {
              if (next) setHomeAway(next)
            }}
            aria-label="Home or away"
          >
            <ToggleButton value="home" aria-label="Home">🏠 Home</ToggleButton>
            <ToggleButton value="away" aria-label="Away">🌳 Away</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {/* Activity picker — grouped */}
        {GROUPS.map(group => (
          <Stack key={group.key} spacing={0.5}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {group.title}
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {QUICK_ACTIVITIES.filter(a => a.group === group.key).map(activity => (
                <Chip
                  key={activity.label}
                  label={`${activity.emoji} ${activity.label}`}
                  onClick={() => setSelectedActivity(activity)}
                  color={selectedActivity?.label === activity.label ? 'primary' : 'default'}
                  variant={selectedActivity?.label === activity.label ? 'filled' : 'outlined'}
                  size="small"
                />
              ))}
            </Stack>
          </Stack>
        ))}

        {/* Duration picker — only shows after activity selected */}
        {selectedActivity && (
          <Stack spacing={1}>
            <Typography variant="subtitle2">
              How long? ({selectedActivity.emoji} {selectedActivity.label})
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {DURATION_OPTIONS.map(opt => (
                <Chip
                  key={opt.minutes}
                  label={opt.label}
                  onClick={() => setSelectedMinutes(opt.minutes)}
                  color={selectedMinutes === opt.minutes ? 'success' : 'default'}
                  variant={selectedMinutes === opt.minutes ? 'filled' : 'outlined'}
                />
              ))}
            </Stack>
          </Stack>
        )}

        {/* Save button */}
        {selectedActivity && selectedMinutes && (
          <Button
            variant="contained"
            color="success"
            onClick={handleSave}
            disabled={saving}
            size="large"
          >
            {saving ? 'Saving...' : `Log ${selectedActivity.emoji} ${selectedActivity.label} — ${selectedMinutes}m`}
          </Button>
        )}

        {/* Recently added this session */}
        {recentlyAdded.length > 0 && (
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">Added today:</Typography>
            {recentlyAdded.map((item, i) => (
              <Typography key={i} variant="body2" color="success.main">
                ✓ {item.label} — {item.minutes}m
              </Typography>
            ))}
            <Typography variant="caption" color="text.secondary">
              Total added: {recentlyAdded.reduce((sum, i) => sum + i.minutes, 0)}m
            </Typography>
          </Stack>
        )}
      </Stack>
    </SectionCard>
  )
}
