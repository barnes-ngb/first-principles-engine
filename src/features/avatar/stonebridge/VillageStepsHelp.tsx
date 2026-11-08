/**
 * *What adds steps?* — the village's one optional explanation.
 *
 * ── Why a disclosure, and not a sheet ────────────────────────────────────────
 *
 * The three surfaces that show the repair number are a page/board, a modal
 * location visit and the Hero Hub card. A second modal over the visit would be
 * a dialog on a dialog on a phone, and the thing being explained is two short
 * sentences. So this is the `StonebridgeQuickLinks` shape — a real `<button>`
 * with `aria-expanded` / `aria-controls` and a 44px target, and a panel of plain
 * content in the host's own flow, which keeps the explanation inside whatever
 * surface is topmost rather than stacking a new one over it.
 *
 * ── What it is, and is not ───────────────────────────────────────────────────
 *
 *   • **Read-only.** It renders `villageStepsCopy` and nothing else: no progress
 *     read, no subscription, no navigation, no Firestore. Opening, closing or
 *     dismissing it records nothing and earns nothing.
 *   • **Not a place to put a map control.** It is never rendered inside a place
 *     button — a help control nested in a tile would make one tap mean two
 *     things — so each host renders it in its own flow, beside the number.
 *   • **It does not leak between children.** `scopeKey` closes it again in the
 *     render phase, the same converging update the board and the quick links
 *     use, so nothing is keyed and no host is remounted to reset it.
 *   • **Escape closes it and hands the keyboard back** to the control that
 *     opened it, because the panel's content is not focusable and a child who
 *     pressed Escape expecting the panel to go has not left the surface.
 */
import { useId, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import {
  VILLAGE_STEPS_HELP_LABEL,
  VILLAGE_STEPS_HELP_LINES,
} from './villageStepsCopy'

interface VillageStepsHelpProps {
  /** The cosmetic retro look — personality, never access (ARCH-15). */
  isLincoln: boolean
  /**
   * `${familyId}_${childId}` — the disclosure closes when the scope changes.
   *
   * The location visit hands its own mission id instead: it is unmounted by the
   * board on a scope change, so the narrower identity is the only one that can
   * move underneath it.
   */
  scopeKey: string
}

export default function VillageStepsHelp({ isLincoln, scopeKey }: VillageStepsHelpProps) {
  const panelId = useId()
  const toggleRef = useRef<HTMLButtonElement | null>(null)
  const [disclosure, setDisclosure] = useState<{ scopeKey: string; open: boolean }>(() => ({
    scopeKey,
    open: false,
  }))
  if (disclosure.scopeKey !== scopeKey) setDisclosure({ scopeKey, open: false })
  const open = disclosure.scopeKey === scopeKey && disclosure.open

  /** Everything a child has to READ is plain, at 14px or more. */
  const bodyFont = isLincoln ? undefined : '"Fredoka", cursive'
  const inkColor = isLincoln ? '#F7D774' : '#7a3f67'

  return (
    <Box
      sx={{ mt: 0.75 }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        // Stop here: the host may be a modal, and Escape inside an open panel
        // means "close the panel", not "leave the visit".
        event.stopPropagation()
        setDisclosure({ scopeKey, open: false })
        toggleRef.current?.focus()
      }}
    >
      <Button
        variant="text"
        ref={toggleRef}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setDisclosure({ scopeKey, open: !open })}
        sx={{
          // A 44px target, like every other control in the village.
          minHeight: 44,
          px: 1.5,
          fontFamily: bodyFont,
          fontSize: '14px',
          fontWeight: 700,
          textTransform: 'none',
          // Allowed to wrap rather than shrink or clip on a narrow phone.
          whiteSpace: 'normal',
          textAlign: 'left',
          color: inkColor,
        }}
      >
        {/* Decoration: the control is called *What adds steps?* and nothing
            else, and `aria-expanded` is what says which way it points. */}
        <Box component="span" aria-hidden="true" sx={{ mr: 0.75 }}>
          {open ? '▾' : '▸'}
        </Box>
        {VILLAGE_STEPS_HELP_LABEL}
      </Button>
      {/* `hidden` as well as `display: none`, so a closed panel is out of the
          accessibility tree and out of the tab order while the control it
          names keeps pointing at a real element. */}
      <Box id={panelId} hidden={!open} sx={{ display: open ? 'block' : 'none', px: 1.5 }}>
        {VILLAGE_STEPS_HELP_LINES.map((line) => (
          <Typography
            key={line}
            sx={{
              fontFamily: bodyFont,
              fontSize: '14px',
              lineHeight: 1.45,
              overflowWrap: 'break-word',
              opacity: 0.88,
              mt: 0.25,
            }}
          >
            {line}
          </Typography>
        ))}
      </Box>
    </Box>
  )
}
