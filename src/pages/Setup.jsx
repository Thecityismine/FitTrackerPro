// src/pages/Setup.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const TOTAL_STEPS = 5
const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]
const FITNESS_GOAL_OPTIONS = [
  { value: 'lose_weight', label: 'Lose Weight' },
  { value: 'build_muscle', label: 'Build Muscle' },
  { value: 'overall_fitness', label: 'Overall Fitness' },
]

const STEP_META = [
  { title: "What's your name?",              sub: "This is how you'll appear in the app." },
  { title: "What's your current weight?",    sub: "We'll use this to track your progress." },
  { title: "How tall are you?",              sub: "Used to calculate your body metrics." },
  { title: "How often do you work out?",     sub: "Set your weekly workout goal." },
  { title: 'Set your profile preferences',   sub: 'We will use these to personalize your settings from the start.' },
]

export default function Setup() {
  const { user, profile, updateUserProfile } = useAuth()
  const navigate = useNavigate()
  const todayIso = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 10)
  const savedHeightIn = Number(profile?.heightIn) || 0

  const [step, setStep]       = useState(1)
  const [saving, setSaving]   = useState(false)

  // Step 1 — name
  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || '')

  // Step 2 — weight
  const [weightUnit, setWeightUnit] = useState(profile?.weightUnit || 'lbs')
  const [weight, setWeight]         = useState(() => {
    const savedWeight = Number(profile?.currentWeightLbs)
    if (!savedWeight) return ''
    return profile?.weightUnit === 'kg'
      ? String(Math.round(savedWeight / 2.20462))
      : String(savedWeight)
  })

  // Step 3 — height
  const [heightFt, setHeightFt] = useState(savedHeightIn ? String(Math.floor(savedHeightIn / 12)) : '')
  const [heightIn, setHeightIn] = useState(savedHeightIn ? String(savedHeightIn % 12) : '')

  // Step 4 — workouts/week
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState(profile?.weeklyWorkoutGoal ?? null)

  // Step 5 — profile preferences
  const [sex, setSex] = useState(profile?.sex || '')
  const [dateOfBirth, setDateOfBirth] = useState(profile?.dateOfBirth || '')
  const [fitnessGoal, setFitnessGoal] = useState(profile?.fitnessGoal || '')

  function canNext() {
    if (step === 1) return displayName.trim().length > 0
    if (step === 4) return workoutsPerWeek !== null
    if (step === 5) return Boolean(sex && dateOfBirth && fitnessGoal)
    return true // steps 2 & 3 are optional
  }

  function next() {
    if (step < TOTAL_STEPS) setStep(s => s + 1)
  }

  function back() {
    if (step > 1) setStep(s => s - 1)
  }

  async function handleFinish() {
    setSaving(true)
    try {
      const ftNum = parseInt(heightFt) || 0
      const inNum = parseInt(heightIn) || 0
      const heightTotalIn = ftNum > 0 ? ftNum * 12 + inNum : null

      const weightNum = parseFloat(weight) || null
      const weightLbs = weightNum
        ? (weightUnit === 'lbs' ? weightNum : Math.round(weightNum * 2.20462))
        : null

      await updateUserProfile({
        displayName:        displayName.trim(),
        weightUnit,
        heightIn:           heightTotalIn,
        weeklyWorkoutGoal:  workoutsPerWeek,
        sex,
        dateOfBirth,
        fitnessGoal,
        ...(weightLbs ? { currentWeightLbs: weightLbs } : {}),
        setupComplete:      true,
      })
      navigate('/', { replace: true })
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const meta = STEP_META[step - 1]
  const progress = (step / TOTAL_STEPS) * 100

  return (
    <div className="min-h-dvh bg-bg flex flex-col px-6 py-10">

      {/* Logo */}
      <div className="flex justify-center mb-8">
        <img src="/Logo.png" alt="FitTrack Pro" className="w-12 h-12 object-contain" />
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-surface2 rounded-full mb-8 overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step counter */}
      <p className="text-text-secondary text-xs font-semibold uppercase tracking-widest mb-2">
        Step {step} of {TOTAL_STEPS}
      </p>

      {/* Question */}
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">{meta.title}</h1>
      <p className="text-text-secondary text-sm mb-8">{meta.sub}</p>

      {/* ── Step content ── */}
      <div className="flex-1">

        {/* Step 1: Name */}
        {step === 1 && (
          <div>
            <label className="label">Display Name</label>
            <input
              autoFocus
              type="text"
              className="input text-lg"
              placeholder="e.g. Alex"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canNext() && next()}
            />
          </div>
        )}

        {/* Step 2: Weight */}
        {step === 2 && (
          <div className="space-y-4">
            {/* lbs / kg toggle */}
            <div className="flex bg-surface rounded-xl p-1 border border-surface2 w-40">
              {['lbs', 'kg'].map(u => (
                <button
                  key={u}
                  onClick={() => setWeightUnit(u)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                    weightUnit === u ? 'bg-accent text-white shadow' : 'text-text-secondary'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <div>
              <label className="label">Weight ({weightUnit})</label>
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                className="input text-lg"
                placeholder={weightUnit === 'lbs' ? '160' : '73'}
                value={weight}
                onChange={e => setWeight(e.target.value)}
              />
            </div>
            <p className="text-text-secondary text-xs">Optional — you can update this anytime in Profile.</p>
          </div>
        )}

        {/* Step 3: Height */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="label">Feet</label>
                <input
                  autoFocus
                  type="number"
                  inputMode="numeric"
                  className="input text-lg"
                  placeholder="5"
                  min="3" max="8"
                  value={heightFt}
                  onChange={e => setHeightFt(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="label">Inches</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input text-lg"
                  placeholder="10"
                  min="0" max="11"
                  value={heightIn}
                  onChange={e => setHeightIn(e.target.value)}
                />
              </div>
            </div>
            <p className="text-text-secondary text-xs">Optional — you can update this anytime in Profile.</p>
          </div>
        )}

        {/* Step 4: Workouts/week */}
        {step === 4 && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map(n => (
                <button
                  key={n}
                  onClick={() => setWorkoutsPerWeek(n)}
                  className={`py-4 rounded-xl font-display font-bold text-xl transition-all ${
                    workoutsPerWeek === n
                      ? 'bg-accent text-white shadow-lg shadow-accent/30 scale-105'
                      : 'bg-surface2 text-text-secondary active:scale-95'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-text-secondary text-xs">
              {workoutsPerWeek
                ? `${workoutsPerWeek} day${workoutsPerWeek > 1 ? 's' : ''} per week`
                : 'Tap a number to select'}
            </p>
          </div>
        )}

        {/* Step 5: Profile preferences */}
        {step === 5 && (
          <div className="space-y-5">
            <div>
              <label className="label">Sex</label>
              <div className="grid grid-cols-2 gap-2">
                {SEX_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSex(option.value)}
                    className={`py-3 rounded-xl text-sm font-semibold border transition-colors ${
                      sex === option.value
                        ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20'
                        : 'bg-surface2 border-surface2 text-text-secondary active:scale-95'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Birthday</label>
              <input
                type="date"
                className="input text-lg"
                value={dateOfBirth}
                max={todayIso}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Workout Goal</label>
              <div className="space-y-2">
                {FITNESS_GOAL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFitnessGoal(option.value)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                      fitnessGoal === option.value
                        ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20'
                        : 'bg-surface2 border-surface2 text-text-secondary active:scale-95'
                    }`}
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3 mt-8">
        {step > 1 && (
          <button
            onClick={back}
            className="btn-secondary flex-1"
          >
            Back
          </button>
        )}

        {step < TOTAL_STEPS ? (
          <button
            onClick={next}
            disabled={!canNext()}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={!canNext() || saving}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </span>
            ) : "Let's Go!"}
          </button>
        )}
      </div>

    </div>
  )
}
