import { useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useChildren } from '../../core/hooks/useChildren'
import type { KitRoster } from '../../core/types/business'
import { KitRosterStatus } from '../../core/types/business'
import KitBuilderForm from './KitBuilderForm'
import type { NewKitRoster } from './useKitRosters'
import { useKitRosters } from './useKitRosters'

/** Distinct view of a `KitRoster`: showing the list, or the form (new/edit). */
type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; roster: KitRoster }

interface KitBuilderSectionProps {
  /** Operator a new roster is authored under (the active child). */
  activeChildId: string
}

/**
 * Kit Builder entry point on the Barnes Bros business tab (FEAT-80 slice 1).
 * Lists saved + in-progress rosters and opens the plain parent-entry form
 * (`KitBuilderForm`) to create or edit one. The voice-capture flow is slice 2.
 */
export default function KitBuilderSection({ activeChildId }: KitBuilderSectionProps) {
  const { rosters, loading, createRoster, updateRoster } = useKitRosters(activeChildId)
  const { children } = useChildren()
  const [mode, setMode] = useState<Mode>({ kind: 'list' })

  const nameById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of children) m[c.id] = c.name
    return m
  }, [children])

  const handleSave = async (body: NewKitRoster, id?: string) => {
    if (id) {
      await updateRoster(id, body)
    } else {
      await createRoster(body)
    }
    setMode({ kind: 'list' })
  }

  if (mode.kind === 'new' || mode.kind === 'edit') {
    return (
      <KitBuilderForm
        childId={mode.kind === 'edit' ? mode.roster.childId : activeChildId}
        roster={mode.kind === 'edit' ? mode.roster : undefined}
        onSave={handleSave}
        onCancel={() => setMode({ kind: 'list' })}
      />
    )
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        A kit is a reusable roster — a hero, defenders, invaders, and how you win — that a different
        family plays. Build one here, then it becomes stickers, a booklet, and more.
      </Typography>

      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      ) : rosters.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No kits yet — make your first one.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {rosters.map((r) => {
            const ready = r.status === KitRosterStatus.Complete
            const madeBy = nameById[r.childId]
            return (
              <Box
                key={r.id}
                onClick={() => setMode({ kind: 'edit', roster: r })}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 1.5,
                  cursor: 'pointer',
                  '&:hover': { borderColor: 'primary.main' },
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" noWrap>
                      {r.vaultName.trim() || 'Untitled kit'}
                    </Typography>
                    {madeBy && (
                      <Typography variant="caption" color="text.secondary">
                        Made by {madeBy}
                      </Typography>
                    )}
                  </Box>
                  <Chip
                    size="small"
                    label={ready ? 'Ready' : 'In progress'}
                    color={ready ? 'success' : 'default'}
                    variant={ready ? 'filled' : 'outlined'}
                  />
                </Stack>
              </Box>
            )
          })}
        </Stack>
      )}

      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={() => setMode({ kind: 'new' })}
        sx={{ alignSelf: 'flex-start' }}
      >
        New kit
      </Button>
    </Stack>
  )
}
