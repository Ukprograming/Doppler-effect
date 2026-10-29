import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FrequencyChart } from "../components/FrequencyChart";
import type { AnalysisPoint } from "../types";

const points: AnalysisPoint[] = [
  {
    time: 0,
    frequency: 4000,
    rawFrequency: 4000,
    qualityScore: 0.9,
    qualityLabel: "良好",
    valid: true,
    windowStart: 0,
    windowEnd: 0.2,
    rms: 0.2,
    clipped: false,
  },
  {
    time: 1,
    frequency: 4020,
    rawFrequency: 4020,
    qualityScore: 0.8,
    qualityLabel: "良好",
    valid: true,
    windowStart: 0.8,
    windowEnd: 1,
    rms: 0.2,
    clipped: false,
  },
];

afterEach(cleanup);

function renderChart(mode: "frequency" | "delta") {
  return render(
    <FrequencyChart
      points={points}
      baselineFrequency={4000}
      mode={mode}
      rangeStart={0}
      rangeEnd={1}
      timeZero={0}
      selectedIndex={null}
      onSelect={() => undefined}
    />,
  );
}

describe("振動数グラフ", () => {
  it("SVGにポインターを捕捉しても、タップした点を選択し、ドラッグやキャンセルでは選択しない", () => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    try {
      const onSelect = vi.fn();
      const { container } = render(
        <FrequencyChart
          points={points}
          baselineFrequency={4000}
          mode="frequency"
          rangeStart={0}
          rangeEnd={1}
          timeZero={0}
          selectedIndex={1}
          onSelect={onSelect}
        />,
      );
      const chart = container.querySelector("svg")!;
      const point = container.querySelector(".chart-point circle")!;
      fireEvent.pointerDown(point, { clientX: 100, clientY: 200 });
      fireEvent.pointerMove(chart, { clientX: 101, clientY: 201 });
      fireEvent.pointerUp(chart, { clientX: 101, clientY: 201 });
      expect(onSelect).toHaveBeenCalledWith(0);
      expect(container.querySelector(".chart-shell")).toHaveAttribute("data-zoomed", "false");

      onSelect.mockClear();
      fireEvent.pointerDown(point, { clientX: 100, clientY: 200 });
      fireEvent.pointerMove(chart, { clientX: 130, clientY: 200 });
      fireEvent.pointerUp(chart, { clientX: 130, clientY: 200 });
      expect(onSelect).not.toHaveBeenCalled();

      fireEvent.pointerDown(point, { clientX: 100, clientY: 200 });
      fireEvent.pointerCancel(chart);
      expect(onSelect).not.toHaveBeenCalled();

      const selected = screen.getByRole("button", { pressed: true });
      fireEvent.keyDown(selected, { key: "Enter" });
      expect(onSelect).toHaveBeenCalledWith(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("f-tでは基準振動数、Δf-tでは0 Hzのラインを表示する", () => {
    const { rerender } = renderChart("frequency");
    expect(screen.getByText("基準 f₀ = 4000.0 Hz")).toBeInTheDocument();

    rerender(
      <FrequencyChart
        points={points}
        baselineFrequency={4000}
        mode="delta"
        rangeStart={0}
        rangeEnd={1}
        timeZero={0}
        selectedIndex={null}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByText("0 Hz")).toBeInTheDocument();
  });

  it("拡大と表示範囲のリセットができる", () => {
    const { container } = renderChart("frequency");
    const shell = container.querySelector(".chart-shell");
    expect(shell).toHaveAttribute("data-zoomed", "false");

    fireEvent.click(screen.getByRole("button", { name: "グラフを拡大" }));
    expect(shell).toHaveAttribute("data-zoomed", "true");

    fireEvent.click(
      screen.getByRole("button", {
        name: "グラフの表示範囲をリセット",
      }),
    );
    expect(shell).toHaveAttribute("data-zoomed", "false");
  });
});
