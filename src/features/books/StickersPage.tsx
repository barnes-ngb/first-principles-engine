import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import BrushIcon from '@mui/icons-material/Brush'

import Page from '../../components/Page'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import { UserProfile } from '../../core/types/enums'
import { STICKER_TAG_LABELS } from '../../core/types'
import type { StickerTag } from '../../core/types'
import StickerLibraryTab from '../settings/StickerLibraryTab'
import { STICKER_TAGS_ORDERED } from './stickerTagging'
import MakeStickerDialog from './MakeStickerDialog'
import SketchScanner from './SketchScanner'

/**
 * Stickers page in Books — accessible to kids and parents alike (no parent
 * gate). Shows the sticker library and a standalone "Make a Sticker" flow that
 * generates + saves to the library without an open book. First slice of the
 * FEAT-33 Sticker/Character Studio.
 */
export default function StickersPage() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const { profile } = useProfile()
  // Pricing/publishing is parent-only (catalog design §6) — gates the FEAT-82
  // "Add to catalog" affordance on stickers.
  const isParent = profile === UserProfile.Parents
  const childName = activeChild?.name ?? ''
  const childProfile: 'lincoln' | 'london' | undefined =
    childName.toLowerCase() === 'lincoln'
      ? 'lincoln'
      : childName.toLowerCase() === 'london'
        ? 'london'
        : undefined
  const isLincoln = childProfile === 'lincoln'

  const [showMake, setShowMake] = useState(false)
  const [showDrawing, setShowDrawing] = useState(false)
  const [childFilter, setChildFilter] = useState(false)
  // undefined = "All"; otherwise narrow the library to one tag.
  const [tagFilter, setTagFilter] = useState<StickerTag | undefined>(undefined)
  // Bumped after a sticker is made so the library reloads.
  const [refreshSignal, setRefreshSignal] = useState(0)

  return (
    <Page>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/books')}
          sx={{ textTransform: 'none' }}
        >
          Books
        </Button>
      </Stack>

      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        sx={{ mb: 2 }}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontWeight: 700,
            ...(isLincoln
              ? { fontFamily: '"Press Start 2P", monospace', fontSize: '1rem' }
              : {}),
          }}
        >
          Stickers
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          startIcon={<BrushIcon />}
          onClick={() => setShowDrawing(true)}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          From a Drawing
        </Button>
        <Button
          variant="contained"
          startIcon={<AutoAwesomeIcon />}
          onClick={() => setShowMake(true)}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          Make a Sticker
        </Button>
      </Stack>

      {/* Optional "for the current child" filter */}
      {childProfile && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
          <Chip
            label="All"
            size="small"
            onClick={() => setChildFilter(false)}
            color={!childFilter ? 'primary' : 'default'}
            variant={!childFilter ? 'filled' : 'outlined'}
          />
          <Chip
            label={`For ${childName}`}
            size="small"
            onClick={() => setChildFilter(true)}
            color={childFilter ? 'primary' : 'default'}
            variant={childFilter ? 'filled' : 'outlined'}
          />
        </Stack>
      )}

      {/* Tag filter row — single-select with an "All" default */}
      <Stack
        direction="row"
        spacing={1}
        sx={{ mb: 2 }}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
      >
        <Chip
          label="All"
          size="small"
          onClick={() => setTagFilter(undefined)}
          color={!tagFilter ? 'primary' : 'default'}
          variant={!tagFilter ? 'filled' : 'outlined'}
        />
        {STICKER_TAGS_ORDERED.map((tag) => (
          <Chip
            key={tag}
            label={STICKER_TAG_LABELS[tag]}
            size="small"
            onClick={() => setTagFilter((prev) => (prev === tag ? undefined : tag))}
            color={tagFilter === tag ? 'primary' : 'default'}
            variant={tagFilter === tag ? 'filled' : 'outlined'}
          />
        ))}
      </Stack>

      <StickerLibraryTab
        refreshSignal={refreshSignal}
        emptyDescription="No stickers yet — make your first one!"
        childProfileFilter={childFilter ? childProfile : undefined}
        tagFilter={tagFilter}
        groupByDrawing
        enableSelectToPrint
        canEdit={isParent}
      />

      {familyId && (
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setShowMake(true)}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Make a Sticker
          </Button>
        </Box>
      )}

      <MakeStickerDialog
        open={showMake}
        onClose={() => setShowMake(false)}
        familyId={familyId}
        childProfile={childProfile}
        onSaved={() => setRefreshSignal((n) => n + 1)}
      />

      <SketchScanner
        open={showDrawing}
        onClose={() => setShowDrawing(false)}
        familyId={familyId}
        childProfile={childProfile}
        childName={childName}
        onSaved={() => setRefreshSignal((n) => n + 1)}
      />
    </Page>
  )
}
