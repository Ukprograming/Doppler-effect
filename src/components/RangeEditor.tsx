import type { AnalysisPoint } from "../types";

interface RangeEditorProps {
  points: AnalysisPoint[];
  duration: number;
  start: number;
  end: number;
  timeZero: number;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
  onTimeZeroChange: (value: number) => void;
}

function formatSeconds(value: number): string {
  return `${value.toFixed(2)} s`;
}

export function RangeEditor({
  points,
  duration,
  start,
  end,
  timeZero,
  onStartChange,
  onEndChange,
  onTimeZeroChange,
}: RangeEditorProps) {
  const width = 960;
  const height = 176;
  const padX = 20;
  const padY = 24;
  const finitePoints = points.filter((point) =>
    Number.isFinite(point.frequency),
  );
  const frequencies = finitePoints.map((point) => point.frequency);
  const minimum = Math.min(...frequencies);
  const maximum = Math.max(...frequencies);
  const span = Math.max(1, maximum - minimum);
  const x = (time: number) =>
    padX + (time / Math.max(duration, 0.001)) * (width - padX * 2);
  const y = (frequency: number) =>
    padY +
    ((maximum - frequency) / span) * (height - padY * 2);
  const polyline = finitePoints
    .map((point) => `${x(point.time)},${y(point.frequency)}`)
    .join(" ");

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <svg
          className="block h-auto w-full"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="測定区間と時刻原点の概要"
        >
          <rect
            x={x(start)}
            y={0}
            width={Math.max(0, x(end) - x(start))}
            height={height}
            fill="#e6eef8"
          />
          <polyline
            points={polyline}
            fill="none"
            stroke="#2f5d8c"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={x(start)}
            x2={x(start)}
            y1={0}
            y2={height}
            stroke="#64748b"
            strokeDasharray="5 5"
          />
          <line
            x1={x(end)}
            x2={x(end)}
            y1={0}
            y2={height}
            stroke="#64748b"
            strokeDasharray="5 5"
          />
          <line
            x1={x(timeZero)}
            x2={x(timeZero)}
            y1={0}
            y2={height}
            stroke="#6f8f1f"
            strokeWidth="3"
          />
          <rect
            x={Math.max(4, x(timeZero) - 47)}
            y={8}
            width={94}
            height={24}
            rx={12}
            fill="#f1f8dc"
            stroke="#b9ce73"
          />
          <text
            x={x(timeZero)}
            y={24}
            textAnchor="middle"
            fill="#3f5714"
            fontSize="12"
            fontWeight="700"
          >
            台車を離した瞬間
          </text>
        </svg>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <label className="field-block">
          <span>解析開始</span>
          <strong>{formatSeconds(start)}</strong>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={start}
            onChange={(event) =>
              onStartChange(Math.min(Number(event.target.value), end - 0.1))
            }
          />
          <small>測定前の不要な部分を除きます。</small>
        </label>
        <label className="field-block">
          <span>台車を離した瞬間（t = 0）</span>
          <strong>{formatSeconds(timeZero)}</strong>
          <input
            type="range"
            min={start}
            max={end}
            step={0.01}
            value={timeZero}
            onChange={(event) => onTimeZeroChange(Number(event.target.value))}
          />
          <small>CSVの時刻はここを0秒にします。</small>
        </label>
        <label className="field-block">
          <span>解析終了</span>
          <strong>{formatSeconds(end)}</strong>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={end}
            onChange={(event) =>
              onEndChange(Math.max(Number(event.target.value), start + 0.1))
            }
          />
          <small>台車通過後の不要な部分を除きます。</small>
        </label>
      </div>
    </div>
  );
}
