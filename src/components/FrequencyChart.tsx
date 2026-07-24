import {
  forwardRef,
  useMemo,
  type KeyboardEvent,
} from "react";
import type { AnalysisPoint } from "../types";

export type GraphMode = "frequency" | "delta";

interface FrequencyChartProps {
  points: AnalysisPoint[];
  baselineFrequency: number;
  mode: GraphMode;
  rangeStart: number;
  rangeEnd: number;
  timeZero: number;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

const WIDTH = 1120;
const HEIGHT = 560;
const MARGIN = { top: 48, right: 44, bottom: 78, left: 96 };

function makeTriangle(x: number, y: number, size: number): string {
  return `${x},${y - size} ${x - size},${y + size} ${x + size},${y + size}`;
}

export const FrequencyChart = forwardRef<
  SVGSVGElement,
  FrequencyChartProps
>(function FrequencyChart(
  {
    points,
    baselineFrequency,
    mode,
    rangeStart,
    rangeEnd,
    timeZero,
    selectedIndex,
    onSelect,
  },
  ref,
) {
  const visible = useMemo(
    () =>
      points
        .map((point, index) => ({ point, index }))
        .filter(
          ({ point }) =>
            point.time >= rangeStart &&
            point.time <= rangeEnd &&
            Number.isFinite(point.frequency),
        ),
    [points, rangeEnd, rangeStart],
  );
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xMinimum = rangeStart - timeZero;
  const xMaximum = rangeEnd - timeZero;
  const deltas = visible.map(
    ({ point }) => point.frequency - baselineFrequency,
  );
  const deltaMinimum = Math.min(0, ...deltas);
  const deltaMaximum = Math.max(0, ...deltas);
  const deltaSpan = Math.max(2, deltaMaximum - deltaMinimum);
  const padding = Math.max(1.5, deltaSpan * 0.16);
  const valueMinimum =
    mode === "frequency"
      ? baselineFrequency + deltaMinimum - padding
      : deltaMinimum - padding;
  const valueMaximum =
    mode === "frequency"
      ? baselineFrequency + deltaMaximum + padding
      : deltaMaximum + padding;
  const xScale = (time: number) =>
    MARGIN.left +
    ((time - timeZero - xMinimum) / Math.max(0.001, xMaximum - xMinimum)) *
      plotWidth;
  const yScale = (frequency: number) => {
    const value =
      mode === "frequency" ? frequency : frequency - baselineFrequency;
    return (
      MARGIN.top +
      ((valueMaximum - value) /
        Math.max(0.001, valueMaximum - valueMinimum)) *
        plotHeight
    );
  };
  const baselineY = yScale(baselineFrequency);
  const validPath = visible
    .filter(({ point }) => point.valid)
    .map(
      ({ point }, index) =>
        `${index === 0 ? "M" : "L"} ${xScale(point.time)} ${yScale(
          point.frequency,
        )}`,
    )
    .join(" ");
  const xTicks = Array.from({ length: 6 }, (_, index) => {
    const value = xMinimum + ((xMaximum - xMinimum) * index) / 5;
    return {
      value,
      x: MARGIN.left + (plotWidth * index) / 5,
    };
  });
  const yTicks = Array.from({ length: 6 }, (_, index) => {
    const value =
      valueMaximum - ((valueMaximum - valueMinimum) * index) / 5;
    return {
      value,
      y: MARGIN.top + (plotHeight * index) / 5,
    };
  });
  const handleKey = (
    event: KeyboardEvent<SVGGElement>,
    index: number,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(index);
    }
  };

  return (
    <div className="chart-shell">
      <svg
        ref={ref}
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-auto min-w-[720px] w-full"
        role="img"
        aria-labelledby="chart-title chart-description"
      >
        <title id="chart-title">
          {mode === "frequency"
            ? "PCが観測した振動数"
            : "基準の振動数からのずれ"}
        </title>
        <desc id="chart-description">
          横軸は時間、縦軸は
          {mode === "frequency" ? "観測振動数" : "振動数のずれ"}です。
          丸印は有効な測定点、三角印は信頼性の低い測定点です。
        </desc>
        <rect width={WIDTH} height={HEIGHT} fill="#ffffff" rx="24" />
        <text
          x={MARGIN.left}
          y={27}
          fill="#172033"
          fontSize="20"
          fontWeight="750"
        >
          {mode === "frequency"
            ? "PCが観測した振動数"
            : "基準の振動数からの「ずれ」"}
        </text>
        {yTicks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={tick.y}
              y2={tick.y}
              stroke="#e5eaf1"
            />
            <text
              x={MARGIN.left - 14}
              y={tick.y + 4}
              textAnchor="end"
              fill="#657187"
              fontSize="12"
              fontFamily="ui-monospace, monospace"
            >
              {tick.value.toFixed(1)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <g key={tick.x}>
            <line
              x1={tick.x}
              x2={tick.x}
              y1={MARGIN.top}
              y2={HEIGHT - MARGIN.bottom}
              stroke="#eef1f5"
            />
            <text
              x={tick.x}
              y={HEIGHT - MARGIN.bottom + 28}
              textAnchor="middle"
              fill="#657187"
              fontSize="12"
              fontFamily="ui-monospace, monospace"
            >
              {tick.value.toFixed(2)}
            </text>
          </g>
        ))}
        <line
          className="chart-baseline"
          x1={MARGIN.left}
          x2={WIDTH - MARGIN.right}
          y1={baselineY}
          y2={baselineY}
          stroke="#6f8f1f"
          strokeWidth="2"
          strokeDasharray="8 6"
        />
        <rect
          x={WIDTH - MARGIN.right - 138}
          y={baselineY - 29}
          width={138}
          height={23}
          rx={11.5}
          fill="#f1f8dc"
        />
        <text
          x={WIDTH - MARGIN.right - 10}
          y={baselineY - 13}
          textAnchor="end"
          fill="#465d18"
          fontSize="11"
          fontWeight="700"
        >
          {mode === "frequency"
            ? `基準 f₀ = ${baselineFrequency.toFixed(1)} Hz`
            : "基準線 = 0.0 Hz"}
        </text>
        {validPath ? (
          <path
            d={validPath}
            fill="none"
            stroke="#85a9cf"
            strokeWidth="2"
            opacity="0.65"
          />
        ) : null}
        {visible.map(({ point, index }) => {
          const cx = xScale(point.time);
          const cy = yScale(point.frequency);
          const selected = selectedIndex === index;
          return (
            <g
              key={`${point.time}-${index}`}
              className="chart-point"
              role="button"
              tabIndex={0}
              aria-label={`${(point.time - timeZero).toFixed(2)}秒、${
                mode === "frequency"
                  ? `${point.frequency.toFixed(1)}ヘルツ`
                  : `${(point.frequency - baselineFrequency).toFixed(1)}ヘルツのずれ`
              }、測定品質${point.qualityLabel}`}
              onClick={() => onSelect(index)}
              onKeyDown={(event) => handleKey(event, index)}
            >
              <circle
                cx={cx}
                cy={cy}
                r={selected ? 11 : 8}
                fill="transparent"
              />
              {point.valid ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={selected ? 5.5 : 3.8}
                  fill={selected ? "#173f68" : "#2f679a"}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              ) : (
                <polygon
                  points={makeTriangle(cx, cy, selected ? 7 : 5)}
                  fill={selected ? "#7a5410" : "#b27a18"}
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  opacity="0.68"
                />
              )}
            </g>
          );
        })}
        <text
          x={MARGIN.left + plotWidth / 2}
          y={HEIGHT - 22}
          textAnchor="middle"
          fill="#3d485b"
          fontSize="14"
          fontWeight="650"
        >
          時間 t [s]
        </text>
        <text
          transform={`translate(24 ${MARGIN.top + plotHeight / 2}) rotate(-90)`}
          textAnchor="middle"
          fill="#3d485b"
          fontSize="14"
          fontWeight="650"
        >
          {mode === "frequency"
            ? "観測振動数 f [Hz]"
            : "振動数のずれ Δf [Hz]"}
        </text>
      </svg>
    </div>
  );
});
