// src/utils/sessionHistory.js
// Shared session-history derivation.
//
// The guided routine cards (WorkoutPage) and the standalone exercise page
// (LegacyExerciseWorkout) both show "last reps x weight" for the same exercise.
// They used to derive it with separately written logic and different sort
// comparators, so they could disagree. Everything that reads history now goes
// through here so the two screens cannot drift apart.

// Deterministic total ordering: by date, then by doc id to break same-day ties.
// (The old `(a, b) => a.date < b.date ? -1 : 1` never returned 0, which is an
// inconsistent comparator - equal dates sorted in an arbitrary order.)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Whole days between `dateValue` (yyyy-MM-dd) and today, in local time.
// Every screen that says "today" / "3d ago" / "Last Aug 22" runs the same math.
export function daysSince(dateValue) {
  if (!dateValue) return null
  const [year, month, day] = String(dateValue).split('-').map(Number)
  if (!year || !month || !day) return null
  const target = new Date(year, month - 1, day).setHours(0, 0, 0, 0)
  const today = new Date().setHours(0, 0, 0, 0)
  return Math.round((today - target) / 86400000)
}

// Compact form for list rows: "today" | "yesterday" | "5d ago".
export function relativeDayLabel(dateValue) {
  const diff = daysSince(dateValue)
  if (diff == null) return null
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  return `${diff}d ago`
}

// Sentence form for exercise headers: "Trained today" | "Last Aug 22".
// Built from the last day trained INCLUDING today, so it agrees with the
// routine list rather than silently ignoring a session logged an hour ago.
export function lastTrainedLabel(dateValue, monthNames = MONTHS) {
  const diff = daysSince(dateValue)
  if (diff == null) return null
  if (diff === 0) return 'Trained today'
  if (diff === 1) return 'Trained yesterday'
  const [, month, day] = String(dateValue).split('-').map(Number)
  return `Last ${monthNames[month - 1]} ${day}`
}

export function compareSessions(a, b) {
  const dateA = a?.date || ''
  const dateB = b?.date || ''
  if (dateA !== dateB) return dateA < dateB ? -1 : 1
  const idA = a?.id || ''
  const idB = b?.id || ''
  if (idA !== idB) return idA < idB ? -1 : 1
  return 0
}

export function sortSessionsByDate(sessions = []) {
  return [...sessions].sort(compareSessions)
}

// Older data can contain more than one session doc for the same exercise on the
// same day. Prefer the one that actually holds sets so both screens open the
// same log instead of whichever happened to sort first.
export function pickSessionForDate(sessions = [], date) {
  const matches = sessions.filter((session) => session?.date === date)
  if (matches.length <= 1) return matches[0] || null
  return matches.reduce((best, session) => (
    (session.sets?.length || 0) > (best.sets?.length || 0) ? session : best
  ))
}

export function isLoggedSet(set) {
  return (Number(set?.reps) || 0) > 0 || (Number(set?.weight) || 0) > 0
}

// The set a new set should be seeded from: the last one in the session that was
// actually filled in.
export function findLastLoggedSet(session) {
  return [...(session?.sets || [])].reverse().find(isLoggedSet) || null
}

// Row identity for the set editors. Sets that arrive without an id - or with an
// id shared with another row - make `sets.map(s => s.id === updated.id ? ...)`
// write to the wrong row (or to several rows at once), so ids are repaired on
// load and reps/weight are coerced to numbers.
export function ensureSetIds(sets = []) {
  const seen = new Set()
  return sets.map((set, index) => {
    let id = set?.id
    if (!id || seen.has(id)) {
      id = `set-${index}-${Math.random().toString(36).slice(2, 9)}`
    }
    seen.add(id)
    return {
      ...set,
      id,
      reps: Number(set?.reps) || 0,
      weight: Number(set?.weight) || 0,
    }
  })
}

// A "session" to the user is a day they trained, not a document. Counting docs
// double-counts any duplicate same-day rows.
export function countSessionDays(sessions = []) {
  return new Set(sessions.map((session) => session?.date).filter(Boolean)).size
}

export function formatWeight(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '0'
  return Number.isInteger(numeric) ? `${numeric}` : String(Number(numeric.toFixed(2)))
}

// Text for a controlled weight/reps input: blank rather than a literal 0 so the
// placeholder shows through on an empty row.
export function toInputValue(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  return String(numeric)
}

/**
 * Everything both screens need about one exercise's history.
 * @param {Array} sessions session docs for a single exercise
 * @param {string} today   yyyy-MM-dd
 */
