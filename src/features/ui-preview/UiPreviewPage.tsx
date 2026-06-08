import AddIcon from '@mui/icons-material/Add'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'

/**
 * Unlinked gallery for the shared state components (UI Batch 3a). Reachable at
 * `/ui-preview` but not surfaced in any nav — it exists so the look of
 * LoadingState / EmptyState / ErrorState can be reviewed on a phone before
 * Batch 3b migrates the ~49 real sites. Does not touch any real surface.
 */
export default function UiPreviewPage() {
  return (
    <Page>
      <Typography variant="h4">UI States — Preview Gallery</Typography>
      <Typography variant="body2" color="text.secondary">
        Batch 3a. Unlinked preview of the shared <code>LoadingState</code>,{' '}
        <code>EmptyState</code>, and <code>ErrorState</code> components. No real surface uses
        these yet — that&apos;s Batch 3b.
      </Typography>

      <SectionCard title="LoadingState — inline">
        <LoadingState label="Loading today’s log…" />
        <Divider />
        <Typography variant="caption" color="text.secondary">
          No label:
        </Typography>
        <LoadingState />
      </SectionCard>

      <SectionCard title="LoadingState — fullHeight">
        <LoadingState fullHeight label="Building your week…" />
      </SectionCard>

      <SectionCard title="EmptyState — with icon + action">
        <EmptyState
          icon={<MenuBookIcon />}
          title="Nothing here yet"
          description="Make your first book — write a story and draw the pictures!"
          action={
            <Button variant="contained" size="large" startIcon={<AddIcon />} sx={{ minHeight: 56, px: 4 }}>
              Make a new book
            </Button>
          }
        />
      </SectionCard>

      <SectionCard title="EmptyState — with icon, no action">
        <EmptyState
          icon={<MenuBookIcon />}
          title="No evidence captured yet"
          description="Snap a photo or jot a note and it’ll show up here."
        />
      </SectionCard>

      <SectionCard title="EmptyState — title only">
        <EmptyState title="Nothing here yet" />
      </SectionCard>

      <SectionCard title="ErrorState — with retry">
        <ErrorState
          message="We couldn’t load that just now."
          error={new Error('network timeout')}
          onRetry={() => window.location.reload()}
        />
      </SectionCard>

      <SectionCard title="ErrorState — message only, no retry">
        <ErrorState message="That didn’t work — give it another go in a moment." />
      </SectionCard>

      <SectionCard title="ErrorState — default copy">
        <ErrorState />
      </SectionCard>
    </Page>
  )
}
