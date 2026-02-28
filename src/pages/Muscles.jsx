// src/pages/Muscles.jsx
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getDocs, query, where, writeBatch } from 'firebase/firestore'
import { differenceInDays, parseISO } from 'date-fns'
import PageWrapper from '../components/layout/PageWrapper'
import { useAuth } from '../context/AuthContext'
import { sessionsCol } from '../firebase/collections'
import { db } from '../firebase/config'

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const GROUPS = [
  { id: 'Abs',       label: 'Abs',       emoji: '🔥', color: 'bg-orange-500/20 border-orange-500/30', text: 'text-orange-400' },
  { id: 'Biceps',    label: 'Biceps',    emoji: '💪', color: 'bg-blue-500/20 border-blue-500/30',    text: 'text-blue-400' },
  { id: 'Triceps',   label: 'Triceps',   emoji: '⚡', color: 'bg-yellow-500/20 border-yellow-500/30', text: 'text-yellow-400' },
  { id: 'Shoulders', label: 'Shoulders', emoji: '🏔️', color: 'bg-teal-500/20 border-teal-500/30',   text: 'text-teal-400' },
  { id: 'Chest',     label: 'Chest',     emoji: '🛡️', color: 'bg-red-500/20 border-red-500/30',      text: 'text-red-400' },
  { id: 'Back',      label: 'Back',      emoji: '🏋️', color: 'bg-indigo-500/20 border-indigo-500/30', text: 'text-indigo-400' },
  { id: 'Legs',      label: 'Legs',      emoji: '🦵', color: 'bg-green-500/20 border-green-500/30',  text: 'text-green-400' },
  { id: 'Glutes',    label: 'Glutes',    emoji: '🎖️', color: 'bg-pink-500/20 border-pink-500/30',    text: 'text-pink-400' },
  { id: 'Cardio',    label: 'Cardio',    emoji: '❤️', color: 'bg-rose-500/20 border-rose-500/30',    text: 'text-rose-400' },
]

function daysAgo(dateStr) {
  if (!dateStr) return null
  return differenceInDays(new Date(), parseISO(dateStr))
}

function lastDoneLabel(days) {
  if (days === null) return null
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  return `${days}d ago`
}

