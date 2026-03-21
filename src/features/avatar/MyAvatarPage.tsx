import { useCallback, useEffect, useRef, useState } from 'react'
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import RefreshIcon from '@mui/icons-material/Refresh'

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

/** Resize an image file to max 1024x1024 and return base64 + mimeType */
async function resizeImageToBase64(
  file: File,
  maxDimension = 1024,
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const { width, height } = img
      const scale = Math.min(1, maxDimension / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas context unavailable'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      const mimeType = 'image/png'
      const dataUrl = canvas.toDataURL(mimeType)
      const base64 = dataUrl.split(',')[1] ?? ''
      resolve({ base64, mimeType })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

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

  // Starter image state
  const [starterGenerating, setStarterGenerating] = useState(false)

  // Photo transform state
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [transforming, setTransforming] = useState(false)
  const [transformError, setTransformError] = useState<string | null>(null)
  const [changeAvatarOpen, setChangeAvatarOpen] = useState(false)

  // Track previous unlockedPieces count to detect new unlocks
  const prevUnlockedCountRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Theme styles ────────────────────────────────────────────────
  const bgColor = isLincoln ? '#1a1a2e' : '#faf5ef'
  const textColor = isLincoln ? '#e0e0e0' : '#3d3d3d'
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  // ── Ensure avatar profile exists ────────────────────────────────
  useEffect(() => {
    if (!familyId || !childId) return

    const profileRef = doc(avatarProfilesCollection(familyId), childId)

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

  // ── Generate starter image on first load if missing ─────────────
  useEffect(() => {
    if (!profile || !familyId || !childId) return
    if (profile.starterImageUrl) return  // already cached
    if (starterGenerating) return

    setStarterGenerating(true)
    const fns = getFunctions(app)
    const generateStarterAvatarFn = httpsCallable<
      { familyId: string; childId: string; themeStyle: string },
      { url: string }
    >(fns, 'generateStarterAvatar')

    generateStarterAvatarFn({ familyId, childId, themeStyle: profile.themeStyle })
      .then(async (result) => {
        const profileRef = doc(avatarProfilesCollection(familyId), childId)
        await setDoc(profileRef, {
          ...profile,
          starterImageUrl: result.data.url,
          updatedAt: new Date().toISOString(),
        })
      })
      .catch((err) => {
        console.error('Starter avatar generation failed:', err)
      })
      .finally(() => {
        setStarterGenerating(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.childId, profile?.starterImageUrl])

  // ── XP progress toward next piece ───────────────────────────────
  const nextPiece = ARMOR_PIECES.find((p) => !(profile?.unlockedPieces ?? []).includes(p.id))
  const allUnlocked = (profile?.unlockedPieces ?? []).length === ARMOR_PIECES.length
  const totalXp = profile?.totalXp ?? 0
  const progressPercent = nextPiece
    ? Math.min((totalXp / nextPiece.xpRequired) * 100, 100)
    : 100
  const xpToNext = nextPiece ? Math.max(nextPiece.xpRequired - totalXp, 0) : 0

  // ── Hero image priority: photoTransform > lastUnlockedPiece > starter ──
  const lastUnlockedId =
    (profile?.unlockedPieces.length ?? 0) > 0
      ? profile!.unlockedPieces[profile!.unlockedPieces.length - 1]
      : null

  const heroImageUrl =
    profile?.photoTransformUrl ??
    (lastUnlockedId ? profile?.generatedImageUrls[lastUnlockedId] : undefined)

  const showPhotoTransformBadge = !!profile?.photoTransformUrl

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

  // ── Photo file selection ─────────────────────────────────────────
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setTransformError(null)
    const url = URL.createObjectURL(file)
    setPhotoPreviewUrl(url)
  }

  // ── Photo transform ──────────────────────────────────────────────
  const handleTransform = useCallback(async () => {
    if (!profile || !familyId || !childId || !photoFile) return
    setTransforming(true)
    setTransformError(null)
    try {
      const { base64, mimeType } = await resizeImageToBase64(photoFile)
      const fns = getFunctions(app)
      const transformFn = httpsCallable<
        { familyId: string; childId: string; themeStyle: string; photoBase64: string; photoMimeType: string },
        { url: string }
      >(fns, 'transformAvatarPhoto', { timeout: 120000 })

      const result = await transformFn({
        familyId,
        childId,
        themeStyle: profile.themeStyle,
        photoBase64: base64,
        photoMimeType: mimeType,
      })

      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      await setDoc(profileRef, {
        ...profile,
        photoTransformUrl: result.data.url,
        updatedAt: new Date().toISOString(),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes("couldn't transform")) {
        setTransformError(msg)
      } else {
        setTransformError("Something went wrong. Try a different photo!")
      }
      console.error('Photo transform failed:', err)
    } finally {
      setTransforming(false)
    }
  }, [profile, familyId, childId, photoFile])

  // ── Use transformed photo as avatar ─────────────────────────────
  const handleUseAsAvatar = useCallback(async (url: string) => {
    if (!profile || !familyId || !childId) return
    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    await setDoc(profileRef, {
      ...profile,
      photoTransformUrl: url,
      updatedAt: new Date().toISOString(),
    })
  }, [profile, familyId, childId])

  // ── Remove photo transform (revert to armor/starter) ────────────
  const handleChangeAvatar = useCallback(async () => {
    if (!profile || !familyId || !childId) return
    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    await setDoc(profileRef, {
      ...profile,
      photoTransformUrl: undefined,
      updatedAt: new Date().toISOString(),
    })
    setChangeAvatarOpen(false)
    setPhotoFile(null)
    setPhotoPreviewUrl(null)
    setTransformError(null)
  }, [profile, familyId, childId])

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

          {/* Hero image: photoTransform > lastUnlocked > starter > placeholder */}
          <Box sx={{ position: 'relative', display: 'inline-block' }}>
            {heroImageUrl ? (
              <Box
                component="img"
                src={heroImageUrl}
                alt="Your character"
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
            ) : starterGenerating ? (
              <Box
                sx={{
                  width: 200,
                  height: 200,
                  mx: 'auto',
                  borderRadius: isLincoln ? 0 : 4,
                  border: `4px solid ${accentColor}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  bgcolor: isLincoln ? 'rgba(126,252,32,0.05)' : 'rgba(232,160,191,0.1)',
                }}
              >
                <CircularProgress size={32} sx={{ color: accentColor }} />
                <Typography
                  variant="caption"
                  sx={{
                    color: isLincoln ? '#aaa' : '#999',
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                    fontSize: isLincoln ? '0.3rem' : '0.65rem',
                    textAlign: 'center',
                    px: 1,
                  }}
                >
                  Creating your character...
                </Typography>
              </Box>
            ) : profile?.starterImageUrl ? (
              <Box
                component="img"
                src={profile.starterImageUrl}
                alt="Your starter character"
                sx={{
                  width: 200,
                  height: 200,
                  objectFit: 'cover',
                  borderRadius: isLincoln ? 0 : 4,
                  border: `4px dashed ${accentColor}`,
                  imageRendering: isLincoln ? 'pixelated' : 'auto',
                  mx: 'auto',
                  display: 'block',
                  opacity: 0.85,
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

            {/* Photo transform badge + change button */}
            {showPhotoTransformBadge && (
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 4,
                  right: 4,
                  display: 'flex',
                  gap: 0.5,
                  alignItems: 'center',
                }}
              >
                <Box
                  sx={{
                    bgcolor: isLincoln ? '#333' : '#fff8',
                    borderRadius: 1,
                    px: 0.75,
                    py: 0.25,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.55rem',
                      fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                      color: accentColor,
                    }}
                  >
                    Generated
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setChangeAvatarOpen(true)}
                  sx={{
                    minWidth: 0,
                    px: 0.75,
                    py: 0.25,
                    fontSize: '0.55rem',
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                    borderColor: accentColor,
                    color: accentColor,
                    lineHeight: 1.2,
                    borderRadius: isLincoln ? 0 : 1,
                  }}
                >
                  Change
                </Button>
              </Box>
            )}
          </Box>

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
          ) : (profile?.unlockedPieces.length ?? 0) === 0 ? (
            <Typography
              variant="body2"
              sx={{
                textAlign: 'center',
                color: isLincoln ? '#aaa' : 'text.secondary',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                fontSize: isLincoln ? '0.42rem' : '0.8rem',
              }}
            >
              0 / 50 XP — Earn your first piece of armor!
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

        {/* ── 4. Photo Transform Card ───────────────────────────────── */}
        <Box
          sx={{
            mb: 3,
            p: 2,
            borderRadius: isLincoln ? 0 : 3,
            border: `2px solid ${isLincoln ? '#444' : '#ddd'}`,
            bgcolor: isLincoln ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <CameraAltIcon sx={{ color: accentColor, fontSize: 20 }} />
            <Typography
              variant="h6"
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '0.55rem' : '1rem',
                color: accentColor,
              }}
            >
              Transform YOUR Photo
            </Typography>
          </Stack>

          <Typography
            variant="body2"
            sx={{
              mb: 2,
              color: isLincoln ? '#aaa' : 'text.secondary',
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
              fontSize: isLincoln ? '0.38rem' : '0.8rem',
            }}
          >
            Upload a photo of yourself and become your warrior!
          </Typography>

          {/* File picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handlePhotoSelect}
          />
          <Button
            variant="outlined"
            fullWidth
            onClick={() => fileInputRef.current?.click()}
            sx={{
              mb: 2,
              borderColor: accentColor,
              color: accentColor,
              borderRadius: isLincoln ? 0 : 2,
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
              fontSize: isLincoln ? '0.4rem' : undefined,
            }}
          >
            {photoFile ? 'Change Photo' : 'Upload a Photo'}
          </Button>

          {/* Photo preview */}
          {photoPreviewUrl && (
            <Box
              component="img"
              src={photoPreviewUrl}
              alt="Your photo"
              sx={{
                width: 128,
                height: 128,
                objectFit: 'cover',
                borderRadius: isLincoln ? 0 : 2,
                border: `2px solid ${accentColor}`,
                display: 'block',
                mb: 2,
              }}
            />
          )}

          {/* Transform button */}
          {photoFile && (
            <Button
              variant="contained"
              fullWidth
              onClick={handleTransform}
              disabled={transforming}
              sx={{
                mb: 1,
                bgcolor: accentColor,
                color: isLincoln ? '#000' : '#fff',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                fontSize: isLincoln ? '0.4rem' : undefined,
                '&:hover': { bgcolor: isLincoln ? '#5FC420' : '#d486a8' },
                borderRadius: isLincoln ? 0 : 2,
              }}
            >
              {transforming ? 'Transforming... this takes about 20 seconds' : 'Transform Me!'}
            </Button>
          )}

          {transforming && (
            <LinearProgress
              sx={{
                mb: 1,
                borderRadius: 1,
                bgcolor: isLincoln ? '#333' : '#eee',
                '& .MuiLinearProgress-bar': { bgcolor: accentColor },
              }}
            />
          )}

          {/* Error */}
          {transformError && (
            <Typography
              variant="body2"
              sx={{
                color: '#f44336',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                fontSize: isLincoln ? '0.38rem' : '0.8rem',
                mb: 1,
              }}
            >
              {transformError}
            </Typography>
          )}

          {/* Result */}
          {profile?.photoTransformUrl && !transforming && (
            <Box sx={{ mt: 1 }}>
              <Box
                component="img"
                src={profile.photoTransformUrl}
                alt="Transformed character"
                sx={{
                  width: '100%',
                  maxWidth: 256,
                  borderRadius: isLincoln ? 0 : 3,
                  border: `2px solid ${accentColor}`,
                  imageRendering: isLincoln ? 'pixelated' : 'auto',
                  display: 'block',
                  mb: 1,
                }}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => void handleUseAsAvatar(profile.photoTransformUrl!)}
                  sx={{
                    bgcolor: accentColor,
                    color: isLincoln ? '#000' : '#fff',
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                    fontSize: isLincoln ? '0.35rem' : undefined,
                    borderRadius: isLincoln ? 0 : 2,
                    '&:hover': { bgcolor: isLincoln ? '#5FC420' : '#d486a8' },
                  }}
                >
                  Use as My Avatar
                </Button>
                {photoFile && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RefreshIcon />}
                    onClick={handleTransform}
                    disabled={transforming}
                    sx={{
                      borderColor: accentColor,
                      color: accentColor,
                      fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                      fontSize: isLincoln ? '0.35rem' : undefined,
                      borderRadius: isLincoln ? 0 : 2,
                    }}
                  >
                    Try Again
                  </Button>
                )}
              </Stack>
            </Box>
          )}
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

      {/* ── Change avatar confirmation dialog ─────────────────────── */}
      <Dialog open={changeAvatarOpen} onClose={() => setChangeAvatarOpen(false)}>
        <DialogTitle>Change Avatar?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will remove your transformed photo and show your armor piece instead. You can always transform a new photo!
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangeAvatarOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleChangeAvatar()} color="error">Remove Photo</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
