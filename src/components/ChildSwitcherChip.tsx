import { useCallback, useState } from 'react'
import type { MouseEvent } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import PersonAddIcon from '@mui/icons-material/PersonAdd'

import { useActiveChild } from '../core/hooks/useActiveChild'
import type { Child } from '../core/types'
import AddChildDialog from './AddChildDialog'
import {
  ADD_CHILD_MENU_LABEL,
  ADD_FIRST_CHILD_LABEL,
  CHILD_SWITCHER_MENU_LABEL,
  canOpenChildMenu,
  canSwitchChild,
  childSwitcherLabel,
} from './childSwitcher'

/**
 * The child chip (UX-324) — and since `FEAT-237` / `UX-425` the **one place in
 * the app a parent chooses the child**.
 *
 * It renders once per viewport: `AppShell`'s mobile header below 900px, its
 * desktop sidebar above. The mobile drawer shares `NavContent` and passes
 * `showChildChip={false}`, because the header chip is visible above the open
 * drawer. `ContextBar`'s chip and the ten in-page `ChildSelector`s are gone.
 *
 * **The caret is the affordance and the whole distinction.** A chip that opens
 * a menu carries it; a read-only one does not, and is otherwise byte-identical
 * to the chip that shipped before UX-324. So "is this tappable" is answerable
 * from the chip itself rather than from knowing whose profile is signed in.
 *
 * **Two questions, kept apart** (`components/childSwitcher.ts`):
 * `canOpenChildMenu` decides whether there is a menu at all — a parent, never a
 * kid — and `canSwitchChild` decides whether that menu lists the children. They
 * differ for a one-child family, whose menu holds *Add a child…* and no list.
 *
 * **It writes nothing.** Switching moves the shared active-child selection
 * (`useActiveChild`, the single source of truth) and touches no Firestore
 * document: no XP, no hours, no `skillSnapshots`, no `learnerModels`. The one
 * write reachable from here is `AddChildDialog`'s own, which is a parent
 * creating a child document behind a form and a Save — unchanged by this move,
 * and the reason the dialog is hosted here rather than reimplemented.
 */
export default function ChildSwitcherChip() {
  const {
    activeChild,
    activeChildId,
    children,
    setActiveChildId,
    isChildProfile,
    addChild,
  } = useActiveChild()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [addOpen, setAddOpen] = useState(false)

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
  const openAdd = useCallback(() => {
    setAnchorEl(null)
    setAddOpen(true)
  }, [])
  const closeAdd = useCallback(() => setAddOpen(false), [])
  const onAdded = useCallback(
    (child: Child) => {
      addChild(child)
      setActiveChildId(child.id)
      setAddOpen(false)
    },
    [addChild, setActiveChildId],
  )

  const parent = canOpenChildMenu({ isChildProfile: Boolean(isChildProfile) })

  // No children yet. The chip has nothing to name — but with the in-page
  // selectors gone this is also the only door onto `AddChildDialog`, so a family
  // with no first child would otherwise have no way to create one. A kid still
  // gets nothing: he cannot create a child, and an inert chip would say he can.
  if (!activeChild) {
    if (!parent) return null
    return (
      <>
        <Chip
          label={ADD_FIRST_CHILD_LABEL}
          size="small"
          variant="outlined"
          color="primary"
          icon={<PersonAddIcon />}
          clickable
          onClick={openAdd}
        />
        {addOpen && (
          <AddChildDialog open onClose={closeAdd} onChildAdded={onAdded} />
        )}
      </>
    )
  }

  // Read-only: a child profile. Exactly the chip that shipped before UX-324,
  // minus nothing — and without the caret, so it does not read as a control the
  // way the switchable one does. A kid sees whose day it is and cannot change it.
  if (!parent) {
    return (
      <Chip
        label={activeChild.name}
        size="small"
        variant="outlined"
        color="primary"
      />
    )
  }

  const switchable = canSwitchChild({
    isChildProfile: Boolean(isChildProfile),
    childCount: children?.length ?? 0,
  })

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
        {switchable &&
          children.map((child) => (
            <MenuItem
              key={child.id}
              selected={child.id === activeChildId}
              onClick={() => choose(child.id)}
            >
              {child.name}
            </MenuItem>
          ))}
        {switchable && <Divider />}
        <MenuItem onClick={openAdd}>{ADD_CHILD_MENU_LABEL}</MenuItem>
      </Menu>
      {/* Mounted only while it is open. `AddChildDialog` calls `useFamilyId`
          unconditionally, and this chip renders on every screen in the product
          — so an always-mounted dialog would make the family id a dependency of
          the whole shell rather than of the one form that writes with it. */}
      {addOpen && <AddChildDialog open onClose={closeAdd} onChildAdded={onAdded} />}
    </>
  )
}
