import Typography from '@mui/material/Typography'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'

export default function TodayPage() {
  return (
    <Page>
      <SectionCard title="DayLog">
        <Typography color="text.secondary">
          Use the editor below to capture today&apos;s highlights and reflections.
        </Typography>
      </SectionCard>
      <SectionCard title="Capture Artifact">
        <Typography color="text.secondary">
          Upload or link supporting artifacts from today&apos;s work.
        </Typography>
      </SectionCard>
    </Page>
  )
}
