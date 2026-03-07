// src/App.jsx
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { TimerProvider } from './context/TimerContext'

// If a lazy chunk fails to load (stale URL after a new deploy), reload the page
// so the SW serves fresh assets instead of showing a blank screen.
function lazyWithReload(factory) {
  return lazy(() =>
    factory().catch(() => {
      window.location.reload()
      return new Promise(() => {})
    })
  )
}

const Login       = lazyWithReload(() => import('./pages/Login'))
const Setup       = lazyWithReload(() => import('./pages/Setup'))
const Dashboard   = lazyWithReload(() => import('./pages/Dashboard'))
const Routines    = lazyWithReload(() => import('./pages/Routines'))
const BodyMetrics = lazyWithReload(() => import('./pages/BodyMetrics'))
const Muscles     = lazyWithReload(() => import('./pages/Muscles'))
const CalendarLog = lazyWithReload(() => import('./pages/CalendarLog'))
const WorkoutPage = lazyWithReload(() => import('./pages/WorkoutPage'))
const Profile     = lazyWithReload(() => import('./pages/Profile'))
const ImportPage  = lazyWithReload(() => import('./pages/ImportPage'))

function PageLoader() {
  return (
    <div className="min-h-dvh bg-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-text-secondary text-sm">Loading…</p>
      </div>
    </div>
  )
}

// Route guard — redirects to login if not authenticated, to /setup if onboarding not done
function ProtectedRoute({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  if (profile?.setupComplete === false) return <Navigate to="/setup" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Suspense key={user?.uid ?? 'anon'} fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/setup" element={!user ? <Navigate to="/login" replace /> : <Setup />} />

        {/* Protected */}
        <Route path="/"           element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/routines"   element={<ProtectedRoute><Routines /></ProtectedRoute>} />
        <Route path="/metrics"    element={<ProtectedRoute><BodyMetrics /></ProtectedRoute>} />
        <Route path="/muscles"    element={<ProtectedRoute><Muscles /></ProtectedRoute>} />
        <Route path="/muscles/:groupId" element={<ProtectedRoute><Muscles /></ProtectedRoute>} />
        <Route path="/calendar"   element={<ProtectedRoute><CalendarLog /></ProtectedRoute>} />
        <Route path="/workout/:exerciseId" element={<ProtectedRoute><WorkoutPage /></ProtectedRoute>} />
        <Route path="/profile"    element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/import"     element={<ProtectedRoute><ImportPage /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TimerProvider>
          <AppRoutes />
        </TimerProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
