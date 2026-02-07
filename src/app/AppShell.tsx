import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useProfile } from '../core/profile/useProfile'
import { UserProfile } from '../core/types/enums'

const navItems = [
  { label: 'Today', to: '/today' },
  { label: 'This Week', to: '/week' },
  { label: 'Engine', to: '/engine' },
  { label: 'Kids', to: '/kids' },
  { label: 'Records', to: '/records' },
  { label: 'Evaluations', to: '/records/evaluations' },
  { label: 'Portfolio', to: '/records/portfolio' },
  { label: 'Settings', to: '/settings' },
]

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { profile } = useProfile()

  const displayName = profile
    ? profile.charAt(0).toUpperCase() + profile.slice(1)
    : 'Planner'

  const isParent = profile === UserProfile.Parents

  return (
    <div className="app-shell">
      <aside className="app-shell__nav">
        <h2>{displayName}</h2>
        <nav>
          <ul>
            {navItems.map((item) => {
              // Non-parent profiles: hide Evaluations and Portfolio
              if (!isParent && (item.to === '/records/evaluations' || item.to === '/records/portfolio')) {
                return null
              }
              return (
                <li key={item.to}>
                  <NavLink to={item.to}>{item.label}</NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>
      <main className="app-shell__content">{children}</main>
    </div>
  )
}
