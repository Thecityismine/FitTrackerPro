// src/pages/BodyMetrics.jsx
import PageWrapper from '../components/layout/PageWrapper'

const METRIC_CARDS = [
  { id: 'weight', label: 'Weight', value: '—', unit: 'lbs', color: 'text-accent', hasQuickEdit: true },
  { id: 'bmi', label: 'BMI', value: '—', unit: '', color: 'text-accent-green', note: 'Auto-calculated' },
  { id: 'muscleMass', label: 'Muscle Mass', value: '—', unit: '%', color: 'text-blue-400' },
  { id: 'bodyFat', label: 'Body Fat', value: '—', unit: '%', color: 'text-orange-400' },
  { id: 'visceralFat', label: 'Visceral Fat', value: '—', unit: '', color: 'text-red-400' },
  { id: 'hydration', label: 'Hydration', value: '—', unit: '%', color: 'text-teal-400', note: 'Coming soon' },
]

function MetricCard({ metric }) {
  return (
    <button className="card text-left active:scale-95 transition-transform">
      <p className="section-title">{metric.label}</p>
      <div className="flex items-end gap-1 mt-1">
        <span className={`font-display text-2xl font-bold ${metric.color}`}>{metric.value}</span>
        {metric.unit && <span className="text-text-secondary text-sm mb-0.5">{metric.unit}</span>}
      </div>
      {metric.note && <p className="text-text-secondary text-xs mt-1">{metric.note}</p>}
      {metric.hasQuickEdit && (
        <div className="flex gap-2 mt-2">
          <button className="flex-1 bg-surface2 rounded-lg py-1 text-text-secondary text-sm active:bg-border">−</button>
          <button className="flex-1 bg-surface2 rounded-lg py-1 text-text-secondary text-sm active:bg-border">+</button>
        </div>
      )}
    </button>
  )
}

export default function BodyMetrics() {
  return (
    <PageWrapper showHeader>
      <div className="px-4 pt-2 space-y-4">

        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Body Metrics</h1>
          <p className="text-text-secondary text-sm mt-0.5">Track your body composition</p>
        </div>

        {/* Weight Chart Placeholder */}
        <div className="card">
          <p className="section-title">Weight History</p>
          <div className="h-36 flex items-center justify-center bg-surface2/50 rounded-xl">
            <p className="text-text-secondary text-sm">Log your first weight entry</p>
          </div>
        </div>

        {/* Log Entry Button */}
        <button className="btn-primary w-full">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Log Today's Metrics
        </button>

        {/* Body Profile Metrics Grid */}
        <div>
          <p className="section-title">Body Profile</p>
          <div className="grid grid-cols-2 gap-3">
            {METRIC_CARDS.map((m) => (
              <MetricCard key={m.id} metric={m} />
            ))}
          </div>
        </div>

      </div>
    </PageWrapper>
  )
}
