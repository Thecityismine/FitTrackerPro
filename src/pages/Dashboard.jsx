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
import { getMainMuscleGroupIcon } from '../utils/muscleGroupIcons'

const TODAY = format(new Date(), 'yyyy-MM-dd')
const CARDIO_RE = /\b(cardio|walking|walk|run|running|jog|jogging|bike|cycling|cycle|elliptical|swim|swimming|rowing|treadmill|stair|hiit)\b/i

const BODY_PARTS = [
  { key: 'Abs', icon: getMainMuscleGroupIcon('Abs'), match: ['abs', 'core', 'abdominal', 'crunch', 'plank', 'situp', 'sit-up'] },
  { key: 'Arms', icon: getMainMuscleGroupIcon('Arms'), match: ['arms', 'bicep', 'biceps', 'forearm', 'forearms', 'curl', 'triceps', 'tricep', 'pushdown', 'push-down', 'skull', 'dips', 'dip'] },
  { key: 'Chest', icon: getMainMuscleGroupIcon('Chest'), match: ['chest', 'pec', 'pecs', 'bench', 'fly', 'flye'] },
  { key: 'Shoulders', icon: getMainMuscleGroupIcon('Shoulders'), match: ['shoulders', 'shoulder', 'delt', 'delts'] },
  { key: 'Back', icon: getMainMuscleGroupIcon('Back'), match: ['back', 'lats', 'lat', 'rhomboid', 'trap', 'traps', 'rear', 'row', 'rows', 'pulldown', 'pull-down', 'chin', 'deadlift'] },
  { key: 'Legs', icon: getMainMuscleGroupIcon('Legs'), match: ['legs', 'leg', 'quad', 'quads', 'hamstring', 'hamstrings', 'calf', 'calves', 'calve', 'lunge', 'squat'] },
  { key: 'Glutes', icon: getMainMuscleGroupIcon('Glutes'), match: ['glutes', 'glute', 'gluts', 'hip', 'hips', 'butt', 'gluteal'] },
  { key: 'Cardio', icon: getMainMuscleGroupIcon('Cardio'), match: ['cardio', 'walking', 'walk', 'run', 'running', 'bike', 'elliptical', 'swim', 'rowing', 'treadmill', 'fitness bike'] },
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

const UPPER_BODY_PARTS = new Set(['Abs', 'Arms', 'Chest', 'Shoulders', 'Back'])
const LOWER_BODY_PARTS = new Set(['Legs', 'Glutes', 'Cardio'])

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

function formatPartList(parts, maxItems = 2) {
  if (!parts.length) return null
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`
  const visible = parts.slice(0, maxItems)
  return `${visible.join(' & ')} +${parts.length - visible.length} more`
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

function isCardioSession(session) {
  return session?.type === 'time' || CARDIO_RE.test(session?.muscleGroup || '') || CARDIO_RE.test(session?.exerciseName || '')
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
  const [reloadKey, setReloadKey] = useState(0)
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
    setLoadError(null)
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
        console.error('Dashboard load error:', err)
        setLoadError('Could not load your dashboard right now.')
        setLoading(false)
      })
  }, [location.key, reloadKey, user?.uid])

  function retryLoad() {
    setReloadKey((current) => current + 1)
  }

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
  const lastSessionVolume = lastSessions.reduce((sum, session) => sum + getSessionVolume(session), 0)
  const lastSessionIsAllCardio = lastSessions.length > 0 && lastSessions.every(isCardioSession)
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
  const lastSessionSummaryLabel = lastSessionIsAllCardio ? 'Workout Time' : 'Total Volume'
  const lastSessionSummaryValue = lastSessionIsAllCardio
    ? `${Math.round(lastSessionVolume).toLocaleString()} Minutes`
    : formatCompactVolume(lastSessionVolume)
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

  const weeklyInsight = weakestGroup?.remaining > 0
    ? `${weakestGroup.label} needs ${weakestGroup.remaining} more sets this week.`
    : 'Your weekly targets are on track.'
  const dashboardHook = routineInProgress
    ? "You're on track. Finish strong."
    : trainedToday
      ? "You're on track. Finish strong."
      : streak >= 3
        ? "You're building momentum. Don't break it."
        : 'Stay consistent. Results follow.'

  const lastWorkoutValue = daysSince === 0
    ? 'Today'
    : daysSince === 1
      ? '1 day'
      : daysSince != null
        ? `${daysSince}d`
        : '-'
  const streakValue = streak > 0 ? `${streak}d` : '-'
  const recentSessionSub = lastSessions.length > 0
    ? `${lastSessionExerciseRows.length} exercises on ${lastDate?.slice(5).replace('-', '/')}`
    : 'No recent session'
  const recentExerciseNames = lastSessionExerciseRows.length > 0
    ? `${lastSessionExerciseRows.slice(0, 2).map((row) => row.exerciseName).join(' | ')}${lastSessionExerciseRows.length > 2 ? ` | +${lastSessionExerciseRows.length - 2} more` : ''}`
    : 'No exercises logged yet'
  const lastWorkoutPillLabel = daysSince === 0 ? 'Today ✓' : `Last workout: ${lastWorkoutValue}`

  const chartCurrentPoint = chartData[chartData.length - 1] || null
  const chartPreviousPoint = chartData[chartData.length - 2] || null
  const chartTrendPct = chartCurrentPoint && chartPreviousPoint?.vol
    ? Math.round(((chartCurrentPoint.vol - chartPreviousPoint.vol) / chartPreviousPoint.vol) * 100)
    : null
  const peakIndex = chartData.length ? chartData.findIndex((point) => point.vol === Math.max(...chartData.map((item) => item.vol))) : -1
  const dipIndex = chartData.length ? chartData.findIndex((point) => point.vol === Math.min(...chartData.map((item) => item.vol))) : -1
  const chartInsight = chartTrendPct == null
    ? 'Log a few more sessions to unlock a trend.'
    : chartTrendPct >= 0
      ? `Volume is up ${chartTrendPct}% from last ${chartPeriod === 'weekly' ? 'week' : 'period'}.`
      : `Volume is down ${Math.abs(chartTrendPct)}% from last ${chartPeriod === 'weekly' ? 'week' : 'period'}.`
  const chartSecondaryInsight = peakIndex >= 0 && dipIndex >= 0 && chartData.length > 2
    ? `Peak week ${chartData[peakIndex]?.week} | Lowest week ${chartData[dipIndex]?.week}`
    : 'Trend detail will sharpen as more sessions come in.'
  const chartCurrentLabel = chartPeriod === 'weekly'
    ? 'This week'
    : chartPeriod === 'monthly'
      ? 'This month'
      : 'Latest period'
  const chartBestLabel = chartPeriod === 'weekly'
    ? 'Best Week'
    : chartPeriod === 'monthly'
      ? 'Best Month'
      : 'Best Period'
  const chartAverageVolume = chartData.length > 1
    ? Math.round(chartData.slice(0, -1).reduce((sum, point) => sum + point.vol, 0) / (chartData.length - 1))
    : null
  const chartTakeawayTitle = chartTrendPct == null
    ? 'Volume trend is still forming.'
    : chartTrendPct >= 0
      ? `${chartCurrentLabel} is ahead of your recent pace.`
      : `${chartCurrentLabel} is below your recent pace.`
  const chartTakeawayDetail = chartAverageVolume
    ? `${chartCurrentLabel} volume is ${formatCompactVolume(chartCurrentPoint?.vol || 0)} versus a recent average of ${formatCompactVolume(chartAverageVolume)}.`
    : chartInsight

  function getRecoveryMeta(bodyPart) {
    const lastTrained = bodyPartLastTrained[bodyPart]
    if (!lastTrained) {
      return {
        status: 'Ready',
        dotClass: 'bg-accent-green',
        textClass: 'text-accent-green',
        shellClass: 'border border-white/20 bg-surface/85',
        detail: `${bodyPart} has not been hit recently. Good candidate for today.`,
      }
    }

    const daysAgo = differenceInDays(parseISO(TODAY), parseISO(lastTrained))
    if (daysAgo === 0) {
      return {
        status: 'Overworked',
        dotClass: 'bg-accent-red',
        textClass: 'text-accent-red',
        shellClass: 'border border-white/20 bg-surface/85',
        detail: `${bodyPart} was trained today. Let it recover before pushing it again.`,
      }
    }

    if (daysAgo <= 2) {
      return {
        status: 'Recovery',
        dotClass: 'bg-[#FACC15]',
        textClass: 'text-[#FACC15]',
        shellClass: 'border border-white/20 bg-surface/85',
        detail: `${bodyPart} was trained ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago. Moderate work is okay.`,
      }
    }

    return {
      status: 'Ready',
      dotClass: 'bg-accent-green',
      textClass: 'text-accent-green',
      shellClass: 'border border-white/20 bg-surface/85',
      detail: `${bodyPart} is recovered and ready for a harder session.`,
    }
  }

  const selectedRecoveryMeta = selectedRecoveryPart ? getRecoveryMeta(selectedRecoveryPart) : null
  const recoveryParts = BODY_PARTS.map((part) => ({
    key: part.key,
    status: getRecoveryMeta(part.key).status,
  }))
  const recoveryStateCounts = BODY_PARTS.reduce((counts, part) => {
    const status = getRecoveryMeta(part.key).status
    if (status === 'Ready') counts.ready += 1
    if (status === 'Recovery') counts.recovery += 1
    if (status === 'Overworked') counts.overworked += 1
    return counts
  }, { ready: 0, recovery: 0, overworked: 0 })
  const readyParts = recoveryParts.filter((part) => part.status === 'Ready').map((part) => part.key)
  const recoveryOnlyParts = recoveryParts.filter((part) => part.status === 'Recovery').map((part) => part.key)
  const overworkedParts = recoveryParts.filter((part) => part.status === 'Overworked').map((part) => part.key)
  const fatiguedParts = recoveryParts.filter((part) => part.status !== 'Ready').map((part) => part.key)
  const readyUpperParts = readyParts.filter((part) => UPPER_BODY_PARTS.has(part))
  const readyLowerParts = readyParts.filter((part) => LOWER_BODY_PARTS.has(part))
  const fatiguedUpperCount = fatiguedParts.filter((part) => UPPER_BODY_PARTS.has(part)).length
  const fatiguedLowerCount = fatiguedParts.filter((part) => LOWER_BODY_PARTS.has(part)).length
  const recoverySummaryLine = (() => {
    if (fatiguedUpperCount >= 3 && readyLowerParts.length > 0) {
      return `Your upper body is fatigued. Focus ${formatPartList(readyLowerParts)}.`
    }
    if (fatiguedLowerCount >= 2 && readyUpperParts.length > 0) {
      return `Your lower body is fatigued. Focus ${formatPartList(readyUpperParts)}.`
    }
    if (overworkedParts.length > 0 && readyParts.length > 0) {
      return `Avoid ${formatPartList(overworkedParts)} today. Train ${formatPartList(readyParts)}.`
    }
    if (recoveryOnlyParts.length > 0 && readyParts.length > 0) {
      return `Go lighter on ${formatPartList(recoveryOnlyParts)}. Focus ${formatPartList(readyParts)}.`
    }
    if (readyParts.length > 0) {
      return `Best options today: ${formatPartList(readyParts)}.`
    }
    return 'Most zones are fatigued. Keep today light and recover.'
  })()
  const dailyScore = Math.max(
    0,
    Math.min(
      100,
      Math.round((weekPct * 45) + (trainedToday ? 30 : 0) + (routineInProgress ? 15 : 0) + (Math.min(streak, 5) * 2))
    )
  )

  const planHeadline = routineInProgress
    ? 'Resume workout'
    : weakestGroup?.remaining > 0
      ? `Train ${weakestGroup.label} today`
    : trainedToday
        ? 'Recovery is the right move'
        : 'Start a workout'
  const planCtaLabel = routineInProgress ? 'Continue Workout' : 'Start Workout'
  const planFocusLabel = routineInProgress
    ? 'Workout in progress'
    : weakestGroup?.remaining > 0
      ? `Focus: ${weakestGroup.label}`
      : trainedToday
        ? 'Focus: Recovery'
        : 'Focus: Training'
  const missionLine = weakestGroup?.remaining > 0
    ? `You need ${weakestGroup.remaining} ${weakestGroup.label.toLowerCase()} sets to stay on track this week.`
    : routineInProgress
      ? "Finish today's workout to stay on pace this week."
      : 'You are on pace for this week.'
  const heroProgressRatio = routineInProgress
    ? routineCompletedCount / Math.max(routineInProgress.exercises.length, 1)
    : trainedToday
      ? 1
      : 0
  const heroProgressText = routineInProgress
    ? `${routineCompletedCount}/${routineInProgress.exercises.length} exercises complete`
    : trainedToday
      ? "Today's workout is complete."
      : 'No workout started yet.'

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
            <p className="text-text-secondary text-sm mt-0.5">Your training overview</p>
          </div>

          {loadError ? (
            <div className="card border border-red-500/30 space-y-3">
              <p className="text-accent-red font-semibold text-sm">Could not load workouts</p>
              <p className="text-text-secondary text-sm">{loadError}</p>
              <button onClick={retryLoad} className="btn-primary w-full">
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
                <p className="text-text-secondary text-sm mt-1">Start your first workout or import your history to unlock your dashboard.</p>
              </div>
              <button onClick={() => navigate('/routines')} className="btn-primary px-8 py-3">
                Start Workout
              </button>
              <button onClick={() => navigate('/import')} className="btn-secondary px-6 py-3 text-sm">
                Import History
              </button>
            </div>
          )}
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper showSettings>
      <div className="px-4 pt-3 space-y-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold leading-none text-text-primary mt-1">
              Hey, {firstName}
            </h1>
            <p className="text-text-secondary text-sm leading-tight opacity-75">Your training overview</p>
            <p className="text-accent-green text-base font-semibold leading-tight">{dashboardHook}</p>
          </div>
        </div>

        <button
          onClick={handleWorkoutCta}
          className="card card-enter tap-glow w-full text-left active:scale-[0.99] transition-transform border border-accent/30 bg-gradient-to-r from-accent via-[#245BEB] to-[#1A56DB] shadow-lg shadow-accent/20"
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="section-title mb-0 text-white/75">Today&apos;s Plan</p>
                <p className="mt-1.5 text-white/70 text-[11px] uppercase tracking-[0.2em]">{planFocusLabel}</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/92">
                Daily Score {dailyScore}%
              </span>
            </div>

            <div className="min-w-0">
              <p className="text-white font-semibold text-[1.82rem] leading-[1.05] tracking-[-0.02em]">{planHeadline}</p>
              <p className="text-white/82 text-sm mt-2.5 leading-relaxed">{missionLine}</p>
            </div>

            <div className="space-y-2.5">
              <div className="min-w-0">
                <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white/80 transition-all duration-500 progress-reveal"
                    style={{ width: `${Math.max(heroProgressRatio * 100, 8)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-white/72 leading-tight">{heroProgressText}</p>
              </div>

              <div className="flex w-fit min-w-[10.25rem] items-center justify-center gap-2 self-end rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-accent shadow-sm shadow-black/10">
                <span>{planCtaLabel}</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        </button>

        {!loading && lastSessions.length > 0 && (
          <div className="card card-enter card-enter-delay-1 card-tonal">
            <div className="mb-3">
              <p className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.24em] mb-0">Recovery Status</p>
              <p className="text-text-secondary text-xs mt-1">Train ready zones. Rest recovering ones.</p>
            </div>

            <div className="panel-inset rounded-2xl px-3.5 py-3.5">
              <p className="text-text-primary text-sm font-semibold">{recoverySummaryLine}</p>
            </div>

            <div className="grid grid-cols-4 gap-2 mt-3">
	              {BODY_PARTS.map((bp) => {
	                const meta = getRecoveryMeta(bp.key)
	                const selected = selectedRecoveryPart === bp.key
	                return (
	                  <button
	                    key={bp.key}
	                    onClick={() => setSelectedRecoveryPart(bp.key)}
	                    className={`relative rounded-xl p-2 flex flex-col items-center gap-1.5 text-center tap-glow transition-all duration-200 ${meta.shellClass} ${
	                      selected
	                        ? 'ring-2 ring-white/45 scale-[1.03] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_24px_rgba(15,23,42,0.22)]'
	                        : 'opacity-92'
	                    }`}
	                  >
	                    <div className={`absolute top-1.5 right-1.5 rounded-full ${meta.dotClass} ${selected ? 'w-3 h-3 ring-2 ring-white/25' : 'w-2.5 h-2.5'}`} />
	                    <img
	                      src={bp.icon}
	                      alt={bp.key}
                      loading="lazy"
                      decoding="async"
                      className={`w-14 h-14 object-contain transition-opacity ${workedParts.has(bp.key) ? 'opacity-100' : 'opacity-45'}`}
                    />
                    <p className="text-[10px] font-semibold leading-none text-white">{bp.key}</p>
                  </button>
                )
              })}
            </div>

            {selectedRecoveryMeta && (
              <div className="panel-inset mt-3 rounded-xl px-3 py-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${selectedRecoveryMeta.dotClass}`} />
                  <p className="text-text-primary text-sm font-semibold">
                    {selectedRecoveryPart} - {selectedRecoveryMeta.status}
                  </p>
                </div>
                <p className="text-text-secondary text-xs mt-1.5">{selectedRecoveryMeta.detail}</p>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-surface2 pt-3 text-[11px] text-text-secondary">
              {[
                { label: 'Ready', dotClass: 'bg-accent-green', count: recoveryStateCounts.ready },
                { label: 'Recovery', dotClass: 'bg-[#FACC15]', count: recoveryStateCounts.recovery },
                { label: 'Overworked', dotClass: 'bg-accent-red', count: recoveryStateCounts.overworked },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${item.dotClass}`} />
                  <span>{item.label}</span>
                  <span className="text-text-primary">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && (
          <button
            onClick={() => navigate('/muscles')}
            className="card card-elevated card-enter card-enter-delay-2 tap-glow w-full text-left active:scale-[0.98] transition-transform"
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
                  <p className="section-title mb-0">Weekly Targets</p>
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
                            className="h-full rounded-full transition-all duration-700 progress-reveal"
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

        <div className="card card-enter card-enter-delay-3">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="section-title mb-1">Recent Activity</p>
              <p className="text-text-secondary text-xs">A quick read on your latest training.</p>
            </div>
            {lastDate && <p className="text-text-secondary text-xs">{lastDate.slice(5).replace('-', '/')}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${daysSince === 0 ? 'border-accent-green/30 bg-accent-green/10 text-accent-green' : daysSince != null && daysSince > 5 ? 'border-amber-400/25 bg-amber-400/10 text-amber-200' : 'border-white/10 bg-surface2/75 text-text-primary'}`}>
              {lastWorkoutPillLabel}
            </span>
            <span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${streak >= 7 ? 'border-accent-green/30 bg-accent-green/10 text-accent-green' : 'border-white/10 bg-surface2/75 text-text-primary'}`}>
              Streak: {streak > 0 ? streakValue : 'None'}
            </span>
          </div>

          <div className="panel-inset mt-4 rounded-xl px-3.5 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-secondary">Last Session</p>
                <p className="mt-2 text-text-primary text-sm font-semibold">{recentExerciseNames}</p>
                <p className="mt-1.5 text-xs text-text-secondary">{recentSessionSub}</p>
              </div>
              {lastSessionPrCount > 0 && (
                <span className="rounded-full border border-accent-green/30 bg-accent-green/10 px-2.5 py-1 text-[11px] font-semibold text-accent-green">
                  {lastSessionPrCount} PR{lastSessionPrCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-text-secondary">{lastSessionSetTotal} sets</p>
              <div className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-sm font-semibold text-white">
                <span className="mr-1.5 text-[11px] font-medium text-white/70">{lastSessionSummaryLabel}</span>
                <span>{lastSessionSummaryValue}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card card-analytics card-enter card-enter-delay-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="section-title mb-0">Volume Trend</p>
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
              <div className="panel-inset rounded-2xl px-3.5 py-3.5 mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-secondary">Takeaway</p>
                <p className="mt-2 text-text-primary text-base font-semibold">{chartTakeawayTitle}</p>
                <p className="mt-1.5 text-xs text-text-secondary">{chartTakeawayDetail}</p>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="panel-inset rounded-xl p-3">
                  <p className="text-text-secondary text-[11px]">{chartCurrentLabel}</p>
                  <p className="mt-1 text-text-primary font-display font-bold text-lg">
                    {formatCompactVolume(chartCurrentPoint?.vol || 0)}
                  </p>
                </div>
                <div className="panel-inset rounded-xl p-3">
                  <p className="text-text-secondary text-[11px]">Recent Avg</p>
                  <p className="mt-1 text-text-primary font-display font-bold text-lg">
                    {chartAverageVolume ? formatCompactVolume(chartAverageVolume) : '-'}
                  </p>
                </div>
                <div className="panel-inset rounded-xl p-3">
                  <p className="text-text-secondary text-[11px]">Logged</p>
                  <p className="mt-1 text-text-primary font-display font-bold text-lg">{totalSessions}</p>
                </div>
              </div>

              <p className="text-text-secondary text-xs mb-2">{chartSecondaryInsight}</p>
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
                <div className="panel-inset rounded-xl p-3">
                  <p className="text-text-secondary text-xs">{chartBestLabel}</p>
                  <p className="text-text-primary font-display font-bold text-xl mt-1">{formatCompactVolume(maxVol)}</p>
                  <p className="text-text-secondary text-xs mt-1">Volume</p>
                </div>
                <div className="panel-inset rounded-xl p-3">
                  <p className="text-text-secondary text-xs">{chartCurrentLabel}</p>
                  <p className="text-accent-green font-display font-bold text-xl mt-1">{formatCompactVolume(chartCurrentPoint?.vol || 0)}</p>
                  <p className="text-text-secondary text-xs mt-1">Volume</p>
                </div>
              </div>
            </>
          ) : (
            <div className="h-36 flex flex-col items-center justify-center text-center px-6">
              <p className="text-text-primary text-sm font-semibold">Log your first workout</p>
              <p className="text-text-secondary text-xs mt-1">Your volume trend will appear here as you log sessions.</p>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  )
}
