import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import RequireParent from '../components/RequireParent'
import EnginePage from '../features/engine/EnginePage'
import EvaluateChatPage from '../features/evaluate/EvaluateChatPage'
import KidsPage from '../features/kids/KidsPage'
import LaddersPage from '../features/ladders/LaddersPage'
import NotFoundPage from '../features/not-found/NotFoundPage'
import PlannerChatPage from '../features/planner-chat/PlannerChatPage'
import PlannerPage from '../features/planner/PlannerPage'
import ProgressPage from '../features/progress/ProgressPage'
import ProjectBoardPage from '../features/projects/ProjectBoardPage'
import EvaluationsPage from '../features/records/EvaluationsPage'
import PortfolioPage from '../features/records/PortfolioPage'
import RecordsPage from '../features/records/RecordsPage'
import ScoreboardPage from '../features/scoreboard/ScoreboardPage'
import SessionRunnerPage from '../features/sessions/SessionRunnerPage'
import SettingsPage from '../features/settings/SettingsPage'
import TodayPage from '../features/today/TodayPage'
import DadLabPage from '../features/dad-lab/DadLabPage'
import WeekPage from '../features/week/WeekPage'
import KnowledgeMinePage from '../features/quest/KnowledgeMinePage'
import WeeklyReviewPage from '../features/weekly-review/WeeklyReviewPage'
import BookshelfPage from '../features/books/BookshelfPage'
import BookEditorPage from '../features/books/BookEditorPage'
import BookReaderPage from '../features/books/BookReaderPage'
import CreateSightWordBook from '../features/books/CreateSightWordBook'
import SightWordDashboard from '../features/books/SightWordDashboard'
import StoryGuidePage from '../features/books/StoryGuidePage'
import MyAvatarPage from '../features/avatar/MyAvatarPage'
import WorkshopPage from '../features/workshop/WorkshopPage'

const routes = [
  {
    element: (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: '/dashboard', element: <Navigate to="/today" replace /> },
      { path: '/planner', element: <Navigate to="/planner/chat" replace /> },
      { path: '/today', element: <TodayPage /> },
      { path: '/sessions/run', element: <SessionRunnerPage /> },
      { path: '/scoreboard', element: <ScoreboardPage /> },
      { path: '/projects', element: <ProjectBoardPage /> },
      { path: '/dad-lab', element: <DadLabPage /> },
      { path: '/week/lab', element: <Navigate to="/dad-lab" replace /> },
      { path: '/progress', element: <ProgressPage /> },
      {
        element: <RequireParent />,
        children: [
          { path: '/week', element: <WeekPage /> },
          { path: '/weekly-review', element: <WeeklyReviewPage /> },
        ],
      },
      { path: '/engine', element: <EnginePage /> },
      { path: '/planner/chat', element: <PlannerChatPage /> },
      { path: '/planner/legacy', element: <PlannerPage /> },
      { path: '/evaluate', element: <EvaluateChatPage /> },
      { path: '/books', element: <BookshelfPage /> },
      { path: '/books/story-guide', element: <StoryGuidePage /> },
      { path: '/books/create-story', element: <CreateSightWordBook /> },
      { path: '/books/sight-words', element: <SightWordDashboard /> },
      { path: '/books/:bookId', element: <BookEditorPage /> },
      { path: '/books/:bookId/read', element: <BookReaderPage /> },
      { path: '/quest', element: <KnowledgeMinePage /> },
      { path: '/avatar', element: <MyAvatarPage /> },
      { path: '/workshop', element: <WorkshopPage /> },
      { path: '/evaluation', element: <Navigate to="/progress" replace /> },
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
