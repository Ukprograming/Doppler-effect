interface LevelMeterProps {
  level: number;
  peakLevel: number;
  active: boolean;
}

export function LevelMeter({ level, peakLevel, active }: LevelMeterProps) {
  const percent = Math.round(Math.min(1, level) * 100);
  const state =
    !active || level < 0.025
      ? "low"
      : peakLevel >= 0.985
        ? "clipping"
        : "ready";
  const label =
    state === "low"
      ? "音量が小さめです"
      : state === "clipping"
        ? "音が大きすぎます"
        : "測定できる音量です";

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-slate-700">現在の音量</span>
        <span className="font-mono text-sm text-slate-500">{percent}%</span>
      </div>
      <div
        className="level-track"
        role="meter"
        aria-label="現在のマイク音量"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span
          className={`level-fill level-${state}`}
          style={{ transform: `scaleX(${Math.max(0.012, level)})` }}
        />
        <span className="level-target" aria-hidden="true" />
      </div>
      <p
        className={`inline-status ${
          state === "ready"
            ? "status-ok"
            : state === "clipping"
              ? "status-error"
              : "status-caution"
        }`}
      >
        <span aria-hidden="true">
          {state === "ready" ? "○" : state === "clipping" ? "×" : "△"}
        </span>
        {label}
      </p>
    </div>
  );
}
