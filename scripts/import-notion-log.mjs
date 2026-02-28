// scripts/import-notion-log.mjs
// Run: node scripts/import-notion-log.mjs
import { initializeApp, deleteApp } from 'firebase/app'
import { getFirestore, doc, writeBatch } from 'firebase/firestore'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Run: node --env-file=.env.local scripts/import-notion-log.mjs [uid]
const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
}

// Pass UID as first argument, or defaults to georgemedina7@aol.com
const USER_UID = process.argv[2] || 'KMmKMVmTLvWGIWaOQ3z33R3l99C3'

const MUSCLE_GROUP = {
  'ab-crunch-hammer':               'Abs',
  'ab-crunch-machine':              'Abs',
  'vertical-leg-raises':            'Abs',
  'cable-bicep-curl':               'Biceps',
  'ez-bar-curl':                    'Biceps',
  'lat-pulldown':                   'Biceps',
  'machine-bicep-curl':             'Biceps',
  'push-ups':                       'Biceps',
  'cable-face-pull':                'Triceps',
  'cable-overhead-triceps-extension': 'Triceps',
  'assisted-dips':                  'Triceps',
  'dips':                           'Triceps',
  'triceps-pushdown-machine':       'Triceps',
  'triceps-pull-down':              'Triceps',
  'cable-lateral-raise':            'Shoulders',
  'dumbbell-front-raises':          'Shoulders',
  'dumbbell-lateral-raise':         'Shoulders',
  'dumbbell-shoulder-press':        'Shoulders',
  'machine-shoulder-pulldown':      'Shoulders',
  'upright-row':                    'Shoulders',
  'bench-press-machine':            'Chest',
  'chest-press':                    'Chest',
  'dumbbell-bench-press':           'Chest',
  'incline-bench-press':            'Chest',
  'incline-press-machine':          'Chest',
  'machine-fly':                    'Chest',
  'cable-row':                      'Back',
  'dead-hang':                      'Back',
  'seated-back-extension':          'Back',
  'seated-row':                     'Back',
  'wall-sit':                       'Back',
  'calf-extension':                 'Legs',
  'calf-raise':                     'Legs',
  'hamstring-curls':                'Legs',
  'leg-extension':                  'Legs',
  'leg-press':                      'Legs',
  'leg-press-machine':              'Legs',
  'outer-thigh':                    'Legs',
  'squat':                          'Legs',
  'step-ups':                       'Legs',
  'bridge':                         'Glutes',
  'deadlift':                       'Glutes',
  'glute-machine':                  'Glutes',
  'hip-abductor':                   'Glutes',
  'hip-thrust':                     'Glutes',
  'single-leg-glute-bridge':        'Glutes',
  'smith-machine-squat':            'Glutes',
  'stair-climber':                  'Glutes',
  'sumo-squat':                     'Glutes',
  'walking-lunges':                 'Glutes',
  'elliptical-machine':             'Cardio',
  'fitness-bike':                   'Cardio',
  'walking':                        'Cardio',
  'walking-treadmill':              'Cardio',
  'sex':                            'Cardio',
  'hydro-massage-bed':              'Recovery',
}

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function parseCSVLine(line) {
  const result = []
  let cur = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  result.push(cur.trim())
  return result
}

function parseDate(dateStr) {
  const [datePart] = (dateStr || '').split(' ')
  const parts = datePart.split('/')
  if (parts.length !== 3) return null
  const [m, d, y] = parts
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseNumber(str) {
  return parseFloat((str || '').replace(/,/g, '')) || 0
}

function processCSV(text) {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r/g, '')
  const lines = clean.trim().split('\n')
  const rows = lines.slice(1).map(parseCSVLine)
  const sessionMap = {}

  for (const row of rows) {
    const machineName = row[0]
    const dateStr = row[1]
    if (!machineName || !dateStr) continue

    const date = parseDate(dateStr)
    if (!date) continue

    const exerciseId = toSlug(machineName)
    const key = `${exerciseId}--${date}`

    if (!sessionMap[key]) {
      sessionMap[key] = {
        docId: key,
        exerciseId,
        exerciseName: machineName,
        muscleGroup: MUSCLE_GROUP[exerciseId] || '',
        routineId: '',
        routineName: '',
        date,
        sets: [],
        totalVolume: 0,
        createdAt: new Date(date).toISOString(),
        updatedAt: new Date(date).toISOString(),
        source: 'notion-import',
      }
    }

    const reps    = parseNumber(row[6])
    const numSets = Math.max(parseNumber(row[7]), 1)
    const weight  = parseNumber(row[10])
    const time    = parseNumber(row[8])

    for (let i = 0; i < numSets; i++) {
      const id = `${key}-${sessionMap[key].sets.length}`
      sessionMap[key].sets.push({ id, reps, weight, time })
    }
    sessionMap[key].totalVolume += reps * weight * numSets
  }

  return Object.values(sessionMap)
}

// ─── Main ────────────────────────────────────────────────────
const csvPath = join(__dirname, '..', 'Notion workout Log.csv')
const csvText = readFileSync(csvPath, 'utf8')
const sessions = processCSV(csvText)

console.log(`📊 Parsed ${sessions.length} sessions from CSV`)
console.log(`   Exercises: ${new Set(sessions.map(s => s.exerciseName)).size}`)
console.log(`   Days:      ${new Set(sessions.map(s => s.date)).size}`)
console.log(`   Writing to users/${USER_UID}/sessions/...\n`)

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const BATCH_SIZE = 200
let done = 0

for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
  const chunk = sessions.slice(i, i + BATCH_SIZE)
  const batch = writeBatch(db)
  for (const s of chunk) {
    const ref = doc(db, 'users', USER_UID, 'sessions', s.docId)
    const { docId, ...data } = s
    batch.set(ref, data)
  }
  await batch.commit()
  done += chunk.length
  const pct = Math.round((done / sessions.length) * 100)
  process.stdout.write(`\r   Progress: ${pct}% (${done}/${sessions.length})`)
}

console.log('\n\n✅ Import complete!')
await deleteApp(app)
process.exit(0)
