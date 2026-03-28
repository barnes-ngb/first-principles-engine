import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { arrayRemove, deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'

import { useNavigate } from 'react-router-dom'
import Page from '../../components/Page'
import { app } from '../../core/firebase/firebase'
import {
  avatarProfilesCollection,
  dailyArmorSessionsCollection,
  dailyArmorSessionDocId,
  stripUndefined,
} from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { getTodayDateString } from '../../core/avatar/getDailyArmorSession'
import { normalizeAvatarProfile } from './normalizeProfile'
import { useAvatarProfile } from './useAvatarProfile'
import { safeUpdateProfile, safeSetProfile } from './safeProfileWrite'
import { ARMOR_PIECES, ARMOR_PIECE_TO_VOXEL, VOXEL_TO_ARMOR_PIECE, LINCOLN_FEATURES, LONDON_FEATURES } from '../../core/types'
import type {
  ArmorPiece,
  ArmorTier,
  AvatarProfile,
  CharacterFeatures,
  DailyArmorSession,
  HelmetCrest,
  OutfitCustomization,
  PlatformerTier,
  ShieldEmblem,
  VoxelArmorPieceId,
} from '../../core/types'

import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import { ArmorIcon } from './icons/ArmorIcons'
import type { ArmorTierColor } from './icons/ArmorIcons'
import VoxelCharacter from './VoxelCharacter'
import BrothersVoxelScene from './BrothersVoxelScene'
import PoseButtons from './PoseButtons'
import { VOXEL_ARMOR_PIECES, XP_THRESHOLDS } from './voxel/buildArmorPiece'
import type { ArmorPieceMeta } from './voxel/buildArmorPiece'
import Particles from './Particles'
import UnlockCelebration from './UnlockCelebration'
import TierUpgradeCelebration from './TierUpgradeCelebration'
import TierUpCeremony from '../../components/avatar/TierUpCeremony'
import OutfitCustomizer from './OutfitCustomizer'
import ArmorDyePanel from './ArmorDyePanel'
import ShieldEmblemPicker from './ShieldEmblemPicker'
import HelmetCrestPicker from './HelmetCrestPicker'
import { calculateTier, getTierBadgeColor, getTierTextColor, TIERS } from './voxel/tierMaterials'
import { tierHasGlow } from './voxel/enchantmentGlow'
import { tierHasCape } from './voxel/buildCape'

// ── Helpers ───────────────────────────────────────────────────────

/** Normalize raw Firestore DailyArmorSession data — guards against non-array fields */
function normalizeDailyArmorSession(raw: DailyArmorSession): DailyArmorSession {
  return {
    ...raw,
    appliedPieces: Array.isArray(raw.appliedPieces) ? raw.appliedPieces : [],
    manuallyUnequipped: Array.isArray(raw.manuallyUnequipped) ? raw.manuallyUnequipped : [],
  }
}

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
  return (appliedPieces ?? []).map((p) => ARMOR_PIECE_TO_VOXEL[p])
}

