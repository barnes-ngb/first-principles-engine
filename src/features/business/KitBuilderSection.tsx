import { useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useChildren } from '../../core/hooks/useChildren'
import type { KitRoster } from '../../core/types/business'
import { BusinessItemType, KitRosterStatus } from '../../core/types/business'
import CatalogProductForm from './CatalogProductForm'
import KitBuilderForm from './KitBuilderForm'
import type { NewCatalogProduct } from './useCatalogProducts'
import { useCatalogProducts } from './useCatalogProducts'
import type { NewKitRoster } from './useKitRosters'
import { useKitRosters } from './useKitRosters'

/**
 * Distinct view of a `KitRoster`: the list, the roster form (new/edit), or the
 * catalog product form pre-filled from a roster being promoted.
 */
type Mode =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'edit'; roster: KitRoster }
  | { kind: 'promote'; roster: KitRoster }

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
  const { createProduct } = useCatalogProducts()
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

  /**
   * Pre-fill a catalog product from a roster (design §2/§5). Read-only of the
   * roster — nothing here mutates it. Title from `vaultName`, type StarterKit
   * default, `madeBy` from the author's name, `sourceRef` links the roster, and
   * `images` stays empty (the roster has no art yet → placeholder card). The
   * parent sets price + status before saving (§6: no kid self-pricing).
   */
  const promoteInitial = (r: KitRoster): Partial<NewCatalogProduct> => {
    const maker = nameById[r.childId]
    return {
      title: r.vaultName.trim() || 'Untitled kit',
      type: BusinessItemType.StarterKit,
      madeBy: maker ? [maker] : [],
      images: [],
      sourceRef: { kind: 'kitRoster', id: r.id },
    }
  }

  const handlePromoteSave = async (body: NewCatalogProduct) => {
    await createProduct(body)
    setMode({ kind: 'list' })
  }

  if (mode.kind === 'promote') {
    return (
      <CatalogProductForm
        initial={promoteInitial(mode.roster)}
        onSave={handlePromoteSave}
        onCancel={() => setMode({ kind: 'list' })}
      />
    )
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
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={(e) => {
                        // Don't trigger the row's edit tap.
                        e.stopPropagation()
                        setMode({ kind: 'promote', roster: r })
                      }}
                    >
                      Add to catalog
                    </Button>
                    <Chip
                      size="small"
                      label={ready ? 'Ready' : 'In progress'}
                      color={ready ? 'success' : 'default'}
                      variant={ready ? 'filled' : 'outlined'}
                    />
                  </Stack>
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
