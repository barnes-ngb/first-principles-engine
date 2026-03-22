import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { arrayRemove, deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'

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
import { ARMOR_PIECES, ARMOR_PIECE_TO_VOXEL, VOXEL_TO_ARMOR_PIECE, LINCOLN_FEATURES, LONDON_FEATURES } from '../../core/types'
import type {
  ArmorPiece,
  AvatarProfile,
  CharacterFeatures,
  DailyArmorSession,
  VoxelArmorPieceId,
} from '../../core/types'

import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import { ArmorIcon } from './icons/ArmorIcons'
import type { ArmorTierColor } from './icons/ArmorIcons'
import VoxelCharacter from './VoxelCharacter'
import { VOXEL_ARMOR_PIECES, XP_THRESHOLDS } from './voxel/buildArmorPiece'
import type { ArmorPieceMeta } from './voxel/buildArmorPiece'
import Particles from './Particles'
import UnlockCelebration from './UnlockCelebration'
import TierUpgradeCelebration from './TierUpgradeCelebration'
import { calculateTier, getTierBadgeColor, getTierTextColor } from './voxel/tierMaterials'

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

// ── TTS for inline verse card ────────────────────────────────────

function speakVerse(pieceName: string, verseText: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()

  const text = `${pieceName}. ${verseText}`
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.85
  utterance.pitch = 1.0
  utterance.volume = 1.0

  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find((v) =>
    v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Moira'),
  ) || voices.find((v) => v.lang.startsWith('en-US')) || voices[0]
  if (preferred) utterance.voice = preferred

  window.speechSynthesis.speak(utterance)
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
  const [, setUnequipPiece] = useState<VoxelArmorPieceId | null>(null)

  const [celebrationPiece, setCelebrationPiece] = useState<ArmorPiece | null>(null)
  const [tierCelebration, setTierCelebration] = useState<{ from: string; to: string } | null>(null)

  // Card scroll ref — reset to start on load
  const cardScrollRef = useRef<HTMLDivElement>(null)

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

  // Reset card scroll to start (Belt first) on load
  useEffect(() => {
    if (cardScrollRef.current) cardScrollRef.current.scrollLeft = 0
  }, [profile])

  // Pre-load TTS voices (Chrome loads async)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const loadVoices = () => window.speechSynthesis.getVoices()
    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
      window.speechSynthesis.cancel()
    }
  }, [])
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
          characterFeatures: isLincoln ? LINCOLN_FEATURES : LONDON_FEATURES,
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

  // ── Auto-equip unlocked pieces on page load ────────────────────
  // Only runs once on initial load — does NOT re-fire on every session change.
  const autoEquipRanRef = useRef(false)
  useEffect(() => {
    if (!profile || !session || !familyId || !childId) return
    if (autoEquipRanRef.current) return
    autoEquipRanRef.current = true

    const unlockedVoxel = getUnlockedVoxelPieces(profile)
    const currentApplied = session.appliedPieces ?? []
    const currentAppliedVoxel = sessionToVoxelPieces(currentApplied)
    const manuallyRemoved = new Set(session.manuallyUnequipped ?? [])

    // Find pieces that are unlocked but not in today's session and not manually removed
    const missingVoxel = unlockedVoxel.filter(
      (vid) => !currentAppliedVoxel.includes(vid) && !manuallyRemoved.has(vid),
    )
    if (missingVoxel.length === 0) return

    // Map voxel IDs back to ArmorPiece IDs for the session
    const missingArmor = missingVoxel
      .map((vid) => ARMOR_PIECES.find((p) => ARMOR_PIECE_TO_VOXEL[p.id] === vid)?.id)
      .filter((id): id is ArmorPiece => !!id)

    if (missingArmor.length === 0) return

    const updatedApplied = [...currentApplied, ...missingArmor]
    const docId = dailyArmorSessionDocId(childId, today)
    const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)
    void setDoc(sessionRef, { ...session, appliedPieces: updatedApplied })
    // Also update equippedPieces on avatar profile
    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    void updateDoc(profileRef, {
      equippedPieces: [...new Set([...sessionToVoxelPieces(updatedApplied)])],
      updatedAt: new Date().toISOString(),
    })
  }, [profile, session, familyId, childId, today])

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

      // Remove from manuallyUnequipped if re-equipping
      const currentManual = session.manuallyUnequipped ?? []
      const updatedManual = currentManual.filter((id) => id !== voxelPieceId)

      // Write to Firestore
      const docId = dailyArmorSessionDocId(childId, today)
      const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)
      await setDoc(sessionRef, {
        ...session,
        appliedPieces: updatedApplied,
        manuallyUnequipped: updatedManual,
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

  // ── Unequip a piece (direct — no dialog) ──────────────────────
  const handleUnequipDirect = useCallback(async (voxelPieceId: VoxelArmorPieceId) => {
    if (!familyId || !childId || !session) return
    const armorPieceId = ARMOR_PIECES.find(
      (p) => ARMOR_PIECE_TO_VOXEL[p.id] === voxelPieceId,
    )?.id
    if (!armorPieceId) return

    setAnimateUnequipId(voxelPieceId)

    // Track as manually unequipped so auto-equip doesn't override
    const currentManual = session.manuallyUnequipped ?? []
    const updatedManual = currentManual.includes(voxelPieceId)
      ? currentManual
      : [...currentManual, voxelPieceId]

    const docId = dailyArmorSessionDocId(childId, today)
    const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)
    await updateDoc(sessionRef, {
      appliedPieces: arrayRemove(armorPieceId),
      manuallyUnequipped: updatedManual,
      completedAt: deleteField(),
    })

    // Also update equippedPieces on avatar profile
    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    const remainingVoxel = sessionToVoxelPieces(
      (session.appliedPieces ?? []).filter((p) => p !== armorPieceId),
    )
    await updateDoc(profileRef, {
      equippedPieces: remainingVoxel,
      updatedAt: new Date().toISOString(),
    })

    setUnequipPiece(null)
  }, [familyId, childId, session, today])

  // ── Piece tap handler — single tap to equip/unequip ────────────
  const handlePieceTap = useCallback(
    (piece: ArmorPieceMeta) => {
      if (!profile || !session) return
      const armorPieceId = ARMOR_PIECES.find(
        (p) => ARMOR_PIECE_TO_VOXEL[p.id] === piece.id,
      )?.id

      const isUnlocked = profile.totalXp >= XP_THRESHOLDS[piece.id]
      const isApplied = armorPieceId && session.appliedPieces.includes(armorPieceId)

      if (isApplied) {
        // Tap equipped piece → directly unequip (toggle off)
        setUnequipPiece(piece.id)
        // Immediately trigger unequip without dialog
        void handleUnequipDirect(piece.id)
      } else if (isUnlocked) {
        // Tap unlocked piece → equip immediately + read verse aloud
        speakVerse(piece.name, piece.verseText)
        void handleApplyPiece(piece.id)
      } else {
        // Locked pieces: show verse card (info only), read aloud
        setSelectedPiece((prev) => {
          if (prev?.id === piece.id) return null
          speakVerse(piece.name, piece.verseText)
          return piece
        })
      }
    },
    [profile, session, handleApplyPiece, handleUnequipDirect],
  )

  // ── Screen flash on equip ──────────────────────────────────────
  const flashContainerRef = useRef<HTMLDivElement>(null)

  // ── Animation complete handlers ─────────────────────────────────
  const handleEquipAnimDone = useCallback(() => {
    setAnimateEquipId(null)
    // Particles at center
    setParticles({ x: window.innerWidth / 2, y: window.innerHeight / 3 })
    setTimeout(() => setParticles(null), 600)

    // Screen flash
    const container = flashContainerRef.current
    if (container) {
      const flash = document.createElement('div')
      flash.style.cssText = `
        position: absolute; inset: 0;
        background: ${isLincoln ? 'rgba(126, 252, 32, 0.2)' : 'rgba(232, 160, 191, 0.2)'};
        pointer-events: none;
        border-radius: inherit;
        z-index: 10;
        animation: flashFade 0.5s ease-out forwards;
      `
      container.appendChild(flash)
      setTimeout(() => flash.remove(), 600)
    }
  }, [isLincoln])

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
  const childDefaults = isLincoln ? LINCOLN_FEATURES : LONDON_FEATURES
  const features = profile.characterFeatures ?? childDefaults

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: bgColor, color: textColor, pb: 3 }}>
      <Page>
        {/* ── XP Subtitle with Tier Badge ─────────────────────── */}
        <Box sx={{ textAlign: 'center', py: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', mb: '4px' }}>
            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                fontSize: isLincoln ? '0.45rem' : '14px',
                color: isLincoln ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
              }}
            >
              {activeChild?.name}
            </Typography>
            <Box
              component="span"
              sx={{
                fontFamily: 'monospace',
                fontSize: '12px',
                px: '8px',
                py: '2px',
                borderRadius: '4px',
                background: getTierBadgeColor(calculateTier(profile.totalXp)),
                color: getTierTextColor(calculateTier(profile.totalXp)),
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {calculateTier(profile.totalXp)}
            </Box>
            <Typography
              component="span"
              sx={{
                fontFamily: 'monospace',
                fontSize: '13px',
                color: '#4caf50',
              }}
            >
              {profile.totalXp} XP
            </Typography>
          </Box>
        </Box>

        {/* ── 3D Character Display ─────────────────────────────── */}
        <Box
          ref={flashContainerRef}
          sx={{
            mb: 1.5,
            position: 'relative',
            '@keyframes flashFade': {
              '0%': { opacity: 1 },
              '100%': { opacity: 0 },
            },
          }}
        >
          <VoxelCharacter
            features={features}
            ageGroup={ageGroup}
            equippedPieces={appliedVoxel}
            totalXp={profile.totalXp}
            animateEquipPiece={animateEquipId}
            animateUnequipPiece={animateUnequipId}
            onEquipAnimDone={handleEquipAnimDone}
            onUnequipAnimDone={handleUnequipAnimDone}
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
          ref={cardScrollRef}
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
            const armorPieceId = VOXEL_TO_ARMOR_PIECE[piece.id]
            const isApplied = armorPieceId ? appliedPieces.includes(armorPieceId) : false
            const isSelected = selectedPiece?.id === piece.id

            return (
              <Box
                key={piece.id}
                onClick={() => handlePieceTap(piece)}
                sx={{
                  minWidth: 130,
                  maxWidth: 130,
                  height: 160,
                  scrollSnapAlign: 'start',
                  p: '12px 8px',
                  borderRadius: isLincoln ? '2px' : '12px',
                  border: isSelected
                    ? `2px solid ${accentColor}`
                    : isApplied
                      ? `2px solid ${accentColor}`
                      : isUnlocked
                        ? `1.5px solid ${isLincoln ? 'rgba(126,252,32,0.4)' : 'rgba(232,160,191,0.4)'}`
                        : `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                  bgcolor: isApplied
                    ? (isLincoln ? 'rgba(126,252,32,0.15)' : 'rgba(232,160,191,0.15)')
                    : isUnlocked
                      ? (isLincoln ? 'rgba(126,252,32,0.06)' : 'rgba(232,160,191,0.06)')
                      : (isLincoln ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                  cursor: 'pointer',
                  opacity: isUnlocked ? 1 : 0.45,
                  transition: 'all 0.2s ease',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  position: 'relative',
                  flexShrink: 0,
                }}
              >
                {/* Equipped badge */}
                {isApplied && (
                  <Box sx={{
                    position: 'absolute', top: 8, right: 8,
                    width: 22, height: 22, borderRadius: '50%',
                    bgcolor: isLincoln ? '#7EFC20' : '#E8A0BF',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Typography sx={{ color: isLincoln ? '#000' : '#fff', fontSize: 14, fontWeight: 500, lineHeight: 1 }}>
                      ✓
                    </Typography>
                  </Box>
                )}

                {/* Lock badge */}
                {!isUnlocked && (
                  <Box sx={{
                    position: 'absolute', top: 8, right: 8,
                    fontSize: 16, opacity: 0.5,
                  }}>
                    🔒
                  </Box>
                )}

                {/* SVG icon */}
                <Box sx={{ width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ArmorIcon
                    pieceId={armorPieceId}
                    size={48}
                    tier={(profile.currentTier ?? 'stone') as ArmorTierColor}
                    locked={!isUnlocked}
                  />
                </Box>

                {/* Piece name */}
                <Typography
                  sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.28rem' : '13px',
                    fontWeight: 500,
                    color: isUnlocked ? textColor : (isLincoln ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'),
                    lineHeight: 1.2,
                    textAlign: 'center',
                  }}
                >
                  {piece.shortName}
                </Typography>

                {/* Status text */}
                <Typography
                  sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                    fontSize: isLincoln ? '0.22rem' : '11px',
                    fontWeight: isApplied ? 600 : 400,
                    color: isApplied
                      ? '#4caf50'
                      : isUnlocked
                        ? '#FFA726'
                        : (isLincoln ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'),
                  }}
                >
                  {isApplied
                    ? '✓ Equipped'
                    : isUnlocked
                      ? 'Tap to equip'
                      : `${XP_THRESHOLDS[piece.id] - profile.totalXp > 0 ? `${XP_THRESHOLDS[piece.id] - profile.totalXp} XP away` : `${XP_THRESHOLDS[piece.id]} XP`}`}
                </Typography>
              </Box>
            )
          })}
        </Box>

        {/* ── Verse Card (for selected piece) ──────────────────── */}
        {selectedPiece && (
          <Box
            sx={{
              mt: 1.5,
              mx: 1,
              p: '16px 20px',
              bgcolor: isLincoln ? 'rgba(26, 26, 46, 0.95)' : 'rgba(255, 254, 249, 0.95)',
              border: `1.5px solid ${isLincoln ? 'rgba(126,252,32,0.3)' : 'rgba(232,160,191,0.3)'}`,
              borderRadius: '12px',
              position: 'relative',
              animation: 'slideUp 0.3s ease-out',
              '@keyframes slideUp': {
                '0%': { opacity: 0, transform: 'translateY(8px)' },
                '100%': { opacity: 1, transform: 'translateY(0)' },
              },
            }}
          >
            {/* Speaker button */}
            <Box
              component="button"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                speakVerse(selectedPiece.name, selectedPiece.verseText)
              }}
              sx={{
                position: 'absolute', top: 8, left: 12,
                background: isLincoln ? 'rgba(126,252,32,0.15)' : 'rgba(232,160,191,0.15)',
                border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.3)' : 'rgba(232,160,191,0.3)'}`,
                borderRadius: '50%',
                width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', p: 0, color: accentColor,
              }}
              aria-label="Read verse aloud"
            >
              <VolumeUpIcon sx={{ fontSize: 18 }} />
            </Box>

            {/* Close button */}
            <Box
              component="button"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); setSelectedPiece(null) }}
              sx={{
                position: 'absolute', top: 8, right: 12,
                background: 'none', border: 'none',
                color: isLincoln ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)',
                fontSize: 18, cursor: 'pointer', p: '4px',
              }}
            >
              ✕
            </Box>

            {/* Piece name */}
            <Typography sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '0.55rem' : '16px',
              fontWeight: 500,
              color: accentColor,
              mb: 0.5,
            }}>
              {selectedPiece.name}
            </Typography>

            {/* Verse reference */}
            <Typography sx={{
              fontFamily: 'monospace',
              fontSize: isLincoln ? '0.35rem' : '12px',
              color: isLincoln ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
              mb: 1.25,
            }}>
              {selectedPiece.verse}
            </Typography>

            {/* Verse text */}
            <Typography sx={{
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
              fontSize: isLincoln ? '0.45rem' : '15px',
              color: textColor,
              lineHeight: 1.6,
              fontStyle: 'italic',
            }}>
              &ldquo;{selectedPiece.verseText}&rdquo;
            </Typography>

            {/* Equip button — only for unlocked, unequipped pieces */}
            {profile.totalXp >= XP_THRESHOLDS[selectedPiece.id] && (
              <Button
                variant="contained"
                fullWidth
                onClick={() => {
                  void handleApplyPiece(selectedPiece.id)
                  setSelectedPiece(null)
                }}
                sx={{
                  mt: 2,
                  bgcolor: accentColor,
                  color: isLincoln ? '#000' : '#fff',
                  fontFamily: titleFont,
                  fontSize: isLincoln ? '0.45rem' : '16px',
                  fontWeight: 700,
                  py: 1.25,
                  borderRadius: isLincoln ? 0 : 3,
                  '&:hover': { bgcolor: accentColor, opacity: 0.85 },
                }}
              >
                Put it on!
              </Button>
            )}
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

      {/* Unequip dialog removed — tap toggles directly */}

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
