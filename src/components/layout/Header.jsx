// src/components/layout/Header.jsx
import { useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Header({ showSettings = false }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const today = format(new Date(), 'EEE, MMM d')
  const [showQr, setShowQr] = useState(false)

  const photoURL = profile?.photoURL || user?.photoURL
  const initials = (profile?.displayName || user?.displayName || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <>
      <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
        {/* Date */}
        <span className="text-text-secondary text-sm font-medium">{today}</span>

        {/* Right side: QR icon (optional) + Profile avatar */}
        <div className="flex items-center gap-2">
          {showSettings && (
            <button
              onClick={() => setShowQr(true)}
              className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center active:scale-95 transition-transform"
              title="Gym QR Code"
            >
              {/* QR code icon */}
              <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75V16.5zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 18.75h.75v.75h-.75v-.75zM18.75 13.5h.75v.75h-.75v-.75zM18.75 18.75h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75V16.5z" />
              </svg>
            </button>
          )}

          {/* Profile avatar */}
          <button onClick={() => navigate('/profile')} className="active:scale-95 transition-transform">
            {photoURL ? (
              <img src={photoURL} alt="Profile" className="w-9 h-9 rounded-full object-cover border-2 border-accent" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center border-2 border-accent/50">
                <span className="text-white text-xs font-bold font-display">{initials}</span>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* ── Gym QR Modal ─────────────────────────────────────── */}
      {showQr && (
        <div
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/75"
          onClick={() => setShowQr(false)}
        >
          <div
            className="bg-surface rounded-3xl p-6 mx-6 w-full max-w-sm flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-bold text-text-primary">Gym QR Code</p>

            {profile?.gymQrUrl ? (
              <div className="bg-white rounded-2xl p-4 w-full flex items-center justify-center">
                <img
                  src={profile.gymQrUrl}
                  alt="Gym QR Code"
                  className="w-56 h-56 object-contain"
                />
              </div>
            ) : (
              <div className="w-full flex flex-col items-center gap-3 bg-surface2 rounded-2xl py-10 px-4">
                <svg className="w-12 h-12 text-text-secondary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75V16.5zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 18.75h.75v.75h-.75v-.75zM18.75 13.5h.75v.75h-.75v-.75zM18.75 18.75h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75V16.5z" />
                </svg>
                <p className="text-text-secondary text-sm text-center">No QR code uploaded yet</p>
                <button
                  onClick={() => { setShowQr(false); navigate('/profile') }}
                  className="btn-primary text-sm px-5 py-2"
                >
                  Upload in Profile
                </button>
              </div>
            )}

            <button
              onClick={() => setShowQr(false)}
              className="text-text-secondary text-sm py-1 px-4"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  )
}
