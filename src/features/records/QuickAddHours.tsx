import { useState, useCallback } from 'react'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { addDoc } from 'firebase/firestore'

import SectionCard from '../../components/SectionCard'
import { hoursAdjustmentsCollection } from '../../core/firebase/firestore'
import type { SubjectBucket } from '../../core/types/enums'

interface QuickActivity {
  label: string
  emoji: string
  subject: SubjectBucket
}

const QUICK_ACTIVITIES: QuickActivity[] = [
  // PE / Physical
  { label: 'Park / Playground', emoji: '🏞️', subject: 'PE' },
  { label: 'Bike Ride', emoji: '🚲', subject: 'PE' },
  { label: 'Swimming', emoji: '🏊', subject: 'PE' },
  { label: 'Walk / Hike', emoji: '🥾', subject: 'PE' },
  { label: 'Sports / Games', emoji: '⚽', subject: 'PE' },
  // Art / Creative
  { label: 'Drawing / Coloring', emoji: '🎨', subject: 'Art' },
  { label: 'Crafts / Building', emoji: '✂️', subject: 'Art' },
  { label: 'LEGO / Construction', emoji: '🧱', subject: 'Art' },
  // Music
  { label: 'Music / Singing', emoji: '🎵', subject: 'Music' },
  { label: 'Worship Songs', emoji: '🙏', subject: 'Music' },
  // Life Skills
  { label: 'Cooking / Baking', emoji: '🍳', subject: 'Other' },
  { label: 'Chores with Teaching', emoji: '🧹', subject: 'Other' },
  { label: 'Grocery / Shopping', emoji: '🛒', subject: 'Other' },
  { label: 'Gardening', emoji: '🌱', subject: 'Other' },
  // Enrichment
  { label: 'Library Visit', emoji: '📚', subject: 'Other' },
  { label: 'Museum / Zoo', emoji: '🦁', subject: 'Other' },
  { label: 'Nature Walk / Explore', emoji: '🔍', subject: 'Science' },
  { label: 'Church / Sunday School', emoji: '⛪', subject: 'Other' },
  // Screen-based
  { label: 'Educational Apps', emoji: '📱', subject: 'Other' },
  { label: 'Minecraft (building)', emoji: '⛏️', subject: 'Other' },
  { label: 'Documentary / Educational Video', emoji: '🎬', subject: 'Other' },
]

const DURATION_OPTIONS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 hour', minutes: 60 },
  { label: '1.5 hrs', minutes: 90 },
  { label: '2 hours', minutes: 120 },
]

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
  const [saving, setSaving] = useState(false)
  const [recentlyAdded, setRecentlyAdded] = useState<Array<{ label: string; minutes: number }>>([])

  const handleSave = useCallback(async () => {
    if (!selectedActivity || !selectedMinutes) return
    setSaving(true)
    try {
      await addDoc(hoursAdjustmentsCollection(familyId), {
        childId,
        date,
        subjectBucket: selectedActivity.subject,
        minutes: selectedMinutes,
        reason: `Quick add: ${selectedActivity.label} (${selectedMinutes}m)`,
        source: 'quick-add',
        location: selectedActivity.subject === 'PE' ? 'Outside' : 'Home',
        createdAt: new Date().toISOString(),
      })

      setRecentlyAdded(prev => [...prev, { label: selectedActivity.label, minutes: selectedMinutes }])
      setSelectedActivity(null)
      setSelectedMinutes(null)
      onSaved(`${selectedActivity.emoji} ${selectedActivity.label} — ${selectedMinutes}m logged for ${childName}`)
    } catch (err) {
      console.error('Quick add failed:', err)
      onSaved('Failed to save. Try again.')
    }
    setSaving(false)
  }, [familyId, childId, date, selectedActivity, selectedMinutes, childName, onSaved])

  // Group activities by subject for display
  const groups = [
    { title: '🏃 Physical', activities: QUICK_ACTIVITIES.filter(a => a.subject === 'PE') },
    { title: '🎨 Creative', activities: QUICK_ACTIVITIES.filter(a => a.subject === 'Art') },
    { title: '🎵 Music', activities: QUICK_ACTIVITIES.filter(a => a.subject === 'Music') },
    { title: '🏠 Life Skills', activities: QUICK_ACTIVITIES.filter(a => a.subject === 'Other' && ['Cooking', 'Chores', 'Grocery', 'Garden'].some(k => a.label.includes(k))) },
    { title: '🌍 Enrichment', activities: QUICK_ACTIVITIES.filter(a => ['Library', 'Museum', 'Nature', 'Church'].some(k => a.label.includes(k))) },
    { title: '💻 Screen Learning', activities: QUICK_ACTIVITIES.filter(a => ['Educational Apps', 'Minecraft', 'Documentary'].some(k => a.label.includes(k))) },
  ]

  return (
    <SectionCard title="⚡ Quick Add Activity">
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Tap an activity and how long. These count toward your 1,000 hours.
        </Typography>

        {/* Activity picker — grouped */}
        {groups.map(group => (
          <Stack key={group.title} spacing={0.5}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {group.title}
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {group.activities.map(activity => (
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
