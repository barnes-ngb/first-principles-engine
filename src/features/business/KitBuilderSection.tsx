import { useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useAI } from '../../core/ai/useAI'
import { useFamilyId } from '../../core/auth/useAuth'
import { useChildren } from '../../core/hooks/useChildren'
import type { CatalogProduct, KitArtRef, KitRoster } from '../../core/types/business'
import { BusinessItemType, KitRosterStatus } from '../../core/types/business'
import CatalogProductForm from './CatalogProductForm'
import { artToProductImages, buildKitCharacterPrompt, hasAnyArt } from './kitArt'
import type { KitArtCharacter } from './KitBuilderForm'
import KitBuilderForm from './KitBuilderForm'
import { buildPrintableKitHtml } from './printableKit'
import { buildKitArtDownloads, downloadArtFiles, kitArtZipName } from './stickerArtExport'
import { useArtQuota } from './useArtQuota'
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
  /**
   * Parent gate (FEAT-94). This business is the kids' — gates here protect
   * **money and public exposure, not kid effort**. So `canEdit` now gates ONLY
   * the two affordances that write to the parent-curated catalog storefront:
   * "Add to catalog" (promote → sets price/status) and "Use as product image"
   * (mutates a catalog product). Everything the kid does with their OWN kit —
   * build/edit the roster, generate/regenerate character art (the owner's
   * explicit ask), view art full-size, download art, print the kit — is open to
   * kids regardless of `canEdit`. Kid generation is metered by a light daily
   * quota (see `useArtQuota`), never blocked outright.
   */
  canEdit: boolean
}

/**
 * Kit Builder entry point on the Barnes Bros business tab (FEAT-80 slice 1).
 * Lists saved + in-progress rosters and opens the plain parent-entry form
 * (`KitBuilderForm`) to create or edit one. The voice-capture flow is slice 2.
 */
