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
  'assisted dip machine':             '/Tricep/Assisted Dip Machine.png',
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

const RECOVERY_ICONS = {
  'back massage':   '/Recovery/Back Massage.png',
  'massage chair':  '/Recovery/Massage Chair.png',
}

const CARDIO_ICONS = {
  'elliptical machine':    '/Cardio/Elliptical Machine.png',
  'elliptical':            '/Cardio/Elliptical Machine.png',
  'fitness bike':          '/Cardio/Fitness Bike.png',
  'indoor cycling':        '/Cardio/Indoor Cycling.png',
  'cycling':               '/Cardio/Indoor Cycling.png',
  'spin bike':             '/Cardio/Indoor Cycling.png',
  'spinning':              '/Cardio/Indoor Cycling.png',
  'recumbent bike':        '/Cardio/Recumbent Bike.png',
  'stationary bike':       '/Cardio/Stationary Bike.png',
  'step mill':             '/Cardio/Step Mill.png',
  'stairmill':             '/Cardio/Step Mill.png',
  'stair mill':            '/Cardio/Step Mill.png',
  'walking treadmill':     '/Cardio/Walking Treadmill.png',
  'treadmill':             '/Cardio/Walking Treadmill.png',
  'walking':               '/Cardio/Walking.png',
  'walk':                  '/Cardio/Walking.png',
}

const SHOULDER_ICONS = {
  'cable lateral raise':        '/Shoulder/Cable Lateral Raise.png',
  'cable lateral raises':       '/Shoulder/Cable Lateral Raise.png',
  'dumbbell front raise':       '/Shoulder/Dumbbell Front Raise.png',
  'dumbbell front raises':      '/Shoulder/Dumbbell Front Raise.png',
  'dumbbell lateral raise':     '/Shoulder/Dumbbell Lateral Raise.png',
  'dumbbell lateral raises':    '/Shoulder/Dumbbell Lateral Raise.png',
  'lateral raise':              '/Shoulder/Dumbbell Lateral Raise.png',
  'lateral raises':             '/Shoulder/Dumbbell Lateral Raise.png',
  'dumbbell shoulder press':    '/Shoulder/Dumbbell Shoulder Press.png',
  'shoulder press':             '/Shoulder/Dumbbell Shoulder Press.png',
  'handstand push up':          '/Shoulder/Handstand Push Up.png',
  'handstand push-up':          '/Shoulder/Handstand Push Up.png',
  'handstand push ups':         '/Shoulder/Handstand Push Up.png',
  'machine shoulder pulldown':  '/Shoulder/Machine Shoulder Pulldown.png',
  'upright row':                '/Shoulder/Upright Row.png',
  'upright rows':               '/Shoulder/Upright Row.png',
}

const GLUTE_ICONS = {
  'bridge':                  '/Glutes/Bridge.png',
  'cable hip extension':     '/Glutes/Cable Hip Extension.png',
  'deadlift':                '/Glutes/Deadlift.png',
  'deadlifts':               '/Glutes/Deadlift.png',
  'glute cable kickbacks':   '/Glutes/Glute Cable Kickbacks.png',
  'glute cable kickback':    '/Glutes/Glute Cable Kickbacks.png',
  'glute kickback machine':  '/Glutes/Glute Kickback Machine.png',
  'glute trainer machine':   '/Glutes/Glute Trainer Machine.png',
  'hack squat':              '/Glutes/Hack Squat.png',
  'hack squats':             '/Glutes/Hack Squat.png',
  'hip thrust':              '/Glutes/Hip Thrust.png',
  'hip thrusts':             '/Glutes/Hip Thrust.png',
  'romanian deadlift':       '/Glutes/Romanian Deadlifts.png',
  'romanian deadlifts':      '/Glutes/Romanian Deadlifts.png',
  'rdl':                     '/Glutes/Romanian Deadlifts.png',
  'single leg kickback':     '/Glutes/Single Leg Kickback.png',
  'single-leg kickback':     '/Glutes/Single Leg Kickback.png',
  'smith machine squat':     '/Glutes/Smith Machine Squat.png',
  'smith machine squats':    '/Glutes/Smith Machine Squat.png',
  'step ups':                '/Glutes/Step Ups.png',
  'step up':                 '/Glutes/Step Ups.png',
  'sumo squat':              '/Glutes/Sumo Squat.png',
  'sumo squats':             '/Glutes/Sumo Squat.png',
  'walking lunges':          '/Glutes/Walking Lunges.png',
  'walking lunge':           '/Glutes/Walking Lunges.png',
}

const BACK_ICONS = {
  'assisted pull up':      '/Back/Assisted Pull Up.png',
  'assisted pull-up':      '/Back/Assisted Pull Up.png',
  'cable row':             '/Back/Cable Row.png',
  'chin up':               '/Back/Chin Up.png',
  'chin-up':               '/Back/Chin Up.png',
  'chin ups':              '/Back/Chin Up.png',
  'chin-ups':              '/Back/Chin Up.png',
  'dead hang':             '/Back/Dead Hang.png',
  'dumbbell row':          '/Back/Dumbbell Row.png',
  'incline dumbbell row':  '/Back/Incline Dumbbell Row.png',
  'lat pulldown machine':  '/Back/Lat Pulldown Machine.png',
  'pull up':               '/Back/Pull Up.png',
  'pull-up':               '/Back/Pull Up.png',
  'pull ups':              '/Back/Pull Up.png',
  'pull-ups':              '/Back/Pull Up.png',
  'seated back extension': '/Back/Seated Back Extension.png',
  'seated row':            '/Back/Seated Row.png',
  'superman':              '/Back/Superman.png',
  'wall sit':              '/Back/Wall Sit.png',
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
  if (RECOVERY_ICONS[key]) return RECOVERY_ICONS[key]
  if (CARDIO_ICONS[key])   return CARDIO_ICONS[key]
  if (SHOULDER_ICONS[key]) return SHOULDER_ICONS[key]
  if (GLUTE_ICONS[key])    return GLUTE_ICONS[key]
  if (BACK_ICONS[key])   return BACK_ICONS[key]
  if (CHEST_ICONS[key])  return CHEST_ICONS[key]
  // Fall back to muscle group icon
  const groupKey = (muscleGroup || '').trim().toLowerCase()
  return GROUP_ICONS[groupKey] || null
}
