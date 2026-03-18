import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'fittrack-active-workout-v1'

const ActiveWorkoutContext = createContext(null)

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

      const exercises = normalizeExercises(routine.exercises)
      if (exercises.length === 0) return null

      const knownIds = new Set(exercises.map((exercise) => exercise.id))
      const completed = current.completed.filter((id) => knownIds.has(id))
      const skipped = current.skipped.filter((id) => knownIds.has(id))
      const completionOrder = current.completionOrder.filter((id) => knownIds.has(id))
      const remaining = exercises
        .map((exercise) => exercise.id)
        .filter((id) => !completed.includes(id) && !skipped.includes(id))

      const sameExercises =
        current.exercises.length === exercises.length &&
        current.exercises.every((exercise, index) => (
          exercise.id === exercises[index]?.id &&
          exercise.name === exercises[index]?.name &&
          exercise.muscleGroup === exercises[index]?.muscleGroup &&
          exercise.type === exercises[index]?.type
        ))
      const sameName = current.routine.name === (routine.name || current.routine.name)
      const sameCurrent = (current.summaryReady ? null : (remaining[0] || null)) === current.currentExerciseId
      const sameCompleted = completed.length === current.completed.length && completed.every((id, index) => id === current.completed[index])
      const sameSkipped = skipped.length === current.skipped.length && skipped.every((id, index) => id === current.skipped[index])
      const sameOrder =
        completionOrder.length === current.completionOrder.length &&
        completionOrder.every((id, index) => id === current.completionOrder[index])

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
        currentExerciseId: current.summaryReady ? null : (remaining[0] || null),
        summaryReady: current.summaryReady || remaining.length === 0,
      }
    })
  }

  function setCurrentExercise(exerciseId) {
    setActiveWorkout((current) => {
      if (!current || current.summaryReady) return current
      const isKnownExercise = current.exercises.some((exercise) => exercise.id === exerciseId)
      if (!isKnownExercise) return current
      return { ...current, currentExerciseId: exerciseId }
    })
  }

  function moveExerciseToDone(exerciseId, outcome) {
    setActiveWorkout((current) => {
      if (!current || current.kind !== 'routine') return current
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