/** Check if yesterday's date string is exactly one day before today */
function isConsecutiveDay(prev: string, current: string): boolean {
  const prevDate = new Date(prev + 'T00:00:00')
  const currentDate = new Date(current + 'T00:00:00')
  const diffMs = currentDate.getTime() - prevDate.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) === 1
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
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild, children, setActiveChildId, isChildProfile } = useActiveChild()
  const childId = activeChild?.id ?? ''
  const isLincoln = activeChild?.name?.toLowerCase() === 'lincoln'

  const [profile, setProfile] = useState<AvatarProfile | null>(null)
  const [session, setSession] = useState<DailyArmorSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPiece, setSelectedPiece] = useState<ArmorPieceMeta | null>(null)
  const [, setUnequipPiece] = useState<VoxelArmorPieceId | null>(null)

  const [celebrationPiece, setCelebrationPiece] = useState<ArmorPiece | null>(null)
  const [tierCelebration, setTierCelebration] = useState<{ from: string; to: string } | null>(null)
  const [ceremonyActive, setCeremonyActive] = useState(false)
  const [ceremonyTier, setCeremonyTier] = useState<string | null>(null)

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

  // Pose state
  const [activePoseId, setActivePoseId] = useState<string | null>(null)

  // Brothers mode state
  const [brothersMode, setBrothersMode] = useState(false)
  const siblingChild = children.find((c) => c.id !== childId)
  const siblingId = brothersMode ? siblingChild?.id : undefined
  const siblingProfile = useAvatarProfile(familyId, siblingId)

  // Track previous state for celebrations
  const prevPiecesCountRef = useRef(0)
  const prevTierRef = useRef<string | null>(null)
  const prevXpRef = useRef(0)

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
          ...(isLincoln ? {} : {
            customization: {
              shirtColor: '#E8A838',   // mustard yellow
              pantsColor: '#C4B998',   // khaki/tan
              shoeColor: '#8B7355',    // brown
            },
          }),
        }
        await safeSetProfile(profileRef, newProfile as unknown as Record<string, unknown>)
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
          const data = normalizeAvatarProfile(snap.data())
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

  // ── Detect tier-up from XP changes ──────────────────────────────
  const totalXp = profile?.totalXp
  useEffect(() => {
    if (totalXp === undefined) return
    // Skip detection on first load after child switch (sentinel = -1)
    if (prevXpRef.current >= 0) {
      const oldTier = calculateTier(prevXpRef.current)
      const newTier = calculateTier(totalXp)
      if (newTier !== oldTier && totalXp > prevXpRef.current) {
        const tierDef = TIERS[newTier]
        if (tierDef) {
          setCeremonyTier(tierDef.label)
          setCeremonyActive(true)
        }
      }
    }
    prevXpRef.current = totalXp
  }, [totalXp])

  // ── Real-time session listener ─────────────────────────────────
  useEffect(() => {
    if (!familyId || !childId) return
    const docId = dailyArmorSessionDocId(childId, today)
    const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)

    const unsub = onSnapshot(sessionRef, async (snap) => {
      if (snap.exists()) {
        setSession(normalizeDailyArmorSession(snap.data()))
      } else {
        const newSession: DailyArmorSession = {
          familyId,
          childId,
          date: today,
          appliedPieces: [],
        }
        await setDoc(sessionRef, stripUndefined(newSession as unknown as Record<string, unknown>) as unknown as DailyArmorSession)
        setSession(newSession)
      }
    })
    return unsub
  }, [familyId, childId, today])

  // ── Daily armor reset — armor unequips each morning ────────────
  // "Put on the full armor of God" — Ephesians 6:11
  // Each day is a fresh opportunity to suit up.
  const resetRanRef = useRef(false)
  const resetChildRef = useRef(childId)
  const [morningReset, setMorningReset] = useState(false)

  // Reset flags when switching children
  if (resetChildRef.current !== childId) {
    resetRanRef.current = false
    resetChildRef.current = childId
    setMorningReset(false)
    // Use -1 sentinel to skip tier-up detection on first profile load after switch
    prevXpRef.current = -1
    prevPiecesCountRef.current = 0
    prevTierRef.current = null
  }

  useEffect(() => {
    if (!profile || !session || !familyId || !childId) return
    if (resetRanRef.current) return
    resetRanRef.current = true

    const isNewDay = profile.lastArmorEquipDate !== today

    if (isNewDay && (profile.equippedPieces?.length ?? 0) > 0) {
      // New day — reset armor so child can intentionally put it on
      setMorningReset(true)
      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      void safeUpdateProfile(profileRef, {
        equippedPieces: [],
        lastArmorEquipDate: today,
      })

      // Morning TTS greeting
      if ('speechSynthesis' in window) {
        setTimeout(() => {
          const utterance = new SpeechSynthesisUtterance(
            'Good morning warrior! Time to put on the armor of God.',
          )
          utterance.rate = 0.85
          const voices = window.speechSynthesis.getVoices()
          const preferred = voices.find((v) =>
            v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Moira'),
          ) || voices.find((v) => v.lang.startsWith('en-US')) || voices[0]
          if (preferred) utterance.voice = preferred
          window.speechSynthesis.speak(utterance)
        }, 1000)
      }
    }
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
      await safeSetProfile(profileRef, {
        ...current,
        characterFeatures: result.data.features,
        photoUrl: photoPreviewUrl,
      } as unknown as Record<string, unknown>)

      setPhotoPreviewUrl(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Feature extraction failed — try a different photo.'
      setPhotoError(msg)
    } finally {
      setPhotoExtracting(false)
    }
  }, [familyId, childId, photoPreviewUrl, profile])

  // ── Outfit color change ──────────────────────────────────────────
  const handleOutfitColorChange = useCallback(
    async (slot: 'shirt' | 'pants' | 'shoes', hexColor: string) => {
      if (!familyId || !childId || !profile) return
      const customization: OutfitCustomization = { ...profile.customization }
      switch (slot) {
        case 'shirt': customization.shirtColor = hexColor; break
        case 'pants': customization.pantsColor = hexColor; break
        case 'shoes': customization.shoeColor = hexColor; break
      }
      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      await safeUpdateProfile(profileRef, {
        customization,
      })
    },
    [familyId, childId, profile],
  )

  // ── Armor dye color change ──────────────────────────────────────
  const handleArmorDyeChange = useCallback(
    async (pieceId: VoxelArmorPieceId, hexColor: string) => {
      if (!familyId || !childId || !profile) return
      const customization: OutfitCustomization = { ...profile.customization }
      customization.armorColors = { ...customization.armorColors, [pieceId]: hexColor }
      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      await safeUpdateProfile(profileRef, { customization })
    },
    [familyId, childId, profile],
  )

  const handleArmorDyeReset = useCallback(async () => {
    if (!familyId || !childId || !profile) return
    const customization: OutfitCustomization = { ...profile.customization }
    delete customization.armorColors
    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    await safeUpdateProfile(profileRef, { customization })
  }, [familyId, childId, profile])

  // ── Shield emblem change ────────────────────────────────────────────
  const handleEmblemChange = useCallback(
    async (emblem: ShieldEmblem) => {
      if (!familyId || !childId || !profile) return
      const customization: OutfitCustomization = { ...profile.customization, shieldEmblem: emblem }
      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      await safeUpdateProfile(profileRef, { customization })
    },
    [familyId, childId, profile],
  )

  // ── Helmet crest change ─────────────────────────────────────────────
  const handleCrestChange = useCallback(
    async (crest: HelmetCrest) => {
      if (!familyId || !childId || !profile) return
      const customization: OutfitCustomization = { ...profile.customization, helmetCrest: crest }
      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      await safeUpdateProfile(profileRef, { customization })
    },
    [familyId, childId, profile],
  )

  // ── Streak tracking ─────────────────────────────────────────────
  const checkArmorStreak = useCallback(async (prof: AvatarProfile) => {
    if (!familyId || !childId) return
    const lastFull = prof.lastFullArmorDate
    let newStreak = 1
    if (lastFull) {
      if (lastFull === today) {
        newStreak = prof.armorStreak ?? 1 // Same day, keep streak
      } else if (isConsecutiveDay(lastFull, today)) {
        newStreak = (prof.armorStreak ?? 0) + 1 // Consecutive day
      }
      // else streak broken, reset to 1
    }
    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    await safeUpdateProfile(profileRef, {
      armorStreak: newStreak,
      lastFullArmorDate: today,
    })
  }, [familyId, childId, today])

  // ── Apply a piece (equip) ───────────────────────────────────────
  const handleApplyPiece = useCallback(
    async (voxelPieceId: VoxelArmorPieceId) => {
      if (!profile || !familyId || !childId || !session) return
      // Map voxel ID back to ArmorPiece ID for the daily session
      const armorPieceId = ARMOR_PIECES.find(
        (p) => ARMOR_PIECE_TO_VOXEL[p.id] === voxelPieceId,
      )?.id
      if (!armorPieceId) return
      if ((session.appliedPieces ?? []).includes(armorPieceId)) return

      // Trigger equip animation
      setAnimateEquipId(voxelPieceId)

      const updatedApplied = [...(session.appliedPieces ?? []), armorPieceId]
      const unlockedVoxel = getUnlockedVoxelPieces(profile)
      const allApplied = unlockedVoxel.every((vid) => {
        const aid = ARMOR_PIECES.find((p) => ARMOR_PIECE_TO_VOXEL[p.id] === vid)?.id
        return aid && updatedApplied.includes(aid)
      })

      if (allApplied) {
        playArmorFanfare(1.5)
        // TTS "Ready for battle!" announcement
        if ('speechSynthesis' in window) {
          setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(
              "Full armor on! You're ready for battle, warrior!",
            )
            utterance.rate = 0.85
            window.speechSynthesis.speak(utterance)
          }, 1800) // After fanfare completes
        }
      }

      // Remove from manuallyUnequipped if re-equipping
      const currentManual = session.manuallyUnequipped ?? []
      const updatedManual = currentManual.filter((id) => id !== voxelPieceId)

      // Write to Firestore
      const docId = dailyArmorSessionDocId(childId, today)
      const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)
      await setDoc(sessionRef, stripUndefined({
        ...session,
        appliedPieces: updatedApplied,
        manuallyUnequipped: updatedManual,
        ...(allApplied ? { completedAt: new Date().toISOString() } : {}),
      }) as unknown as DailyArmorSession)

      // Also update equippedPieces on avatar profile
      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      const equippedVoxel = [...sessionToVoxelPieces(updatedApplied)]
      await safeUpdateProfile(profileRef, {
        equippedPieces: equippedVoxel,
        lastEquipAnimation: voxelPieceId,
        lastArmorEquipDate: today,
      })

      if (allApplied) {
        void addXpEvent(familyId, childId, 'ARMOR_DAILY_COMPLETE', 5, `armor_daily_${today}`)
        void checkArmorStreak(profile)
      }

      // Clear morning reset message once a piece is equipped
      setMorningReset(false)
    },
    [profile, familyId, childId, session, today, checkArmorStreak],
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
    await updateDoc(sessionRef, stripUndefined({
      appliedPieces: arrayRemove(armorPieceId),
      manuallyUnequipped: updatedManual,
      completedAt: deleteField(),
    }))

    // Also update equippedPieces on avatar profile
    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    const remainingVoxel = sessionToVoxelPieces(
      (session.appliedPieces ?? []).filter((p) => p !== armorPieceId),
    )
    await safeUpdateProfile(profileRef, {
      equippedPieces: remainingVoxel,
    })

    setUnequipPiece(null)
  }, [familyId, childId, session, today])

  // ── Tier-up ceremony complete: reset equipped pieces ────────────
  const handleCeremonyDone = useCallback(async () => {
    setCeremonyTier(null)
    setCeremonyActive(false)
    if (!familyId || !childId || !profile) return

    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    const newTier = calculateTier(profile.totalXp).toLowerCase() as ArmorTier | PlatformerTier
    await safeUpdateProfile(profileRef, {
      equippedPieces: [],
      currentTier: newTier,
    })
  }, [familyId, childId, profile])

  // ── Piece tap handler — single tap to equip/unequip ────────────
  const handlePieceTap = useCallback(
    (piece: ArmorPieceMeta) => {
      if (!profile || !session || ceremonyActive) return
      const armorPieceId = ARMOR_PIECES.find(
        (p) => ARMOR_PIECE_TO_VOXEL[p.id] === piece.id,
      )?.id

      const isUnlocked = profile.totalXp >= XP_THRESHOLDS[piece.id]
      const isApplied = armorPieceId && (session.appliedPieces ?? []).includes(armorPieceId)

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
    [profile, session, ceremonyActive, handleApplyPiece, handleUnequipDirect],
  )

  // ── Suit Up! — equip all unlocked pieces with staggered animation ──
  const suitUpAll = useCallback(() => {
    if (!profile || !session || !familyId || !childId) return
    const unlockedIds = getUnlockedVoxelPieces(profile)
    const currentApplied = session.appliedPieces ?? []
    const currentVoxel = sessionToVoxelPieces(currentApplied)
    const toEquip = unlockedIds.filter((vid) => !currentVoxel.includes(vid))
    if (toEquip.length === 0) return

    toEquip.forEach((voxelId, i) => {
      setTimeout(() => {
        const meta = VOXEL_ARMOR_PIECES.find((p) => p.id === voxelId)
        if (meta) speakVerse(meta.name, meta.verseText)
        void handleApplyPiece(voxelId as VoxelArmorPieceId)
      }, i * 1500) // 1.5s between each piece — time to hear the verse
    })
  }, [profile, session, familyId, childId, handleApplyPiece])

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
  const appliedPieces = Array.isArray(session?.appliedPieces) ? session.appliedPieces : []
  const appliedVoxel = sessionToVoxelPieces(appliedPieces)
  const unlockedVoxel = profile ? getUnlockedVoxelPieces(profile) : []
  const allEarnedApplied = unlockedVoxel.length > 0 && unlockedVoxel.every((v) => appliedVoxel.includes(v))
  const nextUnlock = profile ? getNextUnlock(profile) : null
  const allSixUnlocked = unlockedVoxel.length === 6

  // Calculate XP progress within the current tier range
  const currentTierName = profile ? calculateTier(profile.totalXp) : 'WOOD'
  const tierEntries = Object.entries(TIERS)
  const currentTierIdx = tierEntries.findIndex(([k]) => k === currentTierName)
  const tierMinXp = TIERS[currentTierName]?.minXp ?? 0
  const nextTierEntry = currentTierIdx < tierEntries.length - 1 ? tierEntries[currentTierIdx + 1] : null
  const tierMaxXp = nextTierEntry ? nextTierEntry[1].minXp : tierMinXp + 1000
  const tierRange = tierMaxXp - tierMinXp
  const xpInTier = profile ? profile.totalXp - tierMinXp : 0
  const tierProgress = tierRange > 0 ? Math.min((xpInTier / tierRange) * 100, 100) : 100



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
        {/* ── Child Switcher + XP/Tier Header ────── */}
        <Box sx={{ textAlign: 'center', pt: 1.5, pb: 0.5 }}>
          {/* Child switcher — only for parent profiles with multiple children */}
          {!isChildProfile && children.length > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: '8px', mb: 2 }}>
              {children.map((child) => {
                const isActive = child.id === childId
                const childIsLincoln = child.name.toLowerCase() === 'lincoln'
                const childAccent = childIsLincoln ? '#7EFC20' : '#E8A0BF'
                return (
                  <Box
                    key={child.id}
                    component="button"
                    onClick={() => setActiveChildId(child.id)}
                    sx={{
                      px: '20px',
                      py: '10px',
                      border: isActive
                        ? `2px solid ${childAccent}`
                        : `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}`,
                      borderRadius: childIsLincoln ? '6px' : '20px',
                      background: isActive
                        ? (childIsLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.12)')
                        : 'transparent',
                      color: isActive
                        ? childAccent
                        : (isLincoln ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'),
                      fontFamily: childIsLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                      fontSize: childIsLincoln ? '0.42rem' : '14px',
                      fontWeight: isActive ? 700 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isActive ? `0 0 12px ${childAccent}22` : 'none',
                      '&:hover': {
                        borderColor: childAccent,
                        background: childIsLincoln ? 'rgba(126,252,32,0.08)' : 'rgba(232,160,191,0.08)',
                      },
                      '&:active': { transform: 'scale(0.96)' },
                    }}
                  >
                    {child.name}
                  </Box>
                )
              })}
            </Box>
          )}

          {/* ── Brothers Toggle ────── */}
          {children.length > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
              <Box
                component="button"
                onClick={() => setBrothersMode((prev) => !prev)}
                sx={{
                  px: '16px',
                  py: '8px',
                  border: brothersMode
                    ? `2px solid ${accentColor}`
                    : `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
                  borderRadius: isLincoln ? '6px' : '18px',
                  background: brothersMode
                    ? (isLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.12)')
                    : 'transparent',
                  color: brothersMode
                    ? accentColor
                    : (isLincoln ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'),
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '0.38rem' : '13px',
                  fontWeight: brothersMode ? 700 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: brothersMode ? `0 0 10px ${accentColor}22` : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  '&:hover': {
                    borderColor: accentColor,
                    background: isLincoln ? 'rgba(126,252,32,0.06)' : 'rgba(232,160,191,0.06)',
                  },
                  '&:active': { transform: 'scale(0.96)' },
                }}
              >
                <span style={{ fontSize: '16px' }}>👬</span>
                Brothers
              </Box>
            </Box>
          )}

          {/* ── Tier + XP Hero Banner ────── */}
          <Box
            sx={{
              mx: 1,
              px: 2,
              py: 2,
              borderRadius: isLincoln ? '8px' : '18px',
              background: isLincoln
                ? 'linear-gradient(135deg, rgba(20,22,36,0.95) 0%, rgba(26,36,56,0.95) 100%)'
                : 'linear-gradient(135deg, rgba(255,240,245,0.95) 0%, rgba(248,232,242,0.95) 100%)',
              border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.18)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              boxShadow: isLincoln
                ? '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)'
                : '0 4px 20px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.5)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Subtle background shimmer */}
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '40%',
                height: '100%',
                background: isLincoln
                  ? 'radial-gradient(ellipse at 80% 50%, rgba(126,252,32,0.04) 0%, transparent 70%)'
                  : 'radial-gradient(ellipse at 80% 50%, rgba(232,160,191,0.06) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />

            {/* Tier badge — prominent */}
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: isLincoln ? '6px' : '12px',
                background: getTierBadgeColor(calculateTier(profile.totalXp)),
                color: getTierTextColor(calculateTier(profile.totalXp)),
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '0.45rem' : '14px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                whiteSpace: 'nowrap',
                textShadow: isLincoln ? '0 1px 3px rgba(0,0,0,0.4)' : 'none',
                boxShadow: isLincoln
                  ? '0 2px 8px rgba(0,0,0,0.3)'
                  : '0 2px 8px rgba(0,0,0,0.08)',
                position: 'relative',
                zIndex: 1,
              }}
            >
              {calculateTier(profile.totalXp)}
            </Box>

            {/* XP info + progress bar */}
            <Box sx={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
                {(isChildProfile || children.length <= 1) && (
                  <Typography
                    sx={{
                      fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                      fontSize: isLincoln ? '0.38rem' : '13px',
                      color: isLincoln ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
                    }}
                  >
                    {activeChild?.name}
                  </Typography>
                )}
                <Typography
                  sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.5rem' : '17px',
                    fontWeight: 700,
                    color: accentColor,
                    ml: 'auto',
                    textShadow: isLincoln ? `0 0 10px ${accentColor}44` : 'none',
                  }}
                >
                  {profile.totalXp} XP
                </Typography>
              </Box>

              {/* Mini tier progress bar */}
              <Box
                sx={{
                  height: 8,
                  borderRadius: isLincoln ? '2px' : '4px',
                  bgcolor: isLincoln ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  overflow: 'hidden',
                  border: `1px solid ${isLincoln ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}`,
                }}
              >
                <Box
                  sx={{
                    height: '100%',
                    width: `${tierProgress}%`,
                    borderRadius: 'inherit',
                    background: isLincoln
                      ? `linear-gradient(90deg, ${accentColor}66, ${accentColor})`
                      : `linear-gradient(90deg, ${accentColor}66, ${accentColor})`,
                    transition: 'width 0.6s ease-out',
                    boxShadow: `0 0 8px ${accentColor}33`,
                  }}
                />
              </Box>

              {/* Next tier hint */}
              {nextTierEntry && (
                <Typography
                  sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.28rem' : '10px',
                    color: isLincoln ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
                    mt: 0.5,
                    textAlign: 'right',
                  }}
                >
                  {tierMaxXp - (profile.totalXp)} XP to {nextTierEntry[0]}
                </Typography>
              )}

              {/* Enchantment glow / cape unlock hints */}
              {!tierHasGlow(currentTierName) && (
                <Typography
                  sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.28rem' : '10px',
                    color: isLincoln ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
                    mt: 0.5,
                    textAlign: 'center',
                  }}
                >
                  Enchantment glow unlocks at Iron tier
                </Typography>
              )}
              {!tierHasCape(currentTierName) && (
                <Typography
                  sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.28rem' : '10px',
                    color: isLincoln ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
                    mt: 0.25,
                    textAlign: 'center',
                  }}
                >
                  {tierHasGlow(currentTierName)
                    ? 'Cape unlocks at Gold tier (enchantment glow active!)'
                    : 'Cape unlocks at Gold tier'}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>

        {/* ── 3D Character Display ─────────────────────────────── */}
        {brothersMode && children.length > 1 ? (
          <Box
            sx={{
              mb: 1,
              mx: 1,
              position: 'relative',
              borderRadius: isLincoln ? '8px' : '20px',
              background: isLincoln
                ? 'radial-gradient(ellipse at 50% 60%, rgba(126,252,32,0.06) 0%, rgba(13,17,23,0) 70%)'
                : 'radial-gradient(ellipse at 50% 60%, rgba(232,160,191,0.08) 0%, rgba(250,245,239,0) 70%)',
              border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.08)' : 'rgba(232,160,191,0.12)'}`,
              overflow: 'hidden',
            }}
          >
            <BrothersVoxelScene
              lincoln={(() => {
                const lincolnChild = children.find((c) => c.name.toLowerCase() === 'lincoln')
                if (!lincolnChild) return null
                const isActive = lincolnChild.id === childId
                const p = isActive ? profile : siblingProfile
                if (!p) return null
                return {
                  name: lincolnChild.name,
                  profile: p,
                  features: p.characterFeatures ?? LINCOLN_FEATURES,
                  ageGroup: p.ageGroup ?? 'older',
                  equippedPieces: isActive ? appliedVoxel : (p.equippedPieces ?? []),
                  totalXp: p.totalXp,
                }
              })()}
              london={(() => {
                const londonChild = children.find((c) => c.name.toLowerCase() === 'london')
                if (!londonChild) return null
                const isActive = londonChild.id === childId
                const p = isActive ? profile : siblingProfile
                if (!p) return null
                return {
                  name: londonChild.name,
                  profile: p,
                  features: p.characterFeatures ?? LONDON_FEATURES,
                  ageGroup: p.ageGroup ?? 'younger',
                  equippedPieces: isActive ? appliedVoxel : (p.equippedPieces ?? []),
                  totalXp: p.totalXp,
                }
              })()}
              activePoseId={activePoseId}
              onPoseComplete={() => setActivePoseId(null)}
            />
            <PoseButtons
              onPose={(poseId) => setActivePoseId(poseId)}
              currentPose={activePoseId}
              isLincoln={isLincoln}
            />
          </Box>
        ) : (
          <Box
            ref={flashContainerRef}
            sx={{
              mb: 1,
              mx: 1,
              position: 'relative',
              borderRadius: isLincoln ? '8px' : '20px',
              background: isLincoln
                ? 'radial-gradient(ellipse at 50% 60%, rgba(126,252,32,0.06) 0%, rgba(13,17,23,0) 70%)'
                : 'radial-gradient(ellipse at 50% 60%, rgba(232,160,191,0.08) 0%, rgba(250,245,239,0) 70%)',
              border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.08)' : 'rgba(232,160,191,0.12)'}`,
              overflow: 'hidden',
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
              photoUrl={profile.photoUrl}
              customization={profile.customization}
              activePoseId={activePoseId}
              onPoseComplete={() => setActivePoseId(null)}
              onSwipePose={(poseId) => setActivePoseId(poseId)}
              onTierUpStart={() => setCeremonyActive(true)}
              onTierUp={async (_oldTier, newTier) => {
                setCeremonyActive(false)
                if (!familyId || !childId) return
                // Reset equipped pieces for the new tier and clear pendingTierUpgrade
                const profileRef = doc(avatarProfilesCollection(familyId), childId)
                await safeUpdateProfile(profileRef, {
                  equippedPieces: [],
                  currentTier: newTier.toLowerCase(),
                  pendingTierUpgrade: deleteField(),
                } as Record<string, unknown>)
                // Clear today's session applied pieces
                const docId = dailyArmorSessionDocId(childId, today)
                const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)
                await updateDoc(sessionRef, {
                  appliedPieces: [],
                  manuallyUnequipped: [],
                  completedAt: deleteField(),
                })
              }}
            />
            <PoseButtons
              onPose={(poseId) => setActivePoseId(poseId)}
              currentPose={activePoseId}
              isLincoln={isLincoln}
            />
          </Box>
        )}

        {/* ── Morning reset message ────────────────────────────── */}
        {morningReset && unlockedVoxel.length > 0 && appliedVoxel.length === 0 && (
          <Box
            sx={{
              textAlign: 'center',
              py: 2,
              px: 2,
              mx: 1,
              mb: 1,
              borderRadius: isLincoln ? '8px' : '16px',
              background: isLincoln
                ? 'linear-gradient(135deg, rgba(255,215,0,0.06) 0%, rgba(255,215,0,0.02) 100%)'
                : 'linear-gradient(135deg, rgba(156,39,176,0.06) 0%, rgba(156,39,176,0.02) 100%)',
              border: `1px solid ${isLincoln ? 'rgba(255,215,0,0.12)' : 'rgba(156,39,176,0.1)'}`,
              animation: 'morningFadeIn 0.5s ease-out',
              '@keyframes morningFadeIn': {
                '0%': { opacity: 0, transform: 'translateY(-4px)' },
                '100%': { opacity: 1, transform: 'translateY(0)' },
              },
            }}
          >
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '0.45rem' : '15px',
                fontWeight: 600,
                color: isLincoln ? '#FFD700' : '#9C27B0',
                lineHeight: 1.6,
              }}
            >
              Good morning! Put on the armor of God today.
            </Typography>
          </Box>
        )}

        {/* ── Armor status text ────────────────────────────────── */}
        {allEarnedApplied && unlockedVoxel.length > 0 ? (
          <Box sx={{ textAlign: 'center', py: 2, mb: 0.5 }}>
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '0.55rem' : '18px',
                fontWeight: 700,
                color: isLincoln ? '#FFD700' : '#9C27B0',
                textShadow: isLincoln ? '0 0 12px rgba(255,215,0,0.3)' : 'none',
              }}
            >
              {allSixUnlocked
                ? 'Full armor equipped!'
                : `${unlockedVoxel.length}/6 pieces on`}
            </Typography>
            {/* Streak display */}
            {(profile.armorStreak ?? 0) > 1 && (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  mt: 0.75,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: isLincoln ? '3px' : '10px',
                  bgcolor: isLincoln ? 'rgba(255,167,38,0.12)' : 'rgba(255,167,38,0.1)',
                  border: '1px solid rgba(255,167,38,0.2)',
                }}
              >
                <Typography
                  sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.32rem' : '12px',
                    color: '#FFA726',
                    fontWeight: 600,
                  }}
                >
                  🔥 {profile.armorStreak}-day streak
                </Typography>
              </Box>
            )}
            {/* Start Your Day button */}
            {isChildProfile && (
              <Box
                component="button"
                onClick={() => navigate('/today')}
                sx={{
                  display: 'block',
                  mx: 'auto',
                  mt: 1.5,
                  px: '28px',
                  py: '12px',
                  borderRadius: isLincoln ? '4px' : '24px',
                  border: 'none',
                  background: isLincoln
                    ? 'linear-gradient(135deg, #7EFC20, #5BC010)'
                    : 'linear-gradient(135deg, #4caf50, #388e3c)',
                  color: isLincoln ? '#000' : '#fff',
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '0.4rem' : '16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: `0 4px 14px ${isLincoln ? 'rgba(126,252,32,0.3)' : 'rgba(76,175,80,0.3)'}`,
                  animation: 'pulse 2s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { transform: 'scale(1)', boxShadow: `0 4px 14px ${isLincoln ? 'rgba(126,252,32,0.3)' : 'rgba(76,175,80,0.3)'}` },
                    '50%': { transform: 'scale(1.03)', boxShadow: `0 6px 20px ${isLincoln ? 'rgba(126,252,32,0.4)' : 'rgba(76,175,80,0.4)'}` },
                  },
                }}
              >
                Start Your Day →
              </Box>
            )}
          </Box>
        ) : unlockedVoxel.length > 0 && appliedVoxel.length < unlockedVoxel.length ? (
          <Box sx={{ textAlign: 'center', py: 1, mb: 0.5 }}>
            {/* Equipped count dots */}
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: '6px', mb: 1.5 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Box
                  key={i}
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: isLincoln ? '2px' : '50%',
                    bgcolor: i < appliedVoxel.length
                      ? accentColor
                      : i < unlockedVoxel.length
                        ? (isLincoln ? 'rgba(126,252,32,0.2)' : 'rgba(232,160,191,0.25)')
                        : (isLincoln ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                    transition: 'all 0.3s ease',
                    boxShadow: i < appliedVoxel.length
                      ? `0 0 6px ${accentColor}44`
                      : 'none',
                  }}
                />
              ))}
            </Box>
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '0.42rem' : '14px',
                fontWeight: 500,
                color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
              }}
            >
              {appliedVoxel.length}/{unlockedVoxel.length} equipped
            </Typography>
            {/* Suit Up! button */}
            <Box
              component="button"
              onClick={suitUpAll}
              sx={{
                mt: 1.5,
                px: '28px',
                py: '12px',
                borderRadius: isLincoln ? '6px' : '22px',
                border: `2px solid ${accentColor}`,
                background: isLincoln
                  ? 'linear-gradient(135deg, rgba(126,252,32,0.12) 0%, rgba(126,252,32,0.06) 100%)'
                  : 'linear-gradient(135deg, rgba(232,160,191,0.12) 0%, rgba(232,160,191,0.06) 100%)',
                color: accentColor,
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '0.42rem' : '15px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: `0 2px 12px ${accentColor}22`,
                '&:hover': {
                  background: isLincoln ? 'rgba(126,252,32,0.2)' : 'rgba(232,160,191,0.2)',
                  transform: 'translateY(-1px)',
                  boxShadow: `0 4px 16px ${accentColor}33`,
                },
                '&:active': { transform: 'scale(0.96)' },
              }}
            >
              ⚔️ Suit Up!
            </Box>
          </Box>
        ) : (
          <Box sx={{ mb: 1.5, px: 1 }}>
            {!allSixUnlocked && nextUnlock ? (
              <Box
                sx={{
                  mx: 1,
                  p: 1.5,
                  borderRadius: isLincoln ? '4px' : '12px',
                  background: isLincoln ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  border: `1px solid ${isLincoln ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
                }}
              >
                <Typography
                  sx={{
                    mb: 0.75,
                    color: isLincoln ? 'rgba(255,255,255,0.6)' : 'text.primary',
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.35rem' : '13px',
                    fontWeight: 500,
                  }}
                >
                  Next: {nextUnlock.piece.name} — {nextUnlock.xpNeeded} XP away
                </Typography>
                <Box
                  sx={{
                    height: 6,
                    borderRadius: isLincoln ? '2px' : '3px',
                    bgcolor: isLincoln ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      height: '100%',
                      width: `${tierProgress}%`,
                      borderRadius: 'inherit',
                      bgcolor: getTierTextColor(currentTierName),
                      transition: 'width 0.5s ease-out',
                    }}
                  />
                </Box>
              </Box>
            ) : allSixUnlocked ? (
              <Typography
                sx={{
                  textAlign: 'center',
                  fontFamily: titleFont,
                  fontSize: isLincoln ? '0.4rem' : '14px',
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
            pb: 2,
            pt: 0.5,
            px: '16px',
            scrollSnapType: 'x mandatory',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {VOXEL_ARMOR_PIECES.map((piece) => {
            const isUnlocked = profile.totalXp >= XP_THRESHOLDS[piece.id]
            const armorPieceId = VOXEL_TO_ARMOR_PIECE[piece.id]
            const isApplied = armorPieceId ? appliedPieces.includes(armorPieceId) : false
            const isSelected = selectedPiece?.id === piece.id
            const xpAway = XP_THRESHOLDS[piece.id] - profile.totalXp
            const unlockProgress = isUnlocked ? 100 : Math.max(0, Math.min(100, (profile.totalXp / XP_THRESHOLDS[piece.id]) * 100))

            return (
              <Box
                key={piece.id}
                onClick={() => handlePieceTap(piece)}
                sx={{
                  minWidth: 120,
                  maxWidth: 120,
                  scrollSnapAlign: 'center',
                  p: '14px 12px 12px',
                  borderRadius: isLincoln ? '8px' : '18px',
                  border: isApplied
                    ? `2px solid ${accentColor}`
                    : isSelected
                      ? `2px solid ${accentColor}88`
                      : isUnlocked
                        ? `1.5px solid ${isLincoln ? 'rgba(126,252,32,0.2)' : 'rgba(232,160,191,0.25)'}`
                        : `1px solid ${isLincoln ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                  background: isApplied
                    ? (isLincoln
                        ? 'linear-gradient(180deg, rgba(126,252,32,0.12) 0%, rgba(13,17,23,0.95) 100%)'
                        : 'linear-gradient(180deg, rgba(232,160,191,0.12) 0%, rgba(255,254,249,0.95) 100%)')
                    : isUnlocked
                      ? (isLincoln
                          ? 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)'
                          : 'linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.005) 100%)')
                      : 'transparent',
                  cursor: 'pointer',
                  opacity: isUnlocked ? 1 : 0.45,
                  transition: 'all 0.25s ease',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  position: 'relative',
                  flexShrink: 0,
                  boxShadow: isApplied
                    ? `0 4px 16px ${accentColor}22`
                    : (isUnlocked ? `0 2px 8px ${isLincoln ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.06)'}` : 'none'),
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: isApplied
                      ? `0 6px 20px ${accentColor}33`
                      : `0 4px 12px ${isLincoln ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)'}`,
                  },
                  '&:active': { transform: 'scale(0.96)' },
                }}
              >
                {/* Status indicator — top strip */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: isApplied ? '50%' : '0%',
                    height: '3px',
                    borderRadius: '0 0 3px 3px',
                    bgcolor: accentColor,
                    transition: 'width 0.3s ease',
                    boxShadow: isApplied ? `0 2px 8px ${accentColor}44` : 'none',
                  }}
                />

                {/* Icon container with glow for equipped */}
                <Box
                  sx={{
                    width: 60,
                    height: 60,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: isLincoln ? '8px' : '50%',
                    background: isApplied
                      ? (isLincoln ? 'rgba(126,252,32,0.12)' : 'rgba(232,160,191,0.12)')
                      : (isUnlocked ? (isLincoln ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : 'transparent'),
                    boxShadow: isApplied
                      ? `0 0 16px ${accentColor}33, inset 0 0 8px ${accentColor}11`
                      : 'none',
                    transition: 'all 0.3s ease',
                    position: 'relative',
                  }}
                >
                  <ArmorIcon
                    pieceId={armorPieceId}
                    size={46}
                    tier={(profile.currentTier ?? 'stone') as ArmorTierColor}
                    locked={!isUnlocked}
                  />

                  {/* Equipped check overlay */}
                  {isApplied && (
                    <Box sx={{
                      position: 'absolute', bottom: -3, right: -3,
                      width: 20, height: 20, borderRadius: '50%',
                      bgcolor: '#4caf50',
                      border: `2px solid ${bgColor}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(76,175,80,0.3)',
                    }}>
                      <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>
                        ✓
                      </Typography>
                    </Box>
                  )}

                  {/* Lock overlay */}
                  {!isUnlocked && (
                    <Box sx={{
                      position: 'absolute', bottom: -3, right: -3,
                      width: 20, height: 20, borderRadius: '50%',
                      bgcolor: isLincoln ? '#2a2a2a' : '#ddd',
                      border: `2px solid ${bgColor}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10,
                    }}>
                      🔒
                    </Box>
                  )}
                </Box>

                {/* Piece name */}
                <Typography
                  sx={{
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.3rem' : '12.5px',
                    fontWeight: 600,
                    color: isApplied
                      ? accentColor
                      : isUnlocked
                        ? textColor
                        : (isLincoln ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'),
                    lineHeight: 1.2,
                  }}
                >
                  {piece.shortName}
                </Typography>

                {/* Status / XP progress */}
                {isApplied ? (
                  <Typography
                    sx={{
                      fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                      fontSize: isLincoln ? '0.24rem' : '10px',
                      color: '#4caf50',
                      fontWeight: 600,
                    }}
                  >
                    Equipped
                  </Typography>
                ) : isUnlocked ? (
                  <Typography
                    sx={{
                      fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                      fontSize: isLincoln ? '0.24rem' : '10px',
                      color: '#FFA726',
                    }}
                  >
                    Tap to equip
                  </Typography>
                ) : (
                  <Box sx={{ width: '85%' }}>
                    <Box
                      sx={{
                        height: 4,
                        borderRadius: '2px',
                        bgcolor: isLincoln ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        sx={{
                          height: '100%',
                          width: `${unlockProgress}%`,
                          borderRadius: 'inherit',
                          bgcolor: isLincoln ? 'rgba(126,252,32,0.35)' : 'rgba(232,160,191,0.4)',
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </Box>
                    <Typography
                      sx={{
                        fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                        fontSize: isLincoln ? '0.18rem' : '9px',
                        color: isLincoln ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
                        mt: 0.5,
                      }}
                    >
                      {xpAway > 0 ? `${xpAway} XP` : `${XP_THRESHOLDS[piece.id]} XP`}
                    </Typography>
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>

        {/* ── Shield Emblem & Helmet Crest Pickers ──────────────── */}
        {(appliedPieces.includes('shield_of_faith' as ArmorPiece) || appliedPieces.includes('helmet_of_salvation' as ArmorPiece)) && (
          <Box sx={{ display: 'flex', gap: 1.5, mt: 1, mx: 2, flexWrap: 'wrap' }}>
            {appliedPieces.includes('shield_of_faith' as ArmorPiece) && (
              <ShieldEmblemPicker
                currentEmblem={profile.customization?.shieldEmblem}
                isIronOrAbove={!['WOOD', 'STONE'].includes(currentTierName)}
                isLincoln={isLincoln}
                onSelect={(emblem) => void handleEmblemChange(emblem)}
              />
            )}
            {appliedPieces.includes('helmet_of_salvation' as ArmorPiece) && (
              <HelmetCrestPicker
                currentCrest={profile.customization?.helmetCrest}
                isIronOrAbove={!['WOOD', 'STONE'].includes(currentTierName)}
                isLincoln={isLincoln}
                onSelect={(crest) => void handleCrestChange(crest)}
              />
            )}
          </Box>
        )}

        {/* ── Verse Card (for selected piece) ──────────────────── */}
        {selectedPiece && (
          <Box
            sx={{
              mt: 2,
              mx: 1,
              p: '24px',
              background: isLincoln
                ? 'linear-gradient(135deg, rgba(16,18,32,0.98) 0%, rgba(22,32,52,0.98) 100%)'
                : 'linear-gradient(135deg, rgba(255,254,249,0.98) 0%, rgba(250,245,240,0.98) 100%)',
              border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.15)' : 'rgba(232,160,191,0.2)'}`,
              borderRadius: isLincoln ? '8px' : '20px',
              position: 'relative',
              animation: 'verseSlideUp 0.3s ease-out',
              '@keyframes verseSlideUp': {
                '0%': { opacity: 0, transform: 'translateY(10px)' },
                '100%': { opacity: 1, transform: 'translateY(0)' },
              },
              boxShadow: isLincoln
                ? `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${accentColor}08`
                : '0 8px 32px rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}
          >
            {/* Top bar: speaker + close */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Box
                component="button"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation()
                  speakVerse(selectedPiece.name, selectedPiece.verseText)
                }}
                sx={{
                  background: isLincoln ? 'rgba(126,252,32,0.1)' : 'rgba(232,160,191,0.1)',
                  border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.2)' : 'rgba(232,160,191,0.2)'}`,
                  borderRadius: isLincoln ? '4px' : '10px',
                  width: 36, height: 36,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', p: 0, color: accentColor,
                  transition: 'all 0.2s ease',
                  '&:hover': { background: isLincoln ? 'rgba(126,252,32,0.18)' : 'rgba(232,160,191,0.18)' },
                }}
                aria-label="Read verse aloud"
              >
                <VolumeUpIcon sx={{ fontSize: 18 }} />
              </Box>

              <Box
                component="button"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setSelectedPiece(null) }}
                sx={{
                  background: 'none', border: 'none',
                  color: isLincoln ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)',
                  fontSize: 20, cursor: 'pointer', p: '4px',
                  '&:hover': { color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' },
                }}
              >
                ✕
              </Box>
            </Box>

            {/* Piece name */}
            <Typography sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '0.5rem' : '16px',
              fontWeight: 600,
              color: accentColor,
              mb: 0.25,
            }}>
              {selectedPiece.name}
            </Typography>

            {/* Verse reference */}
            <Typography sx={{
              fontFamily: 'monospace',
              fontSize: isLincoln ? '0.32rem' : '11px',
              color: isLincoln ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
              mb: 1.5,
            }}>
              {selectedPiece.verse}
            </Typography>

            {/* Verse text with left accent bar */}
            <Box
              sx={{
                borderLeft: `3px solid ${accentColor}55`,
                pl: 2,
                py: 1,
                my: 0.5,
                borderRadius: '0 8px 8px 0',
                background: isLincoln
                  ? 'rgba(126,252,32,0.03)'
                  : 'rgba(232,160,191,0.04)',
              }}
            >
              <Typography sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '0.42rem' : '14.5px',
                color: textColor,
                lineHeight: 1.8,
                fontStyle: 'italic',
              }}>
                &ldquo;{selectedPiece.verseText}&rdquo;
              </Typography>
            </Box>

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
                  fontSize: isLincoln ? '0.42rem' : '15px',
                  fontWeight: 700,
                  py: 1.25,
                  borderRadius: isLincoln ? '4px' : '12px',
                  textTransform: 'none',
                  boxShadow: `0 2px 10px ${accentColor}33`,
                  '&:hover': { bgcolor: accentColor, opacity: 0.9 },
                }}
              >
                Put it on!
              </Button>
            )}
          </Box>
        )}

        {/* ── Outfit Customizer ─────────────────────────────────── */}
        <OutfitCustomizer
          customization={profile.customization}
          ageGroup={ageGroup}
          onColorChange={(slot, hex) => void handleOutfitColorChange(slot, hex)}
        />

        {/* ── Armor Dye Panel ──────────────────────────────────── */}
        <ArmorDyePanel
          armorColors={profile.customization?.armorColors}
          unlockedPieces={unlockedVoxel}
          tierName={currentTierName}
          isStoneOrAbove={currentTierName !== 'WOOD'}
          isLincoln={isLincoln}
          onColorChange={(pieceId, hex) => void handleArmorDyeChange(pieceId, hex)}
          onReset={() => void handleArmorDyeReset()}
        />

        {/* ── Photo Upload Section ──────────────────────────────── */}
        <Box
          sx={{
            mt: 2,
            mx: 1,
            p: 2,
            borderRadius: isLincoln ? '8px' : '18px',
            border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.1)' : 'rgba(232,160,191,0.18)'}`,
            background: isLincoln
              ? 'linear-gradient(135deg, rgba(20,22,36,0.95) 0%, rgba(26,30,46,0.95) 100%)'
              : 'linear-gradient(135deg, rgba(255,254,249,0.95) 0%, rgba(250,245,240,0.95) 100%)',
            boxShadow: isLincoln
              ? '0 4px 16px rgba(0,0,0,0.2)'
              : '0 4px 16px rgba(0,0,0,0.04)',
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
                fontSize: isLincoln ? '0.42rem' : '15px',
                fontWeight: 600,
                color: accentColor,
              }}
            >
              Transform YOUR Photo
            </Typography>
          </Box>

          {!photoPreviewUrl ? (
            <Box
              component="button"
              onClick={() => photoInputRef.current?.click()}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                width: '100%',
                px: 2,
                py: 1.5,
                borderRadius: isLincoln ? '6px' : '14px',
                border: `2px dashed ${isLincoln ? 'rgba(126,252,32,0.25)' : 'rgba(232,160,191,0.35)'}`,
                background: isLincoln ? 'rgba(126,252,32,0.04)' : 'rgba(232,160,191,0.04)',
                color: accentColor,
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '0.38rem' : '14px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': {
                  background: isLincoln ? 'rgba(126,252,32,0.08)' : 'rgba(232,160,191,0.08)',
                  borderColor: accentColor,
                  transform: 'translateY(-1px)',
                },
                '&:active': { transform: 'scale(0.98)' },
              }}
            >
              <CameraAltIcon sx={{ fontSize: 20 }} />
              {profile.photoUrl ? 'Change Photo' : 'Upload a Photo'}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Box
                component="img"
                src={photoPreviewUrl}
                alt="Preview"
                sx={{
                  width: 88,
                  height: 88,
                  objectFit: 'cover',
                  borderRadius: isLincoln ? '6px' : '14px',
                  border: `2px solid ${accentColor}55`,
                  boxShadow: `0 4px 12px ${isLincoln ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)'}`,
                }}
              />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => void handlePhotoTransform()}
                  disabled={photoExtracting}
                  sx={{
                    bgcolor: accentColor,
                    color: isLincoln ? '#000' : '#fff',
                    borderRadius: isLincoln ? '4px' : '10px',
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.35rem' : '13px',
                    textTransform: 'none',
                    py: 1,
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
                    color: isLincoln ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                    fontSize: isLincoln ? '0.32rem' : '12px',
                    textTransform: 'none',
                  }}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          )}

          {photoError && (
            <Alert severity="error" sx={{ mt: 1, fontSize: '0.8rem', borderRadius: isLincoln ? '4px' : '10px' }}>
              {photoError}
            </Alert>
          )}

          {profile.characterFeatures && !photoPreviewUrl && (
            <Typography
              sx={{
                display: 'block',
                mt: 0.75,
                color: isLincoln ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
                fontSize: '11px',
                fontFamily: 'monospace',
              }}
            >
              3D character reflects your look
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

      {/* ── Tier-up ceremony (flash + banner + sound) ──────────── */}
      <TierUpCeremony
        active={!!ceremonyTier}
        newTierName={ceremonyTier}
        onComplete={handleCeremonyDone}
      />
    </Box>
  )
}
