import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getDocs } from 'firebase/firestore'
import { differenceInDays, endOfWeek, format, parseISO, startOfWeek } from 'date-fns'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'
import PageWrapper from '../components/layout/PageWrapper'
import { useAuth } from '../context/AuthContext'
import { useActiveWorkout } from '../context/ActiveWorkoutContext'
import { sessionsCol } from '../firebase/collections'

const TODAY = format(new Date(), 'yyyy-MM-dd')

const BODY_PARTS = [
  { key: 'Abs', icon: '/icons/abs.png', match: ['abs', 'core', 'abdominal', 'crunch', 'plank', 'situp', 'sit-up'] },
  { key: 'Arms', icon: '/icons/arm.png', match: ['arms', 'bicep', 'biceps', 'forearm', 'forearms', 'curl', 'triceps', 'tricep', 'pushdown', 'push-down', 'skull', 'dips', 'dip'] },
  { key: 'Chest', icon: '/icons/chest.png', match: ['chest', 'pec', 'pecs', 'bench', 'fly', 'flye'] },
  { key: 'Shoulders', icon: '/icons/shoulder.png', match: ['shoulders', 'shoulder', 'delt', 'delts'] },
  { key: 'Back', icon: '/icons/back.png', match: ['back', 'lats', 'lat', 'rhomboid', 'trap', 'traps', 'rear', 'row', 'rows', 'pulldown', 'pull-down', 'chin', 'deadlift'] },
  { key: 'Legs', icon: '/icons/legs.png', match: ['legs', 'leg', 'quad', 'quads', 'hamstring', 'hamstrings', 'calf', 'calves', 'calve', 'lunge', 'squat'] },
  { key: 'Glutes', icon: '/icons/glutes.png', match: ['glutes', 'glute', 'gluts', 'hip', 'hips', 'butt', 'gluteal'] },
  { key: 'Cardio', icon: '/icons/cardio.png', match: ['cardio', 'walking', 'walk', 'run', 'running', 'bike', 'elliptical', 'swim', 'rowing', 'treadmill', 'fitness bike'] },
]

const MG_MAP = {
  legs: 'Legs', leg: 'Legs', quads: 'Legs', hamstrings: 'Legs', calves: 'Legs',
  arms: 'Arms', biceps: 'Arms', triceps: 'Arms', forearms: 'Arms',
  chest: 'Chest',
  shoulders: 'Shoulders', shoulder: 'Shoulders',
  back: 'Back', lats: 'Back',
  abs: 'Abs', core: 'Abs',
  glutes: 'Glutes', glute: 'Glutes',
  cardio: 'Cardio',
}

const PPL_DASH = [
  { id: 'push', label: 'Push', color: '#8B7332', targetTotal: 27, muscles: [{ id: 'chest' }, { id: 'shoulders' }, { id: 'triceps' }] },
  { id: 'pull', label: 'Pull', color: '#8B1A2B', targetTotal: 15, muscles: [{ id: 'back' }, { id: 'biceps' }] },
  { id: 'legs', label: 'Legs', color: '#22C55E', targetTotal: 21, muscles: [{ id: 'quads' }, { id: 'hamstrings' }, { id: 'glutes' }] },
]

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
  [/\brow\b/, 'pull/back'],
  [/\bpulldown\b/, 'pull/back'],
  [/\bchin\b/, 'pull/back'],
  [/\bdeadlift\b/, 'pull/back'],
  [/\bcurl\b/, 'pull/biceps'],
  [/\bpushdown\b/, 'push/triceps'],
  [/\bskull\b/, 'push/triceps'],
  [/\blunge\b/, 'legs/quads'],
  [/\bleg press\b/, 'legs/quads'],
  [/\bhip thrust\b/, 'legs/glutes'],
  [/\bglute bridge\b/, 'legs/glutes'],
]

function getBodyPart(muscleGroup, exerciseName) {
  const mgKey = (muscleGroup || '').trim().toLowerCase()
  if (MG_MAP[mgKey]) return MG_MAP[mgKey]

  const searchStr = `${muscleGroup || ''} ${exerciseName || ''}`.toLowerCase()
  for (const bp of BODY_PARTS) {
    if (bp.match.some((keyword) => new RegExp(`\\b${keyword}`).test(searchStr))) return bp.key
  }
  return null
}

