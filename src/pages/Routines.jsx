// src/pages/Routines.jsx
import { useState, useEffect, useRef, useMemo } from 'react'
import { format, parseISO } from 'date-fns'

const MUSCLE_ICONS = {
  abs:       '/icons/abs.png',
  biceps:    '/icons/arm.png',
  triceps:   '/icons/triceps.png',
  shoulders: '/icons/shoulder.png',
  chest:     '/icons/chest.png',
  back:      '/icons/back.png',
  legs:      '/icons/legs.png',
  glutes:    '/icons/glutes.png',
  cardio:    '/icons/cardio.png',
  recovery:  '/icons/Recovery.png',
}
const NAME_KEYWORDS = [
  { re: /\bcalf\b|\bcalves\b/,                                   group: 'legs'      },
  { re: /\brow\b|\bpulldown\b|\bpull.down\b|\bdeadlift\b|\blat\b|\bchin.up\b|\bpull.up\b/, group: 'back' },
  { re: /\bcurl\b/,                                              group: 'biceps'    },
  { re: /\bpushdown\b|\bskull\b|\btricep/,                       group: 'triceps'   },
  { re: /\bbench\b|\bfly\b|\bflye\b|\bpec\b/,                   group: 'chest'     },
  { re: /\blateral\b|\bfront raise\b|\bupright\b|\bdelt\b/,      group: 'shoulders' },
  { re: /\bsquat\b|\bleg press\b|\blunge\b|\bleg ext\b|\bhack\b|\bcalf/, group: 'legs' },
  { re: /\bglute\b|\bhip thrust\b|\bglute bridge\b/,             group: 'glutes'    },
  { re: /\bcrunch\b|\bplank\b|\bcore\b|\bab\b/,                  group: 'abs'       },
  { re: /\btreadmill\b|\bcardio\b|\bbike\b|\brun\b/,             group: 'cardio'    },
]
function muscleIcon(muscleGroup, exerciseName) {
  const byGroup = MUSCLE_ICONS[(muscleGroup || '').toLowerCase()]
  if (byGroup) return byGroup
  const name = (exerciseName || '').toLowerCase()
  for (const kw of NAME_KEYWORDS) {
    if (kw.re.test(name)) return MUSCLE_ICONS[kw.group]
  }
  return null
}
import { useNavigate, useLocation } from 'react-router-dom'
import {
  addDoc, deleteDoc, updateDoc, onSnapshot, getDocs,
  serverTimestamp, arrayUnion, arrayRemove, writeBatch, doc,
} from 'firebase/firestore'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAuth } from '../context/AuthContext'
import { useActiveWorkout } from '../context/ActiveWorkoutContext'
import { routinesCol, routineDoc, sessionsCol, exercisesCol, globalExercisesCol, exerciseDoc } from '../firebase/collections'
import { db } from '../firebase/config'
import PageWrapper from '../components/layout/PageWrapper'
import { getExerciseIcon } from '../utils/exerciseIcons'
import { generateAiText } from '../utils/aiClient'

// New Routine Sheet
function NewRoutineSheet({ onClose, onSave }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    await onSave(name.trim())
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 animate-fade-in" onClick={onClose}>
      <div
        className="bg-surface rounded-t-2xl px-4 pt-3 pb-8 space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-surface2 rounded-full mx-auto mb-1" />
        <h2 className="font-display font-bold text-text-primary text-lg">New Routine</h2>
        <div>
          <label className="label">Routine Name</label>
          <input
            autoFocus
            type="text"
            className="input"
            placeholder="e.g. Push Day"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="btn-primary w-full disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create Routine'}
        </button>
      </div>
    </div>
  )
}

// Infer muscle group from exercise name
function inferMuscleGroup(name) {
  const n = (name || '').toLowerCase()
  if (/\b(cardio|walking|walk|run|running|jog|jogging|bike|cycling|elliptical|swim|swimming|treadmill|stair|hiit)\b/.test(n)) return 'Cardio'
  if (/\b(abs|core|crunch|plank|sit.?up|abdominal)\b/.test(n)) return 'Abs'
  if (/\b(tricep|triceps|pushdown|skull)\b/.test(n)) return 'Triceps'
  if (/\b(bicep|biceps|curl)\b/.test(n)) return 'Biceps'
  if (/\b(shoulder|delt|delts|lateral raise|overhead press)\b/.test(n)) return 'Shoulders'
  if (/\b(chest|pec|pecs|bench|fly|flye)\b/.test(n)) return 'Chest'
  if (/\b(back|lat|lats|row|rows|pulldown|chin|deadlift|rhomboid|trap|traps|rear delt)\b/.test(n)) return 'Back'
  if (/\b(glute|glutes|hip thrust|glute bridge)\b/.test(n)) return 'Glutes'
  if (/\b(leg|legs|quad|quads|hamstring|hamstrings|squat|lunge|calf|calves|leg press|extension)\b/.test(n)) return 'Legs'
  return ''
}

function formatRoutineName(name = '') {
  return name
    .replace(/\bDay-(\d+)\b/g, 'Day $1')
    .replace(/^(.*?)(\sDay \d+)$/, '$1 -$2')
}

function parseRoutineDay(name = '') {
  const match = name.match(/^(.*?)(?:\s*-?\s*)Day[- ]?(\d+)$/i)
  if (!match) return null
  return {
    base: match[1].replace(/\s*-\s*$/, '').trim().toLowerCase(),
    day: Number(match[2]),
  }
}

function getNextRoutineInSeries(currentRoutine, routines = []) {
  const parsedCurrent = parseRoutineDay(currentRoutine?.name || '')
  if (!parsedCurrent) return null

  const series = routines
    .map((routine) => ({ routine, parsed: parseRoutineDay(routine.name) }))
    .filter(({ parsed }) => parsed && parsed.base === parsedCurrent.base)
    .sort((a, b) => a.parsed.day - b.parsed.day)

  if (series.length < 2) return null

  const currentIndex = series.findIndex(({ routine }) => routine.id === currentRoutine.id)
  if (currentIndex === -1) return null

  return series[(currentIndex + 1) % series.length].routine
}

