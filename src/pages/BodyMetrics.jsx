// src/pages/BodyMetrics.jsx
import { useState, useEffect, useRef } from 'react'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import PageWrapper from '../components/layout/PageWrapper'
import { useAuth } from '../context/AuthContext'
import { bodyMetricsCol, sessionsCol } from '../firebase/collections'

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
function MetricCard({ label, value, unit, delta, lowerIsBetter, note }) {
  return (
    <div className="bg-surface rounded-2xl p-3 border border-surface2">
      <p className="text-text-secondary text-xs leading-tight mb-1.5">{label}</p>
      <div className="flex items-baseline gap-1 flex-wrap">
        <span className={`font-display text-xl font-bold ${value != null ? 'text-white' : 'text-surface2'}`}>
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

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcessingPhoto(true)
    try { setPhoto(await compressImage(file)) }
    catch { alert('Could not process photo. Try a smaller image.') }
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
                  <img src={photo} alt="Preview" className="w-full h-36 object-cover rounded-xl" />
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
                <img src={lastMonthPhoto} alt="Last month" className="w-full h-40 object-cover rounded-xl" />
              </button>
            ) : (
              <div className="w-full h-40 bg-surface2 rounded-xl flex items-center justify-center">
                <p className="text-text-secondary text-xs text-center px-2">No photo last month</p>
              </div>
            )}
          </div>
          {/* This Month — RIGHT */}
          <div>
            <p className="text-text-secondary text-xs font-semibold mb-1 text-center">This Month</p>
            {thisMonthPhoto ? (
              <button onClick={() => setExpanded({ src: thisMonthPhoto, label: 'This Month' })}
                className="w-full active:scale-95 transition-transform">
                <img src={thisMonthPhoto} alt="This month" className="w-full h-40 object-cover rounded-xl" />
              </button>
            ) : (
              <div className="w-full h-40 bg-surface2 rounded-xl flex items-center justify-center">
                <p className="text-text-secondary text-xs text-center px-2">Add a photo when logging</p>
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
            className="max-w-full max-h-[80dvh] object-contain rounded-2xl px-4"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

// ── AI Monthly Report Card ─────────────────────────────────
function AiReportCard({ entries, sessions }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

  async function generateReport() {
    if (!apiKey) {
      setError('Add VITE_ANTHROPIC_API_KEY to your Vercel environment variables to enable AI reports.')
      return
    }
    setLoading(true)
    setError(null)

    const thirtyDaysAgo = format(subMonths(new Date(), 1), 'yyyy-MM-dd')
    const recentSessions = sessions.filter(s => s.date >= thirtyDaysAgo)
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
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message)
      setReport(data.content?.[0]?.text ?? 'No response received.')
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
          <p className="section-title mb-0">AI Monthly Report</p>
          <p className="text-text-secondary text-xs mt-0.5">Progress analysis + recommendations</p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
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
          <button onClick={() => { setReport(null); generateReport() }} className="text-accent text-xs font-semibold mt-2">
            Regenerate
          </button>
        </div>
      ) : (
        <button onClick={generateReport} disabled={loading} className="btn-primary w-full disabled:opacity-50">
          {loading ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analyzing your data…
            </span>
          ) : 'Generate Report'}
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
  const [scanning, setScanning] = useState(false)
  const scanInputRef = useRef(null)

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

  useEffect(() => {
    if (!user?.uid) return
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
      .catch(() => setLoading(false))
  }, [user?.uid])

  const latest = entries[0]
  const previous = entries[1]

  function delta(key) {
    if (latest?.[key] == null || previous?.[key] == null) return null
    return parseFloat((latest[key] - previous[key]).toFixed(1))
  }

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

    if (!apiKey) {
      alert('Add VITE_ANTHROPIC_API_KEY to your Vercel environment variables to enable scan.')
      return
    }

    setScanning(true)
    try {
      const compressed = await compressImage(file, 1400, 0.85)
      const b64data = compressed.split(',')[1]

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: b64data },
              },
              {
                type: 'text',
                text: `Extract all body metrics from this smart scale screenshot. Return ONLY a valid JSON object with these exact keys (use null for any value not found):
{"weight":null,"bodyFat":null,"bmi":null,"muscleMassLbs":null,"visceralFat":null,"bodyWater":null,"subcutaneousFat":null,"skeletalMuscle":null,"boneMass":null,"fatFreeBodyWeight":null,"bmr":null,"protein":null,"metabolicAge":null}
Notes: weight/boneMass/fatFreeBodyWeight/muscleMassLbs are in lbs; bodyFat/bodyWater/subcutaneousFat/skeletalMuscle/protein are percentages; bmr is kcal; metabolicAge is years; visceralFat is a score.`,
              },
            ],
          }],
        }),
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error.message)
      const text = data.content?.[0]?.text ?? ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Could not parse metrics from photo.')
      const metrics = JSON.parse(jsonMatch[0])
      // Filter out nulls so prefillData only has actual values
      const filled = Object.fromEntries(Object.entries(metrics).filter(([, v]) => v != null))
      setPrefillData(filled)
      setShowLog(true)
    } catch (err) {
      alert(`Scan failed: ${err.message || 'Try a clearer screenshot.'}`)
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
    <PageWrapper showHeader={false}>
      <div className="px-4 pt-4 space-y-4 pb-6">

        {/* Header */}
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Body Metrics</h1>
          <p className="text-text-secondary text-sm mt-0.5">Track your body composition</p>
        </div>

        {/* Weight history chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="section-title mb-0">Weight History</p>
            {latest?.weight && (
              <p className="text-text-secondary text-sm">
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
                  fill="url(#weightGrad)" dot={{ fill: '#1A56DB', r: 3, strokeWidth: 0 }} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-32 flex items-center justify-center">
              <p className="text-text-secondary text-sm">Log your first weight entry</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <input ref={scanInputRef} type="file" accept="image/*" className="hidden" onChange={handleScanPhoto} />
        <div className="flex gap-2">
          <button
            onClick={() => { setPrefillData(null); setShowLog(true) }}
            className="flex-1 flex items-center justify-center gap-2 bg-surface border border-surface2 rounded-xl px-4 py-3 text-text-primary text-sm font-semibold active:scale-95 transition-transform"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Log Manually
          </button>
          <button
            onClick={() => scanInputRef.current?.click()}
            disabled={scanning}
            className="flex-1 flex items-center justify-center gap-2 btn-primary disabled:opacity-50"
          >
            {scanning ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scanning…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Scan Scale Photo
              </>
            )}
          </button>
        </div>

        {/* Metric cards grid */}
        <div>
          <p className="section-title">Body Profile</p>
          {loading ? (
            <div className="grid grid-cols-3 gap-2">
              {[...Array(12)].map((_, i) => <div key={i} className="rounded-2xl h-16 animate-pulse bg-surface2" />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <MetricCard label="Weight" value={latest?.weight} unit="lb"
                delta={delta('weight')} lowerIsBetter={false} />
              <MetricCard label="Body Fat" value={latest?.bodyFat} unit="%"
                delta={delta('bodyFat')} lowerIsBetter={true} />
              <MetricCard label="BMI" value={latest?.bmi}
                delta={delta('bmi')} lowerIsBetter={true}
                note={latest?.bmi ? bmiLabel(latest.bmi) : null} />
              <MetricCard label="Muscle Mass" value={latest?.muscleMassLbs} unit="lb"
                delta={delta('muscleMassLbs')} lowerIsBetter={false} />
              <MetricCard label="Visceral Fat" value={latest?.visceralFat}
                delta={delta('visceralFat')} lowerIsBetter={true} />
              <MetricCard label="Body Water" value={latest?.bodyWater} unit="%"
                delta={delta('bodyWater')} lowerIsBetter={false} />
              <MetricCard label="Skeletal Muscle" value={latest?.skeletalMuscle} unit="%"
                delta={delta('skeletalMuscle')} lowerIsBetter={false} />
              <MetricCard label="Subcut. Fat" value={latest?.subcutaneousFat} unit="%"
                delta={delta('subcutaneousFat')} lowerIsBetter={true} />
<MetricCard label="Fat-Free Wt" value={latest?.fatFreeBodyWeight} unit="lb"
                delta={delta('fatFreeBodyWeight')} lowerIsBetter={false} />
              <MetricCard label="BMR" value={latest?.bmr} unit="kcal"
                delta={delta('bmr')} lowerIsBetter={false} />
              <MetricCard label="Protein" value={latest?.protein} unit="%"
                delta={delta('protein')} lowerIsBetter={false} />
              <MetricCard label="Metabolic Age" value={latest?.metabolicAge} unit="yr"
                delta={delta('metabolicAge')} lowerIsBetter={true} />
            </div>
          )}
        </div>

        {/* Progress photos */}
        {entries.some(e => e.photoBase64) && (
          <ProgressPhotoCard entries={entries} />
        )}

        {/* AI Monthly Report */}
        <AiReportCard entries={entries} sessions={sessions} />

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
