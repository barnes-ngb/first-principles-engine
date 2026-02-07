import type { Rung } from '../../core/types/domain'

import {
  canMarkAchieved,
  getActiveRungId,
  getRungStatus,
  type ProgressByRungId,
} from './ladder.logic'

export default function KidsPage() {
  const demoRungs: Rung[] = [
    { id: 'rung-1', title: 'Sound it out', order: 1 },
    { id: 'rung-2', title: 'Read with rhythm', order: 2 },
    { id: 'rung-3', title: 'Read with expression', order: 3 },
  ]

  const progressByRungId: ProgressByRungId = {
    'rung-1': { label: 'Milestone 1', achieved: true },
  }

  const activeRungId = getActiveRungId(demoRungs, progressByRungId)
  const canAchieve = canMarkAchieved([])

  return (
    <section>
      <h1>Kids</h1>
      <p>Active rung: {activeRungId ?? 'None'}</p>
      <p>Can mark achieved: {canAchieve ? 'Yes' : 'No'}</p>
      <ul>
        {demoRungs.map((rung) => (
          <li key={rung.id}>
            {rung.title} — {getRungStatus(rung, progressByRungId, activeRungId)}
          </li>
        ))}
      </ul>
    </section>
  )
}
