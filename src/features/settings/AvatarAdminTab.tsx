import { useCallback, useEffect, useState } from 'react'
import { doc, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore'
import { getDocs, limit } from 'firebase/firestore'
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
import Divider from '@mui/material/Divider'
import InputAdornment from '@mui/material/InputAdornment'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import DeleteIcon from '@mui/icons-material/Delete'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import UpgradeIcon from '@mui/icons-material/Upgrade'

import { app } from '../../core/firebase/firebase'
import { useFamilyId } from '../../core/auth/useAuth'
import {
  avatarProfilesCollection,
  dailyArmorSessionsCollection,
  dailyArmorSessionDocId,
  xpEventLogCollection,
  xpLedgerCollection,
} from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { getTodayDateString } from '../../core/avatar/getDailyArmorSession'
import { ensureNewProfileStructure } from '../../core/xp/checkAndUnlockArmor'
import { ARMOR_PIECES } from '../../core/types/domain'
import type {
  ArmorPiece,
  ArmorPieceProgress,
  ArmorTier,
  AvatarProfile,
  DailyArmorSession,
  PlatformerTier,
  XpEventLogEntry,
} from '../../core/types/domain'

// ── Helpers ──────────────────────────────────────────────────────

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>
}

function isPieceEarned(profile: AvatarProfile, pieceId: ArmorPiece): boolean {
  const entry = profile.pieces.find((p) => p.pieceId === pieceId)
  if (!entry) return false
  if (profile.themeStyle === 'minecraft') return entry.unlockedTiers.length > 0
  return (entry.unlockedTiersPlatformer ?? []).length > 0
}

const NEXT_TIER: Record<string, ArmorTier | PlatformerTier | null> = {
  stone: 'diamond',
  diamond: 'netherite',
  netherite: null,
  basic: 'powerup',
  powerup: 'champion',
  champion: null,
}

