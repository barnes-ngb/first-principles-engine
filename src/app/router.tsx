import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import EnginePage from '../features/engine/EnginePage'
import KidsPage from '../features/kids/KidsPage'
import EvaluationsPage from '../features/records/EvaluationsPage'
import PortfolioPage from '../features/records/PortfolioPage'
import RecordsPage from '../features/records/RecordsPage'
import SettingsPage from '../features/settings/SettingsPage'
import TodayPage from '../features/today/TodayPage'
import LabModePage from '../features/week/LabModePage'
import WeekPage from '../features/week/WeekPage'

const routes = [
  {
    element: (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: '/today', element: <TodayPage /> },
      { path: '/week', element: <WeekPage /> },
      { path: '/week/lab', element: <LabModePage /> },
      { path: '/engine', element: <EnginePage /> },
      { path: '/kids', element: <KidsPage /> },
      { path: '/records', element: <RecordsPage /> },
      { path: '/records/evaluations', element: <EvaluationsPage /> },
      { path: '/records/portfolio', element: <PortfolioPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]

const router = createBrowserRouter(routes)

export function AppRouter() {
  return <RouterProvider router={router} />
}
