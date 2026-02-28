// src/pages/Dashboard.jsx
import PageWrapper from '../components/layout/PageWrapper'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { profile, user } = useAuth()
  const displayName = profile?.displayName || user?.displayName || 'Athlete'
  const firstName = displayName.split(' ')[0]

  return (
    <PageWrapper showSettings>
      <div className="px-4 pt-2 space-y-4">

        {/* Greeting */}
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">
            Hey, {firstName} 👋
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">Here's your fitness overview</p>
        </div>

        {/* Last Workout Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card">
            <p className="section-title">Last Workout</p>
            <p className="stat-number text-accent-orange">6</p>
            <p className="text-text-secondary text-xs mt-0.5">days ago</p>
          </div>
          <div className="card">
            <p className="section-title">Streak</p>
            <p className="stat-number">—</p>
            <p className="text-text-secondary text-xs mt-0.5">Start logging!</p>
          </div>
        </div>

        {/* Last Session Summary */}
        <div className="card">
          <p className="section-title">Last Session</p>
          <div className="flex items-start justify-between">
            <div className="space-y-1.5 flex-1">
              {['Incline Bench Press', 'Flat Bench Press', 'Cable Flys', 'Tricep Pushdown'].map((ex) => (
                <div key={ex} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                  <span className="text-text-primary text-sm">{ex}</span>
                </div>
              ))}
            </div>
            {/* Volume Donut Placeholder */}
            <div className="w-20 h-20 rounded-full border-4 border-accent-green/30 border-t-accent-green flex items-center justify-center flex-shrink-0 ml-4">
              <div className="text-center">
                <p className="font-display text-sm font-bold text-text-primary">20k</p>
                <p className="text-text-secondary text-[9px]">lbs vol.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Volume Chart Placeholder */}
        <div className="card">
          <p className="section-title">Total Volume Over Time</p>
          <div className="h-36 flex items-center justify-center bg-surface2/50 rounded-xl">
            <p className="text-text-secondary text-sm">Chart loads with your data</p>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="bg-surface2 rounded-xl p-3">
              <p className="text-text-secondary text-xs">Max Volume</p>
              <p className="text-text-primary font-semibold text-sm mt-0.5">— lbs</p>
            </div>
            <div className="bg-surface2 rounded-xl p-3">
              <p className="text-text-secondary text-xs">Low Volume</p>
              <p className="text-text-primary font-semibold text-sm mt-0.5">— lbs</p>
            </div>
          </div>
        </div>

        {/* Bottom placeholder cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card min-h-[80px] flex items-center justify-center">
            <p className="text-text-secondary text-xs text-center">PR Tracker<br />Coming Soon</p>
          </div>
          <div className="card min-h-[80px] flex items-center justify-center">
            <p className="text-text-secondary text-xs text-center">Next Workout<br />Coming Soon</p>
          </div>
        </div>

      </div>
    </PageWrapper>
  )
}
