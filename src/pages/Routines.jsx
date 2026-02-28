// src/pages/Routines.jsx
import { useState } from 'react'
import PageWrapper from '../components/layout/PageWrapper'

const PLACEHOLDER_ROUTINES = [
  { id: '1', name: 'Push Day', exerciseCount: 5, lastPerformed: '3 days ago' },
  { id: '2', name: 'Pull Day', exerciseCount: 6, lastPerformed: '5 days ago' },
  { id: '3', name: 'Leg Day', exerciseCount: 7, lastPerformed: '1 week ago' },
  { id: '4', name: 'Upper Body', exerciseCount: 8, lastPerformed: 'Never' },
]

function RoutineCard({ routine, onSelect }) {
  return (
    <button
      onClick={() => onSelect(routine)}
      className="card text-left active:scale-95 transition-transform w-full"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
          </svg>
        </div>
        <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
      <h3 className="font-display font-semibold text-text-primary text-base">{routine.name}</h3>
      <p className="text-text-secondary text-xs mt-1">{routine.exerciseCount} exercises</p>
      <p className="text-text-secondary text-xs mt-0.5">Last: {routine.lastPerformed}</p>
    </button>
  )
}

export default function Routines() {
  const [routines] = useState(PLACEHOLDER_ROUTINES)

  return (
    <PageWrapper showHeader>
      <div className="px-4 pt-2 space-y-4">

        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-text-primary">Routines</h1>
          <button className="btn-primary text-sm py-2 px-3">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New
          </button>
        </div>

        {/* Routine Grid */}
        <div className="grid grid-cols-2 gap-3">
          {routines.map((r) => (
            <RoutineCard key={r.id} routine={r} onSelect={(r) => console.log('selected', r)} />
          ))}
        </div>

        {/* Routine Metrics */}
        <div>
          <p className="section-title">Routine Metrics</p>
          <div className="card">
            <div className="flex items-center justify-center h-24">
              <p className="text-text-secondary text-sm">Select a routine to see metrics</p>
            </div>
          </div>
        </div>

        {/* Bottom placeholder cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card min-h-[70px] flex items-center justify-center">
            <p className="text-text-secondary text-xs text-center">Analytics<br/>Coming Soon</p>
          </div>
          <div className="card min-h-[70px] flex items-center justify-center">
            <p className="text-text-secondary text-xs text-center">Schedule<br/>Coming Soon</p>
          </div>
        </div>

      </div>
    </PageWrapper>
  )
}
