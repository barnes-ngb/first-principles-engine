import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

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
  return (
    <div className="app-shell">
      <aside className="app-shell__nav">
        <h2>Planner</h2>
        <nav>
          <ul>
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="app-shell__content">{children}</main>
    </div>
  )
}
