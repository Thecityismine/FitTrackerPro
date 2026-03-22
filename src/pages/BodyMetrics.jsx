// src/pages/BodyMetrics.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { format, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import PageWrapper from '../components/layout/PageWrapper'
import { useAuth } from '../context/AuthContext'
import { bodyMetricsCol, sessionsCol } from '../firebase/collections'
import { analyzeImageWithAi, generateAiText } from '../utils/aiClient'

const TODAY = format(new Date(), 'yyyy-MM-dd')

// ── Helpers ────────────────────────────────────────────────
function calcBMI(weightLbs, heightInches) {
  if (!weightLbs || !heightInches) return null
  return parseFloat(((weightLbs * 703) / (heightInches ** 2)).toFixed(1))
}

function bmiLabel(bmi) {
  if (!bmi) return ''
  if (bmi < 18.5) return 'Underweight'
  if (bmi < 25) return 'Normal'
  if (bmi < 30) return 'Overweight'
  return 'Obese'
}

const STRENGTH_GROUPS = [
  { id: 'push', label: 'Push', muscles: ['Chest', 'Shoulders', 'Triceps'] },
  { id: 'pull', label: 'Pull', muscles: ['Back', 'Biceps'] },
  { id: 'legs', label: 'Legs', muscles: ['Legs'] },
]

const PRIMARY_STRENGTH_MUSCLES = new Set(STRENGTH_GROUPS.flatMap((group) => group.muscles))

function normalizeMuscleGroup(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return ''
  if (normalized.includes('chest')) return 'Chest'
  if (normalized.includes('shoulder')) return 'Shoulders'
  if (normalized.includes('tricep')) return 'Triceps'
  if (normalized.includes('back')) return 'Back'
  if (normalized.includes('bicep')) return 'Biceps'
  if (normalized.includes('leg')) return 'Legs'
  return ''
}

function getDaysSince(dateString) {
  if (!dateString) return 999
  const timestamp = new Date(`${dateString}T12:00:00`).getTime()
  if (!Number.isFinite(timestamp)) return 999
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86400000))
}

function recencyFactor(daysSince) {
  if (daysSince <= 14) return 1
  if (daysSince <= 30) return 0.96
  if (daysSince <= 60) return 0.9
  if (daysSince <= 90) return 0.82
  return 0.72
}

function average(values = []) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function estimateExerciseStrength(sets = []) {
  let weightedBest = 0
  let bodyweightBest = 0
  let validSetCount = 0

  sets.forEach((set) => {
    const reps = Number(set?.reps) || 0
    const weight = Number(set?.weight) || 0
    if (reps <= 0 && weight <= 0) return
    validSetCount += 1

    if (weight > 0) {
      // Epley-style estimate capped to keep high-rep sets from exploding the score.
      weightedBest = Math.max(weightedBest, weight * (1 + Math.min(reps, 12) / 30))
    } else if (reps > 0) {
      bodyweightBest = Math.max(bodyweightBest, reps)
    }
  })

  if (weightedBest > 0) {
    return { mode: 'weighted', raw: weightedBest, setCount: validSetCount }
  }
  if (bodyweightBest > 0) {
    return { mode: 'bodyweight', raw: bodyweightBest, setCount: validSetCount }
  }
  return null
}

function calculateStrengthData(sessions = [], bodyWeight) {
  const exerciseMap = new Map()
  const scaleWeight = Math.max(Number(bodyWeight) || 0, 90)

  sessions.forEach((session) => {
    if (session?.type === 'time') return
    const muscleGroup = normalizeMuscleGroup(session?.muscleGroup)
    if (!PRIMARY_STRENGTH_MUSCLES.has(muscleGroup)) return

    const estimated = estimateExerciseStrength(session?.sets || [])
    if (!estimated) return

    const key = session.exerciseId || `${muscleGroup}:${session.exerciseName || session.id}`
    const current = exerciseMap.get(key) || {
      id: key,
      exerciseName: session.exerciseName || 'Exercise',
      muscleGroup,
      mode: estimated.mode,
      bestRaw: 0,
      setCount: 0,
      lastDate: session.date || TODAY,
    }

    current.mode = estimated.mode === 'weighted' || current.mode !== 'weighted'
      ? estimated.mode
      : current.mode
    current.bestRaw = Math.max(current.bestRaw, estimated.raw)
    current.setCount += estimated.setCount
    if (session.date && session.date > current.lastDate) current.lastDate = session.date
    exerciseMap.set(key, current)
  })

  const muscleMap = new Map(
    [...PRIMARY_STRENGTH_MUSCLES].map((muscle) => [muscle, {
      muscle,
      setCount: 0,
      exerciseScores: [],
      freshness: [],
    }])
  )

  exerciseMap.forEach((exercise) => {
    const recency = recencyFactor(getDaysSince(exercise.lastDate))
    const relativeStrength = exercise.mode === 'weighted'
      ? (exercise.bestRaw / scaleWeight)
      : (exercise.bestRaw / 20)
    const score = Math.max(1, Math.min(100, Math.round(100 * (1 - Math.exp(-(relativeStrength * recency))))))

    const muscle = muscleMap.get(exercise.muscleGroup)
    if (!muscle) return
    muscle.setCount += exercise.setCount
    muscle.exerciseScores.push(score)
    muscle.freshness.push(recency)
  })

  const muscleScores = Object.fromEntries(
    [...muscleMap.entries()].map(([muscle, data]) => {
      const topScores = [...data.exerciseScores].sort((a, b) => b - a).slice(0, 3)
      const score = data.setCount >= 6 && topScores.length
        ? Math.round(average(topScores))
        : null
      return [muscle, { ...data, score, unlocked: score != null }]
    })
  )

  const groupScores = STRENGTH_GROUPS.map((group) => {
    const missingMuscles = group.muscles.filter((muscle) => !muscleScores[muscle]?.unlocked)
    const score = missingMuscles.length === 0
      ? Math.round(average(group.muscles.map((muscle) => muscleScores[muscle].score)))
      : null
    return {
      ...group,
      score,
      unlocked: score != null,
      missingMuscles,
    }
  })

  const overallUnlocked = groupScores.every((group) => group.unlocked)
  const overallScore = overallUnlocked
    ? Math.round(average(groupScores.map((group) => group.score)))
    : null

  return {
    overallUnlocked,
    overallScore,
    groupScores,
    muscleScores,
    missingMuscles: groupScores.flatMap((group) => group.missingMuscles),
    scaleWeight,
    exerciseCount: exerciseMap.size,
  }
}

