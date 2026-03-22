// src/pages/Profile.jsx
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from 'firebase/auth'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getDoc, getDocs, writeBatch } from 'firebase/firestore'
import { auth, db, storage } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { sanitizeProfileSettingsInput } from '../utils/profileSanitizers'
import {
  bodyMetricDoc,
  bodyMetricsCol,
  exerciseDoc,
  exercisesCol,
  prDoc,
  prsCol,
  routineDoc,
  routinesCol,
  sessionDoc,
  sessionsCol,
  setDoc_ as setEntryDoc,
  setsCol,
  userDoc,
} from '../firebase/collections'

const DATA_BACKUP_VERSION = 1
const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]
const FITNESS_GOAL_OPTIONS = [
  { value: 'lose_weight', label: 'Lose Weight' },
  { value: 'build_muscle', label: 'Build Muscle' },
  { value: 'overall_fitness', label: 'Overall Fitness' },
]
const DATA_COLLECTIONS = [
  { key: 'routines', getCollection: routinesCol, getDocRef: routineDoc },
  { key: 'exercises', getCollection: exercisesCol, getDocRef: exerciseDoc },
  { key: 'sessions', getCollection: sessionsCol, getDocRef: sessionDoc },
  { key: 'bodyMetrics', getCollection: bodyMetricsCol, getDocRef: bodyMetricDoc },
  { key: 'personalRecords', getCollection: prsCol, getDocRef: prDoc },
  { key: 'sets', getCollection: setsCol, getDocRef: setEntryDoc },
]

function serializeBackupValue(value) {
  if (value == null) return value
  if (Array.isArray(value)) return value.map(serializeBackupValue)
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      return { __fittrackType: 'timestamp', value: value.toDate().toISOString() }
    }
    if (value instanceof Date) {
      return { __fittrackType: 'date', value: value.toISOString() }
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, serializeBackupValue(nestedValue)])
    )
  }
  return value
}

function deserializeBackupValue(value) {
  if (value == null) return value
  if (Array.isArray(value)) return value.map(deserializeBackupValue)
  if (typeof value === 'object') {
    if (
      value.__fittrackType &&
      (value.__fittrackType === 'timestamp' || value.__fittrackType === 'date') &&
      typeof value.value === 'string'
    ) {
      return new Date(value.value)
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, deserializeBackupValue(nestedValue)])
    )
  }
  return value
}

async function commitBatchWrites(writes) {
  const chunkSize = 400
  for (let index = 0; index < writes.length; index += chunkSize) {
    const batch = writeBatch(db)
    writes.slice(index, index + chunkSize).forEach(({ ref, data }) => {
      batch.set(ref, data, { merge: true })
    })
    await batch.commit()
  }
}

