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
  serverTimestamp, arrayUnion, arrayRemove,
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { routinesCol, routineDoc, sessionsCol } from '../firebase/collections'
import PageWrapper from '../components/layout/PageWrapper'

// ─── New Routine Bottom Sheet ──────────────────────────────
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
          {saving ? 'Creating…' : 'Create Routine'}
        </button>
      </div>
    </div>
  )
}

// ─── Infer muscle group from exercise name (fallback) ─────
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

// ─── Add Exercise Sheet (Library Picker) ──────────────────
function AddExerciseSheet({ onClose, onAdd, existingIds = [] }) {
  const { user } = useAuth()
  const [library, setLibrary] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeGroup, setActiveGroup] = useState('All')
  const [addedIds, setAddedIds] = useState(new Set(existingIds))
  const [newlyAdded, setNewlyAdded] = useState(0)

  useEffect(() => {
    if (!user?.uid) return
    getDocs(sessionsCol(user.uid))
      .then((snap) => {
        const seen = new Set()
        const data = []
        snap.docs.forEach((d) => {
          const { exerciseId, exerciseName, muscleGroup } = d.data()
          if (exerciseId && !seen.has(exerciseId)) {
            seen.add(exerciseId)
            const resolvedGroup = muscleGroup || inferMuscleGroup(exerciseName || exerciseId)
            data.push({ id: exerciseId, name: exerciseName || exerciseId, muscleGroup: resolvedGroup })
          }
        })
        data.sort((a, b) => a.name.localeCompare(b.name))
        setLibrary(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user?.uid])

  const groups = ['All', ...[...new Set(library.map((e) => e.muscleGroup))].sort()]

  const filtered = library.filter((ex) => {
    const matchGroup = activeGroup === 'All' || ex.muscleGroup === activeGroup
    const matchSearch = ex.name.toLowerCase().includes(search.toLowerCase())
    return matchGroup && matchSearch
  })

  async function handleAdd(ex) {
    if (addedIds.has(ex.id)) return
    await onAdd({ id: ex.id, name: ex.name, muscleGroup: ex.muscleGroup })
    setAddedIds((prev) => new Set([...prev, ex.id]))
    setNewlyAdded((n) => n + 1)
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
              placeholder="Search exercises…"
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
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-secondary text-sm">No exercises found</p>
              <p className="text-text-secondary text-xs mt-1">Try a different search or group</p>
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

// ─── Delete Confirm Dialog ─────────────────────────────────
function DeleteConfirm({ routineName, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-6 animate-fade-in">
      <div className="bg-surface rounded-2xl p-5 w-full max-w-sm border border-surface2">
        <h3 className="font-display font-bold text-text-primary text-lg mb-2">Delete Routine?</h3>
        <p className="text-text-secondary text-sm mb-5">
          This will permanently delete <span className="text-text-primary font-medium">"{routineName}"</span> and all its exercises.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-accent-red font-semibold text-sm active:scale-95 transition-transform"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Routine Detail (full-screen overlay) ─────────────────
function RoutineDetail({ routine, onClose, onAddExercise, onRemoveExercise, onDeleteRoutine, onRenameRoutine }) {
  const navigate = useNavigate()
  const [showAddExercise, setShowAddExercise] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(routine.name)
  const [saving, setSaving] = useState(false)

  const exercises = routine.exercises || []
  const existingIds = exercises.map((ex) => ex.id)

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
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
            >
              <svg className="w-4 h-4 text-accent-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
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
              <p className="text-text-secondary text-sm mt-1">Tap here to add your first exercise</p>
            </button>
          ) : (
            exercises.map((ex, i) => (
              <div key={ex.id} className="card flex items-center gap-3 py-3">
                <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                  {muscleIcon(ex.muscleGroup, ex.name)
                    ? <img src={muscleIcon(ex.muscleGroup, ex.name)} alt={ex.muscleGroup || ex.name} className="w-11 h-11 object-contain" />
                    : <span className="text-white text-sm font-bold font-display">{i + 1}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-sm font-semibold truncate">{ex.name}</p>
                  <p className="text-text-secondary text-xs">{ex.muscleGroup}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => navigate(`/workout/${ex.id}`, { state: { exercise: ex, routine } })}
                    className="text-xs text-accent-green font-semibold px-3 py-1.5 rounded-lg bg-accent-green/10 active:scale-95 transition-transform"
                  >
                    Log
                  </button>
                  <button
                    onClick={() => onRemoveExercise(routine.id, ex)}
                    className="w-7 h-7 rounded-lg bg-surface2 flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <svg className="w-3.5 h-3.5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
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
        <DeleteConfirm
          routineName={routine.name}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      )}
    </>
  )
}

// ─── Routine Card ──────────────────────────────────────────
function RoutineCard({ routine, onSelect }) {
  const exercises = routine.exercises || []
  return (
    <button
      onClick={() => onSelect(routine)}
      className="card text-left active:scale-95 transition-transform w-full"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
          </svg>
        </div>
        <svg className="w-4 h-4 text-text-secondary mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
      <h3 className="font-display font-semibold text-text-primary text-base leading-tight">{routine.name}</h3>
      <p className="text-text-secondary text-xs mt-1">
        {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}
      </p>
    </button>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function Routines() {
  const { user } = useAuth()
  const location = useLocation()
  const [routines, setRoutines] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [selectedRoutine, setSelectedRoutine] = useState(null)
  const autoOpenedRef = useRef(false)

  // ── Sessions for metrics summary ──────────────────────────
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) return
    user.getIdToken()
      .then(() => getDocs(sessionsCol(user.uid)))
      .then((snap) => {
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setSessLoading(false)
      })
      .catch(() => setSessLoading(false))
  }, [user?.uid])

  const metrics = useMemo(() => {
    if (!sessions.length) return null
    const byDate = {}
    for (const s of sessions) {
      if (!s.date) continue
      if (!byDate[s.date]) byDate[s.date] = []
      byDate[s.date].push(s)
    }
    const sortedDates = Object.keys(byDate).sort().reverse()
    if (!sortedDates.length) return null
    const lastDate = sortedDates[0]
    const lastSessions = byDate[lastDate]
    const lastRoutine = lastSessions.find((s) => s.routineName)?.routineName || 'Free Workout'
    const lastVolume = lastSessions.reduce((sum, s) => sum + (s.totalVolume || 0), 0)
    return { lastDate, lastRoutine, lastVolume }
  }, [sessions])

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(routinesCol(user.uid), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setRoutines(data)
      setLoading(false)
    })
    return unsub
  }, [user])

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
  }

  async function removeExercise(routineId, exercise) {
    await updateDoc(routineDoc(user.uid, routineId), {
      exercises: arrayRemove(exercise),
      updatedAt: serverTimestamp(),
    })
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
        <div className="px-4 pt-2 space-y-4">

          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold text-text-primary">Routines</h1>
            <button onClick={() => setShowNew(true)} className="btn-primary text-sm py-2 px-3">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New
            </button>
          </div>

          {/* ── Metrics Summary ───────────────────────────── */}
          {!sessionsLoading && metrics && (
            <div className="card">
              <p className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-3">Last Session</p>
              <div className="grid grid-cols-2 gap-2.5">

                {/* Routine name */}
                <div className="bg-surface2 rounded-xl p-3">
                  <p className="text-text-secondary text-xs mb-1">Routine</p>
                  <p className="text-text-primary font-semibold text-sm leading-tight line-clamp-2">{metrics.lastRoutine}</p>
                  <p className="text-text-secondary text-xs mt-1">{format(parseISO(metrics.lastDate), 'MMM d')}</p>
                </div>

                {/* Volume */}
                <div className="bg-surface2 rounded-xl p-3">
                  <p className="text-text-secondary text-xs mb-1">Volume</p>
                  {metrics.lastVolume > 0 ? (
                    <>
                      <p className="text-accent-green font-mono font-bold text-lg leading-none">
                        {metrics.lastVolume >= 1000
                          ? `${(metrics.lastVolume / 1000).toFixed(1)}k`
                          : metrics.lastVolume.toLocaleString()}
                      </p>
                      <p className="text-text-secondary text-xs mt-1">lbs total</p>
                    </>
                  ) : (
                    <p className="text-text-secondary text-sm">—</p>
                  )}
                </div>


              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : routines.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                </svg>
              </div>
              <p className="text-text-primary font-semibold">No routines yet</p>
              <p className="text-text-secondary text-sm mt-1">Tap New to create your first routine</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {routines.map((r) => (
                <RoutineCard key={r.id} routine={r} onSelect={setSelectedRoutine} />
              ))}
            </div>
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
          onClose={() => setSelectedRoutine(null)}
          onAddExercise={addExercise}
          onRemoveExercise={removeExercise}
          onDeleteRoutine={deleteRoutine}
          onRenameRoutine={renameRoutine}
        />
      )}
    </>
  )
}
