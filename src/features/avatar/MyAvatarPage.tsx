import { useCallback, useEffect, useRef, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'

import Page from '../../components/Page'
import { app } from '../../core/firebase/firebase'
import { avatarProfilesCollection, dailyArmorSessionsCollection, dailyArmorSessionDocId } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useFamilyId } from '../../core/auth/useAuth'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { getTodayDateString } from '../../core/avatar/getDailyArmorSession'
import { ARMOR_PIECES } from '../../core/types/domain'
import type { ArmorPiece, AvatarProfile, DailyArmorSession } from '../../core/types/domain'

import ArmorPieceButton from './ArmorPieceButton'
import CharacterDisplay from './CharacterDisplay'
import { isPieceEarned } from './armorUtils'
import TierUpgradeCelebration from './TierUpgradeCelebration'
import UnlockCelebration from './UnlockCelebration'
import VerseCard from './VerseCard'

// ── Helpers ───────────────────────────────────────────────────────

function getEarnedPieces(profile: AvatarProfile): ArmorPiece[] {
  return ARMOR_PIECES.filter((p) => isPieceEarned(profile, p.id)).map((p) => p.id)
}

function getNextUnlockPiece(profile: AvatarProfile): { id: ArmorPiece; xpNeeded: number } | null {
  const allEarned = new Set(getEarnedPieces(profile))
  const next = ARMOR_PIECES.find((p) => !allEarned.has(p.id))
  if (!next) return null
  return { id: next.id, xpNeeded: Math.max(next.xpToUnlockStone - profile.totalXp, 0) }
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
  const [celebrationPiece, setCelebrationPiece] = useState<ArmorPiece | null>(null)
  const [tierCelebration, setTierCelebration] = useState<{ from: string; to: string } | null>(null)
  const [baseCharGenerating, setBaseCharGenerating] = useState(false)

  // Track previous state to detect changes
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
          const data = snap.data() as AvatarProfile
          setProfile(data)

          // Detect new stone unlock
          const earnedCount = getEarnedPieces(data).length
          if (earnedCount > prevPiecesCountRef.current && prevPiecesCountRef.current > 0) {
            const earned = getEarnedPieces(data)
            const newPiece = earned[earned.length - 1]
            setCelebrationPiece(newPiece)
          }
          prevPiecesCountRef.current = earnedCount

          // Detect tier upgrade
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
        // Create fresh session for today
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

  // ── Generate base character on first visit ─────────────────────
  useEffect(() => {
    if (!profile || !familyId || !childId) return
    if (profile.baseCharacterUrl) return   // already generated
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
      .catch((err) => {
        console.error('Base character generation failed:', err)
      })
      .finally(() => {
        setBaseCharGenerating(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.childId, profile?.baseCharacterUrl])

  // ── Apply a piece ──────────────────────────────────────────────
  const handleApplyPiece = useCallback(
    async (pieceId: ArmorPiece) => {
      if (!profile || !familyId || !childId || !session) return
      if (session.appliedPieces.includes(pieceId)) return

      setSelectedPiece(null)

      const updatedApplied = [...session.appliedPieces, pieceId]
      const docId = dailyArmorSessionDocId(childId, today)
      const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)

      const earnedPieces = getEarnedPieces(profile)
      const allApplied = earnedPieces.every((p) => updatedApplied.includes(p))

      await setDoc(sessionRef, {
        ...session,
        appliedPieces: updatedApplied,
        ...(allApplied ? { completedAt: new Date().toISOString() } : {}),
      })

      // Award ARMOR_DAILY_COMPLETE XP once per day when all earned pieces applied
      if (allApplied && familyId && childId) {
        void addXpEvent(
          familyId,
          childId,
          'ARMOR_DAILY_COMPLETE',
          5,
          `armor_daily_${today}`,
        )
      }
    },
    [profile, familyId, childId, session, today],
  )

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
              fontSize: isLincoln ? '0.4rem' : '0.85rem',
              color: isLincoln ? '#666' : '#999',
            }}
          >
            {activeChild?.name} — {profile.totalXp} XP • {profile.currentTier.toUpperCase()} tier
          </Typography>
        </Box>

        {/* ── Character Display (60% of screen) ─────────────────── */}
        <Box sx={{ mb: 1.5 }}>
          <CharacterDisplay
            profile={profile}
            appliedPieces={appliedPieces}
            height="55vw"
          />
        </Box>

        {/* All applied celebration */}
        {allEarnedApplied && (
          <Box
            sx={{
              textAlign: 'center',
              py: 1,
              mb: 1,
              animation: 'fullArmorPop 0.4s ease-out',
              '@keyframes fullArmorPop': {
                from: { transform: 'scale(0.9)', opacity: 0 },
                to: { transform: 'scale(1)', opacity: 1 },
              },
            }}
          >
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '0.55rem' : '1rem',
                fontWeight: 700,
                color: accentColor,
              }}
            >
              {isLincoln ? '⚔️ Full armor on! Ready for today!' : '✨ Full armor on! You\'re ready!'}
            </Typography>
          </Box>
        )}

        {/* ── XP Progress (compact) ──────────────────────────────── */}
        <Box sx={{ mb: 2, px: 1 }}>
          {!allSixEarned && nextUnlock ? (
            <>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mb: 0.5,
                  color: isLincoln ? '#888' : 'text.secondary',
                  fontFamily: isLincoln ? '"Press Start 2P", monospace' : undefined,
                  fontSize: isLincoln ? '0.32rem' : '0.72rem',
                }}
              >
                Next: {ARMOR_PIECES.find((p) => p.id === nextUnlock.id)?.name} — {nextUnlock.xpNeeded} XP away
              </Typography>
              <LinearProgress
                variant="determinate"
                value={xpProgress}
                sx={{
                  height: 8,
                  borderRadius: isLincoln ? 0 : 4,
                  bgcolor: isLincoln ? '#222' : '#eee',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: accentColor,
                    borderRadius: isLincoln ? 0 : 4,
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

        {/* ── Piece Selector Row ─────────────────────────────────── */}
        <Box
          sx={{
            overflowX: 'auto',
            display: 'flex',
            gap: 1,
            pb: 1,
            px: 0.5,
            // Hide scrollbar visually but keep functional
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': { height: 4 },
            '&::-webkit-scrollbar-thumb': { bgcolor: isLincoln ? '#333' : '#ddd', borderRadius: 2 },
          }}
        >
          {ARMOR_PIECES.map((pieceDef) => (
            <ArmorPieceButton
              key={pieceDef.id}
              pieceId={pieceDef.id}
              profile={profile}
              appliedToday={appliedPieces.includes(pieceDef.id)}
              onTap={setSelectedPiece}
            />
          ))}
        </Box>

        {/* ── Phase 2 Photo Transform Scaffold ──────────────────── */}
        <Box
          sx={{
            mt: 3,
            p: 2,
            borderRadius: isLincoln ? 0 : 3,
            border: `2px dashed ${isLincoln ? '#333' : '#ddd'}`,
            bgcolor: isLincoln ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
            opacity: 0.6,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CameraAltIcon sx={{ color: isLincoln ? '#555' : '#bbb', fontSize: 20 }} />
            <Typography
              sx={{
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '0.4rem' : '0.85rem',
                color: isLincoln ? '#555' : '#bbb',
              }}
            >
              Transform YOUR Photo — Coming Soon
            </Typography>
          </Box>
          {/* Phase 2: Upload photo → gpt-image-1 image-to-image
            * Transform into themeStyle character (pixel art blocky or platformer cute)
            * Save to avatarProfile.photoTransformUrl
            * Display as base character layer instead of generated baseCharacterUrl */}
        </Box>
      </Page>

      {/* ── Verse Card modal ──────────────────────────────────── */}
      <VerseCard
        pieceId={selectedPiece}
        profile={profile}
        alreadyApplied={selectedPiece ? appliedPieces.includes(selectedPiece) : false}
        onApply={handleApplyPiece}
        onClose={() => setSelectedPiece(null)}
      />

      {/* ── Single piece unlock celebration ──────────────────── */}
      <UnlockCelebration
        newPiece={celebrationPiece}
        profile={profile}
        onDismiss={() => setCelebrationPiece(null)}
      />

      {/* ── Full set tier upgrade celebration ────────────────── */}
      <TierUpgradeCelebration
        upgrade={tierCelebration}
        profile={profile}
        onDismiss={() => setTierCelebration(null)}
      />
    </Box>
  )
}