function getWeightInsight(entries = []) {
  const weightedEntries = [...entries]
    .filter((entry) => entry?.weight != null && entry?.date)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (weightedEntries.length < 2) {
    return {
      headline: 'Log a few weigh-ins to unlock trends',
      subline: 'Your weekly insight gets smarter after a couple of entries.',
    }
  }

  const latest = weightedEntries[weightedEntries.length - 1]
  const baseline = [...weightedEntries]
    .reverse()
    .find((entry) => getDaysSince(entry.date) >= 7) || weightedEntries[weightedEntries.length - 2]

  const change = parseFloat((latest.weight - baseline.weight).toFixed(1))
  if (Math.abs(change) < 0.3) {
    return {
      headline: 'Stable this week',
      subline: 'Your weight is holding steady over the last 7 days.',
      change,
    }
  }

  const direction = change > 0 ? 'Up' : 'Down'
  return {
    headline: `${direction} ${Math.abs(change).toFixed(1)} lb this week`,
    subline: change > 0
      ? 'Good if you are pushing muscle gain. Keep an eye on body fat and strength together.'
      : 'A steady drop can be useful if fat loss is the goal. Protect muscle mass as you cut.',
    change,
  }
}

function getStrengthTier(score) {
  if (score == null) return { label: 'Building', detail: 'Keep logging your key lifts.' }
  if (score >= 85) return { label: 'Advanced', detail: 'You have strong coverage across all major patterns.' }
  if (score >= 70) return { label: 'Strong', detail: 'You are above average across your main lifts.' }
  if (score >= 55) return { label: 'Above Average', detail: 'Your base is solid. Keep building consistency.' }
  if (score >= 40) return { label: 'Foundation', detail: 'You are building a base. More quality sets will lift this fast.' }
  return { label: 'Early Stage', detail: 'Log more quality training to stabilize the score.' }
}

function calculateStrengthTrend(sessions = [], bodyWeight) {
  const now = new Date()
  const recentStart = format(subDays(now, 14), 'yyyy-MM-dd')
  const previousStart = format(subDays(now, 28), 'yyyy-MM-dd')
  const previousEnd = format(subDays(now, 15), 'yyyy-MM-dd')

  const recentSessions = sessions.filter((session) => session?.date >= recentStart)
  const previousSessions = sessions.filter((session) => session?.date >= previousStart && session?.date <= previousEnd)

  const recentScore = calculateStrengthData(recentSessions, bodyWeight).overallScore
  const previousScore = calculateStrengthData(previousSessions, bodyWeight).overallScore

  if (recentScore == null || previousScore == null) return null
  return recentScore - previousScore
}

function getStrengthGroupRecommendation(group) {
  if (!group) return null
  if (!group.unlocked) {
    return {
      label: 'Needs attention',
      message: `Log more ${group.label.toLowerCase()} sets to activate this score.`,
    }
  }
  if (group.score >= 75) {
    return {
      label: 'Ready to train',
      message: `${group.label} is a strength asset right now. Push progressive overload this week.`,
    }
  }
  if (group.score >= 60) {
    return {
      label: 'Build this up',
      message: `${group.label} is trending well. Add one hard top set or a small load increase this week.`,
    }
  }
  return {
    label: 'Needs attention',
    message: `${group.label} is lagging. Give it focused volume before the week ends.`,
  }
}

function getBodyFocus(latest, previous, strengthData) {
  const muscleDelta = latest?.muscleMassLbs != null && previous?.muscleMassLbs != null
    ? latest.muscleMassLbs - previous.muscleMassLbs
    : null
  const bodyFatDelta = latest?.bodyFat != null && previous?.bodyFat != null
    ? latest.bodyFat - previous.bodyFat
    : null

  if (latest?.bodyFat != null && latest.bodyFat >= 20) return 'Focus: Reduce Body Fat'
  if (muscleDelta != null && muscleDelta > 0 && (bodyFatDelta == null || bodyFatDelta <= 0)) return 'Focus: Build Muscle'
  if (strengthData?.overallScore != null && strengthData.overallScore < 70) return 'Focus: Build Strength'
  return 'Focus: Maintain Momentum'
}

function WeightHistoryDot({ cx, cy, isLatest }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
  return (
    <g>
      {isLatest && <circle cx={cx} cy={cy} r={8} fill="#1A56DB" fillOpacity={0.16} />}
      <circle cx={cx} cy={cy} r={isLatest ? 4.5 : 3} fill="#2563EB" stroke={isLatest ? '#93C5FD' : 'none'} strokeWidth={isLatest ? 1.5 : 0} />
    </g>
  )
}

// Compress image base64 using canvas
function compressImage(file, maxPx = 900, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = url
  })
}

