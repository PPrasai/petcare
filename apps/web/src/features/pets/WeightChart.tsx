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
export default function WeightChart({ points, unit }: { points: WeightPoint[]; unit: string }) {
  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
          <XAxis dataKey="date" stroke="var(--color-muted)" />
          <YAxis
            stroke="var(--color-muted)"
            unit={` ${unit}`}
            width={64}
            domain={['auto', 'auto']}
          />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-brand)"
            strokeWidth={2}
            dot
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
