import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
