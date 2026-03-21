import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { arrayRemove, deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import LockIcon from '@mui/icons-material/Lock'

import Page from '../../components/Page'
import { app } from '../../core/firebase/firebase'
import {
  avatarProfilesCollection,
  dailyArmorSessionsCollection,
  dailyArmorSessionDocId,
} from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { ensureNewProfileStructure } from '../../core/xp/checkAndUnlockArmor'
import { getTodayDateString } from '../../core/avatar/getDailyArmorSession'
import { ARMOR_PIECES, ARMOR_PIECE_TO_VOXEL, DEFAULT_CHARACTER_FEATURES } from '../../core/types'
import type {
  ArmorPiece,
  AvatarProfile,
  CharacterFeatures,
  DailyArmorSession,
  VoxelArmorPieceId,
} from '../../core/types'

import VoxelCharacter from './VoxelCharacter'
import { VOXEL_ARMOR_PIECES, XP_THRESHOLDS } from './voxel/buildArmorPiece'
import type { ArmorPieceMeta } from './voxel/buildArmorPiece'
import Particles from './Particles'
import UnlockCelebration from './UnlockCelebration'
import TierUpgradeCelebration from './TierUpgradeCelebration'

// ── Helpers ───────────────────────────────────────────────────────

function getUnlockedVoxelPieces(profile: AvatarProfile): VoxelArmorPieceId[] {
  const xp = profile.totalXp
  return VOXEL_ARMOR_PIECES
    .filter((p) => xp >= XP_THRESHOLDS[p.id])
    .map((p) => p.id)
}

function getNextUnlock(profile: AvatarProfile): { piece: ArmorPieceMeta; xpNeeded: number } | null {
  const unlocked = new Set(getUnlockedVoxelPieces(profile))
  const next = VOXEL_ARMOR_PIECES.find((p) => !unlocked.has(p.id))
  if (!next) return null
  return { piece: next, xpNeeded: Math.max(XP_THRESHOLDS[next.id] - profile.totalXp, 0) }
}

/** Map ArmorPiece IDs from daily session to VoxelArmorPieceId */
function sessionToVoxelPieces(appliedPieces: ArmorPiece[]): string[] {
  return appliedPieces.map((p) => ARMOR_PIECE_TO_VOXEL[p])
}

// ── Fanfare (Web Audio API) ────────────────────────────────────────

function playArmorFanfare(delaySeconds = 0) {
  try {
    const ctx = new AudioContext()
    const notes = [523, 659, 784, 1047] // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'triangle'
      const t = ctx.currentTime + delaySeconds + i * 0.12
      gain.gain.setValueAtTime(0.15, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
      osc.start(t)
      osc.stop(t + 0.3)
    })
  } catch {
    // Web Audio not available — silently skip
  }
}

// ── Verse Card ─────────────────────────────────────────────────────

function VerseCardInline({ piece }: { piece: ArmorPieceMeta }) {
  return (
    <Card
      sx={{
        backgroundColor: '#1a1a2e',
        border: '1px solid rgba(76,175,80,0.3)',
        p: 2,
        mx: 1,
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: '#4caf50', fontFamily: 'monospace' }}
      >
        {piece.verse}
      </Typography>
      <Typography
        variant="body1"
        sx={{
          color: '#fff',
          fontFamily: 'monospace',
          mt: 1,
          fontSize: '18px',
          fontStyle: 'italic',
        }}
      >
        &ldquo;{piece.verseText}&rdquo;
      </Typography>
    </Card>
  )
}

// ── Component ─────────────────────────────────────────────────────

