import { useEffect, useState } from 'react'
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { db } from '../../core/firebase/firestore'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { checkAndUnlockArmor } from '../../core/xp/checkAndUnlockArmor'
import { useXpLedger } from '../minecraft/useXpLedger'
import { VOXEL_ARMOR_PIECES, XP_THRESHOLDS } from '../avatar/voxel/buildArmorPiece'
import {
  calculateTier,
  getTierBadgeColor,
  getTierTextColor,
  TIERS,
} from '../avatar/voxel/tierMaterials'

// ── Helpers ──────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(isoString).toLocaleDateString()
}

function getEventLabel(event: XpLedgerEvent): string {
  if (event.meta?.reason) return event.meta.reason
  switch (event.type) {
    case 'MANUAL_AWARD': return 'Parent awarded XP'
    case 'CHECKLIST_DAY_COMPLETE': return 'Completed daily checklist'
    case 'QUEST_DIAMOND': return 'Knowledge Mine diamonds'
    case 'BOOK_READ': return 'Book reading session'
    case 'EVALUATION_COMPLETE': return 'Evaluation completed'
    case 'ARMOR_DAILY_COMPLETE': return 'Daily armor equipped'
    default: return event.type ?? 'XP awarded'
  }
}

interface XpLedgerEvent {
  id: string
  childId: string
  type?: string
  amount?: number
  dedupKey?: string
  meta?: Record<string, string>
  awardedAt?: string
}

// ── XP Overview Card ─────────────────────────────────────────────

function XpOverviewCard({
  totalXp,
  childName,
}: {
  totalXp: number
  childName: string
}) {
  const tier = calculateTier(totalXp)
  const tierDef = TIERS[tier]
  const tierEntries = Object.entries(TIERS)
  const currentIdx = tierEntries.findIndex(([k]) => k === tier)
  const nextTierEntry = currentIdx < tierEntries.length - 1 ? tierEntries[currentIdx + 1] : null

  const unlockedPieces = VOXEL_ARMOR_PIECES.filter((p) => totalXp >= XP_THRESHOLDS[p.id])
  const nextPiece = VOXEL_ARMOR_PIECES.find((p) => totalXp < XP_THRESHOLDS[p.id])

  // Progress within current tier
  const tierMin = tierDef?.minXp ?? 0
  const tierMax = nextTierEntry ? nextTierEntry[1].minXp : tierMin
  const progressInTier = nextTierEntry
    ? Math.min((totalXp - tierMin) / (tierMax - tierMin), 1)
    : 1

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6">{childName}</Typography>
          <Chip
            label={tierDef?.label ?? tier}
            size="small"
            sx={{
              bgcolor: getTierBadgeColor(tier),
              color: getTierTextColor(tier),
              fontWeight: 600,
              fontFamily: 'monospace',
            }}
          />
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {totalXp} XP total
        </Typography>

        {/* Armor pieces progress */}
        <Typography variant="caption" color="text.secondary">
          {unlockedPieces.length} of {VOXEL_ARMOR_PIECES.length} armor pieces unlocked
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, my: 1, flexWrap: 'wrap' }}>
          {VOXEL_ARMOR_PIECES.map((p) => {
            const unlocked = totalXp >= XP_THRESHOLDS[p.id]
            return (
              <Chip
                key={p.id}
                label={p.shortName}
                size="small"
                variant={unlocked ? 'filled' : 'outlined'}
                sx={{
                  opacity: unlocked ? 1 : 0.4,
                  fontSize: '0.7rem',
                }}
              />
            )
          })}
        </Box>

        {/* XP progress bar */}
        <Box sx={{ mb: 1 }}>
          <LinearProgress
            variant="determinate"
            value={progressInTier * 100}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: 'rgba(0,0,0,0.08)',
              '& .MuiLinearProgress-bar': { bgcolor: '#4caf50', borderRadius: 4 },
            }}
          />
        </Box>

        {/* Next unlock */}
        {nextPiece && (
          <Typography variant="caption" color="text.secondary">
            Next piece: {nextPiece.name} — {XP_THRESHOLDS[nextPiece.id] - totalXp} XP away
          </Typography>
        )}

        {/* Next tier */}
        {nextTierEntry && (
          <Typography variant="caption" color="text.secondary" display="block">
            Next tier: {nextTierEntry[1].label} — {nextTierEntry[1].minXp - totalXp} XP away
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

// ── Quick Award XP ───────────────────────────────────────────────

const PRESETS = [
  { amount: 5, label: '+5', description: 'Completed an activity' },
  { amount: 10, label: '+10', description: 'Great effort today' },
  { amount: 25, label: '+25', description: 'Finished a quest' },
  { amount: 50, label: '+50', description: 'Major milestone' },
]

function QuickAwardXP({
  childId,
  childName,
  onAward,
}: {
  childId: string
  childName: string
  onAward: (amount: number, unlocks: string[]) => void
}) {
  const familyId = useFamilyId()
  const [customAmount, setCustomAmount] = useState('')
  const [reason, setReason] = useState('')
  const [awarding, setAwarding] = useState(false)

  async function award(amount: number) {
    if (amount <= 0 || awarding) return
    setAwarding(true)

    try {
      const dedupKey = `manual_${Date.now()}`
      const meta: Record<string, string> = {
        awardedBy: 'parent',
      }
      if (reason) meta.reason = reason

      await addXpEvent(familyId, childId, 'MANUAL_AWARD', amount, dedupKey, meta)

      // Check for new unlocks
      const result = await checkAndUnlockArmor(familyId, childId)
      const unlockNames = result.newlyUnlockedVoxelPieces.map((vId) => {
        const piece = VOXEL_ARMOR_PIECES.find((p) => p.id === vId)
        return piece ? piece.name : vId
      })

      onAward(amount, unlockNames)
      setReason('')
      setCustomAmount('')
    } catch (err) {
      console.error('Failed to award XP:', err)
    } finally {
      setAwarding(false)
    }
  }

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
          Award XP to {childName}
        </Typography>

        {/* Preset buttons */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          {PRESETS.map((p) => (
            <Button
              key={p.amount}
              variant="outlined"
              onClick={() => award(p.amount)}
              disabled={awarding}
              sx={{ flex: 1, fontFamily: 'monospace', minWidth: 0 }}
            >
              {p.label}
            </Button>
          ))}
        </Box>

        {/* Custom amount */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <TextField
            size="small"
            type="number"
            placeholder="Custom XP"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            sx={{ width: '120px' }}
            slotProps={{ htmlInput: { min: 1 } }}
          />
          <Button
            variant="contained"
            onClick={() => award(parseInt(customAmount) || 0)}
            disabled={awarding || !customAmount}
            sx={{ fontFamily: 'monospace', bgcolor: '#4caf50', '&:hover': { bgcolor: '#388e3c' } }}
          >
            Award
          </Button>
        </Box>

        {/* Reason */}
        <TextField
          size="small"
          fullWidth
          placeholder="Reason (optional) — 'Great reading today'"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </CardContent>
    </Card>
  )
}

// ── XP History ───────────────────────────────────────────────────

function XpHistory({ childId }: { childId: string }) {
  const familyId = useFamilyId()
  const [events, setEvents] = useState<XpLedgerEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!familyId || !childId) return

    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const colRef = collection(db, `families/${familyId}/xpLedger`)
        const q = query(
          colRef,
          where('childId', '==', childId),
          where('dedupKey', '!=', null),
          orderBy('awardedAt', 'desc'),
          limit(20),
        )
        const snap = await getDocs(q)
        if (cancelled) return
        setEvents(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<XpLedgerEvent, 'id'>),
          })),
        )
      } catch (err) {
        console.error('Failed to load XP history:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [familyId, childId])

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Recent XP
        </Typography>
        {loading && (
          <Typography variant="caption" color="text.secondary">Loading...</Typography>
        )}
        {!loading && events.length === 0 && (
          <Typography variant="caption" color="text.secondary">No XP events yet</Typography>
        )}
        {events.map((event) => (
          <Box
            key={event.id}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              py: 1,
              borderBottom: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <Box>
              <Typography variant="body2">{getEventLabel(event)}</Typography>
              {event.awardedAt && (
                <Typography variant="caption" color="text.secondary">
                  {formatRelativeTime(event.awardedAt)}
                </Typography>
              )}
            </Box>
            <Typography variant="body2" sx={{ color: '#4caf50', fontWeight: 500, fontFamily: 'monospace' }}>
              +{event.amount ?? 0} XP
            </Typography>
          </Box>
        ))}
      </CardContent>
    </Card>
  )
}

