import type {
  AnalysisPoint,
  AnalysisResult,
  AnalysisSettings,
  BaselineResult,
  QualityLabel,
} from "../types";
import { fftReal, nextPowerOfTwo } from "./fft";

const EPSILON = 1e-18;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function median(values: number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function classifyQuality(score: number): QualityLabel {
  if (score >= 0.72) {
    return "良好";
  }
  if (score >= 0.42) {
    return "注意";
  }
  return "測定困難";
}

interface WindowEstimate {
  frequency: number;
  qualityScore: number;
  qualityLabel: QualityLabel;
  valid: boolean;
  rms: number;
  clipped: boolean;
  edgePeak: boolean;
}

export function estimateFrequencyWindow(
  source: Float32Array,
  sampleRate: number,
  searchCenter: number,
  settings: Pick<
    AnalysisSettings,
    | "searchRange"
    | "useHann"
    | "interpolatePeak"
    | "qualityThreshold"
  >,
): WindowEstimate {
  if (source.length < 32 || sampleRate <= 0) {
    return {
      frequency: Number.NaN,
      qualityScore: 0,
      qualityLabel: "測定困難",
      valid: false,
      rms: 0,
      clipped: false,
      edgePeak: false,
    };
  }

  let mean = 0;
  let squareSum = 0;
  let clippedSamples = 0;
  for (const sample of source) {
    mean += sample;
    squareSum += sample * sample;
    if (Math.abs(sample) >= 0.985) {
      clippedSamples += 1;
    }
  }
  mean /= source.length;
  const rms = Math.sqrt(squareSum / source.length);
  const clippedRatio = clippedSamples / source.length;
  const clipped = clippedRatio >= 0.0025;

  const fftSize = nextPowerOfTwo(source.length);
  const prepared = new Float64Array(fftSize);
  for (let index = 0; index < source.length; index += 1) {
    const centered = source[index] - mean;
    const windowValue = settings.useHann
      ? 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (source.length - 1))
      : 1;
    prepared[index] = centered * windowValue;
  }

  const spectrum = fftReal(prepared);
  const binHz = sampleRate / fftSize;
  const minimumBin = clamp(
    Math.ceil((searchCenter - settings.searchRange) / binHz),
    1,
    fftSize / 2 - 2,
  );
  const maximumBin = clamp(
    Math.floor((searchCenter + settings.searchRange) / binHz),
    minimumBin + 1,
    fftSize / 2 - 1,
  );
  const powers = new Float64Array(maximumBin - minimumBin + 1);

  let peakBin = minimumBin;
  let peakPower = -Infinity;
  for (let bin = minimumBin; bin <= maximumBin; bin += 1) {
    const power =
      spectrum.real[bin] * spectrum.real[bin] +
      spectrum.imaginary[bin] * spectrum.imaginary[bin];
    powers[bin - minimumBin] = power;
    if (power > peakPower) {
      peakPower = power;
      peakBin = bin;
    }
  }

  const backgroundPowers: number[] = [];
  let secondPeak = EPSILON;
  for (let offset = 0; offset < powers.length; offset += 1) {
    const absoluteBin = minimumBin + offset;
    if (Math.abs(absoluteBin - peakBin) > 3) {
      backgroundPowers.push(powers[offset]);
    }
    if (Math.abs(absoluteBin - peakBin) > 2) {
      secondPeak = Math.max(secondPeak, powers[offset]);
    }
  }

  const noiseFloor = Math.max(EPSILON, median(backgroundPowers));
  const prominenceDb = 10 * Math.log10((peakPower + EPSILON) / noiseFloor);
  const clarity = clamp((peakPower - secondPeak) / (peakPower + EPSILON), 0, 1);
  const levelScore = clamp((rms - 0.001) / 0.025, 0, 1);
  const prominenceScore = clamp((prominenceDb - 6) / 54, 0, 1);
  const clarityScore = clamp(clarity * 2, 0, 1);
  const clippingPenalty = clipped
    ? clamp(1 - clippedRatio * 30, 0.08, 0.45)
    : 1;
  const qualityScore = clamp(
    (levelScore * 0.25 + prominenceScore * 0.55 + clarityScore * 0.2) *
      clippingPenalty,
    0,
    1,
  );

  const edgePeak = peakBin <= minimumBin || peakBin >= maximumBin;
  let peakOffset = 0;
  if (
    settings.interpolatePeak &&
    peakBin > minimumBin &&
    peakBin < maximumBin
  ) {
    const left =
      Math.log(
        spectrum.real[peakBin - 1] ** 2 +
          spectrum.imaginary[peakBin - 1] ** 2 +
          EPSILON,
      );
    const center = Math.log(peakPower + EPSILON);
    const right =
      Math.log(
        spectrum.real[peakBin + 1] ** 2 +
          spectrum.imaginary[peakBin + 1] ** 2 +
          EPSILON,
      );
    const denominator = left - 2 * center + right;
    if (Math.abs(denominator) > EPSILON) {
      peakOffset = clamp(0.5 * (left - right) / denominator, -0.5, 0.5);
    }
  }

  const frequency = (peakBin + peakOffset) * binHz;
  const valid =
    rms >= 0.0015 &&
    qualityScore >= settings.qualityThreshold &&
    !edgePeak &&
    clippedRatio < 0.03;

  return {
    frequency,
    qualityScore,
    qualityLabel: classifyQuality(qualityScore),
    valid,
    rms,
    clipped,
    edgePeak,
  };
}

