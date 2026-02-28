// src/pages/ImportPage.jsx
// One-time import of Notion workout CSV → Firestore sessions
// Visit /import while logged in, upload the CSV, done.
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'

// Maps Notion machine name slug → muscle group
const MUSCLE_GROUP = {
  'ab-crunch-hammer':               'Abs',
  'ab-crunch-machine':              'Abs',
  'cable-bicep-curl':               'Biceps',
  'cable-face-pull':                'Triceps',
  'cable-lateral-raise':            'Shoulders',
  'cable-overhead-triceps-extension': 'Triceps',
  'cable-row':                      'Back',
  'calf-extension':                 'Legs',
  'calf-raise':                     'Legs',
  'chest-press':                    'Chest',
  'dead-hang':                      'Back',
  'dips':                           'Triceps',
  'dumbbell-lateral-raise':         'Shoulders',
  'dumbbell-shoulder-press':        'Shoulders',
  'ez-bar-curl':                    'Biceps',
  'fitness-bike':                   'Cardio',
  'hamstring-curls':                'Legs',
  'hip-thrust':                     'Glutes',
  'hydro-massage-bed':              'Recovery',
  'incline-bench-press':            'Chest',
  'incline-press-machine':          'Chest',
  'lat-pulldown':                   'Biceps',
  'leg-extension':                  'Legs',
  'leg-press':                      'Legs',
  'machine-fly':                    'Chest',
  'machine-shoulder-pulldown':      'Shoulders',
  'push-ups':                       'Biceps',
  'seated-back-extension':          'Back',
  'seated-row':                     'Back',
  'sex':                            'Cardio',
  'squat':                          'Legs',
  'triceps-pushdown-machine':       'Triceps',
  'upright-row':                    'Shoulders',
  'walking':                        'Cardio',
  'wall-sit':                       'Back',
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
  // "5/9/2025 8:39" → "2025-05-09"
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
  // columns: Machine, Date, HeartRate, IsCurrentYear, Miles, MultiSelect, Reps, Sets, Time, Volume, Weight, Year
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

    const reps = parseNumber(row[6])
    const numSets = Math.max(parseNumber(row[7]), 1)
    const weight = parseNumber(row[10])
    const time = parseNumber(row[8])

    // Expand grouped sets into individual set rows
    for (let i = 0; i < numSets; i++) {
      const id = `${key}-${sessionMap[key].sets.length}`
      sessionMap[key].sets.push({ id, reps, weight, time })
    }
    sessionMap[key].totalVolume += reps * weight * numSets
  }

  return Object.values(sessionMap)
}

export default function ImportPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [preview, setPreview] = useState(null)   // { sessions, exercises, days }
  const [sessions, setSessions] = useState([])
  const [status, setStatus] = useState('idle')   // idle | ready | importing | done | error
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = processCSV(ev.target.result)
        const exercises = new Set(parsed.map((s) => s.exerciseName)).size
        const days = new Set(parsed.map((s) => s.date)).size
        setSessions(parsed)
        setPreview({ total: parsed.length, exercises, days })
        setStatus('ready')
      } catch (err) {
        setErrorMsg(err.message)
        setStatus('error')
      }
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!user || sessions.length === 0) return
    setStatus('importing')
    setProgress(0)

    const BATCH_SIZE = 200
    let done = 0

    try {
      for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
        const chunk = sessions.slice(i, i + BATCH_SIZE)
        const batch = writeBatch(db)
        for (const s of chunk) {
          const ref = doc(db, 'users', user.uid, 'sessions', s.docId)
          const { docId, ...data } = s
          batch.set(ref, data)
        }
        await batch.commit()
        done += chunk.length
        setProgress(Math.round((done / sessions.length) * 100))
      }
      setStatus('done')
    } catch (err) {
      console.error('Import error:', err)
      setErrorMsg(err.code === 'permission-denied'
        ? 'Permission denied — make sure you are logged in.'
        : err.message || 'Unknown error. Check console for details.')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2 border-b border-surface2">
        <button
          onClick={() => navigate('/')}
          className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center active:scale-95 transition-transform"
        >
          <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div>
          <h1 className="font-display text-lg font-bold text-text-primary">Import Notion Log</h1>
          <p className="text-text-secondary text-xs">One-time CSV import into Firestore</p>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 space-y-5">

        {/* Step 1 — Pick file */}
        {status === 'idle' && (
          <div
            className="card border-2 border-dashed border-surface2 flex flex-col items-center justify-center py-12 gap-4 cursor-pointer active:border-accent transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-text-primary font-semibold">Tap to select CSV file</p>
              <p className="text-text-secondary text-sm mt-1">Notion workout Log.csv</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>
        )}

        {/* Step 2 — Preview */}
        {status === 'ready' && preview && (
          <>
            <div className="card space-y-3">
              <p className="section-title">Ready to Import</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Sessions', value: preview.total },
                  { label: 'Exercises', value: preview.exercises },
                  { label: 'Days', value: preview.days },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-surface2 rounded-xl p-3 text-center">
                    <p className="font-display text-2xl font-bold text-accent">{value}</p>
                    <p className="text-text-secondary text-xs mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-text-secondary text-xs">
                Sessions are keyed by exercise + date — re-importing is safe and won't create duplicates.
              </p>
            </div>

            <button onClick={handleImport} className="btn-primary w-full py-3.5 text-base">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 3v13.5m0 0l-4.5-4.5M12 16.5l4.5-4.5" />
              </svg>
              Import {preview.total} Sessions
            </button>

            <button
              onClick={() => { setStatus('idle'); setPreview(null); setSessions([]) }}
              className="btn-secondary w-full"
            >
              Choose Different File
            </button>
          </>
        )}

        {/* Step 3 — Importing */}
        {status === 'importing' && (
          <div className="card flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
              <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-text-primary font-semibold">Importing…</p>
              <p className="text-text-secondary text-sm mt-1">{progress}% complete</p>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-surface2 rounded-full h-2">
              <div
                className="bg-accent h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Step 4 — Done */}
        {status === 'done' && (
          <div className="card flex flex-col items-center justify-center py-12 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-accent-green/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <p className="text-text-primary font-semibold text-lg">Import Complete!</p>
              <p className="text-text-secondary text-sm mt-1">
                {preview?.total} sessions imported from your Notion log.
              </p>
            </div>
            <button onClick={() => navigate('/')} className="btn-primary px-8">
              Go to Dashboard
            </button>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="card border border-red-500/30 bg-red-500/10">
            <p className="text-accent-red font-semibold">Import failed</p>
            <p className="text-text-secondary text-sm mt-1">{errorMsg}</p>
            <button onClick={() => setStatus('idle')} className="btn-secondary mt-4">Try Again</button>
          </div>
        )}

      </div>
    </div>
  )
}
