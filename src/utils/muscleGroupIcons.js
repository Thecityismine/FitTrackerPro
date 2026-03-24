const MAIN_CARD_ICONS = {
  abs: '/icons/Ab.png',
  arms: '/icons/Arms.png',
  biceps: '/icons/Biceps.png',
  triceps: '/icons/triceps.png',
  shoulders: '/icons/shoulder.png',
  shoulder: '/icons/shoulder.png',
  chest: '/icons/chest.png',
  back: '/icons/back.png',
  legs: '/icons/legs.png',
  glutes: '/icons/glutes.png',
  cardio: '/icons/cardio.png',
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
