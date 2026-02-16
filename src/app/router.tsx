import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import RequireParent from '../components/RequireParent'
import EnginePage from '../features/engine/EnginePage'
import SkillSnapshotPage from '../features/evaluation/SkillSnapshotPage'
import KidsPage from '../features/kids/KidsPage'
import LaddersPage from '../features/ladders/LaddersPage'
import NotFoundPage from '../features/NotFoundPage'
import PlannerPage from '../features/planner/PlannerPage'
import ProjectBoardPage from '../features/projects/ProjectBoardPage'
import EvaluationsPage from '../features/records/EvaluationsPage'
import PortfolioPage from '../features/records/PortfolioPage'
import RecordsPage from '../features/records/RecordsPage'
import ScoreboardPage from '../features/scoreboard/ScoreboardPage'
import DashboardPage from '../features/sessions/DashboardPage'
import SessionRunnerPage from '../features/sessions/SessionRunnerPage'
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
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/sessions/run', element: <SessionRunnerPage /> },
      { path: '/scoreboard', element: <ScoreboardPage /> },
      { path: '/projects', element: <ProjectBoardPage /> },
      { path: '/today', element: <TodayPage /> },
      { path: '/week/lab', element: <LabModePage /> },
      {
        element: <RequireParent />,
        children: [
          { path: '/week', element: <WeekPage /> },
        ],
      },
      { path: '/engine', element: <EnginePage /> },
      { path: '/planner', element: <PlannerPage /> },
      { path: '/evaluation', element: <SkillSnapshotPage /> },
      { path: '/ladders', element: <LaddersPage /> },
      { path: '/kids', element: <KidsPage /> },
      { path: '/records', element: <RecordsPage /> },
      { path: '/records/evaluations', element: <EvaluationsPage /> },
      { path: '/records/portfolio', element: <PortfolioPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

const router = createBrowserRouter(routes)

export function AppRouter() {
  return <RouterProvider router={router} />
}