export default function KitBuilderSection({ activeChildId, canEdit }: KitBuilderSectionProps) {
  const { rosters, loading, createRoster, updateRoster, setRosterArt } = useKitRosters(activeChildId)
  const { products, createProduct, updateProduct } = useCatalogProducts()
  const { children } = useChildren()
  const { generateImage } = useAI()
  const familyId = useFamilyId()
  const [mode, setMode] = useState<Mode>({ kind: 'list' })

  // Cost guard (FEAT-94): image generation is a paid call, so a KID profile
  // (`!canEdit`) gets a light, non-shaming daily cap. A parent (`canEdit`) is
  // uncapped and never touches the counter. `capped === !canEdit` because the
  // only non-parent profiles are the kids.
  const capped = !canEdit
  const { atLimit, recordGeneration } = useArtQuota(activeChildId, { capped })

  const nameById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of children) m[c.id] = c.name
    return m
  }, [children])

  /** The catalog product promoted from this roster, if one exists (FEAT-88). */
  const productForRoster = (r: KitRoster): CatalogProduct | undefined =>
    products.find((p) => p.sourceRef?.kind === 'kitRoster' && p.sourceRef.id === r.id)

  const handleSave = async (body: NewKitRoster, id?: string) => {
    if (id) {
      await updateRoster(id, body)
    } else {
      await createRoster(body)
    }
    setMode({ kind: 'list' })
  }

  /**
   * Generate + persist one character's sticker (FEAT-88). Reuses the existing
   * `generateImage` path (`book-sticker` ⇒ text-only prompt → transparent PNG →
   * Storage URL — no backend change). The write is additive AND atomic:
   * `setRosterArt` sets only `art.<key>` via a nested field path, so two
   * overlapping generations never clobber each other. Returns the new ref, or
   * `null` on failure (the form keeps prior art).
   */
  const makeGenerateArt =
    (rosterId: string) =>
    async (characterKey: string, character: KitArtCharacter): Promise<KitArtRef | null> => {
      if (!familyId) return null
      const prompt = buildKitCharacterPrompt(character)
      const result = await generateImage({
        familyId,
        prompt,
        style: 'book-sticker',
        size: '1024x1024',
      })
      if (!result) return null
      const ref: KitArtRef = {
        url: result.url,
        storagePath: result.storagePath,
        generatedAt: new Date().toISOString(),
      }
      await setRosterArt(rosterId, characterKey, ref)
      // Count this paid generation against the kid's daily cap (no-op for a
      // parent). Regenerate counts too — each is a real image call (FEAT-94).
      await recordGeneration()
      return ref
    }

  /**
   * "Use as product image" (FEAT-88): set the promoted product's images from the
   * roster's art (hero → `images[0]`). Touches ONLY the catalog product — no
   * roster write, no learner-model / hours / XP. Republish stays the owner's tap.
   */
  const handleUseAsProductImage = async (r: KitRoster) => {
    const product = productForRoster(r)
    if (!product) return
    await updateProduct(product.id, { images: artToProductImages(r) })
  }

  /**
   * Pre-fill a catalog product from a roster (design §2/§5). Read-only of the
   * roster — nothing here mutates it. Title from `vaultName`, type StarterKit
   * default, `madeBy` from the author's name, `sourceRef` links the roster, and
   * `images` pre-filled from any generated art (FEAT-88: hero → `images[0]`,
   * else empty → placeholder card). The parent sets price + status before
   * saving (§6: no kid self-pricing).
   */
  const promoteInitial = (r: KitRoster): Partial<NewCatalogProduct> => {
    const maker = nameById[r.childId]
    return {
      title: r.vaultName.trim() || 'Untitled kit',
      type: BusinessItemType.StarterKit,
      madeBy: maker ? [maker] : [],
      images: artToProductImages(r),
      sourceRef: { kind: 'kitRoster', id: r.id },
    }
  }

  const handlePromoteSave = async (body: NewCatalogProduct) => {
    await createProduct(body)
    setMode({ kind: 'list' })
  }

  /**
   * "Print kit" (FEAT-90): render the whole roster into print-ready pages and open
   * them in a new window for the parent to print / save-to-PDF — the physical
   * product a customer buys. Pure read → print (`buildPrintableKitHtml` writes
   * nothing); mirrors the catalog sheet's `window.open` + `print()` pattern.
   */
  const handlePrintKit = (r: KitRoster) => {
    const html = buildPrintableKitHtml(r, nameById[r.childId] ?? '')
    const kitWindow = window.open('', '_blank')
    if (kitWindow) {
      kitWindow.document.write(html)
      kitWindow.document.close()
      kitWindow.focus()
      kitWindow.print()
    }
  }

  /**
   * "Download art" (FEAT-93): download every generated character sticker with
   * production names (kit-scoped, kebab-case — `neptune-hero-link.png`), zipped.
   * Pure read → fetch-to-blob → download; writes nothing anywhere. The missing
   * production link — print on sticker paper, or upload to a die-cut service.
   */
  const handleDownloadArt = async (r: KitRoster) => {
    await downloadArtFiles(buildKitArtDownloads(r), kitArtZipName(r))
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
    const editing = mode.kind === 'edit' ? mode.roster : undefined
    return (
      <KitBuilderForm
        childId={editing ? editing.childId : activeChildId}
        roster={editing}
        onSave={handleSave}
        onCancel={() => setMode({ kind: 'list' })}
        // Art generation needs a persisted target, so it's offered only on a
        // saved roster in edit mode (FEAT-88). It is NOT parent-gated (FEAT-94):
        // making art on your own kit is kid effort, not money or public
        // exposure — kids generate/regenerate freely, metered by a light daily
        // quota rather than blocked.
        canGenerateArt={Boolean(editing)}
        onGenerateArt={editing ? makeGenerateArt(editing.id) : undefined}
        // The kid hit today's light generation cap — the form swaps the generate
        // buttons for a friendly nudge instead of a hard error (FEAT-94).
        capReached={atLimit}
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
                    {/* Print kit + Download art output the kids' OWN kit — kid
                        effort, not money or public exposure — so both are open
                        to everyone (FEAT-94). */}
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={(e) => {
                        // Don't trigger the row's edit tap.
                        e.stopPropagation()
                        handlePrintKit(r)
                      }}
                    >
                      Print kit
                    </Button>
                    {hasAnyArt(r) && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={(e) => {
                          // Don't trigger the row's edit tap.
                          e.stopPropagation()
                          void handleDownloadArt(r)
                        }}
                      >
                        Download art
                      </Button>
                    )}
                    {/* Writes to the parent-curated catalog product → money +
                        public exposure, so it stays parent-only (FEAT-94). */}
                    {canEdit && hasAnyArt(r) && productForRoster(r) && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={(e) => {
                          // Don't trigger the row's edit tap.
                          e.stopPropagation()
                          void handleUseAsProductImage(r)
                        }}
                      >
                        Use as product image
                      </Button>
                    )}
                    {/* Promote sets price/status → parent-only (FEAT-94/§6). */}
                    {canEdit && (
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
                    )}
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

      {rosters.some(hasAnyArt) && (
        <Typography variant="caption" color="text.secondary">
          <strong>Download art</strong> saves each character as a transparent PNG. Print on sticker
          paper, or upload to a sticker service.
        </Typography>
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
