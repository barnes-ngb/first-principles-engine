import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import type { Child } from '../core/types'
import { useAuth } from '../core/auth/useAuth'
import AvatarThumbnail from '../features/avatar/AvatarThumbnail'
import { useAvatarProfile } from '../features/avatar/useAvatarProfile'
import AddChildDialog from './AddChildDialog'

interface ChildSelectorProps {
  children: Child[]
  selectedChildId: string
  onSelect: (childId: string) => void
  onChildAdded?: (child: Child) => void
  isLoading?: boolean
  emptyMessage?: string
}

function ChildAvatarIcon({ childId }: { childId: string }) {
  const { familyId } = useAuth()
  const avatarProfile = useAvatarProfile(familyId ?? undefined, childId)
  if (!avatarProfile) return null
  return (
    <AvatarThumbnail
      features={avatarProfile.characterFeatures}
      ageGroup={avatarProfile.ageGroup}
      equippedPieces={avatarProfile.equippedPieces}
      totalXp={avatarProfile.totalXp}
      size={28}
    />
  )
}

export default function ChildSelector({
  children,
  selectedChildId,
  onSelect,
  onChildAdded,
  isLoading,
  emptyMessage = 'No children added yet.',
}: ChildSelectorProps) {
  const [showAddDialog, setShowAddDialog] = useState(false)

  if (isLoading) {
    return (
      <Typography color="text.secondary" variant="body2">
        Loading...
      </Typography>
    )
  }

  if (children.length === 0) {
    return (
      <Stack spacing={1.5} alignItems="flex-start">
        <Typography color="text.secondary" variant="body2">
          {emptyMessage}
        </Typography>
        {onChildAdded && (
          <>
            <Button
              variant="contained"
              startIcon={<PersonAddIcon />}
              onClick={() => setShowAddDialog(true)}
            >
              Add Child
            </Button>
            <AddChildDialog
              open={showAddDialog}
              onClose={() => setShowAddDialog(false)}
              onChildAdded={(child) => {
                onChildAdded(child)
                onSelect(child.id)
              }}
            />
          </>
        )}
      </Stack>
    )
  }

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
      {children.map((child) => {
        const selected = child.id === selectedChildId
        return (
          <Chip
            key={child.id}
            icon={
              <Box sx={{ display: 'flex', alignItems: 'center', ml: 0.5 }}>
                <ChildAvatarIcon childId={child.id} />
              </Box>
            }
            label={child.name}
            variant={selected ? 'filled' : 'outlined'}
            color={selected ? 'primary' : 'default'}
            onClick={() => onSelect(child.id)}
            sx={{
              fontWeight: selected ? 700 : 400,
              fontSize: '0.9rem',
              py: 2,
            }}
          />
        )
      })}
      {onChildAdded && (
        <>
          <Chip
            icon={<PersonAddIcon />}
            label="Add"
            variant="outlined"
            onClick={() => setShowAddDialog(true)}
            sx={{ fontSize: '0.9rem', py: 2 }}
          />
          <AddChildDialog
            open={showAddDialog}
            onClose={() => setShowAddDialog(false)}
            onChildAdded={(child) => {
              onChildAdded(child)
              onSelect(child.id)
            }}
          />
        </>
      )}
    </Stack>
  )
}
