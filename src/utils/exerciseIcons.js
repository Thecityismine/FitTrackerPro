// src/utils/exerciseIcons.js
// Per-exercise icon lookup. Falls back to a group generic when no specific icon exists.

const AB_ICONS = {
  'ab crunch machine':     '/Ab/Ab Crunch Machine.png',
  'bicycle crunches':      '/Ab/Bicycle Crunches.png',
  'ab rollout':            '/Ab/Ab Rollout.png',
  'bird dog':              '/Ab/Bird Dog.png',
  'crunches':              '/Ab/Crunches.png',
  'leg pull-in':           '/Ab/Leg Pull-In.png',
  'leg raise':             '/Ab/Leg Raise.png',
  'vertical leg raise':    '/Ab/Vertical Leg Raise.png',
  'vertical leg raises':   '/Ab/Vertical Leg Raise.png',
  'mountain climbers':     '/Ab/Mountain Climbers.png',
  'plank':                 '/Ab/Plank.png',
  'seated crunch machine': '/Ab/Seated Crunch Machine.png',
  'sit ups':               '/Ab/Sit Ups.png',
  'superman hold':         '/Ab/Superman Hold.png',
}

export function getExerciseIcon(exerciseName, muscleGroup) {
  const key = (exerciseName || '').trim().toLowerCase()
  if (AB_ICONS[key]) return AB_ICONS[key]
  if ((muscleGroup || '').toLowerCase() === 'abs') return '/Ab/Generic Ab Exercise.png'
  return null
}
