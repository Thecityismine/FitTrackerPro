// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase/config'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)           // unblock UI immediately — don't wait for Firestore
      if (firebaseUser) {
        loadProfile(firebaseUser.uid).catch((e) => {
          console.error('loadProfile error:', e)
        })
      } else {
        setProfile(null)
      }
    })
    return unsub
  }, [])

  async function loadProfile(uid) {
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      setProfile(snap.data())
    }
  }

  async function createUserProfile(uid, data) {
    const ref = doc(db, 'users', uid)
    const profileData = {
      uid,
      displayName: data.displayName || '',
      email: data.email || '',
      photoURL: data.photoURL || null,
      heightIn: null,       // inches — used for BMI
      weightUnit: 'lbs',    // 'lbs' | 'kg'
      dateOfBirth: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await setDoc(ref, profileData, { merge: true })
    setProfile(profileData)
    return profileData
  }

  async function signInWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider)
    const { user } = result
    // Create profile doc if first time
    const ref = doc(db, 'users', user.uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await createUserProfile(user.uid, {
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
      })
    } else {
      setProfile(snap.data())
    }
    return user
  }

  async function signInWithEmail(email, password) {
    const result = await signInWithEmailAndPassword(auth, email, password)
    return result.user
  }

  async function signUpWithEmail(email, password, displayName) {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(result.user, { displayName })
    await createUserProfile(result.user.uid, {
      displayName,
      email,
    })
    return result.user
  }

  async function logout() {
    await signOut(auth)
    setProfile(null)
  }

  async function updateUserProfile(updates) {
    if (!user) return
    const ref = doc(db, 'users', user.uid)
    await setDoc(ref, { ...updates, updatedAt: serverTimestamp() }, { merge: true })
    setProfile((prev) => ({ ...prev, ...updates }))
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      logout,
      updateUserProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
