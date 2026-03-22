import { useEffect, useState } from 'react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import PersonIcon from '@mui/icons-material/Person'
import Typography from '@mui/material/Typography'
import { doc, getDoc } from 'firebase/firestore'
import type { Child, AvatarProfile, StoryPlayer } from '../../../core/types'
import { useTTS } from '../../../core/hooks/useTTS'
import { useFamilyId } from '../../../core/auth/useAuth'
import { useChildren } from '../../../core/hooks/useChildren'
import { avatarProfilesCollection } from '../../../core/firebase/firestore'

interface FamilyMember {
  id: string
  name: string
  avatarUrl?: string
  isCreator: boolean
}

const PARENT_MEMBERS: FamilyMember[] = [
  { id: 'parent-shelly', name: 'Mom', isCreator: false },
  { id: 'parent-nathan', name: 'Dad', isCreator: false },
]

interface PlayersStepProps {
  value: StoryPlayer[]
  onChange: (players: StoryPlayer[]) => void
  creatorChildId: string
}

export default function PlayersStep({ value, onChange, creatorChildId }: PlayersStepProps) {
  const tts = useTTS({ rate: 0.85 })
  const familyId = useFamilyId()
  const { children } = useChildren()
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [lastTapped, setLastTapped] = useState<string | null>(null)

  // Build family members list with avatars
  useEffect(() => {
    let cancelled = false

    const loadMembers = async () => {
      if (!familyId || children.length === 0) return

      const childMembers: FamilyMember[] = await Promise.all(
        children.map(async (child: Child) => {
          let avatarUrl: string | undefined
          try {
            const profileRef = doc(avatarProfilesCollection(familyId), child.id)
            const profileSnap = await getDoc(profileRef)
            if (profileSnap.exists()) {
              const profile = profileSnap.data() as AvatarProfile
              avatarUrl = profile.photoUrl
            }
          } catch {
            // No avatar — will use fallback
          }
          return {
            id: child.id,
            name: child.name,
            avatarUrl,
            isCreator: child.id === creatorChildId,
          }
        }),
      )

      if (cancelled) return

      const allMembers = [...childMembers, ...PARENT_MEMBERS]
      setFamilyMembers(allMembers)

      // Auto-select the creator if not already selected
      if (value.length === 0) {
        const creator = childMembers.find((m) => m.isCreator)
        if (creator) {
          onChange([{ id: creator.id, name: creator.name, avatarUrl: creator.avatarUrl, isCreator: true }])
        }
      }
    }

    loadMembers()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, children, creatorChildId])

  const isSelected = (memberId: string) => value.some((p) => p.id === memberId)
  const isCreator = (memberId: string) => memberId === creatorChildId

  const handleTap = (member: FamilyMember) => {
    // Creator can't be deselected
    if (isCreator(member.id) && isSelected(member.id)) {
      tts.cancel()
      tts.speak(member.name)
      return
    }

    // First tap: speak name and highlight
    if (lastTapped !== member.id) {
      tts.cancel()
      tts.speak(member.name)
      setLastTapped(member.id)
      return
    }

    // Second tap: toggle selection
    setLastTapped(null)
    if (isSelected(member.id)) {
      onChange(value.filter((p) => p.id !== member.id))
    } else {
      onChange([
        ...value,
        {
          id: member.id,
          name: member.name,
          avatarUrl: member.avatarUrl,
          isCreator: member.isCreator,
        },
      ])
    }
  }

  const selectedCount = value.length

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Who's playing?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Pick your players! Tap to hear, tap again to pick.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {selectedCount} of {familyMembers.length} players selected
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 1.5,
        }}
      >
        {familyMembers.map((member) => {
          const selected = isSelected(member.id)
          const highlighted = lastTapped === member.id && !selected
          const creator = isCreator(member.id)

          return (
            <Card
              key={member.id}
              elevation={selected ? 4 : highlighted ? 2 : 0}
              sx={{
                border: '2px solid',
                borderColor: selected
                  ? 'primary.main'
                  : highlighted
                    ? 'secondary.main'
                    : 'divider',
                bgcolor: selected ? 'primary.50' : 'background.paper',
                transform: highlighted ? 'scale(1.03)' : 'scale(1)',
                transition: 'all 0.2s',
                position: 'relative',
              }}
            >
              <CardActionArea
                onClick={() => handleTap(member)}
                sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
              >
                {/* Avatar */}
                {member.avatarUrl ? (
                  <Avatar
                    src={member.avatarUrl}
                    alt={member.name}
                    sx={{ width: 64, height: 64 }}
                  />
                ) : (
                  <Avatar
                    sx={{
                      width: 64,
                      height: 64,
                      bgcolor: selected ? 'primary.main' : 'grey.400',
                      fontSize: '1.5rem',
                    }}
                  >
                    {member.name === 'Mom' || member.name === 'Dad' ? (
                      <PersonIcon sx={{ fontSize: 32 }} />
                    ) : (
                      member.name.charAt(0).toUpperCase()
                    )}
                  </Avatar>
                )}

                {/* Name */}
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {member.name}
                </Typography>

                {/* Creator badge */}
                {creator && (
                  <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
                    Story Keeper
                  </Typography>
                )}

                {/* Check icon */}
                {selected && (
                  <CheckCircleIcon
                    color="primary"
                    sx={{ position: 'absolute', top: 8, right: 8 }}
                  />
                )}
              </CardActionArea>
            </Card>
          )
        })}
      </Box>

      {selectedCount < 2 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Pick at least 2 players to continue.
        </Typography>
      )}
    </Box>
  )
}
