import { useCallback, useEffect, useRef, useState } from 'react'
import { addDoc, arrayRemove, deleteField, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore'
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
  daysCollection,
  stripUndefined,
  weeksCollection,
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
import { getActiveForgeTier, getAppliedVoxelPieces, getArmorPieceState, getEquippablePieces, getVisiblePieces } from './armorPieceState'
import type { ArmorPieceMeta } from './voxel/buildArmorPiece'
import ArmorVerseCard from './ArmorVerseCard'
import { speakStatus, speakVerse } from './speakVerse'
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
import AvatarCharacterDisplay from './AvatarCharacterDisplay'
import ArmorSuitUpPanel from './ArmorSuitUpPanel'
import AvatarCustomizer from './AvatarCustomizer'
import { getArmorGateStatusFromSession } from './armorGate'
import { getWeekRange } from '../../core/utils/time'
import { dayLogDocId } from '../today/daylog.model'
import HeroMissionCard, { type HeroMission } from './HeroMissionCard'
import StonebridgePreviewCard from './StonebridgePreviewCard'

type NextRecommendedAction =
  | { type: 'forge'; label: string }
  | { type: 'suit_up'; label: string }
  | { type: 'start_day'; label: string }
  | { type: 'earn_xp'; label: string }

type HeroHubWeekData = {
  weekNumber?: number
  conundrum?: { title: string; answered: boolean }
  chapterQuestion?: { answered: boolean }
  chapterTitle?: string
  chapterIntro?: string
}

// ── Helpers ───────────────────────────────────────────────────────

/** Normalize raw Firestore DailyArmorSession data — guards against non-array fields */
function normalizeDailyArmorSession(raw: DailyArmorSession): DailyArmorSession {
  return {
    ...raw,
    appliedPieces: Array.isArray(raw.appliedPieces) ? raw.appliedPieces : [],
    manuallyUnequipped: Array.isArray(raw.manuallyUnequipped) ? raw.manuallyUnequipped : [],
  }
}

function getNextUnlock(profile: AvatarProfile): { piece: ArmorPieceMeta; xpNeeded: number } | null {
  const visible = new Set(getVisiblePieces(profile))
  const next = VOXEL_ARMOR_PIECES.find((p) => !visible.has(p.id))
  if (!next) return null
  return { piece: next, xpNeeded: Math.max(XP_THRESHOLDS[next.id] - profile.totalXp, 0) }
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
  const [optimisticDiamondBalance, setOptimisticDiamondBalance] = useState<number | null>(null)
  const [, setUnequipPiece] = useState<VoxelArmorPieceId | null>(null)

  const [celebrationPiece, setCelebrationPiece] = useState<ArmorPiece | null>(null)
  const [tierCelebration, setTierCelebration] = useState<{ from: string; to: string } | null>(null)
  const [portalPrompt, setPortalPrompt] = useState<{ from: string; to: string } | null>(null)
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
  const [childCustomizerExpanded, setChildCustomizerExpanded] = useState(false)
  const [weekData, setWeekData] = useState<HeroHubWeekData | null>(null)
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
          currentTier: isLincoln ? 'wood' : 'basic',
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

          const unlockedCount = getVisiblePieces(data).length
          if (unlockedCount > prevPiecesCountRef.current && prevPiecesCountRef.current > 0) {
            // A new piece was unlocked
            const unlocked = getVisiblePieces(data)
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

  // Clear optimistic diamond override once live profile catches up.
  useEffect(() => {
    if (optimisticDiamondBalance === null) return
    if (profile?.diamondBalance === optimisticDiamondBalance) {
      setOptimisticDiamondBalance(null)
    }
  }, [optimisticDiamondBalance, profile?.diamondBalance])

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

  useEffect(() => {
    if (!familyId || !childId) return
    let cancelled = false

    const loadHeroHubWeekData = async () => {
      const weekRange = getWeekRange(new Date())
      const dayLogRef = doc(daysCollection(familyId), dayLogDocId(today, childId))
      const [dayLogSnap, weekSnap] = await Promise.all([
        getDoc(dayLogRef),
        getDocs(query(weeksCollection(familyId), where('startDate', '==', weekRange.start))),
      ])
      if (cancelled) return

      const dayLog = dayLogSnap.exists() ? dayLogSnap.data() : null
      const weekPlan = weekSnap.docs[0]?.data()
      const weekStart = new Date(`${weekRange.start}T00:00:00Z`)
      const currentWeek = Math.max(1, Math.floor((Date.now() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1)

      setWeekData({
        weekNumber: currentWeek,
        conundrum: weekPlan?.conundrum
          ? { title: weekPlan.conundrum.title, answered: !!weekPlan.conundrum.discussed }
          : undefined,
        chapterQuestion: dayLog?.chapterQuestion
          ? { answered: !!dayLog.chapterQuestion.responded }
          : undefined,
        chapterTitle: dayLog?.chapterQuestion
          ? `${dayLog.chapterQuestion.book} ${dayLog.chapterQuestion.chapter}`
          : undefined,
        chapterIntro: dayLog?.chapterQuestion?.question,
      })
    }

    void loadHeroHubWeekData()
    return () => {
      cancelled = true
    }
  }, [familyId, childId, today])

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
      if (profile.totalXp < XP_THRESHOLDS[voxelPieceId]) {
        console.warn(`[Forge] XP locked: ${voxelPieceId}`)
        return false
      }

      const activeTier = getActiveForgeTier(profile)
      const appliedTodayVoxel = getAppliedVoxelPieces(session?.appliedPieces ?? [])
      const pieceState = getArmorPieceState({
        profile,
        pieceId: voxelPieceId,
        activeForgeTier: activeTier,
        appliedTodayVoxel: appliedTodayVoxel,
      })
      if (pieceState !== 'forgeable') {
        console.warn(`[Forge] Piece not forgeable: ${voxelPieceId} (${pieceState})`)
        return false
      }

      const result = await forgeArmorPiece(familyId, childId, activeTier, voxelPieceId, verseResponse, verseResponseAudio)
      if (result.success) {
        setSelectedPiece(null)
        if (typeof result.newBalance === 'number') {
          setOptimisticDiamondBalance(result.newBalance)
        }

        // Check if this completed the tier (all 6 forged) and next tier is unlocked
        // We need to simulate the updated forgedPieces since profile hasn't refreshed yet
        const updatedForged = { ...(profile.forgedPieces ?? {}) }
        if (!updatedForged[activeTier]) updatedForged[activeTier] = {}
        updatedForged[activeTier] = { ...updatedForged[activeTier], [voxelPieceId]: { forgedAt: new Date().toISOString() } }
        const forgedCount = Object.keys(updatedForged[activeTier] ?? {}).length

        if (forgedCount >= 6) {
          const nextTier = getNextTierKey(activeTier)
          if (nextTier && (profile.unlockedTiers ?? []).includes(nextTier) && profile.lastPortalTier !== activeTier) {
            // Delay prompt to let forge animation play, then let child confirm before transition
            setTimeout(() => setPortalPrompt({ from: activeTier, to: nextTier }), 1500)
          }
        }
        return true
      } else {
        console.warn(`[Forge] Failed: ${result.error}`)
        return false
      }
    },
    [profile, familyId, childId, session?.appliedPieces],
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
      const equippedVoxel = [...getAppliedVoxelPieces(updatedApplied)]
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
    const remainingVoxel = getAppliedVoxelPieces(
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
      const pieceState = getArmorPieceState({
        profile,
        pieceId: piece.id,
        activeForgeTier: getActiveForgeTier(profile),
        appliedTodayVoxel: getAppliedVoxelPieces(session.appliedPieces ?? []),
      })

      if (isApplied) {
        // Equipped → unequip (toggle off)
        setUnequipPiece(piece.id)
        void handleUnequipDirect(piece.id)
      } else if (pieceState === 'forged_not_equipped_today') {
        // Forged → equip immediately + read verse aloud
        speakVerse(piece.name, piece.verseText)
        void handleApplyPiece(piece.id)
      } else {
        // Locked/forgeable/equipped state details are shown in verse card
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
    const currentVoxel = getAppliedVoxelPieces(session.appliedPieces ?? [])
    // Canonical equip order: belt → breastplate → shoes → shield → helmet → sword
    const equipOrder: VoxelArmorPieceId[] = ['belt', 'breastplate', 'shoes', 'shield', 'helmet', 'sword']
    const toEquip = equipOrder.filter((vid) => forgedIds.includes(vid) && !currentVoxel.includes(vid))
    if (toEquip.length === 0) return

    const pieceCount = toEquip.length
    const pieceLabel = pieceCount === 1 ? 'piece' : 'pieces'
    speakStatus(`Suiting up ${pieceCount} ${pieceLabel}. Great choice!`)

    toEquip.forEach((voxelId, i) => {
      setTimeout(() => {
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
  const appliedVoxel = getAppliedVoxelPieces(appliedPieces)
  const unlockedVoxel = profile ? getVisiblePieces(profile) : []
  const armorGateStatus = profile ? getArmorGateStatusFromSession(profile, session) : null
  const allEarnedApplied = armorGateStatus?.hasForgedPieces ? armorGateStatus.complete : false
  const nextUnlock = profile ? getNextUnlock(profile) : null
  const allSixUnlocked = unlockedVoxel.length === 6
  const nextUnlockProgress = (() => {
    if (!profile || !nextUnlock) return 0
    const nextIdx = VOXEL_ARMOR_PIECES.findIndex((piece) => piece.id === nextUnlock.piece.id)
    const prevThreshold = nextIdx > 0 ? XP_THRESHOLDS[VOXEL_ARMOR_PIECES[nextIdx - 1].id] : 0
    const nextThreshold = XP_THRESHOLDS[nextUnlock.piece.id]
    const unlockRange = Math.max(nextThreshold - prevThreshold, 1)
    const unlockProgress = profile.totalXp - prevThreshold
    return Math.min(Math.max((unlockProgress / unlockRange) * 100, 0), 100)
  })()

  // Calculate XP progress within the current tier range
  const currentTierName = profile ? calculateTier(profile.totalXp) : 'WOOD'
  const nextRecommendedAction: NextRecommendedAction = (() => {
    if (allEarnedApplied && unlockedVoxel.length > 0) {
      return { type: 'start_day', label: 'Start your day' }
    }
    if (unlockedVoxel.length > 0 && appliedVoxel.length < unlockedVoxel.length) {
      return { type: 'suit_up', label: 'Suit up' }
    }
    if (!allSixUnlocked && nextUnlock) {
      if (nextUnlock.xpNeeded <= 0) {
        return { type: 'forge', label: `Forge ${nextUnlock.piece.shortName}` }
      }
      return { type: 'earn_xp', label: `Earn ${nextUnlock.xpNeeded} XP for ${nextUnlock.piece.shortName}` }
    }
    return { type: 'start_day', label: 'Start your day' }
  })()

  const mission: HeroMission = (() => {
    if (!allEarnedApplied) {
      return {
        icon: '⚡',
        title: "Today's Mission",
        text: 'Suit up your armor and head to the village square.',
        cta: 'Suit Up & Begin',
        action: () => {
          document.getElementById('hero-hub-customize')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        },
      }
    }
    if (weekData?.conundrum && !weekData.conundrum.answered) {
      return {
        icon: '🤔',
        title: "Today's Mission",
        text: `${weekData.conundrum.title} — the village needs your wisdom.`,
        cta: 'Join the Discussion',
        action: () => navigate('/today#conundrum'),
      }
    }
    if (weekData?.chapterQuestion && !weekData.chapterQuestion.answered) {
      return {
        icon: '📖',
        title: "Today's Mission",
        text: 'A new chapter awaits in Stonebridge.',
        cta: 'Read & Discuss',
        action: () => navigate('/today#chapter'),
      }
    }
    return {
      icon: '⚔️',
      title: 'Hero Ready',
      text: 'Your armor is on. The village is counting on you.',
      cta: 'Start Your Day',
      action: () => navigate('/today'),
    }
  })()

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
      {portalPrompt && (
        <Dialog
          open
          onClose={() => undefined}
          maxWidth="xs"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
              border: '2px solid rgba(155,89,182,0.5)',
              bgcolor: isLincoln ? 'rgba(13,17,23,0.96)' : '#1a0033',
              color: '#fff',
              textAlign: 'center',
              px: 1,
            },
          }}
        >
          <DialogContent sx={{ py: 3 }}>
            <Box sx={{ fontFamily: '"Press Start 2P", monospace', fontSize: '12px', color: '#BB86FC', mb: 1.5 }}>
              A portal opens to the next biome.
            </Box>
            <Box sx={{ fontFamily: '"Press Start 2P", monospace', fontSize: '10px', color: 'rgba(255,255,255,0.7)', mb: 3 }}>
              Tap to continue your adventure.
            </Box>
            <Box
              component="button"
              onClick={() => {
                if (familyId && childId) {
                  const profileRef = doc(avatarProfilesCollection(familyId), childId)
                  void safeUpdateProfile(profileRef, { lastPortalTier: portalPrompt.from })
                }
                setPortalTransition(portalPrompt)
                setPortalPrompt(null)
              }}
              sx={{
                border: 0,
                px: 2.5,
                py: 1.2,
                borderRadius: 2,
                cursor: 'pointer',
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '10px',
                color: '#fff',
                bgcolor: '#7B1FA2',
                boxShadow: '0 0 16px rgba(123,31,162,0.45)',
                '&:hover': { bgcolor: '#9C27B0' },
              }}
            >
              Enter portal
            </Box>
          </DialogContent>
        </Dialog>
      )}
      {portalTransition && (
        <PortalTransition
          fromTier={portalTransition.from}
          toTier={portalTransition.to}
          onComplete={() => {
            setPortalTransition(null)
          }}
        />
      )}
      <Page>
        {/* ── Hero Hub Header ────── */}
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

          <Box
            sx={{
              mx: 1,
              px: 2,
              py: 1.5,
              borderRadius: isLincoln ? '8px' : '16px',
              border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.14)' : 'rgba(232,160,191,0.2)'}`,
              background: isLincoln ? 'rgba(14,20,28,0.9)' : 'rgba(255,245,251,0.9)',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
              <Box sx={{ fontFamily: titleFont, fontSize: isLincoln ? '14px' : '18px', fontWeight: 700 }}>
                Hero Hub
              </Box>
              <Box sx={{ fontFamily: titleFont, fontSize: isLincoln ? '10px' : '14px', opacity: 0.72 }}>
                {activeChild?.name ?? 'Hero'}
              </Box>
            </Box>
          </Box>
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

        <HeroMissionCard mission={mission} isLincoln={isLincoln} />
        <StonebridgePreviewCard
          isLincoln={isLincoln}
          weekData={{
            weekNumber: weekData?.weekNumber,
            chapterTitle: weekData?.chapterTitle,
            chapterIntro: weekData?.chapterIntro,
            conundrumTitle: weekData?.conundrum?.title,
          }}
        />
        <Box
          sx={{
            mx: 1,
            mt: 1,
            mb: 1,
            px: 1.5,
            py: 1,
            borderRadius: isLincoln ? '6px' : '12px',
            border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.16)' : 'rgba(232,160,191,0.2)'}`,
            background: isLincoln ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.6)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 1,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          <Box sx={{ fontFamily: titleFont, fontSize: isLincoln ? '10px' : '14px' }}>
            ◆ {optimisticDiamondBalance ?? profile.diamondBalance ?? 0}
          </Box>
          <Box sx={{ fontFamily: titleFont, fontSize: isLincoln ? '10px' : '14px' }}>
            XP {displayXp}
          </Box>
          <Box sx={{ fontFamily: titleFont, fontSize: isLincoln ? '10px' : '14px' }}>
            {currentTierName} tier
          </Box>
        </Box>

        {/* ── XP + Diamond HUD ────────────────────────────────── */}
        {familyId && childId && (
          <Box sx={{ mx: 2, mb: 1 }}>
            <XpDiamondBar
              familyId={familyId}
              childId={childId}
              diamondBalanceOverride={optimisticDiamondBalance}
            />
          </Box>
        )}
        <Box id="hero-hub-customize" sx={{ mx: 2, my: 1.5, textAlign: 'center', opacity: 0.7, fontFamily: titleFont, fontSize: isLincoln ? '10px' : '14px' }}>
          ── Customize ──
        </Box>

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
          nextUnlockProgress={nextUnlockProgress}
          isLincoln={isLincoln}
          isChildProfile={isChildProfile}
          accentColor={accentColor}
          nextRecommendedAction={nextRecommendedAction}
          onSuitUpAll={suitUpAll}
          onForgeNext={() => {
            if (!nextUnlock) return
            setSelectedPiece(nextUnlock.piece)
          }}
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
            pieceState={getArmorPieceState({
              profile,
              pieceId: selectedPiece.id,
              activeForgeTier: getActiveForgeTier(profile),
              appliedTodayVoxel: appliedVoxel,
            })}
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
        {isChildProfile ? (
          <Box sx={{ px: 2, mt: 1 }}>
            <Box
              component="button"
              onClick={() => setChildCustomizerExpanded((prev) => !prev)}
              sx={{
                width: '100%',
                py: 1.25,
                borderRadius: isLincoln ? '6px' : '14px',
                border: `1.5px solid ${isLincoln ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)'}`,
                background: isLincoln ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                color: isLincoln ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.75)',
                fontFamily: titleFont,
                fontSize: isLincoln ? '12px' : '15px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {childCustomizerExpanded ? 'Hide customize options' : 'Customize warrior'}
            </Box>
            {childCustomizerExpanded && (
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
            )}
          </Box>
        ) : (
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
        )}
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