function applyMedianSmoothing(
  points: AnalysisPoint[],
  smoothingSize: 1 | 3 | 5,
): AnalysisPoint[] {
  if (smoothingSize === 1) {
    return points;
  }

  const radius = Math.floor(smoothingSize / 2);
  return points.map((point, index) => {
    if (!Number.isFinite(point.rawFrequency)) {
      return point;
    }
    const nearby = points
      .slice(Math.max(0, index - radius), index + radius + 1)
      .filter((candidate) => candidate.valid)
      .map((candidate) => candidate.rawFrequency);
    return {
      ...point,
      frequency: nearby.length > 0 ? median(nearby) : point.rawFrequency,
    };
  });
}

export function analyzeSignal(
  samples: Float32Array,
  sampleRate: number,
  settings: AnalysisSettings,
  searchCenter = settings.expectedFrequency,
): AnalysisResult {
  if (sampleRate <= 0 || !Number.isFinite(sampleRate)) {
    throw new Error("サンプリング周波数が正しくありません。");
  }
  if (samples.length === 0) {
    throw new Error("解析できる音声データがありません。");
  }

  const windowSampleCount = Math.max(
    64,
    Math.round(settings.windowDuration * sampleRate),
  );
  const hopSampleCount = Math.max(
    1,
    Math.round(settings.hopDuration * sampleRate),
  );
  const fftSize = nextPowerOfTwo(windowSampleCount);
  const points: AnalysisPoint[] = [];

  for (
    let start = 0;
    start + windowSampleCount <= samples.length;
    start += hopSampleCount
  ) {
    const end = start + windowSampleCount;
    const estimate = estimateFrequencyWindow(
      samples.subarray(start, end),
      sampleRate,
      searchCenter,
      settings,
    );
    const windowStart = start / sampleRate;
    const windowEnd = end / sampleRate;
    points.push({
      time: (windowStart + windowEnd) / 2,
      frequency: estimate.frequency,
      rawFrequency: estimate.frequency,
      qualityScore: estimate.qualityScore,
      qualityLabel: estimate.qualityLabel,
      valid: estimate.valid,
      windowStart,
      windowEnd,
      rms: estimate.rms,
      clipped: estimate.clipped,
    });
  }

  const warnings: string[] = [];
  if (points.length === 0) {
    warnings.push(
      "音声が解析時間幅より短いため、振動数の測定点を作れませんでした。",
    );
  }
  const clippedCount = points.filter((point) => point.clipped).length;
  if (clippedCount > 0) {
    warnings.push(
      `${clippedCount}点で音が大きすぎる状態を検出しました。音源またはマイク入力を小さくしてください。`,
    );
  }
  const validCount = points.filter((point) => point.valid).length;
  if (points.length > 0 && validCount / points.length < 0.5) {
    warnings.push(
      "有効な測定点が少なめです。音源をマイクへ向け、周囲の雑音を減らして再測定してください。",
    );
  }

  return {
    points: applyMedianSmoothing(points, settings.smoothingSize),
    sampleRate,
    sampleCount: samples.length,
    windowSampleCount,
    fftSize,
    fftBinHz: sampleRate / fftSize,
    nominalResolutionHz: 1 / settings.windowDuration,
    warnings,
  };
}

export function summarizeBaseline(result: AnalysisResult): BaselineResult | null {
  const validPoints = result.points.filter(
    (point) => point.valid && Number.isFinite(point.rawFrequency),
  );
  if (validPoints.length < 3) {
    return null;
  }
  const frequency = median(validPoints.map((point) => point.rawFrequency));
  const qualityScore = median(validPoints.map((point) => point.qualityScore));
  return {
    frequency,
    qualityScore,
    qualityLabel: classifyQuality(qualityScore),
    validPointCount: validPoints.length,
    totalPointCount: result.points.length,
  };
}
