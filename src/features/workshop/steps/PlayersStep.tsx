import { useEffect, useRef, useState } from 'react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CloseIcon from '@mui/icons-material/Close'
import IconButton from '@mui/material/IconButton'
import PersonIcon from '@mui/icons-material/Person'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { doc, getDoc } from 'firebase/firestore'
import type { Child, AvatarProfile, StoryPlayer } from '../../../core/types'
import { useTTS } from '../../../core/hooks/useTTS'
import { useFamilyId } from '../../../core/auth/useAuth'
import { useChildren } from '../../../core/hooks/useChildren'
import { avatarProfilesCollection } from '../../../core/firebase/firestore'
import { compressPhotoToDataUrl } from '../../../core/utils/compressImage'

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

const MAX_PLAYERS = 4

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

  // Guest creation flow state
  const [guestFlow, setGuestFlow] = useState<'idle' | 'name' | 'photo'>('idle')
  const [guestName, setGuestName] = useState('')
  const [guestPhotoUrl, setGuestPhotoUrl] = useState<string | null>(null)
  const [addGuestTapped, setAddGuestTapped] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleAddGuestTap = () => {
    if (!addGuestTapped) {
      // First tap: speak prompt
      tts.cancel()
      tts.speak('Add a guest player!')
      setAddGuestTapped(true)
      return
    }
    // Second tap: start guest flow
    setAddGuestTapped(false)
    setGuestFlow('name')
    tts.cancel()
    tts.speak("What's your friend's name?")
  }

  const handleGuestNameNext = () => {
    if (!guestName.trim()) return
    setGuestFlow('photo')
    tts.cancel()
    tts.speak('Take their picture!')
  }

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await compressPhotoToDataUrl(file)
      setGuestPhotoUrl(dataUrl)
    } catch {
      // Photo failed — guest can still be added without a photo
    }
  }

  const handleGuestConfirm = () => {
    const guest: StoryPlayer = {
      id: `guest-${Date.now()}`,
      name: guestName.trim(),
      avatarUrl: guestPhotoUrl ?? undefined,
      isCreator: false,
      isGuest: true,
    }
    onChange([...value, guest])
    // Reset flow
    setGuestFlow('idle')
    setGuestName('')
    setGuestPhotoUrl(null)
  }

  const handleGuestCancel = () => {
    setGuestFlow('idle')
    setGuestName('')
    setGuestPhotoUrl(null)
  }

  const handleRemoveGuest = (guestId: string) => {
    onChange(value.filter((p) => p.id !== guestId))
  }

  const selectedCount = value.length
  const guestPlayers = value.filter((p) => p.isGuest)
  const canAddGuest = selectedCount < MAX_PLAYERS

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Who's playing?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Pick your players! Tap to hear, tap again to pick.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {selectedCount} of {MAX_PLAYERS} players max
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

        {/* Guest player cards */}
        {guestPlayers.map((guest) => (
          <Card
            key={guest.id}
            elevation={4}
            sx={{
              border: '2px solid',
              borderColor: 'primary.main',
              bgcolor: 'primary.50',
              position: 'relative',
            }}
          >
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <Avatar
                src={guest.avatarUrl}
                alt={guest.name}
                sx={{ width: 64, height: 64 }}
              >
                {guest.name.charAt(0).toUpperCase()}
              </Avatar>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {guest.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Guest
              </Typography>
              <IconButton
                size="small"
                onClick={() => handleRemoveGuest(guest.id)}
                sx={{ position: 'absolute', top: 4, right: 4 }}
                aria-label={`Remove ${guest.name}`}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
              <CheckCircleIcon
                color="primary"
                sx={{ position: 'absolute', top: 8, left: 8 }}
              />
            </Box>
          </Card>
        ))}

        {/* Add Guest card */}
        {canAddGuest && guestFlow === 'idle' && (
          <Card
            elevation={addGuestTapped ? 2 : 0}
            sx={{
              border: '2px dashed',
              borderColor: addGuestTapped ? 'secondary.main' : 'divider',
              transform: addGuestTapped ? 'scale(1.03)' : 'scale(1)',
              transition: 'all 0.2s',
            }}
          >
            <CardActionArea
              onClick={handleAddGuestTap}
              sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
            >
              <Avatar sx={{ width: 64, height: 64, bgcolor: 'grey.200', fontSize: '2rem' }}>
                📸
              </Avatar>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Add a Guest
              </Typography>
            </CardActionArea>
          </Card>
        )}
      </Box>

      {/* Guest creation flow */}
      {guestFlow === 'name' && (
        <Box sx={{ mt: 2, p: 2, border: '2px solid', borderColor: 'secondary.main', borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            What's their name?
          </Typography>
          <TextField
            autoFocus
            fullWidth
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Type or dictate a name"
            inputProps={{ style: { fontSize: '1.25rem' } }}
            sx={{ mb: 1.5 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleGuestNameNext()
            }}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" onClick={handleGuestNameNext} disabled={!guestName.trim()}>
              Next
            </Button>
            <Button variant="text" onClick={handleGuestCancel}>
              Cancel
            </Button>
          </Box>
        </Box>
      )}

      {guestFlow === 'photo' && (
        <Box sx={{ mt: 2, p: 2, border: '2px solid', borderColor: 'secondary.main', borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Take {guestName.trim()}'s picture!
          </Typography>
          {guestPhotoUrl ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
              <Avatar src={guestPhotoUrl} alt={guestName} sx={{ width: 96, height: 96 }} />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="contained" onClick={handleGuestConfirm}>
                  Add {guestName.trim()}
                </Button>
                <Button variant="outlined" onClick={() => { setGuestPhotoUrl(null); fileInputRef.current?.click() }}>
                  Retake
                </Button>
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
              <Button
                variant="contained"
                size="large"
                onClick={() => fileInputRef.current?.click()}
                sx={{ fontSize: '1.1rem', py: 1.5, px: 3 }}
              >
                📸 Take Photo
              </Button>
              <Button variant="text" onClick={handleGuestConfirm}>
                Skip photo
              </Button>
            </Box>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoCapture}
            style={{ display: 'none' }}
          />
          <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'center' }}>
            <Button variant="text" onClick={handleGuestCancel}>
              Cancel
            </Button>
          </Box>
        </Box>
      )}

      {selectedCount < 2 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Pick at least 2 players to continue.
        </Typography>
      )}
    </Box>
  )
}
