import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import { addDoc, getDocs, orderBy, query, doc, setDoc } from 'firebase/firestore'

import { stickerLibraryCollection } from '../../core/firebase/firestore'
import { useAI } from '../../core/ai/useAI'
import type { Sticker, StickerTag } from '../../core/types/domain'
import { StickerCategory } from '../../core/types/enums'

interface StickerPickerProps {
  open: boolean
  onClose: () => void
  familyId: string
  childName?: string
  childProfile?: 'lincoln' | 'london'
  onSelectSticker: (sticker: Sticker) => void
}

const CATEGORY_LABELS: Record<string, string> = {
  animals: 'Animals',
  minecraft: 'Minecraft',
  nature: 'Nature',
  people: 'People',
  fantasy: 'Fantasy',
  vehicles: 'Vehicles',
  custom: 'Custom',
}

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

/** Suggest 2-3 tags from a prompt via keyword matching. */
function suggestTagsFromPrompt(prompt: string): StickerTag[] {
  const text = prompt.toLowerCase()
  const suggestions: StickerTag[] = []

  if (text.includes('dog') || text.includes('cat') || text.includes('bunny') || text.includes('pig') ||
      text.includes('lion') || text.includes('bear') || text.includes('rabbit') || text.includes('horse') ||
      text.includes('bird') || text.includes('fish') || text.includes('animal') || text.includes('fox') ||
      text.includes('deer') || text.includes('elephant') || text.includes('whale')) {
    suggestions.push('animal')
  }
  if (text.includes('minecraft') || text.includes('creeper') || text.includes('sword') || text.includes('pickaxe') ||
      text.includes('diamond') || text.includes('enderman') || text.includes('cave') || text.includes('nether') ||
      text.includes('crafting') || text.includes('pixel')) {
    suggestions.push('minecraft')
  }
  if (text.includes('dragon') || text.includes('fairy') || text.includes('wizard') || text.includes('magic') ||
      text.includes('unicorn') || text.includes('enchant') || text.includes('potion') || text.includes('fantasy')) {
    suggestions.push('fantasy')
  }
  if (text.includes('tree') || text.includes('flower') || text.includes('nature') || text.includes('grass') ||
      text.includes('mountain') || text.includes('river') || text.includes('forest') || text.includes('ocean') ||
      text.includes('rainbow') || text.includes('sun') || text.includes('moon') || text.includes('star')) {
    suggestions.push('nature')
  }
  if (text.includes('car') || text.includes('truck') || text.includes('train') || text.includes('vehicle') ||
      text.includes('bus') || text.includes('plane') || text.includes('rocket') || text.includes('bike')) {
    suggestions.push('vehicle')
  }
  if (text.includes('food') || text.includes('cake') || text.includes('pizza') || text.includes('cookie') ||
      text.includes('fruit') || text.includes('apple') || text.includes('banana') || text.includes('ice cream')) {
    suggestions.push('food')
  }
  if (text.includes('god') || text.includes('jesus') || text.includes('faith') || text.includes('prayer') ||
      text.includes('cross') || text.includes('bible') || text.includes('angel')) {
    suggestions.push('faith')
  }
  if (suggestions.length === 0) suggestions.push('object')

  return suggestions.slice(0, 3)
}

/** Apply migration defaults to stickers missing tags/childProfile. */
function withDefaults(sticker: Sticker): Sticker {
  return {
    ...sticker,
    tags: sticker.tags ?? ['other'],
    childProfile: sticker.childProfile ?? 'both',
  }
}

