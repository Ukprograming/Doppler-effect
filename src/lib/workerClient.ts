import type {
  AnalysisResult,
  AnalysisSettings,
  WorkerAnalyzeRequest,
  WorkerAnalyzeResponse,
} from "../types";

export function analyzeInWorker(
  samples: Float32Array,
  sampleRate: number,
  settings: AnalysisSettings,
  searchCenter: number,
): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/frequency.worker.ts", import.meta.url),
      { type: "module" },
    );
    const id = crypto.randomUUID();
    const samplesCopy = new Float32Array(samples);
    const request: WorkerAnalyzeRequest = {
      id,
      samples: samplesCopy,
      sampleRate,
      settings,
      searchCenter,
    };

    worker.onmessage = (event: MessageEvent<WorkerAnalyzeResponse>) => {
      if (event.data.id !== id) {
        return;
      }
      worker.terminate();
      if (event.data.error || !event.data.result) {
        reject(
          new Error(
            event.data.error ??
              "解析結果を受け取れませんでした。もう一度測定してください。",
          ),
        );
        return;
      }
      resolve(event.data.result);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(
        new Error(
          "音声解析用の処理を開始できませんでした。ページを再読み込みしてください。",
        ),
      );
    };
    worker.postMessage(request, [samplesCopy.buffer]);
  });
}
