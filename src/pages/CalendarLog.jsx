// src/pages/CalendarLog.jsx
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
	  getDay, addMonths, subMonths, parseISO,
	  startOfWeek, endOfWeek, differenceInCalendarDays, isSameMonth,
	} from 'date-fns'
import { getDocs } from 'firebase/firestore'
import PageWrapper from '../components/layout/PageWrapper'
import { useActiveWorkout } from '../context/ActiveWorkoutContext'
import { useAuth } from '../context/AuthContext'
import { sessionsCol, routinesCol } from '../firebase/collections'

const TODAY = format(new Date(), 'yyyy-MM-dd')
const TODAY_DISPLAY = format(new Date(), 'EEE, MMM d')

function getTimestampMs(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate().getTime()
  if (typeof value?.seconds === 'number') return value.seconds * 1000
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime()
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function formatCompactVolume(volume) {
  if (!Number.isFinite(volume) || volume <= 0) return '0'
  return volume >= 1000 ? `${(volume / 1000).toFixed(1)}k` : Math.round(volume).toLocaleString()
}

function formatDurationMinutes(minutes) {
  if (!minutes || minutes < 1) return null
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
}

function getExerciseBestValue(session) {
  return (session?.sets || []).reduce((max, set) => Math.max(max, Number(set?.weight) || 0), 0)
}

function getWorkoutDayIntensity(daySessions, workoutCount) {
  const totalVolume = daySessions.reduce((sum, session) => sum + (session.totalVolume || 0), 0)
  const cardioMinutes = daySessions
    .filter((session) => session.muscleGroup?.toLowerCase() === 'cardio')
    .reduce((sum, session) => sum + getExerciseBestValue(session), 0)

  if (totalVolume >= 30000 || cardioMinutes >= 60 || workoutCount >= 2 || daySessions.length >= 8) {
    return 'heavy'
  }
  if (totalVolume >= 10000 || cardioMinutes >= 25 || daySessions.length >= 4) {
    return 'complete'
  }
  return 'light'
}

export default function CalendarLog() {
  const { user, profile } = useAuth()
  const { activeWorkout, startRoutineWorkout } = useActiveWorkout()
  const navigate = useNavigate()

  const [sessions, setSessions] = useState([])
  const [routineMap, setRoutineMap] = useState({}) // routineId → { exercises: [] }
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [expandedKey, setExpandedKey] = useState(null)
  const [filter, setFilter] = useState('week') // 'week' | 'month'

  useEffect(() => {
    if (!user?.uid) return
    user.getIdToken()
      .then(() => Promise.all([
        getDocs(sessionsCol(user.uid)),
        getDocs(routinesCol(user.uid)),
      ]))
      .then(([sessSnap, routSnap]) => {
        setSessions(sessSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
        const rMap = {}
        routSnap.docs.forEach(d => { rMap[d.id] = d.data() })
        setRoutineMap(rMap)
        setLoading(false)
      })
      .catch((err) => { console.error('CalendarLog load error:', err); setLoading(false) })
  }, [user?.uid])

  // All dates with at least one session
  const workoutDates = useMemo(
    () => new Set(sessions.map((s) => s.date).filter(Boolean)),
    [sessions]
  )

  // Group: date → routineName → { routineName, routineId, exercises[], totalVolume }
  const grouped = useMemo(() => {
    const map = {}
    for (const s of sessions) {
      if (!s.date) continue
      if (!map[s.date]) map[s.date] = {}
      const key = s.routineName || 'Free Workout'
      if (!map[s.date][key]) map[s.date][key] = { routineName: key, routineId: s.routineId || null, exercises: [], totalVolume: 0 }
      map[s.date][key].exercises.push(s)
      map[s.date][key].totalVolume += s.totalVolume || 0
    }
    return map
  }, [sessions])

  const workoutDayMeta = useMemo(() => {
    const meta = {}
    Object.entries(grouped).forEach(([date, groupsForDate]) => {
      const dayGroups = Object.values(groupsForDate)
      const daySessions = dayGroups.flatMap((group) => group.exercises || [])
      meta[date] = {
        intensity: getWorkoutDayIntensity(daySessions, dayGroups.length),
      }
    })
    return meta
  }, [grouped])

  const selectedDateSummary = useMemo(() => {
    if (!selectedDate || !grouped[selectedDate]) return null

    const groupsForDate = Object.values(grouped[selectedDate])
    const daySessions = groupsForDate.flatMap((group) => group.exercises)
    const routineGroups = groupsForDate.filter((group) => group.routineName && group.routineName !== 'Free Workout')
    const label = groupsForDate.length === 1
      ? groupsForDate[0].routineName
      : routineGroups.length === 1
        ? `${routineGroups[0].routineName} + ${groupsForDate.length - 1} more`
        : `${groupsForDate.length} workouts`
    const totalVolume = daySessions.reduce((sum, session) => sum + (session.totalVolume || 0), 0)
    const exerciseCount = new Set(daySessions.map((session) => session.exerciseId || session.exerciseName).filter(Boolean)).size
    const timestamps = daySessions.flatMap((session) => [
      getTimestampMs(session.createdAt),
      getTimestampMs(session.updatedAt),
      getTimestampMs(session.startedAt),
    ]).filter(Boolean)
    const durationMinutes = timestamps.length > 1
      ? Math.max(1, Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 60000))
      : null

    return {
      label,
      totalVolume,
      exerciseCount,
      workoutCount: groupsForDate.length,
      durationLabel: formatDurationMinutes(durationMinutes),
      isAllCardio: daySessions.length > 0 && daySessions.every((session) => session.muscleGroup?.toLowerCase() === 'cardio'),
      primaryGroup: groupsForDate
        .slice()
        .sort((a, b) => {
          if (Boolean(b.routineId) !== Boolean(a.routineId)) return Number(Boolean(b.routineId)) - Number(Boolean(a.routineId))
          return (b.totalVolume || 0) - (a.totalVolume || 0)
        })[0] || null,
    }
  }, [grouped, selectedDate])

  const selectedDateCta = useMemo(() => {
    const group = selectedDateSummary?.primaryGroup
    if (!group) return null

    const sessionsForGroup = group.exercises || []
    if (group.routineId && routineMap[group.routineId]?.exercises?.length) {
      const routine = { id: group.routineId, ...routineMap[group.routineId] }
      const exercises = routine.exercises || []
      if (!exercises.length) return null
      const isResumingCurrentRoutine =
        activeWorkout?.kind === 'routine' &&
        activeWorkout.routine.id === routine.id &&
        !activeWorkout.summaryReady
      const startExerciseId = isResumingCurrentRoutine
        ? (activeWorkout.currentExerciseId || exercises[0].id)
        : exercises[0].id

      return {
        label: isResumingCurrentRoutine ? 'Resume Workout' : 'Repeat Workout',
        run: () => {
          if (!isResumingCurrentRoutine) {
            startRoutineWorkout(routine, { startExerciseId })
          }
          navigate(`/workout/${startExerciseId}`, {
            state: {
              workoutMode: true,
              routine,
            },
          })
        },
      }
    }

    const firstSession = sessionsForGroup[0]
    if (!firstSession?.exerciseId) return null

    return {
      label: 'Train Again',
      run: () => {
        navigate(`/workout/${firstSession.exerciseId}`, {
          state: {
            standaloneWorkout: true,
            returnTo: '/calendar',
            exercise: {
              id: firstSession.exerciseId,
              name: firstSession.exerciseName,
              muscleGroup: firstSession.muscleGroup || '',
            },
          },
        })
      },
    }
  }, [activeWorkout, navigate, routineMap, selectedDateSummary, startRoutineWorkout])

  const selectedDateInsight = useMemo(() => {
    const group = selectedDateSummary?.primaryGroup
    if (!group || !selectedDate) return null

    const comparableDates = Object.keys(grouped)
      .filter((date) => date < selectedDate)
      .sort()
      .reverse()

    const previousGroup = comparableDates
      .map((date) => Object.values(grouped[date] || {}))
      .flat()
      .find((entry) => (
        group.routineId
          ? entry.routineId === group.routineId
          : entry.routineName === group.routineName
      )) || null

    if (!selectedDateSummary.isAllCardio && previousGroup?.totalVolume > 0 && group.totalVolume > 0) {
      const deltaPct = Math.round(((group.totalVolume - previousGroup.totalVolume) / previousGroup.totalVolume) * 100)
      if (deltaPct !== 0) {
        return {
          tone: deltaPct > 0 ? 'text-accent-green' : 'text-[#F2C14E]',
          text: `${deltaPct > 0 ? '+' : ''}${deltaPct}% vs last session`,
        }
      }
    }

    const strongestExercise = (group.exercises || [])
      .map((session) => ({
        name: session.exerciseName,
        bestValue: getExerciseBestValue(session),
      }))
      .sort((a, b) => b.bestValue - a.bestValue)[0]

    if (selectedDateSummary.isAllCardio) {
      if (strongestExercise?.bestValue > 0) {
        return {
          tone: 'text-accent',
          text: `Longest effort: ${strongestExercise.name} ${strongestExercise.bestValue} min`,
        }
      }
      return {
        tone: 'text-text-secondary',
        text: `${selectedDateSummary.exerciseCount} cardio exercise${selectedDateSummary.exerciseCount === 1 ? '' : 's'} logged`,
      }
    }

    if (strongestExercise?.bestValue > 0) {
      return {
        tone: 'text-text-primary',
        text: `Strongest lift: ${strongestExercise.name} ${strongestExercise.bestValue} lbs`,
      }
    }

    return null
  }, [grouped, selectedDate, selectedDateSummary])

  // Bounds for filters
  const monthStartStr = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const monthEndStr   = format(endOfMonth(currentMonth),   'yyyy-MM-dd')
  const weekStartStr  = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd')
  const weekEndStr    = format(endOfWeek(new Date(),   { weekStartsOn: 0 }), 'yyyy-MM-dd')

  // Days worked out this week (for the progress counter)
  const weekDaysCount = useMemo(
    () => Object.keys(grouped).filter((d) => d >= weekStartStr && d <= weekEndStr).length,
    [grouped, weekStartStr, weekEndStr]
  )
  const WEEKLY_GOAL = profile?.weeklyWorkoutGoal ?? 3

  const streakSummary = useMemo(() => {
    const sortedDates = Array.from(workoutDates).sort()
    if (!sortedDates.length) {
      return {
        label: 'No streak yet',
        detail: 'Log your first workout to start one',
        tone: 'text-text-primary',
      }
    }

    let streakDays = 1
    for (let i = sortedDates.length - 1; i > 0; i -= 1) {
      const current = parseISO(sortedDates[i])
      const previous = parseISO(sortedDates[i - 1])
      const dayGap = differenceInCalendarDays(current, previous)
      if (dayGap === 1) {
        streakDays += 1
        continue
      }
      if (dayGap > 1) break
    }

    const latestDate = sortedDates[sortedDates.length - 1]
    const isActive = differenceInCalendarDays(parseISO(TODAY), parseISO(latestDate)) <= 1

    return {
      label: `${streakDays} day${streakDays === 1 ? '' : 's'}`,
      detail: isActive ? 'Active streak' : `Last workout ${format(parseISO(latestDate), 'MMM d')}`,
      tone: isActive ? 'text-accent-green' : 'text-accent',
    }
  }, [workoutDates])

  const consistencySummary = useMemo(() => {
    const monthStartDate = startOfMonth(currentMonth)
    const monthEndDate = endOfMonth(currentMonth)
    const today = new Date()
    const trackedEndDate = isSameMonth(currentMonth, today) ? today : monthEndDate
    const trackedDays = Math.max(1, differenceInCalendarDays(trackedEndDate, monthStartDate) + 1)
    const workedDays = Object.keys(grouped).filter((date) => (
      date >= format(monthStartDate, 'yyyy-MM-dd') &&
      date <= format(trackedEndDate, 'yyyy-MM-dd')
    )).length
    const percentage = Math.round((workedDays / trackedDays) * 100)

    return {
      label: isSameMonth(currentMonth, today) ? 'This month' : format(currentMonth, 'MMMM'),
      detail: `${workedDays} of ${trackedDays} days`,
      percentage,
    }
  }, [currentMonth, grouped])

  const monthSummary = useMemo(() => {
    const monthDates = Object.keys(grouped)
      .filter((date) => date >= monthStartStr && date <= monthEndStr)
      .sort()

    if (!monthDates.length) return null

    const monthGroups = monthDates.flatMap((date) =>
      Object.values(grouped[date] || {}).map((group) => ({
        date,
        ...group,
      }))
    )
    const monthSessions = monthGroups.flatMap((group) => group.exercises || [])
    const totalVolume = monthSessions.reduce((sum, session) => sum + (session.totalVolume || 0), 0)
    const totalCardioMinutes = monthSessions
      .filter((session) => session.muscleGroup?.toLowerCase() === 'cardio')
      .reduce((sum, session) => sum + getExerciseBestValue(session), 0)

    const topRoutine = Object.values(
      monthGroups.reduce((map, group) => {
        const key = group.routineName || 'Free Workout'
        if (!map[key]) {
          map[key] = { name: key, workouts: 0, totalVolume: 0 }
        }
        map[key].workouts += 1
        map[key].totalVolume += group.totalVolume || 0
        return map
      }, {})
    ).sort((a, b) => {
      if ((b.totalVolume || 0) !== (a.totalVolume || 0)) return (b.totalVolume || 0) - (a.totalVolume || 0)
      return (b.workouts || 0) - (a.workouts || 0)
    })[0] || null

    const topDays = monthDates
      .map((date) => {
        const dayGroups = Object.values(grouped[date] || {})
        const daySessions = dayGroups.flatMap((group) => group.exercises || [])
        const dayVolume = daySessions.reduce((sum, session) => sum + (session.totalVolume || 0), 0)
        const dayCardioMinutes = daySessions
          .filter((session) => session.muscleGroup?.toLowerCase() === 'cardio')
          .reduce((sum, session) => sum + getExerciseBestValue(session), 0)
        const score = dayVolume + (dayCardioMinutes * 500)

        return {
          date,
          score,
          workoutCount: dayGroups.length,
          totalVolume: dayVolume,
          cardioMinutes: dayCardioMinutes,
          intensity: workoutDayMeta[date]?.intensity || 'complete',
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    const heavyDays = monthDates.filter((date) => workoutDayMeta[date]?.intensity === 'heavy').length

    return {
      activeDays: monthDates.length,
      totalWorkouts: monthGroups.length,
      totalVolume,
      totalCardioMinutes,
      heavyDays,
      topRoutine,
      topDays,
    }
  }, [grouped, monthEndStr, monthStartStr, workoutDayMeta])

  const monthInsight = useMemo(() => {
    if (!monthSummary) return null

    const previousMonth = subMonths(currentMonth, 1)
    const previousStartStr = format(startOfMonth(previousMonth), 'yyyy-MM-dd')
    const previousEndStr = format(endOfMonth(previousMonth), 'yyyy-MM-dd')
    const previousDates = Object.keys(grouped).filter((date) => date >= previousStartStr && date <= previousEndStr)
    const previousGroups = previousDates.flatMap((date) => Object.values(grouped[date] || {}))
    const previousVolume = previousGroups.reduce((sum, group) => sum + (group.totalVolume || 0), 0)

    if (previousGroups.length > 0 && previousVolume > 0 && monthSummary.totalVolume > 0) {
      const deltaPct = Math.round(((monthSummary.totalVolume - previousVolume) / previousVolume) * 100)
      if (deltaPct !== 0) {
        return {
          tone: deltaPct > 0 ? 'text-accent-green' : 'text-[#F2C14E]',
          text: `${deltaPct > 0 ? '+' : ''}${deltaPct}% volume vs ${format(previousMonth, 'MMMM')}`,
          detail: deltaPct > 0
            ? 'You are carrying more total workload this month.'
            : 'This month is lighter so far. A couple of strong sessions can change the trend quickly.',
        }
      }
    }

    if (monthSummary.topRoutine?.workouts >= 3) {
      return {
        tone: 'text-text-primary',
        text: `${monthSummary.topRoutine.name} is your anchor routine`,
        detail: `${monthSummary.topRoutine.workouts} logged workouts are building consistency around it.`,
      }
    }

    if (monthSummary.heavyDays >= 2) {
      return {
        tone: 'text-accent-green',
        text: `${monthSummary.heavyDays} heavy training days this month`,
        detail: 'You are stacking meaningful high-output sessions, not just checking the box.',
      }
    }

    if (monthSummary.totalCardioMinutes >= 90) {
      return {
        tone: 'text-accent',
        text: `${monthSummary.totalCardioMinutes} cardio minutes logged`,
        detail: 'Aerobic work is showing up consistently in your month, which will help recovery and conditioning.',
      }
    }

    return {
      tone: 'text-text-primary',
      text: `${monthSummary.activeDays} active day${monthSummary.activeDays === 1 ? '' : 's'} this month`,
      detail: 'Keep layering sessions together and the monthly patterns will get sharper.',
    }
  }, [currentMonth, grouped, monthSummary])

  // Which dates to show in the list
  const listDates = useMemo(() => {
    if (selectedDate) return grouped[selectedDate] ? [selectedDate] : []
    const allDates = Object.keys(grouped).sort().reverse()
    if (filter === 'week') return allDates.filter((d) => d >= weekStartStr && d <= weekEndStr)
    return allDates.filter((d) => d >= monthStartStr && d <= monthEndStr)
  }, [grouped, selectedDate, filter, monthStartStr, monthEndStr, weekStartStr, weekEndStr])

  // Calendar for current month
  const monthStart = startOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(currentMonth) })
  const startPad = getDay(monthStart)

  function handleDayClick(dateStr) {
    if (!workoutDates.has(dateStr)) return
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr))
    setExpandedKey(null)
  }

  function toggleExpand(key) {
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  return (
    <PageWrapper>
      <div className="px-4 pt-2 space-y-4 pb-6">

        {/* ── Page header ─────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">
              {format(currentMonth, 'MMMM yyyy')}
            </h1>
            <p className="text-text-secondary text-sm mt-0.5">Your training progress and history</p>
          </div>
          {/* Month prev / next */}
          <div className="flex gap-1 mt-1">
            <button
              onClick={() => { setCurrentMonth((m) => subMonths(m, 1)); setSelectedDate(null); setFilter('month') }}
              className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center active:scale-95 transition-transform"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => { setCurrentMonth((m) => addMonths(m, 1)); setSelectedDate(null); setFilter('month') }}
              className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center active:scale-95 transition-transform"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Calendar grid ────────────────────────────────── */}
	        <div className="grid grid-cols-2 gap-3">
	          <div className="card">
	            <p className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.18em]">Streak</p>
	            <p className={`mt-2 font-display text-2xl font-bold ${streakSummary.tone}`}>
	              {streakSummary.label}
	            </p>
	            <p className="mt-1 text-sm text-text-secondary">{streakSummary.detail}</p>
	          </div>
	          <div className="card">
	            <p className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.18em]">Consistency</p>
	            <p className="mt-2 font-display text-2xl font-bold text-text-primary">
	              {consistencySummary.percentage}%
	            </p>
	            <p className="mt-1 text-sm text-text-secondary">
	              {consistencySummary.label} • {consistencySummary.detail}
	            </p>
	          </div>
	        </div>

	        <div className="card">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="text-center text-text-secondary text-xs font-semibold py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startPad }).map((_, i) => <div key={`p-${i}`} />)}
            {days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const isToday = dateStr === TODAY
              const hasWorkout = workoutDates.has(dateStr)
              const isSelected = selectedDate === dateStr
              const intensity = workoutDayMeta[dateStr]?.intensity || null
              const workoutStateClass = intensity === 'heavy'
                ? 'bg-[#155E4A] text-[#7CF6BE]'
                : intensity === 'light'
                  ? 'bg-[#F2C14E]/18 text-[#F2C14E]'
                  : 'bg-accent-green/20 text-accent-green'
              const workoutDotClass = intensity === 'heavy'
                ? 'bg-[#7CF6BE]'
                : intensity === 'light'
                  ? 'bg-[#F2C14E]'
                  : 'bg-accent-green'
              return (
                <button
                  key={dateStr}
                  onClick={() => handleDayClick(dateStr)}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-all duration-200 active:scale-95 ${
                    isSelected
                      ? 'bg-accent text-white shadow-[0_10px_24px_rgba(37,99,235,0.32)] ring-1 ring-white/10 scale-[1.02]'
                      : hasWorkout
                      ? `${workoutStateClass} ${isToday ? 'ring-1 ring-white/10 shadow-[0_8px_20px_rgba(15,23,42,0.18)]' : ''}`
                      : isToday
                      ? 'bg-surface2 text-text-primary ring-1 ring-accent/35'
                      : 'text-text-secondary'
                  }`}
                >
                  <span>{day.getDate()}</span>
                  {hasWorkout && (
                    <div className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? 'bg-white/80' : isToday ? 'bg-white/80' : workoutDotClass}`} />
                  )}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-text-secondary">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#F2C14E]" />
              <span>Light session</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-accent-green" />
              <span>Workout done</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#7CF6BE]" />
              <span>Heavy day</span>
            </div>
          </div>
        </div>

        {/* ── Sessions list ────────────────────────────────── */}
        <div>
          {selectedDateSummary && (
            <div className="card border-accent/20 shadow-[0_0_0_1px_rgba(37,99,235,0.08)] mb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-text-secondary text-xs font-semibold uppercase tracking-[0.18em]">
                    {format(parseISO(selectedDate), 'MMMM d')}
                  </p>
                  <h2 className="mt-1 font-display text-xl font-bold text-text-primary truncate">
                    {selectedDateSummary.label}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {selectedDateSummary.workoutCount === 1
                      ? `${selectedDateSummary.exerciseCount} exercise${selectedDateSummary.exerciseCount === 1 ? '' : 's'}`
                      : `${selectedDateSummary.workoutCount} workouts • ${selectedDateSummary.exerciseCount} exercises`}
                    {selectedDateSummary.durationLabel ? ` • ${selectedDateSummary.durationLabel}` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`font-display text-2xl font-bold ${selectedDateSummary.isAllCardio ? 'text-accent' : 'text-accent-green'}`}>
                    {selectedDateSummary.isAllCardio ? selectedDateSummary.durationLabel || '--' : formatCompactVolume(selectedDateSummary.totalVolume)}
                  </p>
                  <p className="text-text-secondary text-xs">
                    {selectedDateSummary.isAllCardio ? 'time logged' : 'lbs lifted'}
                  </p>
                </div>
              </div>
              {selectedDateInsight && (
                <div className="mt-3 rounded-2xl border border-surface2 bg-surface2/60 px-3 py-2.5">
                  <p className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.18em]">Insight</p>
                  <p className={`mt-1 text-sm font-medium ${selectedDateInsight.tone}`}>
                    {selectedDateInsight.text}
                  </p>
                </div>
              )}
              {selectedDateCta && (
                <button
                  onClick={selectedDateCta.run}
                  className="mt-4 inline-flex items-center gap-2 text-accent font-semibold text-sm active:scale-95 transition-transform"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-1.427 1.529-2.33 2.779-1.643l9.42 5.173c1.295.711 1.295 2.575 0 3.286l-9.42 5.173c-1.25.687-2.779-.216-2.779-1.643V5.653z" />
                  </svg>
                  <span>{selectedDateCta.label}</span>
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <p className="section-title mb-0">
                {selectedDate
                  ? format(parseISO(selectedDate), 'MMMM d')
                  : filter === 'week'
                  ? 'This Week'
                  : format(currentMonth, 'MMMM')}
              </p>
              {/* Weekly goal progress — only show in week view without a selected date */}
              {!selectedDate && filter === 'week' && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  weekDaysCount >= WEEKLY_GOAL
                    ? 'bg-accent-green/20 text-accent-green'
                    : 'bg-surface2 text-text-secondary'
                }`}>
                  {weekDaysCount} / {WEEKLY_GOAL} days
                </span>
              )}
            </div>
            {selectedDate ? (
              <button
                onClick={() => setSelectedDate(null)}
                className="text-xs text-accent font-semibold"
              >
                Clear
              </button>
            ) : (
              <div className="flex gap-1.5">
                <button
                  onClick={() => setFilter('week')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    filter === 'week'
                      ? 'bg-accent-green text-white'
                      : 'bg-surface2 text-text-secondary'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setFilter('month')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    filter === 'month'
                      ? 'bg-accent-green text-white'
                      : 'bg-surface2 text-text-secondary'
                  }`}
                >
                  Month
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="card h-16 animate-pulse bg-surface2" />
              ))}
            </div>
          ) : !selectedDate && filter === 'month' ? (
            monthSummary ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="card">
                    <p className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.18em]">Workouts</p>
                    <p className="mt-2 font-display text-2xl font-bold text-text-primary">{monthSummary.totalWorkouts}</p>
                    <p className="mt-1 text-sm text-text-secondary">{monthSummary.activeDays} active days</p>
                  </div>
                  <div className="card">
                    <p className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.18em]">Volume</p>
                    <p className="mt-2 font-display text-2xl font-bold text-accent-green">{formatCompactVolume(monthSummary.totalVolume)}</p>
                    <p className="mt-1 text-sm text-text-secondary">lbs this month</p>
                  </div>
                  <div className="card">
                    <p className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.18em]">Cardio</p>
                    <p className="mt-2 font-display text-2xl font-bold text-accent">{monthSummary.totalCardioMinutes}m</p>
                    <p className="mt-1 text-sm text-text-secondary">minutes logged</p>
                  </div>
                  <div className="card">
                    <p className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.18em]">Best Routine</p>
                    <p className="mt-2 text-base font-semibold text-text-primary truncate">
                      {monthSummary.topRoutine?.name || 'No routine yet'}
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">
                      {monthSummary.topRoutine
                        ? `${monthSummary.topRoutine.workouts} workout${monthSummary.topRoutine.workouts === 1 ? '' : 's'}`
                        : 'Start logging to surface trends'}
                    </p>
                  </div>
                </div>

                {monthInsight && (
                  <div className="card border-accent/15 bg-surface2/35">
                    <p className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.18em]">Month Insight</p>
                    <p className={`mt-2 text-base font-semibold ${monthInsight.tone}`}>
                      {monthInsight.text}
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">{monthInsight.detail}</p>
                  </div>
                )}

                <div className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.18em]">Top Days</p>
                      <p className="mt-1 text-sm text-text-secondary">Your biggest training days this month</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {monthSummary.topDays.map((day, index) => {
                      const intensityClass = day.intensity === 'heavy'
                        ? 'bg-[#155E4A] text-[#7CF6BE]'
                        : day.intensity === 'light'
                          ? 'bg-[#F2C14E]/18 text-[#F2C14E]'
                          : 'bg-accent-green/20 text-accent-green'
                      return (
                        <button
                          key={day.date}
                          onClick={() => handleDayClick(day.date)}
                          className="w-full rounded-2xl border border-surface2 bg-surface2/40 px-3 py-3 text-left active:scale-[0.99] transition-transform"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-text-secondary text-xs font-semibold">#{index + 1}</span>
                                <p className="text-text-primary font-semibold">{format(parseISO(day.date), 'MMMM d')}</p>
                              </div>
                              <p className="mt-1 text-sm text-text-secondary">
                                {day.workoutCount} workout{day.workoutCount === 1 ? '' : 's'}
                                {day.totalVolume > 0 ? ` • ${formatCompactVolume(day.totalVolume)} lbs` : ''}
                                {day.cardioMinutes > 0 ? ` • ${day.cardioMinutes}m cardio` : ''}
                              </p>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${intensityClass}`}>
                              {day.intensity === 'heavy' ? 'Heavy' : day.intensity === 'light' ? 'Light' : 'Complete'}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card flex items-center justify-center py-10">
                <p className="text-text-secondary text-sm">No sessions found</p>
              </div>
            )
          ) : listDates.length === 0 ? (
            <div className="card flex items-center justify-center py-10">
              <p className="text-text-secondary text-sm">No sessions found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {listDates.flatMap((date) =>
                Object.values(grouped[date] || {}).map((group) => {
                  const key = `${date}-${group.routineName}`
                  const isExpanded = expandedKey === key
                  const exerciseCount = group.exercises.length
                  const routineTotal = group.routineId ? (routineMap[group.routineId]?.exercises?.length ?? null) : null
                  const isAllCardio = group.exercises.every(e => e.muscleGroup?.toLowerCase() === 'cardio')

                  return (
                    <div
                      key={key}
                      className={`card overflow-hidden transition-all duration-300 ${
                        isExpanded
                          ? 'bg-surface2/35 border-accent/25 shadow-[0_0_0_1px_rgba(37,99,235,0.12),0_12px_28px_rgba(15,23,42,0.24)]'
                          : 'shadow-none'
                      }`}
                    >
                      {/* Card header — tap to expand */}
                      <button
                        onClick={() => toggleExpand(key)}
                        className={`flex items-center justify-between w-full text-left rounded-xl transition-colors duration-200 ${
                          isExpanded ? 'bg-white/[0.02]' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-text-primary font-semibold text-sm">{group.routineName}</p>
                          <p className="text-text-secondary text-xs mt-0.5">
                            {format(parseISO(date), 'MMM d')} · {routineTotal && exerciseCount < routineTotal ? `${exerciseCount} of ${routineTotal}` : exerciseCount} exercise{(routineTotal && exerciseCount < routineTotal ? routineTotal : exerciseCount) !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          {group.totalVolume > 0 && !isAllCardio && (
                            <div className="text-right">
                              <p className="text-accent-green font-mono text-sm font-bold">
                                {group.totalVolume >= 1000
                                  ? `${(group.totalVolume / 1000).toFixed(1)}k`
                                  : group.totalVolume.toLocaleString()}
                              </p>
                              <p className="text-text-secondary text-xs">lbs vol.</p>
                            </div>
                          )}
                          <svg
                            className={`w-4 h-4 text-text-secondary transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>

                      {/* Expanded exercise rows */}
                      <div
                        className={`grid overflow-hidden transition-all duration-300 ease-out ${
                          isExpanded ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0 mt-0'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div
                            className={`space-y-1 transition-all duration-300 ${
                              isExpanded ? 'border-t border-surface2 pt-3' : 'border-t border-transparent pt-0'
                            }`}
                          >
	                          {group.exercises.map((ex) => {
	                            const isCardio = ex.muscleGroup?.toLowerCase() === 'cardio'
                            const bestWeight = (ex.sets || []).reduce(
                              (m, s) => Math.max(m, s.weight || 0), 0
                            )
                            const setCount = (ex.sets || []).length
                            const totalVol = ex.totalVolume || 0
                            return (
                              <button
                                key={ex.id}
                                onClick={() =>
                                  navigate(`/workout/${ex.exerciseId}`, {
                                    state: {
                                      exercise: {
                                        id: ex.exerciseId,
                                        name: ex.exerciseName,
                                        muscleGroup: ex.muscleGroup,
                                      },
                                    },
                                  })
                                }
	                                className="flex items-center justify-between w-full text-left py-2 active:scale-95 transition-transform"
	                              >
	                                <div className="min-w-0 flex-1 pr-3">
	                                  <div className="flex items-center gap-2 min-w-0">
	                                    <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
	                                    <p className="text-text-primary text-sm font-semibold truncate">{ex.exerciseName}</p>
	                                  </div>
	                                  <div className="mt-1 pl-3.5">
	                                    {isCardio ? (
	                                      <p className="text-text-secondary text-xs">
	                                        {setCount} set{setCount !== 1 ? 's' : ''}{bestWeight > 0 ? ` • Best ${bestWeight} min` : ''}
	                                      </p>
	                                    ) : (
	                                      <p className="text-text-secondary text-xs">
	                                        {setCount} set{setCount !== 1 ? 's' : ''}{totalVol > 0 ? ` • Volume ${formatCompactVolume(totalVol)}` : ''}
	                                      </p>
	                                    )}
	                                  </div>
	                                </div>
	                                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
	                                  {isCardio ? (
	                                    <div className="text-right">
	                                      <p className="text-accent font-display text-lg font-bold leading-none">
	                                        {bestWeight > 0 ? `${bestWeight}m` : '--'}
	                                      </p>
	                                      <p className="text-text-secondary text-[11px] mt-1">best time</p>
	                                    </div>
	                                  ) : (
	                                    <div className="text-right">
	                                      <p className="text-accent font-display text-lg font-bold leading-none">
	                                        {bestWeight > 0 ? `${bestWeight} lbs` : '--'}
	                                      </p>
	                                      <p className="text-text-secondary text-[11px] mt-1">top weight</p>
                                      </div>
                                    )}
                                  <svg className="w-3.5 h-3.5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
	                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

      </div>
    </PageWrapper>
  )
}