// ── Main ArmorTab ────────────────────────────────────────────────

export default function ArmorTab() {
  const { activeChildId, activeChild, children, setActiveChildId } = useActiveChild()
  const familyId = useFamilyId()
  const xpData = useXpLedger(familyId, activeChildId)
  const [snack, setSnack] = useState<{ message: string; severity: 'success' | 'info' } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const childName = activeChild?.name ?? 'Child'

  function handleAward(amount: number, unlocks: string[]) {
    if (unlocks.length > 0) {
      setSnack({
        message: `${childName} unlocked ${unlocks.join(', ')}!`,
        severity: 'info',
      })
    } else {
      setSnack({
        message: `Awarded ${amount} XP to ${childName}`,
        severity: 'success',
      })
    }
    // Trigger XP history re-fetch
    setRefreshKey((k) => k + 1)
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 600, mx: 'auto' }}>
      {/* Child selector for parents with multiple children */}
      {children.length > 1 && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          {children.map((c) => (
            <Button
              key={c.id}
              variant={c.id === activeChildId ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setActiveChildId(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </Box>
      )}

      {activeChildId && (
        <>
          <XpOverviewCard totalXp={xpData.totalXp} childName={childName} />
          <QuickAwardXP childId={activeChildId} childName={childName} onAward={handleAward} />
          <XpHistory key={`${activeChildId}-${refreshKey}`} childId={activeChildId} />
        </>
      )}

      <Snackbar
        open={snack !== null}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack ? (
          <Alert onClose={() => setSnack(null)} severity={snack.severity} variant="filled">
            {snack.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  )
}
