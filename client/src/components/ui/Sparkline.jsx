/**
 * Tiny inline SVG sparkline chart
 */
export default function Sparkline({ data = [], width = 80, height = 24, color = '#ADFF2F', className = '' }) {
  // Filter out nulls for drawing, keep position
  const validPoints = data
    .map((v, i) => ({ value: v, index: i }))
    .filter(p => p.value !== null && p.value !== undefined);

  if (validPoints.length < 2) {
    return (
      <svg width={width} height={height} className={className}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth="1" opacity="0.3" />
      </svg>
    );
  }

  const values = validPoints.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = validPoints.map(p => {
    const x = (p.index / (data.length - 1)) * width;
    const y = height - ((p.value - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
      {/* Dot on last point */}
      {validPoints.length > 0 && (() => {
        const last = validPoints[validPoints.length - 1];
        const x = (last.index / (data.length - 1)) * width;
        const y = height - ((last.value - min) / range) * (height - 4) - 2;
        return <circle cx={x} cy={y} r="2" fill={color} />;
      })()}
    </svg>
  );
}