// ── Trend Arrow ────────────────────────────────────────────
function TrendArrow({ delta, lowerIsBetter = false }) {
  if (delta == null || delta === 0) return null
  const up = delta > 0
  const good = lowerIsBetter ? !up : up
  return (
    <span className={`text-xs font-bold flex items-center gap-0.5 ${good ? 'text-accent-green' : 'text-accent-red'}`}>
      <svg className={`w-3 h-3 ${up ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
      {Math.abs(delta).toFixed(1)}
    </span>
  )
}

// ── Metric Card ────────────────────────────────────────────
function MetricCard({ label, value, unit, delta, lowerIsBetter, note, valueColor }) {
  const color = value != null ? (valueColor || 'text-white') : 'text-surface2'
  return (
    <div className="bg-surface2 rounded-2xl p-3">
      <p className="text-text-secondary text-xs leading-tight mb-1.5">{label}</p>
      <div className="flex items-baseline gap-1 flex-wrap">
        <span className={`font-display text-xl font-bold ${color}`}>
          {value != null ? value : '—'}
        </span>
        {unit && value != null && <span className="text-text-secondary text-xs">{unit}</span>}
        {delta != null && value != null && <TrendArrow delta={delta} lowerIsBetter={lowerIsBetter} />}
      </div>
      {note && value != null && <p className="text-text-secondary text-xs mt-0.5">{note}</p>}
    </div>
  )
}

// ── Log Metrics Dialog ─────────────────────────────────────
function LogSheet({ onClose, onSave, lastEntry, prefillData }) {
  const photoInputRef = useRef(null)
  const [form, setForm] = useState({
    weight:            prefillData?.weight            ?? lastEntry?.weight            ?? '',
    bodyFat:           prefillData?.bodyFat           ?? lastEntry?.bodyFat           ?? '',
    muscleMassLbs:     prefillData?.muscleMassLbs     ?? lastEntry?.muscleMassLbs     ?? '',
    skeletalMuscle:    prefillData?.skeletalMuscle    ?? lastEntry?.skeletalMuscle    ?? '',
    visceralFat:       prefillData?.visceralFat       ?? lastEntry?.visceralFat       ?? '',
    bodyWater:         prefillData?.bodyWater         ?? lastEntry?.bodyWater         ?? '',
    subcutaneousFat:   prefillData?.subcutaneousFat   ?? lastEntry?.subcutaneousFat   ?? '',
    boneMass:          prefillData?.boneMass          ?? lastEntry?.boneMass          ?? '',
    fatFreeBodyWeight: prefillData?.fatFreeBodyWeight ?? lastEntry?.fatFreeBodyWeight ?? '',
    bmr:               prefillData?.bmr               ?? lastEntry?.bmr               ?? '',
    protein:           prefillData?.protein           ?? lastEntry?.protein           ?? '',
    metabolicAge:      prefillData?.metabolicAge      ?? lastEntry?.metabolicAge      ?? '',
    bmi:               prefillData?.bmi               ?? '',
    heightFt: lastEntry?.heightInches ? Math.floor(lastEntry.heightInches / 12) : '',
    heightIn: lastEntry?.heightInches ? lastEntry.heightInches % 12 : '',
  })
  const [photo, setPhoto] = useState(null)
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [photoError, setPhotoError] = useState(null)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError(null)
    setProcessingPhoto(true)
    try { setPhoto(await compressImage(file)) }
    catch {
      setPhotoError('That photo could not be processed. Try a smaller image.')
    }
    finally { setProcessingPhoto(false) }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    await onSave({ ...form, photoBase64: photo })
    setSaving(false)
  }

  const isAutoFilled = !!prefillData

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[54]" onClick={onClose} />
      <div className="fixed inset-0 z-[55] flex items-center justify-center px-4">
        <form
          onSubmit={handleSave}
          className="bg-surface rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
          style={{ maxHeight: '85dvh' }}
        >
          {/* Title + close */}
          <div className="flex items-center justify-between px-4 pt-5 pb-3 flex-shrink-0">
            <div>
              <h2 className="font-display text-lg font-bold text-text-primary">Log Today's Metrics</h2>
              {isAutoFilled && (
                <p className="text-accent-green text-xs mt-0.5 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Auto-filled from scan — review &amp; save
                </p>
              )}
            </div>
            <button type="button" onClick={onClose}
              className="w-8 h-8 rounded-full bg-surface2 flex items-center justify-center text-text-secondary active:scale-95 transition-transform flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable fields */}
          <div className="overflow-y-auto px-4 space-y-3 flex-1 pb-2">

            {/* Weight */}
            <div>
              <label className="text-text-secondary text-xs font-semibold block mb-1">WEIGHT (lb)</label>
              <input type="number" inputMode="decimal" placeholder="185"
                value={form.weight} onChange={e => set('weight', e.target.value)}
                className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>

            {/* Height — only if not previously entered */}
            {!lastEntry?.heightInches && (
              <div>
                <label className="text-text-secondary text-xs font-semibold block mb-1">HEIGHT (for BMI)</label>
                <div className="flex gap-2">
                  <input type="number" inputMode="numeric" placeholder="5 ft"
                    value={form.heightFt} onChange={e => set('heightFt', e.target.value)}
                    className="flex-1 bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
                  <input type="number" inputMode="numeric" placeholder="10 in"
                    value={form.heightIn} onChange={e => set('heightIn', e.target.value)}
                    className="flex-1 bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
              </div>
            )}

            {/* Body Fat / Muscle Mass lbs */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-text-secondary text-xs font-semibold block mb-1">BODY FAT (%)</label>
                <input type="number" inputMode="decimal" placeholder="17.5"
                  value={form.bodyFat} onChange={e => set('bodyFat', e.target.value)}
                  className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <div>
                <label className="text-text-secondary text-xs font-semibold block mb-1">MUSCLE MASS (lb)</label>
                <input type="number" inputMode="decimal" placeholder="113.3"
                  value={form.muscleMassLbs} onChange={e => set('muscleMassLbs', e.target.value)}
                  className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            </div>

            {/* Visceral Fat / Body Water */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-text-secondary text-xs font-semibold block mb-1">VISCERAL FAT</label>
                <input type="number" inputMode="numeric" placeholder="6"
                  value={form.visceralFat} onChange={e => set('visceralFat', e.target.value)}
                  className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <div>
                <label className="text-text-secondary text-xs font-semibold block mb-1">BODY WATER (%)</label>
                <input type="number" inputMode="decimal" placeholder="59.5"
                  value={form.bodyWater} onChange={e => set('bodyWater', e.target.value)}
                  className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            </div>

            {/* Skeletal Muscle / Subcutaneous Fat */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-text-secondary text-xs font-semibold block mb-1">SKELETAL MUSCLE (%)</label>
                <input type="number" inputMode="decimal" placeholder="53.2"
                  value={form.skeletalMuscle} onChange={e => set('skeletalMuscle', e.target.value)}
                  className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <div>
                <label className="text-text-secondary text-xs font-semibold block mb-1">SUBCUT. FAT (%)</label>
                <input type="number" inputMode="decimal" placeholder="15.5"
                  value={form.subcutaneousFat} onChange={e => set('subcutaneousFat', e.target.value)}
                  className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            </div>

            {/* Bone Mass / Fat-Free Body Weight */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-text-secondary text-xs font-semibold block mb-1">BONE MASS (lb)</label>
                <input type="number" inputMode="decimal" placeholder="6.0"
                  value={form.boneMass} onChange={e => set('boneMass', e.target.value)}
                  className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <div>
                <label className="text-text-secondary text-xs font-semibold block mb-1">FAT-FREE WT (lb)</label>
                <input type="number" inputMode="decimal" placeholder="119.4"
                  value={form.fatFreeBodyWeight} onChange={e => set('fatFreeBodyWeight', e.target.value)}
                  className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            </div>

            {/* BMR / Protein */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-text-secondary text-xs font-semibold block mb-1">BMR (kcal)</label>
                <input type="number" inputMode="numeric" placeholder="1483"
                  value={form.bmr} onChange={e => set('bmr', e.target.value)}
                  className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <div>
                <label className="text-text-secondary text-xs font-semibold block mb-1">PROTEIN (%)</label>
                <input type="number" inputMode="decimal" placeholder="18.8"
                  value={form.protein} onChange={e => set('protein', e.target.value)}
                  className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            </div>

            {/* Metabolic Age */}
            <div>
              <label className="text-text-secondary text-xs font-semibold block mb-1">METABOLIC AGE (yr)</label>
              <input type="number" inputMode="numeric" placeholder="46"
                value={form.metabolicAge} onChange={e => set('metabolicAge', e.target.value)}
                className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>

            {/* Progress photo */}
            <div>
              <label className="text-text-secondary text-xs font-semibold block mb-1">PROGRESS PHOTO (optional)</label>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              {photo ? (
                <div className="relative">
                  <img src={photo} alt="Preview" loading="lazy" decoding="async" className="w-full h-36 object-cover rounded-xl" />
                  <button type="button" onClick={() => setPhoto(null)}
                    className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white text-xs">✕</button>
                </div>
              ) : (
                <button type="button" onClick={() => photoInputRef.current?.click()}
                  className="w-full bg-surface2 rounded-xl px-4 py-3 text-text-secondary text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform">
                  {processingPhoto ? <span>Processing…</span> : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Add Progress Photo
                    </>
                  )}
                </button>
              )}
              {photoError && (
                <p className="mt-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-accent-red">
                  {photoError}
                </p>
              )}
            </div>
          </div>

          {/* Save button — always visible */}
          <div className="px-4 pt-3 pb-4 flex-shrink-0 border-t border-surface2">
            <button type="submit" disabled={saving} className="btn-primary w-full disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Metrics'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ── Progress Photo Card ────────────────────────────────────
function ProgressPhotoCard({ entries }) {
  const [expanded, setExpanded] = useState(null) // null | { src, label }

  const now = new Date()
  const thisMonthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const lastMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd')
  const lastMonthEnd   = format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd')

  const thisMonthPhoto = entries.find(e => e.date >= thisMonthStart && e.photoBase64)?.photoBase64
  const lastMonthPhoto = entries.find(e => e.date >= lastMonthStart && e.date <= lastMonthEnd && e.photoBase64)?.photoBase64

  if (!thisMonthPhoto && !lastMonthPhoto) return null

  return (
    <>
      <div className="card">
        <p className="section-title mb-3">Progress Photos</p>
        <div className="grid grid-cols-2 gap-2">
          {/* Last Month — LEFT */}
          <div>
            <p className="text-text-secondary text-xs font-semibold mb-1 text-center">Last Month</p>
            {lastMonthPhoto ? (
              <button onClick={() => setExpanded({ src: lastMonthPhoto, label: 'Last Month' })}
                className="w-full active:scale-95 transition-transform">
                <img src={lastMonthPhoto} alt="Last month" loading="lazy" decoding="async" className="w-full h-40 object-cover rounded-xl" />
              </button>
            ) : (
              <div className="w-full h-40 bg-surface2 rounded-xl flex flex-col items-center justify-center px-3">
                <p className="text-text-primary text-sm font-semibold text-center">Add Last Month Photo</p>
                <p className="text-text-secondary text-xs text-center mt-1">Log one monthly check-in to unlock side-by-side comparison.</p>
              </div>
            )}
          </div>
          {/* This Month — RIGHT */}
          <div>
            <p className="text-text-secondary text-xs font-semibold mb-1 text-center">This Month</p>
            {thisMonthPhoto ? (
              <button onClick={() => setExpanded({ src: thisMonthPhoto, label: 'This Month' })}
                className="w-full active:scale-95 transition-transform">
                <img src={thisMonthPhoto} alt="This month" loading="lazy" decoding="async" className="w-full h-40 object-cover rounded-xl" />
              </button>
            ) : (
              <div className="w-full h-40 bg-surface2 rounded-xl flex flex-col items-center justify-center px-3">
                <p className="text-text-primary text-sm font-semibold text-center">Add This Month Photo</p>
                <p className="text-text-secondary text-xs text-center mt-1">Save a body metric entry with a photo to keep your visual timeline current.</p>
              </div>
            )}
          </div>
        </div>
        <p className="text-text-secondary text-xs text-center mt-2">Tap a photo to expand</p>
      </div>

      {/* Lightbox */}
      {expanded && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center"
          onClick={() => setExpanded(null)}
        >
          <div className="flex items-center justify-between w-full px-4 pb-3 flex-shrink-0"
            onClick={e => e.stopPropagation()}>
            <p className="text-white font-semibold">{expanded.label}</p>
            <button onClick={() => setExpanded(null)}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <img
            src={expanded.src}
            alt={expanded.label}
            loading="lazy"
            decoding="async"
            className="max-w-full max-h-[80dvh] object-contain rounded-2xl px-4"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

function StrengthScoreCard({ sessions, bodyWeight }) {
  const strengthData = useMemo(
    () => calculateStrengthData(sessions, bodyWeight),
    [bodyWeight, sessions]
  )
  const [selectedGroupId, setSelectedGroupId] = useState('push')
  const strengthTrend = useMemo(
    () => calculateStrengthTrend(sessions, bodyWeight),
    [bodyWeight, sessions]
  )

  const hasLoggedStrengthData = strengthData.exerciseCount > 0
  const missingLabel = [...new Set(strengthData.missingMuscles)].join(', ')
  const overallTier = getStrengthTier(strengthData.overallScore)
  const selectedGroup = strengthData.groupScores.find((group) => group.id === selectedGroupId) || strengthData.groupScores[0]
  const selectedRecommendation = getStrengthGroupRecommendation(selectedGroup)

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="section-title mb-0">Strength Score</p>
          <p className="text-text-secondary text-xs mt-0.5">
            Estimated from your best logged sets, muscle coverage, and recent activity.
          </p>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h9m-9 9h9M6 10.5h12a1.5 1.5 0 011.5 1.5v0A1.5 1.5 0 0118 13.5H6A1.5 1.5 0 014.5 12v0A1.5 1.5 0 016 10.5zM9 7.5v-1.5A1.5 1.5 0 0110.5 4.5h3A1.5 1.5 0 0115 6v1.5m-6 9V18A1.5 1.5 0 0010.5 19.5h3A1.5 1.5 0 0015 18v-1.5" />
          </svg>
        </div>
      </div>

      <div className="rounded-2xl border border-surface2 bg-surface2/60 p-4">
        {strengthData.overallUnlocked ? (
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-text-secondary text-xs uppercase tracking-[0.22em]">Overall</p>
              <p className="font-display text-4xl font-bold text-text-primary mt-1">
                {strengthData.overallScore}
              </p>
              <p className="text-accent-green text-sm font-semibold mt-1">{overallTier.label}</p>
              <p className="text-text-secondary text-xs mt-1">{overallTier.detail}</p>
            </div>
            <div className="text-right">
              <p className="text-accent-green text-xs font-semibold">Fully Activated</p>
              <p className="text-text-secondary text-xs mt-1">All muscle groups active</p>
              <p className="text-text-secondary text-xs mt-1">Scaled to {Math.round(strengthData.scaleWeight)} lb bodyweight</p>
              {strengthTrend != null && (
                <p className={`text-xs font-semibold mt-2 ${strengthTrend >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {strengthTrend >= 0 ? '+' : ''}{strengthTrend} this month
                </p>
              )}
            </div>
          </div>
        ) : hasLoggedStrengthData ? (
          <div>
            <p className="text-text-primary font-display text-2xl font-bold">Hit every muscle to unlock this score</p>
            <p className="text-text-secondary text-sm mt-2">
              Log at least 6 quality sets for each primary muscle across Push, Pull, and Legs.
            </p>
            {missingLabel && (
              <p className="text-accent text-sm mt-2">
                Missing coverage: {missingLabel}
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-text-primary font-display text-2xl font-bold">No strength score yet</p>
            <p className="text-text-secondary text-sm mt-2">
              Log weighted sets across Push, Pull, and Legs to unlock your strength score and reveal where to focus next.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {strengthData.groupScores.map((group) => (
          <button
            type="button"
            key={group.id}
            onClick={() => setSelectedGroupId(group.id)}
            className={`bg-surface2 rounded-2xl p-3 text-left transition-colors active:scale-[0.98] ${selectedGroupId === group.id ? 'ring-1 ring-accent/40 bg-accent/5' : ''}`}
          >
            <p className="text-text-secondary text-xs uppercase tracking-[0.18em]">{group.label}</p>
            <p className={`font-display text-2xl font-bold mt-1 ${group.unlocked ? 'text-text-primary' : 'text-surface2'}`}>
              {group.unlocked ? group.score : '—'}
            </p>
            <p className="text-text-secondary text-[11px] mt-1">
              {getStrengthGroupRecommendation(group)?.label || 'Ready'}
            </p>
          </button>
        ))}
      </div>
      {selectedRecommendation && (
        <div className="mt-3 rounded-2xl border border-surface2 bg-surface2/50 p-3">
          <p className="text-text-primary text-sm font-semibold">{selectedGroup.label} {selectedRecommendation.label}</p>
          <p className="text-text-secondary text-xs mt-1">{selectedRecommendation.message}</p>
        </div>
      )}
    </div>
  )
}

// ── AI Monthly Report Card ─────────────────────────────────
function AiReportCard({ entries, sessions }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const thirtyDaysAgo = format(subMonths(new Date(), 1), 'yyyy-MM-dd')
  const recentSessions = useMemo(
    () => sessions.filter((session) => session.date >= thirtyDaysAgo),
    [sessions, thirtyDaysAgo]
  )
  const previousWindowStart = format(subMonths(new Date(), 2), 'yyyy-MM-dd')
  const previousSessions = useMemo(
    () => sessions.filter((session) => session.date >= previousWindowStart && session.date < thirtyDaysAgo),
    [previousWindowStart, sessions, thirtyDaysAgo]
  )
  const recentVolume = recentSessions.reduce((sum, session) => sum + (session.totalVolume || 0), 0)
  const previousVolume = previousSessions.reduce((sum, session) => sum + (session.totalVolume || 0), 0)
  const volumeDeltaPercent = previousVolume > 0
    ? Math.round(((recentVolume - previousVolume) / previousVolume) * 100)
    : null
  const previewText = volumeDeltaPercent == null
    ? `${[...new Set(recentSessions.map((session) => session.date))].length} workout days this month`
    : `${volumeDeltaPercent >= 0 ? '+' : ''}${volumeDeltaPercent}% volume vs last month`

  async function generateReport() {
    setLoading(true)
    setError(null)

    const totalVolume = recentSessions.reduce((sum, s) => sum + (s.totalVolume || 0), 0)
    const muscleGroups = [...new Set(recentSessions.map(s => s.muscleGroup).filter(Boolean))]
    const uniqueDates = [...new Set(recentSessions.map(s => s.date))]

    const latest = entries[0]
    const previous = entries[1]

    const prompt = `You are a personal fitness coach reviewing my monthly progress. Here's my data:

WORKOUT DATA (last 30 days):
- Total workout days: ${uniqueDates.length}
- Total sessions logged: ${recentSessions.length}
- Total volume lifted: ${totalVolume.toLocaleString()} lbs
- Muscle groups trained: ${muscleGroups.join(', ') || 'None logged'}

BODY METRICS (latest):
- Weight: ${latest?.weight ? `${latest.weight} lbs` : 'Not logged'}
- Body Fat: ${latest?.bodyFat ? `${latest.bodyFat}%` : 'Not logged'}
- Muscle Mass: ${latest?.muscleMassLbs ? `${latest.muscleMassLbs} lbs` : 'Not logged'}
- Skeletal Muscle: ${latest?.skeletalMuscle ? `${latest.skeletalMuscle}%` : 'Not logged'}
- Visceral Fat: ${latest?.visceralFat ?? 'Not logged'}
- Body Water: ${latest?.bodyWater ? `${latest.bodyWater}%` : 'Not logged'}
- BMR: ${latest?.bmr ? `${latest.bmr} kcal` : 'Not logged'}
- Metabolic Age: ${latest?.metabolicAge ?? 'Not logged'}
- BMI: ${latest?.bmi ?? 'Not logged'}

${previous ? `PREVIOUS ENTRY COMPARISON:
- Weight change: ${latest?.weight && previous?.weight ? `${(latest.weight - previous.weight).toFixed(1)} lbs` : 'N/A'}
- Body fat change: ${latest?.bodyFat && previous?.bodyFat ? `${(latest.bodyFat - previous.bodyFat).toFixed(1)}%` : 'N/A'}
- Muscle mass change: ${latest?.muscleMassLbs && previous?.muscleMassLbs ? `${(latest.muscleMassLbs - previous.muscleMassLbs).toFixed(1)} lbs` : 'N/A'}` : ''}

Please provide:
1. A 2-3 sentence progress summary (be specific and motivating)
2. Three actionable recommendations for next month

Format your response as:
**Progress Summary**
[summary here]

**Recommendations for Next Month**
1. [recommendation]
2. [recommendation]
3. [recommendation]

	Keep your total response under 200 words.`

    try {
      const text = await generateAiText({ prompt, maxTokens: 400 })
      setReport(text)
    } catch (e) {
      setError(e.message || 'Failed to generate report.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="section-title mb-0">Monthly Insights</p>
          <p className="text-text-secondary text-xs mt-0.5">Progress analysis with next-step recommendations</p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
      </div>

      <div className="bg-accent-green/10 border border-accent-green/20 rounded-xl p-3 mb-3">
        <p className="text-accent-green text-sm font-semibold">{previewText}</p>
        <p className="text-text-secondary text-xs mt-1">Turn your scans, workouts, and body metrics into one monthly review.</p>
      </div>

      {error && (
        <div className="bg-accent-red/10 border border-accent-red/20 rounded-xl p-3 mb-3">
          <p className="text-accent-red text-xs">{error}</p>
        </div>
      )}

      {report ? (
        <div className="space-y-3">
          {report.split('\n').filter(l => l.trim()).map((line, i) => {
            if (line.startsWith('**') && line.endsWith('**')) {
              return <p key={i} className="text-text-primary font-semibold text-sm mt-2">{line.replace(/\*\*/g, '')}</p>
            }
            if (/^\d\./.test(line)) {
              return (
                <div key={i} className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{line[0]}</span>
                  <p className="text-text-secondary text-sm">{line.slice(2).trim()}</p>
                </div>
              )
            }
            return <p key={i} className="text-text-secondary text-sm leading-relaxed">{line}</p>
          })}
          <button onClick={() => { setReport(null); generateReport() }} className="btn-secondary w-full text-sm mt-2">
            Regenerate Insights
          </button>
        </div>
      ) : (
        <button onClick={generateReport} disabled={loading} className="btn-primary w-full disabled:opacity-50">
          {loading ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analyzing your data…
            </span>
          ) : 'View Insights'}
        </button>
      )}
    </div>
  )
}

// ── Chart Tooltip ──────────────────────────────────────────
function WeightTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-surface2 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary mb-0.5">{label}</p>
      <p className="text-accent font-bold font-mono">{payload[0].value} lb</p>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────
export default function BodyMetrics() {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showLog, setShowLog] = useState(false)
  const [prefillData, setPrefillData] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const scanInputRef = useRef(null)

  useEffect(() => {
    if (!user?.uid) return
    setLoading(true)
    setLoadError(null)
    user.getIdToken()
      .then(() => Promise.all([
        getDocs(bodyMetricsCol(user.uid)),
        getDocs(sessionsCol(user.uid)),
      ]))
      .then(([metricsSnap, sessionsSnap]) => {
        const sorted = metricsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => b.date.localeCompare(a.date))
        setEntries(sorted)
        setSessions(sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      })
      .catch((err) => {
        console.error('BodyMetrics load error:', err)
        setLoadError('Could not load your body metrics right now.')
        setLoading(false)
      })
  }, [reloadKey, user?.uid])

  function retryLoad() {
    setReloadKey((current) => current + 1)
  }

  const latest = entries[0]
  const previous = entries[1]
  const strengthWeight = latest?.weight || entries.find((entry) => entry.weight)?.weight || null
  const strengthSummary = useMemo(
    () => calculateStrengthData(sessions, strengthWeight),
    [sessions, strengthWeight]
  )
  const bodyFocus = getBodyFocus(latest, previous, strengthSummary)
  const weightInsight = useMemo(() => getWeightInsight(entries), [entries])
  const bodyMotivation = useMemo(() => {
    if (!entries.length) return 'Your first check-in creates the baseline everything builds from.'
    if (bodyFocus === 'Focus: Build Muscle') return 'Strength and muscle are moving in the right direction.'
    if (bodyFocus === 'Focus: Reduce Body Fat') return 'Consistent check-ins turn body composition into something you can actually steer.'
    if (bodyFocus === 'Focus: Build Strength') return 'A few strong sessions can move your score faster than you think.'
    return 'Your consistency is starting to turn data into momentum.'
  }, [bodyFocus, entries.length])

  function deltaValue(currentEntry, previousEntry, key) {
    if (currentEntry?.[key] == null || previousEntry?.[key] == null) return null
    return parseFloat((currentEntry[key] - previousEntry[key]).toFixed(1))
  }

  const topMetricCards = [
    { label: 'Weight', value: latest?.weight, unit: 'lb', delta: deltaValue(latest, previous, 'weight'), lowerIsBetter: false, valueColor: 'text-accent-green' },
    { label: 'Body Fat', value: latest?.bodyFat, unit: '%', delta: deltaValue(latest, previous, 'bodyFat'), lowerIsBetter: true },
    { label: 'Muscle Mass', value: latest?.muscleMassLbs, unit: 'lb', delta: deltaValue(latest, previous, 'muscleMassLbs'), lowerIsBetter: false },
  ]
  const compositionMetrics = [
    { label: 'Skeletal Muscle', value: latest?.skeletalMuscle, unit: '%', delta: deltaValue(latest, previous, 'skeletalMuscle'), lowerIsBetter: false },
    { label: 'Body Water', value: latest?.bodyWater, unit: '%', delta: deltaValue(latest, previous, 'bodyWater'), lowerIsBetter: false },
    { label: 'Fat-Free Wt', value: latest?.fatFreeBodyWeight, unit: 'lb', delta: deltaValue(latest, previous, 'fatFreeBodyWeight'), lowerIsBetter: false },
    { label: 'Subcut. Fat', value: latest?.subcutaneousFat, unit: '%', delta: deltaValue(latest, previous, 'subcutaneousFat'), lowerIsBetter: true },
    { label: 'Protein', value: latest?.protein, unit: '%', delta: deltaValue(latest, previous, 'protein'), lowerIsBetter: false },
    { label: 'Visceral Fat', value: latest?.visceralFat, delta: deltaValue(latest, previous, 'visceralFat'), lowerIsBetter: true },
  ]
  const healthMetrics = [
    { label: 'BMI', value: latest?.bmi, delta: deltaValue(latest, previous, 'bmi'), lowerIsBetter: true, note: latest?.bmi ? bmiLabel(latest.bmi) : null },
    { label: 'BMR', value: latest?.bmr, unit: 'kcal', delta: deltaValue(latest, previous, 'bmr'), lowerIsBetter: false },
    { label: 'Metabolic Age', value: latest?.metabolicAge, unit: 'yr', delta: deltaValue(latest, previous, 'metabolicAge'), lowerIsBetter: true },
    { label: 'Bone Mass', value: latest?.boneMass, unit: 'lb', delta: deltaValue(latest, previous, 'boneMass'), lowerIsBetter: false },
  ]

  // Weight history chart (last 12 entries, oldest first)
  const chartData = [...entries]
    .reverse()
    .slice(-12)
    .filter(e => e.weight)
    .map(e => ({ date: e.date.slice(5), weight: e.weight }))

  async function handleScanPhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setScanStatus(null)
    setScanning(true)
    try {
      const compressed = await compressImage(file, 1400, 0.85)

      const text = await analyzeImageWithAi({
        dataUrl: compressed,
        maxTokens: 400,
        prompt: `Extract all body metrics from this smart scale screenshot. Return ONLY a valid JSON object with these exact keys (use null for any value not found):
{"weight":null,"bodyFat":null,"bmi":null,"muscleMassLbs":null,"visceralFat":null,"bodyWater":null,"subcutaneousFat":null,"skeletalMuscle":null,"boneMass":null,"fatFreeBodyWeight":null,"bmr":null,"protein":null,"metabolicAge":null}
Notes: weight/boneMass/fatFreeBodyWeight/muscleMassLbs are in lbs; bodyFat/bodyWater/subcutaneousFat/skeletalMuscle/protein are percentages; bmr is kcal; metabolicAge is years; visceralFat is a score.`,
      })
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('We could not read the numbers from that photo.')
      const metrics = JSON.parse(jsonMatch[0])
      // Filter out nulls so prefillData only has actual values
      const filled = Object.fromEntries(Object.entries(metrics).filter(([, v]) => v != null))
      setPrefillData(filled)
      setShowLog(true)
    } catch (err) {
      setScanStatus({
        type: 'error',
        message: `Scan failed: ${err.message || 'Try a clearer screenshot.'}`,
      })
    } finally {
      setScanning(false)
    }
  }

  async function handleSave(formData) {
    const heightInches = formData.heightFt
      ? (Number(formData.heightFt) * 12) + (Number(formData.heightIn) || 0)
      : latest?.heightInches || null

    // Use extracted BMI from scan if available, otherwise compute from weight + height
    const bmi = formData.bmi
      ? Number(formData.bmi)
      : calcBMI(Number(formData.weight), heightInches)

    const n = (v) => (v !== '' && v != null ? Number(v) : null)

    const entry = {
      date: TODAY,
      weight:            n(formData.weight),
      bodyFat:           n(formData.bodyFat),
      muscleMassLbs:     n(formData.muscleMassLbs),
      skeletalMuscle:    n(formData.skeletalMuscle),
      visceralFat:       n(formData.visceralFat),
      bodyWater:         n(formData.bodyWater),
      subcutaneousFat:   n(formData.subcutaneousFat),
      boneMass:          n(formData.boneMass),
      fatFreeBodyWeight: n(formData.fatFreeBodyWeight),
      bmr:               n(formData.bmr),
      protein:           n(formData.protein),
      metabolicAge:      n(formData.metabolicAge),
      heightInches,
      bmi,
      photoBase64: formData.photoBase64 || null,
      createdAt: serverTimestamp(),
    }

    const ref = await addDoc(bodyMetricsCol(user.uid), entry)
    setEntries(prev => [{ ...entry, id: ref.id }, ...prev])
    setShowLog(false)
    setPrefillData(null)
  }

  return (
    <PageWrapper>
      <div className="px-4 pt-2 space-y-4 pb-6">

        {/* Header */}
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Body Metrics</h1>
          <p className="text-text-secondary text-sm mt-0.5">Improve your body composition</p>
          <p className="text-accent text-xs font-semibold mt-2 uppercase tracking-[0.18em]">{bodyFocus}</p>
          <p className="text-accent-green text-sm font-medium mt-2">{bodyMotivation}</p>
        </div>

        {loadError && (
          <div className="card border-red-500/25 bg-red-500/10">
            <p className="text-accent-red font-semibold text-sm">Body metrics unavailable</p>
            <p className="text-text-secondary text-sm mt-1">{loadError}</p>
            <button onClick={retryLoad} className="btn-secondary mt-4 w-full">
              Retry
            </button>
          </div>
        )}

        {/* Weight history chart */}
        <div className="card">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="section-title mb-0">Weight History</p>
              <p className="text-text-primary text-sm font-semibold mt-0.5">{weightInsight.headline}</p>
              <p className="text-text-secondary text-xs mt-1">{weightInsight.subline}</p>
            </div>
            {latest?.weight && (
              <p className="text-text-secondary text-sm text-right">
                <span className="text-text-primary font-semibold">{latest.weight}</span> lb
              </p>
            )}
          </div>
          {loading ? (
            <div className="h-32 animate-pulse bg-surface2 rounded-xl" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1A56DB" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#1A56DB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip content={<WeightTooltip />} />
                <Area type="monotone" dataKey="weight" stroke="#1A56DB" strokeWidth={2}
                  fill="url(#weightGrad)"
                  dot={(props) => <WeightHistoryDot {...props} isLatest={props.index === chartData.length - 1} />}
                  activeDot={{ r: 5, fill: '#2563EB', stroke: '#93C5FD', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-32 flex flex-col items-center justify-center text-center px-6">
              <p className="text-text-primary text-sm font-semibold">Add your first check-in</p>
              <p className="text-text-secondary text-xs mt-1">Track real progress week to week with your first weight entry.</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <input ref={scanInputRef} type="file" accept="image/*" className="hidden" onChange={handleScanPhoto} />
        <div className="flex gap-2">
          <button
            onClick={() => { setPrefillData(null); setShowLog(true) }}
            className="btn-secondary flex-1 min-h-[88px]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Log Manually
          </button>
          <button
            onClick={() => scanInputRef.current?.click()}
            disabled={scanning}
            className="flex-1 min-h-[88px] rounded-2xl px-4 py-3 text-left text-white bg-gradient-to-br from-accent to-[#1D4ED8] shadow-[0_12px_30px_rgba(37,99,235,0.24)] disabled:opacity-50 active:scale-[0.98] transition-transform tap-glow"
          >
            {scanning ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scanning…
              </>
            ) : (
              <div className="w-full">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/80 mb-1">Smart Scan</p>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-lg font-semibold">Scan Scale Photo</span>
                </div>
              </div>
            )}
          </button>
        </div>
        {scanStatus && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-accent-red">
            {scanStatus.message}
          </div>
        )}
        <StrengthScoreCard sessions={sessions} bodyWeight={strengthWeight} />

        {/* Progress photos */}
        {entries.some(e => e.photoBase64) && (
          <ProgressPhotoCard entries={entries} />
        )}

        {/* AI Monthly Report */}
        <AiReportCard entries={entries} sessions={sessions} />

        {/* Metric cards — single collapsible card */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">Body Profile</p>
            {latest?.date && (
              <span className="text-text-secondary text-xs">
                Updated {format(new Date(latest.date + 'T12:00:00'), 'MMM d, yyyy')}
              </span>
            )}
          </div>
          {loading ? (
            <div className="grid grid-cols-3 gap-2">
              {[...Array(3)].map((_, i) => <div key={i} className="rounded-2xl h-16 animate-pulse bg-surface2" />)}
            </div>
          ) : (
            <>
              <div>
                <p className="text-text-secondary text-xs uppercase tracking-[0.18em] mb-2">Key Metrics</p>
                <div className="grid grid-cols-3 gap-2">
                  {topMetricCards.map((metric) => (
                    <div key={metric.label} className="bg-surface2 rounded-2xl p-3">
                      <p className="text-text-secondary text-xs leading-tight mb-1.5">{metric.label}</p>
                      <div className="flex items-baseline gap-1 flex-wrap">
                        <span className={`font-display text-2xl font-bold ${metric.value != null ? (metric.valueColor || 'text-white') : 'text-surface2'}`}>
                          {metric.value != null ? metric.value : '—'}
                        </span>
                        {metric.unit && metric.value != null && <span className="text-text-secondary text-xs">{metric.unit}</span>}
                      </div>
                      {metric.delta != null && metric.value != null && (
                        <div className="mt-1">
                          <TrendArrow delta={metric.delta} lowerIsBetter={metric.lowerIsBetter} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {showAll && (
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-text-secondary text-xs uppercase tracking-[0.18em] mb-2">Body Composition</p>
                    <div className="grid grid-cols-3 gap-2">
                      {compositionMetrics.map((metric) => (
                        <MetricCard
                          key={metric.label}
                          label={metric.label}
                          value={metric.value}
                          unit={metric.unit}
                          delta={metric.delta}
                          lowerIsBetter={metric.lowerIsBetter}
                          note={metric.note}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-text-secondary text-xs uppercase tracking-[0.18em] mb-2">Health</p>
                    <div className="grid grid-cols-3 gap-2">
                      {healthMetrics.map((metric) => (
                        <MetricCard
                          key={metric.label}
                          label={metric.label}
                          value={metric.value}
                          unit={metric.unit}
                          delta={metric.delta}
                          lowerIsBetter={metric.lowerIsBetter}
                          note={metric.note}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowAll(s => !s)}
                className="mt-3 text-accent text-xs font-semibold active:opacity-70 transition-opacity"
              >
                {showAll ? 'Show less' : 'Show more'}
              </button>
            </>
          )}
        </div>

      </div>

      {/* Log dialog */}
      {showLog && (
        <LogSheet
          onClose={() => { setShowLog(false); setPrefillData(null) }}
          onSave={handleSave}
          lastEntry={latest}
          prefillData={prefillData}
        />
      )}
    </PageWrapper>
  )
}