export default function AvatarAdminTab() {
  const familyId = useFamilyId()
  const { children, activeChildId, setActiveChildId } = useActiveChild()

  const [profile, setProfile] = useState<AvatarProfile | null>(null)
  const [todaySession, setTodaySession] = useState<DailyArmorSession | null>(null)
  const [recentEvents, setRecentEvents] = useState<XpEventLogEntry[]>([])
  const [xpAmount, setXpAmount] = useState(10)
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error'; message: string } | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [regenBaseChar, setRegenBaseChar] = useState(false)
  const [regenPieces, setRegenPieces] = useState(false)
  const [regenArmorSheet, setRegenArmorSheet] = useState(false)

  // Confirmation dialogs
  const [deletePiece, setDeletePiece] = useState<ArmorPiece | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [regenBaseCharConfirmOpen, setRegenBaseCharConfirmOpen] = useState(false)
  const [recalcXpLoading, setRecalcXpLoading] = useState(false)

  const today = getTodayDateString()

  // ── Listen to profile ──────────────────────────────────────────
  useEffect(() => {
    if (!familyId || !activeChildId) return
    const profileRef = doc(avatarProfilesCollection(familyId), activeChildId)
    const unsub = onSnapshot(profileRef, (snap) => {
      setProfile(snap.exists() ? ensureNewProfileStructure(snap.data() as unknown as Record<string, unknown>) : null)
    })
    return unsub
  }, [familyId, activeChildId])

  // ── Listen to today's session ─────────────────────────────────
  useEffect(() => {
    if (!familyId || !activeChildId) return
    const docId = dailyArmorSessionDocId(activeChildId, today)
    const sessionRef = doc(dailyArmorSessionsCollection(familyId), docId)
    const unsub = onSnapshot(sessionRef, (snap) => {
      setTodaySession(snap.exists() ? snap.data() : null)
    })
    return unsub
  }, [familyId, activeChildId, today])

  // ── Listen to recent XP events ────────────────────────────────
  useEffect(() => {
    if (!familyId || !activeChildId) return
    const q = query(
      xpEventLogCollection(familyId),
      where('childId', '==', activeChildId),
      orderBy('awardedAt', 'desc'),
      limit(10),
    )
    const unsub = onSnapshot(q, (snap) => {
      setRecentEvents(snap.docs.map((d) => d.data()))
    })
    return unsub
  }, [familyId, activeChildId])

  // ── Adjust XP ─────────────────────────────────────────────────
  const handleAdjustXp = useCallback(
    async (delta: number) => {
      if (!profile || !familyId || !activeChildId) return
      const newXp = Math.max(0, profile.totalXp + delta)

      // Recompute unlocked pieces — add newly eligible stone pieces
      const updatedPieces: ArmorPieceProgress[] = [...profile.pieces]
      for (const pieceDef of ARMOR_PIECES) {
        const existing = updatedPieces.find((p) => p.pieceId === pieceDef.id)
        const alreadyEarned = existing && (
          profile.themeStyle === 'minecraft'
            ? existing.unlockedTiers.length > 0
            : (existing.unlockedTiersPlatformer ?? []).length > 0
        )
        if (!alreadyEarned && newXp >= pieceDef.xpToUnlockStone) {
          if (existing) {
            if (profile.themeStyle === 'minecraft') {
              existing.unlockedTiers = [...existing.unlockedTiers, 'stone']
            } else {
              existing.unlockedTiersPlatformer = [...(existing.unlockedTiersPlatformer ?? []), 'basic']
            }
          } else {
            updatedPieces.push({
              pieceId: pieceDef.id,
              unlockedTiers: profile.themeStyle === 'minecraft' ? ['stone'] : [],
              ...(profile.themeStyle === 'platformer' ? { unlockedTiersPlatformer: ['basic'] as PlatformerTier[] } : {}),
              generatedImageUrls: {},
            })
          }
        }
      }

      const profileRef = doc(avatarProfilesCollection(familyId), activeChildId)
      try {
        await setDoc(profileRef, stripUndefined({
          ...profile,
          totalXp: newXp,
          pieces: updatedPieces,
          updatedAt: new Date().toISOString(),
        }))

        const eventRef = doc(xpEventLogCollection(familyId), `${activeChildId}_admin_${Date.now()}`)
        await setDoc(eventRef, {
          childId: activeChildId,
          type: 'parent_adjustment',
          amount: delta,
          dedupKey: `admin_${Date.now()}`,
          meta: { note: delta > 0 ? 'Parent added XP' : 'Parent removed XP' },
          awardedAt: new Date().toISOString(),
        } satisfies XpEventLogEntry)

        setFeedback({ severity: 'success', message: `XP ${delta > 0 ? 'added' : 'removed'}: ${Math.abs(delta)}` })
      } catch (err) {
        console.error('XP adjustment failed:', err)
        setFeedback({ severity: 'error', message: 'Failed to adjust XP.' })
      }
    },
    [profile, familyId, activeChildId],
  )

  // ── Force tier upgrade (testing) ──────────────────────────────
  const handleForceTierUpgrade = useCallback(async () => {
    if (!profile || !familyId || !activeChildId) return
    const nextTier = NEXT_TIER[profile.currentTier]
    if (!nextTier) {
      setFeedback({ severity: 'error', message: 'Already at max tier.' })
      return
    }

    setUpgrading(true)
    try {
      const fns = getFunctions(app)
      const generateArmorPieceFn = httpsCallable<
        { familyId: string; childId: string; pieceId: string; tier: string; themeStyle: string; prompt: string },
        { url: string }
      >(fns, 'generateArmorPiece')

      const profileRef = doc(avatarProfilesCollection(familyId), activeChildId)

      // Make sure all 6 pieces exist with the stone/basic tier
      const updatedPieces = [...profile.pieces]
      const themeStyle = profile.themeStyle
      for (const pieceDef of ARMOR_PIECES) {
        const existing = updatedPieces.find((p) => p.pieceId === pieceDef.id)
        if (!existing) {
          updatedPieces.push({
            pieceId: pieceDef.id,
            unlockedTiers: themeStyle === 'minecraft' ? ['stone'] : [],
            ...(themeStyle === 'platformer' ? { unlockedTiersPlatformer: ['basic' as PlatformerTier] } : {}),
            generatedImageUrls: {},
          })
        } else {
          if (themeStyle === 'minecraft' && !existing.unlockedTiers.includes('stone')) {
            existing.unlockedTiers = [...existing.unlockedTiers, 'stone']
          }
          if (themeStyle === 'platformer' && !(existing.unlockedTiersPlatformer ?? []).includes('basic')) {
            existing.unlockedTiersPlatformer = [...(existing.unlockedTiersPlatformer ?? []), 'basic']
          }
        }
      }

      // Update tier
      await setDoc(profileRef, stripUndefined({
        ...profile,
        pieces: updatedPieces,
        currentTier: nextTier,
        updatedAt: new Date().toISOString(),
      }))

      // Generate images for the new tier in parallel
      const TIER_PROMPTS: Record<string, Record<string, string>> = {
        minecraft: {
          diamond: 'lincolnDiamondPrompt',
          netherite: 'lincolnNetheritePrompt',
        },
        platformer: {
          powerup: 'londonPowerupPrompt',
          champion: 'londonChampionPrompt',
        },
      }

      const promptKey = TIER_PROMPTS[themeStyle]?.[nextTier]
      if (promptKey) {
        await Promise.all(
          ARMOR_PIECES.map(async (pieceDef) => {
            const prompt = (pieceDef as unknown as Record<string, string>)[promptKey] ?? ''
            try {
              const result = await generateArmorPieceFn({
                familyId,
                childId: activeChildId,
                pieceId: pieceDef.id,
                tier: nextTier,
                themeStyle,
                prompt,
              })
              // Write image URL
              const snap = await (await import('firebase/firestore')).getDoc(profileRef)
              const current = snap.exists() ? snap.data() as AvatarProfile : profile
              const newPieces = current.pieces.map((p) =>
                p.pieceId === pieceDef.id
                  ? {
                      ...p,
                      unlockedTiers: themeStyle === 'minecraft'
                        ? [...new Set([...p.unlockedTiers, nextTier as ArmorTier])]
                        : p.unlockedTiers,
                      ...(themeStyle === 'platformer' ? {
                        unlockedTiersPlatformer: [...new Set([...(p.unlockedTiersPlatformer ?? []), nextTier as PlatformerTier])],
                      } : {}),
                      generatedImageUrls: { ...p.generatedImageUrls, [nextTier]: result.data.url },
                    }
                  : p,
              )
              await setDoc(profileRef, stripUndefined({ ...current, pieces: newPieces, updatedAt: new Date().toISOString() }))
            } catch (err) {
              console.warn(`Force upgrade image gen failed for ${pieceDef.id}:`, err)
            }
          })
        )
      }

      setFeedback({ severity: 'success', message: `Tier upgraded to ${nextTier}! Generating images...` })
    } catch (err) {
      console.error('Force tier upgrade failed:', err)
      setFeedback({ severity: 'error', message: 'Force upgrade failed.' })
    } finally {
      setUpgrading(false)
    }
  }, [profile, familyId, activeChildId])

  // ── Delete a piece ────────────────────────────────────────────
  const handleDeletePiece = useCallback(async () => {
    if (!profile || !familyId || !activeChildId || !deletePiece) return
    const profileRef = doc(avatarProfilesCollection(familyId), activeChildId)

    try {
      await setDoc(profileRef, stripUndefined({
        ...profile,
        pieces: profile.pieces.filter((p) => p.pieceId !== deletePiece),
        updatedAt: new Date().toISOString(),
      }))
      setFeedback({ severity: 'success', message: `Removed ${ARMOR_PIECES.find((p) => p.id === deletePiece)?.name ?? deletePiece}` })
    } catch (err) {
      console.error('Delete piece failed:', err)
      setFeedback({ severity: 'error', message: 'Failed to remove piece.' })
    } finally {
      setDeletePiece(null)
    }
  }, [profile, familyId, activeChildId, deletePiece])

  // ── Reset avatar ──────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    if (!profile || !familyId || !activeChildId) return
    const profileRef = doc(avatarProfilesCollection(familyId), activeChildId)

    try {
      const logSnap = await getDocs(
        query(xpEventLogCollection(familyId), where('childId', '==', activeChildId)),
      )
      for (const d of logSnap.docs) {
        await setDoc(d.ref, { ...d.data(), _deleted: true } as unknown as XpEventLogEntry)
      }

      await setDoc(profileRef, {
        childId: profile.childId,
        themeStyle: profile.themeStyle,
        pieces: [],
        currentTier: profile.themeStyle === 'minecraft' ? 'stone' : 'basic',
        ...(profile.baseCharacterUrl ? { baseCharacterUrl: profile.baseCharacterUrl } : {}),
        armorSheetUrls: {},
        totalXp: 0,
        updatedAt: new Date().toISOString(),
      } satisfies AvatarProfile)

      setFeedback({ severity: 'success', message: 'Avatar reset. Base character kept.' })
    } catch (err) {
      console.error('Avatar reset failed:', err)
      setFeedback({ severity: 'error', message: 'Failed to reset avatar.' })
    } finally {
      setResetOpen(false)
    }
  }, [profile, familyId, activeChildId])

  // ── Regenerate base character ─────────────────────────────────
  const handleRegenBaseChar = useCallback(async () => {
    if (!profile || !familyId || !activeChildId) return
    setRegenBaseChar(true)
    setRegenBaseCharConfirmOpen(false)
    try {
      const profileRef = doc(avatarProfilesCollection(familyId), activeChildId)
      // Clear both baseCharacterUrl and photoTransformUrl so a fresh bare character generates
      await setDoc(profileRef, {
        childId: profile.childId,
        themeStyle: profile.themeStyle,
        pieces: profile.pieces,
        currentTier: profile.currentTier,
        totalXp: profile.totalXp,
        updatedAt: new Date().toISOString(),
        // Omitting baseCharacterUrl and photoTransformUrl clears them
      } satisfies AvatarProfile)
      setFeedback({ severity: 'success', message: 'Base character cleared — will regenerate on next visit to My Armor.' })
    } catch (err) {
      console.error('Regen base char failed:', err)
      setFeedback({ severity: 'error', message: 'Failed to clear base character.' })
    } finally {
      setRegenBaseChar(false)
    }
  }, [profile, familyId, activeChildId])

  // ── Recalculate XP from event log ─────────────────────────────
  const handleRecalcXp = useCallback(async () => {
    if (!familyId || !activeChildId) return
    setRecalcXpLoading(true)
    try {
      // Sum all non-deleted XP event log entries for this child
      const logSnap = await getDocs(
        query(xpEventLogCollection(familyId), where('childId', '==', activeChildId)),
      )
      const realTotal = logSnap.docs
        .filter((d) => !(d.data() as unknown as Record<string, unknown>)._deleted)
        .reduce((sum, d) => sum + ((d.data().amount as number) ?? 0), 0)

      // Write real total to xpLedger and avatarProfile
      const ledgerRef = doc(xpLedgerCollection(familyId), activeChildId)
      const ledgerSnap = await (await import('firebase/firestore')).getDoc(ledgerRef)
      const existingSources = ledgerSnap.exists()
        ? ledgerSnap.data().sources
        : { routines: 0, quests: 0, books: 0 }
      await setDoc(ledgerRef, {
        childId: activeChildId,
        totalXp: realTotal,
        sources: existingSources,
        lastUpdatedAt: new Date().toISOString(),
      })

      const profileRef = doc(avatarProfilesCollection(familyId), activeChildId)
      const profileSnap = await (await import('firebase/firestore')).getDoc(profileRef)
      if (profileSnap.exists()) {
        const p = profileSnap.data() as AvatarProfile
        await setDoc(profileRef, stripUndefined({ ...p, totalXp: realTotal, updatedAt: new Date().toISOString() }))
      }

      setFeedback({ severity: 'success', message: `Recalculated: ${realTotal} XP` })
    } catch (err) {
      console.error('Recalc XP failed:', err)
      setFeedback({ severity: 'error', message: 'Failed to recalculate XP.' })
    } finally {
      setRecalcXpLoading(false)
    }
  }, [familyId, activeChildId])

  // ── Regenerate piece images ────────────────────────────────────
  const handleRegenPieceImages = useCallback(async () => {
    if (!profile || !familyId || !activeChildId) return
    setRegenPieces(true)
    try {
      const profileRef = doc(avatarProfilesCollection(familyId), activeChildId)
      const updatedPieces = profile.pieces.map((p) => ({ ...p, generatedImageUrls: {} }))
      await setDoc(profileRef, stripUndefined({
        ...profile,
        pieces: updatedPieces,
        updatedAt: new Date().toISOString(),
      }))
      setFeedback({ severity: 'success', message: 'Piece image URLs cleared — will regenerate next time each piece is viewed.' })
    } catch (err) {
      console.error('Regen piece images failed:', err)
      setFeedback({ severity: 'error', message: 'Failed to clear piece images.' })
    } finally {
      setRegenPieces(false)
    }
  }, [profile, familyId, activeChildId])

  // ── Regenerate armor sheet ─────────────────────────────────────
  const handleRegenArmorSheet = useCallback(async () => {
    if (!profile || !familyId || !activeChildId) return
    setRegenArmorSheet(true)
    try {
      const profileRef = doc(avatarProfilesCollection(familyId), activeChildId)

      // Clear the current tier's sheet URL so the page knows to regenerate
      const updatedSheetUrls = { ...(profile.armorSheetUrls ?? {}) }
      delete updatedSheetUrls[profile.currentTier]
      await setDoc(profileRef, stripUndefined({
        ...profile,
        armorSheetUrls: updatedSheetUrls,
        updatedAt: new Date().toISOString(),
      }))

      // Call the generateArmorSheet cloud function
      const fns = getFunctions(app)
      const generateArmorSheetFn = httpsCallable<
        { familyId: string; childId: string; themeStyle: string; tier: string },
        { url: string; storagePath: string }
      >(fns, 'generateArmorSheet')

      await generateArmorSheetFn({
        familyId,
        childId: activeChildId,
        themeStyle: profile.themeStyle,
        tier: profile.currentTier,
      })

      setFeedback({ severity: 'success', message: `Armor set regenerated for ${profile.currentTier} tier! Navigate to My Armor to see it.` })
    } catch (err) {
      console.error('Regen armor sheet failed:', err)
      setFeedback({ severity: 'error', message: 'Failed to regenerate armor set.' })
    } finally {
      setRegenArmorSheet(false)
    }
  }, [profile, familyId, activeChildId])

  const uniqueChildren = children.filter(
    (child, index, self) => index === self.findIndex((c) => c.id === child.id),
  )
  const selectedChild = uniqueChildren.find((c) => c.id === activeChildId)
  const nextPiece = ARMOR_PIECES.find((p) => !profile || !isPieceEarned(profile, p.id))
  const xpToNext = nextPiece && profile ? Math.max(nextPiece.xpToUnlockStone - profile.totalXp, 0) : 0
  const earnedCount = profile ? profile.pieces.filter((p) =>
    profile.themeStyle === 'minecraft' ? p.unlockedTiers.length > 0 : (p.unlockedTiersPlatformer ?? []).length > 0
  ).length : 0
  const canUpgradeTier = profile && NEXT_TIER[profile.currentTier] !== null

  return (
    <Stack spacing={3}>
      {/* ── Child selector ──────────────────────────────────────── */}
      <Box>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Select Child
        </Typography>
        <ToggleButtonGroup
          value={activeChildId}
          exclusive
          onChange={(_, val) => { if (val) setActiveChildId(val) }}
          size="small"
        >
          {uniqueChildren.map((c) => (
            <ToggleButton key={c.id} value={c.id}>
              {c.name}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* ── Status card ─────────────────────────────────────────── */}
      {profile && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            {selectedChild?.name ?? 'Child'} — Current Status
          </Typography>
          <Stack spacing={0.5}>
            <Typography variant="body2">
              Theme: <strong>{profile.themeStyle}</strong>
            </Typography>
            <Typography variant="body2">
              Total XP: <strong>{profile.totalXp}</strong>
            </Typography>
            <Typography variant="body2">
              Current Tier: <strong style={{ textTransform: 'capitalize' }}>{profile.currentTier}</strong>
            </Typography>
            <Typography variant="body2">
              Pieces earned: <strong>{earnedCount} of {ARMOR_PIECES.length}</strong>
            </Typography>
            {nextPiece && (
              <Typography variant="body2">
                Next unlock: <strong>{nextPiece.name}</strong> ({xpToNext} XP needed)
              </Typography>
            )}
            {earnedCount === ARMOR_PIECES.length && (
              <Typography variant="body2" color="success.main">
                All 6 pieces earned at {profile.currentTier} tier!
              </Typography>
            )}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setRegenBaseCharConfirmOpen(true)}
              disabled={regenBaseChar}
              startIcon={regenBaseChar ? <CircularProgress size={14} /> : undefined}
            >
              Regenerate Base Character
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="primary"
              onClick={() => void handleRegenArmorSheet()}
              disabled={regenArmorSheet}
              startIcon={regenArmorSheet ? <CircularProgress size={14} /> : undefined}
            >
              {regenArmorSheet ? 'Generating armor set… ~20s' : 'Regenerate Armor Set'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => void handleRegenPieceImages()}
              disabled={regenPieces || earnedCount === 0}
              startIcon={regenPieces ? <CircularProgress size={14} /> : undefined}
            >
              Regenerate Piece Images
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="secondary"
              onClick={() => void handleRecalcXp()}
              disabled={recalcXpLoading}
              startIcon={recalcXpLoading ? <CircularProgress size={14} /> : undefined}
            >
              Recalculate XP
            </Button>
          </Stack>
        </Paper>
      )}

      {/* ── Today's Session ─────────────────────────────────────── */}
      {todaySession && (
        <Box>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Today's Session ({today})
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Applied pieces: {todaySession.appliedPieces.length === 0
              ? 'None yet'
              : todaySession.appliedPieces.map((p) =>
                  ARMOR_PIECES.find((ap) => ap.id === p)?.name ?? p
                ).join(', ')
            }
          </Typography>
          {todaySession.completedAt && (
            <Typography variant="body2" color="success.main">
              ✅ Completed at {new Date(todaySession.completedAt).toLocaleTimeString()}
            </Typography>
          )}
        </Box>
      )}

      {/* ── XP Adjustment ───────────────────────────────────────── */}
      <Box>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          XP Adjustment
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <TextField
            type="number"
            size="small"
            value={xpAmount}
            onChange={(e) => setXpAmount(Math.max(1, parseInt(e.target.value) || 1))}
            inputProps={{ min: 1 }}
            sx={{ width: 120 }}
            InputProps={{
              startAdornment: <InputAdornment position="start">XP</InputAdornment>,
            }}
          />
          <Button
            variant="contained"
            color="success"
            onClick={() => void handleAdjustXp(xpAmount)}
          >
            + Add XP
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => void handleAdjustXp(-xpAmount)}
            disabled={!profile || profile.totalXp === 0}
          >
            − Subtract XP
          </Button>
        </Stack>

        {recentEvents.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              Recent XP Events
            </Typography>
            <Stack spacing={0.5}>
              {recentEvents.map((ev, i) => (
                <Stack key={i} direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    {ev.type} — {ev.awardedAt.slice(0, 10)}
                  </Typography>
                  <Typography
                    variant="caption"
                    fontWeight={700}
                    color={ev.amount >= 0 ? 'success.main' : 'error.main'}
                  >
                    {ev.amount >= 0 ? '+' : ''}{ev.amount} XP
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}
      </Box>

      <Divider />

      {/* ── Force Tier Upgrade (testing) ─────────────────────────── */}
      {canUpgradeTier && (
        <Box>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Force Tier Upgrade (Testing)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Upgrades {profile?.currentTier} → {profile ? NEXT_TIER[profile.currentTier] : '?'} regardless of XP.
            Generates all 6 new-tier images via AI.
          </Typography>
          <Button
            variant="outlined"
            color="primary"
            startIcon={upgrading ? <CircularProgress size={16} /> : <UpgradeIcon />}
            onClick={() => void handleForceTierUpgrade()}
            disabled={upgrading}
          >
            {upgrading ? 'Generating images...' : `Force upgrade to ${profile ? NEXT_TIER[profile.currentTier] : '?'}`}
          </Button>
        </Box>
      )}

      <Divider />

      {/* ── Unlocked pieces ─────────────────────────────────────── */}
      <Box>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Earned Pieces
        </Typography>
        {earnedCount === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No pieces earned yet.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {(profile?.pieces ?? [])
              .filter((entry) =>
                profile!.themeStyle === 'minecraft'
                  ? entry.unlockedTiers.length > 0
                  : (entry.unlockedTiersPlatformer ?? []).length > 0,
              )
              .map((entry) => {
                const piece = ARMOR_PIECES.find((p) => p.id === entry.pieceId)
                const currentTierImg = profile
                  ? (entry.generatedImageUrls as Record<string, string | undefined>)[profile.currentTier]
                  : undefined
                return (
                  <Stack key={entry.pieceId} direction="row" alignItems="center" spacing={1.5}>
                    {currentTierImg ? (
                      <Box
                        component="img"
                        src={currentTierImg}
                        alt={piece?.name}
                        sx={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 1, border: '1px solid #ddd' }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 48, height: 48, borderRadius: 1,
                          border: '1px dashed #ddd',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Typography sx={{ fontSize: '1.2rem' }}>🛡️</Typography>
                      </Box>
                    )}
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {piece?.name ?? entry.pieceId}
                    </Typography>
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      startIcon={<DeleteIcon />}
                      onClick={() => setDeletePiece(entry.pieceId)}
                    >
                      Remove
                    </Button>
                  </Stack>
                )
              })}
          </Stack>
        )}
      </Box>

      <Divider />

      {/* ── Danger zone ─────────────────────────────────────────── */}
      <Box>
        <Typography variant="subtitle1" fontWeight={700} color="error" gutterBottom>
          Danger Zone
        </Typography>
        <Button
          variant="outlined"
          color="error"
          startIcon={<RestartAltIcon />}
          onClick={() => setResetOpen(true)}
        >
          Reset Avatar
        </Button>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
          Clears all XP, pieces, and tier. Keeps base character image.
        </Typography>
      </Box>

      {/* ── Feedback ────────────────────────────────────────────── */}
      {feedback && (
        <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      {/* ── Regen base character confirmation ───────────────────── */}
      <Dialog open={regenBaseCharConfirmOpen} onClose={() => setRegenBaseCharConfirmOpen(false)}>
        <DialogTitle>Regenerate Base Character?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will generate a new base character. The old one will be replaced, and any photo transform will also be cleared.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegenBaseCharConfirmOpen(false)}>Cancel</Button>
          <Button color="primary" onClick={() => void handleRegenBaseChar()}>Regenerate</Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete piece confirmation ────────────────────────────── */}
      <Dialog open={!!deletePiece} onClose={() => setDeletePiece(null)}>
        <DialogTitle>Remove Armor Piece?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Remove {ARMOR_PIECES.find((p) => p.id === deletePiece)?.name ?? deletePiece} from{' '}
            {selectedChild?.name ?? 'this child'}'s armor? Images are kept in Storage.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletePiece(null)}>Cancel</Button>
          <Button color="error" onClick={() => void handleDeletePiece()}>Remove</Button>
        </DialogActions>
      </Dialog>

      {/* ── Reset confirmation ──────────────────────────────────── */}
      <Dialog open={resetOpen} onClose={() => setResetOpen(false)}>
        <DialogTitle>Reset Avatar?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will reset all of {selectedChild?.name ?? 'this child'}'s armor progress — XP, earned pieces, and tier. Are you sure?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetOpen(false)}>Cancel</Button>
          <Button color="error" onClick={() => void handleReset()}>Reset</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
