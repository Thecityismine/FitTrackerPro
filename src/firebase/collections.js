// src/firebase/collections.js
// Centralized Firestore collection references
import { collection, doc } from 'firebase/firestore'
import { db } from './config'

// ─── User subcollections ───────────────────────────────────
export const userDoc = (uid) => doc(db, 'users', uid)

export const routinesCol = (uid) => collection(db, 'users', uid, 'routines')
export const routineDoc = (uid, id) => doc(db, 'users', uid, 'routines', id)

export const exercisesCol = (uid) => collection(db, 'users', uid, 'exercises')
export const exerciseDoc = (uid, id) => doc(db, 'users', uid, 'exercises', id)

export const sessionsCol = (uid) => collection(db, 'users', uid, 'sessions')
export const sessionDoc = (uid, id) => doc(db, 'users', uid, 'sessions', id)

export const setsCol = (uid) => collection(db, 'users', uid, 'sets')
export const setDoc_ = (uid, id) => doc(db, 'users', uid, 'sets', id)

export const bodyMetricsCol = (uid) => collection(db, 'users', uid, 'bodyMetrics')
export const bodyMetricDoc = (uid, id) => doc(db, 'users', uid, 'bodyMetrics', id)

export const prsCol = (uid) => collection(db, 'users', uid, 'personalRecords')
export const prDoc = (uid, id) => doc(db, 'users', uid, 'personalRecords', id)

// ─── Global exercise library (shared across all users) ────
export const globalExercisesCol = () => collection(db, 'globalExercises')
export const globalExerciseDoc = (id) => doc(db, 'globalExercises', id)
