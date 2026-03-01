// src/pages/CalendarLog.jsx
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths, parseISO,
  startOfWeek, endOfWeek,
} from 'date-fns'
import { getDocs } from 'firebase/firestore'
import PageWrapper from '../components/layout/PageWrapper'
import { useAuth } from '../context/AuthContext'
import { sessionsCol } from '../firebase/collections'

const TODAY = format(new Date(), 'yyyy-MM-dd')
const TODAY_DISPLAY = format(new Date(), 'EEE, MMM d')

export default function CalendarLog() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [expandedKey, setExpandedKey] = useState(null)
  const [filter, setFilter] = useState('week') // 'week' | 'month'

  useEffect(() => {
    if (!user?.uid) return
    user.getIdToken()
      .then(() => getDocs(sessionsCol(user.uid)))
      .then((snap) => {
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user?.uid])

  // All dates with at least one session
  const workoutDates = useMemo(
    () => new Set(sessions.map((s) => s.date).filter(Boolean)),
    [sessions]
  )

  // Group: date → routineName → { routineName, exercises[], totalVolume }
  const grouped = useMemo(() => {
    const map = {}
    for (const s of sessions) {
      if (!s.date) continue
      if (!map[s.date]) map[s.date] = {}
      const key = s.routineName || 'Free Workout'
      if (!map[s.date][key]) map[s.date][key] = { routineName: key, exercises: [], totalVolume: 0 }
      map[s.date][key].exercises.push(s)
      map[s.date][key].totalVolume += s.totalVolume || 0
    }
    return map
  }, [sessions])

  // Bounds for filters
  const monthStartStr = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const monthEndStr   = format(endOfMonth(currentMonth),   'yyyy-MM-dd')
  const weekStartStr  = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEndStr    = format(endOfWeek(new Date(),   { weekStartsOn: 1 }), 'yyyy-MM-dd')

  // Days worked out this week (for the progress counter)
  const weekDaysCount = useMemo(
    () => Object.keys(grouped).filter((d) => d >= weekStartStr && d <= weekEndStr).length,
    [grouped, weekStartStr, weekEndStr]
  )
  const WEEKLY_GOAL = 3

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
    <PageWrapper showHeader={false}>
      <div className="px-4 pt-4 space-y-4 pb-6">

        {/* ── Page header ─────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-text-secondary text-sm">{TODAY_DISPLAY}</p>
            <h1 className="font-display text-2xl font-bold text-text-primary">
              {format(currentMonth, 'MMMM yyyy')}
            </h1>
            <p className="text-text-secondary text-sm mt-0.5">Your workout history</p>
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
              return (
                <button
                  key={dateStr}
                  onClick={() => handleDayClick(dateStr)}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-colors active:scale-95 ${
                    isToday
                      ? 'bg-accent text-white'
                      : isSelected
                      ? 'bg-accent-green text-white'
                      : hasWorkout
                      ? 'bg-accent-green/20 text-accent-green'
                      : 'text-text-secondary'
                  }`}
                >
                  <span>{day.getDate()}</span>
                  {hasWorkout && !isToday && !isSelected && (
                    <div className="w-1 h-1 rounded-full bg-accent-green mt-0.5" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Sessions list ────────────────────────────────── */}
        <div>
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

                  return (
                    <div key={key} className="card overflow-hidden">
                      {/* Card header — tap to expand */}
                      <button
                        onClick={() => toggleExpand(key)}
                        className="flex items-center justify-between w-full text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-text-primary font-semibold text-sm">{group.routineName}</p>
                          <p className="text-text-secondary text-xs mt-0.5">
                            {format(parseISO(date), 'MMM d')} · {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          {group.totalVolume > 0 && (
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
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-surface2 space-y-1">
                          {group.exercises.map((ex) => {
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
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                                  <p className="text-text-primary text-sm truncate">{ex.exerciseName}</p>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                                  <p className="text-text-secondary text-xs">
                                    {setCount} set{setCount !== 1 ? 's' : ''}
                                  </p>
                                  {bestWeight > 0 && (
                                    <p className="text-accent font-mono text-xs font-semibold">
                                      {bestWeight} lbs
                                    </p>
                                  )}
                                  {totalVol > 0 && (
                                    <p className="text-text-secondary text-xs font-mono">
                                      {totalVol >= 1000
                                        ? `${(totalVol / 1000).toFixed(1)}k`
                                        : totalVol.toLocaleString()}
                                    </p>
                                  )}
                                  <svg className="w-3.5 h-3.5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
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
