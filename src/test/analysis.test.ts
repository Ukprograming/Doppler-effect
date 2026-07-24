import { describe, expect, it } from "vitest";
import {
  analyzeSignal,
  estimateFrequencyWindow,
  median,
  summarizeBaseline,
} from "../lib/analysis";
import { DEFAULT_SETTINGS } from "../types";

const sampleRate = 48000;

function createTone(
  frequency: number,
  duration: number,
  amplitude = 0.42,
  noiseAmplitude = 0,
): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * duration));
  let seed = 27183;
  for (let index = 0; index < samples.length; index += 1) {
    seed = (seed * 16807) % 2147483647;
    const noise = (seed / 2147483647) * 2 - 1;
    samples[index] =
      amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate) +
      noiseAmplitude * noise;
  }
  return samples;
}

function createChirp(
  startFrequency: number,
  endFrequency: number,
  duration: number,
): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * duration));
  const rate = (endFrequency - startFrequency) / duration;
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const phase =
      2 * Math.PI * (startFrequency * time + 0.5 * rate * time * time);
    samples[index] = 0.38 * Math.sin(phase);
  }
  return samples;
}

describe("周波数推定", () => {
  it("48 kHzで記録した4000 Hzの定常純音を推定する", () => {
    const result = analyzeSignal(
      createTone(4000, 1.8),
      sampleRate,
      DEFAULT_SETTINGS,
      4000,
    );
    const summary = summarizeBaseline(result);

    expect(summary).not.toBeNull();
    expect(summary!.validPointCount).toBeGreaterThan(20);
    expect(Math.abs(summary!.frequency - 4000)).toBeLessThan(0.5);
    expect(summary!.qualityLabel).toBe("良好");
  });

  it("FFTビンの間にある4002.3 Hzをピーク補間で推定する", () => {
    const window = createTone(4002.3, 0.2);
    const estimate = estimateFrequencyWindow(
      window,
      sampleRate,
      4000,
      DEFAULT_SETTINGS,
    );
    const fftBinHz = sampleRate / 16384;
    const nearestBinFrequency =
      Math.round(4002.3 / fftBinHz) * fftBinHz;

    expect(estimate.valid).toBe(true);
    expect(Math.abs(estimate.frequency - 4002.3)).toBeLessThan(0.8);
    expect(Math.abs(estimate.frequency - 4002.3)).toBeLessThan(
      Math.abs(nearestBinFrequency - 4002.3),
    );
  });

  it("4000 Hzから4020 Hzへ変化するチャープの増加傾向を再現する", () => {
    const result = analyzeSignal(
      createChirp(4000, 4020, 3),
      sampleRate,
      DEFAULT_SETTINGS,
      4010,
    );
    const valid = result.points.filter((point) => point.valid);
    const early = median(valid.slice(0, 8).map((point) => point.frequency));
    const late = median(valid.slice(-8).map((point) => point.frequency));

    expect(valid.length).toBeGreaterThan(40);
    expect(late - early).toBeGreaterThan(14);
    expect(early).toBeGreaterThan(3999);
    expect(late).toBeLessThan(4021);
  });

  it("ホワイトノイズが増えると測定品質が下がる", () => {
    const clean = estimateFrequencyWindow(
      createTone(4000, 0.2, 0.35, 0),
      sampleRate,
      4000,
      DEFAULT_SETTINGS,
    );
    const noisy = estimateFrequencyWindow(
      createTone(4000, 0.2, 0.35, 0.28),
      sampleRate,
      4000,
      DEFAULT_SETTINGS,
    );

    expect(clean.qualityScore).toBeGreaterThan(noisy.qualityScore);
    expect(clean.qualityScore - noisy.qualityScore).toBeGreaterThan(0.08);
  });

  it("無音を有効な振動数として扱わず、クリッピングを検出する", () => {
    const silence = estimateFrequencyWindow(
      new Float32Array(Math.round(sampleRate * 0.2)),
      sampleRate,
      4000,
      DEFAULT_SETTINGS,
    );
    const clippedSamples = createTone(4000, 0.2, 1.4);
    const clipped = estimateFrequencyWindow(
      clippedSamples,
      sampleRate,
      4000,
      DEFAULT_SETTINGS,
    );

    expect(silence.valid).toBe(false);
    expect(silence.qualityLabel).toBe("測定困難");
    expect(clipped.clipped).toBe(true);
    expect(clipped.valid).toBe(false);
  });
});