export default function Profile() {
  const { user, profile, logout, updateUserProfile } = useAuth()
  const navigate = useNavigate()

  const displayName = profile?.displayName || user?.displayName || 'Athlete'
  const email = user?.email || ''
  const initials = displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  const photoURL = profile?.photoURL || user?.photoURL

  // Editable fields
  const [name, setName]           = useState(displayName)
  const [height, setHeight]       = useState(profile?.heightIn || '')
  const [weightUnit, setWeightUnit] = useState(profile?.weightUnit || 'lbs')
  const [sex, setSex]             = useState(profile?.sex || '')
  const [fitnessGoal, setFitnessGoal] = useState(profile?.fitnessGoal || '')
  const [birthday, setBirthday]   = useState(profile?.dateOfBirth || '')
  const [pushTarget, setPushTarget] = useState(profile?.weeklyTargets?.push ?? 27)
  const [pullTarget, setPullTarget] = useState(profile?.weeklyTargets?.pull ?? 15)
  const [legsTarget, setLegsTarget] = useState(profile?.weeklyTargets?.legs ?? 21)
  const [workoutGoal, setWorkoutGoal] = useState(profile?.weeklyWorkoutGoal ?? 3)
  const [volumeGoal, setVolumeGoal]   = useState(profile?.weeklyVolumeGoal ?? 100000)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)

  // File upload states
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingQr, setUploadingQr]       = useState(false)
  const [uploadError, setUploadError]       = useState(null)
  const [exportingData, setExportingData]   = useState(false)
  const [importingData, setImportingData]   = useState(false)
  const [transferStatus, setTransferStatus] = useState(null)
  const photoInputRef  = useRef(null)
  const qrInputRef     = useRef(null)
  const importInputRef = useRef(null)
  const savedTimerRef  = useRef(null)

  // Clean up the "Saved" badge timer on unmount
  useEffect(() => () => clearTimeout(savedTimerRef.current), [])

  useEffect(() => {
    setName(profile?.displayName || user?.displayName || 'Athlete')
    setHeight(profile?.heightIn ?? '')
    setWeightUnit(profile?.weightUnit || 'lbs')
    setSex(profile?.sex || '')
    setFitnessGoal(profile?.fitnessGoal || '')
    setBirthday(profile?.dateOfBirth || '')
    setPushTarget(profile?.weeklyTargets?.push ?? 27)
    setPullTarget(profile?.weeklyTargets?.pull ?? 15)
    setLegsTarget(profile?.weeklyTargets?.legs ?? 21)
    setWorkoutGoal(profile?.weeklyWorkoutGoal ?? 3)
    setVolumeGoal(profile?.weeklyVolumeGoal ?? 100000)
  }, [profile, user?.displayName])

  async function uploadFile(file, path) {
    const sRef = storageRef(storage, path)
    await uploadBytes(sRef, file)
    return getDownloadURL(sRef)
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files[0]
    if (!file || !user?.uid) return
    setUploadingPhoto(true)
    setUploadError(null)
    try {
      const url = await uploadFile(file, `users/${user.uid}/profile`)
      await updateProfile(auth.currentUser, { photoURL: url })
      await updateUserProfile({ photoURL: url })
    } catch {
      setUploadError('Photo upload failed. Make sure Firebase Storage is enabled.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleQrUpload(e) {
    const file = e.target.files[0]
    if (!file || !user?.uid) return
    setUploadingQr(true)
    setUploadError(null)
    try {
      const url = await uploadFile(file, `users/${user.uid}/gymQr`)
      await updateUserProfile({ gymQrUrl: url })
    } catch {
      setUploadError('QR upload failed. Make sure Firebase Storage is enabled.')
    } finally {
      setUploadingQr(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const sanitizedProfile = sanitizeProfileSettingsInput({
        displayName: name,
        heightIn: height,
        weightUnit,
        sex,
        fitnessGoal,
        dateOfBirth: birthday,
        weeklyTargets: {
          push: pushTarget,
          pull: pullTarget,
          legs: legsTarget,
        },
        weeklyWorkoutGoal: workoutGoal,
        weeklyVolumeGoal: volumeGoal,
      })
      const trimmedName = sanitizedProfile.displayName || displayName
      await updateUserProfile({
        displayName: trimmedName,
        heightIn: sanitizedProfile.heightIn,
        weightUnit: sanitizedProfile.weightUnit,
        sex: sanitizedProfile.sex,
        fitnessGoal: sanitizedProfile.fitnessGoal,
        dateOfBirth: sanitizedProfile.dateOfBirth,
        weeklyTargets: sanitizedProfile.weeklyTargets,
        weeklyWorkoutGoal: sanitizedProfile.weeklyWorkoutGoal,
        weeklyVolumeGoal: sanitizedProfile.weeklyVolumeGoal,
      })
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: trimmedName })
      }
      setName(trimmedName)
      setHeight(sanitizedProfile.heightIn)
      setWeightUnit(sanitizedProfile.weightUnit)
      setSex(sanitizedProfile.sex || '')
      setFitnessGoal(sanitizedProfile.fitnessGoal || '')
      setBirthday(sanitizedProfile.dateOfBirth || '')
      setPushTarget(sanitizedProfile.weeklyTargets.push)
      setPullTarget(sanitizedProfile.weeklyTargets.pull)
      setLegsTarget(sanitizedProfile.weeklyTargets.legs)
      setWorkoutGoal(sanitizedProfile.weeklyWorkoutGoal)
      setVolumeGoal(sanitizedProfile.weeklyVolumeGoal)
      setSaved(true)
      savedTimerRef.current = setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  function applyImportedProfile(profileData) {
    const sanitizedProfile = sanitizeProfileSettingsInput(profileData)
    setName(sanitizedProfile.displayName || displayName)
    setHeight(sanitizedProfile.heightIn ?? '')
    setWeightUnit(sanitizedProfile.weightUnit || 'lbs')
    setSex(sanitizedProfile.sex || '')
    setFitnessGoal(sanitizedProfile.fitnessGoal || '')
    setBirthday(sanitizedProfile.dateOfBirth || '')
    setPushTarget(sanitizedProfile.weeklyTargets.push)
    setPullTarget(sanitizedProfile.weeklyTargets.pull)
    setLegsTarget(sanitizedProfile.weeklyTargets.legs)
    setWorkoutGoal(sanitizedProfile.weeklyWorkoutGoal)
    setVolumeGoal(sanitizedProfile.weeklyVolumeGoal)
  }

  async function handleExportData() {
    if (!user?.uid) return
    setExportingData(true)
    setTransferStatus(null)

    try {
      const profileSnapshot = await getDoc(userDoc(user.uid))
      const collectionSnapshots = await Promise.all(
        DATA_COLLECTIONS.map(({ getCollection }) => getDocs(getCollection(user.uid)))
      )

      const payload = {
        meta: {
          app: 'fittrack-pro',
          version: DATA_BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          userUid: user.uid,
        },
        profile: serializeBackupValue(profileSnapshot.exists() ? profileSnapshot.data() : (profile || {})),
        collections: Object.fromEntries(
          DATA_COLLECTIONS.map((config, index) => [
            config.key,
            collectionSnapshots[index].docs.map((docSnapshot) => ({
              id: docSnapshot.id,
              data: serializeBackupValue(docSnapshot.data()),
            })),
          ])
        ),
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      link.href = url
      link.download = `fittrack-backup-${stamp}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      const totalDocs = Object.values(payload.collections).reduce((sum, docs) => sum + docs.length, 0)
      setTransferStatus({
        type: 'success',
        message: `Exported ${totalDocs} records to ${link.download}.`,
      })
    } catch (error) {
      console.error('Export data error:', error)
      setTransferStatus({
        type: 'error',
        message: 'Could not export your data. Please try again.',
      })
    } finally {
      setExportingData(false)
    }
  }

  async function handleImportData(event) {
    const file = event.target.files?.[0]
    if (!file || !user?.uid) return

    setTransferStatus(null)

    try {
      const payload = JSON.parse(await file.text())
      if (!payload || typeof payload !== 'object' || typeof payload.collections !== 'object') {
        throw new Error('Invalid backup file format.')
      }

      const confirmed = window.confirm(
        `Import data from "${file.name}"? Matching records will be overwritten. Records not in the file will be kept.`
      )
      if (!confirmed) return

      setImportingData(true)

      const writes = []
      let importedCount = 0

      DATA_COLLECTIONS.forEach(({ key, getDocRef }) => {
        const docs = Array.isArray(payload.collections[key]) ? payload.collections[key] : []
        docs.forEach((entry) => {
          if (!entry?.id || typeof entry.data !== 'object' || entry.data == null) return
          writes.push({
            ref: getDocRef(user.uid, entry.id),
            data: deserializeBackupValue(entry.data),
          })
          importedCount += 1
        })
      })

      if (writes.length > 0) {
        await commitBatchWrites(writes)
      }

      const importedProfile = payload.profile && typeof payload.profile === 'object'
        ? deserializeBackupValue(payload.profile)
        : null

      if (importedProfile) {
        const profileUpdates = { ...importedProfile }
        delete profileUpdates.uid
        delete profileUpdates.email
        delete profileUpdates.createdAt
        delete profileUpdates.updatedAt
        Object.assign(profileUpdates, sanitizeProfileSettingsInput(profileUpdates))

        await updateUserProfile(profileUpdates)

        const authUpdates = {}
        if (typeof profileUpdates.displayName === 'string') authUpdates.displayName = profileUpdates.displayName
        if (typeof profileUpdates.photoURL === 'string' || profileUpdates.photoURL === null) authUpdates.photoURL = profileUpdates.photoURL
        if (auth.currentUser && Object.keys(authUpdates).length > 0) {
          await updateProfile(auth.currentUser, authUpdates)
        }

        applyImportedProfile(profileUpdates)
      }

      setTransferStatus({
        type: 'success',
        message: `Imported ${importedCount} records from ${file.name}. Matching records were updated.`,
      })
    } catch (error) {
      console.error('Import data error:', error)
      setTransferStatus({
        type: 'error',
        message: 'Could not import that backup file. Make sure it is a valid FitTrack JSON export.',
      })
    } finally {
      event.target.value = ''
      setImportingData(false)
    }
  }

  const todayIso = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 10)

  return (
    <div className="min-h-dvh bg-bg flex flex-col">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2 flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center active:scale-95 transition-transform"
        >
          <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="font-display text-xl font-bold text-text-primary">Profile</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-5">

        {/* ── Avatar ─────────────────────────────────────────── */}
        <div className="flex flex-col items-center pt-4 pb-2">
          <button
            onClick={() => photoInputRef.current?.click()}
            className="relative w-24 h-24 rounded-3xl active:scale-95 transition-transform"
          >
            {photoURL ? (
              <img src={photoURL} alt="Profile" loading="lazy" decoding="async" className="w-24 h-24 rounded-3xl object-cover" />
            ) : (
              <div className="w-24 h-24 rounded-3xl bg-accent flex items-center justify-center">
                <span className="text-white text-3xl font-bold font-display">{initials}</span>
              </div>
            )}
            {/* Edit overlay */}
            <div className="absolute inset-0 rounded-3xl bg-black/45 flex items-center justify-center">
              {uploadingPhoto ? (
                <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                </svg>
              )}
            </div>
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          <p className="text-text-secondary text-xs mt-2">Tap to change photo</p>
          <p className="text-text-primary font-semibold mt-1">{displayName}</p>
          <p className="text-text-secondary text-sm">{email}</p>
        </div>

        {/* ── Upload error ───────────────────────────────────── */}
        {uploadError && (
          <div className="card border border-red-500/30 flex items-start gap-2 py-3">
            <svg className="w-4 h-4 text-accent-red flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-accent-red text-xs flex-1">{uploadError}</p>
            <button onClick={() => setUploadError(null)} className="text-text-secondary text-xs flex-shrink-0">X</button>
          </div>
        )}

        {/* ── Profile + Preferences ──────────────────────────── */}
        <div>
          <p className="section-title">Profile & Preferences</p>
          <div className="card space-y-4">
            {/* Display name */}
            <div>
              <label className="label">Display Name</label>
              <input
                type="text"
                className="input"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-text-secondary text-xs mt-1">Shown on your dashboard greeting</p>
            </div>

            {/* Height */}
            <div>
              <label className="label">Height</label>
              <input
                type="text"
                className="input"
                placeholder='e.g. 70 (inches) or 177 (cm)'
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Birthday</label>
              <input
                type="date"
                className="input"
                value={birthday}
                max={todayIso}
                onChange={(e) => setBirthday(e.target.value)}
              />
              <p className="text-text-secondary text-xs mt-1">Used for AI summaries and recommendations</p>
            </div>

            <div>
              <label className="label">Sex</label>
              <div className="grid grid-cols-2 gap-2">
                {SEX_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSex(option.value)}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                      sex === option.value
                        ? 'bg-accent border-accent text-white'
                        : 'bg-surface2 border-surface2 text-text-secondary'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Workout Goal</label>
              <div className="grid grid-cols-1 gap-2">
                {FITNESS_GOAL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFitnessGoal(option.value)}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                      fitnessGoal === option.value
                        ? 'bg-accent border-accent text-white'
                        : 'bg-surface2 border-surface2 text-text-secondary'
                    }`}
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-text-secondary text-xs mt-1">We&apos;ll use this to personalize the app later</p>
            </div>

            {/* Weight unit */}
            <div>
              <label className="label">Weight Unit</label>
              <div className="flex gap-2">
                {['lbs', 'kg'].map((u) => (
                  <button
                    key={u}
                    onClick={() => setWeightUnit(u)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                      weightUnit === u
                        ? 'bg-accent border-accent text-white'
                        : 'bg-surface2 border-surface2 text-text-secondary'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary w-full"
            >
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
            </button>
          </div>
        </div>


        {/* ── Weekly Set Targets ─────────────────────────────── */}
        <div>
          <p className="section-title">Weekly Set Targets</p>
          <div className="card space-y-4">
            <p className="text-text-secondary text-xs">
              Set your weekly set targets and workout volume target. These goals appear on your Dashboard and Recovery tab.
            </p>
            {[
              { label: 'Push (Chest - Shoulders - Triceps)', value: pushTarget, set: setPushTarget },
              { label: 'Pull (Back - Biceps)', value: pullTarget, set: setPullTarget },
              { label: 'Legs (Quads - Hamstrings - Glutes)', value: legsTarget, set: setLegsTarget },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="label">{label}</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => set(v => Math.max(1, Number(v) - 1))}
                    className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center text-text-primary font-bold active:scale-95 transition-transform flex-shrink-0"
                  >-</button>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    className="input text-center flex-1"
                    value={value}
                    onChange={e => set(e.target.value)}
                  />
                  <button
                    onClick={() => set(v => Math.min(99, Number(v) + 1))}
                    className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center text-text-primary font-bold active:scale-95 transition-transform flex-shrink-0"
                  >+</button>
                </div>
              </div>
            ))}
            <div>
              <label className="label">Workout Days per Week</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setWorkoutGoal(v => Math.max(1, Number(v) - 1))}
                  className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center text-text-primary font-bold active:scale-95 transition-transform flex-shrink-0"
                >-</button>
                <input
                  type="number"
                  min="1"
                  max="7"
                  className="input text-center flex-1"
                  value={workoutGoal}
                  onChange={e => setWorkoutGoal(e.target.value)}
                />
                <button
                  onClick={() => setWorkoutGoal(v => Math.min(7, Number(v) + 1))}
                  className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center text-text-primary font-bold active:scale-95 transition-transform flex-shrink-0"
                >+</button>
              </div>
              <p className="text-text-secondary text-xs mt-1">Shown as X / {Number(workoutGoal) || 3} days on the Log tab</p>
            </div>
            <div>
              <label className="label">Workout Volume Target Goal</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setVolumeGoal(v => Math.max(10000, Number(v) - 5000))}
                  className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center text-text-primary font-bold active:scale-95 transition-transform flex-shrink-0"
                >-</button>
                <div className="input flex-1 text-center flex items-center justify-center">
                  <span className="text-text-primary font-semibold">
                    {Number(volumeGoal) >= 1000 ? `${Math.round(Number(volumeGoal) / 1000)}k` : Number(volumeGoal)} lbs
                  </span>
                </div>
                <button
                  onClick={() => setVolumeGoal(v => Number(v) + 5000)}
                  className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center text-text-primary font-bold active:scale-95 transition-transform flex-shrink-0"
                >+</button>
              </div>
              <p className="text-text-secondary text-xs mt-1">Fills the Dashboard volume ring toward this target in 5k steps.</p>
            </div>
            <p className="text-text-secondary text-xs">
              Sets total: <span className="text-text-primary font-semibold">{(Number(pushTarget) || 0) + (Number(pullTarget) || 0) + (Number(legsTarget) || 0)} sets/week</span>
            </p>
          </div>
        </div>

        {/* ── Gym QR Code ────────────────────────────────────── */}
        <div>
          <p className="section-title">Gym QR Code</p>
          <div className="card space-y-3">
            <p className="text-text-secondary text-xs">
              Upload your gym membership QR code. Tap the QR icon in the top bar to show it at the front desk.
            </p>

            {profile?.gymQrUrl ? (
              <div className="flex flex-col items-center gap-3">
                <div className="bg-white rounded-2xl p-3">
                  <img src={profile.gymQrUrl} alt="Gym QR" loading="lazy" decoding="async" className="w-48 h-48 object-contain" />
                </div>
                <button
                  onClick={() => qrInputRef.current?.click()}
                  disabled={uploadingQr}
                  className="btn-secondary text-sm px-5 py-2"
                >
                  {uploadingQr ? 'Uploading...' : 'Replace QR Code'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => qrInputRef.current?.click()}
                disabled={uploadingQr}
                className="w-full border-2 border-dashed border-surface2 rounded-2xl py-10 flex flex-col items-center gap-2 active:scale-95 transition-transform"
              >
                {uploadingQr ? (
                  <svg className="w-7 h-7 text-text-secondary animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : (
                  <>
                    {/* QR code icon */}
                    <svg className="w-10 h-10 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75V16.5zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 18.75h.75v.75h-.75v-.75zM18.75 13.5h.75v.75h-.75v-.75zM18.75 18.75h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75V16.5z" />
                    </svg>
                    <p className="text-text-secondary text-sm font-medium">Upload QR Code</p>
                    <p className="text-text-secondary text-xs">Photo from camera roll</p>
                  </>
                )}
              </button>
            )}
            <input ref={qrInputRef} type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />
          </div>
        </div>
        <div>
          <p className="section-title">Data Backup</p>
          <div className="card space-y-4">
            <p className="text-text-secondary text-xs leading-relaxed">
              Export a JSON backup of your profile, routines, exercises, sessions, and body metrics. Import restores matching records without deleting anything already in your account.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleExportData}
                disabled={exportingData || importingData}
                className="btn-secondary w-full disabled:opacity-50"
              >
                {exportingData ? 'Exporting...' : 'Export Data'}
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={exportingData || importingData}
                className="btn-primary w-full disabled:opacity-50"
              >
                {importingData ? 'Importing...' : 'Import Data'}
              </button>
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportData}
            />
            {transferStatus && (
              <div className={`rounded-2xl border px-3 py-2.5 text-xs ${
                transferStatus.type === 'error'
                  ? 'border-red-500/30 bg-red-500/10 text-accent-red'
                  : 'border-accent-green/30 bg-accent-green/10 text-accent-green'
              }`}>
                {transferStatus.message}
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="section-title mb-0">AI Features</p>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-green bg-accent-green/10 border border-accent-green/20 px-2.5 py-1 rounded-full">
              Server Protected
            </span>
          </div>
          <div className="card">
            <p className="text-text-secondary text-xs leading-relaxed">
              AI reports and scan tools run through the app server, so provider secrets stay on the backend and never live in your profile or app bundle.
            </p>
          </div>
        </div>

        {/* Sign Out */}
        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-xl border border-red-500/30 text-accent-red font-semibold text-sm active:scale-95 transition-transform"
        >
          Sign Out
        </button>

      </div>
    </div>
  )
}

