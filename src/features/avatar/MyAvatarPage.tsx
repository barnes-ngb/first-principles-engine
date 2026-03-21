import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { arrayRemove, deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'

import Page from '../../components/Page'
import { app } from '../../core/firebase/firebase'
import { avatarProfilesCollection, dailyArmorSessionsCollection, dailyArmorSessionDocId } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { ensureNewProfileStructure } from '../../core/xp/checkAndUnlockArmor'
import { getTodayDateString } from '../../core/avatar/getDailyArmorSession'
import { ARMOR_PIECES } from '../../core/types'
import type { ArmorPiece, AvatarProfile, DailyArmorSession } from '../../core/types'
import { cropAllArmorRegions, ARMOR_REGIONS } from '../../core/avatar/cropArmorRegions'

import ArmorPieceButton from './ArmorPieceButton'
import AttachAnimation from './AttachAnimation'
import type { AttachAnimState } from './AttachAnimation'
import CharacterDisplay from './CharacterDisplay'
import Particles from './Particles'
import { isPieceEarned } from './armorUtils'
import type { ArmorTierColor } from './icons/ArmorIcons'
import TierUpgradeCelebration from './TierUpgradeCelebration'
import UnlockCelebration from './UnlockCelebration'
import VerseCard from './VerseCard'

// ── Helpers ───────────────────────────────────────────────────────

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>
}

function getEarnedPieces(profile: AvatarProfile): ArmorPiece[] {
  return ARMOR_PIECES.filter((p) => isPieceEarned(profile, p.id)).map((p) => p.id)
}

function getNextUnlockPiece(profile: AvatarProfile): { id: ArmorPiece; xpNeeded: number } | null {
  const allEarned = new Set(getEarnedPieces(profile))
  const next = ARMOR_PIECES.find((p) => !allEarned.has(p.id))
  if (!next) return null
  return { id: next.id, xpNeeded: Math.max(next.xpToUnlockStone - profile.totalXp, 0) }
}

function toTierColor(tier: string): ArmorTierColor {
  const valid: ArmorTierColor[] = ['stone', 'diamond', 'netherite', 'basic', 'powerup', 'champion']
  return valid.includes(tier as ArmorTierColor) ? (tier as ArmorTierColor) : 'stone'
}

/**
 * Get the bounding rect and center of a piece's region overlay
 * using data-piece-id attribute or falling back to ARMOR_REGIONS percentages.
 */
