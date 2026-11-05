import { useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { useFamilyId } from '../../../core/auth/useAuth'
import { useActiveChild } from '../../../core/hooks/useActiveChild'
import { LIBRARY_RETURN_LABEL, LIBRARY_RETURN_LINE } from './libraryReturnCopy'
import {
  LIBRARY_RETURN_VILLAGE_PATH,
  getLibraryReturnFlow,
  liveLibraryReturnFlow,
  requestLibraryReturn,
  subscribeLibraryReturnFlow,
} from './libraryReturnFlow'
import { useLibraryReturnReadinessWatch } from './useLibraryReturnScopeWatch'

/**
 * The one way back from My Books to the village the child came from.
 *
 * ── Why it lives on the shelf, and only on the shelf ─────────────────────────
 *
 * Every exit in the Books area already goes to the shelf. The reader's *My
 * Books*, the editor's back arrow and its header button, the per-page review's
 * two exits, Stickers, the sight-word dashboard and the sight-word create page
 * all call `navigate('/books')`; the editor and the review chat hand finished
 * work on to `/books/:id/read` and `/books/:id`, which are themselves inside the
 * journey. So one control here is reachable from every reading and making path
 * the shelf opens, without putting a second back-button on seven screens or
 * competing with the exits those screens already own. `booksExits.source.test.ts`
 * holds that true: a new exit pointing anywhere else fails it.
 *
 * It renders only while the flow is live for THIS family and THIS child. A
 * direct `/books`, a refresh, a copied link and an unsettled or failed children
 * read all leave it absent, and the shelf is exactly the shelf it always was.
 * A FAILED read also ends the journey outright rather than waiting to be offered
 * again — see the watch inside the component: an unknown identity that only hid
 * this control handed the old origin back the moment the flag cleared.
 *
 * ── What the tap does ────────────────────────────────────────────────────────
 *
 * Asks the flow, by the generation this render was given; navigates only if the
 * flow says yes. A scope that moved under an open shelf — the app-bar chip, an
 * authorised draft resume — has already ended the flow, so the tap sends nobody
 * anywhere rather than taking the child now on screen to a journey they were not
 * on. Navigation is the app's ordinary router call: whatever guard owns the
 * current route still owns the departure, and this adds none of its own.
 */
export default function LibraryReturnBanner() {
  const navigate = useNavigate()
  const familyId = useFamilyId()
  const { activeChild, isLoading, loadFailed } = useActiveChild()
  const flow = useSyncExternalStore(subscribeLibraryReturnFlow, getLibraryReturnFlow)
  /**
   * The identity has to be SETTLED, not merely present.
   *
   * `useChildren` keeps the shared children list across a re-read and reports
   * `isLoading` / `loadFailed` beside it, so `activeChild` can still be a whole
   * object from the previous answer while the current read is unsettled or has
   * failed. A failed read is not an affirmative identity, so the control is not
   * offered against one — the GATE verdict, not a guess about undefined.
   *
   * And hiding it is not the end of it: the flow is module memory, so an unknown
   * read that only hid the control left the journey sitting there to be handed
   * back when the flag cleared. The watch below ENDS it from the same two values
   * — the one read this component already makes, with no second read and no
   * stored flag — and the gate here stays exactly as it was for the frames
   * before that lands.
   */
  useLibraryReturnReadinessWatch(isLoading, loadFailed)
  const settled = !isLoading && !loadFailed
  const live = settled
    ? liveLibraryReturnFlow(flow, { familyId, childId: activeChild?.id ?? '' })
    : null

  if (!live) return null

  const generation = live.generation

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
        p: 1.5,
        mb: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'warning.300',
        bgcolor: 'warning.50',
      }}
    >
      <Typography
        sx={{
          flex: '1 1 auto',
          // Plain, and at least 14px: this feature's rule is that the pixel
          // theme is for headings and everything a child has to READ is plain
          // at 14px or more (see `StonebridgeLocationDialog`). The same reason
          // the control below carries no themed font either.
          fontSize: '14px',
          lineHeight: 1.45,
        }}
      >
        🏰 {LIBRARY_RETURN_LINE}
      </Typography>
      <Button
        variant="contained"
        color="warning"
        onClick={() => {
          // The flow decides, not the render that drew this button.
          if (!requestLibraryReturn(generation)) return
          navigate(LIBRARY_RETURN_VILLAGE_PATH)
        }}
        sx={{
          // A 44px target that is allowed its own row on a narrow phone rather
          // than squeezing the sentence beside it.
          minHeight: 44,
          px: 2,
          flex: { xs: '1 1 100%', sm: '0 0 auto' },
          fontSize: '14px',
          fontWeight: 700,
          textTransform: 'none',
        }}
      >
        {LIBRARY_RETURN_LABEL}
      </Button>
    </Box>
  )
}