export default function MyAvatarPage() {
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childId = activeChild?.id ?? ''
  const isLincoln = activeChild?.name?.toLowerCase() === 'lincoln'

  const [profile, setProfile] = useState<AvatarProfile | null>(null)
  const [session, setSession] = useState<DailyArmorSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPiece, setSelectedPiece] = useState<ArmorPieceMeta | null>(null)
  const [unequipPiece, setUnequipPiece] = useState<VoxelArmorPieceId | null>(null)
  const [celebrationPiece, setCelebrationPiece] = useState<ArmorPiece | null>(null)
  const [tierCelebration, setTierCelebration] = useState<{ from: string; to: string } | null>(null)

  // Photo feature extraction
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [photoExtracting, setPhotoExtracting] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Animation state
  const [animateEquipId, setAnimateEquipId] = useState<string | null>(null)
  const [animateUnequipId, setAnimateUnequipId] = useState<string | null>(null)
  const [particles, setParticles] = useState<{ x: number; y: number } | null>(null)

  // Track previous state for celebrations
  const prevPiecesCountRef = useRef(0)
  const prevTierRef = useRef<string | null>(null)
  const today = getTodayDateString()

  // Theme
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const bgColor = isLincoln ? '#0d1117' : '#faf5ef'
  const textColor = isLincoln ? '#e0e0e0' : '#3d3d3d'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  // ── Ensure avatar profile exists ──────────────────────────────
  useEffect(() => {
    if (!familyId || !childId) return
    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    const ensureProfile = async () => {
      const { getDoc } = await import('firebase/firestore')
      const snap = await getDoc(profileRef)
      if (!snap.exists()) {
        const ageGroup = isLincoln ? 'older' : 'younger'
        const newProfile: AvatarProfile = {
          childId,
          themeStyle: isLincoln ? 'minecraft' : 'platformer',
          pieces: [],
          currentTier: isLincoln ? 'stone' : 'basic',
          characterFeatures: DEFAULT_CHARACTER_FEATURES,
          ageGroup,
          equippedPieces: [],
          unlockedPieces: [],
          totalXp: 0,
          updatedAt: new Date().toISOString(),
        }
        await setDoc(profileRef, newProfile)
      }
    }
    void ensureProfile()
  }, [familyId, childId, isLincoln])

  // ── Real-time profile listener ─────────────────────────────────
  useEffect(() => {
    if (!familyId || !childId) return
    setLoading(true)
    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    const unsub = onSnapshot(
      profileRef,
      (snap) => {
        if (snap.exists()) {
          const data = ensureNewProfileStructure(snap.data() as unknown as Record<string, unknown>)
          setProfile(data)

          const unlockedCount = getUnlockedVoxelPieces(data).length
          if (unlockedCount > prevPiecesCountRef.current && prevPiecesCountRef.current > 0) {
            // A new piece was unlocked
            const unlocked = getUnlockedVoxelPieces(data)
            const newPieceVoxel = unlocked[unlocked.length - 1]
            // Map back to ArmorPiece for celebration component compatibility
            const armorPieceId = ARMOR_PIECES.find(
              (p) => ARMOR_PIECE_TO_VOXEL[p.id] === newPieceVoxel,
            )?.id
            if (armorPieceId) setCelebrationPiece(armorPieceId)
          }
          prevPiecesCountRef.current = unlockedCount

          if (prevTierRef.current && data.currentTier !== prevTierRef.current) {
            setTierCelebration({ from: prevTierRef.current, to: data.currentTier })
          }
          prevTierRef.current = data.currentTier
        }
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsub
  }, [familyId, childId])

  // ── Real-time session listener ─────────────────────────────────
  useEffect(() => {
    if (!familyId || !childId) return
    const docId = dailyArmorSessionDocId(childId, today)
    const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)

    const unsub = onSnapshot(sessionRef, async (snap) => {
      if (snap.exists()) {
        setSession(snap.data())
      } else {
        const newSession: DailyArmorSession = {
          familyId,
          childId,
          date: today,
          appliedPieces: [],
        }
        await setDoc(sessionRef, newSession)
        setSession(newSession)
      }
    })
    return unsub
  }, [familyId, childId, today])

  // ── Photo select ───────────────────────────────────────────────
  const handlePhotoSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const size = Math.min(img.width, img.height)
        const x = (img.width - size) / 2
        const y = (img.height - size) / 2
        const targetSize = Math.min(size, 1024)
        const canvas = document.createElement('canvas')
        canvas.width = targetSize
        canvas.height = targetSize
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, x, y, size, size, 0, 0, targetSize, targetSize)
        setPhotoPreviewUrl(canvas.toDataURL('image/jpeg', 0.92))
        setPhotoError(null)
      }
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
  }, [])

  // ── Photo transform → feature extraction ────────────────────────
  const handlePhotoTransform = useCallback(async () => {
    if (!familyId || !childId || !photoPreviewUrl || !profile) return
    setPhotoExtracting(true)
    setPhotoError(null)

    try {
      const fns = getFunctions(app)
      const extractFn = httpsCallable<
        { familyId: string; childId: string; photoBase64: string; photoMimeType: string },
        { features: CharacterFeatures }
      >(fns, 'extractFeatures')

      const [header, base64] = photoPreviewUrl.split(',')
      const mimeType = header.split(':')[1].split(';')[0]

      const result = await extractFn({
        familyId,
        childId,
        photoBase64: base64,
        photoMimeType: mimeType,
      })

      // Save features to profile
      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      const { getDoc } = await import('firebase/firestore')
      const snap = await getDoc(profileRef)
      const current = snap.exists() ? (snap.data() as AvatarProfile) : profile
      await setDoc(profileRef, {
        ...current,
        characterFeatures: result.data.features,
        photoUrl: photoPreviewUrl,
        updatedAt: new Date().toISOString(),
      })

      setPhotoPreviewUrl(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Feature extraction failed — try a different photo.'
      setPhotoError(msg)
    } finally {
      setPhotoExtracting(false)
    }
  }, [familyId, childId, photoPreviewUrl, profile])

  // ── Apply a piece (equip) ───────────────────────────────────────
  const handleApplyPiece = useCallback(
    async (voxelPieceId: VoxelArmorPieceId) => {
      if (!profile || !familyId || !childId || !session) return
      // Map voxel ID back to ArmorPiece ID for the daily session
      const armorPieceId = ARMOR_PIECES.find(
        (p) => ARMOR_PIECE_TO_VOXEL[p.id] === voxelPieceId,
      )?.id
      if (!armorPieceId) return
      if (session.appliedPieces.includes(armorPieceId)) return

      // Trigger equip animation
      setAnimateEquipId(voxelPieceId)

      const updatedApplied = [...session.appliedPieces, armorPieceId]
      const unlockedVoxel = getUnlockedVoxelPieces(profile)
      const allApplied = unlockedVoxel.every((vid) => {
        const aid = ARMOR_PIECES.find((p) => ARMOR_PIECE_TO_VOXEL[p.id] === vid)?.id
        return aid && updatedApplied.includes(aid)
      })

      if (allApplied && isLincoln) {
        playArmorFanfare(1.5)
      }

      // Write to Firestore
      const docId = dailyArmorSessionDocId(childId, today)
      const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)
      await setDoc(sessionRef, {
        ...session,
        appliedPieces: updatedApplied,
        ...(allApplied ? { completedAt: new Date().toISOString() } : {}),
      })

      // Also update equippedPieces on avatar profile
      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      const equippedVoxel = [...sessionToVoxelPieces(updatedApplied)]
      await updateDoc(profileRef, {
        equippedPieces: equippedVoxel,
        lastEquipAnimation: voxelPieceId,
        updatedAt: new Date().toISOString(),
      })

      if (allApplied) {
        void addXpEvent(familyId, childId, 'ARMOR_DAILY_COMPLETE', 5, `armor_daily_${today}`)
      }
    },
    [profile, familyId, childId, session, today, isLincoln],
  )

  // ── Piece tap handler ──────────────────────────────────────────
  const handlePieceTap = useCallback(
    (piece: ArmorPieceMeta) => {
      if (!profile || !session) return
      const armorPieceId = ARMOR_PIECES.find(
        (p) => ARMOR_PIECE_TO_VOXEL[p.id] === piece.id,
      )?.id

      const isUnlocked = profile.totalXp >= XP_THRESHOLDS[piece.id]
      const isApplied = armorPieceId && session.appliedPieces.includes(armorPieceId)

      if (isApplied) {
        setUnequipPiece(piece.id)
      } else if (isUnlocked) {
        setSelectedPiece(piece)
      }
      // Locked pieces: show verse but not apply
    },
    [profile, session],
  )

  // ── Unequip a piece ────────────────────────────────────────────
  const handleUnequip = useCallback(async () => {
    if (!unequipPiece || !familyId || !childId) return
    const armorPieceId = ARMOR_PIECES.find(
      (p) => ARMOR_PIECE_TO_VOXEL[p.id] === unequipPiece,
    )?.id
    if (!armorPieceId) return

    setAnimateUnequipId(unequipPiece)

    const docId = dailyArmorSessionDocId(childId, today)
    const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)
    await updateDoc(sessionRef, {
      appliedPieces: arrayRemove(armorPieceId),
      completedAt: deleteField(),
    })
    setUnequipPiece(null)
  }, [unequipPiece, familyId, childId, today])

  // ── Animation complete handlers ─────────────────────────────────
  const handleEquipAnimDone = useCallback(() => {
    setAnimateEquipId(null)
    // Particles at center
    setParticles({ x: window.innerWidth / 2, y: window.innerHeight / 3 })
    setTimeout(() => setParticles(null), 600)
  }, [])

  const handleUnequipAnimDone = useCallback(() => {
    setAnimateUnequipId(null)
  }, [])

  // ── Computed values ────────────────────────────────────────────
  const appliedPieces = session?.appliedPieces ?? []
  const appliedVoxel = sessionToVoxelPieces(appliedPieces)
  const unlockedVoxel = profile ? getUnlockedVoxelPieces(profile) : []
  const allEarnedApplied = unlockedVoxel.length > 0 && unlockedVoxel.every((v) => appliedVoxel.includes(v))
  const nextUnlock = profile ? getNextUnlock(profile) : null
  const allSixUnlocked = unlockedVoxel.length === 6

  const xpProgress = nextUnlock && profile
    ? Math.min((profile.totalXp / XP_THRESHOLDS[nextUnlock.piece.id]) * 100, 100)
    : 100

  if (loading) {
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: accentColor }} />
      </Box>
    )
  }

  if (!profile) return null

  const ageGroup = profile.ageGroup ?? (isLincoln ? 'older' : 'younger')
  const features = profile.characterFeatures ?? DEFAULT_CHARACTER_FEATURES

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: bgColor, color: textColor, pb: 8 }}>
      <Page>
        {/* ── Header ────────────────────────────────────────────── */}
        <Box sx={{ textAlign: 'center', pt: 2, pb: 1 }}>
          <Typography
            variant="h5"
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '0.7rem' : '1.8rem',
              fontWeight: 700,
              color: accentColor,
            }}
          >
            My Armor
          </Typography>
          <Typography
            sx={{
              mt: 0.5,
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
              fontSize: isLincoln ? '0.45rem' : '16px',
              color: isLincoln ? '#666' : '#999',
            }}
          >
            {activeChild?.name} — {profile.totalXp} XP
          </Typography>
        </Box>

        {/* ── 3D Character Display ─────────────────────────────── */}
        <Box sx={{ mb: 1.5 }}>
          <VoxelCharacter
            features={features}
            ageGroup={ageGroup}
            equippedPieces={appliedVoxel}
            animateEquipPiece={animateEquipId}
            animateUnequipPiece={animateUnequipId}
            onEquipAnimDone={handleEquipAnimDone}
            onUnequipAnimDone={handleUnequipAnimDone}
            height="55vw"
          />
        </Box>

        {/* ── Armor status text ────────────────────────────────── */}
        {allEarnedApplied && unlockedVoxel.length > 0 ? (
          <Box sx={{ textAlign: 'center', py: 1, mb: 1 }}>
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '0.65rem' : '22px',
                fontWeight: 700,
                color: isLincoln ? '#FFD700' : '#9C27B0',
              }}
            >
              {allSixUnlocked
                ? 'Full armor on! Ready for today.'
                : `${unlockedVoxel.length} of 6 pieces equipped — keep going!`}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ mb: 2, px: 1 }}>
            {!allSixUnlocked && nextUnlock ? (
              <>
                <Typography
                  sx={{
                    display: 'block',
                    mb: 0.75,
                    color: isLincoln ? '#aaa' : 'text.primary',
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                    fontSize: isLincoln ? '0.38rem' : '15px',
                    fontWeight: 500,
                  }}
                >
                  Next: {nextUnlock.piece.name} — {nextUnlock.xpNeeded} XP away
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={xpProgress}
                  sx={{
                    height: 10,
                    borderRadius: isLincoln ? 0 : 5,
                    bgcolor: isLincoln ? '#222' : '#eee',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: accentColor,
                      borderRadius: isLincoln ? 0 : 5,
                    },
                  }}
                />
              </>
            ) : allSixUnlocked ? (
              <Typography
                sx={{
                  textAlign: 'center',
                  fontFamily: titleFont,
                  fontSize: isLincoln ? '0.4rem' : '0.85rem',
                  color: accentColor,
                  fontWeight: 700,
                }}
              >
                Full set unlocked!
              </Typography>
            ) : null}
          </Box>
        )}

        {/* ── Armor Piece Cards (horizontal scroll) ────────────── */}
        <Box
          sx={{
            overflowX: 'auto',
            display: 'flex',
            gap: '12px',
            pb: 1,
            px: '16px',
            scrollSnapType: 'x mandatory',
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': { height: 4 },
            '&::-webkit-scrollbar-thumb': { bgcolor: isLincoln ? '#333' : '#ddd', borderRadius: 2 },
          }}
        >
          {VOXEL_ARMOR_PIECES.map((piece) => {
            const isUnlocked = profile.totalXp >= XP_THRESHOLDS[piece.id]
            const armorPieceId = ARMOR_PIECES.find(
              (p) => ARMOR_PIECE_TO_VOXEL[p.id] === piece.id,
            )?.id
            const isApplied = armorPieceId ? appliedPieces.includes(armorPieceId) : false

            return (
              <Box
                key={piece.id}
                onClick={() => handlePieceTap(piece)}
                sx={{
                  minWidth: 120,
                  maxWidth: 120,
                  scrollSnapAlign: 'start',
                  p: 1.5,
                  borderRadius: isLincoln ? 0 : 2,
                  border: `2px solid ${
                    isApplied ? accentColor
                    : isUnlocked ? (isLincoln ? '#555' : '#ccc')
                    : (isLincoln ? '#222' : '#e0e0e0')
                  }`,
                  bgcolor: isApplied
                    ? (isLincoln ? 'rgba(126,252,32,0.1)' : 'rgba(232,160,191,0.1)')
                    : (isLincoln ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                  cursor: isUnlocked ? 'pointer' : 'default',
                  opacity: isUnlocked ? 1 : 0.5,
                  transition: 'border-color 200ms, background-color 200ms',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                {isUnlocked ? (
                  <Typography sx={{ fontSize: '28px' }}>
                    {isApplied ? '✅' : '⚔️'}
                  </Typography>
                ) : (
                  <LockIcon sx={{ fontSize: 28, color: isLincoln ? '#444' : '#bbb' }} />
                )}
                <Typography
                  sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.3rem' : '0.75rem',
                    fontWeight: 600,
                    color: isApplied ? accentColor : textColor,
                    lineHeight: 1.2,
                  }}
                >
                  {piece.name.split(' ')[0]}
                </Typography>
                {!isUnlocked && (
                  <Typography
                    sx={{
                      fontSize: isLincoln ? '0.25rem' : '0.65rem',
                      color: isLincoln ? '#555' : '#aaa',
                      fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                    }}
                  >
                    {XP_THRESHOLDS[piece.id]} XP
                  </Typography>
                )}
              </Box>
            )
          })}
        </Box>

        {/* ── Verse Card (for selected piece) ──────────────────── */}
        {selectedPiece && (
          <Box sx={{ mt: 2, px: 1 }}>
            <VerseCardInline piece={selectedPiece} />
            <Box sx={{ display: 'flex', gap: 1, mt: 1.5, px: 1 }}>
              <Button
                variant="contained"
                fullWidth
                onClick={() => {
                  void handleApplyPiece(selectedPiece.id)
                  setSelectedPiece(null)
                }}
                sx={{
                  bgcolor: accentColor,
                  color: isLincoln ? '#000' : '#fff',
                  fontFamily: titleFont,
                  fontSize: isLincoln ? '0.5rem' : '18px',
                  fontWeight: 700,
                  py: 1.5,
                  borderRadius: isLincoln ? 0 : 3,
                  '&:hover': { bgcolor: accentColor, opacity: 0.85 },
                }}
              >
                Put it on!
              </Button>
              <Button
                variant="text"
                onClick={() => setSelectedPiece(null)}
                sx={{
                  color: isLincoln ? '#666' : '#aaa',
                  fontFamily: titleFont,
                  fontSize: isLincoln ? '0.35rem' : '14px',
                }}
              >
                Close
              </Button>
            </Box>
          </Box>
        )}

        {/* ── Photo Upload Section ──────────────────────────────── */}
        <Box
          sx={{
            mt: 3,
            p: 2,
            borderRadius: isLincoln ? 0 : 3,
            border: `2px solid ${isLincoln ? '#333' : '#e0d0f0'}`,
            bgcolor: isLincoln ? 'rgba(255,255,255,0.03)' : 'rgba(232,160,191,0.06)',
          }}
        >
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handlePhotoSelect}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <CameraAltIcon sx={{ color: accentColor, fontSize: 20 }} />
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '0.42rem' : '0.95rem',
                fontWeight: 600,
                color: accentColor,
              }}
            >
              Transform YOUR Photo
            </Typography>
          </Box>

          {!photoPreviewUrl ? (
            <Button
              variant="outlined"
              size="small"
              startIcon={<CameraAltIcon />}
              onClick={() => photoInputRef.current?.click()}
              sx={{
                borderColor: accentColor,
                color: accentColor,
                borderRadius: isLincoln ? 0 : 2,
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                fontSize: isLincoln ? '0.38rem' : '0.85rem',
              }}
            >
              {profile.photoUrl ? 'Change Photo' : 'Upload a Photo'}
            </Button>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box
                component="img"
                src={photoPreviewUrl}
                alt="Preview"
                sx={{
                  width: 120,
                  height: 120,
                  objectFit: 'cover',
                  borderRadius: isLincoln ? 0 : 2,
                  border: `2px solid ${accentColor}`,
                }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => void handlePhotoTransform()}
                  disabled={photoExtracting}
                  sx={{
                    bgcolor: accentColor,
                    color: isLincoln ? '#000' : '#fff',
                    borderRadius: isLincoln ? 0 : 2,
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                    fontSize: isLincoln ? '0.35rem' : '0.85rem',
                    '&:hover': { bgcolor: accentColor, opacity: 0.85 },
                  }}
                >
                  {photoExtracting ? 'Extracting...' : 'Transform!'}
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => { setPhotoPreviewUrl(null); setPhotoError(null) }}
                  sx={{
                    color: isLincoln ? '#666' : '#aaa',
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                    fontSize: isLincoln ? '0.35rem' : '0.85rem',
                  }}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          )}

          {photoError && (
            <Alert severity="error" sx={{ mt: 1, fontSize: '0.8rem' }}>
              {photoError}
            </Alert>
          )}

          {profile.characterFeatures && !photoPreviewUrl && (
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 0.5, color: isLincoln ? '#555' : '#aaa', fontSize: '12px' }}
            >
              Character features extracted from photo — 3D character reflects your look
            </Typography>
          )}
        </Box>
      </Page>

      {/* ── Unequip confirmation dialog ────────────────────────── */}
      <Dialog open={!!unequipPiece} onClose={() => setUnequipPiece(null)}>
        <DialogTitle>
          {VOXEL_ARMOR_PIECES.find((p) => p.id === unequipPiece)?.name} is on
        </DialogTitle>
        <DialogContent>
          <DialogContentText>Take it off for today?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnequipPiece(null)}>Keep it on</Button>
          <Button color="warning" onClick={() => void handleUnequip()}>Take it off</Button>
        </DialogActions>
      </Dialog>

      {/* ── Particle burst ──────────────────────────────────────── */}
      {particles && profile && (
        <Particles
          x={particles.x}
          y={particles.y}
          themeStyle={profile.themeStyle}
          tier={profile.currentTier}
          converge
          onDone={() => setParticles(null)}
        />
      )}

      {/* ── Unlock celebration ──────────────────────────────────── */}
      <UnlockCelebration
        newPiece={celebrationPiece}
        profile={profile}
        onDismiss={() => setCelebrationPiece(null)}
      />

      {/* ── Tier upgrade celebration ────────────────────────────── */}
      <TierUpgradeCelebration
        upgrade={tierCelebration}
        profile={profile}
        onDismiss={() => setTierCelebration(null)}
      />
    </Box>
  )
}
