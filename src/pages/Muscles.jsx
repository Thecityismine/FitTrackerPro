// src/pages/Muscles.jsx
import { useNavigate } from 'react-router-dom'
import PageWrapper from '../components/layout/PageWrapper'

const MUSCLE_GROUPS = [
  { id: 'abs', label: 'Abs', emoji: '🔥', color: 'bg-orange-500/20 border-orange-500/30', textColor: 'text-orange-400' },
  { id: 'back', label: 'Back', emoji: '💪', color: 'bg-blue-500/20 border-blue-500/30', textColor: 'text-blue-400' },
  { id: 'arms', label: 'Arms', emoji: '⚡', color: 'bg-yellow-500/20 border-yellow-500/30', textColor: 'text-yellow-400' },
  { id: 'triceps', label: 'Triceps', emoji: '🎯', color: 'bg-purple-500/20 border-purple-500/30', textColor: 'text-purple-400' },
  { id: 'shoulders', label: 'Shoulders', emoji: '🏔️', color: 'bg-teal-500/20 border-teal-500/30', textColor: 'text-teal-400' },
  { id: 'chest', label: 'Chest', emoji: '🛡️', color: 'bg-red-500/20 border-red-500/30', textColor: 'text-red-400' },
  { id: 'legs', label: 'Legs', emoji: '🦵', color: 'bg-green-500/20 border-green-500/30', textColor: 'text-green-400' },
  { id: 'glutes', label: 'Glutes', emoji: '🎖️', color: 'bg-pink-500/20 border-pink-500/30', textColor: 'text-pink-400' },
]

function MuscleCard({ group, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`card border active:scale-95 transition-transform text-left ${group.color} min-h-[100px] flex flex-col justify-between`}
    >
      <span className="text-3xl">{group.emoji}</span>
      <div>
        <h3 className={`font-display font-bold text-lg ${group.textColor}`}>{group.label}</h3>
        <p className="text-text-secondary text-xs">View exercises →</p>
      </div>
    </button>
  )
}

export default function Muscles() {
  const navigate = useNavigate()

  return (
    <PageWrapper showHeader>
      <div className="px-4 pt-2 space-y-4">

        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Muscle Groups</h1>
          <p className="text-text-secondary text-sm mt-0.5">Browse exercises by body part</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {MUSCLE_GROUPS.map((group) => (
            <MuscleCard
              key={group.id}
              group={group}
              onClick={() => navigate(`/muscles/${group.id}`)}
            />
          ))}
        </div>

      </div>
    </PageWrapper>
  )
}
