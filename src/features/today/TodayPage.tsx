import Typography from '@mui/material/Typography'

import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import { createDefaultDayLog } from './daylog.model'

export default function TodayPage() {
  const today = new Date().toISOString().slice(0, 10)
  const todayLog = undefined
  const dayLog = todayLog ?? createDefaultDayLog(today)

  return (
    <Page>
      <SectionCard title={`DayLog (${dayLog.date})`}>
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
