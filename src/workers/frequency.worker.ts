/// <reference lib="webworker" />

import { analyzeSignal } from "../lib/analysis";
import type { WorkerAnalyzeRequest, WorkerAnalyzeResponse } from "../types";

self.onmessage = (event: MessageEvent<WorkerAnalyzeRequest>) => {
  const { id, samples, sampleRate, settings, searchCenter } = event.data;
  try {
    const result = analyzeSignal(samples, sampleRate, settings, searchCenter);
    const response: WorkerAnalyzeResponse = { id, result };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerAnalyzeResponse = {
      id,
      error:
        error instanceof Error
          ? error.message
          : "周波数解析中に不明なエラーが発生しました。",
    };
    self.postMessage(response);
  }
};

export {};
