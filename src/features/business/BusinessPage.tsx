import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import SectionErrorBoundary from '../../components/SectionErrorBoundary'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useProfile } from '../../core/profile/useProfile'
import GoalBuilder from './GoalBuilder'
import GoalThermometer from './GoalThermometer'
import KitBuilderSection from './KitBuilderSection'
import SaleEntryForm from './SaleEntryForm'
import SalesLogList from './SalesLogList'
import { useBusinessGoal } from './useBusinessGoal'
import { useBusinessLog } from './useBusinessLog'

/**
 * Barnes Bros — Lincoln's business tab (FEAT-30).
 *
 * Chunk 1 landed the shell + two regions. Chunk 2 fills the Operations region
 * with the sales/earnings log: the tap-friendly entry, the recent-sales list,
 * and the derived running total. Chunk 3 fills the Goal region with the goal
 * builder (the milestone stack Lincoln assembles) + the additive thermometer
 * that climbs on the money-in total. Chunk 4 makes a sale parent-confirmed: the
 * thermometer + log headline climb only on the CONFIRMED total, and the confirm
 * / unconfirm / remove controls are parent-gated (`canEdit`). Kids still log and
 * see pending sales; only a parent OKs them onto the meter.
 */
export default function BusinessPage() {
  const { activeChildId } = useActiveChild()
  const { canEdit } = useProfile()
  const {
    entries,
    total,
    confirmedTotal,
    loading,
    addSale,
    confirmSale,
    unconfirm,
    removeSale,
  } = useBusinessLog()
  const { milestones, saving, saveMilestones } = useBusinessGoal(activeChildId)

  return (
    <Page>
      <div>
        <Typography variant="h4" component="h1">
          Barnes Bros
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Run your business and climb toward your goal.
        </Typography>
      </div>

      <SectionErrorBoundary section="business operations">
        <SectionCard title="Operations">
          <Stack spacing={3}>
            {activeChildId ? (
              <SaleEntryForm childId={activeChildId} onLogSale={addSale} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                Loading…
              </Typography>
            )}
            <SalesLogList
              entries={entries}
              confirmedTotal={confirmedTotal}
              total={total}
              loading={loading}
              canConfirm={canEdit}
              onConfirm={confirmSale}
              onUnconfirm={unconfirm}
              onRemove={removeSale}
            />
          </Stack>
        </SectionCard>
      </SectionErrorBoundary>

      <SectionErrorBoundary section="kit builder">
        <SectionCard title="Kit Builder">
          {activeChildId ? (
            <KitBuilderSection activeChildId={activeChildId} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              Loading…
            </Typography>
          )}
        </SectionCard>
      </SectionErrorBoundary>

      <SectionErrorBoundary section="business goal">
        <SectionCard title="Goal">
          {activeChildId ? (
            <Stack spacing={3}>
              <GoalThermometer milestones={milestones} total={confirmedTotal} />
              <GoalBuilder
                childId={activeChildId}
                milestones={milestones}
                saving={saving}
                onSave={saveMilestones}
              />
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Loading…
            </Typography>
          )}
        </SectionCard>
      </SectionErrorBoundary>
    </Page>
  )
}
