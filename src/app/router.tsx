import { createBrowserRouter } from 'react-router-dom'
import EnginePage from '../features/engine/EnginePage'
import KidsPage from '../features/kids/KidsPage'
import RecordsPage from '../features/records/RecordsPage'
import SettingsPage from '../features/settings/SettingsPage'
import TodayPage from '../features/today/TodayPage'
import WeekPage from '../features/week/WeekPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <TodayPage />,
  },
  {
    path: '/week',
    element: <WeekPage />,
  },
  {
    path: '/engine',
    element: <EnginePage />,
  },
  {
    path: '/kids',
    element: <KidsPage />,
  },
  {
    path: '/records',
    element: <RecordsPage />,
  },
  {
    path: '/settings',
    element: <SettingsPage />,
  },
])
