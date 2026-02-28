// scripts/seed-exercises.mjs
// Run once: node scripts/seed-exercises.mjs
import { initializeApp, deleteApp } from 'firebase/app'
import { getFirestore, doc, writeBatch } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyCVinC1Y4Jn6Y8IKEHHsdC8B10VBs2DkXY",
  authDomain: "fittrackpro-cfdb6.firebaseapp.com",
  projectId: "fittrackpro-cfdb6",
  storageBucket: "fittrackpro-cfdb6.firebasestorage.app",
  messagingSenderId: "294189209613",
  appId: "1:294189209613:web:c6c16d2c19bfe3db2b5d44",
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const exercises = [
  // Abs
  { name: 'Vertical Leg Raises',              muscleGroup: 'Abs',       category: 'strength' },
  { name: 'Ab Crunch Hammer',                 muscleGroup: 'Abs',       category: 'strength' },
  { name: 'Ab Crunch Machine',                muscleGroup: 'Abs',       category: 'strength' },
  // Back
  { name: 'Seated Row',                       muscleGroup: 'Back',      category: 'strength' },
  { name: 'Wall Sit',                         muscleGroup: 'Back',      category: 'strength' },
  { name: 'Dead Hang',                        muscleGroup: 'Back',      category: 'strength' },
  { name: 'Cable Row',                        muscleGroup: 'Back',      category: 'strength' },
  { name: 'Seated Back Extension',            muscleGroup: 'Back',      category: 'strength' },
  // Biceps
  { name: 'Push Ups',                         muscleGroup: 'Biceps',    category: 'strength' },
  { name: 'Machine Bicep Curl',               muscleGroup: 'Biceps',    category: 'strength' },
  { name: 'EZ-Bar Curl',                      muscleGroup: 'Biceps',    category: 'strength' },
  { name: 'Lat Pulldown',                     muscleGroup: 'Biceps',    category: 'strength' },
  { name: 'Cable Bicep Curl',                 muscleGroup: 'Biceps',    category: 'strength' },
  // Triceps
  { name: 'Assisted Dips',                    muscleGroup: 'Triceps',   category: 'strength' },
  { name: 'Dips',                             muscleGroup: 'Triceps',   category: 'strength' },
  { name: 'Triceps Pushdown Machine',         muscleGroup: 'Triceps',   category: 'strength' },
  { name: 'Cable Overhead Triceps Extension', muscleGroup: 'Triceps',   category: 'strength' },
  { name: 'Cable Face Pull',                  muscleGroup: 'Triceps',   category: 'strength' },
  { name: 'Triceps Pull Down',                muscleGroup: 'Triceps',   category: 'strength' },
  // Shoulders
  { name: 'Machine Shoulder Pulldown',        muscleGroup: 'Shoulders', category: 'strength' },
  { name: 'Dumbbell Shoulder Press',          muscleGroup: 'Shoulders', category: 'strength' },
  { name: 'Upright Row',                      muscleGroup: 'Shoulders', category: 'strength' },
  { name: 'Dumbbell Front Raises',            muscleGroup: 'Shoulders', category: 'strength' },
  { name: 'Dumbbell Lateral Raise',           muscleGroup: 'Shoulders', category: 'strength' },
  { name: 'Cable Lateral Raise',              muscleGroup: 'Shoulders', category: 'strength' },
  // Chest
  { name: 'Dumbbell Bench Press',             muscleGroup: 'Chest',     category: 'strength' },
  { name: 'Bench Press Machine',              muscleGroup: 'Chest',     category: 'strength' },
  { name: 'Incline Bench Press',              muscleGroup: 'Chest',     category: 'strength' },
  { name: 'Machine Fly',                      muscleGroup: 'Chest',     category: 'strength' },
  { name: 'Chest Press',                      muscleGroup: 'Chest',     category: 'strength' },
  { name: 'Incline Press Machine',            muscleGroup: 'Chest',     category: 'strength' },
  // Legs
  { name: 'Hamstring Curls',                  muscleGroup: 'Legs',      category: 'strength' },
  { name: 'Leg Extension',                    muscleGroup: 'Legs',      category: 'strength' },
  { name: 'Squat',                            muscleGroup: 'Legs',      category: 'strength' },
  { name: 'Leg Press',                        muscleGroup: 'Legs',      category: 'strength' },
  { name: 'Leg Press Machine',                muscleGroup: 'Legs',      category: 'strength' },
  { name: 'Outer Thigh',                      muscleGroup: 'Legs',      category: 'strength' },
  { name: 'Step Ups',                         muscleGroup: 'Legs',      category: 'strength' },
  { name: 'Calf Raise',                       muscleGroup: 'Legs',      category: 'strength' },
  { name: 'Calf Extension',                   muscleGroup: 'Legs',      category: 'strength' },
  // Glutes
  { name: 'Glute Machine',                    muscleGroup: 'Glutes',    category: 'strength' },
  { name: 'Sumo Squat',                       muscleGroup: 'Glutes',    category: 'strength' },
  { name: 'Walking Lunges',                   muscleGroup: 'Glutes',    category: 'strength' },
  { name: 'Deadlift',                         muscleGroup: 'Glutes',    category: 'strength' },
  { name: 'Hip Abductor',                     muscleGroup: 'Glutes',    category: 'strength' },
  { name: 'Bridge',                           muscleGroup: 'Glutes',    category: 'strength' },
  { name: 'Smith Machine Squat',              muscleGroup: 'Glutes',    category: 'strength' },
  { name: 'Hip Thrust',                       muscleGroup: 'Glutes',    category: 'strength' },
  { name: 'Single Leg Glute Bridge',          muscleGroup: 'Glutes',    category: 'strength' },
  { name: 'Stair Climber',                    muscleGroup: 'Glutes',    category: 'cardio'   },
  // Cardio
  { name: 'Fitness Bike',                     muscleGroup: 'Cardio',    category: 'cardio'   },
  { name: 'Walking',                          muscleGroup: 'Cardio',    category: 'cardio'   },
  { name: 'Walking Treadmill',                muscleGroup: 'Cardio',    category: 'cardio'   },
  { name: 'Elliptical Machine',               muscleGroup: 'Cardio',    category: 'cardio'   },
  { name: 'Sex',                              muscleGroup: 'Cardio',    category: 'cardio'   },
  // Recovery
  { name: 'Hydro Massage Bed',                muscleGroup: 'Recovery',  category: 'recovery' },
]

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const batch = writeBatch(db)
for (const ex of exercises) {
  const ref = doc(db, 'globalExercises', toSlug(ex.name))
  batch.set(ref, { ...ex, createdAt: new Date().toISOString() })
}
await batch.commit()
console.log(`✅ Seeded ${exercises.length} exercises to globalExercises`)
await deleteApp(app)
process.exit(0)
