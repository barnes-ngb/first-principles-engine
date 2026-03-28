import { useEffect, useState } from 'react'
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
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
import { avatarProfilesCollection, db } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { checkAndUnlockArmor } from '../../core/xp/checkAndUnlockArmor'
import { useXpLedger } from '../../core/xp/useXpLedger'
import { VOXEL_ARMOR_PIECES, XP_THRESHOLDS } from '../avatar/voxel/buildArmorPiece'
import {
  calculateTier,
  getTierBadgeColor,
  getTierTextColor,
  TIERS,
} from '../avatar/voxel/tierMaterials'

// ── Helpers ──────────────────────────────────────────────────────

function formatTime(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function getDayLabel(isoString: string): string {
  const d = new Date(isoString)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((today.getTime() - eventDay.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return eventDay.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function getEventIcon(type?: string): string {
  switch (type) {
    case 'CHECKLIST_ITEM':
    case 'CHECKLIST_DAY_COMPLETE':
    case 'DAILY_ALL_COMPLETE':
    case 'WEEKLY_ALL_COMPLETE':
      return '⛏️'
    case 'QUEST_DIAMOND':
    case 'QUEST_COMPLETE':
      return '💎'
    case 'CHECKLIST_PRAYER':
      return '🙏'
    case 'DAD_LAB_COMPLETE':
      return '🔬'
    case 'BOOK_READ':
    case 'BOOK_PAGE_READ':
      return '📚'
    case 'EVALUATION_COMPLETE':
      return '📝'
    case 'ARMOR_DAILY_COMPLETE':
      return '🛡️'
    case 'MANUAL_AWARD':
      return '⭐'
    default:
      return '⭐'
  }
}

function getEventLabel(event: XpLedgerEvent): string {
  if (event.meta?.reason) return event.meta.reason
  switch (event.type) {
    case 'MANUAL_AWARD': return 'Parent awarded XP'
    case 'CHECKLIST_ITEM': return 'Checklist item completed'
    case 'CHECKLIST_DAY_COMPLETE': return 'Completed daily checklist'
    case 'CHECKLIST_PRAYER': return 'Morning prayer'
    case 'DAILY_ALL_COMPLETE': return 'Daily bonus — all items done'
    case 'WEEKLY_ALL_COMPLETE': return 'Weekly bonus — all 5 days!'
    case 'QUEST_DIAMOND': return 'Knowledge Mine diamonds'
    case 'QUEST_COMPLETE': return 'Quest completed'
    case 'BOOK_READ': return 'Book reading session'
    case 'BOOK_PAGE_READ': return 'Read a page'
    case 'EVALUATION_COMPLETE': return 'Evaluation completed'
    case 'DAD_LAB_COMPLETE': return 'Dad Lab completed'
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
  currentXp,
  onAward,
}: {
  childId: string
  childName: string
  currentXp: number
  onAward: (amount: number, unlocks: string[], tierUp?: { from: string; to: string }) => void
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

      // Detect tier change
      const oldTier = calculateTier(currentXp)

      await addXpEvent(familyId, childId, 'MANUAL_AWARD', amount, dedupKey, meta)

      // Check for new unlocks
      const result = await checkAndUnlockArmor(familyId, childId)
      const unlockNames = result.newlyUnlockedVoxelPieces.map((vId) => {
        const piece = VOXEL_ARMOR_PIECES.find((p) => p.id === vId)
        return piece ? piece.name : vId
      })

      // Check for tier-up
      const newTier = calculateTier(currentXp + amount)
      const tierUp = newTier !== oldTier ? { from: oldTier, to: newTier } : undefined

      onAward(amount, unlockNames, tierUp)
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

// ── XP Summary Stats ────────────────────────────────────────────

function XpSummaryStats({
  totalXp,
  events,
  armorStreak,
  tierLabel,
  xpToNext,
}: {
  totalXp: number
  events: XpLedgerEvent[]
  armorStreak: number
  tierLabel: string
  xpToNext: number
}) {
  // Compute XP earned this week (Mon–Sun)
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)
  const xpThisWeek = events.reduce((sum, e) => {
    if (!e.awardedAt) return sum
    return new Date(e.awardedAt) >= weekStart ? sum + (e.amount ?? 0) : sum
  }, 0)

  const stats = [
    { label: 'Total XP', value: `${totalXp}` },
    { label: 'This week', value: `+${xpThisWeek}` },
    { label: 'Tier', value: tierLabel },
    ...(xpToNext > 0 ? [{ label: 'Next tier', value: `${xpToNext} XP` }] : []),
    ...(armorStreak > 0 ? [{ label: 'Streak', value: `${armorStreak}d 🔥` }] : []),
  ]

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-around' }}>
          {stats.map((s) => (
            <Box key={s.label} sx={{ textAlign: 'center', minWidth: 60 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                {s.value}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {s.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  )
}

// ── XP History ───────────────────────────────────────────────────

const PAGE_SIZE = 50

function XpHistory({
  childId,
  totalXp,
  tierLabel,
  xpToNext,
  armorStreak,
}: {
  childId: string
  totalXp: number
  tierLabel: string
  xpToNext: number
  armorStreak: number
}) {
  const familyId = useFamilyId()
  const [events, setEvents] = useState<XpLedgerEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [visibleDays, setVisibleDays] = useState(7)

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
          limit(PAGE_SIZE),
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

  // Reset visible days when child changes
  useEffect(() => { setVisibleDays(7) }, [childId])

  // Group events by day
  const groupedByDay: { label: string; events: XpLedgerEvent[] }[] = []
  const dayMap = new Map<string, XpLedgerEvent[]>()
  for (const event of events) {
    const label = event.awardedAt ? getDayLabel(event.awardedAt) : 'Unknown'
    if (!dayMap.has(label)) {
      dayMap.set(label, [])
      groupedByDay.push({ label, events: dayMap.get(label)! })
    }
    dayMap.get(label)!.push(event)
  }

  const visibleGroups = groupedByDay.slice(0, visibleDays)
  const hasMore = groupedByDay.length > visibleDays

  return (
    <>
      <XpSummaryStats
        totalXp={totalXp}
        events={events}
        armorStreak={armorStreak}
        tierLabel={tierLabel}
        xpToNext={xpToNext}
      />
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            XP History
          </Typography>
          {loading && (
            <Typography variant="caption" color="text.secondary">Loading...</Typography>
          )}
          {!loading && events.length === 0 && (
            <Typography variant="caption" color="text.secondary">No XP events yet</Typography>
          )}
          {visibleGroups.map((group) => (
            <Box key={group.label} sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {group.label}
              </Typography>
              {group.events.map((event) => (
                <Box
                  key={event.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    py: 0.75,
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                    gap: 1.5,
                  }}
                >
                  <Typography
                    sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#4caf50', minWidth: 64, fontSize: '0.85rem' }}
                  >
                    +{event.amount ?? 0} XP
                  </Typography>
                  <Typography sx={{ fontSize: '1rem', lineHeight: 1 }}>
                    {getEventIcon(event.type)}
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {getEventLabel(event)}
                    </Typography>
                  </Box>
                  {event.awardedAt && (
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {formatTime(event.awardedAt)}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          ))}
          {hasMore && (
            <Button
              size="small"
              onClick={() => setVisibleDays((d) => d + 7)}
              sx={{ mt: 1 }}
            >
              Show more
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// ── Main ArmorTab ────────────────────────────────────────────────

function useArmorStreak(familyId: string, childId: string): number {
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    if (!familyId || !childId) return
    const ref = doc(avatarProfilesCollection(familyId), childId)
    return onSnapshot(ref, (snap) => {
      setStreak(snap.exists() ? (snap.data()?.armorStreak ?? 0) : 0)
    })
  }, [familyId, childId])

  return streak
}

export default function ArmorTab() {
  const { activeChildId, activeChild, children, setActiveChildId } = useActiveChild()
  const familyId = useFamilyId()
  const xpData = useXpLedger(familyId, activeChildId)
  const armorStreak = useArmorStreak(familyId, activeChildId)
  const [snack, setSnack] = useState<{ message: string; severity: 'success' | 'info' } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const childName = activeChild?.name ?? 'Child'
  const tierKey = calculateTier(xpData.totalXp)
  const tierLabel = TIERS[tierKey]?.label ?? tierKey
  const xpToNext = xpData.nextTierProgress.xpToNext

  function handleAward(amount: number, unlocks: string[], tierUp?: { from: string; to: string }) {
    if (tierUp) {
      const label = TIERS[tierUp.to]?.label ?? tierUp.to
      setSnack({
        message: `${childName} reached ${label} tier!`,
        severity: 'info',
      })
    } else if (unlocks.length > 0) {
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
          <QuickAwardXP childId={activeChildId} childName={childName} currentXp={xpData.totalXp} onAward={handleAward} />
          <XpHistory
            key={`${activeChildId}-${refreshKey}`}
            childId={activeChildId}
            totalXp={xpData.totalXp}
            tierLabel={tierLabel}
            xpToNext={xpToNext}
            armorStreak={armorStreak}
          />
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
