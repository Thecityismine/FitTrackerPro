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

const TRICEP_ICONS = {
  'cable overhead triceps extension': '/Tricep/Cable Overhead Triceps Extension.png',
  'triceps pushdown machine':         '/Tricep/Triceps Pushdown Machine.png',
  'cable face pull':                  '/Tricep/Cable Face Pull.png',
  'dips':                             '/Tricep/Dips.png',
  'triceps cable push down':          '/Tricep/Triceps Cable Push Down.png',
  'tricep cable push down':           '/Tricep/Triceps Cable Push Down.png',
  'bench dip':                        '/Tricep/Bench Dip.png',
  'bench dips':                       '/Tricep/Bench Dip.png',
  'diamond push up':                  '/Tricep/Diamond Push Up.png',
  'diamond push-up':                  '/Tricep/Diamond Push Up.png',
  'dumbbell skullcrusher':            '/Tricep/Dumbbell Skullcrusher.png',
  'dumbbell skull crusher':           '/Tricep/Dumbbell Skullcrusher.png',
  'dumbbell tricep extension':        '/Tricep/Dumbbell Tricep Extension.png',
  'dumbbell triceps extension':       '/Tricep/Dumbbell Tricep Extension.png',
  'skullcrusher':                     '/Tricep/Skullcrusher.png',
  'skullcrushers':                    '/Tricep/Skullcrusher.png',
  'skull crusher':                    '/Tricep/Skullcrusher.png',
}

export function getExerciseIcon(exerciseName, muscleGroup) {
  const key = (exerciseName || '').trim().toLowerCase()
  if (AB_ICONS[key])     return AB_ICONS[key]
  if (TRICEP_ICONS[key]) return TRICEP_ICONS[key]
  if ((muscleGroup || '').toLowerCase() === 'abs') return '/Ab/Generic Ab Exercise.png'
  return null
}
