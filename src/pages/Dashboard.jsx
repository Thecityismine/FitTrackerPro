// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getDocs } from 'firebase/firestore'
import { differenceInDays, parseISO, startOfWeek, endOfWeek, format } from 'date-fns'
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import PageWrapper from '../components/layout/PageWrapper'
import HexRing from '../components/HexRing'
import { useAuth } from '../context/AuthContext'
import { sessionsCol } from '../firebase/collections'

const TODAY = format(new Date(), 'yyyy-MM-dd')

// ─── Body part normalization ────────────────────────────────
const BODY_PARTS = [
  { key: 'Abs',       match: ['abs', 'core', 'abdominal', 'crunch', 'plank', 'situp', 'sit-up'] },
  { key: 'Arms',      match: ['arms', 'bicep', 'biceps', 'forearm', 'forearms', 'curl'] },
  { key: 'Triceps',   match: ['triceps', 'tricep', 'pushdown', 'push-down', 'skull'] },
  { key: 'Shoulders', match: ['shoulders', 'shoulder', 'delt', 'delts'] },
  { key: 'Back',      match: ['back', 'lats', 'lat', 'rhomboid', 'trap', 'traps', 'rear', 'row', 'rows', 'pulldown', 'pull-down', 'chin', 'deadlift'] },
  { key: 'Legs',      match: ['legs', 'leg', 'quad', 'quads', 'hamstring', 'hamstrings', 'calf', 'calves', 'calve', 'lunge', 'squat'] },
  { key: 'Glutes',    match: ['glutes', 'glute', 'gluts', 'hip', 'hips', 'butt', 'gluteal'] },
  { key: 'Cardio',    match: ['cardio', 'walking', 'walk', 'run', 'running', 'bike', 'elliptical', 'swim', 'rowing', 'treadmill', 'fitness bike'] },
]

// Use word-boundary regex so short keywords like "ab" don't falsely match
// words like "cable". e.g. /\bab/ won't match "cable" but will match "abs".
function getBodyPart(muscleGroup, exerciseName) {
  const searchStr = `${muscleGroup || ''} ${exerciseName || ''}`.toLowerCase()
  for (const bp of BODY_PARTS) {
    if (bp.match.some((k) => new RegExp(`\\b${k}`).test(searchStr))) return bp.key
  }
  return null
}

// ─── PPL weekly sets (for Dashboard card) ───────────────────
const PPL_DASH = [
  { id: 'push', label: 'Push', color: '#8B7332', targetTotal: 27,
    muscles: [{ id: 'chest' }, { id: 'shoulders' }, { id: 'triceps' }] },
  { id: 'pull', label: 'Pull', color: '#8B1A2B', targetTotal: 15,
    muscles: [{ id: 'back' }, { id: 'biceps' }] },
  { id: 'legs', label: 'Legs', color: '#1F4D3A', targetTotal: 21,
    muscles: [{ id: 'quads' }, { id: 'hamstrings' }, { id: 'glutes' }] },
]
const PPL_TOTAL = 63