function getTimestampMs(value) {
  if (!value) return null
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (typeof value?.seconds === 'number') return value.seconds * 1000
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
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
  if (minutes > 180) return null
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
}

function getWorkoutDurationMinutes(sessionList = []) {
  const starts = sessionList
    .flatMap((session) => [getTimestampMs(session.startedAt), getTimestampMs(session.createdAt)])
    .filter(Boolean)
  const ends = sessionList
    .flatMap((session) => [getTimestampMs(session.completedAt), getTimestampMs(session.createdAt)])
    .filter(Boolean)
  if (!starts.length || !ends.length) return null
  const minutes = Math.round((Math.max(...ends) - Math.min(...starts)) / 60000)
  return minutes > 0 ? minutes : null
}

function calcSessionVolume(sessionList = []) {
  return sessionList.reduce((sum, session) => {
    if ((session.muscleGroup || '').toLowerCase() === 'cardio') return sum
    const fromSets = (session.sets || []).reduce((sessionVolume, set) => (
      sessionVolume + ((Number(set.reps) || 0) * (Number(set.weight) || 0))
    ), 0)
    return sum + (fromSets > 0 ? fromSets : (session.totalVolume || 0))
  }, 0)
}

function getRelativeDayLabel(dateValue) {
  if (!dateValue) return null
  const todayMs = new Date().setHours(0, 0, 0, 0)
  const targetMs = parseISO(dateValue).setHours(0, 0, 0, 0)
  const diff = Math.round((todayMs - targetMs) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  return `${diff}d ago`
}

function mergeRoutineExerciseTypes(routine, exerciseTypeMap = {}) {
  return {
    ...routine,
    exercises: (routine.exercises || []).map((exercise) => ({
      ...exercise,
      type: exercise.type || exerciseTypeMap[exercise.id] || 'weight',
    })),
  }
}

// Add Exercise Sheet
function AddExerciseSheet({ onClose, onAdd, existingIds = [] }) {
  const { user } = useAuth()
  const [library, setLibrary] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [search, setSearch] = useState('')
  const [activeGroup, setActiveGroup] = useState('All')
  const [addedIds, setAddedIds] = useState(new Set(existingIds))
  const [newlyAdded, setNewlyAdded] = useState(0)

  useEffect(() => {
    if (!user?.uid) return
    setLoading(true)
    setLoadError(null)
    user.getIdToken()
      .then(() => Promise.all([
        getDocs(sessionsCol(user.uid)),
        getDocs(exercisesCol(user.uid)),
        getDocs(globalExercisesCol()),
      ]))
      .then(async ([sessSnap, exSnap, globalSnap]) => {
        const map = {}
        // Start with the full global library so every user sees all exercises
        globalSnap.docs.forEach((d) => {
          const { id, name, muscleGroup, type } = d.data()
          if (id && name && muscleGroup) map[id] = { id, name, muscleGroup, type: type || 'weight' }
        })
        // Overlay user's own saved exercises (may include custom ones or renamed)
        exSnap.docs.forEach((d) => {
          const data = { ...d.data(), id: d.id }
          if (data.id && data.name) map[data.id] = { id: data.id, name: data.name, muscleGroup: data.muscleGroup || inferMuscleGroup(data.name), type: data.type || 'weight' }
        })
        // Also add any exercises that appear in sessions but aren't in library
        sessSnap.docs.forEach((d) => {
          const { exerciseId, exerciseName, muscleGroup } = d.data()
          if (exerciseId && !map[exerciseId]) {
            map[exerciseId] = { id: exerciseId, name: exerciseName || exerciseId, muscleGroup: muscleGroup || inferMuscleGroup(exerciseName || exerciseId), type: 'weight' }
          }
        })
        // Seed user's exercises collection if empty
        if (exSnap.empty) {
          const batch = writeBatch(db)
          Object.values(map).forEach((entry) => {
            batch.set(exerciseDoc(user.uid, entry.id), entry)
          })
          await batch.commit()
        }
        const data = Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
        setLibrary(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error('AddExerciseSheet load error:', err)
        setLoadError('Could not load your exercise library right now.')
        setLoading(false)
      })
  }, [reloadKey, user?.uid])

  const groups = ['All', ...[...new Set(library.map((e) => e.muscleGroup))].sort()]

  const filtered = library.filter((ex) => {
    const matchGroup = activeGroup === 'All' || ex.muscleGroup === activeGroup
    const matchSearch = ex.name.toLowerCase().includes(search.toLowerCase())
    return matchGroup && matchSearch
  })

  async function handleAdd(ex) {
    if (addedIds.has(ex.id)) return
    await onAdd({ id: ex.id, name: ex.name, muscleGroup: ex.muscleGroup, type: ex.type || 'weight' })
    setAddedIds((prev) => new Set([...prev, ex.id]))
    setNewlyAdded((n) => n + 1)
  }

  function retryLoad() {
    setReloadKey((current) => current + 1)
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex flex-col justify-end bg-black/60 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-t-2xl flex flex-col animate-slide-up"
        style={{ maxHeight: '88dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed header */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-surface2 rounded-full mx-auto mb-3" />

          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-text-primary text-lg">Add Exercise</h2>
            <button onClick={onClose} className="btn-secondary text-sm py-1.5 px-4">
              {newlyAdded > 0 ? `Done (${newlyAdded} added)` : 'Done'}
            </button>
          </div>

          {/* Search bar */}
          <div className="relative mb-3">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              autoFocus
              type="text"
              className="input pl-9"
              placeholder="Search exercises..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Muscle group filter chips */}
          {!loading && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => setActiveGroup(g)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activeGroup === g ? 'bg-accent text-white' : 'bg-surface2 text-text-secondary'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable exercise list */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : loadError ? (
            <div className="text-center py-12">
              <p className="text-text-primary text-sm font-semibold">Exercise library unavailable</p>
              <p className="text-text-secondary text-xs mt-1">{loadError}</p>
              <button
                onClick={retryLoad}
                className="btn-secondary mx-auto mt-4 text-sm px-4 py-2"
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-primary text-sm font-semibold">No exercises found</p>
              <p className="text-text-secondary text-xs mt-1">Try a different search or add a new exercise.</p>
              {(search || activeGroup !== 'All') && (
                <button
                  onClick={() => { setSearch(''); setActiveGroup('All') }}
                  className="btn-secondary mx-auto mt-4 text-sm px-4 py-2"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((ex) => {
                const isAdded = addedIds.has(ex.id)
                return (
                  <button
                    key={ex.id}
                    onClick={() => handleAdd(ex)}
                    disabled={isAdded}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left ${
                      isAdded
                        ? 'bg-accent-green/10 border border-accent-green/20'
                        : 'bg-surface2 active:bg-border'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isAdded ? 'text-accent-green' : 'text-text-primary'}`}>
                        {ex.name}
                      </p>
                      <p className="text-text-secondary text-xs">{ex.muscleGroup}</p>
                    </div>
                    {isAdded ? (
                      <svg className="w-5 h-5 text-accent-green flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-text-secondary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function reorderList(list, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list
  const next = [...list]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

function WeeklySummaryCard({ sessions, previewText }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const weekStart = format(new Date(Date.now() - (6 * 86400000)), 'yyyy-MM-dd')
  const weeklySessions = useMemo(
    () => sessions.filter((session) => session.date >= weekStart),
    [sessions, weekStart]
  )

  const exerciseSummaries = useMemo(() => {
    const byExercise = new Map()

    weeklySessions.forEach((session) => {
      const key = session.exerciseId || session.exerciseName || `session-${session.id}`
      const current = byExercise.get(key) || {
        name: session.exerciseName || 'Unknown exercise',
        muscleGroup: session.muscleGroup || 'Unknown',
        type: session.type || 'weight',
        totalSets: 0,
        totalVolume: 0,
        maxLoad: 0,
      }

      current.totalSets += session.sets?.length || 0
      current.totalVolume += session.totalVolume || 0
      current.maxLoad = Math.max(current.maxLoad, ...(session.sets || []).map((set) => Number(set.weight) || 0))
      byExercise.set(key, current)
    })

    return [...byExercise.values()].sort((a, b) => b.totalSets - a.totalSets)
  }, [weeklySessions])

  const weeklyMuscleGroups = [...new Set(weeklySessions.map((session) => session.muscleGroup).filter(Boolean))]
  const routineNames = [...new Set(weeklySessions.map((session) => session.routineName).filter(Boolean))]

  async function handleGenerateReport() {
    if (!weeklySessions.length) {
      setError('Log at least one workout this week to generate a weekly summary.')
      return
    }

    setLoading(true)
    setError(null)

    const weeklyWorkoutDays = [...new Set(weeklySessions.map((session) => session.date))].length
    const muscleSummary = exerciseSummaries
      .map((summary) => `${summary.name} (${summary.muscleGroup}, ${summary.type}) - ${summary.totalSets} sets, ${summary.totalVolume} total volume, best load/time ${summary.maxLoad}`)
      .join('\n')

    const prompt = `You are a strength coach reviewing my weekly training performance across all workouts, including free workouts outside routines.

THIS WEEK:
- Workout days completed: ${weeklyWorkoutDays}
- Sessions logged: ${weeklySessions.length}
- Routines used: ${routineNames.join(', ') || 'Free workouts only'}
- Muscle groups trained: ${weeklyMuscleGroups.join(', ') || 'None'}

PER-EXERCISE BREAKDOWN:
${muscleSummary}

Please provide:
1. A short weekly summary
2. Which muscle groups were most impacted this week
3. Which muscle groups were least impacted or under-trained
4. Specific recommendations for next week, including where to increase weight or add sets

Format your response as:
**Weekly Summary**
[summary]

**Most Impacted**
- [point]

**Least Impacted**
- [point]

**Next Week Recommendations**
1. [recommendation]
2. [recommendation]
3. [recommendation]

Keep it under 220 words and be concrete.`

    try {
      const text = await generateAiText({ prompt, maxTokens: 500 })
      setReport(text)
    } catch (err) {
      setError(err.message || 'Failed to generate weekly summary.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card card-enter space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-title mb-0">Weekly Insights</p>
          <p className="text-text-secondary text-xs mt-0.5">See your full weekly performance and trends.</p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v-10.5m6 10.5v-6m-9 6v-3m12 3V9" />
          </svg>
        </div>
      </div>

      {previewText && (
        <div className="bg-accent-green/10 border border-accent-green/20 rounded-xl px-3 py-2.5">
          <p className="text-accent-green text-sm font-semibold">{previewText}</p>
        </div>
      )}


      {error && (
        <div className="bg-accent-red/10 border border-accent-red/20 rounded-xl p-3">
          <p className="text-accent-red text-xs">{error}</p>
        </div>
      )}

      {report ? (
        <div className="space-y-3">
          {report.split('\n').filter((line) => line.trim()).map((line, index) => {
            if (line.startsWith('**') && line.endsWith('**')) {
              return <p key={index} className="text-text-primary font-semibold text-base">{line.replace(/\*\*/g, '')}</p>
            }
            if (/^[-\d]/.test(line.trim())) {
              return <p key={index} className="text-text-secondary text-base leading-relaxed">{line}</p>
            }
            return <p key={index} className="text-text-secondary text-base leading-relaxed">{line}</p>
          })}
          <button onClick={() => { setReport(null); handleGenerateReport() }} className="btn-secondary w-full text-sm">
            Regenerate Insights
          </button>
        </div>
      ) : (
        <button onClick={handleGenerateReport} disabled={loading} className="btn-primary w-full disabled:opacity-50">
          {loading ? 'Loading Weekly Insights...' : 'Weekly Insights'}
        </button>
      )}
    </div>
  )
}

// Routine Detail
function RoutineDetail({
  routine,
  onClose,
  onAddExercise,
  onRemoveExercise,
  onDeleteRoutine,
  onRenameRoutine,
  onReorderExercises,
  sessions = [],
}) {
  const navigate = useNavigate()
  const { activeWorkout, startRoutineWorkout, syncRoutine } = useActiveWorkout()
  const [showAddExercise, setShowAddExercise] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pendingExerciseRemoval, setPendingExerciseRemoval] = useState(null)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(routine.name)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const exercises = routine.exercises || []
  const existingIds = exercises.map((ex) => ex.id)

  // Per-exercise stats derived from sessions
  const exerciseStats = useMemo(() => {
    const result = {}
    for (const ex of exercises) {
      const exSessions = sessions.filter((s) => s.exerciseId === ex.id)
      const count = exSessions.length
      let lastDate = null
      let pr = null
      const isTimeBased = ex.type === 'time'
      for (const s of exSessions) {
        if (!lastDate || s.date > lastDate) lastDate = s.date
        if (Array.isArray(s.sets)) {
          for (const set of s.sets) {
            const w = parseFloat(set.weight)
            if (!isNaN(w) && w > 0 && (pr === null || w > pr)) pr = w
          }
        }
      }
      let daysAgoStr = null
      let dotColor = 'bg-text-secondary/20'
      if (lastDate) {
        const todayMs = new Date().setHours(0, 0, 0, 0)
        const lastMs = parseISO(lastDate).setHours(0, 0, 0, 0)
        const diff = Math.round((todayMs - lastMs) / 86400000)
        daysAgoStr = diff === 0 ? 'today' : diff === 1 ? 'yesterday' : `${diff}d ago`
        dotColor = diff === 0 ? 'bg-red-500' : diff === 1 ? 'bg-orange-400' : 'bg-accent-green'
      }
      result[ex.id] = { count, daysAgoStr, pr, dotColor, prLabel: isTimeBased ? 'min best' : 'lbs PR' }
    }
    return result
  }, [exercises, sessions])

  async function handleDelete() {
    await onDeleteRoutine(routine.id)
    onClose()
  }

  async function handleRename() {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === routine.name) { setRenaming(false); return }
    setSaving(true)
    await onRenameRoutine(routine.id, trimmed)
    setSaving(false)
    setRenaming(false)
  }

  function cancelRename() {
    setNewName(routine.name)
    setRenaming(false)
  }

  useEffect(() => {
    if (activeWorkout?.kind === 'routine' && activeWorkout.routine.id === routine.id) {
      syncRoutine(routine)
    }
  }, [activeWorkout, routine, syncRoutine])

  function startWorkout() {
    if (!exercises.length) return
    const isResumingCurrentRoutine =
      activeWorkout?.kind === 'routine' &&
      activeWorkout.routine.id === routine.id &&
      !activeWorkout.summaryReady

    const startExerciseId = isResumingCurrentRoutine
      ? (activeWorkout.currentExerciseId || exercises[0].id)
      : exercises[0].id

    if (!isResumingCurrentRoutine) {
      startRoutineWorkout(routine, { startExerciseId })
    }

    navigate(`/workout/${startExerciseId}`, {
      state: {
        workoutMode: true,
        routine,
      },
    })
  }

  async function handleReorder(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex == null || toIndex == null) return
    const nextExercises = reorderList(exercises, fromIndex, toIndex)
    await onReorderExercises(routine.id, nextExercises)
  }

  return (
    <>
      <div className="fixed inset-x-0 top-0 bottom-16 z-[55] flex flex-col bg-bg animate-fade-in">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-2 flex-shrink-0 border-b border-surface2">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>

          {renaming ? (
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <input
                autoFocus
                type="text"
                className="input flex-1 text-base font-bold py-1.5"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') cancelRename() }}
              />
              <button
                onClick={handleRename}
                disabled={saving || !newName.trim()}
                className="w-8 h-8 rounded-lg bg-accent-green/20 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
              >
                <svg className="w-4 h-4 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </button>
              <button
                onClick={cancelRename}
                className="w-8 h-8 rounded-lg bg-surface2 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
              >
                <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-xl font-bold text-text-primary truncate">{routine.name}</h1>
                <button
                  onClick={() => { setNewName(routine.name); setRenaming(true) }}
                  className="w-7 h-7 rounded-lg bg-surface2 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
                >
                  <svg className="w-3.5 h-3.5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
              </div>
              <p className="text-text-secondary text-xs">
                {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {!renaming && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditMode((m) => !m)}
                className={`text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 ${
                  editMode ? 'bg-accent text-white' : 'bg-surface2 text-text-secondary'
                }`}
              >
                {editMode ? 'Done' : 'Edit'}
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
              >
                <svg className="w-4 h-4 text-accent-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="px-4 pt-4">
          <button
            onClick={startWorkout}
            disabled={exercises.length === 0}
            className="w-full rounded-2xl border border-accent/30 bg-gradient-to-r from-accent to-accent-hover px-4 py-4 text-left shadow-lg shadow-accent/20 disabled:opacity-50"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-white/80 text-[11px] font-semibold uppercase tracking-[0.24em]">
                  {activeWorkout?.kind === 'routine' && activeWorkout.routine.id === routine.id ? 'Resume Workout' : 'Start Workout'}
                </p>
                <p className="text-white font-display text-xl font-bold mt-1">
                  {exercises.length ? `Train ${routine.name}` : 'Add exercises first'}
                </p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/14 border border-white/35 shadow-sm shadow-white/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-1.427 1.529-2.33 2.779-1.643l9.42 5.173c1.295.711 1.295 2.575 0 3.286l-9.42 5.173c-1.25.687-2.779-.216-2.779-1.643V5.653z" />
                </svg>
              </div>
            </div>
          </button>
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {exercises.length === 0 ? (
            <button
              onClick={() => setShowAddExercise(true)}
              className="card flex flex-col items-center justify-center py-16 text-center w-full active:scale-95 transition-transform"
            >
              <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <p className="text-text-primary font-semibold">No exercises yet</p>
              <p className="text-text-secondary text-sm mt-1">Add your first exercise to build this routine.</p>
            </button>
          ) : (
            exercises.map((ex, index) => {
              const stats = exerciseStats[ex.id] || {}
              return (
                <div
                  key={ex.id}
                  onClick={() => !editMode && navigate(`/workout/${ex.id}`, { state: { exercise: ex, routine } })}
                  className={`card w-full flex items-stretch gap-3 py-4 pr-3 text-left overflow-hidden relative ${
                    editMode ? 'cursor-default' : 'active:scale-[0.98] transition-transform'
                  }`}
                >
                  {editMode && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setPendingExerciseRemoval(ex)
                        }}
                        className="w-7 h-7 rounded-full bg-accent-red/20 border border-accent-red/40 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0 self-center"
                      >
                        <svg className="w-3.5 h-3.5 text-accent-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                        </svg>
                      </button>
                      <div className="flex flex-col gap-1 self-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReorder(index, index - 1) }}
                          disabled={index === 0}
                          className="w-8 h-8 rounded-xl bg-surface2 flex items-center justify-center text-text-secondary disabled:opacity-35 active:scale-95 transition-transform"
                          title="Move up"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25L12 7.5l6.75 6.75" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReorder(index, index + 1) }}
                          disabled={index === exercises.length - 1}
                          className="w-8 h-8 rounded-xl bg-surface2 flex items-center justify-center text-text-secondary disabled:opacity-35 active:scale-95 transition-transform"
                          title="Move down"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 9.75L12 16.5 5.25 9.75" />
                          </svg>
                        </button>
                      </div>
                    </>
                  )}

                  {/* Left: name + session info (top) / PR (bottom) */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <p className="text-text-primary text-sm font-semibold truncate">{ex.name}</p>
                      {stats.count > 0 && (
                        <p className="text-text-secondary text-xs mt-1">
                          {stats.count} session{stats.count !== 1 ? 's' : ''} | {stats.daysAgoStr}
                        </p>
                      )}
                    </div>
                    {stats.pr != null && (
                      <p className="text-accent-green text-xs font-semibold">{stats.pr} {stats.prLabel}</p>
                    )}
                  </div>

                  {/* Right: muscle line art */}
                  {(getExerciseIcon(ex.name, ex.muscleGroup) || muscleIcon(ex.muscleGroup, ex.name)) && (
                    <img
                      src={getExerciseIcon(ex.name, ex.muscleGroup) || muscleIcon(ex.muscleGroup, ex.name)}
                      alt={ex.muscleGroup || ex.name}
                      loading="lazy"
                      decoding="async"
                      className="w-20 h-20 object-contain opacity-80 flex-shrink-0 self-center"
                    />
                  )}

                  {/* Status dot in the bottom-right corner */}
                  <span className={`absolute bottom-2.5 right-2.5 w-2.5 h-2.5 rounded-full ${stats.dotColor}`} />
                </div>
              )
            })
          )}
        </div>

        {/* Dot legend */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-4 flex-wrap">
          {[
            { color: 'bg-accent-green',        label: 'Ready to train' },
            { color: 'bg-orange-400',           label: 'Recovery day' },
            { color: 'bg-red-500',              label: 'Trained today' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
              <span className="text-text-secondary text-xs">{label}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 pt-3 pb-4 flex-shrink-0 border-t border-surface2">
          <button onClick={() => setShowAddExercise(true)} className="btn-secondary w-full">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Exercise
          </button>
        </div>
      </div>

      {showAddExercise && (
        <AddExerciseSheet
          onClose={() => setShowAddExercise(false)}
          onAdd={(ex) => onAddExercise(routine.id, ex)}
          existingIds={existingIds}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete routine?"
          message={`This will permanently delete "${routine.name}" and all its exercises.`}
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      )}
      {pendingExerciseRemoval && (
        <ConfirmDialog
          title="Remove exercise?"
          message={`Remove "${pendingExerciseRemoval.name}" from this routine?`}
          confirmLabel="Remove"
          onCancel={() => setPendingExerciseRemoval(null)}
          onConfirm={() => {
            onRemoveExercise(routine.id, pendingExerciseRemoval)
            setPendingExerciseRemoval(null)
          }}
        />
      )}
    </>
  )
}

// Routine Card
function RoutineCard({
  routine,
  onSelect,
  onStart,
  ctaLabel = 'Start Workout',
  tag,
  detailText,
  progressText,
  progressRatio = 0,
  highlight = false,
}) {
  const exercises = routine.exercises || []
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(routine)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(routine)
        }
      }}
      className={`card card-enter tap-glow h-full flex flex-col text-left active:scale-95 transition-transform w-full border ${
        highlight ? 'border-accent/50 shadow-lg shadow-accent/10' : 'border-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
          </svg>
        </div>
        {tag ? (
          <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] ${
            tag === 'In Progress'
              ? 'bg-accent/20 text-accent'
              : tag === 'Recommended'
                ? 'bg-accent-green/15 text-accent-green'
                : 'bg-surface2 text-text-secondary'
          }`}>
            {tag}
          </span>
        ) : (
          <svg className="w-4 h-4 text-text-secondary mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        )}
      </div>
      <h3 className="font-display font-semibold text-text-primary text-base leading-tight">{formatRoutineName(routine.name)}</h3>
      <p className="text-text-secondary text-xs mt-1">
        {progressText || detailText || `${exercises.length} exercise${exercises.length !== 1 ? 's' : ''}`}
      </p>
      {progressRatio > 0 && (
        <div className="mt-3 h-1.5 rounded-full bg-surface2 overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500 progress-reveal"
            style={{ width: `${Math.max(8, Math.min(progressRatio * 100, 100))}%` }}
          />
        </div>
      )}
      <div className="mt-auto pt-3 border-t border-surface2 flex items-center justify-end">
        <button
          onClick={(event) => {
            event.stopPropagation()
            onStart(routine)
          }}
          className="btn-primary px-3 py-1.5 text-xs flex-shrink-0"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}

// Main Page
export default function Routines() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [routines, setRoutines] = useState([])
  const [loading, setLoading] = useState(true)
  const [routinesError, setRoutinesError] = useState(null)
  const [sessionsError, setSessionsError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [showNew, setShowNew] = useState(false)
  const [selectedRoutine, setSelectedRoutine] = useState(null)
  const autoOpenedRef = useRef(false)
  const [exerciseTypeMap, setExerciseTypeMap] = useState({})
  const { activeWorkout, startRoutineWorkout } = useActiveWorkout()

  // Sessions for metrics summary
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) return
    setSessLoading(true)
    setSessionsError(null)
    user.getIdToken()
      .then(() => getDocs(sessionsCol(user.uid)))
      .then((snap) => {
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setSessLoading(false)
      })
      .catch((err) => {
        console.error('Routines sessions load error:', err)
        setSessionsError('Could not load recent routine activity right now.')
        setSessLoading(false)
      })
  }, [reloadKey, user?.uid])

  useEffect(() => {
    if (!user?.uid) return
    user.getIdToken()
      .then(() => Promise.all([
        getDocs(exercisesCol(user.uid)),
        getDocs(globalExercisesCol()),
      ]))
      .then(([userExercisesSnap, globalExercisesSnap]) => {
        const nextTypeMap = {}
        globalExercisesSnap.docs.forEach((docSnapshot) => {
          const data = docSnapshot.data()
          if (data?.id) nextTypeMap[data.id] = data.type || 'weight'
        })
        userExercisesSnap.docs.forEach((docSnapshot) => {
          const data = { ...docSnapshot.data(), id: docSnapshot.id }
          if (data?.id) nextTypeMap[data.id] = data.type || 'weight'
        })
        setExerciseTypeMap(nextTypeMap)
      })
      .catch((error) => console.error('Routine exercise types load error:', error))
  }, [user?.uid])

  const routineInProgress = activeWorkout?.kind === 'routine' && !activeWorkout.summaryReady
    ? activeWorkout
    : null

  const routineSessionStats = useMemo(() => {
    return routines.reduce((acc, routine) => {
      const routineSessions = sessions.filter((session) => (
        session.routineId === routine.id ||
        (!session.routineId && session.routineName === routine.name)
      ))
      const byDate = {}
      routineSessions.forEach((session) => {
        if (!session.date) return
        if (!byDate[session.date]) byDate[session.date] = []
        byDate[session.date].push(session)
      })
      const lastDate = Object.keys(byDate).sort().reverse()[0] || null
      const lastDaySessions = lastDate ? byDate[lastDate] : []
      const exerciseNames = [...new Set(lastDaySessions.map((session) => session.exerciseName).filter(Boolean))]
      const totalSets = lastDaySessions.reduce((sum, session) => sum + (session.sets?.length || 0), 0)
      const durationMinutes = getWorkoutDurationMinutes(lastDaySessions)

      acc[routine.id] = {
        lastDate,
        lastUsedLabel: getRelativeDayLabel(lastDate),
        lastVolume: calcSessionVolume(lastDaySessions),
        totalSets,
        exerciseCount: exerciseNames.length,
        durationLabel: durationMinutes ? formatDurationMinutes(durationMinutes) : null,
      }
      return acc
    }, {})
  }, [routines, sessions])

  const lastSessionSummary = useMemo(() => {
    if (!sessions.length) return null

    const byDate = {}
    sessions.forEach((session) => {
      if (!session.date) return
      if (!byDate[session.date]) byDate[session.date] = []
      byDate[session.date].push(session)
    })
    const sortedDates = Object.keys(byDate).sort().reverse()
    if (!sortedDates.length) return null

    const lastDate = sortedDates.find((date) => byDate[date].some((session) => session.routineName)) || sortedDates[0]
    const lastSessions = byDate[lastDate]
    const routineNames = [...new Set(lastSessions.map((session) => session.routineName).filter(Boolean))]
    const matchedRoutineId = routineNames.length === 1
      ? (lastSessions.find((session) => session.routineId)?.routineId || routines.find((routine) => routine.name === routineNames[0])?.id || null)
      : null
    const exerciseNames = [...new Set(lastSessions.map((session) => session.exerciseName).filter(Boolean))]
    const totalSets = lastSessions.reduce((sum, session) => sum + (session.sets?.length || 0), 0)
    const durationMinutes = getWorkoutDurationMinutes(lastSessions)

    return {
      lastDate,
      label: routineNames.length > 1 ? 'Mixed Workout' : (routineNames[0] || 'Quick Log'),
      volume: calcSessionVolume(lastSessions),
      totalSets,
      exerciseCount: exerciseNames.length,
      durationLabel: durationMinutes ? formatDurationMinutes(durationMinutes) : null,
      exerciseNames,
      routineId: matchedRoutineId,
    }
  }, [routines, sessions])

  const weeklyPreview = useMemo(() => {
    const now = new Date()
    const thisWeekStart = format(new Date(now.getTime() - (6 * 86400000)), 'yyyy-MM-dd')
    const prevWeekStart = format(new Date(now.getTime() - (13 * 86400000)), 'yyyy-MM-dd')
    const prevWeekEnd = format(new Date(now.getTime() - (7 * 86400000)), 'yyyy-MM-dd')
    const thisWeekSessions = sessions.filter((session) => session.date >= thisWeekStart)
    const prevWeekSessions = sessions.filter((session) => session.date >= prevWeekStart && session.date <= prevWeekEnd)
    const thisWeekVolume = calcSessionVolume(thisWeekSessions)
    const prevWeekVolume = calcSessionVolume(prevWeekSessions)

    if (thisWeekVolume <= 0) return 'No workout volume logged this week yet.'
    if (prevWeekVolume <= 0) return `${formatCompactVolume(thisWeekVolume)} lbs logged this week`

    const deltaPct = Math.round(((thisWeekVolume - prevWeekVolume) / prevWeekVolume) * 100)
    return `${deltaPct >= 0 ? '+' : ''}${deltaPct}% volume this week`
  }, [sessions])

  const recommendedRoutine = useMemo(() => {
    if (routineInProgress?.routine?.id) {
      return routines.find((routine) => routine.id === routineInProgress.routine.id) || null
    }

    const lastRoutine = lastSessionSummary?.routineId
      ? routines.find((routine) => routine.id === lastSessionSummary.routineId)
      : null

    const nextInSeries = lastRoutine ? getNextRoutineInSeries(lastRoutine, routines) : null
    if (nextInSeries) return nextInSeries

    return [...routines].sort((a, b) => {
      const aDate = routineSessionStats[a.id]?.lastDate
      const bDate = routineSessionStats[b.id]?.lastDate
      if (!aDate && !bDate) return formatRoutineName(a.name).localeCompare(formatRoutineName(b.name))
      if (!aDate) return -1
      if (!bDate) return 1
      return aDate.localeCompare(bDate)
    })[0] || null
  }, [lastSessionSummary?.routineId, routineInProgress, routineSessionStats, routines])
  const routinesHook = routineInProgress
    ? 'Pick up where you left off. Keep the momentum going.'
    : recommendedRoutine
      ? `${formatRoutineName(recommendedRoutine.name)} is ready when you are.`
      : routines.length > 0
        ? 'Your next session is already one tap away.'
        : 'Build one plan now and make consistency easier all week.'

  function launchRoutine(routine, options = {}) {
    const exercises = routine?.exercises || []
    if (!routine?.id || exercises.length === 0) return

    const isResumingCurrentRoutine = routineInProgress?.routine?.id === routine.id
    const startExerciseId = isResumingCurrentRoutine
      ? (options.startExerciseId || routineInProgress.currentExerciseId || exercises[0].id)
      : (options.startExerciseId || exercises[0].id)

    if (!isResumingCurrentRoutine) {
      startRoutineWorkout(routine, { startExerciseId })
    }

    navigate(`/workout/${startExerciseId}`, {
      state: {
        workoutMode: true,
        routine,
      },
    })
  }

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setRoutinesError(null)
    const unsub = onSnapshot(routinesCol(user.uid), (snap) => {
      const data = snap.docs.map((d) => mergeRoutineExerciseTypes({ id: d.id, ...d.data() }, exerciseTypeMap))
      setRoutines(data)
      setLoading(false)
    }, (error) => {
      console.error('Routines load error:', error)
      setRoutinesError('Could not load your routines right now.')
      setLoading(false)
    })
    return unsub
  }, [exerciseTypeMap, reloadKey, user])

  function retryLoad() {
    setReloadKey((current) => current + 1)
  }

  // Auto-reopen routine when navigating back from a workout
  useEffect(() => {
    const targetId = location.state?.openRoutineId
    if (!targetId || autoOpenedRef.current || routines.length === 0) return
    const r = routines.find((r) => r.id === targetId)
    if (r) {
      setSelectedRoutine(r)
      autoOpenedRef.current = true
    }
  }, [routines, location.state?.openRoutineId])

  useEffect(() => {
    if (!selectedRoutine) return
    const updated = routines.find((r) => r.id === selectedRoutine.id)
    if (updated) setSelectedRoutine(updated)
  }, [routines]) // eslint-disable-line react-hooks/exhaustive-deps

  async function createRoutine(name) {
    await addDoc(routinesCol(user.uid), {
      name,
      exercises: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  async function deleteRoutine(id) {
    await deleteDoc(routineDoc(user.uid, id))
  }

  async function addExercise(routineId, exercise) {
    await updateDoc(routineDoc(user.uid, routineId), {
      exercises: arrayUnion(exercise),
      updatedAt: serverTimestamp(),
    })
    // Optimistic update so the exercise appears immediately without waiting for onSnapshot
    setSelectedRoutine(prev => {
      if (!prev || prev.id !== routineId) return prev
      const alreadyExists = (prev.exercises || []).some(e => e.id === exercise.id)
      if (alreadyExists) return prev
      return { ...prev, exercises: [...(prev.exercises || []), exercise] }
    })
  }

  async function removeExercise(routineId, exercise) {
    await updateDoc(routineDoc(user.uid, routineId), {
      exercises: arrayRemove(exercise),
      updatedAt: serverTimestamp(),
    })
  }

  async function reorderExercises(routineId, nextExercises) {
    await updateDoc(routineDoc(user.uid, routineId), {
      exercises: nextExercises,
      updatedAt: serverTimestamp(),
    })
    setSelectedRoutine((prev) => (
      prev && prev.id === routineId
        ? { ...prev, exercises: nextExercises }
        : prev
    ))
  }

  async function renameRoutine(routineId, name) {
    await updateDoc(routineDoc(user.uid, routineId), {
      name,
      updatedAt: serverTimestamp(),
    })
  }

  return (
    <>
      <PageWrapper showHeader>
        <div className="px-4 pt-2 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold text-text-primary">Routines</h1>
              <p className="text-accent-green text-sm font-medium mt-2">{routinesHook}</p>
            </div>
            <button onClick={() => setShowNew(true)} className="btn-primary text-sm py-2.5 px-4">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Routine
            </button>
          </div>

          {(routinesError || sessionsError) && (
            <div className="card border-red-500/25 bg-red-500/10">
              <p className="text-accent-red font-semibold text-sm">Some routine data is unavailable</p>
              <p className="text-text-secondary text-sm mt-1">{routinesError || sessionsError}</p>
              <button onClick={retryLoad} className="btn-secondary mt-4 w-full">
                Retry
              </button>
            </div>
          )}

          {recommendedRoutine ? (
            <button
              onClick={() => launchRoutine(recommendedRoutine)}
              className="w-full rounded-3xl border border-accent/30 bg-gradient-to-r from-accent to-accent-hover px-4 py-4 text-left shadow-xl shadow-accent/20 active:scale-[0.99] transition-transform"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-white/80 text-[11px] font-semibold uppercase tracking-[0.24em]">
                    {routineInProgress?.routine?.id === recommendedRoutine.id
                      ? 'Resume Workout'
                      : routineSessionStats[recommendedRoutine.id]?.lastDate
                        ? 'Repeat Workout'
                        : 'Start Workout'}
                  </p>
                  <p className="text-white font-display text-xl font-bold mt-1 leading-tight">
                    {formatRoutineName(recommendedRoutine.name)}
                  </p>
                  <p className="text-white/85 text-sm mt-1.5">
                    {routineInProgress?.routine?.id === recommendedRoutine.id
                      ? `${routineInProgress.completed.length} / ${routineInProgress.exercises.length} exercises completed`
                      : `${recommendedRoutine.exercises?.length || 0} exercises ready to train`}
                  </p>
                  <p className="text-white/75 text-xs mt-1">
                    {routineInProgress?.routine?.id === recommendedRoutine.id
                      ? `Next: ${routineInProgress.exercises.find((exercise) => exercise.id === routineInProgress.currentExerciseId)?.name || 'Resume Workout'}`
                      : (routineSessionStats[recommendedRoutine.id]?.lastUsedLabel
                        ? `Last used ${routineSessionStats[recommendedRoutine.id].lastUsedLabel}`
                        : 'Tap to jump straight into training')}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-white/14 border border-white/35 shadow-sm shadow-white/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-1.427 1.529-2.33 2.779-1.643l9.42 5.173c1.295.711 1.295 2.575 0 3.286l-9.42 5.173c-1.25.687-2.779-.216-2.779-1.643V5.653z" />
                  </svg>
                </div>
              </div>
            </button>
          ) : (
            <button
              onClick={() => setShowNew(true)}
              className="card w-full text-left active:scale-[0.99] transition-transform"
            >
              <p className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.24em]">Start Workout</p>
              <p className="text-text-primary font-display text-xl font-bold mt-1">Create your first routine</p>
              <p className="text-text-secondary text-sm mt-1.5">Build a routine once, then start from here in one tap.</p>
            </button>
          )}

          {!sessionsLoading && lastSessionSummary && (
            <button
              onClick={() => {
                if (!lastSessionSummary.routineId) return
                const match = routines.find((routine) => routine.id === lastSessionSummary.routineId)
                if (match) setSelectedRoutine(match)
              }}
              disabled={!lastSessionSummary.routineId}
              className={`card w-full text-left ${lastSessionSummary.routineId ? 'active:scale-[0.99] transition-transform' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="section-title mb-0">Last Session</p>
                <p className="text-text-secondary text-xs flex-shrink-0">
                  {format(parseISO(lastSessionSummary.lastDate), 'MM/dd')}
                </p>
              </div>
              <p className="text-text-primary font-semibold text-base mt-3 line-clamp-1">
                {formatRoutineName(lastSessionSummary.label)}
              </p>
              <div className="mt-2 space-y-1.5">
                {lastSessionSummary.exerciseNames.slice(0, 4).map((name) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                    <p className="text-text-primary text-sm line-clamp-1">{name}</p>
                  </div>
                ))}
                {lastSessionSummary.exerciseNames.length > 4 && (
                  <p className="text-text-secondary text-sm pl-4">+{lastSessionSummary.exerciseNames.length - 4} more</p>
                )}
              </div>
            </button>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : routinesError && routines.length === 0 ? (
            <div className="card card-enter flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-accent-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.007v.008H12v-.008zm8.25-4.508c0 4.556-3.694 8.25-8.25 8.25S3.75 16.556 3.75 12 7.444 3.75 12 3.75 20.25 7.444 20.25 12z" />
                </svg>
              </div>
              <p className="text-text-primary font-semibold">Could not load routines</p>
              <p className="text-text-secondary text-sm mt-1">Retry to restore your saved plans and recent progress.</p>
              <button onClick={retryLoad} className="btn-secondary mt-4 w-full max-w-[220px]">
                Retry
              </button>
            </div>
          ) : routines.length === 0 ? (
            <div className="card card-enter flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                </svg>
              </div>
              <p className="text-text-primary font-semibold">No routines yet</p>
              <p className="text-text-secondary text-sm mt-1">Create your first routine to turn workouts into a repeatable habit.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-1">
                <p className="section-title mb-0">Your Routines</p>
                <p className="text-text-secondary text-xs">{routines.length} saved</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {routines.map((r) => (
                  <RoutineCard
                    key={r.id}
                    routine={r}
                    onSelect={setSelectedRoutine}
                    onStart={launchRoutine}
                    tag={
                      routineInProgress?.routine?.id === r.id
                        ? 'In Progress'
                        : recommendedRoutine?.id === r.id
                          ? 'Recommended'
                          : routineSessionStats[r.id]?.lastDate
                            ? 'Last Used'
                            : null
                    }
                    detailText={
                      routineInProgress?.routine?.id === r.id
                        ? `${routineInProgress.completed.length} / ${routineInProgress.exercises.length} completed`
                        : routineSessionStats[r.id]?.lastUsedLabel
                          ? `Last used ${routineSessionStats[r.id].lastUsedLabel}`
                          : `${(r.exercises || []).length} exercises`
                    }
                    progressText={
                      routineInProgress?.routine?.id === r.id
                        ? `${routineInProgress.completed.length} / ${routineInProgress.exercises.length} exercises completed`
                        : null
                    }
                    ctaLabel={
                      routineInProgress?.routine?.id === r.id
                        ? 'Resume Workout'
                        : routineSessionStats[r.id]?.lastDate
                          ? 'Repeat Workout'
                          : 'Start Workout'
                    }
                    progressRatio={
                      routineInProgress?.routine?.id === r.id
                        ? routineInProgress.completed.length / Math.max(routineInProgress.exercises.length, 1)
                        : 0
                    }
                    highlight={routineInProgress?.routine?.id === r.id || recommendedRoutine?.id === r.id}
                  />
                ))}
              </div>
            </>
          )}

          {!sessionsLoading && (
            <WeeklySummaryCard
              sessions={sessions}
              previewText={weeklyPreview}
            />
          )}
        </div>
      </PageWrapper>

      {showNew && (
        <NewRoutineSheet
          onClose={() => setShowNew(false)}
          onSave={createRoutine}
        />
      )}

      {selectedRoutine && (
        <RoutineDetail
          routine={selectedRoutine}
          sessions={sessions}
          onClose={() => setSelectedRoutine(null)}
          onAddExercise={addExercise}
          onRemoveExercise={removeExercise}
          onReorderExercises={reorderExercises}
          onDeleteRoutine={deleteRoutine}
          onRenameRoutine={renameRoutine}
        />
      )}
    </>
  )
}
