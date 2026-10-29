import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
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

interface ViewDomain {
  xMinimum: number;
  xMaximum: number;
  yMinimum: number;
  yMaximum: number;
}

interface PointerPosition {
  x: number;
  y: number;
}

interface DragStart {
  pointer: PointerPosition;
  domain: ViewDomain;
}

interface PinchStart {
  distance: number;
  midpoint: PointerPosition;
  domain: ViewDomain;
}

const WIDTH = 900;
const HEIGHT = 500;
const MARGIN = { top: 44, right: 34, bottom: 66, left: 78 };
const MAX_ZOOM = 24;

function makeTriangle(x: number, y: number, size: number): string {
  return `${x},${y - size} ${x - size},${y + size} ${x + size},${y + size}`;
}

function pointerDistance(
  first: PointerPosition,
  second: PointerPosition,
): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pointerMidpoint(
  first: PointerPosition,
  second: PointerPosition,
): PointerPosition {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function domainsAreEqual(first: ViewDomain, second: ViewDomain): boolean {
  return (
    Math.abs(first.xMinimum - second.xMinimum) < 1e-7 &&
    Math.abs(first.xMaximum - second.xMaximum) < 1e-7 &&
    Math.abs(first.yMinimum - second.yMinimum) < 1e-7 &&
    Math.abs(first.yMaximum - second.yMaximum) < 1e-7
  );
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
  forwardedRef,
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointerPositionsRef = useRef(new Map<number, PointerPosition>());
  const dragStartRef = useRef<DragStart | null>(null);
  const pinchStartRef = useRef<PinchStart | null>(null);
  const movedRef = useRef(false);
  const pressedPointRef = useRef<number | null>(null);
  const [view, setView] = useState<ViewDomain | null>(null);

  const setSvgRef = useCallback(
    (node: SVGSVGElement | null) => {
      svgRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );

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

  const referenceValue = mode === "frequency" ? baselineFrequency : 0;
  const baseDomain = useMemo<ViewDomain>(() => {
    const xMinimum = rangeStart - timeZero;
    const xMaximum = Math.max(xMinimum + 0.001, rangeEnd - timeZero);
    const values = visible.map(({ point }) =>
      mode === "frequency"
        ? point.frequency
        : point.frequency - baselineFrequency,
    );
    const minimum = Math.min(referenceValue, ...values);
    const maximum = Math.max(referenceValue, ...values);
    const span = Math.max(2, maximum - minimum);
    const padding = Math.max(1.5, span * 0.16);
    return {
      xMinimum,
      xMaximum,
      yMinimum: minimum - padding,
      yMaximum: maximum + padding,
    };
  }, [
    baselineFrequency,
    mode,
    rangeEnd,
    rangeStart,
    referenceValue,
    timeZero,
    visible,
  ]);

  useEffect(() => {
    setView(null);
  }, [mode, rangeEnd, rangeStart, timeZero]);

  const constrainDomain = useCallback(
    (candidate: ViewDomain): ViewDomain | null => {
      const baseXSpan = baseDomain.xMaximum - baseDomain.xMinimum;
      const baseYSpan = baseDomain.yMaximum - baseDomain.yMinimum;
      const minimumXSpan = baseXSpan / MAX_ZOOM;
      const minimumYSpan = baseYSpan / MAX_ZOOM;
      const xSpan = Math.min(
        baseXSpan,
        Math.max(minimumXSpan, candidate.xMaximum - candidate.xMinimum),
      );
      const ySpan = Math.min(
        baseYSpan,
        Math.max(minimumYSpan, candidate.yMaximum - candidate.yMinimum),
      );

      let xMinimum = candidate.xMinimum;
      let yMinimum = candidate.yMinimum;
      if (xMinimum < baseDomain.xMinimum) {
        xMinimum = baseDomain.xMinimum;
      }
      if (xMinimum + xSpan > baseDomain.xMaximum) {
        xMinimum = baseDomain.xMaximum - xSpan;
      }

      if (yMinimum < baseDomain.yMinimum) {
        yMinimum = baseDomain.yMinimum;
      }
      if (yMinimum + ySpan > baseDomain.yMaximum) {
        yMinimum = baseDomain.yMaximum - ySpan;
      }

      // Keep the requested f₀ / 0 Hz reference line visible while panning.
      if (referenceValue < yMinimum) {
        yMinimum = referenceValue;
      } else if (referenceValue > yMinimum + ySpan) {
        yMinimum = referenceValue - ySpan;
      }
      yMinimum = Math.min(
        baseDomain.yMaximum - ySpan,
        Math.max(baseDomain.yMinimum, yMinimum),
      );

      const next = {
        xMinimum,
        xMaximum: xMinimum + xSpan,
        yMinimum,
        yMaximum: yMinimum + ySpan,
      };
      return domainsAreEqual(next, baseDomain) ? null : next;
    },
    [baseDomain, referenceValue],
  );

  const currentDomain = view ?? baseDomain;
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xSpan = currentDomain.xMaximum - currentDomain.xMinimum;
  const ySpan = currentDomain.yMaximum - currentDomain.yMinimum;

  const xScale = (time: number) =>
    MARGIN.left +
    ((time - timeZero - currentDomain.xMinimum) / Math.max(0.001, xSpan)) *
      plotWidth;
  const valueScale = (value: number) =>
    MARGIN.top +
    ((currentDomain.yMaximum - value) / Math.max(0.001, ySpan)) * plotHeight;
  const yScale = (frequency: number) =>
    valueScale(
      mode === "frequency" ? frequency : frequency - baselineFrequency,
    );
  const referenceY = valueScale(referenceValue);

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
    const value =
      currentDomain.xMinimum +
      ((currentDomain.xMaximum - currentDomain.xMinimum) * index) / 5;
    return {
      value,
      x: MARGIN.left + (plotWidth * index) / 5,
    };
  });
  const yTicks = Array.from({ length: 6 }, (_, index) => {
    const value =
      currentDomain.yMaximum -
      ((currentDomain.yMaximum - currentDomain.yMinimum) * index) / 5;
    return {
      value,
      y: MARGIN.top + (plotHeight * index) / 5,
    };
  });

  const zoomDomain = useCallback(
    (
      source: ViewDomain,
      factor: number,
      centerXFraction = 0.5,
      centerYFraction = 0.5,
    ) => {
      const sourceXSpan = source.xMaximum - source.xMinimum;
      const sourceYSpan = source.yMaximum - source.yMinimum;
      const centerX =
        source.xMinimum + sourceXSpan * Math.min(1, Math.max(0, centerXFraction));
      const centerY =
        source.yMinimum + sourceYSpan * Math.min(1, Math.max(0, centerYFraction));
      const nextXSpan = sourceXSpan * factor;
      const nextYSpan = sourceYSpan * factor;
      return constrainDomain({
        xMinimum: centerX - nextXSpan * centerXFraction,
        xMaximum: centerX + nextXSpan * (1 - centerXFraction),
        yMinimum: centerY - nextYSpan * centerYFraction,
        yMaximum: centerY + nextYSpan * (1 - centerYFraction),
      });
    },
    [constrainDomain],
  );

  const zoom = useCallback(
    (factor: number, centerXFraction = 0.5, centerYFraction = 0.5) => {
      setView((current) =>
        zoomDomain(
          current ?? baseDomain,
          factor,
          centerXFraction,
          centerYFraction,
        ),
      );
    },
    [baseDomain, zoomDomain],
  );

  const clientToPlotFractions = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) {
        return { x: 0.5, y: 0.5 };
      }
      const bounds = svg.getBoundingClientRect();
      const svgX = ((clientX - bounds.left) / Math.max(1, bounds.width)) * WIDTH;
      const svgY =
        ((clientY - bounds.top) / Math.max(1, bounds.height)) * HEIGHT;
      return {
        x: Math.min(
          1,
          Math.max(0, (svgX - MARGIN.left) / Math.max(1, plotWidth)),
        ),
        y: Math.min(
          1,
          Math.max(
            0,
            1 - (svgY - MARGIN.top) / Math.max(1, plotHeight),
          ),
        ),
      };
    },
    [plotHeight, plotWidth],
  );

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const center = clientToPlotFractions(event.clientX, event.clientY);
    zoom(event.deltaY < 0 ? 0.82 : 1.22, center.x, center.y);
  };

  const startPointerInteraction = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and older WebKit builds may not expose capture.
    }
    pointerPositionsRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const positions = [...pointerPositionsRef.current.values()];
    if (positions.length === 1) {
      movedRef.current = false;
      const point = (event.target as Element).closest("[data-point-index]");
      pressedPointRef.current = point
        ? Number(point.getAttribute("data-point-index"))
        : null;
      const matrix = event.currentTarget.getScreenCTM?.();
      if (matrix) {
        const position = event.currentTarget.createSVGPoint();
        position.x = event.clientX;
        position.y = event.clientY;
        const local = position.matrixTransform(matrix.inverse());
        pressedPointRef.current = null;
        if (
          local.x >= MARGIN.left && local.x <= WIDTH - MARGIN.right &&
          local.y >= MARGIN.top && local.y <= HEIGHT - MARGIN.bottom
        ) {
          let nearestDistance = Number.POSITIVE_INFINITY;
          for (const { point: candidate, index } of visible) {
            const x = xScale(candidate.time);
            const y = yScale(candidate.frequency);
            if (x < MARGIN.left || x > WIDTH - MARGIN.right ||
                y < MARGIN.top || y > HEIGHT - MARGIN.bottom) continue;
            const distance = Math.hypot(x - local.x, y - local.y);
            if (distance < nearestDistance) {
              nearestDistance = distance;
              pressedPointRef.current = index;
            }
          }
        }
      }
      dragStartRef.current = {
        pointer: positions[0],
        domain: view ?? baseDomain,
      };
      pinchStartRef.current = null;
    } else if (positions.length === 2) {
      movedRef.current = true;
      pressedPointRef.current = null;
      dragStartRef.current = null;
      pinchStartRef.current = {
        distance: Math.max(1, pointerDistance(positions[0], positions[1])),
        midpoint: pointerMidpoint(positions[0], positions[1]),
        domain: view ?? baseDomain,
      };
    }
  };

  const movePointerInteraction = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    if (!pointerPositionsRef.current.has(event.pointerId)) {
      return;
    }
    pointerPositionsRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const positions = [...pointerPositionsRef.current.values()];
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const bounds = svg.getBoundingClientRect();
    const plotPixelWidth = Math.max(1, (plotWidth / WIDTH) * bounds.width);
    const plotPixelHeight = Math.max(1, (plotHeight / HEIGHT) * bounds.height);

    if (positions.length === 1 && dragStartRef.current) {
      const movementX = positions[0].x - dragStartRef.current.pointer.x;
      const movementY = positions[0].y - dragStartRef.current.pointer.y;
      if (Math.hypot(movementX, movementY) > 3) {
        movedRef.current = true;
      }
      if (!movedRef.current) {
        return;
      }
      const source = dragStartRef.current.domain;
      const sourceXSpan = source.xMaximum - source.xMinimum;
      const sourceYSpan = source.yMaximum - source.yMinimum;
      const shiftX = (-movementX / plotPixelWidth) * sourceXSpan;
      const shiftY = (movementY / plotPixelHeight) * sourceYSpan;
      setView(
        constrainDomain({
          xMinimum: source.xMinimum + shiftX,
          xMaximum: source.xMaximum + shiftX,
          yMinimum: source.yMinimum + shiftY,
          yMaximum: source.yMaximum + shiftY,
        }),
      );
    } else if (positions.length === 2 && pinchStartRef.current) {
      movedRef.current = true;
      const currentDistance = Math.max(
        1,
        pointerDistance(positions[0], positions[1]),
      );
      const currentMidpoint = pointerMidpoint(positions[0], positions[1]);
      const factor = pinchStartRef.current.distance / currentDistance;
      const center = clientToPlotFractions(
        pinchStartRef.current.midpoint.x,
        pinchStartRef.current.midpoint.y,
      );
      const scaled =
        zoomDomain(
          pinchStartRef.current.domain,
          factor,
          center.x,
          center.y,
        ) ?? baseDomain;
      const scaledXSpan = scaled.xMaximum - scaled.xMinimum;
      const scaledYSpan = scaled.yMaximum - scaled.yMinimum;
      const shiftX =
        (-(currentMidpoint.x - pinchStartRef.current.midpoint.x) /
          plotPixelWidth) *
        scaledXSpan;
      const shiftY =
        ((currentMidpoint.y - pinchStartRef.current.midpoint.y) /
          plotPixelHeight) *
        scaledYSpan;
      setView(
        constrainDomain({
          xMinimum: scaled.xMinimum + shiftX,
          xMaximum: scaled.xMaximum + shiftX,
          yMinimum: scaled.yMinimum + shiftY,
          yMaximum: scaled.yMaximum + shiftY,
        }),
      );
    }
  };

  const endPointerInteraction = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    // SVG pointer capture retargets the click to the chart. Select the point
    // pressed at the start of a tap, before releasing that capture.
    if (
      event.type === "pointerup" &&
      pointerPositionsRef.current.size === 1 &&
      !movedRef.current &&
      pressedPointRef.current !== null
    ) {
      onSelect(pressedPointRef.current);
    }
    pressedPointRef.current = null;
    pointerPositionsRef.current.delete(event.pointerId);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The pointer may already have been released by the browser.
    }
    const positions = [...pointerPositionsRef.current.values()];
    if (positions.length === 1) {
      dragStartRef.current = {
        pointer: positions[0],
        domain: view ?? baseDomain,
      };
      pinchStartRef.current = null;
    } else {
      dragStartRef.current = null;
      pinchStartRef.current = null;
    }
  };

  const handleKey = (
    event: KeyboardEvent<SVGGElement>,
    index: number,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(index);
    }
  };

  const referenceLabel =
    mode === "frequency"
      ? `基準 f₀ = ${baselineFrequency.toFixed(1)} Hz`
      : "0 Hz";
  const referenceLabelWidth = mode === "frequency" ? 150 : 62;
  const referenceLabelY = Math.min(
    HEIGHT - MARGIN.bottom - 8,
    Math.max(MARGIN.top + 25, referenceY - 8),
  );

  return (
    <div
      className="chart-shell"
      data-zoomed={view ? "true" : "false"}
      data-view-x-min={currentDomain.xMinimum.toFixed(6)}
      data-view-x-max={currentDomain.xMaximum.toFixed(6)}
    >
      <div className="chart-controls" aria-label="グラフの表示範囲">
        <button
          type="button"
          onClick={() => zoom(0.72)}
          aria-label="グラフを拡大"
          title="拡大"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => zoom(1.38)}
          aria-label="グラフを縮小"
          title="縮小"
        >
          −
        </button>
        <button
          type="button"
          disabled={!view}
          onClick={() => setView(null)}
          aria-label="グラフの表示範囲をリセット"
          title="表示範囲をリセット"
        >
          全体
        </button>
      </div>
      <svg
        ref={setSvgRef}
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="frequency-chart"
        role="img"
        aria-labelledby="chart-title chart-description"
        onWheel={handleWheel}
        onPointerDown={startPointerInteraction}
        onPointerMove={movePointerInteraction}
        onPointerUp={endPointerInteraction}
        onPointerCancel={endPointerInteraction}
        onDoubleClick={() => setView(null)}
        onClickCapture={(event) => {
          if (movedRef.current) {
            event.preventDefault();
            event.stopPropagation();
            movedRef.current = false;
          }
        }}
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
          点をクリックまたはタップすると、その振動数と時刻を表示します。
          ドラッグで移動し、ホイールまたはピンチ操作で拡大縮小できます。
        </desc>
        <defs>
          <clipPath id="frequency-chart-plot">
            <rect
              x={MARGIN.left}
              y={MARGIN.top}
              width={plotWidth}
              height={plotHeight}
            />
          </clipPath>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="#ffffff" rx="24" />
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
        <g clipPath="url(#frequency-chart-plot)">
          <line
            className="chart-baseline"
            x1={MARGIN.left}
            x2={WIDTH - MARGIN.right}
            y1={referenceY}
            y2={referenceY}
            stroke="#668523"
            strokeWidth="2.4"
            strokeDasharray="9 6"
          />
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
                data-point-index={index}
                role="button"
                aria-pressed={selected}
                tabIndex={0}
                aria-label={`${(point.time - timeZero).toFixed(2)}秒、${
                  mode === "frequency"
                    ? `${point.frequency.toFixed(1)}ヘルツ`
                    : `${(point.frequency - baselineFrequency).toFixed(1)}ヘルツのずれ`
                }、測定品質${point.qualityLabel}`}
                onClick={(event) => {
                  if (event.detail === 0) onSelect(index);
                }}
                onKeyDown={(event) => handleKey(event, index)}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={selected ? 13 : 10}
                  fill="transparent"
                />
                {selected ? (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={10}
                    fill="none"
                    stroke="#173f68"
                    strokeWidth="1.5"
                    pointerEvents="none"
                  />
                ) : null}
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
        </g>
        <rect
          x={WIDTH - MARGIN.right - referenceLabelWidth}
          y={referenceLabelY - 18}
          width={referenceLabelWidth}
          height={23}
          rx={7}
          fill="#eef5dc"
          stroke="#bdd18b"
        />
        <text
          x={WIDTH - MARGIN.right - 9}
          y={referenceLabelY - 2}
          textAnchor="end"
          fill="#435d14"
          fontSize="11"
          fontWeight="750"
        >
          {referenceLabel}
        </text>
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
      {points.length > 0 ? (
        <p className="chart-gesture-hint">点をクリック・タップして選択</p>
      ) : null}
    </div>
  );
});
