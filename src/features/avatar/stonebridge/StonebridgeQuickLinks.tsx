/**
 * The town's quick links — one compact disclosure instead of a standing strip.
 *
 * ── What this replaces, and why ──────────────────────────────────────────────
 *
 * The canonical town page carried *My Books*, *Today* and *My armor* as three
 * buttons at the foot of **every** state of the page. The destinations are
 * right; the repetition is not — the same three actions are already in the
 * shell's own navigation, and on a phone they pushed the village up the screen
 * for a child who came to look at the village. The owner's clarification named
 * exactly these three buttons (not the left menu) as the redundancy to remove.
 *
 * So on a HEALTHY town they become one plainly named, initially compact
 * disclosure. The routes do not change, the Forge epoch hand-off does not
 * change, and nothing new is added behind them.
 *
 * ── What it must not become ──────────────────────────────────────────────────
 *
 *   • **It is not the only way to useful work.** When the page has no village to
 *     show — a loading, failed, stale or recovering read, or no child resolved —
 *     the page renders the three doors DIRECTLY instead of this, because that is
 *     exactly the state in which a child needs an obvious way out and must not
 *     have to find a thing to open first. That choice belongs to the page; this
 *     component is only the compact form.
 *   • **It holds no destination of its own.** Each link is handed in with the
 *     page's own handler, so there is one definition of where Books, Today and
 *     the armor are, and this file names no route.
 *   • **It does not leak between children.** `scopeKey` closes it again when the
 *     family or child changes, in the render phase, so a disclosure left open
 *     for one child is not an open panel on their sibling's town.
 *
 * A real `<button>` with `aria-expanded` / `aria-controls` and a 44px target;
 * the panel is plain content, not a menu, and the links inside it are the same
 * native buttons the direct doors are.
 */
import { useId, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'

export interface StonebridgeQuickLink {
  /** The visible, accessible name. The page owns the wording. */
  label: string
  /** The page's own navigation. This component performs nothing else. */
  onSelect: () => void
}

interface StonebridgeQuickLinksProps {
  links: readonly StonebridgeQuickLink[]
  isLincoln: boolean
  /** `${familyId}_${childId}` — the disclosure resets with the scope. */
  scopeKey: string
}

/**
 * The same door shape the page's direct fallback doors use: a 44px target, 14px
 * text, bold, and not shouted in capitals. Stated here rather than passed in
 * because a style object handed through props types badly against `sx` — the
 * pair is two short literals and the numbers are the mobile rule, not taste.
 */
const doorSx = {
  minHeight: 44,
  px: 2,
  fontSize: '14px',
  fontWeight: 700,
  textTransform: 'none',
} as const

export default function StonebridgeQuickLinks({
  links,
  isLincoln,
  scopeKey,
}: StonebridgeQuickLinksProps) {
  const panelId = useId()
  const [disclosure, setDisclosure] = useState<{ scopeKey: string; open: boolean }>(() => ({
    scopeKey,
    open: false,
  }))
  // Render-phase, conditional, converging — the same shape the board uses for
  // its own scoped state, so there is no frame in which one child's town shows
  // the panel their sibling's town had open.
  if (disclosure.scopeKey !== scopeKey) setDisclosure({ scopeKey, open: false })
  const open = disclosure.scopeKey === scopeKey && disclosure.open

  const bodyFont = isLincoln ? undefined : '"Fredoka", cursive'

  return (
    <Box sx={{ mt: 1 }}>
      <Button
        variant="text"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setDisclosure({ scopeKey, open: !open })}
        sx={{
          ...doorSx,
          fontFamily: bodyFont,
          color: isLincoln ? '#F7D774' : '#7a3f67',
        }}
      >
        {/* The chevron is decoration, so it is hidden from the accessible name:
            the control is called *Quick links* and nothing else, and
            `aria-expanded` is what says which way it is pointing. */}
        <Box component="span" aria-hidden="true" sx={{ mr: 0.75 }}>
          {open ? '▾' : '▸'}
        </Box>
        Quick links
      </Button>
      {/* Keep the control relationship valid while hidden removes the panel
          and its buttons from both the accessibility tree and keyboard order. */}
      <Box id={panelId} hidden={!open} sx={{ display: open ? 'flex' : 'none', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
        {links.map((link) => (
          <Button key={link.label} variant="outlined" sx={doorSx} onClick={link.onSelect}>
            {link.label}
          </Button>
        ))}
      </Box>
    </Box>
  )
}
