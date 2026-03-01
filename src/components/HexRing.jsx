// src/components/HexRing.jsx
// 3-segment hexagon progress ring (Push / Pull / Legs)

/**
 * segments: [{ pct: 0..1, color: '#hex' }, ...] — exactly 3 items
 * size: outer SVG size in px
 * strokeWidth: ring thickness
 */
export default function HexRing({ segments = [], size = 200, strokeWidth = 14 }) {
  const cx = size / 2
  const cy = size / 2
  const r  = size / 2 - strokeWidth / 2 - 2   // circumradius of the hexagon

  // Pointy-top hexagon vertices: k=0 is top, going clockwise
  const verts = Array.from({ length: 6 }, (_, k) => {
    const angle = (Math.PI / 3) * k - Math.PI / 2
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
  })

  // Full hexagon background path
  const bgPath = verts
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${v[0].toFixed(1)},${v[1].toFixed(1)}`)
    .join(' ') + ' Z'

  // sideLen = r for a regular hexagon (circumradius = side length)
  const sideLen  = r
  const segLen   = 2 * sideLen   // each group covers 2 sides

  // Vertex index triples for each segment (clockwise, each covers 2 sides)
  // Push:  top(0) → upper-right(1) → lower-right(2)
  // Pull:  lower-right(2) → bottom(3) → lower-left(4)
  // Legs:  lower-left(4) → upper-left(5) → top(0)
  const segVerts = [
    [0, 1, 2],
    [2, 3, 4],
    [4, 5, 0],
  ]

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background ring */}
      <path
        d={bgPath}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* Three progress segments */}
      {segments.map((seg, i) => {
        const [vi0, vi1, vi2] = segVerts[i]
        const [x0, y0] = verts[vi0]
        const [x1, y1] = verts[vi1]
        const [x2, y2] = verts[vi2]
        const d      = `M${x0.toFixed(1)},${y0.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`
        const offset = segLen * (1 - Math.min(Math.max(seg.pct ?? 0, 0), 1))

        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={segLen}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        )
      })}
    </svg>
  )
}
