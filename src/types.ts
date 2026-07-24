export type QualityLabel = "良好" | "注意" | "測定困難";

export type SmoothingSize = 1 | 3 | 5;

export interface AnalysisSettings {
  expectedFrequency: number;
  baselineDuration: number;
  maxDuration: number;
  windowDuration: number;
  hopDuration: number;
  searchRange: number;
  useHann: boolean;
  interpolatePeak: boolean;
  smoothingSize: SmoothingSize;
  qualityThreshold: number;
}

export interface AnalysisPoint {
  time: number;
  frequency: number;
  rawFrequency: number;
  qualityScore: number;
  qualityLabel: QualityLabel;
  valid: boolean;
  windowStart: number;
  windowEnd: number;
  rms: number;
  clipped: boolean;
}

export interface AnalysisResult {
  points: AnalysisPoint[];
  sampleRate: number;
  sampleCount: number;
  windowSampleCount: number;
  fftSize: number;
  fftBinHz: number;
  nominalResolutionHz: number;
  warnings: string[];
}

export interface BaselineResult {
  frequency: number;
  qualityScore: number;
  qualityLabel: QualityLabel;
  validPointCount: number;
  totalPointCount: number;
}

export interface RecordedAudio {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
  source: "microphone" | "wav" | "demo";
}

export interface AppliedAudioSettings {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  sampleRate?: number;
  channelCount?: number;
  deviceId?: string;
}

export interface WorkerAnalyzeRequest {
  id: string;
  samples: Float32Array;
  sampleRate: number;
  settings: AnalysisSettings;
  searchCenter: number;
}

export interface WorkerAnalyzeResponse {
  id: string;
  result?: AnalysisResult;
  error?: string;
}

export const DEFAULT_SETTINGS: AnalysisSettings = {
  expectedFrequency: 4000,
  baselineDuration: 1.8,
  maxDuration: 10,
  windowDuration: 0.2,
  hopDuration: 0.05,
  searchRange: 100,
  useHann: true,
  interpolatePeak: true,
  smoothingSize: 3,
  qualityThreshold: 0.42,
};
