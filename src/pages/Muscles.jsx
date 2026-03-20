// src/pages/Muscles.jsx
import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { getDocs, setDoc, updateDoc, query, where, writeBatch, serverTimestamp, doc } from 'firebase/firestore'
import {
  format, differenceInDays, parseISO,
  startOfWeek, endOfWeek,
} from 'date-fns'
import PageWrapper from '../components/layout/PageWrapper'
import { useActiveWorkout } from '../context/ActiveWorkoutContext'
import { useAuth } from '../context/AuthContext'
import { sessionsCol, exercisesCol, exerciseDoc, globalExercisesCol, routinesCol } from '../firebase/collections'
import { db } from '../firebase/config'
import { getExerciseIcon } from '../utils/exerciseIcons'

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
    id: 'legs', label: 'Leg Muscles', color: '#22C55E', targetTotal: 21,
    muscles: [
      { id: 'quads',      label: 'Quadriceps', target: 7 },
      { id: 'hamstrings', label: 'Hamstrings', target: 7 },
      { id: 'glutes',     label: 'Glutes',     target: 7 },
    ],
  },
]
const RECOVERY_SILHOUETTE_SRC = '/man-silhouette.png'

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

function clampPct(value) {
  return Math.max(0, Math.min(value || 0, 1))
}

function getGroupActualSets(group, sets) {
  return group.muscles.reduce((sum, muscle) => sum + (sets[group.id]?.[muscle.id] || 0), 0)
}

