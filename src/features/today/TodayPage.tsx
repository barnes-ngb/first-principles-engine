import { createDefaultDayLog } from './daylog.model'

export default function TodayPage() {
  const todayDate = new Date().toISOString().split('T')[0]
  const dayLogForToday = undefined
  const dayLog = dayLogForToday ?? createDefaultDayLog(todayDate)

  return (
    <section>
      <h1>Today</h1>
      <p>{dayLog.blocks.length} blocks ready.</p>
    </section>
  )
}
