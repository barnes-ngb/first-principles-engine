import { useCallback, useEffect, useRef, useState } from 'react'
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CameraAltIcon from '@mui/icons-material/CameraAlt'

import Page from '../../components/Page'
import { app } from '../../core/firebase/firebase'
import { avatarProfilesCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { ARMOR_PIECES } from '../../core/types/domain'
import type { ArmorPiece, AvatarProfile } from '../../core/types/domain'
import ArmorPieceCard from './ArmorPieceCard'
import ArmorPieceModal from './ArmorPieceModal'
import UnlockCelebration from './UnlockCelebration'

const LINCOLN_QUICK_PICKS = ['In a cave', 'Fighting a dragon', 'With a torch']
const LONDON_QUICK_PICKS = ['In a flower field', 'Flying', 'With an animal friend']

export default function MyAvatarPage() {
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childId = activeChild?.id ?? ''
  const isLincoln = activeChild?.name?.toLowerCase() === 'lincoln'

  const [profile, setProfile] = useState<AvatarProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPiece, setSelectedPiece] = useState<ArmorPiece | null>(null)
  const [celebrationPiece, setCelebrationPiece] = useState<ArmorPiece | null>(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [generating, setGenerating] = useState(false)

  // Track previous unlockedPieces count to detect new unlocks
  const prevUnlockedCountRef = useRef(0)

  // ── Theme styles ────────────────────────────────────────────────
  const bgColor = isLincoln ? '#1a1a2e' : '#faf5ef'
  const textColor = isLincoln ? '#e0e0e0' : '#3d3d3d'
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  // ── Ensure avatar profile exists ────────────────────────────────
  useEffect(() => {
    if (!familyId || !childId) return

    const profileRef = doc(avatarProfilesCollection(familyId), childId)

    // Ensure profile exists with correct themeStyle
    const ensureProfile = async () => {
      const snap = await getDoc(profileRef)
      if (!snap.exists()) {
        await setDoc(profileRef, {
          childId,
          themeStyle: isLincoln ? 'minecraft' : 'platformer',
          unlockedPieces: [],
          generatedImageUrls: {},
          totalXp: 0,
          updatedAt: new Date().toISOString(),
        } satisfies AvatarProfile)
      }
    }
    void ensureProfile()
  }, [familyId, childId, isLincoln])

  // ── Real-time listener for avatar profile ───────────────────────
  useEffect(() => {
    if (!familyId || !childId) return

    setLoading(true)
    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    const unsub = onSnapshot(
      profileRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          setProfile(data)

          // Detect new unlock for celebration
          const count = data.unlockedPieces?.length ?? 0
          if (count > prevUnlockedCountRef.current && prevUnlockedCountRef.current > 0) {
            const newPiece = data.unlockedPieces[count - 1]
            setCelebrationPiece(newPiece)
          }
          prevUnlockedCountRef.current = count
        }
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsub
  }, [familyId, childId])

  // ── XP progress toward next piece ───────────────────────────────
  const nextPiece = ARMOR_PIECES.find((p) => !(profile?.unlockedPieces ?? []).includes(p.id))
  const allUnlocked = (profile?.unlockedPieces ?? []).length === ARMOR_PIECES.length
  const totalXp = profile?.totalXp ?? 0
  const progressPercent = nextPiece
    ? Math.min((totalXp / nextPiece.xpRequired) * 100, 100)
    : 100
  const xpToNext = nextPiece ? Math.max(nextPiece.xpRequired - totalXp, 0) : 0

  // ── Most recently unlocked piece ────────────────────────────────
  const lastUnlockedId =
    profile?.unlockedPieces.length ?? 0 > 0
      ? profile!.unlockedPieces[profile!.unlockedPieces.length - 1]
      : null
  const heroImageUrl = lastUnlockedId ? profile?.generatedImageUrls[lastUnlockedId] : undefined

  // ── Custom avatar generation ─────────────────────────────────────
  const handleGenerateCustom = useCallback(async () => {
    if (!profile || !familyId || !childId || !customPrompt.trim()) return
    setGenerating(true)
    try {
      const fns = getFunctions(app)
      const generateAvatarImageFn = httpsCallable<
        { familyId: string; childId: string; pieceId: string; themeStyle: string; pieceDescription: string },
        { url: string }
      >(fns, 'generateAvatarPiece')

      const result = await generateAvatarImageFn({
        familyId,
        childId,
        pieceId: 'custom',
        themeStyle: profile.themeStyle,
        pieceDescription: customPrompt.trim(),
      })

      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      await setDoc(profileRef, {
        ...profile,
        customAvatarUrl: result.data.url,
        updatedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.error('Custom avatar generation failed:', err)
    } finally {
      setGenerating(false)
    }
  }, [profile, familyId, childId, customPrompt])

  if (loading) {
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: accentColor }} />
      </Box>
    )
  }

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: bgColor, color: textColor, pb: 6 }}>
      <Page>
        {/* ── 1. Hero Section ─────────────────────────────────────── */}
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography
            variant="h4"
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '0.8rem' : '2rem',
              fontWeight: 700,
              color: accentColor,
              mb: 2,
            }}
          >
            {isLincoln ? '⚔️ My Armor' : '✨ My Armor of God'}
          </Typography>

          {heroImageUrl ? (
            <Box
              component="img"
              src={heroImageUrl}
              alt="Your latest armor piece"
              sx={{
                width: 200,
                height: 200,
                objectFit: 'cover',
                borderRadius: isLincoln ? 0 : 4,
                border: `4px solid ${accentColor}`,
                imageRendering: isLincoln ? 'pixelated' : 'auto',
                mx: 'auto',
                display: 'block',
              }}
            />
          ) : (
            <Box
              sx={{
                width: 200,
                height: 200,
                mx: 'auto',
                borderRadius: isLincoln ? 0 : 4,
                border: `4px dashed ${accentColor}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
              }}
            >
              <Typography sx={{ fontSize: '3rem' }}>🛡️</Typography>
              <Typography
                variant="caption"
                sx={{
                  color: isLincoln ? '#666' : '#aaa',
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                  fontSize: isLincoln ? '0.38rem' : '0.7rem',
                  textAlign: 'center',
                  px: 2,
                }}
              >
                Earn XP to unlock your first piece!
              </Typography>
            </Box>
          )}

          <Typography
            sx={{
              mt: 2,
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
              fontSize: isLincoln ? '0.5rem' : '1.1rem',
              color: textColor,
            }}
          >
            {activeChild?.name} — {totalXp} XP
          </Typography>
        </Box>

        {/* ── 2. XP Progress Bar ────────────────────────────────────── */}
        <Box sx={{ mb: 3, px: 1 }}>
          {allUnlocked ? (
            <Typography
              sx={{
                textAlign: 'center',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '0.5rem' : '1rem',
                color: accentColor,
                fontWeight: 700,
              }}
            >
              You have the full Armor of God! ⚔️
            </Typography>
          ) : (
            <>
              <Typography
                variant="body2"
                sx={{
                  mb: 1,
                  color: isLincoln ? '#aaa' : 'text.secondary',
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                  fontSize: isLincoln ? '0.42rem' : '0.8rem',
                }}
              >
                {xpToNext} more XP to unlock {nextPiece?.name}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={progressPercent}
                sx={{
                  height: 12,
                  borderRadius: isLincoln ? 0 : 6,
                  bgcolor: isLincoln ? '#333' : '#eee',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: accentColor,
                    borderRadius: isLincoln ? 0 : 6,
                  },
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  mt: 0.5,
                  display: 'block',
                  color: isLincoln ? '#666' : 'text.disabled',
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                  fontSize: isLincoln ? '0.38rem' : '0.65rem',
                }}
              >
                {totalXp} / {nextPiece?.xpRequired} XP
              </Typography>
            </>
          )}
        </Box>

        {/* ── 3. Armor Pieces Grid ─────────────────────────────────── */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1.5,
            mb: 3,
          }}
        >
          {ARMOR_PIECES.map((piece) => (
            <ArmorPieceCard
              key={piece.id}
              pieceId={piece.id}
              profile={profile}
              onTap={setSelectedPiece}
            />
          ))}
        </Box>

        {/* ── 5. Custom Avatar Section (all 6 unlocked) ─────────────── */}
        {allUnlocked && profile && (
          <Box
            sx={{
              mb: 3,
              p: 2,
              borderRadius: isLincoln ? 0 : 3,
              border: `2px solid ${accentColor}`,
              bgcolor: isLincoln ? 'rgba(126,252,32,0.05)' : 'rgba(232,160,191,0.1)',
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '0.6rem' : '1.1rem',
                color: accentColor,
                mb: 1,
              }}
            >
              Create Your Champion!
            </Typography>

            <Typography
              variant="body2"
              sx={{
                mb: 2,
                color: isLincoln ? '#aaa' : 'text.secondary',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                fontSize: isLincoln ? '0.4rem' : '0.875rem',
              }}
            >
              Describe your ultimate warrior...
            </Typography>

            {/* Quick-pick chips */}
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2, gap: 1 }}>
              {(isLincoln ? LINCOLN_QUICK_PICKS : LONDON_QUICK_PICKS).map((pick) => (
                <Chip
                  key={pick}
                  label={pick}
                  size="small"
                  onClick={() => setCustomPrompt((prev) => prev ? `${prev}, ${pick}` : pick)}
                  sx={{
                    bgcolor: isLincoln ? '#333' : '#fce4ec',
                    color: isLincoln ? '#7EFC20' : '#c2185b',
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                    fontSize: isLincoln ? '0.38rem' : undefined,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </Stack>

            <TextField
              fullWidth
              multiline
              rows={2}
              placeholder={
                isLincoln
                  ? 'A warrior standing on a mountain...'
                  : 'A princess in a flower field...'
              }
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              size="small"
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  bgcolor: isLincoln ? 'rgba(255,255,255,0.05)' : 'white',
                  color: textColor,
                },
              }}
            />

            {profile.customAvatarUrl && (
              <Box
                component="img"
                src={profile.customAvatarUrl}
                alt="Your custom avatar"
                sx={{
                  width: '100%',
                  maxWidth: 300,
                  borderRadius: isLincoln ? 0 : 3,
                  border: `2px solid ${accentColor}`,
                  imageRendering: isLincoln ? 'pixelated' : 'auto',
                  mb: 2,
                  display: 'block',
                }}
              />
            )}

            <Button
              variant="contained"
              fullWidth
              startIcon={<AutoAwesomeIcon />}
              onClick={handleGenerateCustom}
              disabled={generating || !customPrompt.trim()}
              sx={{
                bgcolor: accentColor,
                color: isLincoln ? '#000' : '#fff',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                fontSize: isLincoln ? '0.45rem' : undefined,
                '&:hover': { bgcolor: isLincoln ? '#5FC420' : '#d486a8' },
                borderRadius: isLincoln ? 0 : 2,
              }}
            >
              {generating ? 'Generating...' : 'Generate My Champion!'}
            </Button>
          </Box>
        )}

        {/* ── 6. Phase 2 Placeholder — Photo Transform ─────────────── */}
        <Box
          sx={{
            p: 2,
            borderRadius: isLincoln ? 0 : 3,
            border: `1px dashed ${isLincoln ? '#444' : '#ddd'}`,
            bgcolor: isLincoln ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
            textAlign: 'center',
          }}
        >
          <CameraAltIcon
            sx={{ fontSize: 36, color: isLincoln ? '#444' : '#ccc', mb: 1 }}
          />
          <Typography
            variant="body2"
            sx={{
              color: isLincoln ? '#555' : '#bbb',
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
              fontSize: isLincoln ? '0.38rem' : '0.8rem',
              fontWeight: 600,
              mb: 0.5,
            }}
          >
            Coming Soon: Transform YOUR photo into your warrior!
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: isLincoln ? '#444' : '#ccc',
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
              fontSize: isLincoln ? '0.32rem' : '0.7rem',
            }}
          >
            {/* Phase 2: use gpt-image-1 image-to-image to transform uploaded photo into themeStyle */}
            Ask Dad to unlock this feature!
          </Typography>
        </Box>
      </Page>

      {/* ── Piece detail modal ────────────────────────────────────── */}
      <ArmorPieceModal
        pieceId={selectedPiece}
        profile={profile}
        onClose={() => setSelectedPiece(null)}
      />

      {/* ── Unlock celebration overlay ────────────────────────────── */}
      <UnlockCelebration
        newPiece={celebrationPiece}
        profile={profile}
        onDismiss={() => setCelebrationPiece(null)}
      />
    </Box>
  )
}
