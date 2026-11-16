import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface WeightPoint {
  date: string;
  value: number;
}

/** Weight over time. The data is also listed in the measurements table below the chart. */
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
  return (
    <div style={{ width: '100%', height, minHeight: height === '100%' ? 160 : 0 }}>
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="date" stroke="var(--muted)" />
          <YAxis stroke="var(--muted)" unit={` ${unit}`} width={64} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 10,
            }}
            labelStyle={{ color: 'var(--ink)' }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--accent)"
            strokeWidth={2}
            dot
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