const PPL_MAP_DASH = {
  chest: 'push/chest', pec: 'push/chest', pecs: 'push/chest', bench: 'push/chest',
  shoulder: 'push/shoulders', shoulders: 'push/shoulders', delt: 'push/shoulders', delts: 'push/shoulders',
  tricep: 'push/triceps', triceps: 'push/triceps',
  back: 'pull/back', lats: 'pull/back', lat: 'pull/back', rhomboid: 'pull/back',
  traps: 'pull/back', trap: 'pull/back',
  bicep: 'pull/biceps', biceps: 'pull/biceps', arms: 'pull/biceps', forearm: 'pull/biceps', forearms: 'pull/biceps',
  legs: 'legs/quads', leg: 'legs/quads', quads: 'legs/quads', quad: 'legs/quads',
  squat: 'legs/quads', hamstrings: 'legs/hamstrings', hamstring: 'legs/hamstrings',
  glutes: 'legs/glutes', glute: 'legs/glutes', hip: 'legs/glutes',
}
const EX_KW_DASH = [
  [/\brow\b/, 'pull/back'], [/\bpulldown\b/, 'pull/back'], [/\bchin\b/, 'pull/back'],
  [/\bdeadlift\b/, 'pull/back'], [/\bcurl\b/, 'pull/biceps'],
  [/\bpushdown\b/, 'push/triceps'], [/\bskull\b/, 'push/triceps'],
  [/\blunge\b/, 'legs/quads'], [/\bleg press\b/, 'legs/quads'],
  [/\bhip thrust\b/, 'legs/glutes'], [/\bglute bridge\b/, 'legs/glutes'],
]
function getPplCat(muscleGroup, exerciseName) {
  const mg = (muscleGroup || '').trim().toLowerCase()
  if (PPL_MAP_DASH[mg]) return PPL_MAP_DASH[mg]
  const search = `${mg} ${(exerciseName || '').toLowerCase()}`
  for (const [re, val] of EX_KW_DASH) if (re.test(search)) return val
  for (const [key, val] of Object.entries(PPL_MAP_DASH)) {
    if (new RegExp(`\\b${key}\\b`).test(search)) return val
  }
  return null
}
function computeDashSets(weekSessions) {
  const counts = { push: { chest: 0, shoulders: 0, triceps: 0 }, pull: { back: 0, biceps: 0 }, legs: { quads: 0, hamstrings: 0, glutes: 0 } }
  for (const s of weekSessions) {
    const cat = getPplCat(s.muscleGroup, s.exerciseName)
    if (!cat) continue
    const [gId, mId] = cat.split('/')
    counts[gId][mId] = (counts[gId][mId] || 0) + (s.sets || []).length
  }
  return counts
}

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
  const location = useLocation()

  const displayName = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Athlete'
  const firstName = displayName.split(' ')[0]

  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [chartPeriod, setChartPeriod] = useState('weekly')

  // Refetch on every navigation to this page so deletions are reflected immediately
  useEffect(() => {
    if (!user?.uid) return
    setLoading(true)
    user.getIdToken().then(() => getDocs(sessionsCol(user.uid)))
      .then((snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        setSessions(sorted)
        setLoading(false)
      })
      .catch((err) => {
        setLoadError(err?.message || 'Unknown error')
        setLoading(false)
      })
  }, [user?.uid, location.key])

  // ── Derived stats ──────────────────────────────────────────
  // Only count sessions that have at least one set logged
  const activeSessions = sessions.filter((s) => (s.sets?.length ?? 0) > 0)
  const uniqueDates = [...new Set(activeSessions.map((s) => s.date))].sort()

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

  // Weekly volume map — used for chart + this-week stats
  const weeklyMap = {}
  activeSessions.forEach((s) => {
    if (!s.date) return
    const weekKey = format(startOfWeek(parseISO(s.date), { weekStartsOn: 0 }), 'yyyy-MM-dd')
    weeklyMap[weekKey] = (weeklyMap[weekKey] || 0) + (s.totalVolume || 0)
  })
  const thisWeekKey = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd')
  const thisWeekVol = weeklyMap[thisWeekKey] || 0

  // Monthly volume map
  const monthlyMap = {}
  activeSessions.forEach((s) => {
    if (!s.date) return
    const monthKey = s.date.slice(0, 7) // 'yyyy-MM'
    monthlyMap[monthKey] = (monthlyMap[monthKey] || 0) + (s.totalVolume || 0)
  })

  const chartData = (() => {
    if (chartPeriod === 'weekly') {
      return Object.entries(weeklyMap)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .slice(-8)
        .map(([key, vol]) => ({ week: key.slice(5).replace('-', '/'), vol }))
    }
    if (chartPeriod === 'monthly') {
      return Object.entries(monthlyMap)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .slice(-6)
        .map(([key, vol]) => ({ week: key.slice(5), vol })) // 'MM' label
    }
    // all
    return Object.entries(monthlyMap)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, vol]) => ({ week: key.slice(5), vol }))
  })()

  const maxVol = chartData.length ? Math.max(...chartData.map((d) => d.vol)) : 0

  // Weekly Set Targets (PPL)
  const weekEndStr = format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd')
  const thisWeekSessions = activeSessions.filter(s => s.date >= thisWeekKey && s.date <= weekEndStr)
  const weekSets = computeDashSets(thisWeekSessions)
  const weekTotal = PPL_DASH.reduce((s, g) =>
    s + g.muscles.reduce((ms, m) => ms + (weekSets[g.id]?.[m.id] || 0), 0), 0)
  const weekPct = Math.min(weekTotal / PPL_TOTAL, 1)

  // Last session exercises (most recent date's unique exercises, with actual sets)
  const lastSessions = lastDate ? activeSessions.filter((s) => s.date === lastDate) : []
  const lastExercises = lastSessions.map((s) => s.exerciseName).filter(Boolean)

  // Body parts worked in last session
  const workedParts = new Set(
    lastSessions.map((s) => getBodyPart(s.muscleGroup, s.exerciseName)).filter(Boolean)
  )

  const totalSessions = activeSessions.length

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
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <p className="section-title mb-0">Last Session</p>
              <p className="text-text-secondary text-xs">{lastDate?.slice(5).replace('-', '/')}</p>
            </div>

            {/* Exercise list + volume ring bottom-aligned */}
            <div className="flex items-end gap-3">
              <div className="flex-1 min-w-0 space-y-1.5">
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

              {/* Volume ring — bottom-right */}
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="10" className="text-accent-green/15" />
                  <circle
                    cx="60" cy="60" r="50" fill="none"
                    stroke="currentColor" strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.min((thisWeekVol / (maxVol || 1)) * 314, 314)} 314`}
                    className="text-accent-green transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="font-display text-base font-bold text-text-primary leading-tight">
                    {thisWeekVol >= 1000 ? `${Math.round(thisWeekVol / 1000)}k` : thisWeekVol || '—'}
                  </p>
                  <p className="text-text-secondary text-[9px]">lbs/week</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Body Zones */}
        {!loading && lastSessions.length > 0 && (
          <div className="card">
            <p className="section-title mb-3">Body Zones · Last Session</p>
            <div className="grid grid-cols-4 gap-2">
              {BODY_PARTS.map((bp) => {
                const hit = workedParts.has(bp.key)
                return (
                  <div
                    key={bp.key}
                    className={`rounded-xl py-3 flex flex-col items-center gap-1.5 transition-colors ${
                      hit ? 'bg-accent-green/15 border border-accent-green/25' : 'bg-surface2'
                    }`}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full ${hit ? 'bg-accent-green' : 'bg-border'}`} />
                    <p className={`text-[11px] font-semibold leading-none ${hit ? 'text-accent-green' : 'text-text-secondary'}`}>
                      {bp.key}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Weekly Set Targets card */}
        {!loading && (
          <button
            onClick={() => navigate('/muscles')}
            className="card w-full text-left active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-4">
              {/* Hex ring */}
              <div className="relative flex-shrink-0">
                <HexRing
                  segments={PPL_DASH.map(g => ({
                    pct: Math.min(
                      g.muscles.reduce((s, m) => s + (weekSets[g.id]?.[m.id] || 0), 0) / g.targetTotal,
                      1
                    ),
                    color: g.color,
                  }))}
                  size={80}
                  strokeWidth={8}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="font-display text-base font-bold text-text-primary leading-none">
                    {Math.round(weekPct * 100)}%
                  </p>
                </div>
              </div>

              {/* PPL rows */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="section-title mb-0">Weekly Set Targets</p>
                  <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <div className="space-y-1">
                  {PPL_DASH.map(g => {
                    const actual = g.muscles.reduce((s, m) => s + (weekSets[g.id]?.[m.id] || 0), 0)
                    const done = actual >= g.targetTotal
                    return (
                      <div key={g.id} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: g.color }} />
                        <p className="text-text-secondary text-xs w-8">{g.label}</p>
                        <div className="flex-1 h-1.5 bg-surface2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(actual / g.targetTotal, 1) * 100}%`, backgroundColor: g.color }}
                          />
                        </div>
                        <p className={`text-xs font-mono flex-shrink-0 ${done ? 'text-accent-green font-bold' : 'text-text-secondary'}`}>
                          {actual}/{g.targetTotal}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </button>
        )}

        {/* Weekly Volume Chart */}
        <div className="card pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title mb-0">Volume</p>
            <div className="flex items-center gap-1 bg-surface2 rounded-lg p-0.5">
              {['weekly', 'monthly', 'all'].map((p) => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    chartPeriod === p ? 'bg-accent text-white' : 'text-text-secondary'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {totalSessions > 0 && (
            <p className="text-text-secondary text-xs mb-2">{totalSessions} sessions total</p>
          )}
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


      </div>
    </PageWrapper>
  )
}
