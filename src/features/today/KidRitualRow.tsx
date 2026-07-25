import { useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

interface KidRitualRowProps {
  /** Emoji or icon node shown at the row's leading edge. */
  icon: ReactNode
  title: string
  subtitle?: string
  /** Read-only completion, derived from the ritual's own store. */
  done?: boolean
  isLincoln: boolean
  /** Render the body permanently open with no toggle affordance (mining row). */
  alwaysOpen?: boolean
  /** Initial open state. Callers pass `!done` so a finished ritual folds away. */
  defaultExpanded?: boolean
  /** Anchor for `/today#chapter` / `#conundrum` deep links. */
  anchorId?: string
  children: ReactNode
}

/**
 * One row of Kid Today's single list (UX-C2b-1 / FEAT-118).
 *
 * A ritual (chapter, conundrum, teach-back, mining) rendered to match a
 * `KidChecklist` row, so the surface reads as one list rather than a checklist
 * plus a stack of sibling cards.
 *
 * **No checkbox, by design.** A checkbox invites a tap that would imply a
 * completion write this row does not own — the ritual's own component owns its
 * save, and `done` here is a read-only derivation from that store (see
 * `kidRitualRows.ts` for why rituals stay out of `dayLog.checklist`). Tapping
 * the header expands the row; nothing on it writes.
 *
 * Two structural details worth keeping:
 * - **Self-folding without an effect.** `expanded` is `override ?? defaultExpanded`,
 *   so a caller passing `defaultExpanded={!done}` gets a row that folds itself
 *   away when the ritual completes — no `useEffect`, and a kid who manually
 *   opened the row isn't fought by a later re-render.
 * - **Deep links survive collapse.** The `anchorId` element renders outside the
 *   `<Collapse>` so `useScrollToHash` still resolves it while folded.
 */
export default function KidRitualRow({
  icon,
  title,
  subtitle,
  done = false,
  isLincoln,
  alwaysOpen = false,
  defaultExpanded = true,
  anchorId,
  children,
}: KidRitualRowProps) {
  const [override, setOverride] = useState<boolean | null>(null)
  const expanded = alwaysOpen ? true : (override ?? defaultExpanded)
  const bodyId = useId()

  const mcFont = '"Press Start 2P", monospace'

  const toggle = () => {
    if (alwaysOpen) return
    setOverride(!expanded)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    // Space scrolls the page and Enter can submit an ancestor form — a
    // `role="button"` div has to suppress both itself.
    event.preventDefault()
    toggle()
  }

  const headerProps = alwaysOpen
    ? {}
    : {
        role: 'button',
        tabIndex: 0,
        'aria-expanded': expanded,
        'aria-controls': bodyId,
        onClick: toggle,
        onKeyDown: handleKeyDown,
      }

  return (
    <Box
      sx={{
        p: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: done ? 'success.200' : 'divider',
        bgcolor: done ? 'success.50' : 'background.paper',
      }}
    >
      {/* Outside the Collapse so hash deep-links resolve while folded. */}
      {anchorId && <Box id={anchorId} />}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          minHeight: 56,
          cursor: alwaysOpen ? 'default' : 'pointer',
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
            borderRadius: 2,
          },
        }}
        {...headerProps}
      >
        <Box sx={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center' }}>{icon}</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 600,
              ...(isLincoln ? { fontFamily: mcFont, fontSize: '0.6rem' } : {}),
            }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                ...(isLincoln ? { fontFamily: mcFont, fontSize: '0.4rem' } : {}),
                mt: 0.25,
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        {done && (
          <CheckCircleIcon
            color="success"
            titleAccess="done"
            sx={{ fontSize: 24 }}
          />
        )}
        {!alwaysOpen && (
          <ExpandMoreIcon
            sx={{
              color: 'text.secondary',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 150ms',
            }}
          />
        )}
      </Stack>
      {/* Never `unmountOnExit`: the ritual components below own their own
          in-progress state, and `aria-controls` has to resolve while folded. */}
      <Collapse in={expanded}>
        <Box id={bodyId} sx={{ pt: 1 }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  )
}
