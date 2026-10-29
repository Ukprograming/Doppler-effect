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
      ? "音量不足"
      : state === "clipping"
        ? "音量過大"
        : "音量適正";

  return (
    <div className="level-meter" aria-live="polite">
      <div
        className="level-track"
        role="meter"
        aria-label="現在のマイク音量"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={active ? label : "マイク未設定"}
      >
        <span
          className={`level-fill level-${state}`}
          style={{ transform: `scaleX(${Math.max(0.012, level)})` }}
        />
        <span className="level-target" aria-hidden="true" />
      </div>
      {active && state !== "ready" ? <p
        className={`inline-status ${
          state === "clipping" ? "status-error" : "status-caution"
        }`}
      >
        <span aria-hidden="true">
          {state === "clipping" ? "×" : "△"}
        </span>
        {label}
      </p> : null}
    </div>
  );
}
