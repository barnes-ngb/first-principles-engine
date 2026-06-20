import Typography from '@mui/material/Typography'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import SectionErrorBoundary from '../../components/SectionErrorBoundary'

/**
 * Barnes Bros — Lincoln's business tab (FEAT-30, chunk 1: foundation).
 *
 * Empty shell only. The two regions below are placeholders for the first
 * build slice's two halves (see docs/BUSINESS_TAB_DESIGN.md):
 *   • Operations — sales/earnings log, inventory, order pipeline.
 *   • Goal — the additive Xbox + games thermometer and goal builder.
 *
 * No data wiring or logic yet — those land in later chunks.
 */
export default function BusinessPage() {
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
          <Typography variant="body2" color="text.secondary">
            Your sales and earnings will show up here soon.
          </Typography>
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
