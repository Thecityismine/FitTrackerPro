// src/pages/CalendarLog.jsx
import PageWrapper from '../components/layout/PageWrapper'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'

export default function CalendarLog() {
  const today = new Date()
  const days = eachDayOfInterval({ start: startOfMonth(today), end: endOfMonth(today) })
  const startPad = getDay(startOfMonth(today)) // 0=Sun

  // Placeholder: mark a few days as having workouts
  const workoutDays = new Set([4, 7, 10, 14, 17, 21, 24])

  return (
    <PageWrapper showHeader>
      <div className="px-4 pt-2 space-y-4">

        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">
            {format(today, 'MMMM yyyy')}
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">Your workout history</p>
        </div>

        {/* Calendar Grid */}
        <div className="card">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => (
              <div key={d} className="text-center text-text-secondary text-xs font-semibold py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Padding cells */}
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {/* Day cells */}
            {days.map((day) => {
              const d = day.getDate()
              const isToday = d === today.getDate()
              const hasWorkout = workoutDays.has(d)
              return (
                <button
                  key={d}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-colors active:scale-95 ${
                    isToday ? 'bg-accent text-white' :
                    hasWorkout ? 'bg-accent-green/20 text-accent-green' :
                    'text-text-secondary hover:bg-surface2'
                  }`}
                >
                  <span>{d}</span>
                  {hasWorkout && !isToday && (
                    <div className="w-1 h-1 rounded-full bg-accent-green mt-0.5" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Recent sessions list */}
        <div>
          <p className="section-title">Recent Sessions</p>
          <div className="space-y-2">
            {[
              { date: 'Feb 24', name: 'Push Day', exercises: 5, volume: '18,200' },
              { date: 'Feb 21', name: 'Pull Day', exercises: 6, volume: '21,450' },
              { date: 'Feb 17', name: 'Leg Day', exercises: 7, volume: '24,800' },
            ].map((s) => (
              <div key={s.date} className="card flex items-center justify-between">
                <div>
                  <p className="text-text-primary font-semibold text-sm">{s.name}</p>
                  <p className="text-text-secondary text-xs">{s.date} · {s.exercises} exercises</p>
                </div>
                <div className="text-right">
                  <p className="text-accent-green font-mono text-sm font-bold">{s.volume}</p>
                  <p className="text-text-secondary text-xs">lbs vol.</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </PageWrapper>
  )
}
