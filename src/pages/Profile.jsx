// src/pages/Profile.jsx
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from 'firebase/auth'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, storage } from '../firebase/config'
import { useAuth } from '../context/AuthContext'

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
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)

  // File upload states
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingQr, setUploadingQr]       = useState(false)
  const [uploadError, setUploadError]       = useState(null)
  const photoInputRef = useRef(null)
  const qrInputRef    = useRef(null)

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
    } catch (err) {
      console.error('Photo upload failed:', err)
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
    } catch (err) {
      console.error('QR upload failed:', err)
      setUploadError('QR upload failed. Make sure Firebase Storage is enabled.')
    } finally {
      setUploadingQr(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const trimmedName = name.trim() || displayName
      await updateUserProfile({ displayName: trimmedName, heightIn: height, weightUnit })
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: trimmedName })
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/')
  }

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
              <img src={photoURL} alt="Profile" className="w-24 h-24 rounded-3xl object-cover" />
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
            <button onClick={() => setUploadError(null)} className="text-text-secondary text-xs flex-shrink-0">✕</button>
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
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
            </button>
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
                  <img src={profile.gymQrUrl} alt="Gym QR" className="w-48 h-48 object-contain" />
                </div>
                <button
                  onClick={() => qrInputRef.current?.click()}
                  disabled={uploadingQr}
                  className="btn-secondary text-sm px-5 py-2"
                >
                  {uploadingQr ? 'Uploading…' : 'Replace QR Code'}
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

        {/* ── Sign Out ───────────────────────────────────────── */}
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
