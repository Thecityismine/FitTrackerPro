// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { TimerProvider } from './context/TimerContext'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Routines from './pages/Routines'
import BodyMetrics from './pages/BodyMetrics'
import Muscles from './pages/Muscles'
import CalendarLog from './pages/CalendarLog'
import WorkoutPage from './pages/WorkoutPage'
import Profile from './pages/Profile'

// Route guard — redirects to login if not authenticated
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-dvh bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      {/* Protected */}
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/routines" element={<ProtectedRoute><Routines /></ProtectedRoute>} />
      <Route path="/metrics" element={<ProtectedRoute><BodyMetrics /></ProtectedRoute>} />
      <Route path="/muscles" element={<ProtectedRoute><Muscles /></ProtectedRoute>} />
      <Route path="/muscles/:groupId" element={<ProtectedRoute><Muscles /></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><CalendarLog /></ProtectedRoute>} />
      <Route path="/workout/:exerciseId" element={<ProtectedRoute><WorkoutPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