export function deriveExerciseHistory(sessions = [], today) {
  const ordered = sortSessionsByDate(sessions)
  const todaySession = pickSessionForDate(ordered, today)
  const pastSessions = ordered.filter((session) => session.date !== today)
  const lastPastDate = pastSessions.at(-1)?.date || null
  const recentPast = lastPastDate ? pickSessionForDate(pastSessions, lastPastDate) : null

  // Walk back to the most recent session that actually holds a logged set. A day
  // whose sets were all deleted (or a duplicate empty row) must not blank out
  // the suggested starting reps and weight.
  let lastTemplateSet = null
  for (let index = pastSessions.length - 1; index >= 0 && !lastTemplateSet; index -= 1) {
    lastTemplateSet = findLastLoggedSet(pastSessions[index])
  }

  return {
    ordered,
    pastSessions,
    todaySession,
    recentPast,
    todaySets: ensureSetIds(todaySession?.sets),
    lastTemplate: {
      reps: Number(lastTemplateSet?.reps) || 8,
      weight: Number(lastTemplateSet?.weight) || 0,
    },
    sessionCount: countSessionDays(ordered),
    // The previous session, used to seed the next set.
    lastSessionDate: recentPast?.date || null,
    // The last day trained at all, today included - what the "Trained today /
    // Last Aug 22" labels show.
    lastTrainedDate: ordered.at(-1)?.date || null,
    bestWeight: ordered.reduce(
      (max, session) => (session.sets || []).reduce(
        (sessionMax, set) => Math.max(sessionMax, Number(set?.weight) || 0),
        max
      ),
      0
    ),
  }
}

// A session is uniquely identified by exercise + day, so derive the document id
// from those instead of letting addDoc mint a random one. A retried or
// double-fired save then lands on the SAME document, which makes duplicate
// exercise-day rows structurally impossible rather than merely unlikely - the
// previous guard only serialized saves, so a first write that timed out (or
// failed on a weak gym connection) could still be followed by a second create.
// Matches the id shape the CSV importer already uses.
export function sessionDocId(exerciseId, date) {
  const safeExerciseId = String(exerciseId || '').replace(/[^A-Za-z0-9_.~:@+-]/g, '-')
  return `${safeExerciseId}--${date}`
}

// ─── Duplicate session repair ─────────────────────────────
// Before saves were serialized, a debounced write already in flight plus a
// Finish tap could both take the "no session yet -> addDoc" branch and leave two
// documents for the same exercise on the same day. The screens then read one and
// wrote the other, so they disagreed. These helpers find those pairs and fold
// them back into a single row.

function toMillis(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Date.parse(value) || 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value.seconds === 'number') return value.seconds * 1000
  return 0
}

// Identity for a logged set across duplicate copies of the same document. The
// client-generated id is stable between snapshots; older rows without one fall
// back to their position and value.
function setKey(set, index) {
  return set?.id || `#${index}:${Number(set?.reps) || 0}x${Number(set?.weight) || 0}`
}

export function buildSessionMergePlan(group = []) {
  // Oldest first, so a newer copy of the same set wins.
  const ordered = [...group].sort((a, b) => toMillis(a.updatedAt) - toMillis(b.updatedAt))

  const merged = new Map()
  for (const session of ordered) {
    (session.sets || []).forEach((set, index) => {
      merged.set(setKey(set, index), set)
    })
  }

  // Keep the richest document so anything already pointing at it stays valid.
  const survivor = [...group].sort((a, b) => (
    (b.sets?.length || 0) - (a.sets?.length || 0) ||
    toMillis(b.updatedAt) - toMillis(a.updatedAt) ||
    String(a.id).localeCompare(String(b.id))
  ))[0]

  const sets = ensureSetIds([...merged.values()])
  const totalVolume = sets.reduce((sum, set) => sum + set.reps * set.weight, 0)

  return {
    key: `${survivor.exerciseId}--${survivor.date}`,
    exerciseId: survivor.exerciseId,
    exerciseName: survivor.exerciseName || survivor.exerciseId,
    date: survivor.date,
    keepId: survivor.id,
    removeIds: group.map((session) => session.id).filter((id) => id !== survivor.id),
    docCount: group.length,
    setCountBefore: Math.max(...group.map((session) => session.sets?.length || 0)),
    sets,
    totalVolume,
  }
}

export function findDuplicateSessionGroups(sessions = []) {
  const groups = new Map()
  for (const session of sessions) {
    if (!session?.exerciseId || !session?.date) continue
    const key = `${session.exerciseId}--${session.date}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(session)
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map(buildSessionMergePlan)
    .sort((a, b) => (
      a.date === b.date
        ? a.exerciseName.localeCompare(b.exerciseName)
        : (a.date < b.date ? 1 : -1)
    ))
}
