// src/pages/WorkoutPage.jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  addDoc, updateDoc, getDocs, query, where, serverTimestamp,
} from 'firebase/firestore'
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { sessionsCol, sessionDoc } from '../firebase/collections'
import { useTimer } from '../context/TimerContext'
import PageWrapper from '../components/layout/PageWrapper'

const TODAY = format(new Date(), 'yyyy-MM-dd')
const TODAY_DISPLAY = format(new Date(), 'EEEE, MMM d')

// ─── Set Row (editable) ────────────────────────────────────
function SetRow({ set, index, onUpdate, onDelete, isCardio }) {
  const volume = (set.reps || 0) * (set.weight || 0)
  return (
    <div className="grid grid-cols-[28px_1fr_1fr_1fr_28px] gap-2 items-center py-2.5 border-b border-surface2 last:border-0">
      <span className="text-text-secondary text-sm text-center font-mono font-semibold">{index + 1}</span>
      <input
        type="number"
        inputMode="numeric"
        value={set.reps || ''}
        placeholder="0"
        onChange={(e) => onUpdate({ ...set, reps: Number(e.target.value) })}
        className="bg-surface2 rounded-lg px-2 py-2.5 text-text-primary text-base text-center w-full focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <input
        type="number"
        inputMode="decimal"
        value={set.weight || ''}
        placeholder={isCardio ? 'min' : '0'}
        onChange={(e) => onUpdate({ ...set, weight: Number(e.target.value) })}
        className="bg-surface2 rounded-lg px-2 py-2.5 text-white font-semibold text-base text-center w-full focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <span className="text-text-secondary text-sm text-right font-mono">
        {isCardio
          ? (set.weight > 0 ? `${set.weight}m` : '—')
          : (volume > 0 ? volume.toLocaleString() : '—')}
      </span>
      <button
        onClick={() => onDelete(set.id)}
        className="w-7 h-7 rounded-lg flex items-center justify-center active:scale-95 transition-transform text-text-secondary hover:text-accent-red"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ─── Past Set Row (read-only) ──────────────────────────────
function PastSetRow({ set, index, isCardio }) {
  const volume = (set.reps || 0) * (set.weight || 0)
  return (
    <div className="grid grid-cols-[28px_1fr_1fr_1fr] gap-2 items-center py-2.5 border-b border-surface2 last:border-0">
      <span className="text-text-secondary text-sm text-center font-mono font-semibold">{index + 1}</span>
      <span className="text-text-primary text-base text-center">{set.reps ?? '—'}</span>
      <span className="text-white font-semibold text-base text-center">{set.weight ?? '—'}</span>
      <span className="text-text-secondary text-sm text-right font-mono">
        {isCardio
          ? (set.weight > 0 ? `${set.weight}m` : '—')
          : (volume > 0 ? volume.toLocaleString() : '—')}
      </span>
    </div>
  )
}

// ─── Chart Tooltip ─────────────────────────────────────────
function ChartTooltip({ active, payload, label, isCardio }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-surface2 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary mb-0.5">{label}</p>
      <p className="text-accent font-bold font-mono">
        {Number(payload[0].value).toLocaleString()} {isCardio ? 'min' : 'lbs'}
      </p>
    </div>
  )
}

const CARDIO_RE = /\b(cardio|walking|walk|run|running|jog|jogging|bike|cycling|cycle|elliptical|swim|swimming|rowing|treadmill|stair|hiit)\b/i

// ─── Main Page ─────────────────────────────────────────────
export default function WorkoutPage() {
  const { exerciseId } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isRunning, toggle, reset, formatted } = useTimer()

  const exercise = state?.exercise ?? {
    id: exerciseId,
    name: exerciseId?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? '',
    muscleGroup: '',
  }
  const routine = state?.routine ?? null
  const isCardio = CARDIO_RE.test(exercise.muscleGroup || '') || CARDIO_RE.test(exercise.name || '')

  const [sets, setSets] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [history, setHistory] = useState([])
  const [pastSessionsData, setPastSessionsData] = useState([]) // for swipe cards
  const [lastHistoricalWeight, setLastHistoricalWeight] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Carousel
  const carouselRef = useRef(null)
  const [activePage, setActivePage] = useState(0)

  const saveTimeoutRef = useRef(null)
  const sessionIdRef = useRef(null)
  sessionIdRef.current = sessionId

  // ── Load today's session + past history ─────────────────
  useEffect(() => {
    if (!user || !exerciseId) return
    getDocs(query(sessionsCol(user.uid), where('exerciseId', '==', exerciseId))).then((snap) => {
      const all = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.date < b.date ? -1 : 1))

      const todaySession = all.find((s) => s.date === TODAY)
      if (todaySession) {
        setSessionId(todaySession.id)
        setSets(todaySession.sets || [])
      }

      const pastSessions = all.filter((s) => s.date !== TODAY)

      // Chart data (last 8)
      const pastHistory = pastSessions
        .slice(-8)
        .map((s) => ({ date: s.date.slice(5), volume: s.totalVolume || 0 }))
      setHistory(pastHistory)

      // Last 3 past sessions for swipe cards (newest first)
      setPastSessionsData([...pastSessions].reverse().slice(0, 3))

      // Default weight for new sets
      const lastPast = pastSessions.at(-1)
      const lastWeight = (lastPast?.sets || []).reduce((m, s) => Math.max(m, s.weight || 0), 0)
      setLastHistoricalWeight(lastWeight)

      setLoading(false)
    })
  }, [user, exerciseId])

  // ── Carousel scroll tracker ──────────────────────────────
  function handleCarouselScroll() {
    const el = carouselRef.current
    if (!el) return
    const page = Math.round(el.scrollLeft / el.clientWidth)
    setActivePage(page)
  }

  // ── Persist sets to Firestore ────────────────────────────
  async function persistSets(currentSets) {
    if (!user || !exerciseId) return
    setSaving(true)
    const totalVolume = currentSets.reduce((sum, s) => sum + (s.reps || 0) * (s.weight || 0), 0)
    const payload = {
      exerciseId,
      exerciseName: exercise.name,
      muscleGroup: exercise.muscleGroup || '',
      routineId: routine?.id || '',
      routineName: routine?.name || '',
      date: TODAY,
      sets: currentSets,
      totalVolume,
      updatedAt: serverTimestamp(),
    }
    const currentId = sessionIdRef.current
    if (currentId) {
      await updateDoc(sessionDoc(user.uid, currentId), payload)
    } else {
      const ref = await addDoc(sessionsCol(user.uid), { ...payload, createdAt: serverTimestamp() })
      setSessionId(ref.id)
    }
    setSaving(false)
  }

  function scheduleSave(updatedSets) {
    clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => persistSets(updatedSets), 900)
  }

  // ── Set mutations ────────────────────────────────────────
  function addSet() {
    const last = sets[sets.length - 1]
    const defaultWeight = last?.weight || lastHistoricalWeight || 0
    const defaultReps = last?.reps || 8
    const newSets = [
      ...sets,
      { id: Date.now().toString(), reps: defaultReps, weight: defaultWeight },
    ]
    setSets(newSets)
    scheduleSave(newSets)
  }

  function updateSet(updated) {
    const newSets = sets.map((s) => (s.id === updated.id ? updated : s))
    setSets(newSets)
    scheduleSave(newSets)
  }

  function deleteSet(id) {
    const newSets = sets.filter((s) => s.id !== id)
    setSets(newSets)
    scheduleSave(newSets)
  }

  function goBack() {
    if (routine?.id) {
      navigate('/routines', { state: { openRoutineId: routine.id } })
    } else {
      navigate(-1)
    }
  }

  async function handleFinish() {
    clearTimeout(saveTimeoutRef.current)
    await persistSets(sets)
    reset()
    goBack()
  }

  // ── Derived values ────────────────────────────────────────
  const totalVolume = sets.reduce((sum, s) => sum + (s.reps || 0) * (s.weight || 0), 0)
  const bestWeight = sets.reduce((max, s) => Math.max(max, s.weight || 0), 0)
  const chartData = [
    ...history,
    ...(totalVolume > 0 ? [{ date: 'Today', volume: totalVolume }] : []),
  ]

  const totalPages = 1 + pastSessionsData.length

  return (
    <PageWrapper showHeader={false}>
      <div className="flex flex-col h-full">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-text-secondary text-sm active:scale-95 transition-transform"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              {routine ? routine.name : 'Back'}
            </button>
            {saving && (
              <span className="text-text-secondary text-xs ml-auto animate-pulse-soft">Saving…</span>
            )}
          </div>

          {/* Exercise tabs */}
          {routine?.exercises?.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-none">
              {routine.exercises.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() =>
                    ex.id !== exerciseId &&
                    navigate(`/workout/${ex.id}`, { state: { exercise: ex, routine } })
                  }
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    ex.id === exerciseId
                      ? 'bg-accent text-white'
                      : 'bg-surface2 text-text-secondary'
                  }`}
                >
                  {ex.name}
                </button>
              ))}
            </div>
          )}

          <h1 className="font-display text-2xl font-bold text-text-primary leading-tight">
            {exercise.name}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {exercise.muscleGroup && (
              <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-lg">
                {exercise.muscleGroup}
              </span>
            )}
            {routine?.name && (
              <span className="text-text-secondary text-xs">{routine.name}</span>
            )}
          </div>
        </div>

        {/* ── Volume History Chart ────────────────────────── */}
        <div className="mx-4 mb-3 flex-shrink-0">
          <div className="card p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="section-title mb-0">{isCardio ? 'Duration History' : 'Volume History'}</p>
              {bestWeight > 0 && (
                <p className="text-text-secondary text-sm">
                  Best: <span className="text-accent-green font-semibold">{bestWeight} {isCardio ? 'min' : 'lbs'}</span>
                </p>
              )}
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1A56DB" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#1A56DB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#94A3B8', fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={(props) => <ChartTooltip {...props} isCardio={isCardio} />} />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    stroke="#1A56DB"
                    strokeWidth={2}
                    fill="url(#volGrad)"
                    dot={{ fill: '#1A56DB', r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 4, fill: '#1A56DB' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-20 flex items-center justify-center">
                <p className="text-text-secondary text-xs">Log your first set to see history</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Sets Carousel ───────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col">

          {/* Horizontal swipe area */}
          <div
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="flex-1 flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
          >

            {/* ── Today's card ──────────────────────────── */}
            <div className="flex-shrink-0 w-full overflow-y-auto px-4 pb-2">
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-text-secondary text-xs font-semibold">{TODAY_DISPLAY}</p>
                  {pastSessionsData.length > 0 && activePage === 0 && (
                    <p className="text-text-secondary text-[10px] flex items-center gap-1">
                      swipe for history
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </p>
                  )}
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[28px_1fr_1fr_1fr_28px] gap-2 pb-2 border-b border-surface2 mb-1">
                  {['#', 'Reps', isCardio ? 'Min' : 'Lbs', isCardio ? 'Time' : 'Vol', ''].map((h, i) => (
                    <span key={i} className="text-text-secondary text-sm font-semibold text-center">{h}</span>
                  ))}
                </div>

                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : sets.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-text-secondary text-sm">No sets yet</p>
                    <p className="text-text-secondary text-xs mt-1">Tap Add Set to start tracking</p>
                  </div>
                ) : (
                  [...sets].reverse().map((set, i) => (
                    <SetRow
                      key={set.id}
                      set={set}
                      index={sets.length - 1 - i}
                      onUpdate={updateSet}
                      onDelete={deleteSet}
                      isCardio={isCardio}
                    />
                  ))
                )}

                {/* Add Set + Total */}
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-surface2">
                  <button
                    onClick={addSet}
                    className="text-white text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Add Set
                  </button>
                  <div className="text-right">
                    <p className="text-text-secondary text-xs">{isCardio ? 'Total Time' : 'Total Volume'}</p>
                    <p className="font-display font-bold text-accent-green text-lg leading-tight">
                      {isCardio
                        ? (totalVolume > 0 ? `${totalVolume} min` : '—')
                        : (totalVolume > 0 ? `${totalVolume.toLocaleString()} lbs` : '—')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Past session cards (read-only) ───────────── */}
            {pastSessionsData.map((session) => {
              const sessionSets = session.sets || []
              const sessionVol = session.totalVolume || 0
              const dateLabel = format(parseISO(session.date), 'EEEE, MMM d')
              return (
                <div key={session.id} className="flex-shrink-0 w-full overflow-y-auto px-4 pb-2">
                  <div className="card">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-text-secondary text-xs font-semibold">{dateLabel}</p>
                      <span className="text-[10px] text-text-secondary bg-surface2 px-2 py-0.5 rounded-lg">
                        Previous
                      </span>
                    </div>

                    {/* Column headers */}
                    <div className="grid grid-cols-[28px_1fr_1fr_1fr] gap-2 pb-2 border-b border-surface2 mb-1">
                      {['#', 'Reps', isCardio ? 'Min' : 'Lbs', isCardio ? 'Time' : 'Vol'].map((h, i) => (
                        <span key={i} className="text-text-secondary text-sm font-semibold text-center">{h}</span>
                      ))}
                    </div>

                    {sessionSets.length === 0 ? (
                      <div className="py-6 text-center">
                        <p className="text-text-secondary text-sm">No sets recorded</p>
                      </div>
                    ) : (
                      [...sessionSets].reverse().map((set, i) => (
                        <PastSetRow
                          key={set.id || i}
                          set={set}
                          index={sessionSets.length - 1 - i}
                          isCardio={isCardio}
                        />
                      ))
                    )}

                    {/* Total */}
                    <div className="flex justify-end mt-3 pt-2.5 border-t border-surface2">
                      <div className="text-right">
                        <p className="text-text-secondary text-xs">{isCardio ? 'Total Time' : 'Total Volume'}</p>
                        <p className="font-display font-bold text-text-secondary text-lg leading-tight">
                          {isCardio
                            ? (sessionVol > 0 ? `${sessionVol} min` : '—')
                            : (sessionVol > 0 ? `${sessionVol.toLocaleString()} lbs` : '—')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Page dot indicators */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-1.5 py-2 flex-shrink-0">
              {Array.from({ length: totalPages }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-200 ${
                    activePage === i
                      ? 'w-4 h-1.5 bg-accent'
                      : 'w-1.5 h-1.5 bg-surface2'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer: Rest Timer + Finish ─────────────────── */}
        <div className="px-4 pb-8 pt-3 flex gap-2 items-center flex-shrink-0 border-t border-surface2">
          <div className="flex items-center gap-2 bg-surface border border-surface2 rounded-xl px-3 py-2.5 flex-1">
            <svg className="w-4 h-4 text-text-secondary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-mono text-text-primary text-base font-bold tracking-wide">{formatted()}</span>
            <button
              onClick={toggle}
              className={`text-sm font-semibold ml-auto transition-colors ${
                isRunning ? 'text-accent-green' : 'text-accent'
              }`}
            >
              {isRunning ? 'Pause' : 'Start'}
            </button>
            <button onClick={reset} className="text-sm text-text-secondary">
              Reset
            </button>
          </div>
          <button onClick={handleFinish} className="btn-primary px-5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Finish
          </button>
        </div>

      </div>
    </PageWrapper>
  )
}