function getPplCat(muscleGroup, exerciseName) {
  const mg = (muscleGroup || '').trim().toLowerCase()
  if (PPL_MAP_DASH[mg]) return PPL_MAP_DASH[mg]

  const search = `${mg} ${(exerciseName || '').toLowerCase()}`
  for (const [regex, value] of EX_KW_DASH) {
    if (regex.test(search)) return value
  }

  for (const [key, value] of Object.entries(PPL_MAP_DASH)) {
    if (new RegExp(`\\b${key}\\b`).test(search)) return value
  }

  return null
}

function computeDashSets(weekSessions) {
  const counts = {
    push: { chest: 0, shoulders: 0, triceps: 0 },
    pull: { back: 0, biceps: 0 },
    legs: { quads: 0, hamstrings: 0, glutes: 0 },
  }

  for (const session of weekSessions) {
    const cat = getPplCat(session.muscleGroup, session.exerciseName)
    if (!cat) continue
    const [groupId, muscleId] = cat.split('/')
    counts[groupId][muscleId] = (counts[groupId][muscleId] || 0) + (session.sets || []).length
  }

  return counts
}

function getTimestampMs(value) {
  if (!value) return null
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (typeof value?.seconds === 'number') return value.seconds * 1000
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function getSessionVolume(session) {
  if (typeof session?.totalVolume === 'number') return session.totalVolume
  return (session?.sets || []).reduce((sum, set) => {
    const reps = Number(set?.reps || 0)
    const weight = Number(set?.weight || set?.lbs || 0)
    return sum + (reps * weight)
  }, 0)
}

function getSessionMaxWeight(session) {
  return Math.max(
    0,
    ...(session?.sets || []).map((set) => Number(set?.weight || set?.lbs || 0)).filter(Number.isFinite)
  )
}

function formatCompactVolume(value) {
  if (!value) return '0'
  if (value >= 1000) {
    const compact = value >= 10000 ? Math.round(value / 1000).toString() : (value / 1000).toFixed(1)
    return `${compact.replace('.0', '')}k`
  }
  return Math.round(value).toLocaleString()
}

function formatDurationMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  if (minutes > 240) return null
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
}

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

