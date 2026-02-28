// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDocs } from 'firebase/firestore'
import { differenceInDays, parseISO, startOfWeek, format } from 'date-fns'
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import PageWrapper from '../components/layout/PageWrapper'
import { useAuth } from '../context/AuthContext'
import { sessionsCol } from '../firebase/collections'

const TODAY = format(new Date(), 'yyyy-MM-dd')

// ─── Chart Tooltip ──────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-surface2 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary mb-0.5">{label}</p>
      <p className="text-accent font-bold font-mono">
        {Number(payload[0].value).toLocaleString()} lbs
      </p>
    </div>
  )
}

// ─── Stat Card ──────────────────────────────────────────────
function StatCard({ label, value, sub, valueClass = 'text-text-primary' }) {
  return (
    <div className="card">
      <p className="section-title">{label}</p>
      <p className={`stat-number ${valueClass}`}>{value}</p>
      {sub && <p className="text-text-secondary text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────
export default function Dashboard() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()

  const displayName = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Athlete'
  const firstName = displayName.split(' ')[0]

  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // Load all sessions, sort client-side (no index required)
  useEffect(() => {
    if (!user?.uid) return
    // Get a fresh ID token first to ensure Firestore has auth context,
    // then fetch sessions
    user.getIdToken().then(() => getDocs(sessionsCol(user.uid)))
      .then((snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        setSessions(sorted)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Dashboard load error:', err)
        setLoadError(err?.message || 'Unknown error')
        setLoading(false)
      })
  }, [user?.uid])

  // ── Derived stats ──────────────────────────────────────────
  const uniqueDates = [...new Set(sessions.map((s) => s.date))].sort()

  // Days since last workout
  const lastDate = uniqueDates[uniqueDates.length - 1]
  const daysSince = lastDate
    ? differenceInDays(parseISO(TODAY), parseISO(lastDate))
    : null

  // Streak — count consecutive days backwards from the most recent workout date
  let streak = 0
  if (uniqueDates.length) {
    const dateSet = new Set(uniqueDates)
    let cursor = parseISO(lastDate)
    while (dateSet.has(format(cursor, 'yyyy-MM-dd'))) {
      streak++
      cursor = new Date(cursor.getTime() - 86_400_000)
    }
  }

  // Weekly volume chart — last 8 weeks
  const weeklyMap = {}
  sessions.forEach((s) => {
    if (!s.date) return
    const weekStart = format(startOfWeek(parseISO(s.date), { weekStartsOn: 1 }), 'MM/dd')
    weeklyMap[weekStart] = (weeklyMap[weekStart] || 0) + (s.totalVolume || 0)
  })
  const chartData = Object.entries(weeklyMap)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-8)
    .map(([week, vol]) => ({ week, vol }))

  const maxVol = chartData.length ? Math.max(...chartData.map((d) => d.vol)) : 0
  const thisWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'MM/dd')
  const thisWeekVol = weeklyMap[thisWeekStart] || 0

  // Last session exercises (most recent date's unique exercises)
  const lastSessions = lastDate ? sessions.filter((s) => s.date === lastDate) : []
  const lastExercises = lastSessions.map((s) => s.exerciseName).filter(Boolean)

  const totalSessions = sessions.length

  // ── Error / Empty state ──────────────────────────────────
  if (!loading && (sessions.length === 0 || loadError)) {
    return (
      <PageWrapper showSettings>
        <div className="px-4 pt-2 space-y-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">
              Hey, {firstName} 👋
            </h1>
            <p className="text-text-secondary text-sm mt-0.5">{user?.email}</p>
          </div>

          {loadError ? (
            <div className="card border border-red-500/30 space-y-3">
              <p className="text-accent-red font-semibold text-sm">Could not load workouts</p>
              <p className="text-text-secondary text-xs font-mono break-all">{loadError}</p>
              <button
                onClick={() => window.location.reload()}
                className="btn-primary w-full"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="card flex flex-col items-center py-10 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-text-primary font-semibold">No workouts yet</p>
                <p className="text-text-secondary text-sm mt-1">Import your history or log your first workout</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => navigate('/import')} className="btn-secondary text-sm px-4 py-2">
                  Import Data
                </button>
                <button onClick={() => navigate('/routines')} className="btn-primary text-sm px-4 py-2">
                  Start Workout
                </button>
              </div>
            </div>
          )}
        </div>
      </PageWrapper>
    )
  }

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

        {/* Last Workout + Streak */}
        <div className="grid grid-cols-2 gap-3">
          {loading ? (
            <>
              <div className="card h-24 animate-pulse bg-surface2" />
              <div className="card h-24 animate-pulse bg-surface2" />
            </>
          ) : (
            <>
              <StatCard
                label="Last Workout"
                value={daysSince === 0 ? 'Today' : daysSince === 1 ? '1 day' : daysSince != null ? `${daysSince}d` : '—'}
                sub={daysSince === 0 ? 'Keep it up!' : daysSince != null ? 'ago' : 'No workouts yet'}
                valueClass={daysSince === 0 ? 'text-accent-green' : daysSince != null && daysSince > 5 ? 'text-accent-orange' : 'text-text-primary'}
              />
              <StatCard
                label="Streak"
                value={streak > 0 ? `${streak}d` : '—'}
                sub={streak > 0 ? 'consecutive days' : 'Start logging!'}
                valueClass={streak >= 7 ? 'text-accent-green' : 'text-text-primary'}
              />
            </>
          )}
        </div>

        {/* Last Session Summary */}
        {!loading && lastExercises.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="section-title mb-0">Last Session</p>
              <p className="text-text-secondary text-xs">{lastDate?.slice(5).replace('-', '/')}</p>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5 flex-1 min-w-0">
                {lastExercises.slice(0, 5).map((ex, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                    <span className="text-text-primary text-sm truncate">{ex}</span>
                  </div>
                ))}
                {lastExercises.length > 5 && (
                  <p className="text-text-secondary text-xs pl-3.5">+{lastExercises.length - 5} more</p>
                )}
              </div>
              {/* This-week volume ring */}
              <div className="flex-shrink-0 text-center">
                <div className="w-20 h-20 rounded-full border-4 border-accent-green/20 border-t-accent-green flex items-center justify-center">
                  <div>
                    <p className="font-display text-sm font-bold text-text-primary leading-tight">
                      {thisWeekVol >= 1000 ? `${Math.round(thisWeekVol / 1000)}k` : thisWeekVol || '—'}
                    </p>
                    <p className="text-text-secondary text-[9px]">this week</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Weekly Volume Chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title mb-0">Weekly Volume</p>
            {totalSessions > 0 && (
              <p className="text-text-secondary text-xs">
                {totalSessions} sessions total
              </p>
            )}
          </div>
          {loading ? (
            <div className="h-36 animate-pulse bg-surface2 rounded-xl" />
          ) : chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1A56DB" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#1A56DB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="week"
                    tick={{ fill: '#94A3B8', fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="vol"
                    stroke="#1A56DB"
                    strokeWidth={2}
                    fill="url(#dashGrad)"
                    dot={{ fill: '#1A56DB', r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 4, fill: '#1A56DB' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="bg-surface2 rounded-xl p-3">
                  <p className="text-text-secondary text-xs">Best Week</p>
                  <p className="text-text-primary font-semibold text-sm mt-0.5">
                    {maxVol >= 1000 ? `${Math.round(maxVol / 1000)}k` : maxVol.toLocaleString()} lbs
                  </p>
                </div>
                <div className="bg-surface2 rounded-xl p-3">
                  <p className="text-text-secondary text-xs">This Week</p>
                  <p className="text-accent-green font-semibold text-sm mt-0.5">
                    {thisWeekVol >= 1000 ? `${Math.round(thisWeekVol / 1000)}k` : thisWeekVol.toLocaleString()} lbs
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="h-36 flex items-center justify-center">
              <p className="text-text-secondary text-sm">No data yet</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 pb-4">
          <button
            onClick={() => navigate('/routines')}
            className="card flex items-center gap-3 active:scale-95 transition-transform text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
              </svg>
            </div>
            <div>
              <p className="text-text-primary text-sm font-semibold">Start Workout</p>
              <p className="text-text-secondary text-xs">Open routines</p>
            </div>
          </button>
          <button
            onClick={() => navigate('/calendar')}
            className="card flex items-center gap-3 active:scale-95 transition-transform text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-accent-green/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <div>
              <p className="text-text-primary text-sm font-semibold">Calendar</p>
              <p className="text-text-secondary text-xs">View history</p>
            </div>
          </button>
        </div>

      </div>
    </PageWrapper>
  )
}