function hexToRgba(hex, alpha) {
  const clean = (hex || '').replace('#', '')
  if (clean.length !== 6) return `rgba(255,255,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function buildSilhouetteGradient(segments, alphaBase = 0.26, alphaRange = 0.48) {
  return `linear-gradient(
    to bottom,
    ${hexToRgba(segments[0].color, alphaBase + segments[0].pct * alphaRange)} 0%,
    ${hexToRgba(segments[0].color, alphaBase + segments[0].pct * alphaRange)} 33.333%,
    ${hexToRgba(segments[1].color, alphaBase + segments[1].pct * alphaRange)} 33.333%,
    ${hexToRgba(segments[1].color, alphaBase + segments[1].pct * alphaRange)} 66.666%,
    ${hexToRgba(segments[2].color, alphaBase + segments[2].pct * alphaRange)} 66.666%,
    ${hexToRgba(segments[2].color, alphaBase + segments[2].pct * alphaRange)} 100%
  )`
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

function formatRoutineName(name = '') {
  return name
    .replace(/\bDay-(\d+)\b/g, 'Day $1')
    .replace(/^(.*?)(\sDay \d+)$/, '$1 -$2')
}

const GROUPS_META = [
  { id: 'Abs',       label: 'Abs',       icon: '/icons/abs.png' },
  { id: 'Biceps',    label: 'Biceps',    icon: '/icons/arm.png' },
  { id: 'Triceps',   label: 'Triceps',   icon: '/icons/triceps.png' },
  { id: 'Shoulders', label: 'Shoulders', icon: '/icons/shoulder.png' },
  { id: 'Chest',     label: 'Chest',     icon: '/icons/chest.png' },
  { id: 'Back',      label: 'Back',      icon: '/icons/back.png' },
  { id: 'Legs',      label: 'Legs',      icon: '/icons/legs.png' },
  { id: 'Glutes',    label: 'Glutes',    icon: '/icons/glutes.png' },
  { id: 'Cardio',    label: 'Cardio',    icon: '/icons/cardio.png' },
  { id: 'Recovery',  label: 'Recovery',  icon: '/icons/Recovery.png' },
]

// ─── Exercise Card (detail view) ──────────────────────────
function ExerciseCard({ exerciseName, muscleGroup = '', sessions, onClick, editMode, onDelete, onEdit, type = 'weight' }) {
  const isTime   = type === 'time'
  const count    = sessions.length
  const lastDate = sessions.map(s => s.date).sort().at(-1)
  const days     = daysAgo(lastDate)
  // For time exercises weight stores minutes; for weight exercises weight stores lbs
  const best     = sessions.reduce((max, s) =>
    Math.max(max, ...(s.sets || []).map(st => st.weight || 0)), 0)
  const icon     = getExerciseIcon(exerciseName, muscleGroup)

  return (
    <div className="card flex items-center gap-3 text-left w-full">
      {editMode && (
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <button onClick={onDelete}
            className="w-7 h-7 rounded-full bg-accent-red flex items-center justify-center active:scale-90 transition-transform">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button onClick={onEdit}
            className="w-7 h-7 rounded-full bg-surface2 flex items-center justify-center active:scale-90 transition-transform">
            <svg className="w-3.5 h-3.5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
          </button>
        </div>
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
        {!editMode && icon && (
          <img src={icon} alt="" loading="lazy" decoding="async" className="w-12 h-12 object-contain opacity-80 flex-shrink-0" />
        )}
        {!editMode && best > 0 && (
          <div className="flex-shrink-0 text-right">
            <p className="text-accent-green font-bold text-base font-mono">{best}{isTime ? 'm' : ''}</p>
            <p className="text-white text-xs">{isTime ? 'min PR' : 'lbs PR'}</p>
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
  const [type, setType] = useState('weight') // 'weight' | 'time'
  const inputRef = useRef(null)
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])
  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd(trimmed, type)
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" style={{ paddingBottom: '30vh' }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <form onSubmit={handleSubmit}
        className="relative w-full bg-surface rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-text-primary">Add Exercise</h2>
          <p className="text-text-secondary text-sm mt-0.5">Adding to <span className="font-semibold text-text-primary">{group.label}</span></p>
        </div>
        <input ref={inputRef} type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Preacher Curl"
          className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent" />
        {/* Lbs / Min toggle */}
        <div>
          <p className="text-text-secondary text-xs mb-2">Tracking type</p>
          <div className="flex gap-2">
            {[{ value: 'weight', label: 'Lbs', sub: 'weight-based' }, { value: 'time', label: 'Min', sub: 'time-based' }].map(opt => (
              <button key={opt.value} type="button" onClick={() => setType(opt.value)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                  type === opt.value
                    ? 'bg-accent border-accent text-white'
                    : 'bg-surface2 border-surface2 text-text-secondary'
                }`}>
                {opt.label}
                <span className="block text-xs font-normal opacity-70">{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={!name.trim()}
            className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed">
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── PPL Group Row ─────────────────────────────────────────
function CircleProgress({ pct, color, size = 44, strokeWidth = 5 }) {
  const clamped = clampPct(pct)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clamped)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(51,65,85,0.85)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

function GroupRow({ group, sets, expanded, onToggle, isLowest }) {
  const totalActual = group.muscles.reduce((s, m) => s + (sets[group.id]?.[m.id] || 0), 0)
  const pct = Math.min(totalActual / group.targetTotal, 1)
  const toGo = Math.max(group.targetTotal - totalActual, 0)

  return (
    <div className={`card overflow-hidden transition-shadow ${isLowest ? 'ring-1 ring-[#22C55E]/30 shadow-[0_0_0_1px_rgba(34,197,94,0.12)]' : ''}`}>
      <button onClick={onToggle} className="flex items-center gap-3 w-full text-left">
        {/* Circle icon */}
        <div className="flex-shrink-0">
          <CircleProgress pct={pct} color={group.color} size={44} strokeWidth={5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-text-primary font-semibold text-sm">{group.label}</p>
            {isLowest && (
              <span className="rounded-full bg-[#22C55E]/16 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#62E38D]">
                Needs focus
              </span>
            )}
          </div>
          <p className="text-text-secondary text-xs">
            {totalActual} / {group.targetTotal} Sets
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {toGo > 0 && (
            <div className="text-right">
              <p className="text-text-primary font-bold text-sm">{toGo}</p>
              <p className="text-text-secondary text-xs">sets to hit goal</p>
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
                <CircleProgress pct={mPct} color={group.color} size={32} strokeWidth={4} />
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-sm font-medium">{muscle.label}</p>
                  <p className="text-text-secondary text-xs">{actual} / {muscle.target} Sets</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-text-primary font-bold text-sm">{Math.max(muscle.target - actual, 0)}</p>
                  <p className="text-text-secondary text-xs">sets to hit goal</p>
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
function RecoveryHero({ groups, sets, totalActual, totalTarget, paceLabel, paceTone }) {
  const segments = groups.map((group) => {
    const actual = getGroupActualSets(group, sets)
    return {
      ...group,
      actual,
      pct: clampPct(actual / group.targetTotal),
      displayPct: Math.round(clampPct(actual / group.targetTotal) * 100),
      shortLabel: group.id === 'legs' ? 'Legs' : group.id === 'pull' ? 'Pull' : 'Push',
    }
  })

  const overallPct = clampPct(totalActual / totalTarget)
  const mainGradient = buildSilhouetteGradient(segments, 0.28, 0.42)
  const glowGradient = buildSilhouetteGradient(segments, 0.18, 0.36)
  const maskStyle = {
    WebkitMaskImage: `url("${RECOVERY_SILHOUETTE_SRC}")`,
    maskImage: `url("${RECOVERY_SILHOUETTE_SRC}")`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'top center',
    maskPosition: 'top center',
  }
  const bandLabels = [
    { top: '25%', value: segments[0].displayPct },
    { top: '44%', value: segments[1].displayPct },
    { top: '60%', value: segments[2].displayPct },
  ]

  return (
    <div className="flex flex-col items-center pt-2 pb-1">
      <div className="relative w-[230px] h-[288px]">
        <div
          className="absolute inset-0 scale-95 blur-[20px] opacity-95"
          style={{ ...maskStyle, background: glowGradient }}
        />
        <div
          className="absolute inset-0"
          style={{ ...maskStyle, background: mainGradient }}
        />
        <img
          src={RECOVERY_SILHOUETTE_SRC}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-contain object-top opacity-90 pointer-events-none"
        />

        {bandLabels.map((band) => (
          <div
            key={band.top}
            className="absolute left-1/2 -translate-x-1/2 text-center"
            style={{ top: band.top, textShadow: '0 0 18px rgba(255,255,255,0.2)' }}
          >
            <p className="font-display text-lg font-bold text-white">{band.value}%</p>
          </div>
        ))}
      </div>

      <div className="relative -mt-[54px] w-[352px] max-w-full px-3">
        <div className="h-4 rounded-full bg-slate-700/70 overflow-hidden shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)]">
          <div
            className="h-full rounded-full bg-[#F2C14E]"
            style={{
              width: `${Math.round(overallPct * 100)}%`,
              boxShadow: '0 0 14px rgba(242,193,78,0.5)',
            }}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-col items-center">
        <p className="font-display text-4xl font-bold text-text-primary leading-none">{Math.round(overallPct * 100)}%</p>
        <p className="text-text-primary text-sm font-semibold mt-1">{totalActual}/{totalTarget} sets</p>
        <p className="text-text-secondary text-xs">completed</p>
        <p className={`mt-1 text-xs font-semibold ${paceTone}`}>
          {Math.round(overallPct * 100)}% Complete • {paceLabel}
        </p>
      </div>

      <div className="flex items-center justify-center gap-6 mt-4">
        {segments.map((segment) => (
          <div key={segment.id} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: segment.color,
                boxShadow: `0 0 10px ${hexToRgba(segment.color, 0.55)}`,
              }}
            />
            <p className="text-text-primary text-sm font-medium">{segment.shortLabel}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────
export default function Muscles() {
  const { groupId } = useParams()
  const navigate    = useNavigate()
  const { user, profile } = useAuth()
  const { activeWorkout, startRoutineWorkout } = useActiveWorkout()

  const [sessions, setSessions] = useState([])
  const [savedExercises, setSavedExercises] = useState([])
  const [routines, setRoutines] = useState([])
  const [loading, setLoading]   = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [showAdd, setShowAdd]   = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingExercise, setEditingExercise] = useState(null) // { exerciseId, exerciseName, type }
  const [savingExercise, setSavingExercise] = useState(false)

  // PPL config — targets driven by user profile (falls back to PPL defaults)
  const pplConfig = useMemo(() => [
    { ...PPL[0], targetTotal: profile?.weeklyTargets?.push ?? PPL[0].targetTotal },
    { ...PPL[1], targetTotal: profile?.weeklyTargets?.pull ?? PPL[1].targetTotal },
    { ...PPL[2], targetTotal: profile?.weeklyTargets?.legs ?? PPL[2].targetTotal },
  ], [profile?.weeklyTargets?.push, profile?.weeklyTargets?.pull, profile?.weeklyTargets?.legs])
  const totalTarget = pplConfig.reduce((s, g) => s + g.targetTotal, 0)

  useEffect(() => {
    if (!user?.uid) return
    user.getIdToken()
      .then(() => Promise.all([
        getDocs(sessionsCol(user.uid)),
        getDocs(exercisesCol(user.uid)),
        getDocs(globalExercisesCol()),
        getDocs(routinesCol(user.uid)),
      ]))
      .then(async ([sessSnap, exSnap, globalSnap, routineSnap]) => {
        setSessions(sessSnap.docs.map(d => ({ id: d.id, ...d.data() })))

        // Build map starting from global library so every user sees all exercises
        const map = {}
        globalSnap.docs.forEach(d => {
          const { id, name, muscleGroup, type } = d.data()
          if (id && name && muscleGroup) map[id] = { id, name, muscleGroup, type: type || 'weight' }
        })
        // Overlay user's own exercises (custom names/types take priority)
        exSnap.docs.forEach(d => {
          const data = { ...d.data(), id: d.id }
          if (data.id && data.name) map[data.id] = data
        })

        // Seed user's exercises collection if empty
        if (exSnap.empty && Object.keys(map).length > 0) {
          const batch = writeBatch(db)
          Object.values(map).forEach(entry => batch.set(exerciseDoc(user.uid, entry.id), entry))
          await batch.commit()
        }

        setSavedExercises(Object.values(map))
        setRoutines(routineSnap.docs.map((d) => {
          const data = { id: d.id, ...d.data() }
          return {
            ...data,
            exercises: (data.exercises || []).map((exercise) => ({
              ...exercise,
              type: exercise.type || map[exercise.id]?.type || 'weight',
            })),
          }
        }))
        setLoading(false)
      })
      .catch((err) => { console.error('Muscles load error:', err); setLoading(false) })
  }, [user?.uid])

  async function handleDeleteExercise(exerciseId, exerciseName) {
    if (!window.confirm(`Delete "${exerciseName}" and all its sessions? This cannot be undone.`)) return
    try {
      const snap = await getDocs(query(sessionsCol(user.uid), where('exerciseId', '==', exerciseId)))
      const batch = writeBatch(db)
      snap.docs.forEach(d => batch.delete(d.ref))
      batch.delete(exerciseDoc(user.uid, exerciseId))
      await batch.commit()
      setSessions(prev => prev.filter(s => s.exerciseId !== exerciseId))
      setSavedExercises(prev => prev.filter(e => e.id !== exerciseId))
    } catch {
      alert('Could not delete exercise. Please try again.')
    }
  }

  async function handleEditExercise(exerciseId, newName, newType) {
    setSavingExercise(true)
    try {
      // 1. Fetch data needed for batch
      const [sessSnap, routinesSnap] = await Promise.all([
        getDocs(query(sessionsCol(user.uid), where('exerciseId', '==', exerciseId))),
        getDocs(routinesCol(user.uid)),
      ])

      // 2. Build and commit batch
      const batch = writeBatch(db)
      batch.set(exerciseDoc(user.uid, exerciseId), { name: newName, type: newType }, { merge: true })
      sessSnap.docs.forEach(d => batch.update(d.ref, { exerciseName: newName }))
      routinesSnap.docs.forEach(d => {
        const exArr = d.data().exercises || []
        if (exArr.some(e => e.id === exerciseId)) {
          batch.update(d.ref, { exercises: exArr.map(e => e.id === exerciseId ? { ...e, name: newName } : e) })
        }
      })
      await batch.commit()

      // 3. Update local state
      setSavedExercises(prev => prev.map(e => e.id === exerciseId ? { ...e, name: newName, type: newType } : e))
      setSessions(prev => prev.map(s => s.exerciseId === exerciseId ? { ...s, exerciseName: newName } : s))
      setEditingExercise(null)
    } catch (err) {
      console.error(err)
      alert('Could not update exercise. Please try again.')
    } finally {
      setSavingExercise(false)
    }
  }

  // ── Weekly set target computations (hooks must run unconditionally) ──
  const weekStartStr = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd')
  const weekEndStr   = format(endOfWeek(new Date(),   { weekStartsOn: 0 }), 'yyyy-MM-dd')
  const weekLabel    = `${format(new Date(weekStartStr + 'T12:00:00'), 'MMM d')} – ${format(new Date(weekEndStr + 'T12:00:00'), 'MMM d')}`

  const weeklySets = useMemo(() => {
    const ws = sessions.filter(s => s.date >= weekStartStr && s.date <= weekEndStr)
    return computeWeekSets(ws)
  }, [sessions, weekStartStr, weekEndStr])

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
    const savedMap = Object.fromEntries(savedExercises.map(e => [e.id, e]))
    const firestoreExercises = Object.values(byExercise)
      .sort((a, b) => b.sessions.length - a.sessions.length)
      .map(ex => ({ ...ex, type: savedMap[ex.exerciseId]?.type || 'weight' }))
    const extras = savedExercises
      .filter(e => e.muscleGroup?.toLowerCase() === groupId.toLowerCase() && !byExercise[e.id])
      .map(e => ({ exerciseId: e.id, exerciseName: e.name, sessions: [], type: e.type || 'weight' }))
    const exercises = [...firestoreExercises, ...extras]

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
              <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2">
                {meta?.icon && (
                  <img src={meta.icon} alt="" loading="lazy" decoding="async" className="w-8 h-8 object-contain flex-shrink-0" />
                )}
                {groupLabel}
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
                  type={ex.type}
                  muscleGroup={groupLabel}
                  onClick={() => navigate(`/workout/${ex.exerciseId}`, {
                    state: {
                      exercise: { id: ex.exerciseId, name: ex.exerciseName, muscleGroup: groupLabel, type: ex.type },
                      standaloneWorkout: true,
                      returnTo: `/muscles/${groupId.toLowerCase()}`,
                    },
                  })}
                  onDelete={() => handleDeleteExercise(ex.exerciseId, ex.exerciseName)}
                  onEdit={() => setEditingExercise({ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, type: ex.type })} />
              ))}
            </div>
          )}
        </div>

        {showAdd && meta && (
          <AddExerciseSheet group={meta} onClose={() => setShowAdd(false)}
            onAdd={async (exerciseName, exerciseType) => {
              const slug = toSlug(exerciseName)
              const entry = { id: slug, name: exerciseName, muscleGroup: meta.label, type: exerciseType, createdAt: serverTimestamp() }
              await setDoc(exerciseDoc(user.uid, slug), entry)
              setSavedExercises(prev => [...prev.filter(e => e.id !== slug), { ...entry, createdAt: null }])
              setShowAdd(false)
            }} />
        )}

        {editingExercise && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" style={{ paddingBottom: '30vh' }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setEditingExercise(null)} />
            <div className="relative w-full bg-surface rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
              <div>
                <h2 className="font-display text-lg font-bold text-text-primary">Edit Exercise</h2>
              </div>
              <div>
                <p className="text-text-secondary text-xs mb-2">Name</p>
                <input
                  type="text"
                  value={editingExercise.exerciseName}
                  onChange={e => setEditingExercise(prev => ({ ...prev, exerciseName: e.target.value }))}
                  className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <p className="text-text-secondary text-xs mb-2">Tracking type</p>
                <div className="flex gap-2">
                  {[{ value: 'weight', label: 'Lbs', sub: 'weight-based' }, { value: 'time', label: 'Min', sub: 'time-based' }].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setEditingExercise(prev => ({ ...prev, type: opt.value }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                        editingExercise.type === opt.value
                          ? 'bg-accent border-accent text-white'
                          : 'bg-surface2 border-surface2 text-text-secondary'
                      }`}>
                      {opt.label}
                      <span className="block text-xs font-normal opacity-70">{opt.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditingExercise(null)} disabled={savingExercise} className="btn-secondary flex-1 disabled:opacity-40">Cancel</button>
                <button
                  onClick={() => handleEditExercise(editingExercise.exerciseId, editingExercise.exerciseName.trim(), editingExercise.type)}
                  disabled={!editingExercise.exerciseName.trim() || savingExercise}
                  className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {savingExercise && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  )}
                  {savingExercise ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </PageWrapper>
    )
  }

  // ── Main view: Weekly Set Targets ─────────────────────────
  const totalActual = pplConfig.reduce((s, g) =>
    s + g.muscles.reduce((ms, m) => ms + (weeklySets[g.id]?.[m.id] || 0), 0), 0)
  const weekEndDate = new Date(`${weekEndStr}T12:00:00`)
  const daysLeft = Math.max(differenceInDays(weekEndDate, new Date()) + 1, 1)
  const overallPct = clampPct(totalActual / totalTarget)
  const groupProgress = pplConfig.map(group => {
    const actual = getGroupActualSets(group, weeklySets)
    const pct = clampPct(actual / group.targetTotal)
    return {
      ...group,
      actual,
      pct,
      toGo: Math.max(group.targetTotal - actual, 0),
    }
  })
  const lowestGroup = [...groupProgress].sort((a, b) => a.pct - b.pct || b.toGo - a.toGo)[0]
  const expectedPct = clampPct((7 - daysLeft) / 7)
  const paceLabel = overallPct >= expectedPct + 0.08
    ? 'Ahead of pace'
    : overallPct >= expectedPct - 0.08
      ? 'On Track'
      : 'Slightly Behind'
  const paceTone = overallPct >= expectedPct - 0.08 ? 'text-[#62E38D]' : 'text-[#F2C14E]'
  const lowestWorkoutCount = lowestGroup?.toGo > 0 ? Math.max(Math.ceil(lowestGroup.toGo / 7), 1) : 0
  const focusInsight = lowestWorkoutCount > 0
    ? `You need ${lowestWorkoutCount} more ${lowestGroup.id} workout${lowestWorkoutCount === 1 ? '' : 's'} this week`
    : 'All weekly muscle targets are on pace'
  const routineInProgress = activeWorkout?.kind === 'routine' && !activeWorkout.summaryReady ? activeWorkout : null
  const routineSessionStats = useMemo(() => {
    const byRoutine = {}
    sessions.forEach((session) => {
      const routineId = session.routineId
      if (!routineId || !session.date) return
      if (!byRoutine[routineId] || byRoutine[routineId] < session.date) {
        byRoutine[routineId] = session.date
      }
    })
    return byRoutine
  }, [sessions])
  const recommendedRoutine = useMemo(() => {
    if (routineInProgress?.routine?.id) {
      return routines.find((routine) => routine.id === routineInProgress.routine.id) || {
        id: routineInProgress.routine.id,
        name: routineInProgress.routine.name,
        exercises: routineInProgress.exercises || [],
      }
    }
    if (!lowestGroup) return null

    const candidates = routines
      .map((routine) => {
        const matchCount = (routine.exercises || []).reduce((count, exercise) => {
          const category = getMuscleCategory(exercise.muscleGroup, exercise.name)
          return count + (category?.groupId === lowestGroup.id ? 1 : 0)
        }, 0)
        return {
          routine,
          matchCount,
          lastDate: routineSessionStats[routine.id] || '',
        }
      })
      .filter((entry) => entry.matchCount > 0)
      .sort((a, b) => {
        if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount
        if (a.lastDate !== b.lastDate) {
          if (!a.lastDate) return -1
          if (!b.lastDate) return 1
          return a.lastDate.localeCompare(b.lastDate)
        }
        return formatRoutineName(a.routine.name).localeCompare(formatRoutineName(b.routine.name))
      })

    return candidates[0]?.routine || null
  }, [lowestGroup, routineInProgress, routineSessionStats, routines])
  const recommendedActionLabel = routineInProgress
    ? 'Resume Workout'
    : lowestGroup?.id === 'legs'
      ? 'Start Leg Workout'
      : lowestGroup?.id === 'pull'
        ? 'Start Pull Workout'
        : lowestGroup?.id === 'push'
          ? 'Start Push Workout'
          : 'Start Recommended Workout'

  function launchRecommendedWorkout() {
    if (routineInProgress?.routine?.id) {
      const routine = recommendedRoutine
      const exercises = routine?.exercises || routineInProgress.exercises || []
      const startExerciseId = routineInProgress.currentExerciseId || exercises[0]?.id
      if (!startExerciseId) return
      navigate(`/workout/${startExerciseId}`, {
        state: {
          workoutMode: true,
          routine: routine || {
            id: routineInProgress.routine.id,
            name: routineInProgress.routine.name,
            exercises,
          },
        },
      })
      return
    }

    if (!recommendedRoutine?.id || !(recommendedRoutine.exercises || []).length) return
    const startExerciseId = recommendedRoutine.exercises[0].id
    startRoutineWorkout(recommendedRoutine, { startExerciseId })
    navigate(`/workout/${startExerciseId}`, {
      state: {
        workoutMode: true,
        routine: recommendedRoutine,
      },
    })
  }
  return (
    <PageWrapper showHeader>
      <div className="px-4 pt-2 space-y-4 pb-6">

        {/* Header */}
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Weekly Set Targets</h1>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap text-sm">
            <p className="text-text-secondary">{weekLabel}</p>
            <span className="text-text-secondary/50">•</span>
            <p className="text-[#62E38D] font-semibold">{daysLeft} day{daysLeft === 1 ? '' : 's'} left</p>
          </div>
          <p className="mt-2 text-sm font-medium text-[#62E38D]">{focusInsight}</p>
          {(routineInProgress || recommendedRoutine) && (
            <button
              onClick={launchRecommendedWorkout}
              className="mt-2 inline-flex items-center gap-2 text-accent font-semibold text-sm active:scale-95 transition-transform"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-1.427 1.529-2.33 2.779-1.643l9.42 5.173c1.295.711 1.295 2.575 0 3.286l-9.42 5.173c-1.25.687-2.779-.216-2.779-1.643V5.653z" />
              </svg>
              <span>{recommendedActionLabel}</span>
            </button>
          )}
        </div>

        {/* Weekly target hero */}
        {!loading && (
          <RecoveryHero
            groups={pplConfig}
            sets={weeklySets}
            totalActual={totalActual}
            totalTarget={totalTarget}
            paceLabel={paceLabel}
            paceTone={paceTone}
          />
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex flex-col items-center py-4 gap-4">
            <div className="w-[230px] h-[330px] rounded-[36px] animate-pulse bg-surface2" />
            <div className="w-[250px] h-[150px] rounded-[32px] animate-pulse bg-surface2" />
          </div>
        )}

        {/* Group rows */}
        <div className="space-y-2">
          {pplConfig.map(group => (
            <GroupRow
              key={group.id}
              group={group}
              sets={weeklySets}
              expanded={expandedId === group.id}
              isLowest={lowestGroup?.id === group.id && lowestGroup?.toGo > 0}
              onToggle={() => setExpandedId(prev => prev === group.id ? null : group.id)}
            />
          ))}
        </div>

        {/* Browse exercises by muscle group */}
        <div>
          <p className="section-title">Browse or Add New Exercises</p>
          <div className="grid grid-cols-2 gap-3">
            {GROUPS_META.map(g => {
              const gSessions = sessions.filter(s => s.muscleGroup?.toLowerCase() === g.id.toLowerCase())
              const uniqueExercises = new Set(gSessions.map(s => s.exerciseId)).size
              const lastDate = gSessions.map(s => s.date).sort().at(-1)
              const days = lastDate ? daysAgo(lastDate) : null
              return (
                <Link
                  key={g.id}
                  to={`/muscles/${g.id.toLowerCase()}`}
                  className="rounded-2xl border border-surface2 bg-surface p-4 relative overflow-hidden flex flex-col justify-end active:scale-95 transition-transform"
                  style={{ minHeight: '130px' }}
                >
                  <img src={g.icon} alt="" loading="lazy" decoding="async" className="absolute right-2 top-2 w-24 h-24 object-contain opacity-90 pointer-events-none" />
                  <div className="relative z-10 text-left">
                    <p className="text-base font-bold text-white leading-tight">{g.label}</p>
                    <p className="text-text-secondary text-xs mt-0.5">
                      {uniqueExercises > 0
                        ? `${uniqueExercises} exercise${uniqueExercises !== 1 ? 's' : ''}${days !== null ? ` · ${lastDoneLabel(days)}` : ''}`
                        : 'No exercises yet'}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

      </div>
    </PageWrapper>
  )
}
