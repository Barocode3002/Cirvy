import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SignupPage from '@/pages/SignupPage'
import LoginPage from '@/pages/LoginPage'
import FeedPage from '@/pages/FeedPage'
import ProtectedRoute from '@/components/ProtectedRoute'
import ProfilePage from '@/pages/ProfilePage'
import FriendRequestsPage from '@/pages/FriendRequestsPage'
import SearchPage from '@/pages/SearchPage'
import OnboardingPage from '@/pages/OnboardingPage'
import ChatPage from '@/pages/ChatPage'

// --------------------------------------------------------------------------
// App — the router shell.
//
// Route map:
//  /signup      → public  → create an account
//  /login       → public  → sign in
//  /onboarding  → private → set avatar & bio for new accounts (wrapped in ProtectedRoute)
//  /feed        → private → friends-only feed (wrapped in ProtectedRoute)
//  /friends     → private → friend requests & friends list (wrapped in ProtectedRoute)
//  /search      → private → zero-tracking user search (wrapped in ProtectedRoute)
//  /:username   → private → user profile route by username e.g. /parcomohsen (wrapped in ProtectedRoute)
//  /profile/:userId → private → backward compatible profile route (wrapped in ProtectedRoute)
//  /            → redirect to /feed (which bounces to /login or /onboarding if needed)
// --------------------------------------------------------------------------

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/feed"
          element={
            <ProtectedRoute>
              <FeedPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/friends"
          element={
            <ProtectedRoute>
              <FriendRequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/search"
          element={
            <ProtectedRoute>
              <SearchPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/:userId"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/:username"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route 
          path="/messages"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        {/* Catch-all → go to feed (ProtectedRoute will redirect if needed) */}
        <Route path="*" element={<Navigate to="/feed" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
