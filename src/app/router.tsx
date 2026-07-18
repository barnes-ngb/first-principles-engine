import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import RequireParent from '../components/RequireParent'
import EvaluateChatPage from '../features/evaluate/EvaluateChatPage'
import NotFoundPage from '../features/not-found/NotFoundPage'
import PlannerChatPage from '../features/planner-chat/PlannerChatPage'
import ProgressPage from '../features/progress/ProgressPage'
import PortfolioPage from '../features/records/PortfolioPage'
import RecordsPage from '../features/records/RecordsPage'
import SettingsPage from '../features/settings/SettingsPage'
import TodayPage from '../features/today/TodayPage'
import DadLabPage from '../features/dad-lab/DadLabPage'
import KnowledgeMinePage from '../features/quest/KnowledgeMinePage'
import RequireKnowledgeMineAccess from '../features/quest/RequireKnowledgeMineAccess'
import QuestErrorBoundary from '../features/quest/QuestErrorBoundary'
import WeeklyReviewPage from '../features/weekly-review/WeeklyReviewPage'
import BookshelfPage from '../features/books/BookshelfPage'
import BookEditorPage from '../features/books/BookEditorPage'
import BookReaderPage from '../features/books/BookReaderPage'
import BookReviewChat from '../features/books/BookReviewChat'
import CreateSightWordBook from '../features/books/CreateSightWordBook'
import SightWordDashboard from '../features/books/SightWordDashboard'
import StoryGuidePage from '../features/books/StoryGuidePage'
import StickersPage from '../features/books/StickersPage'
import MyAvatarPage from '../features/avatar/MyAvatarPage'
import WorkshopPage from '../features/workshop/WorkshopPage'
import ShellyChatPage from '../features/shelly-chat/ShellyChatPage'
import MonthlyReviewReaderPage from '../features/monthly-review/MonthlyReviewReaderPage'
import KidBooksAboutMePage from '../features/monthly-review/KidBooksAboutMePage'
import KidBookReaderPage from '../features/monthly-review/KidBookReaderPage'
import UiPreviewPage from '../features/ui-preview/UiPreviewPage'
import BusinessPage from '../features/business/BusinessPage'

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
      { path: '/progress/monthly-books/:reviewId', element: <MonthlyReviewReaderPage /> },
      { path: '/books-about-me', element: <KidBooksAboutMePage /> },
      { path: '/books-about-me/:reviewId', element: <KidBookReaderPage /> },
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
      { path: '/stickers', element: <StickersPage /> },
      { path: '/books/:bookId', element: <BookEditorPage /> },
      { path: '/books/:bookId/read', element: <BookReaderPage /> },
      { path: '/books/:bookId/review', element: <BookReviewChat /> },
      {
        path: '/quest',
        element: (
          <RequireKnowledgeMineAccess>
            <KnowledgeMinePage />
          </RequireKnowledgeMineAccess>
        ),
        errorElement: <QuestErrorBoundary />,
      },
      { path: '/avatar', element: <MyAvatarPage /> },
      { path: '/hero', element: <Navigate to="/avatar" replace /> },
      { path: '/armor', element: <Navigate to="/avatar" replace /> },
      { path: '/workshop', element: <WorkshopPage /> },
      { path: '/business', element: <BusinessPage /> },
      { path: '/ladders', element: <Navigate to="/progress" replace /> },
      { path: '/evaluation', element: <Navigate to="/progress" replace /> },
      { path: '/records', element: <RecordsPage /> },
      { path: '/records/portfolio', element: <PortfolioPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/chat', element: <ShellyChatPage /> },
      // Unlinked preview gallery for shared state components (UI Batch 3a).
      // Not surfaced in any nav; reachable only by direct URL.
      { path: '/ui-preview', element: <UiPreviewPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

const router = createBrowserRouter(routes)

export function AppRouter() {
  return <RouterProvider router={router} />
}
