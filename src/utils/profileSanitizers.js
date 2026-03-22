const SAFE_TEXT_REGEX = /[\u0000-\u001F\u007F<>]/g
const SAFE_HEIGHT_REGEX = /[^0-9a-zA-Z\s.'"/-]/g

export const ALLOWED_WEIGHT_UNITS = new Set(['lbs', 'kg'])
export const ALLOWED_SEX_OPTIONS = new Set(['male', 'female'])
export const ALLOWED_FITNESS_GOALS = new Set(['lose_weight', 'build_muscle', 'overall_fitness'])

function sanitizeText(value, maxLength = 80) {
  return String(value ?? '')
    .replace(SAFE_TEXT_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function sanitizeDisplayName(value) {
  return sanitizeText(value, 60)
}

export function sanitizeEmail(value) {
  return sanitizeText(value, 120).toLowerCase()
}

export function sanitizeHeightInput(value) {
  return String(value ?? '')
    .replace(SAFE_TEXT_REGEX, ' ')
    .replace(SAFE_HEIGHT_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
}

export function sanitizeDateInput(value) {
  const raw = String(value ?? '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  const today = new Date()
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  if (date.getTime() > todayUtc || year < 1900) return null
  return raw
}

export function sanitizeEnum(value, allowedValues) {
  const raw = String(value ?? '').trim()
  return allowedValues.has(raw) ? raw : null
}

export function sanitizeBoundedInt(value, { min, max, fallback }) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.round(parsed)))
}

export function sanitizeProfileSettingsInput(input = {}) {
  return {
    displayName: sanitizeDisplayName(input.displayName),
    heightIn: sanitizeHeightInput(input.heightIn),
    weightUnit: sanitizeEnum(input.weightUnit, ALLOWED_WEIGHT_UNITS) || 'lbs',
    sex: sanitizeEnum(input.sex, ALLOWED_SEX_OPTIONS),
    fitnessGoal: sanitizeEnum(input.fitnessGoal, ALLOWED_FITNESS_GOALS),
    dateOfBirth: sanitizeDateInput(input.dateOfBirth),
    weeklyTargets: {
      push: sanitizeBoundedInt(input.weeklyTargets?.push, { min: 1, max: 99, fallback: 27 }),
      pull: sanitizeBoundedInt(input.weeklyTargets?.pull, { min: 1, max: 99, fallback: 15 }),
      legs: sanitizeBoundedInt(input.weeklyTargets?.legs, { min: 1, max: 99, fallback: 21 }),
    },
    weeklyWorkoutGoal: sanitizeBoundedInt(input.weeklyWorkoutGoal, { min: 1, max: 7, fallback: 3 }),
    weeklyVolumeGoal: sanitizeBoundedInt(input.weeklyVolumeGoal, { min: 10000, max: 1000000, fallback: 100000 }),
  }
}
