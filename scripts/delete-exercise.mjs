// scripts/delete-exercise.mjs
// Deletes all sessions for a given exercise name (case-insensitive) for a user.
// Run: node --env-file=.env.local scripts/delete-exercise.mjs [uid] [exerciseName]
// Example: node --env-file=.env.local scripts/delete-exercise.mjs KMmKMVmTLvWGIWaOQ3z33R3l99C3 "Sex"

import { initializeApp, deleteApp } from 'firebase/app'
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
}

const uid = process.argv[2] || 'KMmKMVmTLvWGIWaOQ3z33R3l99C3'
const exerciseName = process.argv[3] || 'Sex'

console.log(`Deleting all sessions for exercise "${exerciseName}" (uid: ${uid})...`)

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const sessionsRef = collection(db, 'users', uid, 'sessions')
const snap = await getDocs(sessionsRef)

const toDelete = snap.docs.filter(
  (d) => d.data().exerciseName?.toLowerCase() === exerciseName.toLowerCase()
)

if (toDelete.length === 0) {
  console.log('No matching sessions found.')
  await deleteApp(app)
  process.exit(0)
}

console.log(`Found ${toDelete.length} sessions to delete...`)

// Firestore batch max = 500 ops
const BATCH_SIZE = 500
for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
  const batch = writeBatch(db)
  toDelete.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref))
  await batch.commit()
  console.log(`Deleted ${Math.min(i + BATCH_SIZE, toDelete.length)} / ${toDelete.length}`)
}

console.log(`✅ Done! Deleted ${toDelete.length} sessions for "${exerciseName}".`)
await deleteApp(app)
