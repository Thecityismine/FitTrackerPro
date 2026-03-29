// src/components/layout/Header.jsx
import { format } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Header({ headerAction = null, showProfileLink = true }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const today = format(new Date(), 'EEE, MMM d')

  const photoURL = profile?.photoURL || user?.photoURL
  const initials = (profile?.displayName || user?.displayName || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const actionLabel = headerAction?.label || 'My Plan'
  const handleActionPress = headerAction?.onClick || (() => navigate('/profile'))

  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
      <span className="text-text-secondary text-sm font-medium">{today}</span>

      <div className="flex items-center gap-2">
        {headerAction ? (
          <button
            onClick={handleActionPress}
            className="group flex items-center gap-2 rounded-full border border-white/10 bg-surface2/92 py-1 pl-1.5 pr-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)] transition-all active:scale-95"
          >
            {photoURL ? (
              <img
                src={photoURL}
                alt="Profile"
                loading="lazy"
                decoding="async"
                className="w-8 h-8 rounded-full object-cover border border-accent/45"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center border border-accent/50">
                <span className="text-white text-[10px] font-bold font-display">{initials}</span>
              </div>
            )}
            <span className="text-[12px] font-semibold tracking-[0.01em] text-text-primary">
              {actionLabel}
            </span>
            <svg
              className="w-3.5 h-3.5 text-text-secondary transition-transform group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.1}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : showProfileLink ? (
          <button onClick={() => navigate('/profile')} className="active:scale-95 transition-transform">
            {photoURL ? (
              <img src={photoURL} alt="Profile" loading="lazy" decoding="async" className="w-9 h-9 rounded-full object-cover border-2 border-accent" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center border-2 border-accent/50">
                <span className="text-white text-xs font-bold font-display">{initials}</span>
              </div>
            )}
          </button>
        ) : null}
      </div>
    </div>
  )
}
