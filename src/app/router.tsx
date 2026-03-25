import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import RequireParent from '../components/RequireParent'
import EvaluateChatPage from '../features/evaluate/EvaluateChatPage'
import NotFoundPage from '../features/not-found/NotFoundPage'
import PlannerChatPage from '../features/planner-chat/PlannerChatPage'
import ProgressPage from '../features/progress/ProgressPage'
import EvaluationsPage from '../features/records/EvaluationsPage'
import PortfolioPage from '../features/records/PortfolioPage'
import RecordsPage from '../features/records/RecordsPage'
import SettingsPage from '../features/settings/SettingsPage'
import TodayPage from '../features/today/TodayPage'
import DadLabPage from '../features/dad-lab/DadLabPage'
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
import LaddersPage from '../features/ladders/LaddersPage'

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
      { path: '/dad-lab', element: <DadLabPage /> },
      { path: '/week/lab', element: <Navigate to="/dad-lab" replace /> },
      { path: '/progress', element: <ProgressPage /> },
      {
        element: <RequireParent />,
        children: [
          { path: '/weekly-review', element: <WeeklyReviewPage /> },
        ],
      },
      { path: '/planner/chat', element: <PlannerChatPage /> },
      { path: '/planner/legacy', element: <Navigate to="/planner/chat" replace /> },
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
      { path: '/ladders', element: <LaddersPage /> },
      { path: '/evaluation', element: <Navigate to="/progress" replace /> },
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
