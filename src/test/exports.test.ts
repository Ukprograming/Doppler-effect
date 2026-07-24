import { describe, expect, it } from "vitest";
import { buildCsv } from "../lib/exports";
import type { AnalysisPoint } from "../types";

const point: AnalysisPoint = {
  time: 1.2,
  frequency: 4012.4,
  rawFrequency: 4012.8,
  qualityScore: 0.81,
  qualityLabel: "良好",
  valid: true,
  windowStart: 1.1,
  windowEnd: 1.3,
  rms: 0.2,
  clipped: false,
};

describe("CSV出力", () => {
  it("必須列とt=0基準の時刻を出力し、速度列を作らない", () => {
    const csv = buildCsv([point], 4000, 1, 1.5, 0.7);
    const [header, row] = csv.replace("\uFEFF", "").split("\r\n");

    expect(header).toBe(
      "time_s,frequency_hz,delta_f_hz,frequency_raw_hz,quality,valid,window_start_s,window_end_s,baseline_frequency_hz",
    );
    expect(row.split(",")[0]).toBe("0.500000");
    expect(row.split(",")[2]).toBe("12.400000");
    expect(header).not.toContain("velocity");
  });
});
