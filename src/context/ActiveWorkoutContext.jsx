import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'fittrack-active-workout-v1'

const ActiveWorkoutContext = createContext(null)

function getLocalDayKey(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sameArray(a = [], b = []) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function normalizeExercises(exercises = []) {
  return exercises
    .filter((exercise) => exercise?.id)
    .map((exercise) => ({
      id: exercise.id,
      name: exercise.name || '',
      muscleGroup: exercise.muscleGroup || '',
      type: exercise.type || 'weight',
    }))
}

function sanitizeWorkoutState(value) {
  if (!value || value.kind !== 'routine') return null

  const exercises = normalizeExercises(value.exercises)
  if (exercises.length === 0) return null
  const dayKey = value.dayKey || getLocalDayKey(value.startedAt || Date.now())
  if (dayKey !== getLocalDayKey()) return null

  const knownIds = new Set(exercises.map((exercise) => exercise.id))
  const completed = (value.completed || []).filter((id) => knownIds.has(id))
  const skipped = (value.skipped || []).filter((id) => knownIds.has(id))
  const completionOrder = (value.completionOrder || []).filter((id) => knownIds.has(id))
  const currentExerciseId = knownIds.has(value.currentExerciseId) ? value.currentExerciseId : exercises[0].id
  const summaryReady = Boolean(value.summaryReady) || completed.length + skipped.length >= exercises.length

  return {
    kind: 'routine',
    routine: {
      id: value.routine?.id || '',
      name: value.routine?.name || 'Workout',
    },
    exercises,
    dayKey,
    currentExerciseId: summaryReady ? null : currentExerciseId,
    completed,
    skipped,
    completionOrder,
    startedAt: value.startedAt || Date.now(),
    summaryReady,
  }
}

export function ActiveWorkoutProvider({ children }) {
  const [activeWorkout, setActiveWorkout] = useState(() => {
    try {
      return sanitizeWorkoutState(JSON.parse(localStorage.getItem(STORAGE_KEY)))
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (!activeWorkout) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activeWorkout))
  }, [activeWorkout])

  function startRoutineWorkout(routine, options = {}) {
    const exercises = normalizeExercises(routine?.exercises)
    if (!routine?.id || exercises.length === 0) return null

    const currentExerciseId =
      exercises.find((exercise) => exercise.id === options.startExerciseId)?.id ||
      exercises[0].id

    const nextWorkout = {
      kind: 'routine',
      routine: {
        id: routine.id,
        name: routine.name || 'Workout',
      },
      exercises,
      dayKey: getLocalDayKey(),
      currentExerciseId,
      completed: [],
      skipped: [],
      completionOrder: [],
      startedAt: Date.now(),
      summaryReady: false,
    }

    setActiveWorkout(nextWorkout)
    return nextWorkout
  }

  function syncRoutine(routine) {
    setActiveWorkout((current) => {
      if (!current || current.kind !== 'routine' || current.routine.id !== routine?.id) return current
      if (current.dayKey !== getLocalDayKey()) return null

      const exercises = normalizeExercises(routine.exercises)
      if (exercises.length === 0) return null

      const knownIds = new Set(exercises.map((exercise) => exercise.id))
      const completed = current.completed.filter((id) => knownIds.has(id))
      const skipped = current.skipped.filter((id) => knownIds.has(id))
      const completionOrder = current.completionOrder.filter((id) => knownIds.has(id))
      const remaining = exercises
        .map((exercise) => exercise.id)
        .filter((id) => !completed.includes(id) && !skipped.includes(id))
      const nextCurrentExerciseId = remaining.includes(current.currentExerciseId)
        ? current.currentExerciseId
        : (remaining[0] || null)
      const nextSummaryReady = current.summaryReady || remaining.length === 0

      const sameExercises =
        current.exercises.length === exercises.length &&
        current.exercises.every((exercise, index) => (
          exercise.id === exercises[index]?.id &&
          exercise.name === exercises[index]?.name &&
          exercise.muscleGroup === exercises[index]?.muscleGroup &&
          exercise.type === exercises[index]?.type
        ))
      const sameName = current.routine.name === (routine.name || current.routine.name)
      const sameCurrent = (nextSummaryReady ? null : nextCurrentExerciseId) === current.currentExerciseId
      const sameCompleted = sameArray(completed, current.completed)
      const sameSkipped = sameArray(skipped, current.skipped)
      const sameOrder = sameArray(completionOrder, current.completionOrder)

      if (sameExercises && sameName && sameCurrent && sameCompleted && sameSkipped && sameOrder) {
        return current
      }

      return {
        ...current,
        routine: {
          id: routine.id,
          name: routine.name || current.routine.name,
        },
        exercises,
        completed,
        skipped,
        completionOrder,
        currentExerciseId: nextSummaryReady ? null : nextCurrentExerciseId,
        summaryReady: nextSummaryReady,
      }
    })
  }

  function setCurrentExercise(exerciseId) {
    setActiveWorkout((current) => {
      if (!current || current.summaryReady) return current
      if (current.dayKey !== getLocalDayKey()) return null
      const isKnownExercise = current.exercises.some((exercise) => exercise.id === exerciseId)
      if (!isKnownExercise) return current
      return { ...current, currentExerciseId: exerciseId }
    })
  }

  function moveExerciseToDone(exerciseId, outcome) {
    setActiveWorkout((current) => {
      if (!current || current.kind !== 'routine') return current
      if (current.dayKey !== getLocalDayKey()) return null
      if (!current.exercises.some((exercise) => exercise.id === exerciseId)) return current

      const completed = outcome === 'completed'
        ? [...new Set([...current.completed, exerciseId])]
        : current.completed.filter((id) => id !== exerciseId)
      const skipped = outcome === 'skipped'
        ? [...new Set([...current.skipped, exerciseId])]
        : current.skipped.filter((id) => id !== exerciseId)
      const completionOrder = [
        ...current.completionOrder.filter((id) => id !== exerciseId),
        exerciseId,
      ]
      const remaining = current.exercises
        .map((exercise) => exercise.id)
        .filter((id) => !completed.includes(id) && !skipped.includes(id))

      return {
        ...current,
        completed,
        skipped,
        completionOrder,
        currentExerciseId: remaining[0] || null,
        summaryReady: remaining.length === 0,
      }
    })
  }

  function completeExercise(exerciseId) {
    moveExerciseToDone(exerciseId, 'completed')
  }

  function skipExercise(exerciseId) {
    moveExerciseToDone(exerciseId, 'skipped')
  }

  function reopenExercise(exerciseId) {
    setActiveWorkout((current) => {
      if (!current || current.kind !== 'routine') return current
      if (current.dayKey !== getLocalDayKey()) return null
      if (!current.exercises.some((exercise) => exercise.id === exerciseId)) return current

      const completed = current.completed.filter((id) => id !== exerciseId)
      const skipped = current.skipped.filter((id) => id !== exerciseId)
      const completionOrder = current.completionOrder.filter((id) => id !== exerciseId)

      if (
        sameArray(completed, current.completed) &&
        sameArray(skipped, current.skipped) &&
        sameArray(completionOrder, current.completionOrder) &&
        current.currentExerciseId === exerciseId &&
        current.summaryReady === false
      ) {
        return current
      }

      return {
        ...current,
        completed,
        skipped,
        completionOrder,
        currentExerciseId: exerciseId,
        summaryReady: false,
      }
    })
  }

  function hydrateCompletedExercises(exerciseIds = []) {
    setActiveWorkout((current) => {
      if (!current || current.kind !== 'routine') return current
      if (current.dayKey !== getLocalDayKey()) return null

      const knownIds = new Set(current.exercises.map((exercise) => exercise.id))
      const completedToday = [...new Set(exerciseIds.filter((id) => knownIds.has(id)))]
      const completed = [...new Set([...current.completed, ...completedToday])]
      const skipped = current.skipped.filter((id) => !completedToday.includes(id))
      const completionOrder = [
        ...current.completionOrder.filter((id) => knownIds.has(id)),
        ...current.exercises
          .map((exercise) => exercise.id)
          .filter((id) => completedToday.includes(id) && !current.completionOrder.includes(id)),
      ]
      const remaining = current.exercises
        .map((exercise) => exercise.id)
        .filter((id) => !completed.includes(id) && !skipped.includes(id))
      const nextCurrentExerciseId = remaining.includes(current.currentExerciseId)
        ? current.currentExerciseId
        : (remaining[0] || null)
      const summaryReady = remaining.length === 0

      if (
        sameArray(completed, current.completed) &&
        sameArray(skipped, current.skipped) &&
        sameArray(completionOrder, current.completionOrder) &&
        (summaryReady ? null : nextCurrentExerciseId) === current.currentExerciseId &&
        summaryReady === current.summaryReady
      ) {
        return current
      }

      return {
        ...current,
        completed,
        skipped,
        completionOrder,
        currentExerciseId: summaryReady ? null : nextCurrentExerciseId,
        summaryReady,
      }
    })
  }

  function clearActiveWorkout() {
    setActiveWorkout(null)
  }

  return (
    <ActiveWorkoutContext.Provider
      value={{
        activeWorkout,
        startRoutineWorkout,
        syncRoutine,
        setCurrentExercise,
        completeExercise,
        skipExercise,
        reopenExercise,
        hydrateCompletedExercises,
        clearActiveWorkout,
      }}
    >
      {children}
    </ActiveWorkoutContext.Provider>
  )
}

export function useActiveWorkout() {
  const context = useContext(ActiveWorkoutContext)
  if (!context) throw new Error('useActiveWorkout must be used within ActiveWorkoutProvider')
  return context
}
