import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  addDoc, updateDoc, getDocs, query, where, serverTimestamp,
} from 'firebase/firestore'
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import TrendPointDot, { annotateTrendPoints, getTrendToneMeta } from '../components/charts/TrendPointDot'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAuth } from '../context/AuthContext'
import { sessionsCol, sessionDoc } from '../firebase/collections'
import { useTimer } from '../context/TimerContext'
import useNumericField from '../hooks/useNumericField'
import { deriveExerciseHistory, ensureSetIds, formatWeight, lastTrainedLabel } from '../utils/sessionHistory'
import PageWrapper from '../components/layout/PageWrapper'

const TODAY = format(new Date(), 'yyyy-MM-dd')
const TODAY_DISPLAY = format(new Date(), 'EEEE, MMM d')
const CARDIO_RE = /\b(cardio|walking|walk|run|running|jog|jogging|bike|cycling|cycle|elliptical|swim|swimming|rowing|treadmill|stair|hiit)\b/i

function SetRow({ set, index, onUpdate, onDelete, isCardio }) {
  const reps = useNumericField(set.reps, (value) => onUpdate(set.id, { reps: value }))
  const weight = useNumericField(set.weight, (value) => onUpdate(set.id, { weight: value }))
  const volume = (set.reps || 0) * (set.weight || 0)

  return (
    <div className="grid grid-cols-[28px_1fr_1fr_1fr_28px] gap-2 items-center py-2.5 border-b border-surface2 last:border-0">
      <span className="text-text-secondary text-sm text-center font-mono font-semibold">{index + 1}</span>
      <input
        type="text"
        inputMode="numeric"
        value={reps.value}
        placeholder="0"
        onChange={reps.onChange}
        className="bg-surface2 rounded-lg px-2 py-2.5 text-text-primary text-base text-center w-full focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <input
        type="text"
        inputMode="decimal"
        value={weight.value}
        placeholder={isCardio ? 'min' : '0'}
        onChange={weight.onChange}
        className="bg-surface2 rounded-lg px-2 py-2.5 text-white font-semibold text-base text-center w-full focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <span className="text-text-secondary text-sm text-right font-mono">
        {isCardio
          ? (set.weight > 0 ? `${set.weight}m` : '-')
          : (volume > 0 ? volume.toLocaleString() : '-')}
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

function PastSetRow({ set, index, isCardio }) {
  const volume = (set.reps || 0) * (set.weight || 0)

  return (
    <div className="grid grid-cols-[28px_1fr_1fr_1fr] gap-2 items-center py-2.5 border-b border-surface2 last:border-0">
      <span className="text-text-secondary text-sm text-center font-mono font-semibold">{index + 1}</span>
      <span className="text-text-primary text-base text-center">{set.reps ?? '-'}</span>
      <span className="text-white font-semibold text-base text-center">{set.weight ?? '-'}</span>
      <span className="text-text-secondary text-sm text-right font-mono">
        {isCardio
          ? (set.weight > 0 ? `${set.weight}m` : '-')
          : (volume > 0 ? volume.toLocaleString() : '-')}
      </span>
    </div>
  )
}

function ChartTooltip({ active, payload, label, isCardio }) {
  if (!active || !payload?.length) return null
  const tone = payload[0]?.payload?.trendTone || 'normal'
  const toneLabel = tone === 'best' ? 'Peak session' : tone === 'low' ? 'Lowest session' : 'Session'
  const toneMeta = getTrendToneMeta(tone)

  return (
    <div className="bg-surface border border-surface2 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary mb-0.5">{label}</p>
      <p className="text-accent font-bold font-mono">
        {Number(payload[0].value).toLocaleString()} {isCardio ? 'min' : 'lbs'}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-secondary">
        <span className={`h-2.5 w-2.5 rounded-full ${toneMeta.dotClass}`} />
        <span>{toneLabel}</span>
      </div>
    </div>
  )
}

export default function LegacyExerciseWorkout() {
  const { exerciseId } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isRunning, toggle, reset, restart, formatted } = useTimer()

  const exercise = state?.exercise ?? {
    id: exerciseId,
    name: exerciseId?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? '',
    muscleGroup: '',
  }
  const routine = state?.routine ?? null
  const isCardio = exercise.type === 'time' || CARDIO_RE.test(exercise.muscleGroup || '') || CARDIO_RE.test(exercise.name || '')

  const [sets, setSets] = useState([])
  const [history, setHistory] = useState([])
  const [pastSessionsData, setPastSessionsData] = useState([])
  const [lastHistoricalWeight, setLastHistoricalWeight] = useState(0)
  const [historicalBestWeight, setHistoricalBestWeight] = useState(0)
  const [lastTemplate, setLastTemplate] = useState({ reps: 8, weight: 0 })
  const [sessionCount, setSessionCount] = useState(0)
  const [lastTrainedDate, setLastTrainedDate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activePage, setActivePage] = useState(0)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [containerH, setContainerH] = useState(() => {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    return viewportHeight - 64
  })

  const carouselRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  // sessionIdsRef and setsRef are written synchronously (not during render) so a
  // queued save always sees the newest id and the newest sets.
  // Keyed by exercise: the routine chip row swaps exerciseId without unmounting,
  // so a single ref would let a queued save write one exercise's sets against
  // the next exercise's id.
  const sessionIdsRef = useRef({})
  const setsRef = useRef(sets)
  const saveChainRef = useRef(Promise.resolve())
  const pendingSaveRef = useRef(null)
  const flushPendingRef = useRef(() => Promise.resolve())

  function commitSets(computeNextSets) {
    const nextSets = computeNextSets(setsRef.current)
    setsRef.current = nextSets
    setSets(nextSets)
    return nextSets
  }

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return undefined

    const updateHeight = () => {
      const keyboardOpen = window.innerHeight - viewport.height > 50
      setContainerH(viewport.height - (keyboardOpen ? 0 : 64))
    }

    viewport.addEventListener('resize', updateHeight)
    updateHeight()

    return () => viewport.removeEventListener('resize', updateHeight)
  }, [])


  useEffect(() => {
    if (!user || !exerciseId) return

    setsRef.current = []
    setSets([])
        setHistory([])
        setPastSessionsData([])
        sessionIdsRef.current[exerciseId] = null
        setLastTemplate({ reps: 8, weight: 0 })
        setSessionCount(0)
        setLastTrainedDate(null)
        setHistoricalBestWeight(0)
        setLoading(true)

    user.getIdToken()
      .then(() => getDocs(query(sessionsCol(user.uid), where('exerciseId', '==', exerciseId))))
      .then((snapshot) => {
        // Same derivation the routine cards use, so the two screens cannot
        // disagree about the last session's reps and weight.
        const history = deriveExerciseHistory(
          snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })),
          TODAY
        )
        const { pastSessions, recentPast, todaySession } = history

        if (todaySession) {
          sessionIdsRef.current[exerciseId] = todaySession.id
          setsRef.current = history.todaySets
          setSets(history.todaySets)
        }

        setHistory(
          pastSessions.slice(-8).map((session) => ({
            date: (session.date || '').slice(5),
            volume: session.totalVolume || 0,
          }))
        )
        setPastSessionsData(
          [...pastSessions].reverse().slice(0, 3).map((session) => ({
            ...session,
            sets: ensureSetIds(session.sets),
          }))
        )
        setSessionCount(history.sessionCount)
        setLastTrainedDate(history.lastTrainedDate)
        setLastTemplate(history.lastTemplate)

        const lastWeight = (recentPast?.sets || []).reduce(
          (maxWeight, set) => Math.max(maxWeight, Number(set?.weight) || 0),
          0
        )
        setLastHistoricalWeight(lastWeight)

        const bestWeight = pastSessions.reduce(
          (maxWeight, session) => (session.sets || []).reduce(
            (sessionMax, set) => Math.max(sessionMax, Number(set?.weight) || 0),
            maxWeight
          ),
          0
        )
        setHistoricalBestWeight(bestWeight)
        setLoading(false)
      })
      .catch((error) => {
        console.error('LegacyExerciseWorkout load error:', error)
        setLoading(false)
      })
  }, [user, exerciseId])

  // Flush rather than discard: the previous cleanup dropped anything still
  // inside the 900ms debounce when you navigated away without pressing Finish.
  useEffect(() => () => {
    flushPendingRef.current().catch((error) => console.error('pending save flush error:', error))
  }, [])

  useEffect(() => {
    if (loading) return
    const element = carouselRef.current
    if (!element || pastSessionsData.length === 0) return

    requestAnimationFrame(() => {
      element.scrollTo({ left: pastSessionsData.length * element.clientWidth, behavior: 'instant' })
    })
  }, [loading, pastSessionsData.length])

  function handleCarouselScroll() {
    const element = carouselRef.current
    if (!element) return
    const page = Math.round(element.scrollLeft / element.clientWidth)
    setActivePage(page)
  }

  // Snapshot of what a save writes against, taken when the edit happens rather
  // than when the request fires.
  function currentSaveTarget() {
    return {
      exerciseId,
      exerciseName: exercise.name,
      muscleGroup: exercise.muscleGroup || '',
      routineId: routine?.id || '',
      routineName: routine?.name || '',
    }
  }

  async function persistSets(target, currentSets) {
    if (!user || !target?.exerciseId) return
    const sessionId = sessionIdsRef.current[target.exerciseId] || null
    if (currentSets.length === 0 && !sessionId) return

    setSaving(true)
    try {
      const totalVolume = currentSets.reduce((sum, set) => sum + (set.reps || 0) * (set.weight || 0), 0)
      const payload = {
        ...target,
        date: TODAY,
        sets: currentSets,
        totalVolume,
        updatedAt: serverTimestamp(),
      }

      if (sessionId) {
        await updateDoc(sessionDoc(user.uid, sessionId), payload)
      } else {
        const ref = await addDoc(sessionsCol(user.uid), { ...payload, createdAt: serverTimestamp() })
        // Record the id before yielding so a following save updates this
        // document instead of creating a second one for the same day.
        sessionIdsRef.current[target.exerciseId] = ref.id
      }
    } finally {
      setSaving(false)
    }
  }

  // Saves run one at a time; an in-flight addDoc must finish before the next
  // save decides whether a document already exists.
  function queueSave(target, nextSets) {
    saveChainRef.current = saveChainRef.current
      .catch(() => {})
      .then(() => persistSets(target, nextSets))
    return saveChainRef.current
  }

  function flushPendingSave() {
    clearTimeout(saveTimeoutRef.current)
    const pending = pendingSaveRef.current
    pendingSaveRef.current = null
    if (!pending) return Promise.resolve()
    return queueSave(pending.target, pending.sets)
  }

  flushPendingRef.current = flushPendingSave

  function scheduleSave(updatedSets) {
    clearTimeout(saveTimeoutRef.current)
    pendingSaveRef.current = { target: currentSaveTarget(), sets: updatedSets }
    saveTimeoutRef.current = setTimeout(() => {
      flushPendingSave().catch((error) => console.error('scheduleSave error:', error))
    }, 900)
  }

  function addSet() {
    const nextSets = commitSets((currentSets) => {
      const lastSet = currentSets[currentSets.length - 1]
      const defaultWeight = lastSet != null ? lastSet.weight : (lastTemplate.weight || lastHistoricalWeight || 0)
      const defaultReps = lastSet?.reps || lastTemplate.reps || 8
      return [
        ...currentSets,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, reps: defaultReps, weight: defaultWeight },
      ]
    })
    scheduleSave(nextSets)
    restart()
  }

  // `patch` holds only the edited field and is merged into the current set, so
  // editing reps cannot write back a stale weight.
  function updateSet(setId, patch) {
    const nextSets = commitSets((currentSets) => (
      currentSets.map((set) => (set.id === setId ? { ...set, ...patch } : set))
    ))
    scheduleSave(nextSets)
  }

  function deleteSet(id) {
    setPendingDeleteId(id)
  }

  function confirmDeleteSet() {
    if (!pendingDeleteId) return
    deletePendingSet(pendingDeleteId)
    setPendingDeleteId(null)
  }

  function cancelDeleteSet() {
    setPendingDeleteId(null)
  }

  function deletePendingSet(id) {
    const nextSets = commitSets((currentSets) => currentSets.filter((set) => set.id !== id))
    scheduleSave(nextSets)
  }

  function goBack() {
    if (routine?.id) {
      navigate('/routines', { state: { openRoutineId: routine.id } })
      return
    }
    if (state?.returnTo) {
      navigate(state.returnTo)
      return
    }
    navigate(-1)
  }

  async function handleFinish() {
    const target = currentSaveTarget()
    await flushPendingSave()
    const currentSets = setsRef.current
    if (currentSets.length > 0) {
      await queueSave(target, currentSets)
    }
    reset()
    goBack()
  }

  const totalVolume = sets.reduce((sum, set) => sum + (set.reps || 0) * (set.weight || 0), 0)
  const todayBestWeight = sets.reduce((maxWeight, set) => Math.max(maxWeight, set.weight || 0), 0)
  const bestWeight = Math.max(todayBestWeight, historicalBestWeight)
  const chartData = annotateTrendPoints([
    ...history,
    ...(totalVolume > 0 ? [{ date: 'Today', volume: totalVolume }] : []),
  ], 'volume')
  const totalPages = 1 + pastSessionsData.length

  return (
    <PageWrapper showHeader={false} showBottomNav={false} className="!pb-0">
      <div className="flex flex-col" style={{ height: containerH }}>
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
              <span className="text-text-secondary text-xs ml-auto animate-pulse-soft">Saving...</span>
            )}
          </div>

          {routine?.exercises?.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-none">
              {routine.exercises.map((routineExercise) => (
                <button
                  key={routineExercise.id}
                  onClick={() =>
                    routineExercise.id !== exerciseId &&
                    navigate(`/workout/${routineExercise.id}`, { state: { exercise: routineExercise, routine } })
                  }
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    routineExercise.id === exerciseId
                      ? 'bg-accent text-white'
                      : 'bg-surface2 text-text-secondary'
                  }`}
                >
                  {routineExercise.name}
                </button>
              ))}
            </div>
          )}

          <h1 className="font-display text-2xl font-bold text-text-primary leading-tight">{exercise.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            {exercise.muscleGroup && (
              <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-lg">
                {exercise.muscleGroup}
              </span>
            )}
            {routine?.name && <span className="text-text-secondary text-xs">{routine.name}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {sessionCount > 0 && (
              <span className="text-[11px] text-text-secondary">
                {sessionCount} session{sessionCount !== 1 ? 's' : ''}
              </span>
            )}
            {lastTrainedDate && (
              <span className="text-[11px] text-text-secondary">
                {lastTrainedLabel(lastTrainedDate)}
              </span>
            )}
          </div>
        </div>

        <div className="mx-4 mb-3 flex-shrink-0">
          <div className="card p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="section-title mb-0">{isCardio ? 'Duration History' : 'Volume History'}</p>
              {bestWeight > 0 && (
                <p className="text-text-secondary text-sm">
                  {isCardio ? 'Longest:' : 'Top set:'}{' '}
                  <span className="text-accent-green font-semibold">
                    {formatWeight(bestWeight)} {isCardio ? 'min' : 'lbs'}
                  </span>
                </p>
              )}
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vol-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1A56DB" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#1A56DB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={(props) => <ChartTooltip {...props} isCardio={isCardio} />} />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    stroke="#1A56DB"
                    strokeWidth={2}
                    fill="url(#vol-grad)"
                    dot={(props) => <TrendPointDot {...props} />}
                    activeDot={(props) => <TrendPointDot {...props} />}
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

        <div className="flex-1 overflow-hidden flex flex-col">
          <div
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="flex-1 flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
          >
            {[...pastSessionsData].reverse().map((session) => {
              const sessionSets = session.sets || []
              const sessionVolume = session.totalVolume || 0
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

                    <div className="grid grid-cols-[28px_1fr_1fr_1fr] gap-2 pb-2 border-b border-surface2 mb-1">
                      {['#', 'Reps', isCardio ? 'Min' : 'Lbs', isCardio ? 'Time' : 'Vol'].map((label) => (
                        <span key={label} className="text-text-secondary text-sm font-semibold text-center">{label}</span>
                      ))}
                    </div>

                    {sessionSets.length === 0 ? (
                      <div className="py-6 text-center">
                        <p className="text-text-secondary text-sm">No sets recorded</p>
                      </div>
                    ) : (
                      sessionSets.map((set, index) => (
                        <PastSetRow
                          key={set.id}
                          set={set}
                          index={index}
                          isCardio={isCardio}
                        />
                      ))
                    )}

                    <div className="flex justify-end mt-3 pt-2.5 border-t border-surface2">
                      <div className="text-right">
                        <p className="text-text-secondary text-xs">{isCardio ? 'Total Time' : 'Total Volume'}</p>
                        <p className="font-display font-bold text-text-secondary text-lg leading-tight">
                          {isCardio
                            ? (sessionVolume > 0 ? `${sessionVolume} min` : '-')
                            : (sessionVolume > 0 ? `${sessionVolume.toLocaleString()} lbs` : '-')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="flex-shrink-0 w-full overflow-y-auto px-4 pb-2">
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-text-secondary text-xs font-semibold">{TODAY_DISPLAY}</p>
                  {pastSessionsData.length > 0 && activePage === totalPages - 1 && (
                    <p className="text-text-secondary text-[10px] flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      history
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-[28px_1fr_1fr_1fr_28px] gap-2 pb-2 border-b border-surface2 mb-1">
                  {['#', 'Reps', isCardio ? 'Min' : 'Lbs', isCardio ? 'Time' : 'Vol', ''].map((label) => (
                    <span key={label} className="text-text-secondary text-sm font-semibold text-center">{label}</span>
                  ))}
                </div>

                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : sets.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-text-secondary text-sm">No sets yet</p>
                    <p className="text-text-secondary text-xs mt-1">
                      Use Add Set below to start with {lastTemplate.reps} reps x {formatWeight(lastTemplate.weight)} {isCardio ? 'min' : 'lbs'}
                    </p>
                  </div>
                ) : (
                  sets.map((set, index) => (
                    <SetRow
                      key={set.id}
                      set={set}
                      index={index}
                      onUpdate={updateSet}
                      onDelete={deleteSet}
                      isCardio={isCardio}
                    />
                  ))
                )}

                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-surface2">
                  <button
                    onClick={addSet}
                    className="text-accent-green text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
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
                        ? (totalVolume > 0 ? `${totalVolume} min` : '-')
                        : (totalVolume > 0 ? `${totalVolume.toLocaleString()} lbs` : '-')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-1.5 py-2 flex-shrink-0">
              {Array.from({ length: totalPages }).map((_, index) => (
                <div
                  key={index}
                  className={`rounded-full transition-all duration-200 ${
                    activePage === index ? 'w-4 h-1.5 bg-accent' : 'w-1.5 h-1.5 bg-surface2'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <div
          className="px-4 pt-3 flex gap-2 items-center flex-shrink-0 border-t border-surface2"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
        >
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
      {pendingDeleteId && (
        <ConfirmDialog
          title="Delete set?"
          message="This set will be removed from the workout log."
          confirmLabel="Delete"
          onCancel={cancelDeleteSet}
          onConfirm={confirmDeleteSet}
        />
      )}
    </PageWrapper>
  )
}