function StatCard({ label, value, sub, valueClass = 'text-text-primary' }) {
  return (
    <div className="card">
      <p className="section-title">{label}</p>
      <p className={`stat-number ${valueClass}`}>{value}</p>
      {sub && <p className="text-text-secondary text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

function SegmentedTargetRing({ groups, size = 80, strokeWidth = 8, gapDegrees = 16 }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const segmentDegrees = (360 - gapDegrees * groups.length) / groups.length
  const segmentLength = circumference * (segmentDegrees / 360)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      {groups.map((group, index) => {
        const normalized = Math.max(0, Math.min(group.pct || 0, 1))
        const rotation = -90 + index * (segmentDegrees + gapDegrees)
        const fillLength = segmentLength * normalized
        const fillOffset = segmentLength - fillLength

        return (
          <g key={group.id}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(51,65,85,0.55)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${segmentLength} ${circumference}`}
              strokeDashoffset={0}
              transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={group.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${segmentLength} ${circumference}`}
              strokeDashoffset={fillOffset}
              transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
              style={{ filter: `drop-shadow(0 0 6px ${group.color}55)` }}
            />
          </g>
        )
      })}
    </svg>
  )
}

export default function Dashboard() {
  const { profile, user } = useAuth()
  const { activeWorkout } = useActiveWorkout()
  const navigate = useNavigate()
  const location = useLocation()

  const displayName = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Athlete'
  const firstName = displayName.split(' ')[0]

  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [chartPeriod, setChartPeriod] = useState('weekly')
  const [selectedRecoveryPart, setSelectedRecoveryPart] = useState(null)

  const pplConfig = useMemo(() => [
    { ...PPL_DASH[0], targetTotal: profile?.weeklyTargets?.push ?? 27 },
    { ...PPL_DASH[1], targetTotal: profile?.weeklyTargets?.pull ?? 15 },
    { ...PPL_DASH[2], targetTotal: profile?.weeklyTargets?.legs ?? 21 },
  ], [profile?.weeklyTargets?.legs, profile?.weeklyTargets?.pull, profile?.weeklyTargets?.push])

  const pplTotal = pplConfig.reduce((sum, group) => sum + group.targetTotal, 0)

  useEffect(() => {
    if (!user?.uid) return
    setLoading(true)
    user.getIdToken()
      .then(() => getDocs(sessionsCol(user.uid)))
      .then((snap) => {
        const sorted = snap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        setSessions(sorted)
        setLoading(false)
      })
      .catch((err) => {
        setLoadError(err?.message || 'Unknown error')
        setLoading(false)
      })
  }, [location.key, user?.uid])

  const activeSessions = sessions.filter((session) => (session.sets?.length ?? 0) > 0)
  const uniqueDates = [...new Set(activeSessions.map((session) => session.date))].sort()
  const lastDate = uniqueDates[uniqueDates.length - 1]
  const daysSince = lastDate ? differenceInDays(parseISO(TODAY), parseISO(lastDate)) : null

  let streak = 0
  if (uniqueDates.length) {
    const dateSet = new Set(uniqueDates)
    let cursor = parseISO(lastDate)
    while (dateSet.has(format(cursor, 'yyyy-MM-dd'))) {
      streak += 1
      cursor = new Date(cursor.getTime() - 86400000)
    }
  }

  const weeklyMap = {}
  activeSessions.forEach((session) => {
    if (!session.date) return
    const weekKey = format(startOfWeek(parseISO(session.date), { weekStartsOn: 0 }), 'yyyy-MM-dd')
    weeklyMap[weekKey] = (weeklyMap[weekKey] || 0) + getSessionVolume(session)
  })

  const monthlyMap = {}
  activeSessions.forEach((session) => {
    if (!session.date) return
    const monthKey = session.date.slice(0, 7)
    monthlyMap[monthKey] = (monthlyMap[monthKey] || 0) + getSessionVolume(session)
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
        .map(([key, vol]) => ({ week: key.slice(5), vol }))
    }
    return Object.entries(monthlyMap)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, vol]) => ({ week: key.slice(5), vol }))
  })()

  const maxVol = chartData.length ? Math.max(...chartData.map((point) => point.vol)) : 0
  const thisWeekKey = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd')
  const weekEndStr = format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd')
  const thisWeekVol = weeklyMap[thisWeekKey] || 0
  const thisWeekSessions = activeSessions.filter((session) => session.date >= thisWeekKey && session.date <= weekEndStr)
  const weekSets = computeDashSets(thisWeekSessions)
  const weekTotal = pplConfig.reduce(
    (sum, group) => sum + group.muscles.reduce((inner, muscle) => inner + (weekSets[group.id]?.[muscle.id] || 0), 0),
    0
  )
  const weekPct = Math.min(weekTotal / Math.max(pplTotal, 1), 1)
  const weekGroupStats = pplConfig.map((group) => {
    const actual = group.muscles.reduce((sum, muscle) => sum + (weekSets[group.id]?.[muscle.id] || 0), 0)
    return {
      ...group,
      actual,
      ratio: group.targetTotal > 0 ? actual / group.targetTotal : 0,
      remaining: Math.max(group.targetTotal - actual, 0),
    }
  })
  const weakestGroup = weekGroupStats.slice().sort((a, b) => a.ratio - b.ratio || b.remaining - a.remaining)[0]

  const lastSessions = lastDate ? activeSessions.filter((session) => session.date === lastDate) : []
  const lastExercises = lastSessions.map((session) => session.exerciseName).filter(Boolean)
  const lastSessionVolume = lastSessions.reduce((sum, session) => sum + getSessionVolume(session), 0)
  const lastSessionSetTotal = lastSessions.reduce((sum, session) => sum + (session.sets?.length || 0), 0)
  const lastSessionExerciseRows = useMemo(() => {
    const grouped = new Map()
    lastSessions.forEach((session) => {
      if (!session.exerciseName) return
      const current = grouped.get(session.exerciseName) || {
        exerciseName: session.exerciseName,
        bodyPart: getBodyPart(session.muscleGroup, session.exerciseName),
        sets: 0,
      }
      current.sets += session.sets?.length || 0
      grouped.set(session.exerciseName, current)
    })
    return Array.from(grouped.values())
  }, [lastSessions])
  const lastSessionDurationMinutes = useMemo(() => {
    const stamps = lastSessions.flatMap((session) => [
      getTimestampMs(session.startedAt),
      getTimestampMs(session.createdAt),
      getTimestampMs(session.completedAt),
      getTimestampMs(session.updatedAt),
    ]).filter(Boolean)
    if (stamps.length < 2) return null
    const minutes = Math.round((Math.max(...stamps) - Math.min(...stamps)) / 60000)
    return minutes > 0 ? minutes : null
  }, [lastSessions])
  const lastSessionDurationLabel = formatDurationMinutes(lastSessionDurationMinutes)
  const lastSessionPrCount = useMemo(() => {
    return lastSessions.reduce((count, session) => {
      const currentBest = getSessionMaxWeight(session)
      if (!currentBest || !session.exerciseName || !lastDate) return count
      const priorBest = activeSessions
        .filter((candidate) => candidate.exerciseName === session.exerciseName && candidate.date < lastDate)
        .reduce((best, candidate) => Math.max(best, getSessionMaxWeight(candidate)), 0)
      return currentBest > priorBest ? count + 1 : count
    }, 0)
  }, [activeSessions, lastDate, lastSessions])

  const workedParts = new Set(lastSessions.map((session) => getBodyPart(session.muscleGroup, session.exerciseName)).filter(Boolean))
  const bodyPartLastTrained = useMemo(() => {
    const latestByPart = {}
    activeSessions.forEach((session) => {
      const part = getBodyPart(session.muscleGroup, session.exerciseName)
      if (!part || !session.date) return
      if (!latestByPart[part] || session.date > latestByPart[part]) latestByPart[part] = session.date
    })
    return latestByPart
  }, [activeSessions])

  useEffect(() => {
    if (selectedRecoveryPart && bodyPartLastTrained[selectedRecoveryPart]) return
    const fallback = BODY_PARTS.find((part) => bodyPartLastTrained[part.key])?.key || null
    setSelectedRecoveryPart(fallback)
  }, [bodyPartLastTrained, selectedRecoveryPart])

  const totalSessions = activeSessions.length
  const trainedToday = lastDate === TODAY
  const routineInProgress = activeWorkout?.kind === 'routine' && !activeWorkout.summaryReady ? activeWorkout : null
  const routineCompletedCount = routineInProgress
    ? routineInProgress.exercises.filter((exercise) => exercise.status === 'completed').length
    : 0
  const routineCurrentExercise = routineInProgress?.exercises.find((exercise) => exercise.id === routineInProgress.currentExerciseId)

  const dailyScore = Math.max(
    0,
    Math.min(
      100,
      Math.round((weekPct * 45) + (trainedToday ? 30 : 0) + (routineInProgress ? 15 : 0) + (Math.min(streak, 5) * 2))
    )
  )

  const planTitle = routineInProgress
    ? `Continue ${routineInProgress.routine?.name || 'Workout'}`
    : weakestGroup?.remaining > 0
      ? `Recommended: ${weakestGroup.label} Workout`
      : trainedToday
        ? 'Today is on track'
        : 'Start your next workout'

  const planDetail = routineInProgress
    ? `${routineCompletedCount} of ${routineInProgress.exercises.length} complete${routineCurrentExercise?.name ? ` | Next: ${routineCurrentExercise.name}` : ''}`
    : weakestGroup?.remaining > 0
      ? `${weakestGroup.remaining} more ${weakestGroup.label.toLowerCase()} sets to hit this week`
      : trainedToday
        ? 'Recovery, steps, or mobility is the right move now.'
        : streak > 0
          ? `Keep your ${streak}-day streak going with one focused session.`
          : 'One workout today gets your week moving.'

  const weeklyInsight = weakestGroup?.remaining > 0
    ? `You're behind on ${weakestGroup.label}. ${weakestGroup.remaining} more sets will put you back on track.`
    : 'All weekly set targets are on track.'
  const focusLabel = routineInProgress
    ? `Focus Today: ${routineCurrentExercise?.muscleGroup || 'Current workout'}`
    : weakestGroup?.remaining > 0
      ? `Priority: ${weakestGroup.label} Day`
      : trainedToday
        ? 'Focus Today: Recovery'
        : 'Focus Today: Training'
  const planProgressRatio = routineInProgress
    ? routineCompletedCount / Math.max(routineInProgress.exercises.length, 1)
    : weakestGroup
      ? Math.min(weakestGroup.actual / Math.max(weakestGroup.targetTotal, 1), 1)
      : 0

  const chartCurrentPoint = chartData[chartData.length - 1] || null
  const chartPreviousPoint = chartData[chartData.length - 2] || null
  const chartTrendPct = chartCurrentPoint && chartPreviousPoint?.vol
    ? Math.round(((chartCurrentPoint.vol - chartPreviousPoint.vol) / chartPreviousPoint.vol) * 100)
    : null
  const peakIndex = chartData.length ? chartData.findIndex((point) => point.vol === Math.max(...chartData.map((item) => item.vol))) : -1
  const dipIndex = chartData.length ? chartData.findIndex((point) => point.vol === Math.min(...chartData.map((item) => item.vol))) : -1
  const chartInsight = chartTrendPct == null
    ? 'A few more sessions will unlock trend insight.'
    : chartTrendPct >= 0
      ? `Up ${chartTrendPct}% vs last ${chartPeriod === 'weekly' ? 'week' : 'period'}`
      : `Down ${Math.abs(chartTrendPct)}% vs last ${chartPeriod === 'weekly' ? 'week' : 'period'}`
  const chartSecondaryInsight = peakIndex >= 0 && dipIndex >= 0 && chartData.length > 2
    ? `Peak ${chartData[peakIndex]?.week} | Lowest ${chartData[dipIndex]?.week}`
    : 'Volume trend updates as more data comes in.'

  function getRecoveryMeta(bodyPart) {
    const lastTrained = bodyPartLastTrained[bodyPart]
    if (!lastTrained) {
      return {
        status: 'Ready',
        dotClass: 'bg-accent-green',
        textClass: 'text-accent-green',
        shellClass: 'bg-accent-green/12 border border-accent-green/25',
        detail: `${bodyPart} has not been hit recently. Good candidate for today.`,
      }
    }

    const daysAgo = differenceInDays(parseISO(TODAY), parseISO(lastTrained))
    if (daysAgo === 0) {
      return {
        status: 'Overworked',
        dotClass: 'bg-accent-red',
        textClass: 'text-accent-red',
        shellClass: 'bg-accent-red/6 border border-accent-red/12',
        detail: `${bodyPart} was trained today. Let it recover before pushing it again.`,
      }
    }

    if (daysAgo <= 2) {
      return {
        status: 'Recovery',
        dotClass: 'bg-accent-orange',
        textClass: 'text-accent-orange',
        shellClass: 'bg-accent-orange/8 border border-accent-orange/16',
        detail: `${bodyPart} was trained ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago. Moderate work is okay.`,
      }
    }

    return {
      status: 'Ready',
      dotClass: 'bg-accent-green',
      textClass: 'text-accent-green',
      shellClass: 'bg-accent-green/12 border border-accent-green/25',
      detail: `${bodyPart} is recovered and ready for a harder session.`,
    }
  }

  const selectedRecoveryMeta = selectedRecoveryPart ? getRecoveryMeta(selectedRecoveryPart) : null

  function handleWorkoutCta() {
    if (routineInProgress?.currentExerciseId) {
      navigate(`/workout/${routineInProgress.currentExerciseId}`, {
        state: {
          workoutMode: true,
          routine: {
            ...routineInProgress.routine,
            exercises: routineInProgress.exercises,
          },
        },
      })
      return
    }

    navigate('/routines')
  }

  function renderVolumeDot(props) {
    const { cx, cy, index } = props
    if (typeof cx !== 'number' || typeof cy !== 'number') return null

    let fill = '#1A56DB'
    let radius = 3
    const isCurrent = index === chartData.length - 1
    if (index === peakIndex) {
      fill = '#22C55E'
      radius = 4
    } else if (index === dipIndex) {
      fill = '#F59E0B'
      radius = 4
    }

    return (
      <>
        {isCurrent && <circle cx={cx} cy={cy} r={8} fill="#1A56DB" opacity={0.14} />}
        <circle cx={cx} cy={cy} r={isCurrent ? radius + 1 : radius} fill={fill} strokeWidth={0} />
      </>
    )
  }

  if (!loading && (sessions.length === 0 || loadError)) {
    return (
      <PageWrapper showSettings>
        <div className="px-4 pt-2 space-y-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">
              Hey, {firstName}
            </h1>
            <p className="text-text-secondary text-sm mt-0.5">Here&apos;s your fitness overview</p>
          </div>

          {loadError ? (
            <div className="card border border-red-500/30 space-y-3">
              <p className="text-accent-red font-semibold text-sm">Could not load workouts</p>
              <p className="text-text-secondary text-xs font-mono break-all">{loadError}</p>
              <button onClick={() => window.location.reload()} className="btn-primary w-full">
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
              <button onClick={() => navigate('/routines')} className="btn-primary px-8 py-3">
                Start Workout
              </button>
              <button onClick={() => navigate('/import')} className="text-text-secondary text-xs underline underline-offset-2">
                or import existing data
              </button>
            </div>
          )}
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper showSettings>
      <div className="px-4 pt-2 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary mt-1">
              Hey, {firstName}
            </h1>
            <p className="text-text-secondary text-sm mt-0.5 opacity-70">Here&apos;s your fitness overview</p>
          </div>
        </div>

        <button
          onClick={handleWorkoutCta}
          className="card w-full text-left active:scale-[0.99] transition-transform border border-accent/30 bg-gradient-to-r from-accent via-[#245BEB] to-[#1A56DB] shadow-lg shadow-accent/20"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="section-title mb-1 text-white/75">Today&apos;s Plan</p>
              <p className="text-white/70 text-[11px] uppercase tracking-[0.2em] mb-1.5">{focusLabel}</p>
              <p className="text-white font-semibold text-base leading-tight">{planTitle}</p>
              <p className="text-white/80 text-sm mt-1.5">{planDetail}</p>
              <div className="mt-3 h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white/80 transition-all duration-500"
                  style={{ width: `${Math.max(planProgressRatio * 100, 8)}%` }}
                />
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <div className="px-2.5 py-1 rounded-full bg-white/12 border border-white/10 backdrop-blur-sm">
                <span className="text-[11px] font-semibold text-white">Daily Score {dailyScore}%</span>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/14 text-white border border-white/35 shadow-sm shadow-white/10">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
              </div>
            </div>
          </div>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Last Workout"
            value={daysSince === 0 ? 'Today' : daysSince === 1 ? '1 day' : daysSince != null ? `${daysSince}d` : '-'}
            sub={daysSince === 0 ? 'Keep it up!' : daysSince != null ? 'ago' : 'No workouts yet'}
            valueClass={daysSince === 0 ? 'text-accent-green' : daysSince != null && daysSince > 5 ? 'text-accent-orange' : 'text-text-primary'}
          />
          <StatCard
            label="Streak"
            value={streak > 0 ? `${streak}d` : '-'}
            sub={streak > 0 ? 'consecutive days' : 'Start logging!'}
            valueClass={streak >= 7 ? 'text-accent-green' : 'text-text-primary'}
          />
        </div>

        {!loading && lastExercises.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="section-title mb-0">Last Session</p>
              <p className="text-text-secondary text-xs">{lastDate?.slice(5).replace('-', '/')}</p>
            </div>
            <p className="text-text-secondary text-xs mb-3">
              {lastSessionExerciseRows.length} exercises
              {lastSessionDurationLabel ? ` | ${lastSessionDurationLabel}` : ''}
              {` | ${lastSessionSetTotal} sets | `}
              <span className="text-text-primary font-semibold text-sm">{formatCompactVolume(lastSessionVolume)} lbs</span>
              {lastSessionPrCount > 0 ? ` | ${lastSessionPrCount} PR${lastSessionPrCount === 1 ? '' : 's'} achieved` : ''}
            </p>

            <div className="flex items-end gap-3">
              <div className="flex-1 min-w-0 space-y-2">
                {lastSessionExerciseRows.slice(0, 3).map((row) => (
                  <div key={row.exerciseName} className="min-w-0 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                    <p className="text-text-primary text-sm font-medium truncate">{row.exerciseName}</p>
                  </div>
                ))}
                {lastSessionExerciseRows.length > 3 && (
                  <p className="text-text-secondary text-xs">+{lastSessionExerciseRows.length - 3} more</p>
                )}
              </div>

              <div className="relative w-20 h-20 flex-shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="10" className="text-accent-green/15" />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.min((lastSessionVolume / (profile?.weeklyVolumeGoal || 100000)) * 314, 314)} 314`}
                    className="text-accent-green transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="font-display text-base font-bold text-text-primary leading-tight">{formatCompactVolume(lastSessionVolume)}</p>
                  <p className="text-text-secondary text-[9px]">of goal</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && lastSessions.length > 0 && (
          <div className="card">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0">
                <p className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.24em] mb-0">Recovery Status</p>
                <p className="text-text-secondary text-xs mt-1">Tap a zone to see what to train or rest.</p>
              </div>
              <span className="text-text-secondary text-[11px] text-right leading-5 max-w-[132px] flex-shrink-0">
                Ready / Recovery / Overworked
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {BODY_PARTS.map((bp) => {
                const meta = getRecoveryMeta(bp.key)
                const selected = selectedRecoveryPart === bp.key
                return (
                  <button
                    key={bp.key}
                    onClick={() => setSelectedRecoveryPart(bp.key)}
                    className={`relative rounded-xl p-2 flex flex-col items-center gap-1.5 transition-colors text-center ${meta.shellClass} ${selected ? 'ring-1 ring-white/20' : ''}`}
                  >
                    <div className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${meta.dotClass}`} />
                    <img
                      src={bp.icon}
                      alt={bp.key}
                      loading="lazy"
                      decoding="async"
                      className={`w-14 h-14 object-contain transition-opacity ${workedParts.has(bp.key) ? 'opacity-100' : 'opacity-45'}`}
                    />
                    <p className={`text-[10px] font-semibold leading-none ${meta.textClass}`}>{bp.key}</p>
                  </button>
                )
              })}
            </div>

            {selectedRecoveryMeta && (
              <div className="mt-3 rounded-xl bg-surface2 px-3 py-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${selectedRecoveryMeta.dotClass}`} />
                  <p className="text-text-primary text-sm font-semibold">
                    {selectedRecoveryPart} - {selectedRecoveryMeta.status}
                  </p>
                </div>
                <p className="text-text-secondary text-xs mt-1.5">{selectedRecoveryMeta.detail}</p>
              </div>
            )}
          </div>
        )}

        {!loading && (
          <button
            onClick={() => navigate('/muscles')}
            className="card w-full text-left active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-4">
	              <div className="relative flex-shrink-0">
	                <SegmentedTargetRing
	                  groups={weekGroupStats.map((group) => ({
	                    id: group.id,
	                    pct: Math.min(group.actual / Math.max(group.targetTotal, 1), 1),
	                    color: group.color,
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

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="section-title mb-0">Weekly Set Targets</p>
                  <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-text-primary text-xs font-semibold">{weeklyInsight}</p>
                </div>
                <div className="space-y-1">
                  {weekGroupStats.map((group) => {
                    const done = group.actual >= group.targetTotal
                    return (
                      <div key={group.id} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: group.color }} />
                        <p className="text-text-secondary text-xs w-8">{group.label}</p>
                        <div className="flex-1 h-1.5 bg-surface2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(group.actual / Math.max(group.targetTotal, 1), 1) * 100}%`, backgroundColor: group.color }}
                          />
                        </div>
                        <p className={`text-xs font-mono flex-shrink-0 ${done ? 'text-accent-green font-bold' : 'text-text-secondary'}`}>
                          {group.actual}/{group.targetTotal}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </button>
        )}

        <div className="card pb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="section-title mb-0">Volume</p>
            <div className="flex items-center gap-1 bg-surface2 rounded-lg p-0.5">
              {['weekly', 'monthly', 'all'].map((period) => (
                <button
                  key={period}
                  onClick={() => setChartPeriod(period)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    chartPeriod === period ? 'bg-accent text-white' : 'text-text-secondary'
                  }`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {totalSessions > 0 && (
            <>
              <p className="text-text-secondary text-xs">{totalSessions} sessions total</p>
              <p className="text-text-primary text-sm font-medium mt-2">{chartInsight}</p>
              <p className="text-text-secondary text-xs mt-1 mb-2">{chartSecondaryInsight}</p>
            </>
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
                    dot={renderVolumeDot}
                    activeDot={{ r: 4, fill: '#1A56DB' }}
                  />
                </AreaChart>
              </ResponsiveContainer>

              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="bg-surface2 rounded-xl p-3">
                  <p className="text-text-secondary text-xs">Best Week</p>
                  <p className="text-text-primary font-semibold text-sm mt-0.5">
                    {formatCompactVolume(maxVol)} lbs
                  </p>
                </div>
                <div className="bg-surface2 rounded-xl p-3">
                  <p className="text-text-secondary text-xs">This Week</p>
                  <p className="text-accent-green font-semibold text-sm mt-0.5">
                    {formatCompactVolume(thisWeekVol)} lbs
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