// ─── Muscle Group Grid Card ──────────────────────────────
function GroupCard({ group, sessions, onClick }) {
  const gs = sessions.filter(s => s.muscleGroup === group.id)
  const exerciseCount = new Set(gs.map(s => s.exerciseId)).size
  const lastDate = gs.map(s => s.date).sort().at(-1)
  const days = daysAgo(lastDate)
  const label = lastDoneLabel(days)

  return (
    <button
      onClick={onClick}
      className={`card border active:scale-95 transition-transform text-left ${group.color} min-h-[110px] flex flex-col justify-between`}
    >
      <span className="text-3xl">{group.emoji}</span>
      <div>
        <h3 className={`font-display font-bold text-lg ${group.text}`}>{group.label}</h3>
        {exerciseCount > 0 ? (
          <p className="text-text-secondary text-xs">
            {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
            {label ? ` · ${label}` : ''}
          </p>
        ) : (
          <p className="text-text-secondary text-xs">No sessions yet</p>
        )}
      </div>
    </button>
  )
}

// ─── Exercise Row Card (detail view) ────────────────────
function ExerciseCard({ exerciseName, sessions, onClick, editMode, onDelete }) {
  const count = sessions.length
  const lastDate = sessions.map(s => s.date).sort().at(-1)
  const days = daysAgo(lastDate)

  // PR = max weight across all sets in all sessions
  const pr = sessions.reduce((max, s) => {
    const setMax = (s.sets || []).reduce((m, set) => Math.max(m, set.weight || 0), 0)
    return Math.max(max, setMax)
  }, 0)

  // For cardio/time-based: max time
  const maxTime = sessions.reduce((max, s) => {
    const t = (s.sets || []).reduce((m, set) => Math.max(m, set.time || 0), 0)
    return Math.max(max, t)
  }, 0)

  return (
    <div className="card flex items-center gap-3 text-left w-full">
      {/* Delete button (edit mode) */}
      {editMode && (
        <button
          onClick={onDelete}
          className="w-7 h-7 rounded-full bg-accent-red flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
        >
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <button onClick={editMode ? undefined : onClick} className="flex items-center gap-3 flex-1 min-w-0 active:scale-95 transition-transform">
        <div className="flex-1 min-w-0">
          <p className="text-text-primary font-semibold text-sm truncate">{exerciseName}</p>
          <p className="text-text-secondary text-xs mt-0.5">
            {count} session{count !== 1 ? 's' : ''}
            {days !== null ? ` · ${lastDoneLabel(days)}` : ''}
          </p>
        </div>

        {!editMode && pr > 0 && (
          <div className="flex-shrink-0 text-right">
            <p className="text-accent-green font-bold text-base font-mono">{pr}</p>
            <p className="text-white text-xs">lbs PR</p>
          </div>
        )}
        {!editMode && pr === 0 && maxTime > 0 && (
          <div className="flex-shrink-0 text-right">
            <p className="text-accent-green font-bold text-sm font-mono">{Math.round(maxTime / 60)}m</p>
            <p className="text-text-secondary text-[10px]">best</p>
          </div>
        )}

        {!editMode && (
          <svg className="w-4 h-4 text-text-secondary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>
    </div>
  )
}

// ─── Add Exercise Bottom Sheet ───────────────────────────
function AddExerciseSheet({ group, onClose, onAdd }) {
  const [name, setName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    // Auto-focus after sheet animates in
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd(trimmed)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl px-4 pt-5 pb-10 shadow-2xl">
        {/* Drag handle */}
        <div className="w-10 h-1 bg-surface2 rounded-full mx-auto mb-5" />

        <h2 className="font-display text-lg font-bold text-text-primary mb-1">
          Add Exercise
        </h2>
        <p className="text-text-secondary text-sm mb-5">
          Adding to <span className={`font-semibold ${group.text}`}>{group.label}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Preacher Curl"
            className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Workout
          </button>
        </form>
      </div>
    </>
  )
}

// ─── Main ─────────────────────────────────────────────────
export default function Muscles() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) return
    user.getIdToken()
      .then(() => getDocs(sessionsCol(user.uid)))
      .then((snap) => {
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user?.uid])

  const [showAdd, setShowAdd] = useState(false)
  const [editMode, setEditMode] = useState(false)

  async function handleDeleteExercise(exerciseId, exerciseName) {
    if (!window.confirm(`Delete "${exerciseName}" and all its sessions? This cannot be undone.`)) return
    const snap = await getDocs(
      query(sessionsCol(user.uid), where('exerciseId', '==', exerciseId))
    )
    if (snap.empty) return
    const batch = writeBatch(db)
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
    setSessions(prev => prev.filter(s => s.exerciseId !== exerciseId))
  }

  // ── Detail view ───────────────────────────────────────
  if (groupId) {
    // Match case-insensitively (URL might be lowercase)
    const group = GROUPS.find(g => g.id.toLowerCase() === groupId.toLowerCase())
    const groupLabel = group?.label || groupId

    const groupSessions = sessions.filter(
      s => s.muscleGroup?.toLowerCase() === groupId.toLowerCase()
    )

    // Group by exercise, sorted by session count desc
    const byExercise = {}
    for (const s of groupSessions) {
      if (!byExercise[s.exerciseId]) {
        byExercise[s.exerciseId] = {
          exerciseId: s.exerciseId,
          exerciseName: s.exerciseName,
          sessions: [],
        }
      }
      byExercise[s.exerciseId].sessions.push(s)
    }
    const exercises = Object.values(byExercise).sort(
      (a, b) => b.sessions.length - a.sessions.length
    )

    return (
      <PageWrapper showHeader={false}>
        <div className="px-4 pt-safe space-y-4 pb-4">

          {/* Header row */}
          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={() => navigate('/muscles')}
              className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-2xl font-bold text-text-primary">
                {group?.emoji} {groupLabel}
              </h1>
              {!loading && (
                <p className="text-text-secondary text-sm">
                  {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            {/* Edit mode toggle */}
            <button
              onClick={() => setEditMode(e => !e)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-colors flex-shrink-0 ${
                editMode ? 'bg-accent-red text-white' : 'bg-surface2 text-text-secondary'
              }`}
            >
              {editMode ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-4.5 h-4.5 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
              )}
            </button>
            {/* Add exercise */}
            {!editMode && (
              <button
                onClick={() => setShowAdd(true)}
                className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            )}
          </div>

          {/* Exercise list */}
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="card h-16 animate-pulse bg-surface2" />
              ))}
            </div>
          ) : exercises.length === 0 ? (
            <div className="card flex flex-col items-center py-12 gap-2">
              <p className="text-text-primary font-semibold">No exercises yet</p>
              <p className="text-text-secondary text-sm text-center">
                Log a {groupLabel} workout to see data here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {exercises.map(ex => (
                <ExerciseCard
                  key={ex.exerciseId}
                  {...ex}
                  editMode={editMode}
                  onClick={() => navigate(`/workout/${ex.exerciseId}`)}
                  onDelete={() => handleDeleteExercise(ex.exerciseId, ex.exerciseName)}
                />
              ))}
            </div>
          )}

        </div>

        {/* Add Exercise sheet */}
        {showAdd && group && (
          <AddExerciseSheet
            group={group}
            onClose={() => setShowAdd(false)}
            onAdd={(exerciseName) => {
              const slug = toSlug(exerciseName)
              navigate(`/workout/${slug}`, {
                state: {
                  exercise: { id: slug, name: exerciseName, muscleGroup: group.label },
                },
              })
            }}
          />
        )}
      </PageWrapper>
    )
  }

  // ── Grid view ─────────────────────────────────────────
  return (
    <PageWrapper showHeader>
      <div className="px-4 pt-2 space-y-4 pb-4">

        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Muscle Groups</h1>
          <p className="text-text-secondary text-sm mt-0.5">Browse exercises by body part</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="card h-[110px] animate-pulse bg-surface2" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {GROUPS.map(group => (
              <GroupCard
                key={group.id}
                group={group}
                sessions={sessions}
                onClick={() => navigate(`/muscles/${group.id}`)}
              />
            ))}
          </div>
        )}

      </div>
    </PageWrapper>
  )
}
