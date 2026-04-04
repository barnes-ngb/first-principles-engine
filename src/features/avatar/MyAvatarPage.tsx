import { useCallback, useEffect, useRef, useState } from 'react'
import { addDoc, arrayRemove, deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import ShareIcon from '@mui/icons-material/Share'
import FolderIcon from '@mui/icons-material/Folder'

import { useNavigate } from 'react-router-dom'
import Page from '../../components/Page'
import SectionErrorBoundary from '../../components/SectionErrorBoundary'
import {
  artifactsCollection,
  avatarProfilesCollection,
  dailyArmorSessionsCollection,
  dailyArmorSessionDocId,
  stripUndefined,
} from '../../core/firebase/firestore'
import { uploadArtifactFile, generateFilename } from '../../core/firebase/upload'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { getTodayDateString } from '../../core/avatar/getDailyArmorSession'
import { normalizeAvatarProfile } from './normalizeProfile'
import { useAvatarProfile } from './useAvatarProfile'
import { safeUpdateProfile, safeSetProfile } from './safeProfileWrite'
import { ARMOR_PIECES, ARMOR_PIECE_TO_VOXEL, DEFAULT_PROPORTIONS, LINCOLN_FEATURES, LONDON_FEATURES } from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import type {
  AccessoryId,
  ArmorPiece,
  ArmorTier,
  Artifact,
  AvatarBackground,
  AvatarProfile,
  CharacterProportions,
  DailyArmorSession,
  HelmetCrest,
  OutfitCustomization,
  PlatformerTier,
  ShieldEmblem,
  VoxelArmorPieceId,
} from '../../core/types'
import { ACCESSORY_SLOTS } from '../../core/types'

import type { VoxelCharacterHandle } from './VoxelCharacter'
import { VOXEL_ARMOR_PIECES, XP_THRESHOLDS } from './voxel/buildArmorPiece'
import type { ArmorPieceMeta } from './voxel/buildArmorPiece'
import ArmorVerseCard from './ArmorVerseCard'
import { speakVerse } from './speakVerse'
import { forgeArmorPiece } from '../../core/xp/forgeArmorPiece'
import { getForgeCost } from '../../core/xp/forgeCosts'
import XpDiamondBar from '../../components/XpDiamondBar'
import PortalTransition from './PortalTransition'
import { getNextTierKey } from './tierBiomes'
import ArmorPieceGallery from './ArmorPieceGallery'
import Particles from './Particles'
import UnlockCelebration from './UnlockCelebration'
import TierUpgradeCelebration from './TierUpgradeCelebration'
import TierUpCeremony from '../../components/avatar/TierUpCeremony'
import { calculateTier, TIERS } from './voxel/tierMaterials'
import AvatarHeroBanner from './AvatarHeroBanner'
import AvatarCharacterDisplay from './AvatarCharacterDisplay'
import ArmorSuitUpPanel from './ArmorSuitUpPanel'
import AvatarCustomizer from './AvatarCustomizer'

// ── Helpers ───────────────────────────────────────────────────────

/** Normalize raw Firestore DailyArmorSession data — guards against non-array fields */
function normalizeDailyArmorSession(raw: DailyArmorSession): DailyArmorSession {
  return {
    ...raw,
    appliedPieces: Array.isArray(raw.appliedPieces) ? raw.appliedPieces : [],
    manuallyUnequipped: Array.isArray(raw.manuallyUnequipped) ? raw.manuallyUnequipped : [],
  }
}

/** Pieces visible in gallery (XP meets threshold — for display, not equip) */
function getVisiblePieces(profile: AvatarProfile): VoxelArmorPieceId[] {
  const xp = profile.totalXp
  return VOXEL_ARMOR_PIECES
    .filter((p) => xp >= XP_THRESHOLDS[p.id])
    .map((p) => p.id)
}

/** @deprecated Use getVisiblePieces or getEquippablePieces instead */
function getUnlockedVoxelPieces(profile: AvatarProfile): VoxelArmorPieceId[] {
  return getVisiblePieces(profile)
}

/** Get the tier the child is currently forging in (lowest unlocked tier with unforged pieces). */
function getActiveForgeTier(profile: AvatarProfile): string {
  const tiers = profile.unlockedTiers ?? ['wood']
  const forged = profile.forgedPieces ?? {}
  const allPieceIds: VoxelArmorPieceId[] = ['belt', 'shoes', 'breastplate', 'shield', 'helmet', 'sword']

  for (const tier of tiers) {
    const tierForged = forged[tier] ?? {}
    const allForgedInTier = allPieceIds.every(id => tierForged[id])
    if (!allForgedInTier) return tier
  }

  return tiers[tiers.length - 1] ?? 'wood'
}

/** Pieces that can be equipped (forged in active tier) */
function getEquippablePieces(profile: AvatarProfile): VoxelArmorPieceId[] {
  const activeTier = getActiveForgeTier(profile)
  const forged = profile.forgedPieces?.[activeTier] ?? {}
  return Object.keys(forged) as VoxelArmorPieceId[]
}

function getNextUnlock(profile: AvatarProfile): { piece: ArmorPieceMeta; xpNeeded: number } | null {
  const visible = new Set(getVisiblePieces(profile))
  const next = VOXEL_ARMOR_PIECES.find((p) => !visible.has(p.id))
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
  const [portalTransition, setPortalTransition] = useState<{ from: string; to: string } | null>(null)
  const [ceremonyActive, setCeremonyActive] = useState(false)
  const [ceremonyTier, setCeremonyTier] = useState<string | null>(null)

  // Photo feature extraction

  // Animation state
  const [animateEquipId, setAnimateEquipId] = useState<string | null>(null)
  const [animateUnequipId, setAnimateUnequipId] = useState<string | null>(null)
  const [particles, setParticles] = useState<{ x: number; y: number } | null>(null)

  // Animated XP display (count-up effect)
  const [displayXp, setDisplayXp] = useState(0)
  const xpAnimRef = useRef<number>(0)
  useEffect(() => {
    const targetXp = profile?.totalXp ?? 0
    const startXp = displayXp
    const diff = targetXp - startXp
    if (diff === 0) return
    const duration = 500
    const startTime = performance.now()
    function tick(now: number) {
      const t = Math.min((now - startTime) / duration, 1)
      const eased = t * (2 - t)
      setDisplayXp(Math.round(startXp + diff * eased))
      if (t < 1) xpAnimRef.current = requestAnimationFrame(tick)
    }
    xpAnimRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(xpAnimRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.totalXp])

  // Pose state
  const [activePoseId, setActivePoseId] = useState<string | null>(null)

  // Screenshot state
  const voxelRef = useRef<VoxelCharacterHandle>(null)
  const [screenshotData, setScreenshotData] = useState<string | null>(null)
  const [showScreenshotModal, setShowScreenshotModal] = useState(false)
  const [savingToPortfolio, setSavingToPortfolio] = useState(false)

  // Brothers mode state
  const [brothersMode, setBrothersMode] = useState(false)
  // Background mode (persisted in profile customization)
  const [bgMode, setBgMode] = useState<AvatarBackground>('night')
  // Character tuner state
  const [tunerOpen, setTunerOpen] = useState(false)
  const [localProportions, setLocalProportions] = useState<CharacterProportions>(DEFAULT_PROPORTIONS)
  const siblingChild = children.find((c) => c.id !== childId)
  const siblingId = brothersMode ? siblingChild?.id : undefined
  const siblingProfile = useAvatarProfile(familyId, siblingId)

  // Track previous state for celebrations
  const prevPiecesCountRef = useRef(0)
  const prevTierRef = useRef<string | null>(null)
  const prevXpRef = useRef(0)

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
          // Sync background preference from profile
          if (data.customization?.background) {
            setBgMode(data.customization.background)
          }
          // Sync proportions from profile
          if (data.customization?.proportions) {
            setLocalProportions({ ...DEFAULT_PROPORTIONS, ...data.customization.proportions })
          } else {
            setLocalProportions(DEFAULT_PROPORTIONS)
          }

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

  const handleBackgroundToggle = useCallback(
    async () => {
      if (!familyId || !childId || !profile) return
      const newBg: AvatarBackground = bgMode === 'night' ? 'room' : 'night'
      setBgMode(newBg)
      const customization: OutfitCustomization = { ...profile.customization, background: newBg }
      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      await safeUpdateProfile(profileRef, { customization })
    },
    [familyId, childId, profile, bgMode],
  )

  // ── Accessory toggle ──────────────────────────────────────────────
  const handleAccessoryToggle = useCallback(
    async (accId: AccessoryId) => {
      if (!familyId || !childId || !profile) return
      const current = profile.customization?.accessories ?? []
      let updated: AccessoryId[]

      if (current.includes(accId)) {
        // Unequip
        updated = current.filter((id) => id !== accId)
      } else {
        // Equip — enforce slot exclusivity (remove any other item in the same slot)
        const slot = Object.entries(ACCESSORY_SLOTS).find(
          ([, ids]) => (ids as readonly string[]).includes(accId),
        )?.[0]
        const slotItems = slot ? ACCESSORY_SLOTS[slot as keyof typeof ACCESSORY_SLOTS] : []
        updated = [
          ...current.filter((id) => !(slotItems as readonly string[]).includes(id)),
          accId,
        ]
      }

      const customization: OutfitCustomization = { ...profile.customization, accessories: updated }
      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      await safeUpdateProfile(profileRef, { customization })
    },
    [familyId, childId, profile],
  )

  // ── Character tuner handlers ─────────────────────────────────────
  const handleTunerToggle = useCallback(() => {
    setTunerOpen((prev) => !prev)
  }, [])

  const handleTunerProportionsChange = useCallback((newProportions: CharacterProportions) => {
    setLocalProportions(newProportions)
  }, [])

  const handleTunerCapeColorChange = useCallback(
    async (hex: string) => {
      if (!familyId || !childId || !profile) return
      const customization: OutfitCustomization = { ...profile.customization, capeColor: hex }
      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      await safeUpdateProfile(profileRef, { customization })
    },
    [familyId, childId, profile],
  )

  const handleTunerDone = useCallback(async () => {
    if (!familyId || !childId || !profile) return
    const customization: OutfitCustomization = {
      ...profile.customization,
      proportions: localProportions,
    }
    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    await safeUpdateProfile(profileRef, { customization })
    setTunerOpen(false)
  }, [familyId, childId, profile, localProportions])

  const handleTunerReset = useCallback(() => {
    setLocalProportions(DEFAULT_PROPORTIONS)
  }, [])

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

  // ── Forge a piece (spend diamonds) ─────────────────────────────
  const handleForgePiece = useCallback(
    async (voxelPieceId: VoxelArmorPieceId, verseResponse?: string, verseResponseAudio?: string): Promise<boolean> => {
      if (!profile || !familyId || !childId) return false
      const activeTier = getActiveForgeTier(profile)
      const result = await forgeArmorPiece(familyId, childId, activeTier, voxelPieceId, verseResponse, verseResponseAudio)
      if (result.success) {
        setSelectedPiece(null)

        // Check if this completed the tier (all 6 forged) and next tier is unlocked
        // We need to simulate the updated forgedPieces since profile hasn't refreshed yet
        const updatedForged = { ...(profile.forgedPieces ?? {}) }
        if (!updatedForged[activeTier]) updatedForged[activeTier] = {}
        updatedForged[activeTier] = { ...updatedForged[activeTier], [voxelPieceId]: { forgedAt: new Date().toISOString() } }
        const forgedCount = Object.keys(updatedForged[activeTier] ?? {}).length

        if (forgedCount >= 6) {
          const nextTier = getNextTierKey(activeTier)
          if (nextTier && (profile.unlockedTiers ?? []).includes(nextTier) && profile.lastPortalTier !== activeTier) {
            // Delay portal to let forge animation play
            setTimeout(() => setPortalTransition({ from: activeTier, to: nextTier }), 1500)
          }
        }
        return true
      } else {
        console.warn(`[Forge] Failed: ${result.error}`)
        return false
      }
    },
    [profile, familyId, childId],
  )

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
      const equippable = getEquippablePieces(profile)
      const allApplied = equippable.length > 0 && equippable.every((vid) => {
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
          .catch((err) => console.error('[XP] Award failed:', err))
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

      const isApplied = armorPieceId && (session.appliedPieces ?? []).includes(armorPieceId)
      const activeTier = getActiveForgeTier(profile)
      const isForged = Boolean(profile.forgedPieces?.[activeTier]?.[piece.id])

      if (isApplied) {
        // Equipped → unequip (toggle off)
        setUnequipPiece(piece.id)
        void handleUnequipDirect(piece.id)
      } else if (isForged) {
        // Forged → equip immediately + read verse aloud
        speakVerse(piece.name, piece.verseText)
        void handleApplyPiece(piece.id)
      } else {
        // Not forged (whether XP-unlocked or locked) → show verse card
        // The verse card will show forge button if unlocked, info-only if locked
        setSelectedPiece((prev) => {
          if (prev?.id === piece.id) return null
          speakVerse(piece.name, piece.verseText)
          return piece
        })
      }
    },
    [profile, session, ceremonyActive, handleApplyPiece, handleUnequipDirect],
  )

  // ── Suit Up! — equip all forged pieces with staggered animation ──
  const suitUpAll = useCallback(() => {
    if (!profile || !session || !familyId || !childId) return
    const forgedIds = getEquippablePieces(profile)
    const currentVoxel = sessionToVoxelPieces(session.appliedPieces ?? [])
    // Canonical equip order: belt → breastplate → shoes → shield → helmet → sword
    const equipOrder: VoxelArmorPieceId[] = ['belt', 'breastplate', 'shoes', 'shield', 'helmet', 'sword']
    const toEquip = equipOrder.filter((vid) => forgedIds.includes(vid) && !currentVoxel.includes(vid))
    if (toEquip.length === 0) return

    toEquip.forEach((voxelId, i) => {
      setTimeout(() => {
        const meta = VOXEL_ARMOR_PIECES.find((p) => p.id === voxelId)
        if (meta) speakVerse(meta.name, meta.verseText)
        void handleApplyPiece(voxelId as VoxelArmorPieceId)
      }, i * 200) // Stagger 200ms apart for a cascading effect
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

    // Screen flash + subtle camera shake
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

      // Subtle camera shake — 2px random offset for 200ms
      const el = container
      const origTransform = el.style.transform
      let shakeFrame = 0
      const shakeStart = performance.now()
      function shake(now: number) {
        const elapsed = now - shakeStart
        if (elapsed > 200) {
          el.style.transform = origTransform
          return
        }
        const intensity = 2 * (1 - elapsed / 200)
        const dx = (Math.random() - 0.5) * intensity
        const dy = (Math.random() - 0.5) * intensity
        el.style.transform = `translate(${dx}px, ${dy}px)`
        shakeFrame = requestAnimationFrame(shake)
      }
      shakeFrame = requestAnimationFrame(shake)
      setTimeout(() => cancelAnimationFrame(shakeFrame), 250)
    }
  }, [isLincoln])

  const handleUnequipAnimDone = useCallback(() => {
    setAnimateUnequipId(null)
  }, [])

  // ── Computed values ────────────────────────────────────────────
  const appliedPieces = Array.isArray(session?.appliedPieces) ? session.appliedPieces : []
  const appliedVoxel = sessionToVoxelPieces(appliedPieces)
  const unlockedVoxel = profile ? getVisiblePieces(profile) : []
  const equippableVoxel = profile ? getEquippablePieces(profile) : []
  const allEarnedApplied = equippableVoxel.length > 0 && equippableVoxel.every((v) => appliedVoxel.includes(v))
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

  // ── Screenshot capture ──────────────────────────────────────────
  const playShutterSound = useCallback(() => {
    try {
      const ctx = new AudioContext()
      const bufferSize = ctx.sampleRate * 0.1 // 100ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize
        data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - t * 6) * 0.3
      }
      const source = ctx.createBufferSource()
      source.buffer = buffer
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 2000
      source.connect(filter)
      filter.connect(ctx.destination)
      source.start()
    } catch { /* Web Audio not available */ }
  }, [])

  const captureAvatar = useCallback(() => {
    const rawDataUrl = voxelRef.current?.capture()
    if (!rawDataUrl) return

    // Composite the 3D canvas with a text overlay bar
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)

      // Semi-transparent bar at the bottom
      const barHeight = Math.round(img.height * 0.08)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.fillRect(0, img.height - barHeight, img.width, barHeight)

      // Text
      const fontSize = Math.round(barHeight * 0.45)
      ctx.font = `bold ${fontSize}px "Press Start 2P", monospace`
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const tierLabel = profile ? calculateTier(profile.totalXp) : ''
      const xp = profile?.totalXp ?? 0
      const name = activeChild?.name ?? ''
      const text = `${name}  •  ${tierLabel} Tier  •  ${xp} XP`
      ctx.fillText(text, img.width / 2, img.height - barHeight / 2, img.width - 20)

      // Small watermark
      const wmSize = Math.round(barHeight * 0.3)
      ctx.font = `${wmSize}px monospace`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.textAlign = 'right'
      ctx.fillText('Armor of God', img.width - 8, img.height - barHeight - 6)

      playShutterSound()
      setScreenshotData(canvas.toDataURL('image/png'))
      setShowScreenshotModal(true)
    }
    img.src = rawDataUrl
  }, [profile, activeChild, playShutterSound])

  const saveToDevice = useCallback((dataUrl: string) => {
    const link = document.createElement('a')
    link.download = `${activeChild?.name ?? 'avatar'}-armor-of-god.png`
    link.href = dataUrl
    link.click()
  }, [activeChild])

  const shareImage = useCallback(async (dataUrl: string) => {
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    const file = new File([blob], `${activeChild?.name ?? 'avatar'}-armor-of-god.png`, { type: 'image/png' })

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: `${activeChild?.name}'s Armor of God`,
        text: `Check out ${activeChild?.name}'s armor! ${currentTierName} tier, ${profile?.totalXp ?? 0} XP!`,
        files: [file],
      })
    } else {
      saveToDevice(dataUrl)
    }
  }, [activeChild, profile, currentTierName, saveToDevice])

  const saveToPortfolio = useCallback(async (dataUrl: string) => {
    if (!familyId || !childId || !profile) return
    setSavingToPortfolio(true)
    try {
      const response = await fetch(dataUrl)
      const blob = await response.blob()

      const artifact: Omit<Artifact, 'id'> = {
        childId,
        title: `${activeChild?.name ?? 'Avatar'} - ${currentTierName} Tier Armor`,
        type: EvidenceType.Photo,
        createdAt: new Date().toISOString(),
        content: `Avatar screenshot: ${currentTierName} tier, ${profile.totalXp} XP, ${appliedVoxel.length}/6 pieces equipped`,
        tags: {
          engineStage: EngineStage.Share,
          domain: 'Character',
          subjectBucket: SubjectBucket.Other,
          location: 'Home',
        },
      }
      const docRef = await addDoc(artifactsCollection(familyId), artifact)

      const filename = generateFilename('png')
      const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, blob, filename)
      await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })

      setShowScreenshotModal(false)
      setScreenshotData(null)
    } finally {
      setSavingToPortfolio(false)
    }
  }, [familyId, childId, profile, activeChild, currentTierName, appliedVoxel.length])

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
    <Box sx={{ minHeight: '100dvh', bgcolor: bgColor, color: textColor, pb: 3, maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box' }}>
      {/* ── Portal Transition Overlay ────────────────────────── */}
      {portalTransition && (
        <PortalTransition
          fromTier={portalTransition.from}
          toTier={portalTransition.to}
          onComplete={() => {
            // Save guard so portal doesn't re-fire on reload
            if (familyId && childId && portalTransition) {
              const profileRef = doc(avatarProfilesCollection(familyId), childId)
              void safeUpdateProfile(profileRef, { lastPortalTier: portalTransition.from })
            }
            setPortalTransition(null)
          }}
        />
      )}
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
                      fontSize: childIsLincoln ? '12px' : '16px',
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

          {/* ── Tier + XP Hero Banner ────── */}
          <AvatarHeroBanner
            profile={profile}
            displayXp={displayXp}
            isLincoln={isLincoln}
            isChildProfile={isChildProfile}
            childName={activeChild?.name}
            childCount={children.length}
            accentColor={accentColor}
          />
        </Box>

        {/* ── 3D Character Display ─────────────────────────────── */}
        <AvatarCharacterDisplay
          profile={profile}
          isLincoln={isLincoln}
          childId={childId}
          children={children}
          siblingProfile={siblingProfile}
          features={features}
          ageGroup={ageGroup}
          appliedVoxel={appliedVoxel}
          brothersMode={brothersMode}
          onBrothersModeToggle={() => setBrothersMode((prev) => !prev)}
          bgMode={bgMode}
          onBgToggle={handleBackgroundToggle}
          activePoseId={activePoseId}
          onPoseChange={setActivePoseId}
          voxelRef={voxelRef}
          flashContainerRef={flashContainerRef}
          onCapture={captureAvatar}
          accentColor={accentColor}
          animateEquipId={animateEquipId}
          animateUnequipId={animateUnequipId}
          onEquipAnimDone={handleEquipAnimDone}
          onUnequipAnimDone={handleUnequipAnimDone}
          onTierUpStart={() => setCeremonyActive(true)}
          proportions={localProportions}
          onEditCharacter={handleTunerToggle}
          tunerOpen={tunerOpen}
          onTierUp={async (_oldTier, newTier) => {
            setCeremonyActive(false)
            if (!familyId || !childId) return
            const profileRef = doc(avatarProfilesCollection(familyId), childId)
            await safeUpdateProfile(profileRef, {
              equippedPieces: [],
              currentTier: newTier.toLowerCase(),
              pendingTierUpgrade: deleteField(),
            } as Record<string, unknown>)
            const docId = dailyArmorSessionDocId(childId, today)
            const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)
            await updateDoc(sessionRef, {
              appliedPieces: [],
              manuallyUnequipped: [],
              completedAt: deleteField(),
            })
          }}
        />

        {/* ── XP + Diamond HUD ────────────────────────────────── */}
        {familyId && childId && (
          <Box sx={{ mx: 2, mb: 1 }}>
            <XpDiamondBar familyId={familyId} childId={childId} />
          </Box>
        )}

        {/* ── Morning reset + Armor status + Suit Up ────────────── */}
        <ArmorSuitUpPanel
          profile={profile}
          morningReset={morningReset}
          unlockedVoxel={unlockedVoxel}
          appliedVoxel={appliedVoxel}
          allEarnedApplied={allEarnedApplied}
          allSixUnlocked={allSixUnlocked}
          nextUnlock={nextUnlock}
          currentTierName={currentTierName}
          tierProgress={tierProgress}
          isLincoln={isLincoln}
          isChildProfile={isChildProfile}
          accentColor={accentColor}
          onSuitUpAll={suitUpAll}
          onStartDay={() => navigate('/today')}
        />

        {/* ── Armor Piece Cards (horizontal scroll) ────────────── */}
        <SectionErrorBoundary section="armor gallery">
          <ArmorPieceGallery
            profile={profile}
            appliedPieces={appliedPieces}
            selectedPiece={selectedPiece}
            activeForgeTier={getActiveForgeTier(profile)}
            isLincoln={isLincoln}
            accentColor={accentColor}
            textColor={textColor}
            bgColor={bgColor}
            onPieceTap={handlePieceTap}
          />
        </SectionErrorBoundary>

        {/* ── Verse Card (for selected piece) ──────────────────── */}
        {selectedPiece && (
          <ArmorVerseCard
            piece={selectedPiece}
            isUnlocked={true}
            isEquipped={appliedVoxel.includes(selectedPiece.id)}
            isForged={Boolean(profile.forgedPieces?.[getActiveForgeTier(profile)]?.[selectedPiece.id])}
            forgeCost={getForgeCost(getActiveForgeTier(profile), selectedPiece.id)}
            isLincoln={isLincoln}
            accentColor={accentColor}
            textColor={textColor}
            onEquip={() => void handleApplyPiece(selectedPiece.id)}
            onForge={(verseResponse, verseResponseAudio) => handleForgePiece(selectedPiece.id, verseResponse, verseResponseAudio)}
            onClose={() => setSelectedPiece(null)}
          />
        )}

        {/* ── Customizer (outfit, dye, accessories, emblem, crest, skin, photo) ── */}
        <AvatarCustomizer
          profile={profile}
          familyId={familyId}
          childId={childId}
          childName={activeChild?.name}
          isLincoln={isLincoln}
          ageGroup={ageGroup}
          appliedPieces={appliedPieces}
          unlockedVoxel={unlockedVoxel}
          appliedVoxel={appliedVoxel}
          currentTierName={currentTierName}
          accentColor={accentColor}
          textColor={textColor}
          onOutfitColorChange={handleOutfitColorChange}
          onArmorDyeChange={handleArmorDyeChange}
          onArmorDyeReset={handleArmorDyeReset}
          onEmblemChange={handleEmblemChange}
          onCrestChange={handleCrestChange}
          onAccessoryToggle={handleAccessoryToggle}
          tunerOpen={tunerOpen}
          tunerProportions={localProportions}
          tunerOutfitColors={{
            shirtColor: profile.customization?.shirtColor ?? (isLincoln ? '#CC5500' : '#E8A838'),
            pantsColor: profile.customization?.pantsColor ?? (isLincoln ? '#2A3A52' : '#C4B998'),
            shoeColor: profile.customization?.shoeColor ?? '#3D2B1F',
            capeColor: profile.customization?.capeColor ?? (isLincoln ? '#8B0000' : '#2255AA'),
          }}
          onTunerProportionsChange={handleTunerProportionsChange}
          onTunerCapeColorChange={handleTunerCapeColorChange}
          onTunerDone={handleTunerDone}
          onTunerReset={handleTunerReset}
        />
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

      {/* ── Screenshot Preview Modal ────────────────────────────── */}
      <Dialog
        open={showScreenshotModal}
        onClose={() => { setShowScreenshotModal(false); setScreenshotData(null) }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: isLincoln ? '#0d1117' : '#faf5ef',
            borderRadius: isLincoln ? '8px' : '20px',
            border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.15)' : 'rgba(232,160,191,0.2)'}`,
          },
        }}
      >
        <DialogContent sx={{ p: 2, position: 'relative' }}>
          {/* Close button */}
          <Box
            component="button"
            onClick={() => { setShowScreenshotModal(false); setScreenshotData(null) }}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'none',
              border: 'none',
              color: isLincoln ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)',
              fontSize: 22,
              cursor: 'pointer',
              zIndex: 1,
              '&:hover': { color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' },
            }}
          >
            ✕
          </Box>

          {/* Preview image */}
          {screenshotData && (
            <Box
              component="img"
              src={screenshotData}
              alt="Avatar screenshot"
              sx={{
                width: '100%',
                borderRadius: isLincoln ? '6px' : '14px',
                border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.1)' : 'rgba(232,160,191,0.15)'}`,
                mb: 2,
              }}
            />
          )}

          {/* Action buttons */}
          <Box sx={{ display: 'flex', gap: 1.5, flexDirection: 'column' }}>
            <Box
              component="button"
              onClick={() => screenshotData && saveToDevice(screenshotData)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                width: '100%',
                py: 1.5,
                borderRadius: isLincoln ? '6px' : '14px',
                border: `2px solid ${accentColor}`,
                background: isLincoln
                  ? 'linear-gradient(135deg, rgba(126,252,32,0.12) 0%, rgba(126,252,32,0.06) 100%)'
                  : 'linear-gradient(135deg, rgba(232,160,191,0.12) 0%, rgba(232,160,191,0.06) 100%)',
                color: accentColor,
                fontFamily: titleFont,
                fontSize: isLincoln ? '12px' : '16px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minHeight: '48px',
                '&:hover': { transform: 'translateY(-1px)', boxShadow: `0 4px 16px ${accentColor}33` },
                '&:active': { transform: 'scale(0.96)' },
              }}
            >
              <SaveAltIcon sx={{ fontSize: 20 }} />
              Save to Device
            </Box>

            <Box
              component="button"
              onClick={() => screenshotData && void shareImage(screenshotData)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                width: '100%',
                py: 1.5,
                borderRadius: isLincoln ? '6px' : '14px',
                border: `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
                background: isLincoln ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                color: isLincoln ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
                fontFamily: titleFont,
                fontSize: isLincoln ? '12px' : '16px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': { borderColor: accentColor, color: accentColor },
                '&:active': { transform: 'scale(0.96)' },
              }}
            >
              <ShareIcon sx={{ fontSize: 20 }} />
              Share
            </Box>

            <Box
              component="button"
              onClick={() => screenshotData && void saveToPortfolio(screenshotData)}
              disabled={savingToPortfolio}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                width: '100%',
                py: 1.5,
                borderRadius: isLincoln ? '6px' : '14px',
                border: `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
                background: isLincoln ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                color: isLincoln ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
                fontFamily: titleFont,
                fontSize: isLincoln ? '12px' : '16px',
                fontWeight: 600,
                cursor: savingToPortfolio ? 'default' : 'pointer',
                opacity: savingToPortfolio ? 0.5 : 1,
                transition: 'all 0.2s ease',
                '&:hover': savingToPortfolio ? {} : { borderColor: accentColor, color: accentColor },
                '&:active': savingToPortfolio ? {} : { transform: 'scale(0.96)' },
              }}
            >
              <FolderIcon sx={{ fontSize: 20 }} />
              {savingToPortfolio ? 'Saving...' : 'Save to Portfolio'}
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
