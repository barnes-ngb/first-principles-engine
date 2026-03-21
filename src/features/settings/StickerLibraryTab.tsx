import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import { deleteDoc, doc, getDocs, orderBy, query, setDoc } from 'firebase/firestore'

import { stickerLibraryCollection } from '../../core/firebase/firestore'
import { useFamilyId } from '../../core/auth/useAuth'
import type { Sticker, StickerTag } from '../../core/types/domain'

const STICKER_TAG_LABELS: Record<StickerTag, string> = {
  animal: 'Animal',
  nature: 'Nature',
  minecraft: 'Minecraft',
  fantasy: 'Fantasy',
  character: 'Character',
  object: 'Object',
  vehicle: 'Vehicle',
  food: 'Food',
  faith: 'Faith',
  other: 'Other',
}

const STICKER_TAGS_ORDERED: StickerTag[] = [
  'animal', 'minecraft', 'fantasy', 'nature', 'character', 'object', 'vehicle', 'food', 'faith', 'other',
]

function withDefaults(sticker: Sticker): Sticker {
  return {
    ...sticker,
    tags: sticker.tags ?? ['other'],
    childProfile: sticker.childProfile ?? 'both',
  }
}

export default function StickerLibraryTab() {
  const familyId = useFamilyId()
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [loading, setLoading] = useState(false)
  const [editTarget, setEditTarget] = useState<Sticker | null>(null)
  const [editTags, setEditTags] = useState<StickerTag[]>([])
  const [editProfile, setEditProfile] = useState<'lincoln' | 'london' | 'both'>('both')
  const [deleteTarget, setDeleteTarget] = useState<Sticker | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!familyId) return
    setLoading(true)
    const q = query(stickerLibraryCollection(familyId), orderBy('createdAt', 'desc'))
    const snap = await getDocs(q)
    setStickers(snap.docs.map((d) => withDefaults({ ...d.data(), id: d.id })))
    setLoading(false)
  }, [familyId])

  useEffect(() => { void load() }, [load])

  const handleOpenEdit = useCallback((sticker: Sticker) => {
    setEditTarget(sticker)
    setEditTags(sticker.tags ?? ['other'])
    setEditProfile(sticker.childProfile ?? 'both')
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editTarget?.id) return
    setSaving(true)
    const updated: Sticker = { ...editTarget, tags: editTags, childProfile: editProfile }
    try {
      await setDoc(doc(stickerLibraryCollection(familyId), editTarget.id), updated)
      setStickers((prev) => prev.map((s) => s.id === editTarget.id ? updated : s))
    } finally {
      setSaving(false)
      setEditTarget(null)
    }
  }, [editTarget, editTags, editProfile, familyId])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget?.id) return
    await deleteDoc(doc(stickerLibraryCollection(familyId), deleteTarget.id))
    setStickers((prev) => prev.filter((s) => s.id !== deleteTarget.id))
    setDeleteTarget(null)
  }, [deleteTarget, familyId])

  if (loading) {
    return (
      <Stack alignItems="center" py={4}>
        <CircularProgress />
      </Stack>
    )
  }

  if (stickers.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        No stickers yet. Generate some in the book editor!
      </Typography>
    )
  }

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {stickers.length} sticker{stickers.length !== 1 ? 's' : ''} in your library
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 2,
        }}
      >
        {stickers.map((sticker) => (
          <Box
            key={sticker.id}
            sx={{
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <Box
              component="img"
              src={sticker.url}
              alt={sticker.label}
              sx={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
            />
            <Box sx={{ p: 0.75 }}>
              {/* Child profile badge */}
              {sticker.childProfile && sticker.childProfile !== 'both' && (
                <Chip
                  label={sticker.childProfile.charAt(0).toUpperCase() + sticker.childProfile.slice(1)}
                  size="small"
                  color="primary"
                  sx={{ mb: 0.5, fontSize: '0.65rem', height: 18 }}
                />
              )}
              {/* Tag chips */}
              <Box sx={{ display: 'flex', gap: 0.25, flexWrap: 'wrap' }}>
                {(sticker.tags ?? ['other']).map((tag) => (
                  <Chip
                    key={tag}
                    label={STICKER_TAG_LABELS[tag]}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.6rem', height: 16 }}
                  />
                ))}
              </Box>
            </Box>
            {/* Action buttons */}
            <Stack
              direction="row"
              sx={{
                position: 'absolute',
                top: 2,
                right: 2,
                bgcolor: 'rgba(255,255,255,0.85)',
                borderRadius: 1,
              }}
            >
              <IconButton size="small" onClick={() => handleOpenEdit(sticker)} sx={{ p: 0.5 }}>
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton size="small" onClick={() => setDeleteTarget(sticker)} sx={{ p: 0.5 }}>
                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Stack>
          </Box>
        ))}
      </Box>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Sticker</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {editTarget && (
              <Box sx={{ textAlign: 'center' }}>
                <Box
                  component="img"
                  src={editTarget.url}
                  alt={editTarget.label}
                  sx={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 2 }}
                />
              </Box>
            )}

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Tags:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {STICKER_TAGS_ORDERED.map((tag) => (
                  <Chip
                    key={tag}
                    label={STICKER_TAG_LABELS[tag]}
                    size="small"
                    variant={editTags.includes(tag) ? 'filled' : 'outlined'}
                    onClick={() =>
                      setEditTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                      )
                    }
                  />
                ))}
              </Box>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                For:
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {(['lincoln', 'london', 'both'] as const).map((p) => (
                  <Chip
                    key={p}
                    label={p === 'both' ? 'Both' : p.charAt(0).toUpperCase() + p.slice(1)}
                    size="small"
                    variant={editProfile === p ? 'filled' : 'outlined'}
                    onClick={() => setEditProfile(p)}
                  />
                ))}
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => { void handleSaveEdit() }}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs">
        <DialogTitle>Delete sticker?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will permanently remove the sticker from your library.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => { void handleDelete() }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
