import { useCallback, useEffect, useState } from 'react'
import { doc, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore'
import { getDocs, limit } from 'firebase/firestore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
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

import { useFamilyId } from '../../core/auth/useAuth'
import { avatarProfilesCollection, xpEventLogCollection } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { ARMOR_PIECES } from '../../core/types/domain'
import type { ArmorPiece, AvatarProfile, XpEventLogEntry } from '../../core/types/domain'

/** Recompute which armor pieces should be unlocked given totalXp. */
function computeEligiblePieces(totalXp: number): ArmorPiece[] {
  return ARMOR_PIECES.filter((p) => totalXp >= p.xpRequired).map((p) => p.id)
}

export default function AvatarAdminTab() {
  const familyId = useFamilyId()
  const { children, activeChildId, setActiveChildId } = useActiveChild()

  const [profile, setProfile] = useState<AvatarProfile | null>(null)
  const [recentEvents, setRecentEvents] = useState<XpEventLogEntry[]>([])
  const [xpAmount, setXpAmount] = useState(10)
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error'; message: string } | null>(null)

  // Confirmation dialogs
  const [deletePiece, setDeletePiece] = useState<ArmorPiece | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  // ── Listen to profile ──────────────────────────────────────────
  useEffect(() => {
    if (!familyId || !activeChildId) return
    const profileRef = doc(avatarProfilesCollection(familyId), activeChildId)
    const unsub = onSnapshot(profileRef, (snap) => {
      setProfile(snap.exists() ? snap.data() : null)
    })
    return unsub
  }, [familyId, activeChildId])

  // ── Listen to recent XP events ─────────────────────────────────
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

  // ── Adjust XP ──────────────────────────────────────────────────
  const handleAdjustXp = useCallback(
    async (delta: number) => {
      if (!profile || !familyId || !activeChildId) return
      const newXp = Math.max(0, profile.totalXp + delta)

      // Recompute unlocked pieces
      const eligible = computeEligiblePieces(newXp)
      const updatedUnlocked = profile.unlockedPieces.filter((p) => eligible.includes(p))
      // Add any newly eligible pieces
      for (const p of eligible) {
        if (!updatedUnlocked.includes(p)) updatedUnlocked.push(p)
      }

      const profileRef = doc(avatarProfilesCollection(familyId), activeChildId)
      try {
        await setDoc(profileRef, {
          ...profile,
          totalXp: newXp,
          unlockedPieces: updatedUnlocked,
          updatedAt: new Date().toISOString(),
        })

        // Log XP event
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

  // ── Delete a piece ─────────────────────────────────────────────
  const handleDeletePiece = useCallback(async () => {
    if (!profile || !familyId || !activeChildId || !deletePiece) return
    const profileRef = doc(avatarProfilesCollection(familyId), activeChildId)

    const updatedUrls = { ...profile.generatedImageUrls }
    delete updatedUrls[deletePiece]

    try {
      await setDoc(profileRef, {
        ...profile,
        unlockedPieces: profile.unlockedPieces.filter((p) => p !== deletePiece),
        generatedImageUrls: updatedUrls,
        updatedAt: new Date().toISOString(),
      })
      setFeedback({ severity: 'success', message: `Removed ${ARMOR_PIECES.find((p) => p.id === deletePiece)?.name ?? deletePiece}` })
    } catch (err) {
      console.error('Delete piece failed:', err)
      setFeedback({ severity: 'error', message: 'Failed to remove piece.' })
    } finally {
      setDeletePiece(null)
    }
  }, [profile, familyId, activeChildId, deletePiece])

  // ── Reset avatar ───────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    if (!profile || !familyId || !activeChildId) return
    const profileRef = doc(avatarProfilesCollection(familyId), activeChildId)

    try {
      // Clear XP event log for this child
      const logSnap = await getDocs(
        query(xpEventLogCollection(familyId), where('childId', '==', activeChildId)),
      )
      for (const d of logSnap.docs) {
        await setDoc(d.ref, { ...d.data(), _deleted: true } as unknown as XpEventLogEntry)
      }

      await setDoc(profileRef, {
        childId: profile.childId,
        themeStyle: profile.themeStyle,
        unlockedPieces: [],
        generatedImageUrls: {},
        customAvatarUrl: undefined,
        photoTransformUrl: undefined,
        starterImageUrl: profile.starterImageUrl, // keep starter
        totalXp: 0,
        updatedAt: new Date().toISOString(),
      } satisfies AvatarProfile)

      setFeedback({ severity: 'success', message: 'Avatar reset. Starter image kept.' })
    } catch (err) {
      console.error('Avatar reset failed:', err)
      setFeedback({ severity: 'error', message: 'Failed to reset avatar.' })
    } finally {
      setResetOpen(false)
    }
  }, [profile, familyId, activeChildId])

  const selectedChild = children.find((c) => c.id === activeChildId)
  const nextPiece = ARMOR_PIECES.find((p) => !(profile?.unlockedPieces ?? []).includes(p.id))
  const xpToNext = nextPiece ? Math.max(nextPiece.xpRequired - (profile?.totalXp ?? 0), 0) : 0

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
          {children.map((c) => (
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
              Pieces unlocked: <strong>{profile.unlockedPieces.length} of {ARMOR_PIECES.length}</strong>
            </Typography>
            {nextPiece && (
              <Typography variant="body2">
                Next unlock: <strong>{nextPiece.name}</strong> ({xpToNext} XP needed)
              </Typography>
            )}
            {!nextPiece && (
              <Typography variant="body2" color="success.main">
                All 6 pieces unlocked!
              </Typography>
            )}
          </Stack>
        </Paper>
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

        {/* Recent XP events */}
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

      {/* ── Unlocked pieces ─────────────────────────────────────── */}
      <Box>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Unlocked Pieces
        </Typography>
        {(profile?.unlockedPieces.length ?? 0) === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No pieces unlocked yet.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {(profile?.unlockedPieces ?? []).map((pieceId) => {
              const piece = ARMOR_PIECES.find((p) => p.id === pieceId)
              const imgUrl = profile?.generatedImageUrls[pieceId]
              return (
                <Stack key={pieceId} direction="row" alignItems="center" spacing={1.5}>
                  {imgUrl ? (
                    <Box
                      component="img"
                      src={imgUrl}
                      alt={piece?.name}
                      sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd' }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 1,
                        border: '1px dashed #ddd',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Typography sx={{ fontSize: '1.2rem' }}>🛡️</Typography>
                    </Box>
                  )}
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {piece?.name ?? pieceId}
                  </Typography>
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    startIcon={<DeleteIcon />}
                    onClick={() => setDeletePiece(pieceId)}
                  >
                    Delete
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
          Clears all XP, unlocked pieces, and custom images. Keeps starter image.
        </Typography>
      </Box>

      {/* ── Feedback ────────────────────────────────────────────── */}
      {feedback && (
        <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      {/* ── Delete piece confirmation ────────────────────────────── */}
      <Dialog open={!!deletePiece} onClose={() => setDeletePiece(null)}>
        <DialogTitle>Remove Armor Piece?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Remove {ARMOR_PIECES.find((p) => p.id === deletePiece)?.name ?? deletePiece} from{' '}
            {selectedChild?.name ?? 'this child'}'s armor? The image is kept in Storage in case they re-unlock it.
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
            This will reset all of {selectedChild?.name ?? 'this child'}'s armor progress — XP, unlocked pieces, and custom images. Are you sure?
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