function getRegionRect(
  containerEl: HTMLElement,
  pieceId: ArmorPiece,
): { rect: DOMRect; center: { x: number; y: number } } {
  // Try finding the actual overlay element
  const overlayEl = containerEl.querySelector(`[data-piece-id="${pieceId}"]`)
  if (overlayEl) {
    const rect = overlayEl.getBoundingClientRect()
    return { rect, center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } }
  }
  // Fallback: compute from ARMOR_REGIONS percentages
  const region = ARMOR_REGIONS.find((r) => r.pieceId === pieceId)
  const r = containerEl.getBoundingClientRect()
  if (region) {
    const x = r.left + (region.leftPct / 100) * r.width
    const y = r.top + (region.topPct / 100) * r.height
    const w = (region.widthPct / 100) * r.width
    const h = (region.heightPct / 100) * r.height
    const rect = new DOMRect(x, y, w, h)
    return { rect, center: { x: x + w / 2, y: y + h / 2 } }
  }
  // Ultimate fallback: center of container
  const rect = containerEl.getBoundingClientRect()
  return { rect, center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } }
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
  const familyId = useFamilyId()
  const { activeChild } = useActiveChild()
  const childId = activeChild?.id ?? ''
  const isLincoln = activeChild?.name?.toLowerCase() === 'lincoln'

  const [profile, setProfile] = useState<AvatarProfile | null>(null)
  const [session, setSession] = useState<DailyArmorSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPiece, setSelectedPiece] = useState<ArmorPiece | null>(null)
  const [unequipPiece, setUnequipPiece] = useState<ArmorPiece | null>(null)
  const [celebrationPiece, setCelebrationPiece] = useState<ArmorPiece | null>(null)
  const [tierCelebration, setTierCelebration] = useState<{ from: string; to: string } | null>(null)
  const [baseCharGenerating, setBaseCharGenerating] = useState(false)
  const [croppedImages, setCroppedImages] = useState<Partial<Record<ArmorPiece, string>>>({})

  // Photo transform — multi-step pipeline
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [photoTransforming, setPhotoTransforming] = useState(false)
  const [photoTransformError, setPhotoTransformError] = useState<string | null>(null)
  const [pipelineStep, setPipelineStep] = useState<'idle' | 'bare' | 'approve' | 'armor' | 'done'>('idle')
  const [bareCharacterUrl, setBareCharacterUrl] = useState<string | null>(null)
  const [armorRefGenerating, setArmorRefGenerating] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Animation state
  const [attachAnim, setAttachAnim] = useState<AttachAnimState | null>(null)
  const [lastAppliedPiece, setLastAppliedPiece] = useState<ArmorPiece | null>(null)
  const [particles, setParticles] = useState<{ x: number; y: number } | null>(null)
  const charDisplayRef = useRef<HTMLDivElement | null>(null)
  const buttonRefsMap = useRef<Partial<Record<ArmorPiece, HTMLDivElement>>>({})

  // Reduced motion
  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  ).current

  // Dev overlay state
  const [showArmoredRef, setShowArmoredRef] = useState(false)
  const [reCropping, setReCropping] = useState(false)

  // Track previous state for celebrations
  const prevPiecesCountRef = useRef(0)
  const prevTierRef = useRef<string | null>(null)
  const today = getTodayDateString()

  // Theme
  const bgColor = isLincoln ? '#0d1117' : '#faf5ef'
  const textColor = isLincoln ? '#e0e0e0' : '#3d3d3d'
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  // ── Ensure avatar profile exists ──────────────────────────────
  useEffect(() => {
    if (!familyId || !childId) return
    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    const ensureProfile = async () => {
      const { getDoc } = await import('firebase/firestore')
      const snap = await getDoc(profileRef)
      if (!snap.exists()) {
        const newProfile: AvatarProfile = {
          childId,
          themeStyle: isLincoln ? 'minecraft' : 'platformer',
          pieces: [],
          currentTier: isLincoln ? 'stone' : 'basic',
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

          const earnedCount = getEarnedPieces(data).length
          if (earnedCount > prevPiecesCountRef.current && prevPiecesCountRef.current > 0) {
            const earned = getEarnedPieces(data)
            const newPiece = earned[earned.length - 1]
            setCelebrationPiece(newPiece)
          }
          prevPiecesCountRef.current = earnedCount

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

  // ── Crop armor regions from armor reference image ──────────────
  useEffect(() => {
    if (!profile) return
    const armorRefUrl = profile.armorReferenceUrls?.[profile.currentTier]
    if (!armorRefUrl) return

    setCroppedImages({})

    let cancelled = false
    const cropAll = async () => {
      try {
        const results = await cropAllArmorRegions(armorRefUrl)
        if (!cancelled) setCroppedImages(results)
      } catch {
        // Fall back — no cropped images available
      }
    }
    void cropAll()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.armorReferenceUrls, profile?.currentTier])

  // ── Generate base character on first visit ─────────────────────
  useEffect(() => {
    if (!profile || !familyId || !childId) return
    if (profile.baseCharacterUrl) return
    if (baseCharGenerating) return

    setBaseCharGenerating(true)
    const fns = getFunctions(app)
    const generateBaseCharacterFn = httpsCallable<
      { familyId: string; childId: string; themeStyle: string },
      { url: string }
    >(fns, 'generateBaseCharacter')

    generateBaseCharacterFn({ familyId, childId, themeStyle: profile.themeStyle })
      .then(async (result) => {
        const profileRef = doc(avatarProfilesCollection(familyId), childId)
        const { getDoc } = await import('firebase/firestore')
        const snap = await getDoc(profileRef)
        const current = snap.exists() ? snap.data() as AvatarProfile : profile
        await setDoc(profileRef, {
          ...current,
          baseCharacterUrl: result.data.url,
          updatedAt: new Date().toISOString(),
        })
      })
      .catch((err: unknown) => {
        console.error('Base character generation failed:', err)
      })
      .finally(() => {
        setBaseCharGenerating(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.childId, profile?.baseCharacterUrl])

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
        setPhotoTransformError(null)
      }
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
  }, [])

  // ── Photo transform — Step 1: Generate bare pixel character ────
  const handlePhotoTransform = useCallback(async () => {
    if (!familyId || !childId || !photoPreviewUrl || !profile) return
    setPhotoTransforming(true)
    setPhotoTransformError(null)
    setPipelineStep('bare')

    try {
      const fns = getFunctions(app)
      const transformFn = httpsCallable<
        { familyId: string; childId: string; themeStyle: string; photoBase64: string; photoMimeType: string },
        { url: string }
      >(fns, 'transformAvatarPhoto')

      const [header, base64] = photoPreviewUrl.split(',')
      const mimeType = header.split(':')[1].split(';')[0]

      const result = await transformFn({
        familyId,
        childId,
        themeStyle: profile.themeStyle,
        photoBase64: base64,
        photoMimeType: mimeType,
      })

      // Save bare character as base + photo transform
      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      const { getDoc } = await import('firebase/firestore')
      const snap = await getDoc(profileRef)
      const current = snap.exists() ? snap.data() as AvatarProfile : profile
      await setDoc(profileRef, stripUndefined({
        ...current,
        baseCharacterUrl: result.data.url,
        photoTransformUrl: result.data.url,
        updatedAt: new Date().toISOString(),
      }))

      setBareCharacterUrl(result.data.url)
      setPipelineStep('approve')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transform failed — try a different photo.'
      setPhotoTransformError(msg)
      setPipelineStep('idle')
    } finally {
      setPhotoTransforming(false)
    }
  }, [familyId, childId, photoPreviewUrl, profile])

  // ── Photo transform — Step 2: Generate armor reference ─────────
  const handleApproveAndGenerateArmor = useCallback(async () => {
    if (!familyId || !childId || !bareCharacterUrl || !profile) return
    setArmorRefGenerating(true)
    setPipelineStep('armor')
    setPhotoTransformError(null)

    try {
      const fns = getFunctions(app)
      const armorRefFn = httpsCallable<
        { familyId: string; childId: string; baseCharacterUrl: string; tier: string; themeStyle: string },
        { url: string }
      >(fns, 'generateArmorReference')

      const result = await armorRefFn({
        familyId,
        childId,
        baseCharacterUrl: bareCharacterUrl,
        tier: profile.currentTier,
        themeStyle: profile.themeStyle,
      })

      // Crop regions client-side
      const regions = await cropAllArmorRegions(result.data.url)
      setCroppedImages(regions)

      setPipelineStep('done')
      setPhotoPreviewUrl(null)
      setBareCharacterUrl(null)

      // Auto-dismiss after 2s
      setTimeout(() => setPipelineStep('idle'), 2000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Armor generation failed — try again.'
      setPhotoTransformError(msg)
      setPipelineStep('approve') // Go back to approve step
    } finally {
      setArmorRefGenerating(false)
    }
  }, [familyId, childId, bareCharacterUrl, profile])

  // ── Apply a piece ──────────────────────────────────────────────
  const handleApplyPiece = useCallback(
    async (pieceId: ArmorPiece) => {
      if (!profile || !familyId || !childId || !session) return
      if (session.appliedPieces.includes(pieceId)) return

      setSelectedPiece(null)

      const updatedApplied = [...session.appliedPieces, pieceId]
      const earnedPieces = getEarnedPieces(profile)
      const allApplied = earnedPieces.every((p) => updatedApplied.includes(p))

      // Fanfare must be triggered in user-gesture context — schedule notes ~1.5s out
      if (allApplied && isLincoln) {
        playArmorFanfare(1.5)
      }

      // Start materialize-inward animation (skip if reduced motion)
      if (!reducedMotion) {
        const charEl = charDisplayRef.current

        if (charEl) {
          const { rect, center } = getRegionRect(charEl, pieceId)

          setAttachAnim({
            pieceId,
            tier: toTierColor(profile.currentTier),
            regionRect: rect,
            landingCenter: center,
          })
        }
      }

      // Write to Firestore in parallel with animation
      const docId = dailyArmorSessionDocId(childId, today)
      const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)

      await setDoc(sessionRef, {
        ...session,
        appliedPieces: updatedApplied,
        ...(allApplied ? { completedAt: new Date().toISOString() } : {}),
      })

      if (allApplied && familyId && childId) {
        void addXpEvent(familyId, childId, 'ARMOR_DAILY_COMPLETE', 5, `armor_daily_${today}`)
      }
    },
    [profile, familyId, childId, session, today, isLincoln, reducedMotion],
  )

  // ── Piece tap handler (open verse card or unequip dialog) ─────
  const handlePieceTap = useCallback(
    (pieceId: ArmorPiece) => {
      if (!profile || !session) return
      if (session.appliedPieces.includes(pieceId)) {
        setUnequipPiece(pieceId)
      } else if (isPieceEarned(profile, pieceId)) {
        setSelectedPiece(pieceId)
      }
      // Locked pieces: do nothing
    },
    [profile, session],
  )

  // ── Unequip a piece for today ──────────────────────────────────
  const handleUnequip = useCallback(async () => {
    if (!unequipPiece || !familyId || !childId) return
    const docId = dailyArmorSessionDocId(childId, today)
    const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)
    await updateDoc(sessionRef, {
      appliedPieces: arrayRemove(unequipPiece),
      completedAt: deleteField(),
    })
    setUnequipPiece(null)
  }, [unequipPiece, familyId, childId, today])

  // ── Animation complete handler ─────────────────────────────────
  const handleAnimComplete = useCallback(() => {
    if (!attachAnim) return
    const { pieceId, landingCenter } = attachAnim
    setAttachAnim(null)
    setLastAppliedPiece(pieceId)
    setParticles({ x: landingCenter.x, y: landingCenter.y })
    setTimeout(() => {
      setParticles(null)
      setLastAppliedPiece(null)
    }, 600)
  }, [attachAnim])

  // ── Computed values ────────────────────────────────────────────
  const appliedPieces = session?.appliedPieces ?? []
  const earnedPieces = profile ? getEarnedPieces(profile) : []
  const allEarnedApplied = earnedPieces.length > 0 && earnedPieces.every((p) => appliedPieces.includes(p))
  const nextUnlock = profile ? getNextUnlockPiece(profile) : null
  const allSixEarned = earnedPieces.length === ARMOR_PIECES.length

  const xpProgress = nextUnlock && profile
    ? Math.min((profile.totalXp / ARMOR_PIECES.find((p) => p.id === nextUnlock.id)!.xpToUnlockStone) * 100, 100)
    : 100

  if (loading) {
    return (
      <Box sx={{ minHeight: '100dvh', bgcolor: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: accentColor }} />
      </Box>
    )
  }

  if (!profile) return null

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
            {isLincoln ? '⚔️ My Armor' : '✨ My Armor of God'}
          </Typography>
          <Typography
            sx={{
              mt: 0.5,
              fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
              fontSize: isLincoln ? '0.45rem' : '16px',
              color: isLincoln ? '#666' : '#999',
            }}
          >
            {activeChild?.name} — {profile.totalXp} XP • {profile.currentTier.toUpperCase()} tier
          </Typography>
        </Box>

        {/* ── Character Display ──────────────────────────────────── */}
        <Box sx={{ mb: 1.5 }}>
          <CharacterDisplay
            ref={charDisplayRef}
            profile={profile}
            appliedPieces={appliedPieces}
            height="55vw"
            lastAppliedPiece={lastAppliedPiece}
            croppedRegions={croppedImages}
          />
        </Box>

        {/* ── Armor status text ──────────────────────────────────── */}
        {allEarnedApplied ? (
          <Box
            sx={{
              textAlign: 'center',
              py: 1,
              mb: 1,
              animation: !reducedMotion ? 'fullArmorFadeIn 0.5s ease-out' : undefined,
              '@keyframes fullArmorFadeIn': {
                from: { opacity: 0, transform: 'scale(0.9)' },
                to:   { opacity: 1, transform: 'scale(1)' },
              },
            }}
          >
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '0.65rem' : '22px',
                fontWeight: 700,
                color: isLincoln ? '#FFD700' : '#9C27B0',
                ...(allSixEarned && !reducedMotion ? {
                  animation: 'fullArmorPulse 2s ease-in-out infinite',
                  '@keyframes fullArmorPulse': {
                    '0%':   { opacity: 1 },
                    '50%':  { opacity: 0.82 },
                    '100%': { opacity: 1 },
                  },
                } : {}),
              }}
            >
              {allSixEarned
                ? (isLincoln ? '⚔️ Full armor on! Ready for today.' : '✨ Full armor on! You\'re ready!')
                : `${earnedPieces.length} of ${ARMOR_PIECES.length} pieces equipped — keep going!`}
            </Typography>
          </Box>
        ) : (
          /* ── XP Progress ────────────────────────────────────────── */
          <Box sx={{ mb: 2, px: 1 }}>
            {!allSixEarned && nextUnlock ? (
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
                  Next: {ARMOR_PIECES.find((p) => p.id === nextUnlock.id)?.name} — {nextUnlock.xpNeeded} XP away
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
            ) : allSixEarned ? (
              <Typography
                sx={{
                  textAlign: 'center',
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                  fontSize: isLincoln ? '0.4rem' : '0.85rem',
                  color: accentColor,
                  fontWeight: 700,
                }}
              >
                Full set! {profile.currentTier !== 'netherite' && profile.currentTier !== 'champion'
                  ? 'Tier upgrade coming soon ⬆️'
                  : 'Max tier reached! ⚔️'}
              </Typography>
            ) : null}
          </Box>
        )}

        {/* ── Piece Selector Row ─────────────────────────────────── */}
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
          {ARMOR_PIECES.map((pieceDef) => (
            <ArmorPieceButton
              key={pieceDef.id}
              ref={(el) => { if (el) buttonRefsMap.current[pieceDef.id] = el }}
              pieceId={pieceDef.id}
              profile={profile}
              appliedToday={appliedPieces.includes(pieceDef.id)}
              croppedImageUrl={croppedImages[pieceDef.id]}
              onTap={handlePieceTap}
            />
          ))}
        </Box>

        {/* ── Photo Transform — Multi-Step Pipeline ─────────────── */}
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
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '0.42rem' : '0.95rem',
                fontWeight: 600,
                color: accentColor,
              }}
            >
              Transform YOUR Photo
            </Typography>
          </Box>

          {/* Pipeline progress steps */}
          {pipelineStep !== 'idle' && (
            <Box sx={{ mb: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              {['Upload', 'Pixel Character', 'Approve', 'Generate Armor', 'Done'].map((label, i) => {
                const stepMap = ['idle', 'bare', 'approve', 'armor', 'done']
                const currentIdx = stepMap.indexOf(pipelineStep)
                const isActive = i === currentIdx
                const isDone = i < currentIdx
                return (
                  <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        bgcolor: isDone ? accentColor : isActive ? accentColor : (isLincoln ? '#333' : '#ddd'),
                        opacity: isDone ? 0.6 : isActive ? 1 : 0.3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        color: isLincoln ? '#000' : '#fff',
                        fontWeight: 700,
                      }}
                    >
                      {isDone ? '✓' : i + 1}
                    </Box>
                    <Typography sx={{ fontSize: '11px', color: isActive ? accentColor : (isLincoln ? '#666' : '#999') }}>
                      {label}
                    </Typography>
                    {i < 4 && <Typography sx={{ color: isLincoln ? '#333' : '#ccc', mx: 0.5 }}>→</Typography>}
                  </Box>
                )
              })}
            </Box>
          )}

          {/* Step: Idle — upload button */}
          {pipelineStep === 'idle' && !photoPreviewUrl && (
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
              {profile.photoTransformUrl ? 'Change Photo' : 'Upload a Photo'}
            </Button>
          )}

          {/* Step: Photo selected — preview + transform */}
          {pipelineStep === 'idle' && photoPreviewUrl && (
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
                  imageRendering: isLincoln ? 'pixelated' : 'auto',
                }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => void handlePhotoTransform()}
                  disabled={photoTransforming}
                  sx={{
                    bgcolor: accentColor,
                    color: isLincoln ? '#000' : '#fff',
                    borderRadius: isLincoln ? 0 : 2,
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                    fontSize: isLincoln ? '0.35rem' : '0.85rem',
                    '&:hover': { bgcolor: accentColor, opacity: 0.85 },
                  }}
                >
                  Transform!
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => { setPhotoPreviewUrl(null); setPhotoTransformError(null) }}
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

          {/* Step: Generating bare character */}
          {pipelineStep === 'bare' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CircularProgress size={20} sx={{ color: accentColor }} />
              <Typography sx={{ fontSize: '14px', color: isLincoln ? '#aaa' : '#666' }}>
                Creating pixel character from photo... ~20s
              </Typography>
            </Box>
          )}

          {/* Step: Approve bare character */}
          {pipelineStep === 'approve' && bareCharacterUrl && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'center' }}>
              <Typography sx={{ fontSize: '15px', fontWeight: 600, color: accentColor }}>
                Here&apos;s {activeChild?.name} in pixel art!
              </Typography>
              <Box
                component="img"
                src={bareCharacterUrl}
                alt="Bare pixel character"
                sx={{
                  width: 180,
                  height: 180,
                  objectFit: 'cover',
                  borderRadius: isLincoln ? 0 : 2,
                  border: `2px solid ${accentColor}`,
                  imageRendering: isLincoln ? 'pixelated' : 'auto',
                }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => void handleApproveAndGenerateArmor()}
                  disabled={armorRefGenerating}
                  sx={{
                    bgcolor: accentColor,
                    color: isLincoln ? '#000' : '#fff',
                    borderRadius: isLincoln ? 0 : 2,
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                    fontSize: isLincoln ? '0.35rem' : '0.85rem',
                    '&:hover': { bgcolor: accentColor, opacity: 0.85 },
                  }}
                >
                  Looks good — Continue
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => {
                    setPipelineStep('idle')
                    setBareCharacterUrl(null)
                  }}
                  sx={{
                    color: isLincoln ? '#666' : '#aaa',
                    fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                    fontSize: isLincoln ? '0.35rem' : '0.85rem',
                  }}
                >
                  Try Again
                </Button>
              </Box>
            </Box>
          )}

          {/* Step: Generating armor reference */}
          {pipelineStep === 'armor' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CircularProgress size={20} sx={{ color: accentColor }} />
              <Typography sx={{ fontSize: '14px', color: isLincoln ? '#aaa' : '#666' }}>
                Now generating armor... ~20s
              </Typography>
            </Box>
          )}

          {/* Step: Done */}
          {pipelineStep === 'done' && (
            <Typography sx={{ fontSize: '15px', fontWeight: 600, color: accentColor }}>
              Armor pieces ready! Check the cards below.
            </Typography>
          )}

          {photoTransformError && (
            <Alert severity="error" sx={{ mt: 1, fontSize: '0.8rem' }}>
              {photoTransformError}
            </Alert>
          )}

          {profile.photoTransformUrl && pipelineStep === 'idle' && !photoPreviewUrl && (
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 0.5, color: isLincoln ? '#555' : '#aaa', fontSize: '12px' }}
            >
              Photo transform active — armor overlays apply on top
            </Typography>
          )}
        </Box>

        {/* ── Dev overlay: armor reference with crop regions ────── */}
        {typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).get('dev') === 'true' &&
          profile.armorReferenceUrls?.[profile.currentTier] && (
          <Box sx={{ mt: 3, p: 2, border: '2px dashed #f44336', borderRadius: 2 }}>
            <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#f44336', mb: 1 }}>
              DEV: Armor Reference + Crop Regions ({profile.currentTier})
            </Typography>

            {/* Dev action buttons */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                size="small"
                disabled={reCropping}
                onClick={async () => {
                  const armorRefUrl = profile.armorReferenceUrls?.[profile.currentTier]
                  if (!armorRefUrl) return
                  setReCropping(true)
                  try {
                    const results = await cropAllArmorRegions(armorRefUrl)
                    setCroppedImages(results)
                    // Log crop dimensions to console for debugging
                    for (const region of ARMOR_REGIONS) {
                      const srcW = Math.round((region.widthPct / 100) * 1024)
                      const srcH = Math.round((region.heightPct / 100) * 1024)
                      console.log(`[DEV] ${region.pieceId}: ${srcW}×${srcH}px (from 1024×1024)`)
                    }
                  } catch (err) {
                    console.error('Re-crop failed:', err)
                  } finally {
                    setReCropping(false)
                  }
                }}
                sx={{ borderColor: '#f44336', color: '#f44336', fontSize: '11px' }}
              >
                {reCropping ? 'Re-cropping...' : 'Re-crop Armor'}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setShowArmoredRef((v) => !v)}
                sx={{ borderColor: '#f44336', color: '#f44336', fontSize: '11px' }}
              >
                {showArmoredRef ? 'Hide Armored Reference' : 'Show Armored Reference'}
              </Button>
            </Box>

            {/* Side-by-side: base vs armored reference */}
            {showArmoredRef && (
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Box sx={{ flex: '1 1 140px', maxWidth: 200, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '10px', color: '#999', mb: 0.5 }}>Base Character</Typography>
                  {(profile.photoTransformUrl ?? profile.baseCharacterUrl) && (
                    <Box
                      component="img"
                      src={profile.photoTransformUrl ?? profile.baseCharacterUrl}
                      alt="Base (dev)"
                      sx={{ width: '100%', imageRendering: 'pixelated', border: '1px solid #333' }}
                    />
                  )}
                </Box>
                <Box sx={{ flex: '1 1 140px', maxWidth: 200, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '10px', color: '#999', mb: 0.5 }}>Armored Reference</Typography>
                  <Box
                    component="img"
                    src={profile.armorReferenceUrls[profile.currentTier]}
                    alt="Armored ref (dev)"
                    sx={{ width: '100%', imageRendering: 'pixelated', border: '1px solid #333' }}
                  />
                </Box>
              </Box>
            )}

            {/* Armor reference with region overlays */}
            <Box sx={{ position: 'relative', width: '100%', maxWidth: 340, mx: 'auto' }}>
              <Box
                component="img"
                src={profile.armorReferenceUrls[profile.currentTier]}
                alt="Armor reference (dev)"
                sx={{ width: '100%', display: 'block', imageRendering: isLincoln ? 'pixelated' : 'auto' }}
              />
              {ARMOR_REGIONS.map((region) => {
                const colors: Record<string, string> = {
                  helmet_of_salvation: 'rgba(255,0,0,0.3)',
                  breastplate_of_righteousness: 'rgba(0,255,0,0.3)',
                  belt_of_truth: 'rgba(0,0,255,0.3)',
                  shoes_of_peace: 'rgba(255,255,0,0.3)',
                  shield_of_faith: 'rgba(255,0,255,0.3)',
                  sword_of_the_spirit: 'rgba(0,255,255,0.3)',
                }
                return (
                  <Box
                    key={region.pieceId}
                    sx={{
                      position: 'absolute',
                      top: `${region.topPct}%`,
                      left: `${region.leftPct}%`,
                      width: `${region.widthPct}%`,
                      height: `${region.heightPct}%`,
                      bgcolor: colors[region.pieceId] ?? 'rgba(255,255,255,0.3)',
                      border: '1px solid #fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <Typography sx={{ fontSize: '7px', color: '#fff', fontWeight: 700, textShadow: '0 0 3px #000', textAlign: 'center' }}>
                      {region.pieceId.replace(/_/g, ' ')}
                    </Typography>
                  </Box>
                )
              })}
            </Box>
            <Typography sx={{ fontSize: '11px', color: '#999', mt: 1 }}>
              Base: {profile.photoTransformUrl ? 'photo transform' : profile.baseCharacterUrl ? 'generated' : 'none'}
            </Typography>
          </Box>
        )}
      </Page>

      {/* ── Unequip confirmation dialog ────────────────────────── */}
      <Dialog open={!!unequipPiece} onClose={() => setUnequipPiece(null)}>
        <DialogTitle>{ARMOR_PIECES.find((p) => p.id === unequipPiece)?.name} is on</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Take it off for today?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnequipPiece(null)}>Keep it on</Button>
          <Button color="warning" onClick={() => void handleUnequip()}>Take it off</Button>
        </DialogActions>
      </Dialog>

      {/* ── Verse Card modal ──────────────────────────────────── */}
      <VerseCard
        pieceId={selectedPiece}
        profile={profile}
        alreadyApplied={selectedPiece ? appliedPieces.includes(selectedPiece) : false}
        croppedImageUrl={selectedPiece ? croppedImages[selectedPiece] : undefined}
        onApply={handleApplyPiece}
        onClose={() => setSelectedPiece(null)}
      />

      {/* ── Fly animation ──────────────────────────────────────── */}
      {attachAnim && (
        <AttachAnimation
          {...attachAnim}
          onComplete={handleAnimComplete}
        />
      )}

      {/* ── Particle burst (converging inward) ─────────────────── */}
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

      {/* ── Unlock celebration ─────────────────────────────────── */}
      <UnlockCelebration
        newPiece={celebrationPiece}
        profile={profile}
        onDismiss={() => setCelebrationPiece(null)}
      />

      {/* ── Tier upgrade celebration ───────────────────────────── */}
      <TierUpgradeCelebration
        upgrade={tierCelebration}
        profile={profile}
        onDismiss={() => setTierCelebration(null)}
      />
    </Box>
  )
}
