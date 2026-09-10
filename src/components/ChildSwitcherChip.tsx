import { useCallback, useState } from 'react'
import type { MouseEvent } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'

import { useActiveChild } from '../core/hooks/useActiveChild'
import {
  CHILD_SWITCHER_MENU_LABEL,
  canSwitchChild,
  childSwitcherLabel,
} from './childSwitcher'

/**
 * The app-bar child chip (UX-324) — the one place in the shell a parent changes
 * which child she is on.
 *
 * Both of `AppShell`'s name chips render THIS component, so the header and the
 * nav can never disagree about whether the name is a control: two chips styled
 * alike with different behaviour is the bug this fixes, re-created.
 *
 * **The caret is the affordance and the whole distinction.** A switchable chip
 * carries it; a read-only one does not, and is otherwise byte-identical to the
 * chip that shipped before this change. So "is this tappable" is answerable from
 * the chip itself rather than from knowing whose profile is signed in.
 *
 * **It writes nothing.** Switching moves the shared active-child selection
 * (`useActiveChild`, the single source of truth every in-page `ChildSelector`
 * also reads and writes) and touches no Firestore document: no XP, no hours, no
 * `skillSnapshots`, no `learnerModels`.
 */
export default function ChildSwitcherChip() {
  const { activeChild, activeChildId, children, setActiveChildId, isChildProfile } =
    useActiveChild()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)

  const closeMenu = useCallback(() => setAnchorEl(null), [])
  const openMenu = useCallback(
    (e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget),
    [],
  )
  const choose = useCallback(
    (childId: string) => {
      setActiveChildId(childId)
      setAnchorEl(null)
    },
    [setActiveChildId],
  )

  if (!activeChild) return null

  const switchable = canSwitchChild({
    isChildProfile: Boolean(isChildProfile),
    childCount: children?.length ?? 0,
  })

  // Read-only: a child profile (who cannot switch), or a single-child family
  // (where a menu could not do anything). Exactly the chip that shipped before
  // UX-324, minus nothing — and without the caret, so it does not read as a
  // control the way the switchable one does.
  if (!switchable) {
    return (
      <Chip
        label={activeChild.name}
        size="small"
        variant="outlined"
        color="primary"
      />
    )
  }

  return (
    <>
      <Chip
        label={
          <Box
            component="span"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
          >
            {activeChild.name}
            <ArrowDropDownIcon fontSize="small" sx={{ mr: -0.5 }} />
          </Box>
        }
        size="small"
        variant="outlined"
        color="primary"
        clickable
        onClick={openMenu}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchorEl)}
        aria-label={childSwitcherLabel(activeChild.name)}
      />
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeMenu}
        slotProps={{ list: { 'aria-label': CHILD_SWITCHER_MENU_LABEL } }}
      >
        {children.map((child) => (
          <MenuItem
            key={child.id}
            selected={child.id === activeChildId}
            onClick={() => choose(child.id)}
          >
            {child.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
