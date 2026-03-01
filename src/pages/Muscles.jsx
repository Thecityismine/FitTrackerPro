// src/pages/Muscles.jsx
import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getDocs, query, where, writeBatch } from 'firebase/firestore'
import {
  format, differenceInDays, parseISO,
  startOfWeek, endOfWeek, subWeeks,
} from 'date-fns'
import PageWrapper from '../components/layout/PageWrapper'
import HexRing from '../components/HexRing'
import { useAuth } from '../context/AuthContext'
import { sessionsCol } from '../firebase/collections'
import { db } from '../firebase/config'

// ─── Push / Pull / Legs config ────────────────────────────
const PPL = [
  {
    id: 'push', label: 'Push Muscles', color: '#8B7332', targetTotal: 27,
    muscles: [
      { id: 'chest',     label: 'Chest',     target: 7  },
      { id: 'shoulders', label: 'Shoulders', target: 12 },
      { id: 'triceps',   label: 'Triceps',   target: 8  },
    ],
  },
  {
    id: 'pull', label: 'Pull Muscles', color: '#8B1A2B', targetTotal: 15,
    muscles: [
      { id: 'back',   label: 'Back',   target: 7 },
      { id: 'biceps', label: 'Biceps', target: 8 },
    ],
  },
  {
    id: 'legs', label: 'Leg Muscles', color: '#1F4D3A', targetTotal: 21,
    muscles: [
      { id: 'quads',      label: 'Quadriceps', target: 7 },
      { id: 'hamstrings', label: 'Hamstrings', target: 7 },
      { id: 'glutes',     label: 'Glutes',     target: 7 },
    ],
  },
]
const TOTAL_TARGET = PPL.reduce((s, g) => s + g.targetTotal, 0) // 63

// Map muscleGroup / exerciseName → { groupId, muscleId }
const PPL_MAP = {
  chest: { groupId: 'push', muscleId: 'chest' }, pec: { groupId: 'push', muscleId: 'chest' },
  bench: { groupId: 'push', muscleId: 'chest' }, pecs: { groupId: 'push', muscleId: 'chest' },
  shoulder: { groupId: 'push', muscleId: 'shoulders' }, shoulders: { groupId: 'push', muscleId: 'shoulders' },
  delt: { groupId: 'push', muscleId: 'shoulders' }, delts: { groupId: 'push', muscleId: 'shoulders' },
  tricep: { groupId: 'push', muscleId: 'triceps' }, triceps: { groupId: 'push', muscleId: 'triceps' },
  back: { groupId: 'pull', muscleId: 'back' }, lats: { groupId: 'pull', muscleId: 'back' },
  lat: { groupId: 'pull', muscleId: 'back' }, rhomboid: { groupId: 'pull', muscleId: 'back' },
  traps: { groupId: 'pull', muscleId: 'back' }, trap: { groupId: 'pull', muscleId: 'back' },
  bicep: { groupId: 'pull', muscleId: 'biceps' }, biceps: { groupId: 'pull', muscleId: 'biceps' },
  arms: { groupId: 'pull', muscleId: 'biceps' }, arm: { groupId: 'pull', muscleId: 'biceps' },
  forearms: { groupId: 'pull', muscleId: 'biceps' }, forearm: { groupId: 'pull', muscleId: 'biceps' },
  legs: { groupId: 'legs', muscleId: 'quads' }, leg: { groupId: 'legs', muscleId: 'quads' },
  quads: { groupId: 'legs', muscleId: 'quads' }, quad: { groupId: 'legs', muscleId: 'quads' },
  quadriceps: { groupId: 'legs', muscleId: 'quads' }, squat: { groupId: 'legs', muscleId: 'quads' },
  hamstrings: { groupId: 'legs', muscleId: 'hamstrings' }, hamstring: { groupId: 'legs', muscleId: 'hamstrings' },
  glutes: { groupId: 'legs', muscleId: 'glutes' }, glute: { groupId: 'legs', muscleId: 'glutes' },
  gluts: { groupId: 'legs', muscleId: 'glutes' }, hip: { groupId: 'legs', muscleId: 'glutes' },
}

// Also match via exercise name for common exercises
const EXERCISE_KEYWORDS = [
  { re: /\brow\b/,           val: { groupId: 'pull', muscleId: 'back'   } },
  { re: /\bpulldown\b/,      val: { groupId: 'pull', muscleId: 'back'   } },
  { re: /\bchin\b/,          val: { groupId: 'pull', muscleId: 'back'   } },
  { re: /\bdeadlift\b/,      val: { groupId: 'pull', muscleId: 'back'   } },
  { re: /\bcurl\b/,          val: { groupId: 'pull', muscleId: 'biceps' } },
  { re: /\bpushdown\b/,      val: { groupId: 'push', muscleId: 'triceps'} },
  { re: /\bskull\b/,         val: { groupId: 'push', muscleId: 'triceps'} },
  { re: /\blunge\b/,         val: { groupId: 'legs', muscleId: 'quads'  } },
  { re: /\bleg press\b/,     val: { groupId: 'legs', muscleId: 'quads'  } },
  { re: /\bhip thrust\b/,    val: { groupId: 'legs', muscleId: 'glutes' } },
  { re: /\bglute bridge\b/,  val: { groupId: 'legs', muscleId: 'glutes' } },
]

