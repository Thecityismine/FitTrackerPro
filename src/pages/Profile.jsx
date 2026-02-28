// src/pages/Profile.jsx
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Profile() {
  const { user, profile, logout } = useAuth()
  const navigate = useNavigate()

  const displayName = profile?.displayName || user?.displayName || 'Athlete'
  const email = user?.email || ''

  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  async function handleLogout() {
    await logout()
  }

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center active:scale-95 transition-transform"
        >
          <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="font-display text-xl font-bold text-text-primary">Profile</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">

        {/* Avatar + Name */}
        <div className="card flex items-center gap-4">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-16 h-16 rounded-2xl object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
              <span className="text-white text-2xl font-bold font-display">{initials}</span>
            </div>
          )}
          <div>
            <h2 className="font-display font-bold text-text-primary text-lg">{displayName}</h2>
            <p className="text-text-secondary text-sm">{email}</p>
          </div>
        </div>

        {/* Profile Settings */}
        <div>
          <p className="section-title">Preferences</p>
          <div className="card space-y-3">
            <div>
              <label className="label">Height</label>
              <input
                type="text"
                className="input"
                placeholder='e.g. 70 (inches) or 177 (cm)'
                defaultValue={profile?.heightIn || ''}
              />
            </div>
            <div>
              <label className="label">Weight Unit</label>
              <div className="flex gap-2">
                {['lbs', 'kg'].map((u) => (
                  <button
                    key={u}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                      (profile?.weightUnit || 'lbs') === u
                        ? 'bg-accent border-accent text-white'
                        : 'bg-surface2 border-surface2 text-text-secondary'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Family Members placeholder */}
        <div>
          <p className="section-title">Family Members</p>
          <div className="card text-center py-6">
            <p className="text-text-secondary text-sm">Multi-profile support coming soon</p>
            <p className="text-text-secondary text-xs mt-1">Each family member signs in with their own account</p>
          </div>
        </div>

        {/* Sign Out */}
        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-xl border border-red-500/30 text-accent-red font-semibold text-sm active:scale-95 transition-transform"
        >
          Sign Out
        </button>

      </div>
    </div>
  )
}
