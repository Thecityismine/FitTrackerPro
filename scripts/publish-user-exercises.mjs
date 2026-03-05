// scripts/publish-user-exercises.mjs
// Copies exercises from a user's account to the globalExercises collection.
// New users will automatically be seeded from globalExercises on first load.
//
// Usage:
//   node --env-file=.env.local scripts/publish-user-exercises.mjs <uid>
//
// Example:
//   node --env-file=.env.local scripts/publish-user-exercises.mjs KMmKMVmTLvWGIWaOQ3z33R3l99C3

import { initializeApp, deleteApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore'

const uid = process.argv[2]
if (!uid) {
  console.error('Usage: node --env-file=.env.local scripts/publish-user-exercises.mjs <uid>')
  process.exit(1)
}

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const db  = getFirestore(app)

const snap = await getDocs(collection(db, 'users', uid, 'exercises'))
if (snap.empty) {
  console.log('No exercises found for this user.')
  await deleteApp(app)
  process.exit(0)
}

const batch = writeBatch(db)
let count = 0
snap.docs.forEach(d => {
  const { id, name, muscleGroup, type, createdAt } = d.data()
  if (!id || !name || !muscleGroup) return
  batch.set(doc(db, 'globalExercises', id), { id, name, muscleGroup, type: type || 'weight' })
  count++
})

await batch.commit()
console.log(`✅ Published ${count} exercises to globalExercises`)
await deleteApp(app)
process.exit(0)
