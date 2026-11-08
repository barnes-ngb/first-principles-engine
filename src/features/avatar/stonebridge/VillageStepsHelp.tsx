/**
 * *What adds steps?* — the village's one optional explanation.
 *
 * Invariants:
 *
 *   • **Read-only.** It renders `villageStepsCopy` and nothing else: no
 *     progress read, no Firestore, no navigation. Opening or closing it
 *     records nothing and earns nothing.
 *   • **An inline disclosure, in the host's own flow** — the
 *     `StonebridgeQuickLinks` shape (a real `<button>` with `aria-expanded` /
 *     `aria-controls` and a 44px target), so the explanation stays inside
 *     whatever surface is topmost instead of stacking a modal over a modal.
 *     Never rendered inside a place control: one tap, one meaning.
 *   • **It closes when the identity moves.** `scopeKey` covers a family/child
 *     change; the `libraryReturnFlow` identity EPOCH covers the movements a
 *     scope string cannot see — a parent→child profile change for the same
 *     child, a sign-out and back in. Read-only subscription to the existing
 *     store, reset in the render phase, so nothing is keyed or remounted.
 *     `isLincoln` is cosmetic and is not identity.
 *   • **Escape closes it** and hands the keyboard back to the control that
 *     opened it; the panel's content is not focusable.
 */
import { useId, useRef, useState, useSyncExternalStore } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { getLibraryIdentityEpoch, subscribeLibraryIdentityEpoch } from './libraryReturnFlow'
import { VILLAGE_STEPS_HELP_LABEL, VILLAGE_STEPS_HELP_LINES } from './villageStepsCopy'

interface VillageStepsHelpProps {
  /** Cosmetic retro look — personality, never access (ARCH-15). */
  isLincoln: boolean
  /**
   * `${familyId}_${childId}` — whose surface this is.
   *
   * The location visit hands its own scope down from the board, so all three
   * hosts key this on the same string.
   */
  scopeKey: string
}

export default function VillageStepsHelp({ isLincoln, scopeKey }: VillageStepsHelpProps) {
  const panelId = useId()
  const toggleRef = useRef<HTMLButtonElement | null>(null)
  /** Identity movement itself, from the existing read-only store. */
  const epoch = useSyncExternalStore(subscribeLibraryIdentityEpoch, getLibraryIdentityEpoch)
  /** The identity this panel's open state belongs to: scope AND epoch. */
  const ownerKey = `${scopeKey}#${epoch}`

  const [disclosure, setDisclosure] = useState<{ ownerKey: string; open: boolean }>(() => ({
    ownerKey,
    open: false,
  }))
  // Render-phase, conditional, converging — the board's and the quick links'
  // own shape, so no frame shows one identity the panel another one opened.
  if (disclosure.ownerKey !== ownerKey) setDisclosure({ ownerKey, open: false })
  const open = disclosure.ownerKey === ownerKey && disclosure.open

  /** Everything a child has to READ is plain, at 14px or more. */
  const bodyFont = isLincoln ? undefined : '"Fredoka", cursive'
  const inkColor = isLincoln ? '#F7D774' : '#7a3f67'

  return (
    <Box
      sx={{ mt: 0.75 }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        // The host may be a modal: Escape inside an open panel means "close
        // the panel", not "leave the visit".
        event.stopPropagation()
        setDisclosure({ ownerKey, open: false })
        toggleRef.current?.focus()
      }}
    >
      <Button
        variant="text"
        ref={toggleRef}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setDisclosure({ ownerKey, open: !open })}
        sx={{
          minHeight: 44,
          px: 1.5,
          fontFamily: bodyFont,
          fontSize: '14px',
          fontWeight: 700,
          textTransform: 'none',
          // Wraps rather than shrinking or clipping on a narrow phone.
          whiteSpace: 'normal',
          textAlign: 'left',
          color: inkColor,
        }}
      >
        {/* Decoration: `aria-expanded` is what says which way it points. */}
        <Box component="span" aria-hidden="true" sx={{ mr: 0.75 }}>
          {open ? '▾' : '▸'}
        </Box>
        {VILLAGE_STEPS_HELP_LABEL}
      </Button>
      {/* `hidden` as well as `display: none`: a closed panel is out of the
          accessibility tree and out of the tab order, while the control that
          names it keeps pointing at a real element. */}
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
