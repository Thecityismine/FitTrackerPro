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

const BICEP_ICONS = {
  'cable bicep curl':              '/Biceps/Cable Bicep Curl.png',
  'cable biceps curl':             '/Biceps/Cable Bicep Curl.png',
  'lat pulldown':                  '/Biceps/Lat Pulldown.png',
  'lat pull down':                 '/Biceps/Lat Pulldown.png',
  'ez bar curl':                   '/Biceps/EZ Bar Curl.png',
  'ez-bar curl':                   '/Biceps/EZ Bar Curl.png',
  'push ups':                      '/Biceps/Push Ups.png',
  'push-ups':                      '/Biceps/Push Ups.png',
  'pushups':                       '/Biceps/Push Ups.png',
  'concentrated curl':             '/Biceps/Concentrated Curl.png',
  'concentration curl':            '/Biceps/Concentrated Curl.png',
  'concentration curls':           '/Biceps/Concentrated Curl.png',
  'dumbbell bicep curl':           '/Biceps/Dumbbell Bicep Curl.png',
  'dumbbell biceps curl':          '/Biceps/Dumbbell Bicep Curl.png',
  'dumbbell curl':                 '/Biceps/Dumbbell Bicep Curl.png',
  'dumbbell curls':                '/Biceps/Dumbbell Bicep Curl.png',
  'dumbbell preacher curls':       '/Biceps/Dumbbell Preacher Curls.png',
  'dumbbell preacher curl':        '/Biceps/Dumbbell Preacher Curls.png',
  'hammer curls':                  '/Biceps/Hammer Curls.png',
  'hammer curl':                   '/Biceps/Hammer Curls.png',
  'machine bicep curl':            '/Biceps/Machine Bicep Curl.png',
  'machine biceps curl':           '/Biceps/Machine Bicep Curl.png',
  'preacher curl':                 '/Biceps/Preacher Curl.png',
  'preacher curls':                '/Biceps/Preacher Curl.png',
  'seated dumbbell curl':          '/Biceps/Seated Dumbbell Curl.png',
  'seated dumbbell curls':         '/Biceps/Seated Dumbbell Curl.png',
  'single arm cable bicep curl':   '/Biceps/Single Arm Cable Bicep Curl.png',
  'single-arm cable bicep curl':   '/Biceps/Single Arm Cable Bicep Curl.png',
  'single arm preacher curl':      '/Biceps/Single Arm Preacher Curl.png',
  'single-arm preacher curl':      '/Biceps/Single Arm Preacher Curl.png',
}

const LEG_ICONS = {
  'leg press':                   '/Legs/Leg Press.png',
  'leg extension':               '/Legs/Leg Extension.png',
  'leg extensions':              '/Legs/Leg Extension.png',
  'calf extension':              '/Legs/Calf Extension.png',
  'calf extensions':             '/Legs/Calf Extension.png',
  'seated leg curl':             '/Legs/Seated Leg Curl.png',
  'squat':                       '/Legs/Squat.png',
  'squats':                      '/Legs/Squat.png',
  'barbell squat':               '/Legs/Squat.png',
  'calf raise':                  '/Legs/Calf Raise.png',
  'calf raises':                 '/Legs/Calf Raise.png',
  'standing calf raise':         '/Legs/Calf Raise.png',
  'bulgarian split squat':       '/Legs/Bulgarian Split Squat.png',
  'bulgarian split squats':      '/Legs/Bulgarian Split Squat.png',
  'burpee':                      '/Legs/Burpee.png',
  'burpees':                     '/Legs/Burpee.png',
  'cable hip abduction':         '/Legs/Cable Hip Abduction.png',
  'dumbbell squats':             '/Legs/Dumbbell Squats.png',
  'dumbbell squat':              '/Legs/Dumbbell Squats.png',
  'seated dumbbell calf raise':  '/Legs/Seated Dumbbell Calf Raise.png',
  'seated dumbbell calf raises': '/Legs/Seated Dumbbell Calf Raise.png',
}

const CHEST_ICONS = {
  'barbell bench press':         '/Chest/Barbell Bench Press.png',
  'barbell decline bench press': '/Chest/Barbell Decline Bench Press.png',
  'cable crossover fly':         '/Chest/Cable Crossover Fly.png',
  'cable crossover':             '/Chest/Cable Crossover Fly.png',
  'decline press machine':       '/Chest/Decline Press Machine.png',
  'dumbbell bench press':        '/Chest/Dumbbell Bench Press.png',
  'dumbbell fly':                '/Chest/Dumbbell Fly.png',
  'dumbbell flye':               '/Chest/Dumbbell Fly.png',
  'dumbbell incline fly':        '/Chest/Dumbbell Incline Fly.png',
  'dumbbell incline flye':       '/Chest/Dumbbell Incline Fly.png',
  'incline bench press':         '/Chest/Incline Bench Press.png',
  'machine bench press':         '/Chest/Machine Bench Press.png',
  'machine fly':                 '/Chest/Machine Fly.png',
  'machine flye':                '/Chest/Machine Fly.png',
  'supine press':                '/Chest/Supine Press.png',
}

const GROUP_ICONS = {
  'abs':       '/icons/abs.png',
  'biceps':    '/icons/arm.png',
  'triceps':   '/icons/triceps.png',
  'shoulders': '/icons/shoulder.png',
  'chest':     '/icons/chest.png',
  'back':      '/icons/back.png',
  'legs':      '/icons/legs.png',
  'glutes':    '/icons/glutes.png',
  'cardio':    '/icons/cardio.png',
  'recovery':  '/icons/Recovery.png',
}

export function getExerciseIcon(exerciseName, muscleGroup) {
  const key = (exerciseName || '').trim().toLowerCase()
  if (AB_ICONS[key])     return AB_ICONS[key]
  if (TRICEP_ICONS[key]) return TRICEP_ICONS[key]
  if (BICEP_ICONS[key])  return BICEP_ICONS[key]
  if (LEG_ICONS[key])    return LEG_ICONS[key]
  if (CHEST_ICONS[key])  return CHEST_ICONS[key]
  // Fall back to muscle group icon
  const groupKey = (muscleGroup || '').trim().toLowerCase()
  return GROUP_ICONS[groupKey] || null
}
