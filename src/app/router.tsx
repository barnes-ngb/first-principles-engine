import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './AppShell'

const routes = [
  {
    element: (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: '/today', element: <Page title="Today" /> },
      { path: '/week', element: <Page title="This Week" /> },
      { path: '/engine', element: <Page title="Engine" /> },
      { path: '/kids', element: <Page title="Kids" /> },
      { path: '/records', element: <Page title="Records" /> },
      { path: '/settings', element: <Page title="Settings" /> },
    ],
  },
]

const router = createBrowserRouter(routes)

function Page({ title }: { title: string }) {
  return (
    <section className="page">
      <h1>{title}</h1>
      <p>Content for {title.toLowerCase()} goes here.</p>
    </section>
  )
}

export function AppRouter() {
  return <RouterProvider router={router} />
}
