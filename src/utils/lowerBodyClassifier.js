const SPECIFIC_LOWER_BODY_MAP = {
  quad: 'quads',
  quads: 'quads',
  quadricep: 'quads',
  quadriceps: 'quads',
  hamstring: 'hamstrings',
  hamstrings: 'hamstrings',
  glute: 'glutes',
  glutes: 'glutes',
  gluts: 'glutes',
}

const LOWER_BODY_EXERCISE_RULES = [
  {
    re: /\b(hamstring curl|hamstring curls|leg curl|leg curls|seated leg curl|seated leg curls|lying leg curl|lying leg curls|romanian deadlift|romanian deadlifts|rdl|good morning|good mornings)\b/,
    muscleId: 'hamstrings',
  },
  {
    re: /\b(glute bridge|glute bridges|single leg glute bridge|single-leg glute bridge|bridge|hip thrust|hip thrusts|glute cable kickback|glute cable kickbacks|glute kickback machine|kickback|kickbacks|cable hip extension|hip extension|hip abductor|hip abductors|hip abduction|cable hip abduction|glute machine|glute trainer machine|deadlift|deadlifts)\b/,
    muscleId: 'glutes',
  },
  {
    re: /\b(leg extension|leg extensions|leg press|leg press machine|split squat|split squats|bulgarian split squat|bulgarian split squats|walking lunge|walking lunges|lunge|lunges|step up|step ups|hack squat|hack squats|smith machine squat|smith machine squats|sumo squat|sumo squats|squat|squats|outer thigh)\b/,
    muscleId: 'quads',
  },
]

export function getLowerBodyMuscleId(muscleGroup = '', exerciseName = '') {
  const normalizedMuscleGroup = (muscleGroup || '').trim().toLowerCase()

  if (SPECIFIC_LOWER_BODY_MAP[normalizedMuscleGroup]) {
    return SPECIFIC_LOWER_BODY_MAP[normalizedMuscleGroup]
  }

  const normalizedExerciseName = (exerciseName || '').trim().toLowerCase()
  for (const rule of LOWER_BODY_EXERCISE_RULES) {
    if (rule.re.test(normalizedExerciseName)) return rule.muscleId
  }

  if (normalizedMuscleGroup === 'legs' || normalizedMuscleGroup === 'leg') {
    return 'quads'
  }

  return null
}

export function getLowerBodyCategory(muscleGroup = '', exerciseName = '') {
  const muscleId = getLowerBodyMuscleId(muscleGroup, exerciseName)
  return muscleId ? { groupId: 'legs', muscleId } : null
}
