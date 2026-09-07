import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2 } from 'lucide-react'

// --------------------------------------------------------------------------
// ProtectedRoute — route guard that checks authentication and onboarding state.
// --------------------------------------------------------------------------

export default function ProtectedRoute({ children }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[var(--bg)] text-[var(--text-main)]">
        <Loader2 className="h-8 w-8 animate-spin text-sub" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const isOnboardingRoute = location.pathname === '/onboarding'

  // If user is not yet onboarded, redirect to /onboarding (unless already there)
  if (profile && profile.onboarded === false) {
    if (!isOnboardingRoute) {
      return <Navigate to="/onboarding" replace />
    }
  }

  // If user is already onboarded, prevent re-accessing /onboarding
  if (isOnboardingRoute && profile?.onboarded === true) {
    return <Navigate to="/feed" replace />
  }

  return children
}
