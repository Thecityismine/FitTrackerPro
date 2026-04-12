const TREND_TONE_META = {
  normal: {
    fill: '#1A56DB',
    haloFill: '#1A56DB',
    haloStroke: '#60A5FA',
    haloOpacity: 0.12,
    dotClass: 'bg-accent',
  },
  best: {
    fill: '#22C55E',
    haloFill: '#22C55E',
    haloStroke: '#86EFAC',
    haloOpacity: 0.14,
    dotClass: 'bg-accent-green',
  },
  low: {
    fill: '#F59E0B',
    haloFill: '#F59E0B',
    haloStroke: '#FCD34D',
    haloOpacity: 0.16,
    dotClass: 'bg-[#F59E0B]',
  },
}

export function getTrendToneMeta(tone = 'normal') {
  return TREND_TONE_META[tone] || TREND_TONE_META.normal
}

export function annotateTrendPoints(points = [], valueKey) {
  const values = points.map((point) => Number(point?.[valueKey]))
  const finiteValues = values.filter((value) => Number.isFinite(value))

  if (!finiteValues.length) {
    return points.map((point, index) => ({
      ...point,
      trendTone: 'normal',
      isCurrent: index === points.length - 1,
    }))
  }

  const maxValue = Math.max(...finiteValues)
  const minValue = Math.min(...finiteValues)
  const useToneExtremes = points.length > 2 && maxValue !== minValue
  const peakIndex = useToneExtremes ? values.findIndex((value) => value === maxValue) : -1
  const lowIndex = useToneExtremes ? values.findIndex((value) => value === minValue) : -1

  return points.map((point, index) => ({
    ...point,
    trendTone: index === peakIndex ? 'best' : index === lowIndex ? 'low' : 'normal',
    isCurrent: index === points.length - 1,
  }))
}

export default function TrendPointDot({ cx, cy, payload }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null

  const tone = payload?.trendTone || 'normal'
  const isCurrent = Boolean(payload?.isCurrent)
  const meta = getTrendToneMeta(tone)
  const baseRadius = tone === 'normal' ? 3 : 4

  return (
    <g>
      {isCurrent && (
        <>
          <circle cx={cx} cy={cy} r={11} fill={meta.haloFill} opacity={meta.haloOpacity} />
          <circle cx={cx} cy={cy} r={7} fill="none" stroke={meta.haloStroke} strokeOpacity={0.34} strokeWidth={1.5} />
        </>
      )}
      <circle cx={cx} cy={cy} r={isCurrent ? baseRadius + 1 : baseRadius} fill={meta.fill} strokeWidth={0} />
    </g>
  )
}
