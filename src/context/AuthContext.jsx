// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, appleProvider, db, functions, googleProvider } from '../firebase/config'
import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { sanitizeDisplayName, sanitizeEmail } from '../utils/profileSanitizers'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)

  // Track the UID that was active when the listener was last evaluated
  const activeUidRef = useRef(undefined)

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      const prevUid = activeUidRef.current
      const nextUid = firebaseUser?.uid ?? null
      activeUidRef.current = nextUid

      // If a DIFFERENT user session is being restored mid-session (e.g. cached
      // auth from a previous account on this device), force a full page reload
      // so no stale Firestore data or React state bleeds into the new session.
      if (prevUid !== undefined && prevUid !== null && nextUid && prevUid !== nextUid) {
        window.location.reload()
        return
      }

      setUser(firebaseUser)
      setLoading(false)           // unblock UI immediately — don't wait for Firestore
      if (firebaseUser) {
        setProfileLoading(true)
        loadProfile(firebaseUser.uid)
          .catch(() => {})
          .finally(() => setProfileLoading(false))
      } else {
        setProfile(null)
        setProfileLoading(false)
      }
    })
    return unsub
  }, [])

  async function loadProfile(uid) {
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      setProfile(snap.data())
    } else {
      setProfile(null)
    }
  }

  async function createUserProfile(uid, data) {
    const ref = doc(db, 'users', uid)
    const displayName = sanitizeDisplayName(data.displayName) || 'Athlete'
    const email = sanitizeEmail(data.email)
    const profileData = {
      uid,
      displayName,
      email,
      photoURL: data.photoURL || null,
      heightIn: null,       // inches — used for BMI
      weightUnit: 'lbs',    // 'lbs' | 'kg'
      sex: null,
      fitnessGoal: null,
      dateOfBirth: null,
      setupComplete: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await setDoc(ref, profileData, { merge: true })
    setProfile(profileData)
    setProfileLoading(false)
    return profileData
  }

  // Shared by federated sign-in flows (Google, Apple): create the profile doc
  // if this is the user's first sign-in, otherwise load the existing one.
  async function loadOrCreateFederatedProfile(user) {
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
      setProfileLoading(false)
    }
    return user
  }

  async function signInWithGoogle() {
    let user

    if (Capacitor.isNativePlatform()) {
      // Native (iOS / Android): use the Capacitor Firebase plugin which
      // invokes the platform's native Google Sign In sheet — signInWithPopup
      // does not work inside a WebView.
      const { credential: nativeCredential } = await FirebaseAuthentication.signInWithGoogle()
      const googleCredential = GoogleAuthProvider.credential(nativeCredential?.idToken)
      const result = await signInWithCredential(auth, googleCredential)
      user = result.user
    } else {
      // Web: existing popup flow
      const result = await signInWithPopup(auth, googleProvider)
      user = result.user
    }

    return loadOrCreateFederatedProfile(user)
  }

  async function signInWithApple() {
    let user

    if (Capacitor.isNativePlatform()) {
      // Native (iOS): invokes the platform's native Sign in with Apple sheet.
      // Requires the "Sign in with Apple" capability enabled in Xcode and an
      // Apple Services ID configured as an OAuth provider in Firebase Console.
      const { credential: nativeCredential } = await FirebaseAuthentication.signInWithApple()
      const appleCredential = appleProvider.credential({
        idToken: nativeCredential?.idToken,
        rawNonce: nativeCredential?.nonce,
      })
      const result = await signInWithCredential(auth, appleCredential)
      user = result.user
    } else {
      // Web: OAuth popup flow — requires Apple enabled as a sign-in provider
      // in Firebase Console (Authentication > Sign-in method > Apple).
      const result = await signInWithPopup(auth, appleProvider)
      user = result.user
    }

    return loadOrCreateFederatedProfile(user)
  }

  async function signInWithEmail(email, password) {
    const result = await signInWithEmailAndPassword(auth, sanitizeEmail(email), password)
    return result.user
  }

  async function signUpWithEmail(email, password, displayName) {
    const cleanEmail = sanitizeEmail(email)
    const cleanDisplayName = sanitizeDisplayName(displayName) || 'Athlete'
    const result = await createUserWithEmailAndPassword(auth, cleanEmail, password)
    await updateProfile(result.user, { displayName: cleanDisplayName })
    await createUserProfile(result.user.uid, {
      displayName: cleanDisplayName,
      email: cleanEmail,
    })
    return result.user
  }

  async function resetPassword(email) {
    await sendPasswordResetEmail(auth, sanitizeEmail(email))
  }

  async function logout() {
    await signOut(auth)
    // Full page reload clears Firebase SDK memory cache, React state, and any
    // module-level data — ensures the next login starts from a clean slate.
    window.location.replace('/login')
  }

  async function deleteAccount() {
    const deleteAccountFn = httpsCallable(functions, 'deleteAccount')
    await deleteAccountFn()
    // The Auth user no longer exists server-side; sign out locally and reload
    // to clear all cached Firebase/React state, same as logout().
    await signOut(auth).catch(() => {})
    window.location.replace('/login')
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
      profileLoading,
      signInWithGoogle,
      signInWithApple,
      signInWithEmail,
      signUpWithEmail,
      resetPassword,
      logout,
      deleteAccount,
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
