// src/pages/WorkoutPage.jsx
import { useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import PageWrapper from '../components/layout/PageWrapper'
import { useTimer } from '../context/TimerContext'
import { format } from 'date-fns'

const SAMPLE_SETS = [
  { id: 1, sets: 1, reps: 7, weight: 125 },
  { id: 2, sets: 1, reps: 8, weight: 130 },
  { id: 3, sets: 1, reps: 8, weight: 140 },
]

function SetRow({ set, onUpdate, onDelete }) {
  const volume = set.reps * set.weight

  return (
    <div className="grid grid-cols-4 gap-2 items-center py-2 border-b border-surface2">
      <span className="text-text-secondary text-sm text-center">{set.sets}</span>
      <input
        type="number"
        value={set.reps}
        onChange={(e) => onUpdate({ ...set, reps: Number(e.target.value) })}
        className="bg-surface2 rounded-lg px-2 py-1.5 text-text-primary text-sm text-center w-full focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <input
        type="number"
        value={set.weight}
        onChange={(e) => onUpdate({ ...set, weight: Number(e.target.value) })}
        className="bg-surface2 rounded-lg px-2 py-1.5 text-text-primary text-sm text-center w-full focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <span className="text-text-secondary text-sm text-right font-mono">
        {volume.toLocaleString()}
      </span>
    </div>
  )
}

export default function WorkoutPage() {
  const { exerciseId } = useParams()
  const navigate = useNavigate()
  const { isRunning, toggle, reset, formatted } = useTimer()
  const [sets, setSets] = useState(SAMPLE_SETS)
  const today = format(new Date(), 'EEEE d, yyyy')

  const totalVolume = sets.reduce((sum, s) => sum + s.reps * s.weight, 0)

  function addSet() {
    const lastSet = sets[sets.length - 1]
    setSets([...sets, {
      id: Date.now(),
      sets: sets.length + 1,
      reps: lastSet?.reps || 8,
      weight: lastSet?.weight || 100,
    }])
  }

  function updateSet(updated) {
    setSets(sets.map((s) => s.id === updated.id ? updated : s))
  }

  return (
    <PageWrapper showHeader={false}>
      <div className="flex flex-col h-full">

        {/* Custom header with back + exercise name */}
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-text-secondary text-sm mb-3 active:scale-95 transition-transform"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back
          </button>

          {/* Routine Slider */}
          <div className="flex gap-2 overflow-x-auto pb-1 mb-3 scrollbar-none">
            {['Push Day', 'Pull Day', 'Leg Day'].map((r, i) => (
              <button key={r} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${i === 0 ? 'bg-accent text-white' : 'bg-surface2 text-text-secondary'}`}>
                {r}
              </button>
            ))}
          </div>

          <h1 className="font-display text-2xl font-bold text-text-primary">
            {exerciseId ? exerciseId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Bench Press'}
          </h1>
        </div>

        {/* Volume Chart Placeholder */}
        <div className="mx-4 mb-3 card flex-shrink-0">
          <p className="section-title">Volume History</p>
          <div className="h-28 flex items-center justify-center bg-surface2/50 rounded-xl">
            <p className="text-text-secondary text-sm">Volume chart</p>
          </div>
        </div>

        {/* Action Row: Add Exercise + Rest Timer */}
        <div className="px-4 mb-3 flex gap-2 flex-shrink-0">
          <button className="btn-secondary flex-1 text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Exercise
          </button>
          <div className="flex items-center gap-2 bg-surface border border-surface2 rounded-xl px-3 py-2">
            <span className="font-mono text-text-primary text-sm font-bold">{formatted()}</span>
            <button
              onClick={toggle}
              className={`text-xs font-semibold ${isRunning ? 'text-accent-green' : 'text-accent'}`}
            >
              {isRunning ? 'Pause' : 'Play'}
            </button>
            <button onClick={reset} className="text-xs text-text-secondary">Clear</button>
          </div>
        </div>

        {/* Sets Table — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 pb-24">
          <div className="card">
            {/* Date header */}
            <p className="text-text-secondary text-xs font-semibold mb-3">{today}</p>

            {/* Column Headers */}
            <div className="grid grid-cols-4 gap-2 pb-2 border-b border-surface2 mb-1">
              {['Sets', 'Reps', 'Weight', 'Volume'].map((h) => (
                <span key={h} className="text-text-secondary text-xs font-medium text-center">{h}</span>
              ))}
            </div>

            {/* Set Rows */}
            {sets.map((set) => (
              <SetRow key={set.id} set={set} onUpdate={updateSet} />
            ))}

            {/* Total */}
            <div className="flex justify-between items-center mt-3 pt-2 border-t border-surface2">
              <button
                onClick={addSet}
                className="text-accent text-sm font-semibold flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Set
              </button>
              <div className="text-right">
                <p className="text-text-secondary text-xs">Total Volume</p>
                <p className="font-display font-bold text-accent-green text-lg">
                  {totalVolume.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </PageWrapper>
  )
}
