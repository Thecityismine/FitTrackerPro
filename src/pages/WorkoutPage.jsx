import { useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { addDoc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import PageWrapper from '../components/layout/PageWrapper'
import { useActiveWorkout } from '../context/ActiveWorkoutContext'
import { useAuth } from '../context/AuthContext'
import { useTimer } from '../context/TimerContext'
import { sessionDoc, sessionsCol } from '../firebase/collections'
import LegacyExerciseWorkout from './LegacyExerciseWorkout'

const TODAY = format(new Date(), 'yyyy-MM-dd')
const CARDIO_RE = /\b(cardio|walking|walk|run|running|jog|jogging|bike|cycling|cycle|elliptical|swim|swimming|rowing|treadmill|stair|hiit)\b/i

function isCardioExercise(exercise) {
  return exercise?.type === 'time' || CARDIO_RE.test(exercise?.muscleGroup || '') || CARDIO_RE.test(exercise?.name || '')
}

function formatWeight(value) {
  if (!Number.isFinite(value) || value <= 0) return '0'
  return Number.isInteger(value) ? `${value}` : value.toFixed(1)
}

function formatVolume(value) {
  if (!value) return '0'
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toLocaleString()
}

function normalizeSet(set, fallback = {}) {
  return {
    id: set?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    reps: Number.isFinite(set?.reps) ? set.reps : (fallback.reps ?? 8),
    weight: Number.isFinite(set?.weight) ? set.weight : (fallback.weight ?? 0),
  }
}

function buildExerciseState(exercises, sessions) {
  return exercises.reduce((result, exercise) => {
    const exerciseSessions = sessions
      .filter((session) => session.exerciseId === exercise.id)
      .sort((a, b) => a.date.localeCompare(b.date))
    const todaySession = exerciseSessions.find((session) => session.date === TODAY)
    const pastSessions = exerciseSessions.filter((session) => session.date !== TODAY)
    const recentPast = pastSessions.at(-1) || null
    const lastTemplateSet = [...(recentPast?.sets || [])]
      .reverse()
      .find((set) => (set.reps || 0) > 0 || (set.weight || 0) > 0)

    result[exercise.id] = {
      sessionId: todaySession?.id || null,
      sets: todaySession?.sets || [],
      lastTemplate: {
        reps: lastTemplateSet?.reps || 8,
        weight: lastTemplateSet?.weight || 0,
      },
      bestWeight: exerciseSessions.reduce(
        (maxWeight, session) => Math.max(maxWeight, ...(session.sets || []).map((set) => set.weight || 0)),
        0
      ),
      lastSessionDate: recentPast?.date || null,
      sessionCount: exerciseSessions.length,
    }

    return result
  }, {})
}

function WorkoutSetRow({ set, index, isCardio, onUpdate, onDelete }) {
  const volume = (set.reps || 0) * (set.weight || 0)

  return (
    <div className="grid grid-cols-[30px_1fr_1fr_56px_28px] gap-2 items-center py-2 border-b border-surface2 last:border-0">
      <span className="text-text-secondary text-xs text-center font-mono font-semibold">{index + 1}</span>
      <input
        type="number"
        inputMode="numeric"
        value={set.reps || ''}
        placeholder="0"
        onChange={(event) => onUpdate({ ...set, reps: Number(event.target.value) })}
        className="bg-bg/70 rounded-xl px-3 py-2.5 text-text-primary text-sm text-center w-full focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <input
        type="number"
        inputMode="decimal"
        value={set.weight || ''}
        placeholder={isCardio ? 'min' : '0'}
        onChange={(event) => onUpdate({ ...set, weight: Number(event.target.value) })}
        className="bg-bg/70 rounded-xl px-3 py-2.5 text-text-primary text-sm text-center w-full focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <span className="text-text-secondary text-xs text-right font-mono">
        {isCardio ? `${set.weight || 0}m` : (volume > 0 ? volume.toLocaleString() : '-')}
      </span>
      <button
        onClick={() => onDelete(set.id)}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-text-secondary active:scale-95 transition-transform"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

function GuidedWorkoutPage() {
  const { exerciseId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { seconds, isRunning, formatted, toggle, reset, start, pause } = useTimer()
  const {
    activeWorkout,
    startRoutineWorkout,
    syncRoutine,
    setCurrentExercise,
    completeExercise,
    skipExercise,
    hydrateCompletedExercises,
    clearActiveWorkout,
  } = useActiveWorkout()

  const routeRoutine = location.state?.routine
  const routeWantsWorkoutMode = Boolean(location.state?.workoutMode || routeRoutine)
  const guidedWorkout = activeWorkout?.kind === 'routine' ? activeWorkout : null
  const routine = routeRoutine || (guidedWorkout ? { ...guidedWorkout.routine, exercises: guidedWorkout.exercises } : null)
  const exerciseIdsKey = guidedWorkout?.exercises?.map((exercise) => exercise.id).join('|') || ''

  const [exerciseState, setExerciseState] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingExerciseId, setSavingExerciseId] = useState(null)
  const [containerHeight, setContainerHeight] = useState(() => window.visualViewport?.height ?? window.innerHeight)

  const saveTimeoutsRef = useRef({})
  const exerciseStateRef = useRef(exerciseState)
  const cardRefs = useRef({})

  exerciseStateRef.current = exerciseState

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return undefined
    const updateHeight = () => setContainerHeight(viewport.height)
    viewport.addEventListener('resize', updateHeight)
    updateHeight()
    return () => viewport.removeEventListener('resize', updateHeight)
  }, [])

  useEffect(() => {
    if (!routeWantsWorkoutMode || !routeRoutine?.id) return
    if (!guidedWorkout || guidedWorkout.routine.id !== routeRoutine.id) {
      startRoutineWorkout(routeRoutine, { startExerciseId: exerciseId })
      return
    }
    syncRoutine(routeRoutine)
  }, [exerciseId, guidedWorkout, routeRoutine, routeWantsWorkoutMode, startRoutineWorkout, syncRoutine])

  useEffect(() => {
    if (!user?.uid || !guidedWorkout?.exercises?.length) return
    let isMounted = true
    setLoading(true)

    user.getIdToken()
      .then(() => getDocs(sessionsCol(user.uid)))
      .then((snapshot) => {
        if (!isMounted) return
        const exerciseIds = new Set(guidedWorkout.exercises.map((exercise) => exercise.id))
        const sessions = snapshot.docs
          .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
          .filter((session) => exerciseIds.has(session.exerciseId))
        const nextExerciseState = buildExerciseState(guidedWorkout.exercises, sessions)
        const completedTodayIds = Object.entries(nextExerciseState)
          .filter(([, state]) => (state.sets || []).some((set) => (set.reps || 0) > 0 || (set.weight || 0) > 0))
          .map(([id]) => id)
        setExerciseState(nextExerciseState)
        hydrateCompletedExercises(completedTodayIds)
        setLoading(false)
      })
      .catch((error) => {
        console.error('GuidedWorkout load error:', error)
        if (isMounted) setLoading(false)
      })

    return () => { isMounted = false }
  }, [exerciseIdsKey, guidedWorkout?.routine.id, user?.uid])

  useEffect(() => () => {
    Object.values(saveTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId))
  }, [])

  useEffect(() => {
    if (!guidedWorkout?.currentExerciseId || guidedWorkout.summaryReady) return
    requestAnimationFrame(() => {
      cardRefs.current[guidedWorkout.currentExerciseId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [guidedWorkout?.currentExerciseId, guidedWorkout?.summaryReady])

  useEffect(() => {
    if (guidedWorkout?.summaryReady) pause()
  }, [guidedWorkout?.summaryReady, pause])

  const exerciseById = useMemo(
    () => new Map((guidedWorkout?.exercises || []).map((exercise) => [exercise.id, exercise])),
    [guidedWorkout?.exercises]
  )

  const orderedExercises = useMemo(() => {
    if (!guidedWorkout) return []
    const doneIds = new Set([...guidedWorkout.completed, ...guidedWorkout.skipped])
    const pending = guidedWorkout.exercises.filter((exercise) => !doneIds.has(exercise.id))
    const completed = guidedWorkout.completionOrder.map((id) => exerciseById.get(id)).filter(Boolean)
    return [...pending, ...completed]
  }, [exerciseById, guidedWorkout])

  const pendingExercises = useMemo(() => {
    if (!guidedWorkout) return []
    const doneIds = new Set([...guidedWorkout.completed, ...guidedWorkout.skipped])
    return guidedWorkout.exercises.filter((exercise) => !doneIds.has(exercise.id))
  }, [guidedWorkout])

  const activeExercise = guidedWorkout?.currentExerciseId
    ? exerciseById.get(guidedWorkout.currentExerciseId)
    : pendingExercises[0] || null
  const nextExercise = guidedWorkout?.summaryReady
    ? null
    : pendingExercises[pendingExercises.findIndex((exercise) => exercise.id === activeExercise?.id) + 1] || null
  const totalExercises = guidedWorkout?.exercises.length || 0
  const completedCount = guidedWorkout?.completed.length || 0
  const skippedCount = guidedWorkout?.skipped.length || 0
  const resolvedCount = completedCount + skippedCount
  const loggedExerciseCount = Object.values(exerciseState).filter((state) =>
    (state.sets || []).some((set) => (set.reps || 0) > 0 || (set.weight || 0) > 0)
  ).length
  const totalVolume = Object.values(exerciseState).reduce(
    (sum, state) => sum + (state.sets || []).reduce((exerciseSum, set) => exerciseSum + (set.reps || 0) * (set.weight || 0), 0),
    0
  )

  if (!routine || (!routeWantsWorkoutMode && !guidedWorkout)) {
    return <LegacyExerciseWorkout />
  }

  async function persistExerciseSets(exercise, currentSets) {
    if (!user?.uid || !exercise?.id) return
    const existingState = exerciseStateRef.current[exercise.id] || {}
    if (currentSets.length === 0 && !existingState.sessionId) return
    setSavingExerciseId(exercise.id)

    try {
      const totalExerciseVolume = currentSets.reduce((sum, set) => sum + (set.reps || 0) * (set.weight || 0), 0)
      const payload = {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        muscleGroup: exercise.muscleGroup || '',
        routineId: routine.id || '',
        routineName: routine.name || '',
        date: TODAY,
        sets: currentSets,
        totalVolume: totalExerciseVolume,
        updatedAt: serverTimestamp(),
      }

      if (existingState.sessionId) {
        await updateDoc(sessionDoc(user.uid, existingState.sessionId), payload)
      } else {
        const ref = await addDoc(sessionsCol(user.uid), { ...payload, createdAt: serverTimestamp() })
        setExerciseState((current) => ({
          ...current,
          [exercise.id]: {
            ...(current[exercise.id] || {}),
            sessionId: ref.id,
            sets: currentSets,
          },
        }))
      }
    } finally {
      setSavingExerciseId((current) => (current === exercise.id ? null : current))
    }
  }

  function scheduleSave(exercise, nextSets) {
    clearTimeout(saveTimeoutsRef.current[exercise.id])
    saveTimeoutsRef.current[exercise.id] = setTimeout(() => persistExerciseSets(exercise, nextSets), 700)
  }

  function updateSets(exercise, nextSets) {
    setExerciseState((current) => ({
      ...current,
      [exercise.id]: {
        ...(current[exercise.id] || {}),
        sets: nextSets,
      },
    }))
    scheduleSave(exercise, nextSets)
  }

  function getTemplate(exercise) {
    const state = exerciseState[exercise.id] || {}
    const lastSet = state.sets?.at(-1)
    const fallback = state.lastTemplate || { reps: 8, weight: 0 }
    return {
      reps: lastSet?.reps || fallback.reps || 8,
      weight: lastSet?.weight || fallback.weight || 0,
    }
  }

  function appendSet(exercise, transform) {
    const template = getTemplate(exercise)
    const nextSet = normalizeSet(transform(template), template)
    const nextSets = [...(exerciseState[exercise.id]?.sets || []), nextSet]
    updateSets(exercise, nextSets)
    reset()
    start()
  }

  function addSet(exercise) {
    appendSet(exercise, (template) => template)
  }

  function updateSet(exercise, updatedSet) {
    const nextSets = (exerciseState[exercise.id]?.sets || []).map((set) => (set.id === updatedSet.id ? updatedSet : set))
    updateSets(exercise, nextSets)
  }

  function deleteSet(exercise, setId) {
    const nextSets = (exerciseState[exercise.id]?.sets || []).filter((set) => set.id !== setId)
    updateSets(exercise, nextSets)
  }

  function finishExercise() {
    if (!activeExercise) return
    clearTimeout(saveTimeoutsRef.current[activeExercise.id])
    const currentSets = exerciseStateRef.current[activeExercise.id]?.sets || []
    completeExercise(activeExercise.id)
    if (currentSets.length > 0) {
      persistExerciseSets(activeExercise, currentSets).catch((error) => {
        console.error('finishExercise persist error:', error)
      })
    }
  }

  function handleSkipExercise() {
    if (!activeExercise) return
    clearTimeout(saveTimeoutsRef.current[activeExercise.id])
    skipExercise(activeExercise.id)
  }

  function flushPendingSaves() {
    Object.entries(exerciseStateRef.current).forEach(([id, state]) => {
      const exercise = exerciseById.get(id)
      clearTimeout(saveTimeoutsRef.current[id])
      if (!exercise || !state.sets?.length) return
      persistExerciseSets(exercise, state.sets).catch((error) => {
        console.error('flushPendingSaves error:', error)
      })
    })
  }

  function saveWorkout() {
    flushPendingSaves()
    clearActiveWorkout()
    reset()
    navigate('/routines', { state: { openRoutineId: routine.id } })
  }

  function minimizeWorkout() {
    navigate('/routines', { state: { openRoutineId: routine.id } })
  }

  function getStatus(exercise) {
    if (guidedWorkout?.currentExerciseId === exercise.id && !guidedWorkout.summaryReady) return 'active'
    if (guidedWorkout?.completed.includes(exercise.id)) return 'completed'
    if (guidedWorkout?.skipped.includes(exercise.id)) return 'skipped'
    if (nextExercise?.id === exercise.id) return 'next'
    return 'upcoming'
  }

  function getCardClasses(status) {
    if (status === 'active') return 'border-accent-green shadow-[0_0_0_1px_rgba(22,163,74,0.45),0_18px_40px_rgba(22,163,74,0.12)]'
    if (status === 'next') return 'border-accent bg-accent/5'
    if (status === 'completed') return 'border-slate-700 bg-slate-900/60 opacity-75'
    if (status === 'skipped') return 'border-slate-700 bg-slate-900/50 opacity-65'
    return 'border-surface2 opacity-70'
  }

  const summaryMinutes = Math.max(1, Math.round(seconds / 60))

  return (
    <PageWrapper showHeader={false} showBottomNav={false} className="!pb-0">
      <div className="flex flex-col" style={{ height: containerHeight }}>
        <div className="px-4 pt-4 pb-3 border-b border-surface2 bg-bg/95 backdrop-blur flex-shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={minimizeWorkout}
              className="w-10 h-10 rounded-2xl bg-surface2 flex items-center justify-center active:scale-95 transition-transform"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-text-secondary text-xs uppercase tracking-[0.28em]">Workout Mode</p>
              <h1 className="font-display text-xl font-bold text-text-primary truncate">{routine.name}</h1>
            </div>
            {savingExerciseId && <span className="text-text-secondary text-xs animate-pulse-soft">Saving...</span>}
          </div>

          <div className="rounded-2xl border border-surface2 bg-surface/70 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-text-secondary text-[11px] uppercase tracking-[0.24em]">Progress</p>
                <p className="text-text-primary font-semibold text-sm mt-1">
                  {guidedWorkout?.summaryReady
                    ? `Workout complete - ${loggedExerciseCount} logged`
                    : `${completedCount} of ${totalExercises} completed today`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-text-secondary text-[11px] uppercase tracking-[0.24em]">Timer</p>
                <p className="font-mono text-text-primary text-sm font-bold mt-1">{formatted()}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {Array.from({ length: totalExercises }).map((_, index) => {
                const done = index < completedCount
                const skipped = index >= completedCount && index < resolvedCount
                const current = !guidedWorkout?.summaryReady && index === resolvedCount
                return (
                  <span
                    key={index}
                    className={`h-2 rounded-full transition-all ${
                      done
                        ? 'flex-1 bg-accent-green'
                        : skipped
                          ? 'flex-1 bg-slate-600'
                          : current
                            ? 'flex-[1.35] bg-accent'
                            : 'flex-1 bg-surface2'
                    }`}
                  />
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {guidedWorkout?.summaryReady && (
            <div className="rounded-[28px] border border-accent-green/30 bg-gradient-to-br from-accent-green/18 via-surface to-bg px-5 py-5">
              <p className="text-accent-green text-xs font-semibold uppercase tracking-[0.24em]">Workout Complete</p>
              <h2 className="font-display text-3xl font-bold text-text-primary mt-2">Nice work</h2>
              <div className="grid grid-cols-3 gap-3 mt-5">
                <div className="rounded-2xl bg-bg/60 border border-white/5 p-3">
                  <p className="text-text-secondary text-[11px] uppercase tracking-[0.22em]">Volume</p>
                  <p className="text-text-primary font-display text-2xl font-bold mt-2">{formatVolume(totalVolume)}</p>
                  <p className="text-text-secondary text-xs">lbs</p>
                </div>
                <div className="rounded-2xl bg-bg/60 border border-white/5 p-3">
                  <p className="text-text-secondary text-[11px] uppercase tracking-[0.22em]">Time</p>
                  <p className="text-text-primary font-display text-2xl font-bold mt-2">{summaryMinutes}</p>
                  <p className="text-text-secondary text-xs">min</p>
                </div>
                <div className="rounded-2xl bg-bg/60 border border-white/5 p-3">
                  <p className="text-text-secondary text-[11px] uppercase tracking-[0.22em]">Exercises</p>
                  <p className="text-text-primary font-display text-2xl font-bold mt-2">{loggedExerciseCount}</p>
                  <p className="text-text-secondary text-xs">
                    {skippedCount ? `${skippedCount} skipped` : `of ${totalExercises} planned`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="card flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            orderedExercises.map((exercise) => {
              const status = getStatus(exercise)
              const state = exerciseState[exercise.id] || { sets: [], lastTemplate: { reps: 8, weight: 0 } }
              const cardio = isCardioExercise(exercise)
              const completedToday = (state.sets || []).some((set) => (set.reps || 0) > 0 || (set.weight || 0) > 0)
              const totalExerciseVolume = (state.sets || []).reduce(
                (sum, set) => sum + (set.reps || 0) * (set.weight || 0),
                0
              )

              return (
                <section
                  key={exercise.id}
                  ref={(node) => { cardRefs.current[exercise.id] = node }}
                  className={`rounded-[28px] border bg-surface px-4 py-4 transition-all ${getCardClasses(status)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 h-10 w-1.5 rounded-full ${
                      status === 'active' ? 'bg-accent-green' : status === 'next' ? 'bg-accent' : 'bg-surface2'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-text-secondary text-[11px] uppercase tracking-[0.24em]">
                            {status === 'active' ? 'Active' : status === 'next' ? 'Next' : status === 'completed' ? 'Completed' : status === 'skipped' ? 'Skipped' : 'Up Next'}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <h2 className="font-display text-xl font-bold text-text-primary truncate">{exercise.name}</h2>
                            {completedToday && status !== 'active' && (
                              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-400 bg-red-500/10 px-2 py-1 rounded-full">
                                Complete today
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {exercise.muscleGroup && (
                              <span className="text-[11px] font-semibold text-accent bg-accent/10 px-2 py-1 rounded-full">
                                {exercise.muscleGroup}
                              </span>
                            )}
                            {state.sessionCount > 0 && (
                              <span className="text-[11px] text-text-secondary">
                                {state.sessionCount} session{state.sessionCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            {state.lastSessionDate && (
                              <span className="text-[11px] text-text-secondary">
                                Last {format(parseISO(state.lastSessionDate), 'MMM d')}
                              </span>
                            )}
                          </div>
                        </div>

                        {(status === 'completed' || status === 'skipped') && (
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                            status === 'completed' ? 'bg-accent-green/15 text-accent-green' : 'bg-surface2 text-text-secondary'
                          }`}>
                            {status === 'completed' ? (
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            )}
                          </div>
                        )}
                      </div>

                      {status === 'active' ? (
                        <>
                          <div className="mt-3 rounded-2xl bg-bg/40 border border-white/5 px-3 py-3">
                            <div className="grid grid-cols-[30px_1fr_1fr_56px_28px] gap-2 pb-2 border-b border-surface2 mb-1">
                              {['#', 'Reps', cardio ? 'Min' : 'Lbs', cardio ? 'Time' : 'Vol', ''].map((label) => (
                                <span key={label} className="text-text-secondary text-xs font-semibold text-center uppercase tracking-[0.18em]">
                                  {label}
                                </span>
                              ))}
                            </div>

                            {state.sets.length === 0 ? (
                              <div className="py-6 text-center">
                                <p className="text-text-secondary text-sm">No sets yet</p>
                                <p className="text-text-secondary text-xs mt-1">
                                  Use Add Set below to start with {formatWeight(state.lastTemplate.weight)} lbs x {state.lastTemplate.reps}
                                </p>
                              </div>
                            ) : (
                              state.sets.map((set, index) => (
                                <WorkoutSetRow
                                  key={set.id}
                                  set={set}
                                  index={index}
                                  isCardio={cardio}
                                  onUpdate={(updatedSet) => updateSet(exercise, updatedSet)}
                                  onDelete={(setId) => deleteSet(exercise, setId)}
                                />
                              ))
                            )}
                          </div>

                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-surface2">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => addSet(exercise)}
                                className="text-accent-green text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                Add Set
                              </button>
                              <button
                                onClick={handleSkipExercise}
                                className="px-3 py-2 rounded-xl bg-surface2 text-text-secondary text-sm font-semibold active:scale-95 transition-transform"
                              >
                                Skip
                              </button>
                            </div>
                            <div className="text-right">
                              <p className="text-text-secondary text-xs">{cardio ? 'Total Time' : 'Total Volume'}</p>
                              <p className="font-display font-bold text-accent-green text-xl leading-tight">
                                {cardio ? `${totalExerciseVolume} min` : `${totalExerciseVolume.toLocaleString()} lbs`}
                              </p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between gap-3 mt-4">
                          <div className="text-sm text-text-secondary">
                            {status === 'completed'
                              ? `${state.sets.length} set${state.sets.length !== 1 ? 's' : ''} logged`
                              : status === 'skipped'
                                ? 'Skipped for this workout'
                                : `${state.lastTemplate.reps} reps x ${formatWeight(state.lastTemplate.weight)} lbs ready`}
                          </div>
                          {(status === 'next' || status === 'upcoming') && (
                            <button
                              onClick={() => {
                                setCurrentExercise(exercise.id)
                              }}
                              className="text-accent text-sm font-semibold"
                            >
                              Open
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )
            })
          )}
        </div>

        <div className="border-t border-surface2 bg-bg/95 backdrop-blur px-4 pt-3 flex-shrink-0" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}>
          {guidedWorkout?.summaryReady ? (
            <button onClick={saveWorkout} className="btn-primary w-full">
              Save Workout
            </button>
          ) : (
            <>
              <div className="grid grid-cols-[1.7fr_0.9fr] gap-2">
                <div className="rounded-2xl border border-surface2 bg-surface px-3 py-2.5 flex items-center gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-mono text-text-primary text-base font-bold">{formatted()}</span>
                  </div>
                  <div className="flex items-center gap-3 ml-auto flex-shrink-0">
                    <button onClick={toggle} className={`text-sm font-semibold ${isRunning ? 'text-accent-green' : 'text-accent'}`}>
                      {isRunning ? 'Pause' : 'Start'}
                    </button>
                    <button onClick={reset} className="text-sm text-text-secondary">
                      Reset
                    </button>
                  </div>
                </div>

                <button onClick={finishExercise} disabled={!activeExercise} className="btn-primary disabled:opacity-50">
                  Finish
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </PageWrapper>
  )
}

export default function WorkoutPage() {
  const location = useLocation()
  const { activeWorkout } = useActiveWorkout()

  if (location.state?.workoutMode || location.state?.routine || activeWorkout?.kind === 'routine') {
    return <GuidedWorkoutPage />
  }

  return <LegacyExerciseWorkout />
}
