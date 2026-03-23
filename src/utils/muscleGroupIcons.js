const MAIN_CARD_ICONS = {
  abs: '/icons/Ab.png',
  arms: '/icons/Arms.png',
  biceps: '/icons/Biceps.png',
  triceps: '/icons/Triceps.png',
  shoulders: '/icons/Shoulder.png',
  shoulder: '/icons/Shoulder.png',
  chest: '/icons/Chest.png',
  back: '/icons/Back.png',
  legs: '/icons/Legs.png',
  glutes: '/icons/Glutes.png',
  cardio: '/icons/Cardio.png',
  recovery: '/icons/Recovery.png',
}

const LINE_MUSCLE_GROUP_ICONS = {
  abs: '/icons/line/abs.png',
  arms: '/icons/line/arm.png',
  biceps: '/icons/line/arm.png',
  triceps: '/icons/line/triceps.png',
  shoulders: '/icons/line/shoulder.png',
  shoulder: '/icons/line/shoulder.png',
  chest: '/icons/line/chest.png',
  back: '/icons/line/back.png',
  legs: '/icons/line/legs.png',
  glutes: '/icons/line/glutes.png',
  cardio: '/icons/line/cardio.png',
  recovery: '/icons/line/Recovery.png',
}

function normalizeGroupKey(value = '') {
  return value.trim().toLowerCase()
}

export function getMainMuscleGroupIcon(group) {
  return MAIN_CARD_ICONS[normalizeGroupKey(group)] || null
}

export function getLineMuscleGroupIcon(group) {
  return LINE_MUSCLE_GROUP_ICONS[normalizeGroupKey(group)] || null
}

export { MAIN_CARD_ICONS, LINE_MUSCLE_GROUP_ICONS }
