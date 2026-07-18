import { useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import PrintIcon from '@mui/icons-material/Print'
import PublicIcon from '@mui/icons-material/Public'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { CatalogProduct } from '../../core/types/business'
import { CatalogProductStatus } from '../../core/types/business'
import CatalogProductCard from './CatalogProductCard'
import CatalogProductForm from './CatalogProductForm'
import { buildCatalogSheetHtml, selectListedProducts } from './catalogSheet'
import { PUBLIC_CATALOG_CLEAN_URL } from './catalogSitePublish'
import type { NewCatalogProduct } from './useCatalogProducts'
import { useCatalogProducts } from './useCatalogProducts'
import { useCatalogSite } from './useCatalogSite'

/** List, or the form (new product / editing an existing one). */
type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; product: CatalogProduct }

interface CatalogSectionProps {
  /** Parent gate — only a parent authors, prices, and sets status (§6). */
  canEdit: boolean
}

/**
 * The Barnes Bros catalog — the "show" surface (FEAT-81, design §3). A sibling
 * region on `BusinessPage`: a pride wall of the boys' products, each an
 * image-or-placeholder card. Parent-curated — the add/edit form and status are
 * `canEdit`-gated. Family-scoped (a catalog is the family's storefront).
 *
 * `retired` products are hidden from this default view (design §3).
 */
export default function CatalogSection({ canEdit }: CatalogSectionProps) {
  const { products, loading, createProduct, updateProduct } = useCatalogProducts()
  const { published, busy: siteBusy, error: siteError, publish, unpublish } = useCatalogSite()
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [copied, setCopied] = useState(false)

  const shown = products.filter((p) => p.status !== CatalogProductStatus.Retired)
  const listedCount = selectListedProducts(products).length

  const handleSave = async (body: NewCatalogProduct, id?: string) => {
    if (id) {
      await updateProduct(id, body)
    } else {
      await createProduct(body)
    }
    setMode({ kind: 'list' })
  }

  /**
   * Open a print-optimized sheet of the `listed` products in a new window (design
   * §4 Option A). The parent prints / saves-to-PDF and hands it to a family — no
   * hosting, no checkout, read-only. Mirrors the compliance-report print in
   * `RecordsPage`.
   */
  const handleShareSheet = () => {
    const html = buildCatalogSheetHtml(products)
    const sheetWindow = window.open('', '_blank')
    if (sheetWindow) {
      sheetWindow.document.write(html)
      sheetWindow.document.close()
      sheetWindow.focus()
      sheetWindow.print()
    }
  }

  /**
   * Publish (or republish) the public catalog site (design §4 Option C / C1):
   * render the `listed` products to a static page and upload it to a
   * world-readable Storage URL a family opens on a phone — no login, no
   * checkout. Republish = tap again; the URL is stable.
   */
  const handlePublishSite = async () => {
    try {
      await publish(products)
    } catch {
      // Error surfaced via `siteError` below.
    }
  }

  /** Take the public site down — deletes the published page. */
  const handleUnpublishSite = async () => {
    try {
      await unpublish()
    } catch {
      // Error surfaced via `siteError` below.
    }
  }

  const handleCopyUrl = async () => {
    if (!published) return
    try {
      // Copy the DIRECT Storage URL — the one guaranteed to resolve. The clean
      // /shop address is only live once its one-time redirect target is baked
      // (FEAT-85), so copying it here could hand a family a dead link (Codex P1).
      // The clean address is shown below as the short link to share once wired.
      await navigator.clipboard.writeText(published.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — the address is still shown as a tappable link.
    }
  }

  if (mode.kind === 'new' || mode.kind === 'edit') {
    const editing = mode.kind === 'edit' ? mode.product : undefined
    return (
      <CatalogProductForm
        initial={editing}
        onSave={(body) => handleSave(body, editing?.id)}
        onCancel={() => setMode({ kind: 'list' })}
      />
    )
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Your catalog — everything the Barnes Bros make. Promote a kit or add a product to show it
        here.
      </Typography>

      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      ) : shown.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No products yet — promote a kit or add one.
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
            gap: 1.5,
          }}
        >
          {shown.map((p) => (
            <CatalogProductCard
              key={p.id}
              product={p}
              onClick={canEdit ? () => setMode({ kind: 'edit', product: p }) : undefined}
            />
          ))}
        </Box>
      )}

      {canEdit && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ alignSelf: 'flex-start' }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setMode({ kind: 'new' })}>
            Add product
          </Button>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handleShareSheet}
            disabled={listedCount === 0}
          >
            Share / print sheet
          </Button>
          <Button
            variant="outlined"
            startIcon={<PublicIcon />}
            onClick={handlePublishSite}
            disabled={listedCount === 0 || siteBusy}
          >
            {siteBusy ? 'Publishing…' : published ? 'Republish site' : 'Publish site'}
          </Button>
        </Stack>
      )}

      {canEdit && listedCount === 0 && (
        <Typography variant="caption" color="text.secondary">
          Mark a product <strong>Listed</strong> to share a family sheet or publish the site.
        </Typography>
      )}

      {canEdit && siteError && (
        <Typography variant="caption" color="error">
          Couldn't publish the site: {siteError}
        </Typography>
      )}

      {canEdit && published && (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            p: 1.5,
            bgcolor: 'action.hover',
          }}
        >
          <Stack spacing={1}>
            <Typography variant="subtitle2">Your public catalog is live 🌱</Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
              <Link href={published.url} target="_blank" rel="noopener noreferrer">
                {published.url}
              </Link>
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              Short address (one-time setup): <strong>{PUBLIC_CATALOG_CLEAN_URL}</strong> — paste the
              link above into <code>public/shop/index.html</code> (<code>CATALOG_URL</code>) once, then
              you can share the short one.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Last published {new Date(published.publishedAt).toLocaleString()} — text this link to a
              family so they can pick their favorites. Republish any time the catalog changes.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={handleCopyUrl}
              >
                {copied ? 'Copied!' : 'Copy link'}
              </Button>
              <Button size="small" color="error" onClick={handleUnpublishSite} disabled={siteBusy}>
                Unpublish
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
    </Stack>
  )
}
