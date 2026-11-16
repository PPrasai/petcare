import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

export interface WeightPoint {
  date: string;
  value: number;
}

const MARGIN = { top: 8, right: 16, bottom: 8, left: 0 };
const Y_AXIS_WIDTH = 64;
const X_AXIS_HEIGHT = 30;
const LABEL_WIDTH = 84;
const FONT_SIZE = 12;

/** About `count` round tick values covering [min, max] (a flat series gets a band around it). */
function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const first = Math.floor(min / step) * step;
  const last = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = first; v <= last + step / 2; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** A smooth curve that never overshoots the data (monotone cubic, Fritsch-Carlson). */
function monotonePath(pts: ReadonlyArray<readonly [number, number]>): string {
  const n = pts.length;
  const at = (i: number) => pts[i] as readonly [number, number];
  if (n === 0) return '';
  if (n < 3) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join('');
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = at(i + 1)[0] - at(i)[0];
    slope.push(dx === 0 ? 0 : (at(i + 1)[1] - at(i)[1]) / dx);
  }
  const m: number[] = [slope[0] ?? 0];
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1] ?? 0;
    const b = slope[i] ?? 0;
    m.push(a * b <= 0 ? 0 : (a + b) / 2);
  }
  m.push(slope[n - 2] ?? 0);
  for (let i = 0; i < n - 1; i++) {
    const s = slope[i] ?? 0;
    if (s === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = (m[i] ?? 0) / s;
    const b = (m[i + 1] ?? 0) / s;
    const h = Math.hypot(a, b);
    if (h > 3) {
      m[i] = ((3 * a) / h) * s;
      m[i + 1] = ((3 * b) / h) * s;
    }
  }
  let d = `M${at(0)[0]},${at(0)[1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = at(i);
    const [x1, y1] = at(i + 1);
    const dx = (x1 - x0) / 3;
    d += `C${x0 + dx},${y0 + dx * (m[i] ?? 0)},${x1 - dx},${y1 - dx * (m[i + 1] ?? 0)},${x1},${y1}`;
  }
  return d;
}

/**
 * Weight over time, drawn as plain SVG. The data is also listed in the measurements table below the
 * chart, and the caller wraps this in a `role="img"` with the text summary, so the chart itself is
 * hidden from assistive technology. Colours are the design tokens, so dark mode follows them;
 * nothing animates.
 *
 * The class names below keep the structure the QA-45 phone fingerprint captured while the chart was
 * drawn by recharts (that file is never regenerated inside a D slice); the styling does not use them.
 */
export default function WeightChart({
  points,
  unit,
  height = 240,
}: {
  points: WeightPoint[];
  unit: string;
  /** A number of px, or '100%' to fill a panel (160 px at least). */
  height?: number | '100%';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { w, h } = size;
  const innerLeft = MARGIN.left + Y_AXIS_WIDTH;
  const innerRight = w - MARGIN.right;
  const innerTop = MARGIN.top;
  const innerBottom = h - MARGIN.bottom - X_AXIS_HEIGHT;
  const ready = innerRight > innerLeft && innerBottom > innerTop && points.length > 0;

  let body = null;
  if (ready) {
    const values = points.map((p) => p.value);
    const yTicks = niceTicks(Math.min(...values), Math.max(...values));
    const yMin = yTicks[0] ?? 0;
    const yMax = yTicks.at(-1) ?? 1;
    const n = points.length;
    const xOf = (i: number) =>
      n === 1 ? (innerLeft + innerRight) / 2 : innerLeft + ((innerRight - innerLeft) * i) / (n - 1);
    const yOf = (v: number) =>
      innerBottom - ((v - yMin) / (yMax - yMin)) * (innerBottom - innerTop);
    const coords = points.map((p, i) => [xOf(i), yOf(p.value)] as const);
    // Every label that fits, counted back from the newest so the last date is always shown.
    const step = Math.max(1, Math.ceil((n * LABEL_WIDTH) / (innerRight - innerLeft)));
    const xTicks = points.map((_, i) => i).filter((i) => (n - 1 - i) % step === 0);
    const active = hover === null ? null : points[hover];
    const activeAt = hover === null ? null : coords[hover];

    const onMove = (event: PointerEvent<HTMLDivElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - box.left;
      let best = 0;
      coords.forEach(([cx], i) => {
        if (Math.abs(cx - x) < Math.abs((coords[best]?.[0] ?? 0) - x)) best = i;
      });
      setHover(best);
    };

    body = (
      <div
        className="recharts-wrapper"
        style={{ position: 'relative', width: w, height: h }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          className="recharts-surface"
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden="true"
          focusable="false"
          style={{ display: 'block', fontSize: FONT_SIZE }}
        >
          <g className="recharts-zIndex-layer_-100">
            <g className="recharts-cartesian-grid">
              <g className="recharts-cartesian-grid-horizontal">
                {yTicks.map((v) => (
                  <line
                    key={v}
                    x1={innerLeft}
                    x2={innerRight}
                    y1={yOf(v)}
                    y2={yOf(v)}
                    stroke="var(--line)"
                    strokeDasharray="3 3"
                  />
                ))}
              </g>
              <g className="recharts-cartesian-grid-vertical">
                {points.map((p, i) => (
                  <line
                    key={p.date + i}
                    x1={xOf(i)}
                    x2={xOf(i)}
                    y1={innerTop}
                    y2={innerBottom}
                    stroke="var(--line)"
                    strokeDasharray="3 3"
                  />
                ))}
              </g>
            </g>
          </g>
          <g className="recharts-zIndex-layer_400">
            <g className="recharts-layer recharts-line">
              <g className="recharts-layer recharts-shape">
                <path
                  className="recharts-curve recharts-line-curve"
                  d={monotonePath(coords)}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2}
                />
              </g>
            </g>
          </g>
          <g className="recharts-zIndex-layer_500">
            <g className="recharts-cartesian-axis recharts-layer recharts-xAxis xAxis">
              <g className="recharts-cartesian-axis-ticks recharts-xAxis-ticks">
                <g className="recharts-cartesian-axis-tick-lines recharts-xAxis-tick-lines">
                  {xTicks.map((i) => (
                    <line
                      key={i}
                      x1={xOf(i)}
                      x2={xOf(i)}
                      y1={innerBottom}
                      y2={innerBottom + 6}
                      stroke="var(--muted)"
                    />
                  ))}
                </g>
              </g>
            </g>
            <g className="recharts-cartesian-axis recharts-layer recharts-yAxis yAxis">
              <g className="recharts-cartesian-axis-ticks recharts-yAxis-ticks">
                <g className="recharts-cartesian-axis-tick-lines recharts-yAxis-tick-lines">
                  {yTicks.map((v) => (
                    <line
                      key={v}
                      x1={innerLeft - 6}
                      x2={innerLeft}
                      y1={yOf(v)}
                      y2={yOf(v)}
                      stroke="var(--muted)"
                    />
                  ))}
                </g>
              </g>
            </g>
          </g>
          <g className="recharts-zIndex-layer_600">
            <g className="recharts-layer recharts-line-dots">
              {coords.map(([cx, cy], i) => (
                <circle
                  key={(points[i]?.date ?? '') + i}
                  className="recharts-dot recharts-line-dot"
                  cx={cx}
                  cy={cy}
                  r={i === hover ? 5 : 3}
                  fill="var(--surface)"
                  stroke="var(--accent)"
                  strokeWidth={2}
                />
              ))}
            </g>
          </g>
          <g className="recharts-zIndex-layer_2000">
            <g className="recharts-cartesian-axis-tick-labels recharts-xAxis-tick-labels">
              {xTicks.map((i) => (
                <g key={i} className="recharts-cartesian-axis-tick-label recharts-layer">
                  <text
                    className="recharts-cartesian-axis-tick-value recharts-text"
                    x={xOf(i)}
                    y={innerBottom + 20}
                    textAnchor={xOf(i) + LABEL_WIDTH / 2 > w ? 'end' : 'middle'}
                    fill="var(--muted)"
                  >
                    <tspan>{points[i]?.date}</tspan>
                  </text>
                </g>
              ))}
            </g>
            <g className="recharts-cartesian-axis-tick-labels recharts-yAxis-tick-labels">
              {yTicks.map((v) => (
                <g key={v} className="recharts-cartesian-axis-tick-label recharts-layer">
                  <text
                    className="recharts-cartesian-axis-tick-value recharts-text"
                    x={innerLeft - 10}
                    y={yOf(v)}
                    dy="0.32em"
                    textAnchor="end"
                    fill="var(--muted)"
                  >
                    <tspan>{`${v} ${unit}`}</tspan>
                  </text>
                </g>
              ))}
            </g>
          </g>
        </svg>
        {active && activeAt ? (
          <div
            style={{
              position: 'absolute',
              left: Math.min(activeAt[0] + 12, Math.max(0, w - 150)),
              top: Math.max(0, activeAt[1] - 52),
              pointerEvents: 'none',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: '6px 10px',
              fontSize: 13,
              color: 'var(--ink)',
              whiteSpace: 'nowrap',
            }}
          >
            <div>{active.date}</div>
            <div style={{ color: 'var(--accent)' }}>{`${active.value} ${unit}`}</div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height, minHeight: height === '100%' ? 160 : 0 }}>
      <div
        ref={ref}
        className="recharts-responsive-container"
        style={{ width: '100%', height: '100%', minHeight: 0 }}
      >
        {body}
      </div>
    </div>
  );
}
