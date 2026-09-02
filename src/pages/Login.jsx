// src/pages/Login.jsx
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signInWithGoogle, signInWithApple, signInWithEmail, signUpWithEmail, resetPassword } = useAuth()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')

  async function handleGoogle() {
    setError('')
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch (e) {
      const messages = {
        'auth/popup-closed-by-user': 'Sign-in was canceled before it finished.',
        'auth/network-request-failed': 'Connection lost. Check your internet and try again.',
        'auth/too-many-requests': 'Too many attempts right now. Wait a moment and try again.',
      }
      setError(messages[e.code] || 'Could not sign in with Google right now. Please try again.')
    }
    setLoading(false)
  }

  async function handleApple() {
    setError('')
    setLoading(true)
    try {
      await signInWithApple()
    } catch (e) {
      const messages = {
        'auth/popup-closed-by-user': 'Sign-in was canceled before it finished.',
        'auth/network-request-failed': 'Connection lost. Check your internet and try again.',
        'auth/too-many-requests': 'Too many attempts right now. Wait a moment and try again.',
        'auth/operation-not-allowed': 'Sign in with Apple is not enabled yet. Try another sign-in method.',
      }
      setError(messages[e.code] || 'Could not sign in with Apple right now. Please try again.')
    }
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email, password, name)
      } else {
        await signInWithEmail(email, password)
      }
    } catch (e) {
      const messages = {
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/invalid-credential': 'Incorrect email or password.',
        'auth/email-already-in-use': 'An account already exists with this email.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/network-request-failed': 'Connection lost. Check your internet and try again.',
        'auth/too-many-requests': 'Too many attempts right now. Wait a moment and try again.',
      }
      setError(messages[e.code] || 'Could not complete sign-in right now. Please try again.')
    }
    setLoading(false)
  }

  async function handleForgotPassword() {
    setError('')
    setResetMessage('')
    if (!email) {
      setError('Enter your email above first, then tap "Forgot password?"')
      return
    }
    setResetLoading(true)
    try {
      await resetPassword(email)
      setResetMessage('Password reset email sent. Check your inbox.')
    } catch (e) {
      const messages = {
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/network-request-failed': 'Connection lost. Check your internet and try again.',
        'auth/too-many-requests': 'Too many attempts right now. Wait a moment and try again.',
      }
      setError(messages[e.code] || 'Could not send reset email. Please try again.')
    }
    setResetLoading(false)
  }

  return (
    <div className="min-h-dvh bg-bg flex flex-col items-center justify-center px-6 py-12">
      {/* Logo / Brand */}
      <div className="mb-10 text-center">
        <div className="w-20 h-20 mx-auto mb-4">
          <img src="/Logo.png" alt="FitTrack Pro" className="w-full h-full object-contain" />
        </div>
        <h1 className="font-display text-3xl font-bold text-text-primary tracking-tight">FitTrack Pro</h1>
        <p className="text-text-secondary text-sm mt-1">Your personal performance tracking system</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm">
        {/* Tab toggle */}
        <div className="flex bg-surface rounded-xl p-1 mb-6 border border-surface2">
          <button
            onClick={() => { setMode('signin'); setError(''); setResetMessage('') }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'signin' ? 'bg-accent text-white shadow' : 'text-text-secondary'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode('signup'); setError(''); setResetMessage('') }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'signup' ? 'bg-accent text-white shadow' : 'text-text-secondary'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Apple Sign In */}
        <button
          onClick={handleApple}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-black border border-black rounded-xl py-3 px-4 text-white font-medium mb-3 active:scale-95 transition-transform"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 12.536c-.03-2.79 2.28-4.132 2.383-4.198-1.298-1.897-3.318-2.158-4.037-2.188-1.718-.174-3.354 1.012-4.225 1.012-.87 0-2.217-.988-3.646-.96-1.877.028-3.607 1.09-4.573 2.77-1.95 3.378-.499 8.385 1.4 11.13.93 1.343 2.037 2.85 3.49 2.796 1.4-.056 1.93-.906 3.622-.906 1.69 0 2.17.906 3.646.878 1.508-.028 2.463-1.37 3.386-2.716 1.067-1.558 1.507-3.066 1.53-3.143-.033-.015-2.937-1.128-2.967-4.475h-.009zM14.35 4.284c.772-.936 1.293-2.238 1.15-3.534-1.112.045-2.457.741-3.256 1.677-.716.828-1.343 2.152-1.174 3.42 1.238.096 2.507-.628 3.28-1.563z"/>
          </svg>
          Continue with Apple
        </button>

        {/* Google Sign In */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-surface border border-surface2 rounded-xl py-3 px-4 text-text-primary font-medium mb-4 active:scale-95 transition-transform"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-surface2" />
          <span className="text-text-secondary text-xs">or</span>
          <div className="flex-1 h-px bg-surface2" />
        </div>

        {/* Email Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <div>
              <label className="label">Name</label>
              <input
                type="text"
                className="input"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            {mode === 'signin' && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetLoading}
                className="text-accent text-xs font-medium mt-2"
              >
                {resetLoading ? 'Sending...' : 'Forgot password?'}
              </button>
            )}
          </div>

          {resetMessage && (
            <div className="bg-accent-green/10 border border-accent-green/30 rounded-xl px-4 py-3">
              <p className="text-accent-green text-sm">{resetMessage}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <p className="text-accent-red text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-2"
          >
            {loading ? (
              <span className="animate-pulse">{mode === 'signin' ? 'Signing In...' : 'Creating Account...'}</span>
            ) : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-text-secondary text-xs mt-6">
          By continuing, you agree to use this app for personal fitness tracking.
        </p>
      </div>
    </div>
  )
}