function getMuscleCategory(muscleGroup, exerciseName) {
  const mg = (muscleGroup || '').trim().toLowerCase()
  if (PPL_MAP[mg]) return PPL_MAP[mg]
  const search = `${mg} ${(exerciseName || '').toLowerCase()}`
  for (const kw of EXERCISE_KEYWORDS) {
    if (kw.re.test(search)) return kw.val
  }
  for (const [key, val] of Object.entries(PPL_MAP)) {
    if (new RegExp(`\\b${key}\\b`).test(search)) return val
  }
  return null
}

function computeWeekSets(weekSessions) {
  // Returns { push: { chest, shoulders, triceps }, pull: { back, biceps }, legs: { quads, hamstrings, glutes } }
  const counts = {}
  PPL.forEach(g => {
    counts[g.id] = {}
    g.muscles.forEach(m => { counts[g.id][m.id] = 0 })
  })
  for (const s of weekSessions) {
    const cat = getMuscleCategory(s.muscleGroup, s.exerciseName)
    if (!cat) continue
    const setCount = (s.sets || []).length
    counts[cat.groupId][cat.muscleId] = (counts[cat.groupId][cat.muscleId] || 0) + setCount
  }
  return counts
}

// ─── Helpers ──────────────────────────────────────────────
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
function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const GROUPS_META = [
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

// ─── Exercise Card (detail view) ──────────────────────────
function ExerciseCard({ exerciseName, sessions, onClick, editMode, onDelete }) {
  const count    = sessions.length
  const lastDate = sessions.map(s => s.date).sort().at(-1)
  const days     = daysAgo(lastDate)
  const pr       = sessions.reduce((max, s) =>
    Math.max(max, ...(s.sets || []).map(st => st.weight || 0)), 0)
  const maxTime  = sessions.reduce((max, s) =>
    Math.max(max, ...(s.sets || []).map(st => st.time || 0)), 0)

  return (
    <div className="card flex items-center gap-3 text-left w-full">
      {editMode && (
        <button onClick={onDelete}
          className="w-7 h-7 rounded-full bg-accent-red flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform">
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      <button onClick={editMode ? undefined : onClick}
        className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-95 transition-transform">
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

// ─── Add Exercise Sheet ────────────────────────────────────
function AddExerciseSheet({ group, onClose, onAdd }) {
  const [name, setName] = useState('')
  const inputRef = useRef(null)
  useEffect(() => {
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
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <form onSubmit={handleSubmit}
        className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: '80vh' }}>
        <div className="flex-shrink-0 px-4 pt-5 pb-4">
          <div className="w-10 h-1 bg-surface2 rounded-full mx-auto mb-4" />
          <h2 className="font-display text-lg font-bold text-text-primary mb-1">Add Exercise</h2>
          <p className="text-text-secondary text-sm">Adding to <span className="font-semibold text-text-primary">{group.label}</span></p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <input ref={inputRef} type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Preacher Curl"
            className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div className="flex-shrink-0 px-4 pt-3 pb-8 border-t border-surface2">
          <button type="submit" disabled={!name.trim()}
            className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed">
            Start Workout
          </button>
        </div>
      </form>
    </>
  )
}

// ─── PPL Group Row ─────────────────────────────────────────
function GroupRow({ group, sets, expanded, onToggle }) {
  const totalActual = group.muscles.reduce((s, m) => s + (sets[group.id]?.[m.id] || 0), 0)
  const pct = Math.min(totalActual / group.targetTotal, 1)
  const toGo = Math.max(group.targetTotal - totalActual, 0)

  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} className="flex items-center gap-3 w-full text-left">
        {/* Hex icon */}
        <div className="flex-shrink-0">
          <HexRing
            segments={[{ pct, color: group.color }, { pct: 0, color: 'transparent' }, { pct: 0, color: 'transparent' }]}
            size={44} strokeWidth={5}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-text-primary font-semibold text-sm">{group.label}</p>
          <p className="text-text-secondary text-xs">
            {totalActual} / {group.targetTotal} Sets
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {toGo > 0 && (
            <div className="text-right">
              <p className="text-text-primary font-bold text-sm">{toGo}</p>
              <p className="text-text-secondary text-xs">to go</p>
            </div>
          )}
          {toGo === 0 && (
            <span className="text-accent-green text-xs font-bold">Done ✓</span>
          )}
          <svg
            className={`w-4 h-4 text-text-secondary transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      {/* Sub-muscle breakdown */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-surface2 space-y-2">
          {group.muscles.map(muscle => {
            const actual = sets[group.id]?.[muscle.id] || 0
            const mPct = Math.min(actual / muscle.target, 1)
            return (
              <div key={muscle.id} className="flex items-center gap-3">
                <HexRing
                  segments={[{ pct: mPct, color: group.color }, { pct: 0, color: 'transparent' }, { pct: 0, color: 'transparent' }]}
                  size={32} strokeWidth={4}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-sm font-medium">{muscle.label}</p>
                  <p className="text-text-secondary text-xs">{actual} / {muscle.target} Sets</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-text-primary font-bold text-sm">{Math.max(muscle.target - actual, 0)}</p>
                  <p className="text-text-secondary text-xs">to go</p>
                </div>
              </div>
            )
          })}
          <p className="text-text-secondary text-xs pt-1 border-t border-surface2 mt-2">
            Primary muscles = 1 set · Secondary muscles = 0.5 sets
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Small hex for history ─────────────────────────────────
function HistoryHex({ pct, label, color }) {
  const overall = Math.round(pct * 100)
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-16 h-16">
        <HexRing
          segments={[
            { pct, color },
            { pct, color: color + 'aa' },
            { pct, color: color + '66' },
          ]}
          size={64} strokeWidth={6}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-[10px] font-bold text-text-primary">{overall}%</p>
        </div>
      </div>
      <p className="text-text-secondary text-[10px]">{label}</p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────
export default function Muscles() {
  const { groupId } = useParams()
  const navigate    = useNavigate()
  const { user }    = useAuth()

  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [showAdd, setShowAdd]   = useState(false)
  const [editMode, setEditMode] = useState(false)

  useEffect(() => {
    if (!user?.uid) return
    user.getIdToken()
      .then(() => getDocs(sessionsCol(user.uid)))
      .then(snap => {
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user?.uid])

  async function handleDeleteExercise(exerciseId, exerciseName) {
    if (!window.confirm(`Delete "${exerciseName}" and all its sessions? This cannot be undone.`)) return
    const snap = await getDocs(query(sessionsCol(user.uid), where('exerciseId', '==', exerciseId)))
    if (snap.empty) return
    const batch = writeBatch(db)
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
    setSessions(prev => prev.filter(s => s.exerciseId !== exerciseId))
  }

  // ── Detail view (/muscles/:groupId) ──────────────────────
  if (groupId) {
    const meta = GROUPS_META.find(g => g.id.toLowerCase() === groupId.toLowerCase())
    const groupLabel = meta?.label || groupId
    const groupSessions = sessions.filter(s => s.muscleGroup?.toLowerCase() === groupId.toLowerCase())
    const byExercise = {}
    for (const s of groupSessions) {
      if (!byExercise[s.exerciseId]) {
        byExercise[s.exerciseId] = { exerciseId: s.exerciseId, exerciseName: s.exerciseName, sessions: [] }
      }
      byExercise[s.exerciseId].sessions.push(s)
    }
    const exercises = Object.values(byExercise).sort((a, b) => b.sessions.length - a.sessions.length)

    return (
      <PageWrapper showHeader={false}>
        <div className="px-4 pt-safe space-y-4 pb-4">
          <div className="flex items-center gap-3 pt-4">
            <button onClick={() => navigate('/muscles')}
              className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0">
              <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-2xl font-bold text-text-primary">
                {meta?.emoji} {groupLabel}
              </h1>
              {!loading && <p className="text-text-secondary text-sm">{exercises.length} exercise{exercises.length !== 1 ? 's' : ''}</p>}
            </div>
            <button onClick={() => setEditMode(e => !e)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-colors flex-shrink-0 ${editMode ? 'bg-accent-red text-white' : 'bg-surface2 text-text-secondary'}`}>
              {editMode
                ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>}
            </button>
            {!editMode && (
              <button onClick={() => setShowAdd(true)}
                className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center active:scale-95 transition-transform flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-surface2" />)}</div>
          ) : exercises.length === 0 ? (
            <div className="card flex flex-col items-center py-12 gap-2">
              <p className="text-text-primary font-semibold">No exercises yet</p>
              <p className="text-text-secondary text-sm text-center">Log a {groupLabel} workout to see data here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {exercises.map(ex => (
                <ExerciseCard key={ex.exerciseId} {...ex}
                  editMode={editMode}
                  onClick={() => navigate(`/workout/${ex.exerciseId}`)}
                  onDelete={() => handleDeleteExercise(ex.exerciseId, ex.exerciseName)} />
              ))}
            </div>
          )}
        </div>

        {showAdd && meta && (
          <AddExerciseSheet group={meta} onClose={() => setShowAdd(false)}
            onAdd={exerciseName => {
              const slug = toSlug(exerciseName)
              navigate(`/workout/${slug}`, { state: { exercise: { id: slug, name: exerciseName, muscleGroup: meta.label } } })
            }} />
        )}
      </PageWrapper>
    )
  }

  // ── Main view: Weekly Set Targets ─────────────────────────
  const weekStartStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEndStr   = format(endOfWeek(new Date(),   { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekLabel    = `${format(new Date(weekStartStr + 'T12:00:00'), 'MMM d')} – ${format(new Date(weekEndStr + 'T12:00:00'), 'MMM d')}`

  const weeklySets = useMemo(() => {
    const ws = sessions.filter(s => s.date >= weekStartStr && s.date <= weekEndStr)
    return computeWeekSets(ws)
  }, [sessions, weekStartStr, weekEndStr])

  const totalActual = PPL.reduce((s, g) =>
    s + g.muscles.reduce((ms, m) => ms + (weeklySets[g.id]?.[m.id] || 0), 0), 0)
  const overallPct  = totalActual / TOTAL_TARGET
  const overallDisp = Math.round(overallPct * 100)

  // History: last 4 weeks
  const history = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const ws  = format(startOfWeek(subWeeks(new Date(), i + 1), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const we  = format(endOfWeek(subWeeks(new Date(),   i + 1), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const wl  = format(new Date(ws + 'T12:00:00'), 'MMM d')
      const wSessions = sessions.filter(s => s.date >= ws && s.date <= we)
      const wSets = computeWeekSets(wSessions)
      const wTotal = PPL.reduce((s, g) => s + g.muscles.reduce((ms, m) => ms + (wSets[g.id]?.[m.id] || 0), 0), 0)
      return { label: wl, pct: wTotal / TOTAL_TARGET }
    }).reverse()
  }, [sessions])

  return (
    <PageWrapper showHeader>
      <div className="px-4 pt-2 space-y-4 pb-6">

        {/* Header */}
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Weekly Set Targets</h1>
          <p className="text-text-secondary text-sm mt-0.5">{weekLabel}</p>
        </div>

        {/* Big hex ring */}
        {!loading && (
          <div className="flex flex-col items-center py-2">
            <div className="relative">
              <HexRing
                segments={PPL.map(g => ({
                  pct: Math.min(
                    g.muscles.reduce((s, m) => s + (weeklySets[g.id]?.[m.id] || 0), 0) / g.targetTotal,
                    1
                  ),
                  color: g.color,
                }))}
                size={200}
                strokeWidth={16}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="font-display text-4xl font-bold text-text-primary leading-tight">{overallDisp}%</p>
                <p className="text-text-secondary text-xs">{totalActual} / {TOTAL_TARGET} sets</p>
              </div>
            </div>

            {/* Color legend */}
            <div className="flex gap-4 mt-3">
              {PPL.map(g => (
                <div key={g.id} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: g.color }} />
                  <p className="text-text-secondary text-xs">{g.id === 'push' ? 'Push' : g.id === 'pull' ? 'Pull' : 'Legs'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-[200px] h-[200px] rounded-full animate-pulse bg-surface2" />
          </div>
        )}

        {/* Group rows */}
        <div className="space-y-2">
          {PPL.map(group => (
            <GroupRow
              key={group.id}
              group={group}
              sets={weeklySets}
              expanded={expandedId === group.id}
              onToggle={() => setExpandedId(prev => prev === group.id ? null : group.id)}
            />
          ))}
        </div>

        {/* History */}
        {!loading && history.some(h => h.pct > 0) && (
          <div>
            <p className="section-title">History</p>
            <div className="flex gap-4 justify-around">
              {history.map((h, i) => (
                <HistoryHex key={i} pct={h.pct} label={h.label} color="#22c55e" />
              ))}
            </div>
          </div>
        )}

        {/* Browse exercises by muscle group */}
        <div>
          <p className="section-title">Browse Exercises</p>
          <div className="grid grid-cols-3 gap-2">
            {GROUPS_META.map(g => (
              <button
                key={g.id}
                onClick={() => navigate(`/muscles/${g.id.toLowerCase()}`)}
                className={`rounded-2xl border py-4 flex flex-col items-center gap-2 active:scale-95 transition-transform ${g.color}`}
              >
                <span className="text-2xl leading-none">{g.emoji}</span>
                <p className={`text-xs font-semibold leading-none ${g.text}`}>{g.label}</p>
              </button>
            ))}
          </div>
        </div>

      </div>
    </PageWrapper>
  )
}
