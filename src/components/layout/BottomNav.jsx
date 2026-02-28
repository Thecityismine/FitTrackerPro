// src/components/layout/BottomNav.jsx
import { useLocation, useNavigate } from 'react-router-dom'
import { useTimer } from '../../context/TimerContext'

const TABS = [
  {
    path: '/routines',
    label: 'Routines',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-accent' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
      </svg>
    ),
  },
  {
    path: '/metrics',
    label: 'Body',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-accent' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    path: '/',
    label: 'Home',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-accent' : 'text-text-secondary'}`} fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    path: '/muscles',
    label: 'Muscles',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-accent' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  {
    path: '/calendar',
    label: 'Log',
    icon: (active) => (
      <svg className={`w-6 h-6 ${active ? 'text-accent' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isRunning, formatted } = useTimer()

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Timer floating badge — shown when timer is running and not on workout page */}
      {isRunning && !location.pathname.startsWith('/workout') && (
        <div className="flex justify-center mb-2">
          <div className="bg-accent-green text-white text-xs font-mono font-bold px-3 py-1 rounded-full shadow-lg animate-pulse-soft">
            ⏱ {formatted()}
          </div>
        </div>
      )}

      {/* Nav bar */}
      <div className="bg-surface border-t border-surface2 px-2">
        <div className="flex items-center justify-around">
          {TABS.map((tab) => {
            const active = isActive(tab.path)
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`flex flex-col items-center gap-0.5 py-2.5 px-3 min-w-[60px] active:scale-90 transition-transform ${
                  active ? 'opacity-100' : 'opacity-60'
                }`}
              >
                {tab.icon(active)}
                <span className={`text-[10px] font-medium ${active ? 'text-accent' : 'text-text-secondary'}`}>
                  {tab.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
