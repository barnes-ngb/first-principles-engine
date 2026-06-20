import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import SectionErrorBoundary from '../../components/SectionErrorBoundary'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import SaleEntryForm from './SaleEntryForm'
import SalesLogList from './SalesLogList'
import { useBusinessLog } from './useBusinessLog'

/**
 * Barnes Bros — Lincoln's business tab (FEAT-30).
 *
 * Chunk 1 landed the shell + two regions. Chunk 2 fills the Operations region
 * with the sales/earnings log: the tap-friendly entry, the recent-sales list,
 * and the derived running total the chunk-3 thermometer will climb on.
 *
 * The Goal region stays a placeholder for chunk 3 (thermometer + goal builder).
 */
export default function BusinessPage() {
  const { activeChildId } = useActiveChild()
  const { entries, total, loading, addSale } = useBusinessLog()

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
            <SalesLogList entries={entries} total={total} loading={loading} />
          </Stack>
        </SectionCard>
      </SectionErrorBoundary>

      <SectionErrorBoundary section="business goal">
        <SectionCard title="Goal">
          <Typography variant="body2" color="text.secondary">
            Your Xbox goal meter will live here soon.
          </Typography>
        </SectionCard>
      </SectionErrorBoundary>
    </Page>
  )
}
