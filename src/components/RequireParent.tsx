import { Navigate, Outlet } from 'react-router-dom'
import { useProfile } from '../core/profile/useProfile'

/**
 * Route guard that redirects non-parent profiles to the dashboard.
 * Wrap routes that should only be accessible by the "parents" profile.
 */
export default function RequireParent() {
  const { canEdit } = useProfile()

  if (!canEdit) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
