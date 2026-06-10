#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')

function parseArgs(argv) {
  const options = {
    apply: false,
    backfillUsers: false,
    includeSourceUser: false,
    verbose: false,
    sourceUid: '',
    userUids: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') {
      options.apply = true
      continue
    }
    if (arg === '--backfill-users') {
      options.backfillUsers = true
      continue
    }
    if (arg === '--include-source-user') {
      options.includeSourceUser = true
      continue
    }
    if (arg === '--verbose') {
      options.verbose = true
      continue
    }
    if (arg === '--source-uid') {
      options.sourceUid = String(argv[index + 1] || '').trim()
      index += 1
      continue
    }
    if (arg === '--user-uids') {
      options.userUids = String(argv[index + 1] || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      index += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.sourceUid) {
    throw new Error('--source-uid is required.')
  }

  return options
}

function printUsage() {
  console.log(`
Usage:
  node scripts/sync-exercise-library.mjs --source-uid <uid> [--apply] [--backfill-users]

Options:
  --source-uid <uid>      User whose exercises should be treated as the source library.
  --apply                 Write missing source exercises into globalExercises.
  --backfill-users        Add any missing global exercises into each user's exercises collection.
  --user-uids <a,b,c>     Limit backfill to specific user UIDs instead of scanning all Auth users.
  --include-source-user   Include the source UID when backfilling user exercise collections.
  --verbose               Print every missing exercise per user.
  --help                  Show this message.

Notes:
  This script uses firebase-admin and requires Application Default Credentials or a
  service account in your environment.
  `)
}

async function resolveProjectId() {
  const envProjectId = (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID
  )

  if (envProjectId) return envProjectId

  try {
    const firebasercRaw = await readFile(path.join(repoRoot, '.firebaserc'), 'utf8')
    const firebaserc = JSON.parse(firebasercRaw)
    if (firebaserc?.projects?.default) return String(firebaserc.projects.default)
  } catch {
    // Fall through to the repo's known default project.
  }

  return 'fittrackpro-cfdb6'
}

function normalizeExercise(docId, data) {
  const id = String(data?.id || docId || '').trim()
  const name = String(data?.name || '').trim()
  const muscleGroup = String(data?.muscleGroup || '').trim()
  if (!id || !name || !muscleGroup) return null

  return {
    id,
    name,
    muscleGroup,
    type: String(data?.type || 'weight').trim() || 'weight',
  }
}

function toMap(snapshot) {
  const map = new Map()
  snapshot.forEach((docSnapshot) => {
    const exercise = normalizeExercise(docSnapshot.id, docSnapshot.data())
    if (exercise) map.set(exercise.id, exercise)
  })
  return map
}

function findConflicts(sourceMap, globalMap) {
  const conflicts = []

  sourceMap.forEach((sourceExercise, id) => {
    const globalExercise = globalMap.get(id)
    if (!globalExercise) return

    const fields = ['name', 'muscleGroup', 'type'].filter((field) => (
      sourceExercise[field] !== globalExercise[field]
    ))

    if (fields.length) {
      conflicts.push({
        id,
        fields,
        source: sourceExercise,
        global: globalExercise,
      })
    }
  })

  return conflicts
}

async function commitSets(db, writes) {
  if (!writes.length) return 0

  let committed = 0
  for (let index = 0; index < writes.length; index += 400) {
    const batch = db.batch()
    writes.slice(index, index + 400).forEach(({ ref, data }) => {
      batch.set(ref, data, { merge: true })
    })
    await batch.commit()
    committed += Math.min(400, writes.length - index)
  }

  return committed
}

async function listAllUserUids(auth) {
  const uids = []
  let pageToken

  do {
    const result = await auth.listUsers(1000, pageToken)
    result.users.forEach((userRecord) => {
      if (userRecord?.uid) uids.push(userRecord.uid)
    })
    pageToken = result.pageToken
  } while (pageToken)

  return uids
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const projectId = await resolveProjectId()
  const app = initializeApp({
    credential: applicationDefault(),
    projectId,
  })
  const db = getFirestore(app)
  const auth = getAuth(app)

  console.log(`Project: ${projectId}`)
  console.log(`Source UID: ${options.sourceUid}`)

  const [sourceSnap, globalSnap] = await Promise.all([
    db.collection('users').doc(options.sourceUid).collection('exercises').get(),
    db.collection('globalExercises').get(),
  ])

  const sourceMap = toMap(sourceSnap.docs)
  const globalMap = toMap(globalSnap.docs)

  if (sourceMap.size === 0) {
    throw new Error(`No exercises found for source user ${options.sourceUid}.`)
  }

  const missingInGlobal = [...sourceMap.values()]
    .filter((exercise) => !globalMap.has(exercise.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const conflicts = findConflicts(sourceMap, globalMap)

  console.log(`Source exercises: ${sourceMap.size}`)
  console.log(`Global exercises before sync: ${globalMap.size}`)
  console.log(`Missing in global: ${missingInGlobal.length}`)

  if (missingInGlobal.length) {
    missingInGlobal.forEach((exercise) => {
      console.log(`  + ${exercise.name} [${exercise.id}] (${exercise.muscleGroup}, ${exercise.type})`)
    })
  }

  if (conflicts.length) {
    console.log(`Conflicts with global docs: ${conflicts.length}`)
    conflicts.forEach((conflict) => {
      console.log(`  ! ${conflict.id} differs on ${conflict.fields.join(', ')}`)
      if (options.verbose) {
        console.log(`    source: ${JSON.stringify(conflict.source)}`)
        console.log(`    global: ${JSON.stringify(conflict.global)}`)
      }
    })
  }

  if (options.apply && missingInGlobal.length) {
    const writes = missingInGlobal.map((exercise) => ({
      ref: db.collection('globalExercises').doc(exercise.id),
      data: exercise,
    }))
    const committed = await commitSets(db, writes)
    console.log(`Published to globalExercises: ${committed}`)
    missingInGlobal.forEach((exercise) => globalMap.set(exercise.id, exercise))
  } else if (!options.apply && missingInGlobal.length) {
    console.log('Dry run only. Re-run with --apply to publish missing exercises into globalExercises.')
  }

  if (!options.backfillUsers) return

  const targetUids = options.userUids.length
    ? options.userUids
    : await listAllUserUids(auth)
  const uidsToBackfill = options.includeSourceUser
    ? targetUids
    : targetUids.filter((uid) => uid !== options.sourceUid)

  console.log(`Users to inspect: ${uidsToBackfill.length}`)

  let usersMissingAny = 0
  let totalMissingDocs = 0
  let totalWrites = 0

  for (const uid of uidsToBackfill) {
    const userSnap = await db.collection('users').doc(uid).collection('exercises').get()
    const userMap = toMap(userSnap.docs)
    const missingForUser = [...globalMap.values()].filter((exercise) => !userMap.has(exercise.id))

    if (!missingForUser.length) continue

    usersMissingAny += 1
    totalMissingDocs += missingForUser.length

    console.log(`User ${uid} is missing ${missingForUser.length} exercise(s).`)
    if (options.verbose) {
      missingForUser.forEach((exercise) => {
        console.log(`  - ${exercise.name} [${exercise.id}]`)
      })
    }

    if (options.apply) {
      const writes = missingForUser.map((exercise) => ({
        ref: db.collection('users').doc(uid).collection('exercises').doc(exercise.id),
        data: exercise,
      }))
      totalWrites += await commitSets(db, writes)
    }
  }

  console.log(`Users missing at least one exercise: ${usersMissingAny}`)
  console.log(`Missing user exercise docs found: ${totalMissingDocs}`)

  if (options.apply) {
    console.log(`User exercise docs written: ${totalWrites}`)
  } else if (usersMissingAny > 0) {
    console.log('Dry run only. Re-run with --apply --backfill-users to add the missing user exercise docs.')
  }
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