export default function StickerPicker({
  open,
  onClose,
  familyId,
  childName,
  childProfile,
  onSelectSticker,
}: StickerPickerProps) {
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [loadingStickers, setLoadingStickers] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<StickerTag | null>(null)
  const [childFilter, setChildFilter] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createPrompt, setCreatePrompt] = useState('')

  // Post-generation tagging state
  const [pendingSticker, setPendingSticker] = useState<Sticker | null>(null)
  const [pendingTags, setPendingTags] = useState<StickerTag[]>([])
  const [pendingProfile, setPendingProfile] = useState<'lincoln' | 'london' | 'both'>('both')

  const { generateImage, loading: generating } = useAI()

  // Load stickers from Firestore
  useEffect(() => {
    if (!open || !familyId) return
    let cancelled = false
    const load = async () => {
      setLoadingStickers(true)
      const q = query(stickerLibraryCollection(familyId), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      if (cancelled) return
      setStickers(snap.docs.map((d) => withDefaults({ ...d.data(), id: d.id })))
      setLoadingStickers(false)
    }
    void load()
    return () => { cancelled = true }
  }, [open, familyId])

  // Available tags (only show tags that have at least 1 sticker)
  const availableTags = STICKER_TAGS_ORDERED.filter((tag) =>
    stickers.some((s) => (s.tags ?? ['other']).includes(tag)),
  )

  const filteredStickers = stickers.filter((s) => {
    if (activeCategory && s.category !== activeCategory) return false
    if (activeTag && !(s.tags ?? ['other']).includes(activeTag)) return false
    if (childFilter && childProfile) {
      const cp = s.childProfile ?? 'both'
      if (cp !== 'both' && cp !== childProfile) return false
    }
    return true
  })

  const handleSelectSticker = useCallback(
    (sticker: Sticker) => {
      onSelectSticker(sticker)
      onClose()
    },
    [onSelectSticker, onClose],
  )

  const handleCreateSticker = useCallback(async () => {
    if (!createPrompt.trim()) return
    const result = await generateImage({
      familyId,
      prompt: createPrompt.trim(),
      style: 'book-sticker',
      size: '1024x1024',
    })
    if (!result) return

    const suggestedTags = suggestTagsFromPrompt(createPrompt)
    const autoProfile: 'lincoln' | 'london' | 'both' = childProfile ?? 'both'

    const newSticker: Omit<Sticker, 'id'> = {
      url: result.url,
      storagePath: result.storagePath,
      label: createPrompt.trim(),
      category: StickerCategory.Custom,
      childId: null,
      prompt: createPrompt.trim(),
      createdAt: new Date().toISOString(),
      tags: suggestedTags,
      childProfile: autoProfile,
    }
    const docRef = await addDoc(stickerLibraryCollection(familyId), newSticker as Sticker)
    const saved = { ...newSticker, id: docRef.id } as Sticker

    setStickers((prev) => [saved, ...prev])
    setShowCreateDialog(false)
    setCreatePrompt('')

    // Show quick tagging step
    setPendingSticker(saved)
    setPendingTags(suggestedTags)
    setPendingProfile(autoProfile)
  }, [createPrompt, familyId, childProfile, generateImage])

  const handleConfirmTagging = useCallback(async () => {
    if (!pendingSticker?.id) {
      if (pendingSticker) onSelectSticker(pendingSticker)
      onClose()
      setPendingSticker(null)
      return
    }

    const updated: Sticker = { ...pendingSticker, tags: pendingTags, childProfile: pendingProfile }

    try {
      await setDoc(doc(stickerLibraryCollection(familyId), pendingSticker.id), updated)
      setStickers((prev) => prev.map((s) => s.id === pendingSticker.id ? updated : s))
    } catch {
      // Save failed — still use the sticker
    }

    onSelectSticker(updated)
    onClose()
    setPendingSticker(null)
  }, [pendingSticker, pendingTags, pendingProfile, familyId, onSelectSticker, onClose])

  if (!open) return null

  // ── Post-generation tagging screen ────────────────────────────
  if (pendingSticker) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>What kind of sticker is this?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Box
                component="img"
                src={pendingSticker.url}
                alt={pendingSticker.label}
                sx={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 2 }}
              />
            </Box>

            {/* Tag chips */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Tags (tap to select):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {STICKER_TAGS_ORDERED.map((tag) => (
                  <Chip
                    key={tag}
                    label={STICKER_TAG_LABELS[tag]}
                    size="small"
                    variant={pendingTags.includes(tag) ? 'filled' : 'outlined'}
                    onClick={() =>
                      setPendingTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                      )
                    }
                  />
                ))}
              </Box>
            </Box>

            {/* Child profile */}
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
                    variant={pendingProfile === p ? 'filled' : 'outlined'}
                    onClick={() => setPendingProfile(p)}
                  />
                ))}
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => { void handleConfirmTagging() }}
          >
            Use Sticker!
          </Button>
        </DialogActions>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Stickers</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {/* Child filter toggle */}
          {childName && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={`For ${childName}`}
                variant={childFilter ? 'filled' : 'outlined'}
                onClick={() => setChildFilter((v) => !v)}
                size="small"
                color={childFilter ? 'primary' : 'default'}
              />
            </Box>
          )}

          {/* Tag filter chips */}
          {availableTags.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label="All"
                variant={activeTag === null ? 'filled' : 'outlined'}
                onClick={() => setActiveTag(null)}
                size="small"
              />
              {availableTags.map((tag) => (
                <Chip
                  key={tag}
                  label={STICKER_TAG_LABELS[tag]}
                  variant={activeTag === tag ? 'filled' : 'outlined'}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  size="small"
                />
              ))}
            </Box>
          )}

          {/* Category chips (legacy) */}
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            <Chip
              label="All Categories"
              variant={activeCategory === null ? 'filled' : 'outlined'}
              onClick={() => setActiveCategory(null)}
              size="small"
            />
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                variant={activeCategory === key ? 'filled' : 'outlined'}
                onClick={() => setActiveCategory(activeCategory === key ? null : key)}
                size="small"
              />
            ))}
          </Box>

          {/* Sticker grid */}
          {loadingStickers ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={32} />
            </Stack>
          ) : filteredStickers.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography variant="body2" color="text.secondary">
                No stickers yet — make one!
              </Typography>
            </Box>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 1,
              }}
            >
              {filteredStickers.map((sticker) => (
                <Box
                  key={sticker.id}
                  onClick={() => handleSelectSticker(sticker)}
                  sx={{
                    aspectRatio: '1',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    '&:hover': { borderColor: 'primary.main', boxShadow: 2 },
                  }}
                >
                  <Box
                    component="img"
                    src={sticker.url}
                    alt={sticker.label}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Box>
              ))}
            </Box>
          )}

          {/* Make a sticker button */}
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setShowCreateDialog(true)}
            sx={{ minHeight: 48 }}
          >
            Make a sticker
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {/* Create sticker dialog */}
      <Dialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Make a Sticker</DialogTitle>
        <DialogContent>
          <TextField
            label="Describe your sticker"
            placeholder="A cute dragon..."
            value={createPrompt}
            onChange={(e) => setCreatePrompt(e.target.value)}
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
            disabled={generating}
          />
          {generating && (
            <Stack alignItems="center" spacing={1} sx={{ mt: 2 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">
                Creating your sticker...
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateDialog(false)} disabled={generating}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => { void handleCreateSticker() }}
            disabled={!createPrompt.trim() || generating}
          >
            Create!
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
